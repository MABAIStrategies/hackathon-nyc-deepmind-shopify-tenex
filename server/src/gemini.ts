// LIVE pipeline. Only used when GEMINI_API_KEY is present in the backend .env.
// Rule Zero: model ids + SDK methods are verified at startup (list + smoke test). Substitutions are
// recorded in data/provenance-live.json and appended to PROVENANCE.md, and shown on the UI badges.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { GoogleGenAI } from "@google/genai";
import { PLANNED_MODELS, ROOT, DATA_DIR, STAGE_TIMEOUT_MS, getApiKey } from "./config.js";
import { parseModelJson, validateStage1, validateStage2 } from "./json.js";
import { withTimeout, StageTimeout } from "./timeout.js";
import { ruleBasedRubric } from "./gate.js";
import type { Claim, Stage1Output, Stage2Output, Stage3Output, StageResult } from "../../shared/types.js";

const require = createRequire(import.meta.url);
export const SDK_VERSION: string = (() => {
  try {
    return require("@google/genai/package.json").version as string;
  } catch {
    try {
      return JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules/@google/genai/package.json"), "utf8")).version;
    } catch {
      return "unknown";
    }
  }
})();

let ai: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (!ai) ai = new GoogleGenAI({ apiKey: getApiKey() });
  return ai;
}

export interface LiveState {
  sdkVersion: string;
  listedModels: string[];
  models: { extractor: string; challenger: string; rubric: string };
  substitutions: string[];
  smoke: { model: string; ok: boolean; latencyMs: number | null; error?: string }[];
  decisionsApi: "available" | "unavailable" | "untested";
  decisionsError?: string;
  checkedAt: string;
}

export const live: LiveState = {
  sdkVersion: SDK_VERSION,
  listedModels: [],
  models: { extractor: PLANNED_MODELS.extractor, challenger: PLANNED_MODELS.challenger, rubric: PLANNED_MODELS.rubric },
  substitutions: [],
  smoke: [],
  decisionsApi: "untested",
  checkedAt: "",
};

