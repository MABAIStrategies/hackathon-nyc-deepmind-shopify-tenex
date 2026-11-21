# Gate thresholds rationale

Written by Internal R&D on Saturday, Nov 21, 2026, for the My Player hackathon build. Plain-English reasons for every rule and number in the deterministic gate. Nothing here is a live benchmark result.

**Spec source:** `/workspace/hackathon/gemini4-nyc/my-player-directive-v2.md` (the Execution Directive v2). Section names below match that file. I quote the spec's exact words and numbers. I do not invent spec content.

**What I also peeked (read-only, not the spec):** Engineering's in-progress code in `my-player/` around 3:25 PM ET, especially `server/src/gate.ts`, `server/src/config.ts`, `server/src/gemini.ts`, and `shared/types.ts`. Where Engineering has already picked a number the spec left unset, I adopt that same number as the **PROPOSED** value so this handoff matches the app Mark will run. Those numbers are still PROPOSED, not spec.

**How to read "false unlock" vs "false lock":** a false unlock is a skill node turning `supported` when the video did not actually show the skill. A false lock (also called a false refusal) is a skill staying locked when the video did show it. This product is built to prefer a false lock over a false unlock: "Never unlock on failure."

**How to tune:** change only the PROPOSED numbers, and only after looking at real live-run counts from the protocol in `benchmark-protocol.md`. Engineering already reads optional overrides from `my-player/gate-thresholds.json` (falls back to the defaults below). Do not tune on the unseen holdout and then report that same holdout as a result.

---

## Ambiguities in the spec (unverified)

These are gaps I did not fill in as if the spec had answered them:

1. **"Confidence" is named, not defined.** PRODUCT LOOP #7 says "confidence below threshold => `insufficient_evidence`," and the evidence drawer calls for a "Rubric Gate probability bar," but the Decisions API is specified only as "`noul` yes/no + `score` 0-3." The spec never gives a threshold number, never says `noul` is a 0–1 value, and never says how to turn `noul` or `score` into a probability. Engineering currently treats `noul` as a number, marks the answer "yes" when `noul >= 0.5`, and uses that same number as the gate probability (threshold 0.7). Their TypeScript also mentions a separate `confidence` field on the Decisions answer, which the gate does not use. Whether the real API returns a yes/no, a number, a confidence, or some combination is **unverified**.

2. **The 0–3 scores vs the skill claims.** PRODUCT LOOP #6 says: per skill, a yes/no question, "plus a 0-3 score for Problem Discovery, Technical Communication, Workflow Execution." It is unclear whether those three names *are* the three onboard skill claims, or a separate video-level rubric. Engineering currently treats them as a separate video-level rubric and does **not** use the 0–3 scores to unlock a claim.

3. **State transitions are only partly specified.** PRODUCT LOOP #7 lists five node states (`unverified | evidence_pending | supported | insufficient_evidence | contradicted`) and says timeouts, malformed JSON, or low confidence go to `insufficient_evidence`, and "Never unlock on failure." It does not define when a node becomes `contradicted` vs `insufficient_evidence`, or what combination of Stage 1 / 2 / 3 outputs is required for `supported`.

4. **Stage-1-only baseline is required, but not defined.** The BENCHMARK section asks to "Compare Stage-1-only baseline vs full 3-stage pipeline," but does not say how a claim is unlocked when Stages 2 and 3 are skipped. That matters because Engineering's current `gateOne` function fails closed if Stage 2 or Stage 3 is missing, so a baseline cannot be "just omit the later stages" without a separate rule. See the proposed baseline rule below and in `benchmark-protocol.md`.

5. **Partial completion and the unseen holdout have no claim-level expected outcomes in the spec or the team brief.** Those come from Delivery's `labels.json`, which was not yet in `handoff/delivery/` when this was written (~3:25 PM ET).

---

## Rules and thresholds

### 1. Five node states, and only `supported` is an unlock

**Value:** `unverified | evidence_pending | supported | insufficient_evidence | contradicted`

**Source:** PRODUCT LOOP #7: "node states `unverified | evidence_pending | supported | insufficient_evidence | contradicted`."

**Why:** The card has to show a clear locked/unlocked picture, plus a "not yet judged" state and an in-progress state, without inventing a sixth meaning. Only `supported` should light up as unlocked. The other four stay locked, including `contradicted` and `insufficient_evidence`, which are different *reasons* for a lock, not unlocks.

