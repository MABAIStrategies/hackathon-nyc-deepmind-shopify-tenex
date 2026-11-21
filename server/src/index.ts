import fs from "node:fs";
import path from "node:path";
import express from "express";
import multer from "multer";
import { KEY_PRESENT, MODE, PORT, ROOT, UPLOAD_DIR, loadThresholds } from "./config.js";
import { loadFixtures, replayFixture, SAMPLE_LABEL } from "./replay.js";
import { gateClaims } from "./gate.js";
import { claimsKey, getFileUri, getRun, hashFile, listRuns, putFileUri, putRun } from "./cache.js";
import type { AnalyzeResponse, Claim, HealthResponse } from "../../shared/types.js";

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const app = express();
app.use(express.json({ limit: "1mb" }));
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 200 * 1024 * 1024 } });

type LiveMod = typeof import("./gemini.js");
let liveMod: LiveMod | null = null;
let liveReady: Promise<unknown> = Promise.resolve();
if (MODE === "live") {
  liveReady = import("./gemini.js").then(async (m) => {
    liveMod = m;
    await m.verifyLive();
  });
}

function modeLabel() {
  return MODE === "live" ? "LIVE: real Gemini calls from this backend" : `OFFLINE REPLAY: ${SAMPLE_LABEL}`;
}

app.get("/api/health", async (_req, res) => {
  await liveReady.catch(() => undefined);
  const fx = loadFixtures();
  const l = liveMod?.live;
  const body: HealthResponse = {
    ok: true,
    mode: MODE,
    modeLabel: modeLabel(),
    keyPresent: KEY_PRESENT, // boolean only; the key itself never leaves the backend
    sdkVersion: l?.sdkVersion ?? readSdkVersion(),
    models: l?.models ?? { extractor: "SAMPLE fixture", challenger: "SAMPLE fixture", rubric: "SAMPLE fixture" },
    substitutions: l?.substitutions ?? [],
    smoke: l?.smoke ?? [],
    decisionsApi: l?.decisionsApi ?? "untested",
    sampleCases: fx.map((f) => ({ id: f.id, title: f.title, videoUrl: f.video ? `/samples/${f.video}` : null, claims: f.claims })),
  };
  res.json(body);
});

app.get("/api/samples", (_req, res) => res.json(loadFixtures().map((f) => ({ id: f.id, title: f.title, claims: f.claims, expected: f.expected }))));

app.get("/api/replay/:caseId", (req, res) => {
  const fx = loadFixtures().find((f) => f.id === req.params.caseId);
  if (!fx) return res.status(404).json({ error: `no SAMPLE fixture ${req.params.caseId}` });
  res.json(replayFixture(fx, loadThresholds()));
});

app.get("/api/runs", (_req, res) => res.json(listRuns()));
// Replay a cached REAL run without re-uploading (wifi-down path). Labeled with its original timestamp.
app.get("/api/cached/:hash/:key", (req, res) => {
  const cached = getRun(req.params.hash, req.params.key);
  if (!cached) return res.status(404).json({ error: "no cached run" });
  const thresholds = loadThresholds();
  res.json({
    ...cached,
    runKind: "cached_live",
    label: `CACHED real run from ${cached.createdAt} (replayed from local cache, not re-run)`,
    gated: gateClaims(cached.claims, cached.stages.extractor, cached.stages.challenger, cached.stages.rubric, thresholds),
    thresholds,
  });
});

app.get("/api/bench", (_req, res) => {
  const p = path.join(ROOT, "bench", "results.json");
  if (!fs.existsSync(p)) return res.json({ status: "not_run" });
  res.json(JSON.parse(fs.readFileSync(p, "utf8")));
});

function parseClaims(raw: unknown): Claim[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((c, i) => ({ id: String((c as Claim).id ?? `c${i + 1}`), text: String((c as Claim).text ?? "").slice(0, 120).trim() }))
    .filter((c) => c.text.length > 0)
    .slice(0, 3);
}

// Uploaded videos are served back to the browser for timestamp seeking.
app.use("/media", express.static(UPLOAD_DIR, { fallthrough: false }));

