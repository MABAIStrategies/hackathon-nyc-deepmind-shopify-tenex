// OFFLINE REPLAY. Hand-authored SAMPLE fixtures, NOT model output. Every response is labeled as such.
// The deterministic gate still runs for real on the fixture data.
import fs from "node:fs";
import path from "node:path";
import { FIXTURE_DIR } from "./config.js";
import { gateClaims } from "./gate.js";
import type { AnalyzeResponse, Claim, GateThresholds, Stage1Output, Stage2Output, Stage3Output, StageResult } from "../../shared/types.js";

export const SAMPLE_LABEL = "SAMPLE / not a live model run";
export const SAMPLE_MODEL = "SAMPLE fixture";

export interface Fixture {
  id: string;
  title: string;
  expected: Record<string, string>; // claim_id -> expected node state (for the benchmark)
  video: string | null; // file name under web/public/samples
  benchmark?: boolean;
  expected_source?: string;
  transcript?: string;
  claims: Claim[];
  sample_notice: string;
  stages: {
    extractor: { ok: boolean; error?: string; timedOut?: boolean; data?: Stage1Output };
    challenger: { ok: boolean; error?: string; timedOut?: boolean; data?: Stage2Output };
    rubric: { ok: boolean; error?: string; timedOut?: boolean; data?: Stage3Output };
  };
}

export function loadFixtures(): Fixture[] {
  const dir = path.join(FIXTURE_DIR, "cases");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Fixture);
}

function asStage<T>(s: { ok: boolean; error?: string; timedOut?: boolean; data?: T }): StageResult<T> {
  return { ok: s.ok, data: s.data, error: s.error, timedOut: s.timedOut, model: SAMPLE_MODEL, latencyMs: null };
}

// Replay always uses the fixture's own claims: SAMPLE evidence is never re-attached to claims it wasn't written for.
export function replayFixture(fx: Fixture, thresholds: GateThresholds): AnalyzeResponse {
  const claims: Claim[] = fx.claims;
  const rubric = asStage(fx.stages.rubric);
  if (fx.stages.rubric.data?.source === "rule_based_fallback") rubric.model = "SAMPLE fixture · rule-based fallback";
  const stages = {
    extractor: asStage(fx.stages.extractor),
    challenger: asStage(fx.stages.challenger),
    rubric,
  };
  return {
    runKind: "sample_fixture",
    label: SAMPLE_LABEL,
    videoHash: null,
    videoUrl: fx.video ? `/samples/${fx.video}` : null,
    fileUri: null,
    createdAt: new Date().toISOString(),
    claims,
    stages,
    gated: gateClaims(claims, stages.extractor, stages.challenger, stages.rubric, thresholds),
    thresholds,
  };
}

