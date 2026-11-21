# My Player: QA checklist (Operations), FINAL
**Build tested:** commit `d3540a4` (committed 3:44:49 PM ET, "QA fixes: contradicted + rule-based-fallback SAMPLE fixtures…"), the build named in `QA-FIXES-READY.txt` (3:44 PM ET).
**QA run:** 3:45 to 3:50 PM ET, Nov 21 2026, on the shared box, with **no GEMINI_API_KEY set anywhere** (offline replay).
**Tested in:** (a) a working-tree copy at `/tmp/myplayer-qa/copy`; (b) a clean `git archive HEAD` with a fresh `npm ci` at `/tmp/myplayer-qa/cleaninstall`; (c) Engineering's running `npm run replay` at http://localhost:5173 (read-only browsing). Nothing in `my-player/` was edited.
**Honesty:** every result here is an offline result on SAMPLE fixtures. No live Gemini call was made by QA. Live items are marked N/A-LAPTOP.

**Summary (51 checks): 48 PASS (F1, F2 pass in replay; their live half is N/A-LAPTOP) · 0 FAIL · 3 N/A-LAPTOP (C7, F3, G6) · 0 blockers.** Every phase-1 issue is fixed and re-verified (section I).

Legend: PASS · FAIL · N/A-LAPTOP (only checkable on Mark's laptop with his key)

## A. Repo & secrets
| # | Check | Result |
|---|---|---|
| A1 | `.gitignore` ignores .env / .env.* (keeps .env.example), node_modules, dist, data/cache.json, data/uploads | PASS (`git check-ignore -v .env` matches .gitignore:2) |
| A2 | No `.env` in repo; `.env.example` has an empty `GEMINI_API_KEY=` | PASS |
| A3 | Spec's raw pre-push check (`git grep -n` for the Google key prefix) on the real repo | PASS (no output, exit 1) |
| A4 | Engineering `npm run secret-scan` on the real repo | PASS ("secret-scan: PASS…", exit 0). Phase 1: aborted a staged planted fake key with exit 1; plant deleted |
| A5 | Pre-push hook wired (`.githooks/pre-push` runs secret-scan.sh; `core.hooksPath=.githooks` in this repo) | PASS (Mark must run `npm run hooks` once after cloning or unzipping) |
| A6 | Operations independent scan `qa_secret_scan.sh` on the real repo (key pattern, private keys, generic secret assignments, GEMINI_API_KEY with a value, .env present/tracked/ignored, prefix search, git history) | PASS (RESULT: CLEAN, 9/9). Scanner self-tested on planted keys, incl. one removed from history; plants deleted |
| A7 | Key never reaches the browser (no `VITE_*KEY`; web/ only names the variable in help text) | PASS |
| A8 | Stale Ops copies (`docs/operations/*`, `scripts/qa_secret_scan.sh`) refreshed and free of the raw key prefix | PASS (identical to handoff copies at 3:45; 0 prefix hits) |

## B. Startup with NO key (Rule Zero must fail gracefully)
| # | Check | Result |
|---|---|---|
| B1 | Starts without a key: mode=replay, no crash (`npm start`, `npm run replay`) | PASS |
| B2 | Startup log prints the SDK version | PASS ("@google/genai version: 3.6.1", now in replay mode too) |
| B3 | No key means no model listing and no network; clear log line | PASS ("SAMPLE fixtures only. No model calls, no network.") |
| B4 | Smoke never reported OK without a key (`smoke: []`, `decisionsApi: "untested"`) | PASS |
| B5 | `/api/health`: keyPresent false, mode replay, modeLabel "OFFLINE REPLAY: SAMPLE / not a live model run" | PASS |
| B6 | Zero non-local network requests during the full click-through | PASS (0) |
| B7 | `npm run smoke` with no key exits 1 with a clear message, not a stack trace | PASS |
| B8 | Upload/analyze with no key is refused, not faked | PASS (`POST /api/analyze` returns 409 "uploaded videos are NOT analyzed") |
| B9 | PROVENANCE.md marks live calls and model ids NOT RUN / unverified | PASS |

## C. Offline replay & honesty labels
| # | Check | Result |
|---|---|---|
| C1 | All 7 fixtures labeled hand-authored SAMPLE; banner "SAMPLE / not a live model run" on every tab | PASS |
| C2 | runKind sample_fixture, latencyMs null; stages show "— ms" | PASS |
| C3 | Stage badges read "SAMPLE fixture" (no Gemini id shown as if it ran) | PASS |
| C4 | No fixture claims a Decisions API source; drawer says "(SAMPLE fixture, not a Decisions API result)" | PASS (0 fixtures with `decisions_api`) |
| C5 | Fallback label "Rule-based fallback, Decisions API unavailable" + "SAMPLE · FALLBACK" badge | PASS (demo7 fixture) |
| C6 | Benchmark tab says "n=4, illustrative, not statistically meaningful"; no numbers without a real run | PASS |
| C7 | Cached live replay labeled "CACHED real run from <time>" | N/A-LAPTOP |

## D. Node states: all 5 rendered on real nodes in the Signature tab
| # | State | Where seen | Result |
|---|---|---|---|
| D1 | `unverified` | every case before Run, and right after a case switch | PASS |
| D2 | `evidence_pending` | every case about 150 ms after Run (selector disabled while running) | PASS |
| D3 | `supported` | case1, case2 claim A, case4, demo7 | PASS |
| D4 | `insufficient_evidence` | case2 claim B (said aloud only), case3, demo5 (Challenger timeout), demo6 claim B | PASS |
| D5 | `contradicted` | demo6 claim A ("Draft, not submitted" on screen) | PASS |
| D6 | Signature moment: claim A UNLOCKED next to claim B LOCKED (P(yes) 0.88 vs 0.06, threshold 0.70) | case2 | PASS |
| D7 | Never unlock on failure (Challenger timeout gives insufficient_evidence; gate tests cover timeout, malformed and low-confidence) | demo5 + tests | PASS |
| D8 | Case switch resets nodes to `unverified` with the new case's claims and video | case2 then case1 (`qa-screenshots/fix2_switch_reset.png`) | PASS |

## E. Evidence drawer (9 of 9 drawers opened across 7 cases)
| # | Check | Result |
|---|---|---|
| E1 | Opens from every node, locked and unlocked; Esc closes it | PASS |
| E2 | Timestamped observations with modality | PASS (9/9) |
| E3 | Clicking a timestamp seeks the video (e.g. 0:00 to 26.37 s on "▶ 0:26.0–0:28.8") | PASS (9/9) |
| E4 | Challenger notes | PASS (9/9) |
| E5 | Rubric P(yes) bar + value vs 0.70 threshold | PASS (9/9) |
| E6 | Limitations listed | PASS (9/9) |

## F. Model id & latency display
| # | Check | Result |
|---|---|---|
| F1 | Badge shows the model that actually ran (replay: "SAMPLE fixture") | PASS (replay) / N/A-LAPTOP (live ids) |
| F2 | Real latency ms per stage (replay: "— ms") | PASS (replay) / N/A-LAPTOP (live) |
| F3 | Substitutions shown when a planned model id is missing | N/A-LAPTOP |

## G. Tests, build, benchmark
| # | Check | Result |
|---|---|---|
| G1 | `npm test`: 36/36 (32 gate/fixture + 4 mocked live-wiring); the "403 decisions not enabled" line is a mocked test, not a network call | PASS (copy and clean install) |
| G2 | `npm run typecheck` | PASS (exit 0) |
| G3 | `npm run build` | PASS (copy and clean install) |
| G4 | Clean `npm ci` from `git archive HEAD` (Node 24.22.1) | PASS (exit 0; npm warns that esbuild install scripts were skipped, but build and dev still work) |
| G5 | `npm run bench` offline writes results labeled SAMPLE / "NOT a model benchmark" | PASS (phase 1) |
| G6 | Live benchmark counts | N/A-LAPTOP |

## H. Hygiene
| # | Check | Result |
|---|---|---|
| H1 | Browser console errors | PASS (0, on all 3 runs) |
| H2 | Palette and contrast; no glassmorphism | PASS (screenshot spot-check) |
| H3 | No hiring, biometric or personality wording; footer disclaimer present | PASS |
| H4 | 390 px: no horizontal overflow (scrollWidth 390 = viewport, 0 elements past the edge); single-column cards | PASS (`qa-screenshots/fix5_mobile390.png`) |

## I. Phase-1 issues: all fixed
| Issue | Status |
|---|---|
| `contradicted` not reachable offline | FIXED (demo6) |
| Stale nodes after case switch | FIXED (reset + selector locked while running) |
| Fallback label never exercised | FIXED (demo7) |
| Fixtures claimed `decisions_api` | FIXED (now `sample_fixture`) |
| 390 px overflow | FIXED |
| SDK version missing from replay log | FIXED |
| Ops copies held the raw key prefix | FIXED |

## Still open (non-blocking)
1. `QA-FIXES-READY.txt` is committed at the repo root. It's harmless, but it's internal chatter; consider deleting it before the zip or submission.
2. On npm 11, `npm ci` warns that esbuild's install script was skipped. The build worked here anyway. RUN-ON-LAPTOP.md already gives the fix (`npm rebuild esbuild`) if Vite errors.
3. Live mode (model list, smoke latency, Files upload, 3 stages, Decisions API, LIVE banner) could not be tested by QA by design, because there's no key on the box. It's verified only by mocked tests. Mark must do step 4 below before the demo.
4. Box-only: something on the shared box killed QA's server on port 8797 twice in phase 1. This isn't a product bug.

## Run on Mark's laptop in 5 steps (verified offline on the box at 3:48 PM ET; live parts are Mark's to confirm)
1. **Install:** `cd my-player && npm ci` (Node 20+; tested with Node 24.22.1). If Vite later errors about esbuild, run `npm rebuild esbuild`. Then run `npm run hooks` once, so the pre-push secret scan is enforced.
2. **Offline check first (no key):** `npm run replay`, then open http://localhost:5173. The top banner must read **"SAMPLE / not a live model run · OFFLINE REPLAY"**. In "Signature moment", click **Run SAMPLE replay** and confirm claim A unlocks while claim B stays LOCKED, then click "Why is this locked?". Stop with Ctrl+C.
3. **Add your key yourself (backend only):** `cp .env.example .env`, then open `.env` in an editor and put your key after `GEMINI_API_KEY=`. Nobody else writes it; `.env` is gitignored and never commit it.
4. **Smoke test:** `npm run smoke`. It must print the SDK version, the model ids your key can see, `decisionsApi` status and any substitutions. If it says "No GEMINI_API_KEY in .env", step 3 didn't save. If a planned model is missing, note the substitution it reports (it's also recorded in PROVENANCE.md).
5. **Start live and check the indicator:** `npm run dev`, then open http://localhost:5173. The banner must now read **"● LIVE real Gemini calls from this laptop's backend"**, with the SDK version, and stage badges must show real model ids and ms after a run. If it still says SAMPLE, the backend didn't see the key: re-check step 3, and make sure `MY_PLAYER_MODE=replay` isn't set. Before any `git push`, `npm run secret-scan` must print PASS.

Single-port alternative (verified offline): `npm run build && npm start`, then open http://localhost:8787. Add `MY_PLAYER_MODE=replay` in front to force SAMPLE mode even with a key.

## QA tooling & evidence (handoff/operations/)
- `qa_secret_scan.sh`: independent scan, `./qa_secret_scan.sh <repo>`, exits 0 when clean.
- `qa_flow.mjs`: full click-through for every case, every drawer and timestamp seeking (playwright-core + /usr/bin/google-chrome; harness in /tmp/myplayer-qa/harness).
- `fix_checks.mjs`: targeted checks for case-switch reset, fallback label, sample_fixture note, Esc, and 390 px.
- `qa_clickthrough.mjs`: generic smoke click-through (states, labels, external requests, console errors).
- `qa-screenshots/`: about 25 PNGs + `flow_result.json` from the 3:45 run.