app.post("/api/analyze", upload.single("video"), async (req, res) => {
  const claims = parseClaims(req.body?.claims);
  if (MODE !== "live") {
    // Offline: never pretend to analyze an uploaded video. Point to labeled SAMPLE replay instead.
    if (req.file) fs.rmSync(req.file.path, { force: true });
    const caseId = String(req.body?.caseId ?? "");
    const fx = loadFixtures().find((f) => f.id === caseId);
    if (!fx)
      return res.status(409).json({
        error: "Offline replay mode: no GEMINI_API_KEY in backend .env, so uploaded videos are NOT analyzed. Choose a SAMPLE case.",
        mode: MODE,
      });
    return res.json(replayFixture(fx, loadThresholds()));
  }
  if (!req.file) return res.status(400).json({ error: "video file required (field 'video')" });
  if (claims.length === 0) return res.status(400).json({ error: "at least one claim required" });
  const mime = req.file.mimetype || "video/mp4";
  const ext = path.extname(req.file.originalname || ".mp4") || ".mp4";
  const hash = hashFile(req.file.path);
  const stored = path.join(UPLOAD_DIR, `${hash}${ext}`);
  if (!fs.existsSync(stored)) fs.renameSync(req.file.path, stored);
  else fs.rmSync(req.file.path, { force: true });
  const key = claimsKey(claims);
  const thresholds = loadThresholds();

  if (req.body?.useCache !== "false") {
    const cached = getRun(hash, key);
    if (cached) {
      return res.json({
        ...cached,
        runKind: "cached_live",
        label: `CACHED real run from ${cached.createdAt} (replayed from local cache, not re-run)`,
        gated: gateClaims(cached.claims, cached.stages.extractor, cached.stages.challenger, cached.stages.rubric, thresholds),
        thresholds,
      } satisfies AnalyzeResponse);
    }
  }
  // Cache check above runs BEFORE waiting on Rule Zero, so a cached real run replays even with wifi down.
  await liveReady.catch(() => undefined);
  const m = liveMod;
  if (!m) return res.status(503).json({ error: "Live pipeline failed to initialize; see server log. Use SAMPLE replay." });
  try {
    let f = getFileUri(hash);
    if (!f) {
      const up = await m.uploadVideo(stored, mime);
      putFileUri(hash, up.uri, up.mimeType);
      f = { uri: up.uri, mimeType: up.mimeType };
      console.log(`[files] uploaded once in ${up.ms} ms -> ${up.uri}`);
    }
    const s1 = await m.stage1(m.live.models.extractor, f.uri, f.mimeType, claims);
    const s2 = s1.ok
      ? await m.stage2(m.live.models.challenger, f.uri, f.mimeType, claims, s1.data!)
      : { ok: false, error: "skipped: Extractor failed", model: m.live.models.challenger, latencyMs: null };
    const s3 = await m.stage3(claims, f.uri, f.mimeType, s1.data, s2.data);
    const run: AnalyzeResponse = {
      runKind: "live",
      label: "LIVE model run",
      videoHash: hash,
      videoUrl: `/media/${path.basename(stored)}`,
      fileUri: f.uri,
      createdAt: new Date().toISOString(),
      claims,
      stages: { extractor: s1, challenger: s2, rubric: s3 },
      gated: gateClaims(claims, s1, s2, s3, thresholds),
      thresholds,
    };
    if (s1.ok && s2.ok) putRun(hash, key, run);
    res.json(run);
  } catch (e) {
    // Upload failure etc: abstain, never unlock.
    const err = (e as Error).message;
    const fail = { ok: false, error: err, model: "n/a", latencyMs: null };
    res.json({
      runKind: "live",
      label: `LIVE run FAILED: ${err}`,
      videoHash: hash,
      videoUrl: `/media/${path.basename(stored)}`,
      fileUri: null,
      createdAt: new Date().toISOString(),
      claims,
      stages: { extractor: fail, challenger: fail, rubric: fail },
      gated: gateClaims(claims, fail, fail, fail, thresholds),
      thresholds,
    } satisfies AnalyzeResponse);
  }
});

function readSdkVersion(): string | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules/@google/genai/package.json"), "utf8")).version;
  } catch {
    return null;
  }
}

// Serve the built frontend if present (npm run build && npm start).
const dist = path.join(ROOT, "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|media).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`[my-player] API on http://localhost:${PORT}  mode=${MODE}  (${modeLabel()})`);
  console.log(`[my-player] @google/genai version: ${readSdkVersion() ?? "not installed"}`);
  if (MODE === "replay") console.log("[my-player] No GEMINI_API_KEY in .env (or MY_PLAYER_MODE=replay): SAMPLE fixtures only. No model calls, no network.");
});
