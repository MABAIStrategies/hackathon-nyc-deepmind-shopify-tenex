# Honest benchmark protocol

A 30-minute procedure for Mark to run on his laptop. It compares **Stage 1 alone** (baseline) with the **full 3-stage pipeline** on Delivery's four cases. Write the expected outcomes **before** you run the models. Fill in the blank count tables from live runs only.

This is a protocol, not a result. Every numeric cell below is blank on purpose. Offline replay fixtures are **SAMPLE / not a live model run** and must never be entered as results.

**Spec source:** `my-player-directive-v2.md` (BENCHMARK and RULE ZERO) and `TEAM-BRIEF.md`. Peeked Engineering's in-progress `my-player/` around 3:25 PM ET (read-only). Delivery's `handoff/delivery/labels.json` was **not present** at that time.

---

## 1. What this can and cannot prove

The spec says, with 4 cases, to say **"n=4, illustrative, not statistically meaningful."** Report raw counts, not percentages. Four short videos can show that the signature lock works, or that it fails, on those videos. They cannot prove the product works in general.

Compare two modes on the same four videos, same claims, same machine:

- **Stage 1 only (baseline):** the extractor runs; Stages 2 and 3 do not get a vote. Unlock rule for this mode is in section 4 (PROPOSED, because the spec asks for the comparison but does not define the baseline rule).
- **All 3 stages:** extractor + challenger + rubric gate, then the deterministic gate.

---

## 2. Pre-register expected outcomes BEFORE any live run

Do this first, on paper or in the "Pre-registered expectations" table below. Do not change the expected outcomes after you have seen model output.

**If `handoff/delivery/labels.json` (or the same file inside `my-player/`) is present, use that as the source of case ids, claim text, and expected node states.** Copy those values into the table. That file is the case list of record once it exists.

**Video files (present at 3:28 PM ET, still no `labels.json`):**

- `/workspace/hackathon/gemini4-nyc/handoff/delivery/case1-clear-pass.mp4`
- `/workspace/hackathon/gemini4-nyc/handoff/delivery/case2-unsupported-claim.mp4`
- `/workspace/hackathon/gemini4-nyc/handoff/delivery/case3-partial-completion.mp4`
- `/workspace/hackathon/gemini4-nyc/handoff/delivery/case4-unseen-holdout.mp4`

These four videos are **SAMPLE synthetic footage** (each opens by saying so), not a real person or client. That SAMPLE label is about the footage. A live model run on them still counts as a live result. What does *not* count is the app's offline replay of fixture JSON labeled `SAMPLE / not a live model run`.

**If `labels.json` is still missing, use the case ids above, the directions from the team brief, and the claim wording inferred below from Delivery's sample scripts.** Those inferred claims are **not** an official labels file. Replace them if `labels.json` differs. Do not invent further claims.

| Case id (use these names in the counts table) | Source of expectation | Pre-registered direction and inferred claims (replace if labels.json differs) |
| --- | --- | --- |
| `case1-clear-pass` | Team brief: "clear pass." Claims inferred from Delivery's `case1-clear-pass` script, **not** from labels.json. | Inferred claim: "I can write a spreadsheet formula that totals a column." The sample video is built to show the formula and the total on screen. Expected: that claim → `supported`. |
| `case2-unsupported-claim` (signature moment) | Team brief: "says a skill aloud, never shows it." Spec: that claim "stays visibly LOCKED"; "A second claim that IS shown unlocks, side by side." Claims inferred from Delivery's script and `generate_videos.py` comment ("form filled end to end, plus a spoken SQL claim that is never shown"). **Not** from labels.json. | Inferred claim A: "I can fill out a job entry form, end to end." If that work is on screen, expected → `supported`. Inferred claim B: "I also wrote the SQL query that powers this." Said aloud, never shown. Expected: **must not** be `supported` (locked, preferably `insufficient_evidence`). |
| `case3-partial-completion` | Team brief name only. Claim inferred from Delivery's `case3-partial-completion` script, **not** from labels.json. | Inferred claim: "I can complete a client intake form." The sample video is built so the person types the client name and job date, then stops: no hours, no submit. Expected: that "complete the form" claim stays **locked** (`insufficient_evidence`, not `supported`). If labels.json splits this into per-field claims, use those instead. |
| `case4-unseen-holdout` | Team brief: "unseen holdout." No expected outcome in the spec. I peeked at Delivery's file names and script while writing this protocol; I did **not** change any proposed gate number after that peek. | **Do not use this case to pick or adjust thresholds, then report it.** Copy claim text and expected states from labels.json when it arrives. If labels.json is still missing at run time, watch the video once, write the expected state for each claim, and only then run the model. Leave the cells below blank until that happens. |

