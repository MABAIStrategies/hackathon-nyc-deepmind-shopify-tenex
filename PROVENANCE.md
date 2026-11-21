# PROVENANCE: what ran, what didn't, where every piece came from

Honesty rule: if it didn't run, this file says so. Times are ET.

## Build-machine status (Engineering, Nov 21 2026, ~3:20-4:20 PM ET)

| Item | Status | Evidence |
|---|---|---|
| `@google/genai` | **3.6.1 installed** (pinned `^3.6.1`) | `node_modules/@google/genai/package.json`; type-checked against its typings |
| `ai.interactions`, `ai.decisions`, `ai.files`, `ai.models` | **Exist in the 3.6.1 SDK object** (checked locally without a key or network call) | getters on `GoogleGenAI` prototype; `Decisions.create(body)` typing |
| Live Gemini calls (models.list, smoke, Files upload, 3 stages, Decisions) | **NOT RUN.** No key on the build machine by design | runs on Mark's laptop; results auto-appended below |
| Model ids `gemini-4-neon`, `gemini-4-carbon`, `gemini-4-hydrogen`, `gemini-decision-1` | **Unverified planned ids.** Docs-verified by External R&D, not run-verified | `docs/external-rd/sdk-facts.md` |
| Interactions request shape (`input` video part, `generation_config.thinking_level`, `response_format`) | Docs-verified (External R&D), **not run-verified** | `server/src/gemini.ts` `callJson` |
| Decisions request shape (`model:"gemini-decision-1"`, `api_version:"v1beta"`, `noul`/`score` questions) | Docs-verified + matches SDK typings, **not run-verified** | `server/src/gemini.ts` `stage3` |
| Deterministic gate + baseline gate | **Run-verified**: 32 unit tests pass (incl. all 7 SAMPLE fixtures through the gate) | `npm test` (server/src/gate.test.ts) |
| Live pipeline wiring | **Run-verified against a MOCKED SDK only** (4 tests): model substitution, Interactions call shape, `thinking_level` in `generation_config`, Decisions `gemini-decision-1` + `v1beta`, generateContent fallback on 404, rule-based fallback on Decisions failure, malformed JSON fails closed. Does NOT prove the real API accepts these shapes | `server/src/live-wiring.test.ts` |
| Typecheck | **Pass** (`tsc --noEmit`) | `npm run typecheck` |
| Frontend build | **Pass** (vite 6.4.6) | `npm run build` |
| Server in replay mode | **Run-verified** with curl: `/api/health`, `/api/replay/*` (all 5 cases), `/api/analyze` (returns 409 in replay), `/api/bench`, samples served | see report |
| Browser click-through | **Not run by Engineering** (no browser on the build box; memory-constrained). Operations QA: see `docs/operations/` |
| Benchmark | **NOT RUN live.** Runner verified in replay mode only (circular, not reported) | `bench/run-bench.ts` |
| Secret scan | **Pass** on the committed tree | `npm run secret-scan` |

## Live-mode behavior (Rule Zero) on startup
1. Prints the installed `@google/genai` version.
2. `ai.models.list()` and prints every model id the key can see.
3. Picks each stage's model by chain: Extractor `gemini-4-neon -> gemini-4-hydrogen -> gemini-3.8-flash -> gemini-3.6-flash -> gemini-3.5-flash-lite`; Challenger `gemini-4-carbon -> gemini-4-argon -> (same chain)`; otherwise closest listed Gemini model. Every substitution is recorded.
4. Smoke-tests each chosen text model (1-line prompt) and `ai.decisions.create` (trivial noul question), printing status, latency ms and exact errors.
5. If Decisions fails: Stage 3 uses the deterministic rule-based fallback, labeled "Rule-based fallback, Decisions API unavailable", with the exact error in the drawer.
6. Writes `data/provenance-live.json` and appends a "Live startup check" section below.
Note: the directive's 5-second-video smoke test happens on the first real analyze (Files API upload + Stage 1), whose model id and latency show on the badges.

## SAMPLE material (never presented as model output)
- `fixtures/cases/*.json`: **hand-authored by Engineering** from Delivery's `labels.json`. Timestamps come from the labels; observation text, probabilities and confidences are illustrative placeholders. Badges show "SAMPLE fixture" and "— ms". The gate that runs on them is real.
- `demo5-challenger-timeout`: a simulated Stage 2 timeout to demonstrate fail-closed behavior. `demo6-contradicted`: shows the contradicted state on the case3 video. `demo7-rule-based-fallback`: simulated Decisions outage showing the labeled fallback drawer. None of these is a benchmark case. Hand-authored fixtures use rubric `source: "sample_fixture"`, never `decisions_api`.
- `web/public/samples/*.mp4`: Delivery's synthetic SAMPLE screen recordings, local Kokoro TTS narration, SAMPLE badge burned into every frame. Narration speech check (STT) was **not run** (memory).

## Handoff sources
| Dept | Used for | Status |
|---|---|---|
| External R&D | SDK version, method shapes, model ids, fallback chain | Integrated (docs-verified, not run-verified) |
| Creative | tokens.css, node SVGs, wordmark, fonts, badge classes | Integrated |
| Delivery | 4 SAMPLE videos + labels.json (benchmark ground truth) | Integrated |
| Marketing | README narrative, demo script, 60 s video script, submission text | Integrated (README + docs/marketing) |
| Internal R&D | PROPOSED thresholds, baseline rule, benchmark protocol | Integrated (docs/internal-rd) |
| Sales | Judge Q&A | Copied to docs/sales |
| Operations | QA checklist, secret scan, click-through script | Copied to docs/operations + scripts/ |

## Live run log (auto-appended by the app on Mark's laptop)

## Player card photo and name (added 4:40 PM ET)
- `web/public/player/mark-bockrath.jpg`: Mark Bockrath's own headshot (from mark-bockrath.com, consented by Mark). Resized to 600x769 JPEG (56 KB) from `handoff/headshot/bockrath.png`.
- The player card shows the name "Mark Bockrath". The claims, videos, observations and probabilities shown in replay remain hand-authored SAMPLE fixtures, not a model run about Mark. The SAMPLE videos use a synthetic narrator, not Mark.
