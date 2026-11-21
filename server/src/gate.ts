// Deterministic evidence gate. Pure TypeScript, no model calls, unit-tested in gate.test.ts.
// Principle: NEVER unlock on failure. Any timeout, error, malformed output or low confidence
// yields insufficient_evidence. Only a full chain of positive evidence yields supported.
import type {
  Claim,
  GateThresholds,
  GatedClaim,
  Observation,
  Stage1Output,
  Stage2Output,
  Stage3Output,
  StageResult,
} from "../../shared/types.js";

// All numbers below are PROPOSED (the spec leaves them unset). Rationale and tuning rules:
// docs/internal-rd/gate-thresholds-rationale.md. Override via gate-thresholds.json; never tune on the holdout.
export const DEFAULT_THRESHOLDS: GateThresholds = {
  support_probability: 0.7, // PROPOSED: Rubric Gate noul P(yes) must be >= 0.7 (noul max is 0.99, so this can fire)
  min_observation_confidence: 0.6, // PROPOSED: a shown_on_screen observation counts only at >= 0.6
  min_shown_observations: 1, // PROPOSED: at least one qualifying on-screen moment
  min_decision_confidence: 0.5, // PROPOSED: Decisions API confidence below 0.5 => insufficient_evidence
};

const STANDARD_LIMITATIONS = [
  "Judges only what is visible in this one video; absence of evidence is not evidence of absence.",
  "Model confidence values are self-reported and uncalibrated.",
  "Not a hiring decision, not a biometric or personality assessment.",
];

function clamp01(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
}

export function gateClaims(
  claims: Claim[],
  s1: StageResult<Stage1Output>,
  s2: StageResult<Stage2Output>,
  s3: StageResult<Stage3Output>,
  t: GateThresholds = DEFAULT_THRESHOLDS,
): GatedClaim[] {
  return claims.map((claim) => gateOne(claim, s1, s2, s3, t));
}

function stageFailure(name: string, r: StageResult<unknown>): string | null {
  if (r.timedOut) return `${name} timed out`;
  if (!r.ok) return `${name} failed: ${r.error ?? "unknown error"}`;
  if (r.data == null) return `${name} returned no data`;
  return null;
}

export function gateOne(
  claim: Claim,
  s1: StageResult<Stage1Output>,
  s2: StageResult<Stage2Output>,
  s3: StageResult<Stage3Output>,
  t: GateThresholds = DEFAULT_THRESHOLDS,
): GatedClaim {
  const reasons: string[] = [];
  const limitations = [...STANDARD_LIMITATIONS];
  const observations: Observation[] = Array.isArray(s1.data?.observations)
    ? s1.data!.observations.filter((o) => Array.isArray(o?.claim_ids) && o.claim_ids.includes(claim.id))
    : [];
  const challenger = Array.isArray(s2.data?.per_claim)
    ? s2.data!.per_claim.find((c) => c?.claim_id === claim.id) ?? null
    : null;
  const answer = Array.isArray(s3.data?.per_claim)
    ? s3.data!.per_claim.find((a) => a?.claim_id === claim.id) ?? null
    : null;
  const probability = clamp01(answer?.probability);

  const base = { claim, observations, challenger, probability, limitations };

  // 1. Stage 1 failure: nothing to judge.
  const f1 = stageFailure("Extractor", s1);
  if (f1) return { ...base, state: "insufficient_evidence", reasons: [f1, "Never unlock on failure."] };

  // 2. Challenger failure: cannot clear the claim without a challenge.
  const f2 = stageFailure("Challenger", s2);
  if (f2) return { ...base, state: "insufficient_evidence", reasons: [f2, "Never unlock on failure."] };

  // 3. Contradiction beats everything else.
  if (challenger && Array.isArray(challenger.contradictions) && challenger.contradictions.length > 0) {
    return {
      ...base,
      state: "contradicted",
      reasons: ["Challenger found the video contradicts this claim.", ...challenger.contradictions],
    };
  }

  // 4. Rubric gate failure.
  const f3 = stageFailure("Rubric Gate", s3);
  if (f3) return { ...base, state: "insufficient_evidence", reasons: [f3, "Never unlock on failure."] };

  if (s3.data!.source === "rule_based_fallback") {
    limitations.push("Rubric Gate used the deterministic rule-based fallback (Decisions API unavailable).");
  }

  const shown = observations.filter(
    (o) => o.modality === "shown_on_screen" && (clamp01(o.confidence) ?? 0) >= t.min_observation_confidence,
  );
  const saidOnly = observations.filter((o) => o.modality === "only_said_aloud");

  if (shown.length < t.min_shown_observations) {
    reasons.push(
      saidOnly.length > 0
        ? `Claim was only said aloud (${saidOnly.length} mention${saidOnly.length > 1 ? "s" : ""}); never shown on screen.`
        : "No on-screen observation supports this claim.",
    );
  }
  if (!challenger) reasons.push("Challenger returned no note for this claim.");
  else if (challenger.unsupported) reasons.push("Challenger flagged this claim as unsupported.");
  if (challenger && challenger.missing_visual_proof?.length) {
    reasons.push(...challenger.missing_visual_proof.map((m) => `Missing visual proof: ${m}`));
  }
  const conf = answer?.confidence === undefined ? undefined : clamp01(answer.confidence);
  // noul is gated ONCE, as a probability against support_probability (no separate yes/no double count).
  if (!answer) reasons.push("Rubric Gate returned no answer for this claim.");
  if (conf === null) reasons.push("Rubric Gate confidence malformed.");
  else if (conf !== undefined && conf < t.min_decision_confidence)
    reasons.push(`Rubric Gate confidence ${conf.toFixed(2)} is below the ${t.min_decision_confidence.toFixed(2)} minimum.`);
  if (answer && probability == null) reasons.push("Rubric Gate probability missing or malformed.");
  else if (probability != null && probability < t.support_probability)
    reasons.push(
      `Rubric Gate probability ${probability!.toFixed(2)} is below the ${t.support_probability.toFixed(2)} threshold.`,
    );

  const supported =
    shown.length >= t.min_shown_observations &&
    challenger != null &&
    !challenger.unsupported &&
    !(challenger.missing_visual_proof?.length) &&
    answer != null &&
    conf !== null &&
    (conf === undefined || conf! >= t.min_decision_confidence) &&
    probability != null &&
    probability >= t.support_probability;

  if (supported) {
    return {
      ...base,
      state: "supported",
      reasons: [
        `${shown.length} on-screen observation${shown.length > 1 ? "s" : ""} at or above ${t.min_observation_confidence} confidence.`,
        "Challenger raised no contradiction or missing proof.",
        `Rubric Gate P(yes) ${probability!.toFixed(2)} >= ${t.support_probability.toFixed(2)}${conf !== undefined ? `, confidence ${conf.toFixed(2)}` : ""}.`,
      ],
    };
  }
  return { ...base, state: "insufficient_evidence", reasons };
}

