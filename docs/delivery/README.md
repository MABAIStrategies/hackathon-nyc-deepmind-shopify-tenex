# Delivery handoff: SAMPLE test videos for My Player

Four short **SAMPLE / synthetic** fixtures for the My Player benchmark. They are not recordings of real people, clients, or work, and they are not live model output.

Handoff root: `/workspace/hackathon/gemini4-nyc/handoff/delivery/`

| File | Duration | What it tests | Expected outcome (directive node state) |
| --- | --- | --- | --- |
| `case1-clear-pass.mp4` | 40.0 s | One claimed skill, shown end to end: a spreadsheet formula `=SUM(B2:B6)` is typed and the total `1,420.00` appears. | `supported` |
| `case2-unsupported-claim.mp4` | 40.0 s | **Signature refusal moment.** A job-entry form is filled and saved on screen, then the narrator says aloud “I also wrote the SQL query that powers this,” which is never shown. | Form claim: `supported`. SQL claim: `insufficient_evidence` (case-level outcome: `insufficient_evidence`) |
| `case3-partial-completion.mp4` | 40.0 s | A client intake is started but not finished: 2 of 3 required fields, Hours left empty, Submit never clicked. | `insufficient_evidence` |
| `case4-unseen-holdout.mp4` | 40.0 s | A different domain and layout (dark CSS playground with a live preview). The claimed CSS skill is shown end to end. | `supported` |

`labels.json` lists each case’s claims, the exact narration transcript, `spoken_at_s` (from the TTS timeline), `evidence_window_s` (from the animation timeline), and the expected node state. Node state names follow the directive: `unverified | evidence_pending | supported | insufficient_evidence | contradicted`. Engineering’s `my-player/` folder had no fixture format at handoff time.

All four files are 1280×720 H.264 + AAC, 40.0 seconds (under the 45-second cap). A yellow **SAMPLE / synthetic — not a real person, client, or work recording** badge is burned into every frame (verified on all 600 frames of each file).

## How these were made

1. Synthetic “screen recordings” were drawn as 15 fps RGB frames of simple local UI (spreadsheet, forms, CSS playground) by `build/generate_videos.py` (Pillow) and encoded with ffmpeg. No browser, no Playwright, and no real application was used in the final render.
2. Narration was synthesized with the shared free local TTS tool (`/workspace/shared-audio/make_audio.py`, Kokoro voice `af_heart`). Background music was omitted (`--music none`) to keep memory use low; the brief allows narration without music.
3. `spoken_at_s` and `duration_s` were measured after mux (TTS `timeline.json` and `ffprobe`). They were not guessed.

## Rebuild

One heavy job at a time. Do not install audio tools; use the shared tool only.

```bash
DEST=/workspace/hackathon/gemini4-nyc/handoff/delivery
BUILD=$DEST/build

# 1) Silent 1280x720 videos, SAMPLE badge on every frame
python3 "$BUILD/generate_videos.py"

# 2) Narration + mux, one case at a time
for name in case1-clear-pass case2-unsupported-claim case3-partial-completion case4-unseen-holdout; do
  /workspace/shared-audio/make_audio.py \
    "$BUILD/${name}.script.json" \
    --out "$BUILD/${name}_audio" \
    --music none \
    --mux "$BUILD/${name}-silent.mp4" \
    --mux-out "$DEST/${name}.mp4"
done
```

After a rebuild, update `labels.json` from each `build/<case>_audio/timeline.json` and from `ffprobe` durations, then re-check:

```bash
ffprobe -v error -show_entries format=duration -show_entries stream=codec_name,codec_type,width,height -of default=nw=1 "$DEST/<case>.mp4"
ffmpeg -v error -i "$DEST/<case>.mp4" -f null -
```

If the TTS engine or cache changes, spoken timestamps may shift slightly; evidence windows stay the same unless `generate_videos.py` is edited.
