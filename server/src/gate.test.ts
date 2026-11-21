import { describe, expect, it } from "vitest";
import { gateClaims, gateOne, ruleBasedRubric, DEFAULT_THRESHOLDS } from "./gate.js";
import { parseModelJson, validateStage1, validateStage2 } from "./json.js";
import { withTimeout, StageTimeout } from "./timeout.js";
import { loadFixtures, replayFixture } from "./replay.js";
import type { Claim, Stage1Output, Stage2Output, Stage3Output, StageResult } from "../../shared/types.js";

const claim: Claim = { id: "c1", text: "SQL" };
const ok = <T>(data: T): StageResult<T> => ({ ok: true, data, model: "test", latencyMs: 1 });
const fail = <T>(error: string, timedOut = false): StageResult<T> => ({ ok: false, error, timedOut, model: "test", latencyMs: 1 });

const s1Shown: Stage1Output = {
  summary: "",
  observations: [{ t_start: 1, t_end: 5, description: "writes SQL", modality: "shown_on_screen", claim_ids: ["c1"], confidence: 0.9 }],
};
const s1Said: Stage1Output = {
  summary: "",
  observations: [{ t_start: 1, t_end: 5, description: "says SQL", modality: "only_said_aloud", claim_ids: ["c1"], confidence: 0.99 }],
};
const s2Clean: Stage2Output = { overall_notes: "", per_claim: [{ claim_id: "c1", contradictions: [], unsupported: false, missing_visual_proof: [], uncertainty: "" }] };
const s2Flag: Stage2Output = { overall_notes: "", per_claim: [{ claim_id: "c1", contradictions: [], unsupported: true, missing_visual_proof: ["code"], uncertainty: "" }] };
const s2Contra: Stage2Output = { overall_notes: "", per_claim: [{ claim_id: "c1", contradictions: ["fails on screen"], unsupported: true, missing_visual_proof: [], uncertainty: "" }] };
const s3 = (p: number, answer: "yes" | "no" = p >= 0.5 ? "yes" : "no"): Stage3Output => ({
  source: "decisions_api",
  per_claim: [{ claim_id: "c1", answer, probability: p }],
  rubric: { problem_discovery: 1, technical_communication: 1, workflow_execution: 1 },
});

describe("deterministic gate", () => {
  it("supports only with full positive chain", () => {
    expect(gateOne(claim, ok(s1Shown), ok(s2Clean), ok(s3(0.9))).state).toBe("supported");
  });
  it("said-aloud-only claim stays locked (signature moment)", () => {
    const g = gateOne(claim, ok(s1Said), ok(s2Flag), ok(s3(0.07)));
    expect(g.state).toBe("insufficient_evidence");
    expect(g.reasons.join(" ")).toMatch(/only said aloud/);
  });
  it("said-aloud-only stays locked even if rubric says yes", () => {
    expect(gateOne(claim, ok(s1Said), ok(s2Clean), ok(s3(0.95))).state).toBe("insufficient_evidence");
  });
  it("Extractor timeout => insufficient_evidence", () => {
    expect(gateOne(claim, fail("Stage exceeded 45000 ms timeout", true), ok(s2Clean), ok(s3(0.9))).state).toBe("insufficient_evidence");
  });
  it("Challenger timeout => insufficient_evidence even with strong rubric", () => {
    const g = gateOne(claim, ok(s1Shown), fail("timeout", true), ok(s3(0.99)));
    expect(g.state).toBe("insufficient_evidence");
    expect(g.reasons[0]).toMatch(/timed out/);
  });
  it("Rubric failure => insufficient_evidence", () => {
    expect(gateOne(claim, ok(s1Shown), ok(s2Clean), fail("500")).state).toBe("insufficient_evidence");
  });
  it("low probability => insufficient_evidence", () => {
    expect(gateOne(claim, ok(s1Shown), ok(s2Clean), ok(s3(0.69, "yes"))).state).toBe("insufficient_evidence");
  });
  it("threshold boundary is inclusive", () => {
    expect(gateOne(claim, ok(s1Shown), ok(s2Clean), ok(s3(0.7, "yes"))).state).toBe("supported");
  });
  it("low observation confidence => insufficient_evidence", () => {
    const low: Stage1Output = { summary: "", observations: [{ ...s1Shown.observations[0], confidence: 0.4 }] };
    expect(gateOne(claim, ok(low), ok(s2Clean), ok(s3(0.9))).state).toBe("insufficient_evidence");
  });
  it("contradiction => contradicted", () => {
    expect(gateOne(claim, ok(s1Shown), ok(s2Contra), ok(s3(0.9))).state).toBe("contradicted");
  });
  it("missing challenger note => insufficient_evidence", () => {
    expect(gateOne(claim, ok(s1Shown), ok({ overall_notes: "", per_claim: [] }), ok(s3(0.9))).state).toBe("insufficient_evidence");
  });
  it("malformed probability (NaN / string) => insufficient_evidence", () => {
    const bad = { ...s3(0.9), per_claim: [{ claim_id: "c1", answer: "yes", probability: Number.NaN }] } as Stage3Output;
    expect(gateOne(claim, ok(s1Shown), ok(s2Clean), ok(bad)).state).toBe("insufficient_evidence");
    const bad2 = { ...s3(0.9), per_claim: [{ claim_id: "c1", answer: "yes", probability: "0.9" }] } as unknown as Stage3Output;
    expect(gateOne(claim, ok(s1Shown), ok(s2Clean), ok(bad2)).state).toBe("insufficient_evidence");
  });
  it("ok:true but data missing => insufficient_evidence", () => {
    expect(gateOne(claim, { ok: true, model: "t", latencyMs: 1 }, ok(s2Clean), ok(s3(0.9))).state).toBe("insufficient_evidence");
  });
  it("support threshold stays below noul max of 0.99", () => {
    expect(DEFAULT_THRESHOLDS.support_probability).toBeLessThan(0.99);
  });
});