/** Deterministic Stage-3 fallback used when the Decisions API is unavailable. Clearly labeled. */
export function ruleBasedRubric(
  claims: Claim[],
  s1: Stage1Output | undefined,
  s2: Stage2Output | undefined,
  reason: string,
  t: GateThresholds = DEFAULT_THRESHOLDS,
): Stage3Output {
  const obs = s1?.observations ?? [];
  const per_claim = claims.map((c) => {
    const shown = obs.filter(
      (o) => o.claim_ids?.includes(c.id) && o.modality === "shown_on_screen" && o.confidence >= t.min_observation_confidence,
    );
    const note = s2?.per_claim?.find((n) => n.claim_id === c.id);
    const flagged = !note || note.unsupported || (note.contradictions?.length ?? 0) > 0 || (note.missing_visual_proof?.length ?? 0) > 0;
    // Rule: probability = mean confidence of qualifying on-screen observations, zeroed if challenged.
    const p = shown.length && !flagged ? shown.reduce((a, o) => a + o.confidence, 0) / shown.length : 0;
    return { claim_id: c.id, answer: (p >= t.support_probability ? "yes" : "no") as "yes" | "no", probability: Number(p.toFixed(2)) };
  });
  const supportedCount = per_claim.filter((p) => p.answer === "yes").length;
  const score = Math.min(3, supportedCount);
  return {
    per_claim,
    rubric: { problem_discovery: score, technical_communication: score, workflow_execution: score },
    source: "rule_based_fallback",
    fallback_reason: reason,
  };
}

/**
 * BASELINE (Stage 1 only) gate, PROPOSED by Internal R&D (docs/internal-rd/benchmark-protocol.md section 4).
 * Separate from gateOne on purpose: gateOne fails closed without Stages 2-3, which would make the baseline meaningless.
 * Rule: unlock iff >= min_shown_observations shown_on_screen observations at >= min_observation_confidence.
 * Spoken-only tags never unlock. Extractor failure => insufficient_evidence.
 */
export function gateStage1Only(claims: Claim[], s1: StageResult<Stage1Output>, t: GateThresholds = DEFAULT_THRESHOLDS): GatedClaim[] {
  return claims.map((claim) => {
    const limitations = [...STANDARD_LIMITATIONS, "BASELINE mode (PROPOSED rule): Stage 1 only, no Challenger, no Rubric Gate."];
    const observations = Array.isArray(s1.data?.observations) ? s1.data!.observations.filter((o) => o?.claim_ids?.includes(claim.id)) : [];
    const base = { claim, observations, challenger: null, probability: null, limitations };
    const f1 = stageFailure("Extractor", s1);
    if (f1) return { ...base, state: "insufficient_evidence" as const, reasons: [f1, "Never unlock on failure."] };
    const shown = observations.filter((o) => o.modality === "shown_on_screen" && (clamp01(o.confidence) ?? 0) >= t.min_observation_confidence);
    return shown.length >= t.min_shown_observations
      ? { ...base, state: "supported" as const, reasons: [`BASELINE: ${shown.length} on-screen observation(s) >= ${t.min_observation_confidence}.`] }
      : { ...base, state: "insufficient_evidence" as const, reasons: ["BASELINE: no qualifying on-screen observation."] };
  });
}
