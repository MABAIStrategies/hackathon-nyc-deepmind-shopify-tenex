// Strict-ish JSON parsing + shape validation. Malformed output => throws => stage fails => gate abstains.
import type { Stage1Output, Stage2Output } from "../../shared/types.js";

export function parseModelJson(text: string | undefined | null): unknown {
  if (!text) throw new Error("Malformed JSON: empty model response");
  let t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch (e) {
    throw new Error(`Malformed JSON: ${(e as Error).message}`);
  }
}

const isNum = (n: unknown) => typeof n === "number" && Number.isFinite(n);
const isStr = (s: unknown) => typeof s === "string";

export function validateStage1(j: unknown): Stage1Output {
  const o = j as Stage1Output;
  if (!o || !Array.isArray(o.observations)) throw new Error("Malformed JSON: observations[] missing");
  for (const ob of o.observations) {
    if (!isNum(ob.t_start) || !isNum(ob.t_end) || !isStr(ob.description) || !Array.isArray(ob.claim_ids) || !isNum(ob.confidence))
      throw new Error("Malformed JSON: observation has wrong shape");
    if (ob.modality !== "shown_on_screen" && ob.modality !== "only_said_aloud")
      throw new Error(`Malformed JSON: bad modality ${String(ob.modality)}`);
  }
  return { observations: o.observations, summary: isStr(o.summary) ? o.summary : "" };
}

export function validateStage2(j: unknown): Stage2Output {
  const o = j as Stage2Output;
  if (!o || !Array.isArray(o.per_claim)) throw new Error("Malformed JSON: per_claim[] missing");
  for (const c of o.per_claim) {
    if (!isStr(c.claim_id) || typeof c.unsupported !== "boolean" || !Array.isArray(c.contradictions) || !Array.isArray(c.missing_visual_proof))
      throw new Error("Malformed JSON: challenger note has wrong shape");
  }
  return { per_claim: o.per_claim, overall_notes: isStr(o.overall_notes) ? o.overall_notes : "" };
}
