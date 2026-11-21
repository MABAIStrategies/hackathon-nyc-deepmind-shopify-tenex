# Internal R&D handoff (My Player gate and benchmark)

1. `gate-thresholds-rationale.md` — why each gate rule and number exists, what false unlock or false lock it guards against, and how to tune it from real counts.
2. `benchmark-protocol.md` — how Mark runs Stage 1 alone vs all 3 stages on the 4 Delivery cases, with pre-registered expectations and a blank real-counts table.
3. Numbers quoted from `my-player-directive-v2.md` are spec; every value marked PROPOSED is not in the spec (some match Engineering's current defaults, peeked ~3:25 PM ET).
4. Delivery video ids are `case1-clear-pass`, `case2-unsupported-claim`, `case3-partial-completion`, `case4-unseen-holdout`. `labels.json` was still absent; claim-level expectations in the protocol are inferred from the videos/scripts and must be replaced if that file differs.
5. Offline SAMPLE fixtures are not results. The Delivery videos themselves are SAMPLE footage; a live model run on them still counts. Do not tune thresholds on the unseen holdout and then report it.
