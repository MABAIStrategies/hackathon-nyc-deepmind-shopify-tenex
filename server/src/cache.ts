// Local JSON cache: { videoHash -> fileUri, stage outputs }. Lets the live demo replay a REAL cached run if wifi dies.
import fs from "node:fs";
import crypto from "node:crypto";
import { CACHE_FILE, DATA_DIR } from "./config.js";
import type { AnalyzeResponse } from "../../shared/types.js";

interface CacheEntry {
  fileUri?: string;
  mimeType?: string;
  runs: Record<string, AnalyzeResponse>; // keyed by claimsKey
}
type Cache = Record<string, CacheEntry>;

function load(): Cache {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}
function save(c: Cache) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(c, null, 2));
}
export function hashFile(p: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}
export const claimsKey = (claims: { id: string; text: string }[]) =>
  crypto.createHash("sha1").update(JSON.stringify(claims.map((c) => [c.id, c.text.trim().toLowerCase()]))).digest("hex").slice(0, 12);

export function getFileUri(hash: string) {
  const e = load()[hash];
  return e?.fileUri ? { uri: e.fileUri, mimeType: e.mimeType ?? "video/mp4" } : null;
}
export function putFileUri(hash: string, uri: string, mimeType: string) {
  const c = load();
  c[hash] = { ...(c[hash] ?? { runs: {} }), fileUri: uri, mimeType };
  save(c);
}
export function getRun(hash: string, key: string): AnalyzeResponse | null {
  return load()[hash]?.runs?.[key] ?? null;
}
export function putRun(hash: string, key: string, run: AnalyzeResponse) {
  const c = load();
  c[hash] = { ...(c[hash] ?? { runs: {} }) };
  c[hash].runs = { ...(c[hash].runs ?? {}), [key]: run };
  save(c);
}
export function listRuns(): AnalyzeResponse[] {
  return Object.values(load()).flatMap((e) => Object.values(e.runs ?? {}));
}