const FALLBACK_CHAIN = ["gemini-4-hydrogen", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"];
const DECISIONS_API_VERSION = "v1beta";
const strip = (m: string) => m.replace(/^models\//, "");

function closest(target: string, listed: string[], preferTextGen: boolean): string | null {
  if (listed.includes(target)) return target;
  const pool = listed.filter((m) => m.startsWith("gemini") && !/embedding|image|tts|audio|live|aqa/.test(m));
  const rank = (m: string) =>
    (m.includes("gemini-4") ? 100 : 0) +
    (target.includes("neon") || target.includes("hydrogen") ? (m.includes("flash") ? 20 : 0) : m.includes("pro") ? 20 : 0) +
    (m.includes("preview") || m.includes("exp") ? -5 : 0) +
    (preferTextGen && m.includes("latest") ? 2 : 0);
  return pool.sort((a, b) => rank(b) - rank(a))[0] ?? null;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ v: T; ms: number }> {
  const t0 = performance.now();
  const v = await fn();
  return { v, ms: Math.round(performance.now() - t0) };
}

/** Rule Zero: print SDK version, list models, smoke-test targets, record substitutions. */
export async function verifyLive(): Promise<LiveState> {
  const g = client();
  console.log(`[rule-zero] @google/genai version: ${SDK_VERSION}`);
  try {
    const pager = await g.models.list();
    const ids: string[] = [];
    for await (const m of pager) if (m.name) ids.push(strip(m.name));
    live.listedModels = ids;
    console.log(`[rule-zero] ${ids.length} models visible to this key:\n  ${ids.join("\n  ")}`);
  } catch (e) {
    console.error(`[rule-zero] models.list failed: ${(e as Error).message}`);
  }
  const L = live.listedModels;
  // Fallback chain per External R&D sdk-facts.md (docs-verified, not run-verified).
  const pickChain = (role: "extractor" | "challenger", chain: string[]) => {
    const planned = chain[0];
    let chosen = planned;
    if (L.length) chosen = chain.find((m) => L.includes(m)) ?? closest(planned, L, true) ?? planned;
    if (chosen !== planned) live.substitutions.push(`${role}: planned ${planned} not listed -> using ${chosen}`);
    live.models[role] = chosen;
  };
  pickChain("extractor", [PLANNED_MODELS.extractor, PLANNED_MODELS.extractorFallback, ...FALLBACK_CHAIN]);
  pickChain("challenger", [PLANNED_MODELS.challenger, "gemini-4-argon", ...FALLBACK_CHAIN]);
  live.models.rubric = PLANNED_MODELS.rubric; // Decisions API model; may not appear in models.list

  for (const model of [...new Set([live.models.extractor, live.models.challenger])]) {
    try {
      const { v, ms } = await timed(() =>
        withTimeout(g.models.generateContent({ model, contents: "Reply with the single word OK." }), 20_000),
      );
      live.smoke.push({ model, ok: true, latencyMs: ms });
      console.log(`[rule-zero] smoke ${model}: OK ${ms} ms -> ${JSON.stringify((v.text ?? "").slice(0, 20))}`);
    } catch (e) {
      live.smoke.push({ model, ok: false, latencyMs: null, error: (e as Error).message });
      console.error(`[rule-zero] smoke ${model}: FAIL ${(e as Error).message}`);
    }
  }
  // Decisions API smoke test (noul question on a trivial text input).
  try {
    const dec = (g as unknown as { decisions?: { create: (b: unknown) => Promise<unknown> } }).decisions;
    if (!dec || typeof dec.create !== "function") throw new Error(`SDK ${SDK_VERSION} exposes no decisions.create`);
    const { ms } = await timed(() =>
      withTimeout(
        dec.create({
          model: live.models.rubric,
          api_version: DECISIONS_API_VERSION,
          input: "The sky in this sentence is described as blue.",
          questions: { smoke: { type: "noul", instructions: "Is the sky described as blue?" } },
        }),
        20_000,
      ),
    );
    live.decisionsApi = "available";
    live.smoke.push({ model: live.models.rubric, ok: true, latencyMs: ms });
    console.log(`[rule-zero] decisions.create ${live.models.rubric}: OK ${ms} ms`);
  } catch (e) {
    live.decisionsApi = "unavailable";
    live.decisionsError = (e as Error).message;
    live.smoke.push({ model: live.models.rubric, ok: false, latencyMs: null, error: live.decisionsError });
    live.substitutions.push(`rubric: Decisions API unavailable (${live.decisionsError}) -> rule-based fallback`);
    console.error(`[rule-zero] decisions.create FAIL: ${live.decisionsError}`);
  }
  live.checkedAt = new Date().toISOString();
  recordProvenance();
  console.table(live.smoke.map((s) => ({ model: s.model, ok: s.ok, ms: s.latencyMs, error: s.error?.slice(0, 80) ?? "" })));
  return live;
}

function recordProvenance() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, "provenance-live.json"), JSON.stringify(live, null, 2));
  const et = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  const lines = [
    `\n### Live startup check ${et} ET`,
    `- @google/genai: ${live.sdkVersion}`,
    `- models visible: ${live.listedModels.length}`,
    `- extractor: ${live.models.extractor} | challenger: ${live.models.challenger} | rubric: ${live.models.rubric} (Decisions API ${live.decisionsApi})`,
    ...live.substitutions.map((s) => `- SUBSTITUTION: ${s}`),
    ...live.smoke.map((s) => `- smoke ${s.model}: ${s.ok ? `OK ${s.latencyMs} ms` : `FAIL ${s.error}`}`),
  ];
  fs.appendFileSync(path.join(ROOT, "PROVENANCE.md"), lines.join("\n") + "\n");
}

export async function uploadVideo(filePath: string, mimeType: string): Promise<{ uri: string; mimeType: string; ms: number }> {
  const g = client();
  const t0 = performance.now();
  let f = await g.files.upload({ file: filePath, config: { mimeType } });
  const deadline = Date.now() + 90_000;
  while (f.state && String(f.state) !== "ACTIVE") {
    if (String(f.state) === "FAILED") throw new Error("Files API processing FAILED");
    if (Date.now() > deadline) throw new Error("Files API processing did not become ACTIVE in 90s");
    await new Promise((r) => setTimeout(r, 1500));
    f = await g.files.get({ name: f.name! });
  }
  if (!f.uri) throw new Error("Files API returned no uri");
  return { uri: f.uri, mimeType: f.mimeType ?? mimeType, ms: Math.round(performance.now() - t0) };
}

