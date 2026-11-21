// Wiring test for the LIVE pipeline against a MOCKED @google/genai client. No network, no key.
// Verifies call shapes, fallbacks and fail-closed behavior; it does NOT verify the real API.
import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const calls: Record<string, unknown[]> = { interactions: [], decisions: [], generate: [], upload: [] };
const behavior = { interactions: "ok" as "ok" | "404" | "missing", decisions: "ok" as "ok" | "fail" | "missing", s1json: "ok" as "ok" | "bad" };

const s1 = {
  summary: "mock",
  observations: [
    { t_start: 7.8, t_end: 19.6, description: "fills form", modality: "shown_on_screen", claim_ids: ["c1"], confidence: 0.9 },
    { t_start: 26, t_end: 28.8, description: "says SQL", modality: "only_said_aloud", claim_ids: ["c2"], confidence: 0.95 },
  ],
};
const s2 = {
  overall_notes: "mock",
  per_claim: [
    { claim_id: "c1", contradictions: [], unsupported: false, missing_visual_proof: [], uncertainty: "" },
    { claim_id: "c2", contradictions: [], unsupported: true, missing_visual_proof: ["no SQL on screen"], uncertainty: "" },
  ],
};

vi.mock("@google/genai", () => {
  class GoogleGenAI {
    models = {
      list: async () => ({
        async *[Symbol.asyncIterator]() {
          for (const name of ["models/gemini-4-hydrogen", "models/gemini-4-carbon", "models/gemini-3.8-flash"]) yield { name };
        },
      }),
      generateContent: async (p: { contents: unknown }) => {
        calls.generate.push(p);
        const text = JSON.stringify(p.contents).includes("CHALLENGER") ? JSON.stringify(s2) : behavior.s1json === "bad" ? "{oops" : JSON.stringify(s1);
        return { text: typeof p.contents === "string" ? "OK" : text };
      },
    };
    files = {
      upload: async (p: unknown) => (calls.upload.push(p), { name: "files/abc", state: "PROCESSING", mimeType: "video/mp4" }),
      get: async () => ({ name: "files/abc", state: "ACTIVE", uri: "https://mock/files/abc", mimeType: "video/mp4" }),
    };
    get interactions() {
      if (behavior.interactions === "missing") return undefined;
      return {
        create: async (p: { input: { type: string; text?: string }[] }) => {
          calls.interactions.push(p);
          if (behavior.interactions === "404") throw new Error("404 Not Found: interactions");
          const txt = p.input.find((x) => x.type === "text")?.text ?? "";
          if (txt.includes("CHALLENGER")) return { output_text: JSON.stringify(s2) };
          return { output_text: behavior.s1json === "bad" ? "{oops" : JSON.stringify(s1) };
        },
      };
    }
    get decisions() {
      if (behavior.decisions === "missing") return undefined;
      return {
        create: async (p: { questions: Record<string, unknown> }) => {
          calls.decisions.push(p);
          if (behavior.decisions === "fail") throw new Error("403 decisions not enabled");
          const answers: Record<string, unknown> = {};
          for (const k of Object.keys(p.questions)) {
            if (k === "claim_c1") answers[k] = { type: "noul", noul: 0.91, confidence: 0.91 };
            else if (k === "claim_c2") answers[k] = { type: "noul", noul: 0.05, confidence: 0.95 };
            else if (k === "smoke") answers[k] = { type: "noul", noul: 0.9, confidence: 0.9 };
            else answers[k] = { type: "score", score: 1.12, confidence: 0.6, probabilities: { "0": 0.1, "1": 0.7, "2": 0.15, "3": 0.05 } };
          }
          return { answers };
        },
      };
    }
  }
  return { GoogleGenAI };
});

const claims = [
  { id: "c1", text: "I can fill out a job entry form, end to end." },
  { id: "c2", text: "I also wrote the SQL query that powers this." },
];
const video = path.join(os.tmpdir(), "mp-mock.mp4");
fs.writeFileSync(video, "not really a video");

