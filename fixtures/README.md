# fixtures/ (SAMPLE only)

- `labels.json` is Delivery's ground truth for the 4 SAMPLE videos in `web/public/samples/` (synthetic screen recordings, local TTS, SAMPLE badge on every frame).
- `cases/*.json` are **hand-authored by Engineering** from those labels for OFFLINE REPLAY. They are **not model output** and not a live model run. Timestamps come from labels.json; observation wording, probabilities and confidences are illustrative placeholders.
- `demo5-challenger-timeout.json` simulates a Stage 2 timeout to show fail-closed behavior; `demo6-contradicted.json` shows the `contradicted` state; `demo7-rule-based-fallback.json` shows the labeled rule-based fallback drawer (simulated Decisions outage, values from the real fallback rule) (claim "I submitted the form" vs on-screen "Draft, not submitted" in case3). Neither is a benchmark case.
- The UI labels every replay "SAMPLE / not a live model run", and badges show "SAMPLE fixture" with no latency.