async function runStage<T>(model: string, fn: () => Promise<T>): Promise<StageResult<T>> {
  const t0 = performance.now();
  try {
    const data = await withTimeout(fn(), STAGE_TIMEOUT_MS);
    return { ok: true, data, model, latencyMs: Math.round(performance.now() - t0) };
  } catch (e) {
    return {
      ok: false,
      error: (e as Error).message,
      timedOut: e instanceof StageTimeout,
      model,
      latencyMs: Math.round(performance.now() - t0),
    };
  }
}

const claimList = (claims: Claim[]) => claims.map((c) => `- ${c.id}: ${c.text}`).join("\n");

export const EXTRACTOR_PROMPT = (claims: Claim[]) => `You are the EXTRACTOR in an evidence pipeline. Watch the attached work video.
List timestamped observations relevant to these self-declared skill claims:
${claimList(claims)}
For each observation set modality to "shown_on_screen" ONLY if the skill is visibly demonstrated on screen;
use "only_said_aloud" if the person merely says it. Do not infer. Do not judge personality, appearance or identity.
Return STRICT JSON only:
{"observations":[{"t_start":number_seconds,"t_end":number_seconds,"description":string,"modality":"shown_on_screen"|"only_said_aloud","claim_ids":[string],"confidence":number_0_to_1}],"summary":string}`;

export const CHALLENGER_PROMPT = (claims: Claim[], s1: Stage1Output) => `You are the CHALLENGER. Your job is to find reasons NOT to believe each claim.
Re-watch the same attached video. Claims:
${claimList(claims)}
Extractor output (may be wrong):
${JSON.stringify(s1)}
For EVERY claim output contradictions (video shows the opposite), unsupported (true if no direct on-screen proof),
missing_visual_proof (what would need to be shown), uncertainty (short text).
Return STRICT JSON only:
{"per_claim":[{"claim_id":string,"contradictions":[string],"unsupported":boolean,"missing_visual_proof":[string],"uncertainty":string}],"overall_notes":string}`;

type InteractionsLike = { create: (p: unknown) => Promise<{ output_text?: string; model?: string; id?: string }> };
/** Which API actually served Stages 1-2 (shown on the badge + recorded in PROVENANCE). */
export const apiUsed: Record<string, string> = {};

/**
 * Strict-JSON call against the uploaded video. Primary: Interactions API (per sdk-facts.md).
 * Fallback: models.generateContent if ai.interactions is missing or rejects the request shape.
 */
async function callJson(stage: string, model: string, uri: string, mime: string, prompt: string, thinking?: "low" | "medium" | "high"): Promise<string | undefined> {
  const g = client() as unknown as { interactions?: InteractionsLike };
  if (g.interactions && typeof g.interactions.create === "function") {
    try {
      const r = await g.interactions.create({
        model,
        system_instruction: "Return only the JSON object required. No prose, no markdown.",
        input: [
          { type: "video", uri, mime_type: mime },
          { type: "text", text: prompt },
        ],
        ...(thinking ? { generation_config: { thinking_level: thinking } } : {}),
        response_format: { type: "text", mime_type: "application/json" },
      });
      apiUsed[stage] = "Interactions API";
      return r.output_text;
    } catch (e) {
      const msg = (e as Error).message;
      // Only fall back on API-shape/availability errors; quota/auth errors propagate (stage fails, gate abstains).
      if (!/not found|404|unknown|unsupported|invalid|not a function|400/i.test(msg)) throw e;
      console.warn(`[${stage}] Interactions API failed (${msg}); falling back to generateContent`);
      apiUsed[stage] = `generateContent (Interactions failed: ${msg.slice(0, 120)})`;
    }
  } else {
    apiUsed[stage] = "generateContent (ai.interactions missing in SDK)";
  }
  const r = await client().models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ fileData: { fileUri: uri, mimeType: mime } }, { text: prompt }] }],
    config: { responseMimeType: "application/json" },
  });
  return r.text;
}

