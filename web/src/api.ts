import type { AnalyzeResponse, HealthResponse } from "../../shared/types";

export async function getHealth(): Promise<HealthResponse> {
  const r = await fetch("/api/health");
  if (!r.ok) throw new Error(`health ${r.status}`);
  return r.json();
}
export async function replay(caseId: string): Promise<AnalyzeResponse> {
  const r = await fetch(`/api/replay/${encodeURIComponent(caseId)}`);
  if (!r.ok) throw new Error((await r.json()).error ?? `replay ${r.status}`);
  return r.json();
}
export async function analyzeLive(video: File, claims: { id: string; text: string }[]): Promise<AnalyzeResponse> {
  const fd = new FormData();
  fd.append("video", video);
  fd.append("claims", JSON.stringify(claims));
  const r = await fetch("/api/analyze", { method: "POST", body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `analyze ${r.status}`);
  return j;
}
export async function getBench(): Promise<unknown> {
  const r = await fetch("/api/bench");
  return r.json();
}
export async function listCachedRuns(): Promise<AnalyzeResponse[]> {
  const r = await fetch("/api/runs");
  return r.ok ? r.json() : [];
}
