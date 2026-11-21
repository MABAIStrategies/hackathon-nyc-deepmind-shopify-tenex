# Hosted demo (Vercel): OFFLINE REPLAY only


**Live demo (SAMPLE replay):** https://hackathon-nyc-deepmind-shopify-tenex-mab-ai-strategies.vercel.app
The public Vercel deployment is a **static, offline replay** of the app. Every result it shows is a
hand-authored **SAMPLE fixture, not a live model run**, and the UI labels it that way.

- Built with `npm run build:static` (`vite build` + `scripts/build-static-replay.ts`), which
  pre-renders the replay API responses (`/api/health`, `/api/replay/<case>`, `/api/bench`, `/api/runs`)
  as static JSON. The deterministic TypeScript gate still runs for real on the fixture data at build time.
- No Gemini key exists on the hosted demo and none is configured. `/api/analyze` (live upload) is **not
  available** there; the live 3-stage pipeline (gemini-4-neon, gemini-4-carbon, gemini-decision-1) runs
  only locally with your own `GEMINI_API_KEY` in `.env` (see RUN-ON-LAPTOP.md).
- Sample videos (`web/public/samples/*.mp4`), fonts (`web/src/creative/fonts/*.ttf`) and two PNGs in
  `docs/img/` are binary and may be missing from this GitHub repo if they could not be uploaded through
  the API connector; they are present in the original build zip and on the hosted demo.