export async function stage1(model: string, uri: string, mime: string, claims: Claim[]) {
  const res = await runStage(model, async () => validateStage1(parseModelJson(await callJson("extractor", model, uri, mime, EXTRACTOR_PROMPT(claims)))));
  return { ...res, model: `${model} via ${apiUsed.extractor ?? "n/a"}` };
}

export async function stage2(model: string, uri: string, mime: string, claims: Claim[], s1: Stage1Output) {
  // Directive: thinking_level "medium" (inside generation_config per sdk-facts.md), no custom temperature.
  const res = await runStage(model, async () =>
    validateStage2(parseModelJson(await callJson("challenger", model, uri, mime, CHALLENGER_PROMPT(claims, s1), "medium"))),
  );
  return { ...res, model: `${model} via ${apiUsed.challenger ?? "n/a"}` };
}

type NoulAns = { type: "noul"; noul: number; confidence: number };
type ScoreAns = { type: "score"; score: number; confidence: number; probabilities?: Record<string, number> };

export async function stage3(claims: Claim[], uri: string, mime: string, s1?: Stage1Output, s2?: Stage2Output): Promise<StageResult<Stage3Output>> {
  const model = live.models.rubric;
  if (live.decisionsApi === "unavailable") {
    const t0 = performance.now();
    const data = ruleBasedRubric(claims, s1, s2, live.decisionsError ?? "Decisions API unavailable");
    return { ok: true, data, model: "rule-based fallback (no model)", latencyMs: Math.round(performance.now() - t0) };
  }
  const res = await runStage(model, async () => {
    const dec = (client() as unknown as { decisions: { create: (b: unknown) => Promise<{ answers?: Record<string, NoulAns | ScoreAns> }> } }).decisions;
    const questions: Record<string, unknown> = {};
    for (const c of claims)
      questions[`claim_${c.id}`] = {
        type: "noul",
        instructions: `Does the video show direct observable evidence supporting the skill "${c.text}"? Saying it aloud is not evidence.`,
        criteria: { true_description: "Skill visibly demonstrated on screen", false_description: "Not shown on screen, only said, or contradicted" },
      };
    const levels = ["0: absent", "1: weak", "2: clear", "3: strong and specific"];
    questions.problem_discovery = { type: "score", instructions: "Problem Discovery shown in the video", criteria: levels };
    questions.technical_communication = { type: "score", instructions: "Technical Communication shown in the video", criteria: levels };
    questions.workflow_execution = { type: "score", instructions: "Workflow Execution shown in the video", criteria: levels };
    const r = await dec.create({
      model,
      api_version: DECISIONS_API_VERSION,
      input: [
        { type: "video", uri, mime_type: mime },
        { type: "text", text: `Extractor notes: ${JSON.stringify(s1 ?? {})}\nChallenger notes: ${JSON.stringify(s2 ?? {})}` },
      ],
      questions,
    });
    const a = r.answers ?? {};
    const per_claim = claims.map((c) => {
      const ans = a[`claim_${c.id}`] as NoulAns | undefined;
      if (!ans || typeof ans.noul !== "number") throw new Error(`Malformed JSON: no noul answer for ${c.id}`);
      // noul = calibrated P(yes) in [0.01,0.99]; "answer" is display-only (PROPOSED 0.5 cutoff), the gate uses probability once.
      return { claim_id: c.id, answer: (ans.noul >= 0.5 ? "yes" : "no") as "yes" | "no", probability: ans.noul, confidence: typeof ans.confidence === "number" ? ans.confidence : undefined };
    });
    const sc = (k: string) => {
      const s = a[k] as ScoreAns | undefined;
      if (!s || typeof s.score !== "number") throw new Error(`Malformed JSON: no score for ${k}`);
      return Number(s.score.toFixed(2));
    };
    return {
      per_claim,
      rubric: { problem_discovery: sc("problem_discovery"), technical_communication: sc("technical_communication"), workflow_execution: sc("workflow_execution") },
      source: "decisions_api" as const,
    };
  });
  if (res.ok) return res;
  // Decisions API failed at run time: log exact error, use labeled deterministic fallback.
  console.error(`[rubric] Decisions API error: ${res.error}`);
  const data = ruleBasedRubric(claims, s1, s2, res.error ?? "unknown Decisions API error");
  return { ok: true, data, model: "rule-based fallback (no model)", latencyMs: res.latencyMs };
}
