// Shared types between the Express backend and the React frontend.

export type NodeState =
  | "unverified"
  | "evidence_pending"
  | "supported"
  | "insufficient_evidence"
  | "contradicted";

export type Modality = "shown_on_screen" | "only_said_aloud";

export interface Claim {
  id: string;
  text: string;
}

export interface Observation {
  t_start: number; // seconds
  t_end: number; // seconds
  description: string;
  modality: Modality;
  claim_ids: string[];
  confidence: number; // 0..1, model self-reported
}

export interface Stage1Output {
  observations: Observation[];
  summary: string;
}

export interface ChallengerClaimNote {
  claim_id: string;
  contradictions: string[];
  unsupported: boolean;
  missing_visual_proof: string[];
  uncertainty: string;
}

export interface Stage2Output {
  per_claim: ChallengerClaimNote[];
  overall_notes: string;
}

export interface RubricClaimAnswer {
  claim_id: string;
  answer: "yes" | "no";
  probability: number; // 0..1. Decisions API: noul = calibrated P(yes) in [0.01, 0.99]
  confidence?: number; // Decisions API: max(noul, 1 - noul). Shown in the drawer, gated at PROPOSED 0.5
}

export interface RubricScores {
  problem_discovery: number; // 0..3
  technical_communication: number; // 0..3
  workflow_execution: number; // 0..3
}

export type RubricSource = "decisions_api" | "rule_based_fallback" | "sample_fixture";

export interface Stage3Output {
  per_claim: RubricClaimAnswer[];
  rubric: RubricScores;
  source: RubricSource;
  fallback_reason?: string; // exact error when Decisions API was unavailable
}

export interface StageResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  timedOut?: boolean;
  model: string; // model id that ACTUALLY ran, or "SAMPLE fixture" / "rule-based (no model)"
  latencyMs: number | null; // real measured ms, null for fixtures
}

export interface GateThresholds {
  support_probability: number;
  min_observation_confidence: number;
  min_shown_observations: number;
  min_decision_confidence: number;
}

export interface GatedClaim {
  claim: Claim;
  state: NodeState;
  reasons: string[];
  probability: number | null;
  observations: Observation[];
  challenger: ChallengerClaimNote | null;
  limitations: string[];
}

export type GateMode = "full_3_stage" | "baseline_stage1_only";

export type RunKind = "live" | "cached_live" | "sample_fixture";

export interface AnalyzeResponse {
  runKind: RunKind;
  label: string; // human-readable honesty label shown on screen
  videoHash: string | null;
  videoUrl: string | null;
  fileUri: string | null;
  createdAt: string;
  claims: Claim[];
  stages: {
    extractor: StageResult<Stage1Output>;
    challenger: StageResult<Stage2Output>;
    rubric: StageResult<Stage3Output>;
  };
  gated: GatedClaim[];
  thresholds: GateThresholds;
}

export interface HealthResponse {
  ok: boolean;
  mode: "live" | "replay";
  modeLabel: string;
  keyPresent: boolean;
  sdkVersion: string | null;
  models: { extractor: string; challenger: string; rubric: string };
  substitutions: string[];
  smoke: { model: string; ok: boolean; latencyMs: number | null; error?: string }[];
  decisionsApi: "available" | "unavailable" | "untested";
  sampleCases: { id: string; title: string; videoUrl: string | null; claims: Claim[] }[];
}
