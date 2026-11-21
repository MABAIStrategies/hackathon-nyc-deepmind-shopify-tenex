// Rule Zero smoke test without starting the server: prints SDK version, visible models, per-model status + latency.
// Needs GEMINI_API_KEY in .env. Usage: npm run smoke
import { KEY_PRESENT } from "../server/src/config.js";
if (!KEY_PRESENT) {
  console.error("No GEMINI_API_KEY in .env: smoke test needs live access. (Offline replay needs no key: npm run replay)");
  process.exit(1);
}
const m = await import("../server/src/gemini.js");
const s = await m.verifyLive();
console.log(JSON.stringify({ sdk: s.sdkVersion, models: s.models, decisionsApi: s.decisionsApi, substitutions: s.substitutions }, null, 2));