**Guards against:** A false unlock by treating "we couldn't tell" or "the video disagrees" as a pass. Also guards against showing a verdict before the analysis has finished (`unverified` before a run, `evidence_pending` while a stage is in flight).

**Tradeoff:** Viewers may lump every locked state together and miss the difference between "not enough evidence" and "the video contradicts the claim." That is why the evidence drawer exists.

**How to tune:** Do not add states. If people confuse `contradicted` with `insufficient_evidence`, fix the label in the UI, not the rule. Engineering's current gate function only returns the three post-analysis states; `unverified` and `evidence_pending` need to come from the UI before and during a run.

### 2. Never unlock on failure

**Value:** hard rule (no number)

**Source:** PRODUCT LOOP #7: "Never unlock on failure."

**Why:** Timeouts, crashes, missing output, and API errors would otherwise be a shortcut to a green node. The honest result when the system fails is "we do not have enough evidence," not "the skill is proven."

**Guards against:** False unlocks caused by a broken or incomplete run.

**Tradeoff:** Failures also produce locks. If you count those locks as "correct refusals," the benchmark will look better than it is. The protocol treats failure-locks as errors or abstentions, not as earned refusals.

**How to tune:** Do not loosen this rule. If many clear-pass cases fail for infrastructure reasons, fix the run (timeouts, parsing, the key, the model id), don't start unlocking on failure.

### 3. Stage timeout: 45 seconds per stage

**Value:** 45 seconds per stage (45,000 ms)

**Source:** PRODUCT LOOP #7: "Timeouts (set 45s per stage)." Engineering's current default is `STAGE_TIMEOUT_MS = 45_000`, overridable with that env var in `server/src/config.ts`. The number itself is from the spec.

**Why:** A live demo cannot wait forever. Each stage has its own cap so one stuck model call fails closed and the next stage is not left hanging with a silent wait. Forty-five seconds is long enough for a short video call and short enough that three stages plus upload still fit a live presentation.

**Guards against:** A hang during judging, and a false unlock if a partial or late response were treated as a finished yes.

**Tradeoff:** A slow but valid answer gets cut off and the claim goes to `insufficient_evidence` (false lock). Three stages at the cap is 135 seconds plus upload, which is tight for a 30-minute benchmark sitting.

**How to tune:** Record per-stage latency for every live run. If clear-pass cases often die at 45 seconds, the cap is too tight for the actual models (consider raising, and say so). If every stage finishes well under 45 seconds, keep the spec value. Do not raise the cap just to save a holdout score.

### 4. Malformed JSON → `insufficient_evidence`

**Value:** rule (no number). Any output that is empty, not JSON, or the wrong shape is a stage failure, and the gate must not unlock.

**Source:** PRODUCT LOOP #7: "malformed JSON, or confidence below threshold => `insufficient_evidence`."

**Why:** A model that wraps JSON in extra text, drops a field, or invents a new tag is not a trustworthy witness. Unlocking on a "best guess" parse would hide that failure.

**Guards against:** False unlocks from garbage or partial output.

**Tradeoff:** A model that was right but messy (markdown fences, trailing commas) will cause a false lock.

**How to tune:** Do not unlock on bad JSON. If this shows up often, tighten the parser only in safe, testable ways (Engineering already strips a single markdown fence). Count parse failures as errors, not as correct refusals.

### 5. Confidence below threshold → `insufficient_evidence`

**Value:** the rule is in the spec; the number is not (see row 6).

**Source:** PRODUCT LOOP #7: "malformed JSON, or confidence below threshold => `insufficient_evidence`." The evidence drawer in the same product loop also asks for a "Rubric Gate probability bar."

**Why:** A weak "yes" should not unlock a skill. The node should stay locked and the drawer should show that the gate was not sure enough.

**Guards against:** False unlocks when the rubric leans yes but not clearly.

**Tradeoff:** If the model's own confidence is uncalibrated (Engineering's drawer already warns that it is), a high threshold will also produce false locks on real demonstrations.

**How to tune:** Tune the number in row 6, not the rule that low confidence stays locked.

### 6. PROPOSED support probability threshold: 0.7

