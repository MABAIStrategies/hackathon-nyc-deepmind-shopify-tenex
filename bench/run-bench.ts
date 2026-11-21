/**
 * Benchmark runner: Stage-1-only BASELINE (PROPOSED rule, docs/internal-rd/benchmark-protocol.md s4)
 * vs FULL 3-stage pipeline, on Delivery's 4 SAMPLE cases. Ground truth: fixtures/labels.json (Delivery).
 *
 *   npm run bench                     # live if GEMINI_API_KEY is in .env, else SAMPLE replay
 *   npm run bench -- --mode live      # require live (exits 1 without a key)
 *   npm run bench -- --mode replay    # SAMPLE fixtures through the real gate (NOT a model benchmark)
 *   npm run bench -- --cases case2-unsupported-claim,case4-unseen-holdout
 *   npm run bench -- --out bench/results.json
 *
 * n=4, illustrative, not statistically meaningful. Raw counts only; never edit results by hand.
 */
import fs from "node:fs";
import path from "node:path";
import { KEY_PRESENT, ROOT, loadThresholds } from "../server/src/config.js";
import { gateClaims, gateStage1Only } from "../server/src/gate.js";
import { loadFixtures } from "../server/src/replay.js";
import type { Claim, GatedClaim, NodeState, StageResult } from "../shared/types.js";

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const mode = (arg("mode") ?? (KEY_PRESENT ? "live" : "replay")) as "live" | "replay";
const out = path.resolve(ROOT, arg("out") ?? "bench/results.json");
const only = arg("cases")?.split(",").map((s) => s.trim());
if (mode === "live" && !KEY_PRESENT) {
  console.error("--mode live needs GEMINI_API_KEY in .env");
  process.exit(1);
}

interface Labels { cases: { id: string; file: string; claims: { claim: string; expected_state: NodeState }[] }[] }
const labels: Labels = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures/labels.json"), "utf8"));
const cases = labels.cases.filter((c) => !only || only.includes(c.id));
const thresholds = loadThresholds();

type Outcome = "correct_support" | "incorrect_support" | "correct_rejection" | "false_refusal" | "abstention";
function classify(expected: NodeState, g: GatedClaim, failed: boolean): Outcome {
  if (g.state === "supported") return expected === "supported" ? "correct_support" : "incorrect_support";
  if (failed) return "abstention"; // locked because a stage failed: not a real "no"
  return expected === "supported" ? "false_refusal" : "correct_rejection";
}
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

async function main() {
  const perCase: unknown[] = [];
  const tally = {
    baseline: { correct_support: 0, incorrect_support: 0, correct_rejection: 0, false_refusal: 0, abstention: 0, errors: 0, lat: [] as number[] },
    full: { correct_support: 0, incorrect_support: 0, correct_rejection: 0, false_refusal: 0, abstention: 0, errors: 0, lat: [] as number[] },
  };
  let models: Record<string, string> | undefined;
  let m: typeof import("../server/src/gemini.js") | undefined;
  if (mode === "live") {
    m = await import("../server/src/gemini.js");
    await m.verifyLive();
    models = { ...m.live.models, sdk: m.live.sdkVersion };
  }
  const fixtures = loadFixtures();
  for (const c of cases) {
    const claims: Claim[] = c.claims.map((cl, i) => ({ id: `c${i + 1}`, text: cl.claim }));
    let s1: StageResult<any>, s2: StageResult<any>, s3: StageResult<any>;
    if (mode === "live") {
      const video = path.join(ROOT, "web/public/samples", c.file);
      try {
        const up = await m!.uploadVideo(video, "video/mp4");
        s1 = await m!.stage1(m!.live.models.extractor, up.uri, up.mimeType, claims);
        s2 = s1.ok ? await m!.stage2(m!.live.models.challenger, up.uri, up.mimeType, claims, s1.data) : { ok: false, error: "skipped", model: "n/a", latencyMs: null };
        s3 = await m!.stage3(claims, up.uri, up.mimeType, s1.data, s2.data);
      } catch (e) {
        const f = { ok: false, error: (e as Error).message, model: "n/a", latencyMs: null };
        s1 = s2 = s3 = f;
      }
    } else {
      const fx = fixtures.find((f) => f.id === c.id)!;
      const S = (x: any): StageResult<any> => ({ ...x, model: "SAMPLE fixture", latencyMs: null });
      s1 = S(fx.stages.extractor); s2 = S(fx.stages.challenger); s3 = S(fx.stages.rubric);
    }
    const base = gateStage1Only(claims, s1, thresholds);
    const full = gateClaims(claims, s1, s2, s3, thresholds);
    const baseFailed = !s1.ok;
    const fullFailed = !s1.ok || !s2.ok || !s3.ok;
    if (baseFailed) tally.baseline.errors++;
    if (fullFailed) tally.full.errors++;
    if (s1.latencyMs != null) tally.baseline.lat.push(s1.latencyMs);
    if (s1.latencyMs != null && s2.latencyMs != null && s3.latencyMs != null) tally.full.lat.push(s1.latencyMs + s2.latencyMs + s3.latencyMs);
    const rows = claims.map((cl, i) => {
      const exp = c.claims[i].expected_state;
      const ob = classify(exp, base[i], baseFailed);
      const of = classify(exp, full[i], fullFailed);
      tally.baseline[ob]++;
      tally.full[of]++;
      return { claim: cl.text, expected: exp, baseline: base[i].state, baseline_outcome: ob, full: full[i].state, full_outcome: of, full_probability: full[i].probability };
    });
    perCase.push({ case: c.id, stages: { extractor: [s1.ok, s1.model, s1.latencyMs, s1.error], challenger: [s2.ok, s2.model, s2.latencyMs, s2.error], rubric: [s3.ok, s3.model, s3.latencyMs, s3.error] }, claims: rows });
    console.log(c.id, rows.map((r) => `${r.expected} | base=${r.baseline} full=${r.full}`).join("; "));
  }
  const row = (name: string, t: typeof tally.baseline) => ({
    pipeline: name, correct_support: t.correct_support, incorrect_support: t.incorrect_support, correct_rejection: t.correct_rejection,
    false_refusal: t.false_refusal, abstention: t.abstention, errors: t.errors, median_latency_ms: median(t.lat),
  });
  const result = {
    mode,
    label: mode === "live" ? "LIVE model run" : "SAMPLE / not a live model run: hand-authored fixtures through the real gate. NOT a model benchmark.",
    note: "n=4, illustrative, not statistically meaningful.",
    ranAt: new Date().toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET",
    ground_truth: "fixtures/labels.json (Delivery, SAMPLE synthetic videos)",
    baseline_rule: "PROPOSED (Internal R&D): unlock iff >=1 shown_on_screen observation at >=0.6 confidence; Stage 1 only",
    thresholds,
    models,
    rows: [row("Stage-1-only baseline (PROPOSED rule)", tally.baseline), row("Full 3-stage pipeline", tally.full)],
    cases: perCase,
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.table(result.rows);
  console.log(`wrote ${path.relative(ROOT, out)} (${result.label})`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