describe("rule-based fallback", () => {
  it("supports shown + unchallenged, rejects said-only, and is labeled", () => {
    const claims = [claim, { id: "c2", text: "Python" }];
    const s1: Stage1Output = { summary: "", observations: [...s1Shown.observations, { ...s1Said.observations[0], claim_ids: ["c2"] }] };
    const s2: Stage2Output = { overall_notes: "", per_claim: [s2Clean.per_claim[0], { ...s2Flag.per_claim[0], claim_id: "c2" }] };
    const r = ruleBasedRubric(claims, s1, s2, "decisions.create 404");
    expect(r.source).toBe("rule_based_fallback");
    expect(r.fallback_reason).toBe("decisions.create 404");
    const g = gateClaims(claims, ok(s1), ok(s2), ok(r));
    expect(g.map((x) => x.state)).toEqual(["supported", "insufficient_evidence"]);
    expect(g[0].limitations.join(" ")).toMatch(/rule-based fallback/);
  });
});

describe("JSON parsing", () => {
  it("rejects malformed JSON", () => {
    expect(() => parseModelJson("{not json")).toThrow(/Malformed JSON/);
    expect(() => parseModelJson("")).toThrow(/Malformed JSON/);
  });
  it("accepts fenced JSON", () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("validates stage shapes", () => {
    expect(() => validateStage1({ observations: [{ t_start: "x" }] })).toThrow();
    expect(() => validateStage1({ observations: [{ ...s1Shown.observations[0], modality: "vibes" }] })).toThrow(/modality/);
    expect(validateStage1(s1Shown).observations).toHaveLength(1);
    expect(() => validateStage2({ per_claim: [{ claim_id: "c1" }] })).toThrow();
  });
});

describe("timeout", () => {
  it("rejects slow promises with StageTimeout", async () => {
    await expect(withTimeout(new Promise((r) => setTimeout(r, 200)), 20)).rejects.toBeInstanceOf(StageTimeout);
  });
});

describe("SAMPLE fixtures replay through the real gate", () => {
  const fx = loadFixtures();
  it("has the 4 required benchmark cases", () => expect(fx.filter((f) => f.benchmark).length).toBe(4));
  for (const f of fx) {
    it(`${f.id} matches its expected states and is labeled SAMPLE`, () => {
      const r = replayFixture(f, DEFAULT_THRESHOLDS);
      expect(r.runKind).toBe("sample_fixture");
      expect(r.label).toMatch(/SAMPLE/);
      expect(r.stages.extractor.model).toBe("SAMPLE fixture");
      for (const g of r.gated) expect(g.state).toBe(f.expected[g.claim.id]);
    });
  }
});

import { gateStage1Only } from "./gate.js";
describe("decision confidence + baseline", () => {
  it("low Decisions confidence => insufficient_evidence even with high noul", () => {
    const s = s3(0.9);
    s.per_claim[0].confidence = 0.4;
    expect(gateOne(claim, ok(s1Shown), ok(s2Clean), ok(s)).state).toBe("insufficient_evidence");
  });
  it("noul 0.6 (display 'yes') still locks below 0.7", () => {
    expect(gateOne(claim, ok(s1Shown), ok(s2Clean), ok(s3(0.6))).state).toBe("insufficient_evidence");
  });
  it("baseline unlocks on-screen evidence without stages 2-3", () => {
    expect(gateStage1Only([claim], ok(s1Shown))[0].state).toBe("supported");
  });
  it("baseline never unlocks said-aloud-only", () => {
    expect(gateStage1Only([claim], ok(s1Said))[0].state).toBe("insufficient_evidence");
  });
  it("baseline fails closed on Extractor failure", () => {
    expect(gateStage1Only([claim], fail("timeout", true))[0].state).toBe("insufficient_evidence");
  });
});