**Value:** **PROPOSED 0.7** (on a 0–1 scale). The spec does not set this number. It matches Engineering's current default `support_probability: 0.7` in `server/src/gate.ts`.

**Source:** PROPOSED. The spec requires a threshold but does not give a value (PRODUCT LOOP #7).

**Why:** 0.5 would unlock on a coin flip, which is too weak for a visible unlock. 0.9 would demand near-certainty from an uncalibrated, self-reported score and would likely lock a lot of honest clear-pass videos. 0.7 is a clear-majority bar: the gate has to be substantially sure, not just slightly over the midpoint. In Engineering's current wiring, this number is compared to the Decisions `noul` value when that value is a number (see ambiguity #1 — unverified).

**Guards against:** False unlocks on a weak or barely-over-half "yes."

**Tradeoff:** Clear-pass claims whose probability lands between 0.5 and 0.7 will be locked as `insufficient_evidence` even if the yes/no label says "yes." That is intentional under the spec's low-confidence rule, but it will look like a false refusal if those videos really did show the skill.

**How to tune:** List the live probability for every claim, split by expected unlock vs expected lock. If clear-pass claims cluster just under 0.7 and unsupported claims stay well under it, the bar may be slightly too tight. If unsupported claims come in at 0.71 or higher and unlock, raise the bar. Write the new value in `gate-thresholds.json`. Never fit this number to the holdout and then report the holdout.

### 7. PROPOSED "yes" cutoff on a numeric `noul`: 0.5

**Value:** **PROPOSED 0.5**, only if `noul` is a number. The spec describes `noul` as yes/no, not as a number, so this cutoff may not even apply. It matches Engineering's current line `ans.noul >= 0.5 ? "yes" : "no"`.

**Source:** PROPOSED (not in the spec). Spec PRODUCT LOOP #6 / TARGET MODELS: "Decisions API: `noul` yes/no + `score` 0-3."

**Why:** If the API does return a 0–1 value instead of a boolean, something has to turn it into the yes/no the gate expects. 0.5 is the midpoint: at or above is "yes," below is "no." This cutoff does **not** unlock the node by itself. Unlock still requires the 0.7 bar in row 6, so a 0.6 "yes" stays locked.

**Guards against:** Treating a clearly-below-half `noul` as a yes in the drawer. It is not the main defense against false unlocks; 0.7 is.

**Tradeoff:** If the real API returns a boolean, this comparison should not be used (a type mismatch should fail closed as malformed, not be forced into a number). If it returns 0–1, a 0.5 "yes" that then fails the 0.7 bar can confuse a viewer who sees "yes" and a lock at the same time — which is actually the low-confidence behavior the spec wants, if the drawer explains it.

**How to tune:** First confirm from a live startup and a logged raw Decisions response what `noul` actually is. If it is yes/no, drop this cutoff and map the boolean directly. If it is a number, leave 0.5 as a label-only midpoint and keep unlock tied to 0.7, unless live counts show the label itself is misleading.

### 8. PROPOSED minimum on-screen observations: 1

**Value:** **PROPOSED 1** qualifying `shown_on_screen` observation. The spec does not set a count. It matches Engineering's current `min_shown_observations: 1`.

**Source:** PROPOSED. Implied by PRODUCT LOOP #4 (observations tagged `shown_on_screen` or `only_said_aloud`) and the SIGNATURE DEMO MOMENT ("I claim a skill I never show on screen… the node stays visibly LOCKED"). The gate section itself never says "at least one on-screen observation."

**Why:** One on-screen observation is the smallest bar that still requires the skill to appear in the picture, not just in the narration. Requiring two or more would be safer against a single bad tag, but these videos are short (the spec says keep uploads under 60 seconds; Delivery's brief says 45 seconds or less), so a real demonstration may only have one clear moment.

**Guards against:** False unlocks when the person only talks about a skill.

**Tradeoff:** If the extractor misses the one on-screen moment, or tags it `only_said_aloud` by mistake, you get a false lock. If it invents one bad `shown_on_screen` tag and the later stages also agree, you get a false unlock.

**How to tune:** If the unsupported-claim case ever unlocks because of a single fleeting or wrong tag (and Stages 2 and 3 fail to catch it), consider raising this to 2. If clear-pass cases fail because there was only one real on-screen moment, keep it at 1 and fix the later stages instead.

### 9. PROPOSED minimum observation confidence: 0.6

**Value:** **PROPOSED 0.6** (on a 0–1 scale) for a `shown_on_screen` observation to count. The spec never mentions observation-level confidence. It matches Engineering's current `min_observation_confidence: 0.6`.

**Source:** PROPOSED (not in the spec). Engineering's extractor schema asks for a 0–1 `confidence` on each observation; that field is an implementation choice.

**Why:** A low-confidence "I maybe saw it" tag should not be enough to start an unlock chain. 0.6 is slightly looser than the 0.7 rubric bar because this is only a raw detection; Stages 2 and 3 still have to agree before the node can turn `supported`.

**Guards against:** False unlocks from weak or uncertain extractor tags.

**Tradeoff:** If the extractor is shy and tags real on-screen moments at 0.4–0.5, those observations will not count, and a clear-pass claim can false-lock even though something was visible.

**How to tune:** Look at the observation confidences in the evidence drawer for clear-pass vs unsupported-claim runs. If real on-screen moments sit just under 0.6, lower slightly. If invented tags sit at 0.65 and contribute to false unlocks, raise it. Same rule as the others: do not fit this to the holdout.

### 10. `only_said_aloud` cannot unlock a claim

**Value:** **PROPOSED rule** (strongly implied, not written as a gate sentence).

**Source:** Implied by the SIGNATURE DEMO MOMENT ("I claim a skill I never show on screen. The Challenger flags the gap, the Rubric Gate returns low confidence, and the node stays visibly LOCKED") and PRODUCT LOOP #4's two tags. The gate section does not literally say "spoken claims must not unlock."

**Why:** This is the product's signature. If talking about a skill were enough, the card would be a resume with a microphone, not a proof.

**Guards against:** False unlocks from narration alone.

**Tradeoff:** A skill that is visually obvious but never tagged `shown_on_screen` will lock (false lock), which is an extractor error, not a reason to accept spoken-only proof.

**How to tune:** Do not drop this rule. If the signature case unlocks, the failure is in tagging, the challenger, or the rubric — fix those, don't allow spoken-only unlocks.

### 11. Rubric yes/no must be yes to unlock

**Value:** the Stage 3 question must come back yes. Wording from the spec: "Does the video show direct observable evidence supporting [skill]?"

**Source:** PRODUCT LOOP #6. The question is in the spec. Using it as a hard unlock requirement is the natural reading, and Engineering's current gate requires `answer === "yes"`.

**Why:** The rubric exists to answer that exact question. A node should not turn `supported` if the gate itself said no.

**Guards against:** False unlocks when later-stage scores look fine but the direct-evidence question was no.

**Tradeoff:** If the Decisions call is wrong and says no on a video that really shows the skill, you get a false lock. The drawer should show that "no" so it can be checked.

**How to tune:** This is not a number. If live runs show the question is being answered on the wrong basis (for example, treating speech as evidence), fix the prompt and the "saying it aloud is not evidence" instruction, then re-run. Do not override a "no" into an unlock.

### 12. PROPOSED: a Challenger contradiction forces `contradicted` and blocks unlock

**Value:** **PROPOSED precedence.** If Stage 2 lists any contradiction for the claim, the node becomes `contradicted` (locked), even if Stage 3 later says yes. Engineering's current gate does this and checks contradictions before the rubric outputs.

**Source:** The `contradicted` state is in PRODUCT LOOP #7. Stage 2 is asked to output "contradictions, unsupported claims, missing visual proof, uncertainty" (PRODUCT LOOP #5). The spec does not explicitly say "contradiction beats everything."

**Why:** If the video shows the opposite of the claim, that is a stronger finding than "not enough evidence." It should be a distinct locked state, and it should not be possible to unlock past it.

**Guards against:** False unlocks when the models disagree in the dangerous direction (rubric says yes, but the challenger found a contradiction).

**Tradeoff:** An over-eager challenger will mark contradictions on honest videos and cause false locks (and a harsher-looking state than `insufficient_evidence`).

**How to tune:** Count how often clear-pass claims land in `contradicted`. If that is common, the challenger is too aggressive — fix the Stage 2 prompt or how a "contradiction" is defined (opposite evidence, not merely a gap). Do not let a contradicted claim unlock.

### 13. PROPOSED: Challenger "unsupported" or "missing visual proof" blocks `supported`

**Value:** **PROPOSED rule.** If the challenger flags the claim as unsupported, or lists missing visual proof, the node cannot become `supported`. It goes to `insufficient_evidence` (unless a contradiction already sent it to `contradicted`). Engineering's current gate does this, and also fails closed if the challenger returned no note for the claim.

**Source:** PROPOSED. PRODUCT LOOP #5 asks Stage 2 for those fields, but the gate section does not say they are hard blocks.

**Why:** The challenger's job is to stop a self-congratulating extractor. If it says the visual proof is missing, the honest unlock path is closed.

**Guards against:** False unlocks when Stage 1 tagged something as shown but Stage 2 disagrees.

**Tradeoff:** A noisy challenger that marks every claim "unsupported" will false-lock the clear-pass case and make the three-stage pipeline look worse than Stage 1 alone. That is useful information, not a reason to ignore the flag.

**How to tune:** Compare Stage-1-only vs three-stage counts. If three-stage false refusals jump because almost every claim is flagged unsupported, tighten what "unsupported" means (no direct on-screen proof, not "I have a quibble"). Keep the hard block until that is fixed.

### 14. Decisions API failure → labeled rule-based fallback

**Value:** log the exact error; fall back to deterministic TypeScript rules; label the drawer exactly `Rule-based fallback, Decisions API unavailable`.

**Source:** PRODUCT LOOP #6: "If the Decisions API fails, log the exact error, fall back to deterministic TypeScript rules, and label the drawer "Rule-based fallback, Decisions API unavailable"."

**Why:** The demo should still finish if Stage 3's API is down, but it must not pretend the Decisions API ran.

**Guards against:** Two failures: a silent crash, and a fake "Decisions API" badge on a rule-based answer.

**Tradeoff:** The fallback is a stand-in, not the real rubric. It can be more conservative (Engineering currently zeroes probability if the challenger flagged the claim, and otherwise uses the mean on-screen observation confidence). Fallback runs must be reported separately in the benchmark, not mixed in with Decisions API runs as if they were the same thing.

**How to tune:** Do not hide the label. If most live runs fall back, that is a result, not a reason to raise fallback probabilities so more nodes unlock.

### 15. PROPOSED fallback probability rule

**Value:** **PROPOSED**, because the spec does not define the fallback math. Engineering's current rule: probability = the mean confidence of qualifying on-screen observations, or 0 if the challenger flagged the claim; "yes" only if that probability is at or above the 0.7 support threshold.

**Source:** PROPOSED (not in the spec). The spec requires a deterministic TypeScript fallback and the exact drawer label, nothing else.

**Why:** This fallback only says yes when Stage 1 already has on-screen support and Stage 2 did not object. That stays consistent with "never unlock on failure" and with the signature "said aloud but not shown" lock. It is conservative on purpose.

**Guards against:** False unlocks while the Decisions API is down.

**Tradeoff:** More false locks in fallback mode, especially if observation confidences are modest. That is acceptable for a fallback. What is not acceptable is reporting fallback unlocks as Decisions API results.

**How to tune:** If you change this, say so, and keep fallback rows separate in the counts table. Do not raise fallback probabilities just to improve a score.

### 16. Rubric scores of 0–3 (three named dimensions)

**Value:** 0–3 for Problem Discovery, Technical Communication, and Workflow Execution.

**Source:** PRODUCT LOOP #6: "plus a 0-3 score for Problem Discovery, Technical Communication, Workflow Execution." TARGET MODELS: "`score` 0-3."

**Why:** These scores describe how strongly those three process qualities show up in the video. They are in the spec as Stage 3 outputs. They are not, as currently wired by Engineering, part of the unlock test. I am not proposing that they become an unlock key without a new, written rule.

**Guards against:** Nothing in the unlock path today. They are evidence-drawer context, unless a later change says otherwise.

**Tradeoff:** Judges may assume a high 0–3 score means the skill unlocked, or a low score means it should not. If the UI shows these scores, it should say they are not the unlock switch.

**How to tune:** Do not quietly start requiring, for example, "all three scores ≥ 2" without writing it down and re-running the protocol. If we ever add that, pre-register it before the next run.

---

## Summary table

| Threshold or rule | Value | Source | Guards against | How to tune |
| --- | --- | --- | --- | --- |
| Node states | `unverified`, `evidence_pending`, `supported`, `insufficient_evidence`, `contradicted` (only `supported` unlocks) | Spec PRODUCT LOOP #7 | False unlock, or a verdict shown before analysis finishes | Do not add states; keep pre-analysis states in the UI |
| Never unlock on failure | Hard rule | Spec PRODUCT LOOP #7: "Never unlock on failure." | False unlock on errors, timeouts, or missing output | Do not loosen; count failure-locks as errors/abstentions, not correct refusals |
| Stage timeout | 45 seconds per stage | Spec PRODUCT LOOP #7: "Timeouts (set 45s per stage)" | A hung demo; unlocking on a partial run | If many clear-pass stages time out, consider raising; if all finish early, keep 45s |
| Malformed JSON | → `insufficient_evidence` | Spec PRODUCT LOOP #7 | False unlock from garbage or partial output | Do not unlock on bad JSON; fix parsing and count failures as errors |
| Low confidence | → `insufficient_evidence` | Spec PRODUCT LOOP #7: "confidence below threshold => `insufficient_evidence`" | False unlock on a weak yes | Tune the number in the next row, not the rule |
| `support_probability` | **PROPOSED 0.7** (Engineering current default; not a spec number) | PROPOSED. Spec requires a threshold but gives no number | False unlock when the rubric is only slightly sure | Compare live probabilities on expected-unlock vs expected-lock claims; do not fit the holdout |
| Numeric `noul` → yes/no | **PROPOSED 0.5** if `noul` is a number; may not apply | PROPOSED. Spec says `noul` yes/no, not a number | Labeling a clearly-below-half value as "yes" | First verify the live API shape; this cutoff does not unlock (0.7 still does) |
| `min_shown_observations` | **PROPOSED 1** (Engineering current default) | PROPOSED. Implied by PRODUCT LOOP #4 and the SIGNATURE DEMO MOMENT | False unlock from narration alone | Raise to 2 only if a single bad tag causes false unlocks; keep 1 if clear-pass videos have only one real moment |
| `min_observation_confidence` | **PROPOSED 0.6** (Engineering current default) | PROPOSED. Not in the spec | False unlock from weak "maybe I saw it" tags | Lower if real on-screen moments sit just under 0.6; raise if weak tags help false unlocks |
| Spoken-only claims cannot unlock | **PROPOSED rule** (strongly implied) | Implied by SIGNATURE DEMO MOMENT and PRODUCT LOOP #4; not an explicit gate sentence | False unlock from talking about a skill | Do not drop this rule |
| Rubric question must be yes | Yes required to unlock | Spec PRODUCT LOOP #6 question; used as a hard requirement (natural reading) | False unlock when the gate itself said no | Fix the prompt if "yes" is being awarded for speech; never override a "no" into an unlock |
| Contradiction precedence | **PROPOSED:** any Stage 2 contradiction → `contradicted`, no unlock | State name is spec PRODUCT LOOP #7; precedence is PROPOSED | False unlock when the video contradicts the claim | If clear-pass often lands in `contradicted`, the challenger is too aggressive — fix Stage 2, don't unlock past it |
| Challenger unsupported / missing visual proof | **PROPOSED:** blocks `supported` | PROPOSED. Fields are in PRODUCT LOOP #5; hard block is not | False unlock when Stage 2 says the proof is missing | If almost every claim is flagged, tighten the flag; keep the block until then |
| Decisions API failure | Log the exact error; TypeScript fallback; drawer label exactly `Rule-based fallback, Decisions API unavailable` | Spec PRODUCT LOOP #6 (exact label) | A crashed demo, or pretending the Decisions API ran | Keep the label; report fallback rows separately |
| Fallback math | **PROPOSED:** mean qualifying on-screen confidence, or 0 if challenged; yes only at ≥ 0.7 | PROPOSED. Spec does not define the math | False unlock while the Decisions API is down | Keep fallback conservative and separate in the table |
| Rubric scores 0–3 | 0–3 on Problem Discovery, Technical Communication, Workflow Execution | Spec PRODUCT LOOP #6 and TARGET MODELS | Not used as an unlock key in the current gate | Do not start using them to unlock without a new pre-registered rule |

A related constraint, not a verdict rule: PRODUCT LOOP #3 says to keep the proof video "under 60s for latency." That is about speed, not about unlocking.
