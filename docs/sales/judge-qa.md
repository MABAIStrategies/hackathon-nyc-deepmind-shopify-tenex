# My Player: judge Q&A prep (Sales, Nov 21)

Source: my-player-directive-v2.md and TEAM-BRIEF.md. Each answer is two sentences. No numbers are claimed here. Where a real figure is needed, say "[REAL COUNTS]" and point to the benchmark tab. Model names in brackets must match the badge that actually ran.

**1. Privacy: what happens to my video?**
Only consented media goes in, each video is uploaded once through the Gemini Files API, and results stay in local JSON on the presenter's machine with no database. The API key stays on the Express backend in a gitignored .env, and a pre-push scan blocks any push that contains a key.

**2. Isn't this just a hiring filter that can discriminate?**
No. The spec rules out hiring decisions, biometric claims and personality scoring, and the app never looks at who you are, only at whether the claimed skill is visibly demonstrated on screen. Every verdict cites timestamped observations you can click and check, so nothing hides behind a score.

**3. How do you handle bias in the models?**
We can't claim the models are unbiased, so we narrow the question to observable evidence ("does the video show X?") and make every step inspectable in the evidence drawer. Low confidence, malformed output or timeouts default to "insufficient evidence", never to a negative judgment of the person.

**4. Why three models instead of one?**
One model grading its own read tends to agree with itself, so an extractor records what's shown versus only said aloud, a separate challenger hunts for gaps and contradictions, and a rubric gate makes the yes or no call. The benchmark compares the Stage 1 baseline against the full pipeline on the same cases, so you can see whether the extra stages earn their keep: [REAL COUNTS].

**5. What if it's wrong?**
The system is built to fail closed: any error, timeout or low-confidence result keeps the node locked as "insufficient evidence" instead of unlocking it. A wrong lock costs a re-record, and the drawer shows exactly why, so the person can contest it with a better video.

**6. What if it wrongly unlocks a skill someone doesn't have?**
That's the error we weight hardest, and it's why an unlock needs evidence tagged "shown on screen" plus agreement from the challenger and the gate. Incorrect support is a column in our benchmark table, reported honestly: [REAL COUNTS].

**7. Can't I just narrate my way to a skill?**
No, and that's the signature demo: a skill said aloud but never shown gets flagged as "only said aloud," and the node stays locked with a clickable reason. The claim that is shown unlocks right next to it, so the contrast is visible live.

**8. How do we know your results are real and not staged?**
On-screen badges show the model id that actually ran and real latency per stage, and any model substitution is recorded in PROVENANCE.md. Offline replay uses real cached runs or fixtures clearly labeled "SAMPLE / not a live model run," never passed off as live output.

**9. Is four test cases enough to prove anything?**
No, and we say so on screen: n=4, illustrative, not statistically meaningful. The four cases cover the failure modes that matter (clear pass, unsupported claim, partial completion and an unseen holdout), and the runner is built to scale to more.

**10. What happens if the Decisions API or wifi fails during judging?**
If the Decisions API errors, we log the exact error and fall back to deterministic TypeScript rules, and the drawer is labeled "Rule-based fallback, Decisions API unavailable." If wifi drops, cached-replay mode plays back a real, timestamped earlier run.

> *Engineering note:* a cached real run exists only if that video was analyzed live earlier on the same laptop (stored in `data/cache.json`). Otherwise the fallback is the SAMPLE fixture replay, which must be called SAMPLE out loud.

**11. What's the business model?**
The planned path is a free personal player card, with paid verification for professionals who want proof of skill they can share, and team plans for training providers and bootcamps that need to verify skills at scale. Pricing isn't set and nothing is sold yet; this weekend is about proving the verification loop works.

**12. Who is the customer, and why would they trust this over a resume or a certificate?**
The first users are self-taught operators and freelancers whose skills don't show up on a resume, along with the people evaluating their work. Unlike a certificate, every verified skill links to the timestamped moment in the video that proves it, so the evidence goes wherever the claim goes.
