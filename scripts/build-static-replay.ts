// STATIC REPLAY BUILD (for public hosting, e.g. Vercel). Added for the hosted demo.
// Pre-renders the OFFLINE REPLAY API responses (SAMPLE fixtures, NOT model output) as static JSON
// under dist/api/, so the Vite frontend runs with no Express backend and no Gemini key.
// The deterministic gate still runs for real on the fixture data at build time.
// Live analysis (/api/analyze) is NOT available on the hosted demo; run locally with a key for that.
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadThresholds } from "../server/src/config.js";
import { loadFixtures, replayFixture, SAMPLE_LABEL } from "../server/src/replay.js";

const out = path.join(ROOT, "dist", "api");
fs.mkdirSync(path.join(out, "replay"), { recursive: true });
const fx = loadFixtures();
const health = {
  ok: true,
  mode: "replay",
  modeLabel: `OFFLINE REPLAY (hosted static demo): ${SAMPLE_LABEL}`,
  keyPresent: false,
  sdkVersion: null,
  models: { extractor: "SAMPLE fixture", challenger: "SAMPLE fixture", rubric: "SAMPLE fixture" },
  substitutions: [],
  smoke: [],
  decisionsApi: "untested",
  sampleCases: fx.map((f) => ({ id: f.id, title: f.title, videoUrl: f.video ? `/samples/${f.video}` : null, claims: f.claims })),
};
fs.writeFileSync(path.join(out, "health"), JSON.stringify(health));
for (const f of fx) fs.writeFileSync(path.join(out, "replay", f.id), JSON.stringify(replayFixture(f, loadThresholds())));
fs.writeFileSync(path.join(out, "runs"), "[]");
const bench = path.join(ROOT, "bench", "results.json");
fs.writeFileSync(path.join(out, "bench"), fs.existsSync(bench) ? fs.readFileSync(bench, "utf8") : JSON.stringify({ status: "not_run" }));
console.log(`[static-replay] wrote ${fx.length} SAMPLE replay responses to dist/api/`);