async function fresh() {
  vi.resetModules();
  const m = await import("./gemini.js");
  const g = await import("./gate.js");
  return { m, g };
}
async function runAll() {
  const { m, g } = await fresh();
  await m.verifyLive();
  const up = await m.uploadVideo(video, "video/mp4");
  const r1 = await m.stage1(m.live.models.extractor, up.uri, up.mimeType, claims);
  const r2 = r1.ok ? await m.stage2(m.live.models.challenger, up.uri, up.mimeType, claims, r1.data!) : { ok: false, error: "skipped", model: "x", latencyMs: null };
  const r3 = await m.stage3(claims, up.uri, up.mimeType, r1.data, r2.data);
  return { m, r1, r2, r3, gated: g.gateClaims(claims, r1, r2, r3) };
}

// verifyLive appends to PROVENANCE.md; keep the real file untouched during tests.
const prov = path.resolve(__dirname, "../../PROVENANCE.md");
let provBackup = "";
beforeEach(() => {
  provBackup = fs.readFileSync(prov, "utf8");
  for (const k of Object.keys(calls)) calls[k] = [];
  Object.assign(behavior, { interactions: "ok", decisions: "ok", s1json: "ok" });
  return () => fs.writeFileSync(prov, provBackup);
});

describe("live wiring (mocked SDK)", () => {
  it("substitutes unlisted models, uses Interactions + Decisions, and produces the signature outcome", async () => {
    const { m, r1, r3, gated } = await runAll();
    expect(m.live.models.extractor).toBe("gemini-4-hydrogen"); // neon not listed -> hydrogen
    expect(m.live.models.challenger).toBe("gemini-4-carbon");
    expect(m.live.substitutions.join(" ")).toMatch(/neon/);
    expect(r1.model).toMatch(/gemini-4-hydrogen via Interactions API/);
    const ic = calls.interactions[0] as { input: { type: string; uri?: string; mime_type?: string }[] };
    expect(ic.input[0]).toEqual({ type: "video", uri: "https://mock/files/abc", mime_type: "video/mp4" });
    const ch = calls.interactions[1] as { generation_config?: { thinking_level?: string }; temperature?: number };
    expect(ch.generation_config?.thinking_level).toBe("medium");
    const dc = calls.decisions.find((d) => (d as { questions: object }).questions && "claim_c1" in (d as { questions: object }).questions) as { model: string; api_version: string };
    expect(dc.model).toBe("gemini-decision-1");
    expect(dc.api_version).toBe("v1beta");
    expect(r3.data?.source).toBe("decisions_api");
    expect(r3.data?.rubric.problem_discovery).toBeCloseTo(1.12);
    expect(gated.map((x) => x.state)).toEqual(["supported", "insufficient_evidence"]);
    expect(calls.upload).toHaveLength(1);
  });
  it("falls back to generateContent when Interactions 404s", async () => {
    behavior.interactions = "404";
    const { r1, gated } = await runAll();
    expect(r1.model).toMatch(/generateContent/);
    expect(gated[0].state).toBe("supported");
  });
  it("uses the labeled rule-based fallback when Decisions is unavailable", async () => {
    behavior.decisions = "fail";
    const { r3, gated } = await runAll();
    expect(r3.data?.source).toBe("rule_based_fallback");
    expect(r3.data?.fallback_reason).toMatch(/403/);
    expect(r3.model).toMatch(/rule-based/);
    expect(gated.map((x) => x.state)).toEqual(["supported", "insufficient_evidence"]);
  });
  it("malformed Stage 1 JSON fails closed (nothing unlocks)", async () => {
    behavior.s1json = "bad";
    const { r1, gated } = await runAll();
    expect(r1.ok).toBe(false);
    expect(r1.error).toMatch(/Malformed JSON/);
    expect(gated.every((x) => x.state === "insufficient_evidence")).toBe(true);
  });
});
