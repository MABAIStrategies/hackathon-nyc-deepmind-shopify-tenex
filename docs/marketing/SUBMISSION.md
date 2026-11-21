# My Player: submission text

> **Engineering note (Nov 21):** as of the 4:20 PM build the benchmark has **not** been run live. Unless `npm run bench -- --mode live` is run on Mark's laptop before submitting, **remove the sentence "We benchmarked four cases: [REAL COUNTS]. Illustrative, not statistically meaningful."** from the description. Do not fill it from replay mode.

## Title
My Player

## Tagline
A skill card that only unlocks what your video actually shows.

(Short alternate: "Shown, not said.")

## Description (150 words)
Anyone can claim a skill. My Player checks whether a short work video actually shows it.

You declare three skills and upload a video under one minute. Three Gemini stages read the same uploaded file. An Extractor logs timestamped observations and tags each one as shown on screen or only said aloud. A Challenger re-reads the video to find contradictions and unsupported claims. A Rubric Gate built on the Decisions API answers yes or no for each skill and scores three work habits.

A unit-tested TypeScript gate makes the final call. A skill unlocks only on direct visual evidence. Timeouts, malformed output or low confidence keep it locked, and every lock opens a drawer showing why, linked to the exact second in the video.

Badges show the model that actually ran and its real latency. Offline replay is labeled SAMPLE. We benchmarked four cases: [REAL COUNTS]. Illustrative, not statistically meaningful.

---
*Word count of the description above: 150 (counted). Replace `[REAL COUNTS]` with a short phrase from `bench/results.json` (for example "baseline vs 3-stage correct rejections: X vs Y") and trim elsewhere to stay at 150, or remove that sentence if the benchmark didn't run live.*
