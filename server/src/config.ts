import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_THRESHOLDS } from "./gate.js";
import type { GateThresholds } from "../../shared/types.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DATA_DIR = path.join(ROOT, "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const CACHE_FILE = path.join(DATA_DIR, "cache.json");
export const FIXTURE_DIR = path.join(ROOT, "fixtures");
export const PORT = Number(process.env.PORT ?? 8787);
export const STAGE_TIMEOUT_MS = Number(process.env.STAGE_TIMEOUT_MS ?? 45_000);

// The key is read ONLY here, from the backend environment (.env). It is never sent to the browser or logged.
const rawKey = (process.env.GEMINI_API_KEY ?? "").trim();
export const KEY_PRESENT = rawKey.length > 0;
export function getApiKey(): string {
  return rawKey;
}

export const MODE: "live" | "replay" =
  process.env.MY_PLAYER_MODE === "replay" || !KEY_PRESENT ? "replay" : "live";

// Planned model ids from the directive. UNVERIFIED until the startup model-list + smoke test runs.
export const PLANNED_MODELS = {
  extractor: process.env.MODEL_EXTRACTOR ?? "gemini-4-neon",
  extractorFallback: process.env.MODEL_EXTRACTOR_FALLBACK ?? "gemini-4-hydrogen",
  challenger: process.env.MODEL_CHALLENGER ?? "gemini-4-carbon",
  rubric: process.env.MODEL_RUBRIC ?? "gemini-decision-1",
};

export function loadThresholds(): GateThresholds {
  const p = path.join(ROOT, "gate-thresholds.json");
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return { ...DEFAULT_THRESHOLDS, ...pickNumbers(j) };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}
function pickNumbers(j: Record<string, unknown>): Partial<GateThresholds> {
  const out: Partial<GateThresholds> = {};
  for (const k of ["support_probability", "min_observation_confidence", "min_shown_observations", "min_decision_confidence"] as const) {
    if (typeof j[k] === "number") out[k] = j[k] as number;
  }
  return out;
}
