# Run My Player on your laptop (5 steps)

Needs Node 20+ (built with Node 24, npm 11). No database, no deploy.

1. **Get the code:** `unzip my-player.zip && cd my-player` (or `git clone <your private repo> && cd my-player`).
2. **Install:** `npm install`
   (If npm 11 warns about install scripts and Vite then fails with an esbuild error, run `npm rebuild esbuild`.)
3. **Add your key (backend only):** `cp .env.example .env`, then edit `.env` so it reads `GEMINI_API_KEY=<your key>`. Never commit `.env` (it is gitignored, and the pre-push scan blocks key patterns: run `npm run hooks` once to enable it).
4. **Start:** `npm run dev`. The API terminal prints the Rule Zero table: SDK version, models your key sees, smoke-test status + latency, any substitutions (also appended to `PROVENANCE.md`).
5. **Open:** http://localhost:5173. The top banner must say **● LIVE**. Use "My card" to upload a proof video (<60 s), or the Signature tab for the SAMPLE demo.

## Offline replay (no key, wifi off)
```bash
npm run replay        # banner says "SAMPLE / not a live model run"; open http://localhost:5173
```
Single-port alternative: `npm run build && MY_PLAYER_MODE=replay npm start`, then open http://localhost:8787.

## Before the demo
- `npm test` (expect 36 passing: 32 gate/fixture + 4 mocked live-wiring) and `npm run typecheck`.
- Optional real benchmark (~4 uploads): `npm run bench -- --mode live`, then reload the Benchmark tab. Fill README `[REAL COUNTS]` only from `bench/results.json`.
- A real live run is cached in `data/cache.json` by video hash; re-analyzing the same video with the same claims replays it labeled "CACHED real run from <time>" if wifi dies.
- `npm run secret-scan` before any push.