Write the final claim wording and expected state (`supported` or locked) down before you start `npm run bench` or upload anything. If you cannot honestly pre-register a holdout expectation, do not score that case until you can.

---

## 3. Laptop setup (key stays on this machine)

The Gemini key lives only on Mark's laptop. Never paste it into chat, a ticket, a README, a screenshot, or anything under `handoff/`. Never commit it.

1. On the laptop, open the `my-player` repo (the zip or checkout Engineering delivers). Use Node 20 or newer.
2. Install: `cd my-player && npm ci`
3. Put the key in a local `.env` only. If Engineering shipped `.env.example`, copy it: `cp .env.example .env`. Then set one line, locally:

   `GEMINI_API_KEY=` (your key here, in that file only)

   Confirm `.env` is gitignored. Do not print the file. Do not type the key into a command line that will be copied into a log or a chat.
4. Confirm live mode, and write down the model ids the app actually reports at startup. Suggested order, from Engineering's current `package.json` and Operations' draft laptop steps (ports and flags may still change — prefer Engineering's README if it disagrees):

   - `npm run smoke` — should print the installed SDK version, the model ids the key can see, and a short smoke test. Copy the **model id that actually ran** for extractor, challenger, and rubric (the badge / startup table, not the planned names). If a name was substituted, write the substitute and treat that as the model that ran.
   - Then start the app with `npm run dev` if you need the UI, or go straight to the bench command in section 5.

5. Before counting anything, confirm the run is live. Engineering's current config switches to **replay** if the key is missing, even without `MY_PLAYER_MODE=replay`. Check the startup or `/api/health` output for `keyPresent: true` and `mode: "live"`. If it says replay, or if a result is labeled `SAMPLE / not a live model run` or `runKind: "sample_fixture"`, it is not a benchmark result.

6. Optional sanity check, not a result: `npm run replay` only to see the SAMPLE fixtures. Do not copy those counts into the tables.

---

## 4. What each mode means

**All 3 stages.** Upload (or point the runner at) the case video. Run Stage 1, Stage 2, and Stage 3, then the deterministic gate described in `gate-thresholds-rationale.md`. Record the model id and latency for each stage. A claim is scored from the final node state.

**Stage 1 only (baseline).** **PROPOSED definition, because the spec does not define it:** run only the extractor on the same video and claims. Then apply just the Stage 1 part of the gate: a claim may be counted as unlocked only if there is at least `min_shown_observations` (PROPOSED 1) observation tagged `shown_on_screen` at or above `min_observation_confidence` (PROPOSED 0.6). Spoken-only tags do not unlock. Do **not** invent a Stage 2 note or a Stage 3 yes just to reuse the full gate — Engineering's current `gateOne` function fails closed if Stage 2 or 3 is missing, so "skip later stages and call the same function" would lock every claim and make the baseline meaningless.

If Engineering's runner already implements a Stage-1-only mode, use that implementation and write one sentence here about what it actually did (so the table stays honest). If it differs from this proposed rule, do not hide the difference.

---

## 5. How to run (commands)

Engineering's `package.json` (peeked 3:23 PM ET) declares:

```bash
npm run bench
```

That maps to `tsx bench/run-bench.ts`. **The runner source file was not yet in the repo when I peeked**, and there was no Engineering README with flags. So:

- Use `npm run bench` if that is still the command when you run.
- If Engineering's README documents a different command or flags, use that instead:

  `<runner command from Engineering README>`

Point the runner at the four Delivery mp4s listed in section 2 (or the copies Engineering integrated into the repo). What the official live run needs, however it is invoked:

- Live mode, key present, no SAMPLE fixtures counted as results.
- The four Delivery cases, each in both modes (Stage 1 only, and all 3 stages).
- The model ids actually reported at startup, stored next to the counts.
- Output written to `bench/results.json` (the path the spec names), with a clear live vs SAMPLE label.

If the runner cannot yet do Stage 1 only vs all 3 stages in one go, run the two modes the way Engineering documents, or walk the four videos through the UI twice (once in a Stage-1-only setting, once full) and fill the tables by hand. Same pre-registered expectations either way.

**Repeats.** Models are not deterministic. If time allows, run **3 repeats** per case per mode and report each repeat, plus a median latency. In a 30-minute sitting that is usually too many live calls (see the time box below), so the **minimum is 1 run** per case per mode. If you only have time for extra repeats on one case, spend them on the signature case (unsupported claim). Do not average node states into a made-up "soft unlock."

**Time box (about 30 minutes):**

| Step | Budget |
| --- | --- |
| Install, `.env`, `npm run smoke`, copy model ids, confirm live mode | ~8 minutes |
| Copy or write pre-registered expectations (labels.json or a pre-run watch) | ~4 minutes |
| 4 cases × 2 modes × 1 live run | ~16 minutes (each video is short; each stage can take up to 45 seconds) |
| Fill the tables, including failures | ~2 minutes |
| Extra repeats | Only if the first 8 runs finished early |

If a stage times out at 45 seconds, that run still counts: record the error/abstention, do not silently retry until you like the answer. You may retry only when the failure was clearly your setup (no key, wrong folder, app not started). Note any retry in the notes column.

---

## 6. Metrics (score each claim, then add them up)

Score **per claim**, not just per video. A mixed video (the signature case, and likely partial completion) can have both a correct unlock and a correct refusal in the same run.

Write the expected state first. Then, from the final node state and whether the run finished honestly:

| Metric (plain name) | Spec's nearby name (BENCHMARK section) | Count it when |
| --- | --- | --- |
| Correctly unlocked | "correct support" | Expected `supported`, and the node is `supported`. |
| False unlock | "incorrect support" | Expected locked, but the node is `supported`. This is the error we weight hardest. |
| Correctly refused | "correct rejection" | Expected locked, and the node is `insufficient_evidence` or `contradicted`, **and** the run finished without a stage failure (no timeout, no malformed output, no crash, no missing stage). A real "we looked, and the evidence was not there" or "the video contradicts the claim." |
| False refusal | (not named separately in the spec) | Expected `supported`, but the node is `contradicted` or a completed `insufficient_evidence` (the system did finish, and said no or not enough). |
| Abstention | "abstention" | The node is not `supported` because the run did **not** finish a full honest decision: timeout, malformed JSON, missing stage output, or an API error. Locked-because-it-broke is **not** a correct refusal, even on a case you wanted locked. |
| Errors | "errors" | Upload failure, crash, runner exception, or a run that produced no scoreable node. If a failed run also abstains, count the error here and mark abstention too (do not also give it a correct-refusal point). |
| Per-stage latency | "median latency" | Milliseconds actually measured for Stage 1, Stage 2, and Stage 3 (and the gate if it is reported). Fixtures must not get a fake millisecond number. After all scoreable live runs, also write the median latency per stage, as the spec asks. |

Also record, for every run: case id, mode, repeat number, model ids (extractor / challenger / rubric, or "not run" in Stage 1 only), whether Stage 3 was the Decisions API or the labeled rule-based fallback, and the final state of each claim.

**Fallback runs.** If the drawer says `Rule-based fallback, Decisions API unavailable`, still fill the row, but mark the rubric source as fallback. Do not mix those rows into a Decisions API total as if they were the same experiment.

---

## 7. Real counts table (fill in by hand or from `bench/results.json`)

Blank on purpose. Add repeat rows ( `_r2`, `_r3`) only if you ran them. Case ids below match Delivery's video file names. Replace claim counts if labels.json disagrees. Put "—" where Stage 2 / Stage 3 did not run.

**Per run**

| Case | Mode | Repeat | Model ids (S1 / S2 / S3) | Rubric source (Decisions API / fallback / not run) | Claims (n) | Correctly unlocked | Correctly refused | False unlocks | False refusals | Abstentions | Errors | S1 ms | S2 ms | S3 ms | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| case1-clear-pass | Stage 1 only | 1 |  | not run |  |  |  |  |  |  |  |  | — | — |  |
| case1-clear-pass | All 3 stages | 1 |  |  |  |  |  |  |  |  |  |  |  |  |  |
| case2-unsupported-claim | Stage 1 only | 1 |  | not run |  |  |  |  |  |  |  |  | — | — |  |
| case2-unsupported-claim | All 3 stages | 1 |  |  |  |  |  |  |  |  |  |  |  |  |  |
| case3-partial-completion | Stage 1 only | 1 |  | not run |  |  |  |  |  |  |  |  | — | — |  |
| case3-partial-completion | All 3 stages | 1 |  |  |  |  |  |  |  |  |  |  |  |  |  |
| case4-unseen-holdout | Stage 1 only | 1 |  | not run |  |  |  |  |  |  |  |  | — | — |  |
| case4-unseen-holdout | All 3 stages | 1 |  |  |  |  |  |  |  |  |  |  |  |  |  |

**Summary (add the claim-level counts; still raw counts, no percentages)**

| Mode | Claims scored (n) | Correctly unlocked | Correctly refused | False unlocks | False refusals | Abstentions | Errors | Median S1 ms | Median S2 ms | Median S3 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Stage 1 only |  |  |  |  |  |  |  |  | — | — |
| All 3 stages |  |  |  |  |  |  |  |  |  |  |
| All 3 stages, holdout excluded (optional extra row if you tuned anything on the first three cases) |  |  |  |  |  |  |  |  |  |  |

Live model ids actually reported at startup (copy from the smoke test or health output):

- Extractor:
- Challenger:
- Rubric:
- SDK version:
- Decisions API (available / unavailable / untested):
- Any substitution (planned id → id that ran):

---

## 8. Honest reporting rules

1. **n=4 is tiny.** Say so, in the README and on the benchmark tab: "n=4, illustrative, not statistically meaningful."
2. **Raw counts only.** No percentages, no "accuracy," no made-up confidence intervals.
3. **Report failures.** Timeouts, malformed JSON, fallback, substitutions, and crashes stay in the table. A cleaned-up table of only the pretty runs is not an honest result.
4. **SAMPLE fixtures never count as results.** Offline replay is for QA and for a wifi-down demo. Cached *live* runs (a real earlier run, with real model ids, timestamps, and latencies) may be replayed for the demo, but the official counts should say they came from that earlier live run, not from a fixture.
5. **Do not tune thresholds on the holdout, then report the holdout.** If you change `gate-thresholds.json` after seeing holdout output, either leave the holdout unscored or disclose the change and show the pre-change counts.
6. **Do not count a failure-lock as a correct refusal.** "Never unlock on failure" will lock the signature case when Stage 3 times out. That is not evidence the challenger worked.
7. **Write expectations before the run.** If you change them after seeing answers, they are no longer pre-registered.
8. **The model id that ran is the one on the badge / startup table.** Planned names (`gemini-4-neon`, `gemini-4-carbon`, `gemini-decision-1`, and the listed fallbacks) are unverified until that table says they ran.
9. **Fallback is not the Decisions API.** If the drawer carries the spec's fallback label, say so in the row.
10. **Do not invent numbers for Marketing's `[REAL COUNTS]` placeholders.** Leave them blank until these cells are filled from a live run.

When the 30 minutes are up, stop. A complete, honest table with some errors is better than a late or cleaned-up one.
