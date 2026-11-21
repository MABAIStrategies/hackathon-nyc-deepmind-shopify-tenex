# SDK facts: @google/genai, Interactions, Decisions, Files, Gemini 4

Researched 3:21–3:24 PM ET, Saturday, Nov 21, 2026, from public docs and a read-only npm / typings fetch only. No package was installed into the repo. No API key was used. No live `models.list()` or smoke test was run.

## Status summary

The spec's main names check out, with a few important corrections.

- The current public JS/TS SDK is `@google/genai` **3.6.1** (npm `latest`), published **Nov 18, 2026, 5:24 PM ET** (`2026-11-18T22:24:12.732Z`). License: Apache-2.0. Repo: https://github.com/googleapis/js-genai. Decisions API requires SDK **3.2 or later**.
- The **Interactions API is public**. In this SDK the method is `ai.interactions.create({ model, input, ... })`. REST: `POST https://generativelanguage.googleapis.com/v1beta/interactions`.
- The **Decisions API is public**, including question types `noul` (yes/no probability) and `score` (rubric). The model id is `gemini-decision-1`. In this SDK the method is `ai.decisions.create({ model, input, questions, api_version? })`. Official docs say it is available on the Gemini Developer API **v1beta** only, with this model only.
- **Files API video upload matches the signature in the brief:** `ai.files.upload({ file, config: { mimeType } })`, then poll `ai.files.get({ name })` until `state` is `ACTIVE` (or `FAILED`). Reuse the returned `uri` across stages.
- These **Gemini 4 model ids are publicly listed and marked GA** in the official changelog: `gemini-4-carbon` (GA Nov 10, 2026), `gemini-4-hydrogen` (GA Nov 12, 2026; also listed on the free tier), `gemini-4-neon` (GA Nov 18, 2026), plus `gemini-4-argon` (GA Oct 13, 2026). `gemini-decision-1` is listed under specialized task models (released Nov 11, 2026); I did not find an explicit "GA" or "Preview" label for it.
- A given key may not see every listed model (paid-tier limits apply to several Gemini 4 ids). **Call `ai.models.list()` at startup**, smoke-test the chosen ids, and show the id that actually ran.

Corrections for Engineering, versus the unverified spec:

1. `thinking_level` is **not** a top-level `interactions.create` field. Put it in `generation_config: { thinking_level: "medium" }`. Allowed values in the typings are `"minimal" | "low" | "medium" | "high" | "xhigh"`. Official thinking docs: Carbon and Argon support `low|medium|high` (default `medium`); Neon and Hydrogen support `low|medium|high|xhigh` (default `high`). `minimal` is **not** supported on Gemini 4. `temperature` is deprecated on the Interactions `generation_config`; the spec's "no custom temperature" is the right call.
2. For Interactions / Decisions, reference an uploaded video as `{ type: "video", uri: file.uri, mime_type: file.mimeType }`. `createPartFromUri(uri, mimeType)` is the verified helper for the older `ai.models.generateContent` path, not the Interactions input block.
3. `noul` is **not** a boolean. It is `P(yes)` in `[0.01, 0.99]`, plus `confidence`. A threshold `> 0.99` will never match.
4. `score` is the **probability-weighted average of 0-based level indices**, so it can be a fraction (docs example: `1.12`). For a 0–3 rubric, pass **four** `criteria` strings (indices 0–3). Do not treat `score` as an integer unless you also take `argmax(probabilities)`.
5. Official Decisions examples set API version `v1beta`. In the JS typings, that can be `new GoogleGenAI({ apiKey, apiVersion: "v1beta" })` and/or `httpOptions: { apiVersion: "v1beta" }`, and `ai.decisions.create` also accepts `api_version?: string`.

Recommended fallbacks if a Gemini 4 id is missing on the key, taken from the current models table (not from stale code samples): `gemini-4-hydrogen` first (free-tier Gemini 4), then `gemini-3.8-flash`, then `gemini-3.6-flash` or `gemini-3.5-flash-lite`. The models page says new projects should use Gemini 4 Hydrogen or 3.5 Flash-Lite. Do not plan a new integration on `gemini-2.5-flash` or `gemini-2.5-pro` (deprecated; existing-user API access only; auto-routed to newer models on Dec 1, 2026). If `gemini-decision-1` / Decisions is unavailable, fall back to Interactions structured output (`response_format`) or the labeled TypeScript rule gate, as the spec already plans.

---

## Verified TypeScript signatures and snippets

Source for signatures: `@google/genai@3.6.1` typings at `https://unpkg.com/@google/genai@3.6.1/dist/genai.d.ts`, cross-checked with official docs. Snippets below use only confirmed field names.

```ts
import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
  FileState,
} from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  apiVersion: "v1beta", // Decisions docs require v1beta; typings: GoogleGenAIOptions.apiVersion
});

// 1) List models at startup (do this on Mark's key; typings: Models.list)
// list(params?: ListModelsParameters): Promise<Pager<Model>>
const models = await ai.models.list();
const ids: string[] = [];
for await (const model of models) {
  if (model.name) ids.push(model.name); // often "models/<id>"
}
console.log("installed @google/genai 3.6.1; models visible:", ids);

// 2) Upload a video once, poll until ACTIVE (Files.upload / Files.get)
// upload(params: UploadFileParameters): Promise<File>
//   UploadFileParameters = { file: string | Blob; config?: UploadFileConfig }
//   UploadFileConfig.mimeType?: string
// get(params: GetFileParameters): Promise<File>
//   GetFileParameters = { name: string; config?: GetFileConfig }
// File.state: FileState = "STATE_UNSPECIFIED" | "PROCESSING" | "ACTIVE" | "FAILED"
// File fields used below: name?, uri?, mimeType?, state?, error?
let file = await ai.files.upload({
  file: "path/to/clip.mp4",
  config: { mimeType: "video/mp4" },
});
while (!file.state || file.state.toString() !== "ACTIVE") {
  if (file.state === FileState.FAILED) {
    throw new Error(`Files API processing failed: ${file.error?.message ?? "unknown"}`);
  }
  await new Promise((r) => setTimeout(r, 5000));
  file = await ai.files.get({ name: file.name! });
}

// 3) Interactions API (Stages 1–2). thinking_level lives under generation_config.
// ai.interactions.create(params): Promise<GoogleGenAIInteraction>
// CreateModelInteraction (verified fields used here):
//   model: string
//   input?: string | Content | Content[] | Step[]
//   system_instruction?: string
//   previous_interaction_id?: string
//   generation_config?: { thinking_level?: "minimal"|"low"|"medium"|"high"|"xhigh"; max_output_tokens?: number; ... }
//   response_format?: { type: "text"; mime_type?: "application/json"|"text/plain"; schema?: object }
//   stream?: boolean
// Convenience on the result: output_text?: string, id: string, status, steps?
const extractor = await ai.interactions.create({
  model: "gemini-4-neon", // fallback: gemini-4-hydrogen, then gemini-3.8-flash
  system_instruction: "Return only the JSON object required by the schema.",
  input: [
    { type: "video", uri: file.uri, mime_type: file.mimeType },
    { type: "text", text: "Extract timestamped observations from this video." },
  ],
  generation_config: { thinking_level: "medium" },
  response_format: {
    type: "text",
    mime_type: "application/json",
    schema: {
      type: "object",
      // ...app JSON Schema...
    },
  },
});
console.log(extractor.model, extractor.output_text);

// Official generateContent fallback (if Interactions is missing on the key):
// generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>
// createPartFromUri(uri: string, mimeType: string, mediaResolution?: PartMediaResolutionLevel): Part
const gen = await ai.models.generateContent({
  model: "gemini-3.8-flash",
  contents: createUserContent([
    createPartFromUri(file.uri!, file.mimeType!),
    "Extract timestamped observations from this video.",
  ]),
});
console.log(gen.text);

// 4) Decisions API (Stage 3). Requires SDK >= 3.2 and model gemini-decision-1.
// ai.decisions.create(params: CreateDecisionRequest & { api_version?: string }): Promise<CreateDecisionResponse>
// CreateDecisionRequest = { input: string | DecisionInputContent | DecisionInputContent[]; model: string; questions: { [k: string]: Question } }
// NoulQuestion = { type: "noul"; instructions: string; criteria?: { true_description?: string; false_description?: string } }
// ScoreQuestion = { type: "score"; instructions: string; criteria: string[] }  // 2–255 levels, index 0 = lowest
// NoulAnswer = { type: "noul"; noul: number; confidence: number }            // noul in [0.01, 0.99]
// ScoreAnswer = { type: "score"; score: number; probabilities: { [k: string]: number }; legend: { [k: string]: string }; confidence: number }
// Docs: Decisions does not accept YouTube or gs:// URIs; use a Files API URI (or HTTPS / inline bytes).
const decision = await ai.decisions.create({
  api_version: "v1beta",
  model: "gemini-decision-1",
  input: [
    { type: "video", uri: file.uri, mime_type: file.mimeType },
    { type: "text", text: JSON.stringify({ claims: ["..."], stage1: extractor.output_text }) },
  ],
  questions: {
    skill_shown: {
      type: "noul",
      instructions: "Does the video show direct observable evidence supporting the claimed skill?",
      criteria: {
        true_description: "The skill is visible on screen, not only spoken.",
        false_description: "The skill is only claimed aloud, or is not shown.",
      },
    },
    problem_discovery: {
      type: "score",
      instructions: "Score Problem Discovery from the video evidence only.",
      criteria: [
        "0: no observable evidence",
        "1: weak or partial evidence",
        "2: clear evidence with gaps",
        "3: direct, unambiguous evidence",
      ],
    },
  },
});
const shown = decision.answers?.["skill_shown"]; // if type noul: shown.noul, shown.confidence
const rubric = decision.answers?.["problem_discovery"]; // if type score: rubric.score may be fractional
```

Video / file limits that are documented (cite both pages; they do not fully agree on per-file size):

- Video understanding: File API max size **20 GB (paid) / 2 GB (free)**; inline data **< 100 MB**; Files API recommended for reuse or large files. Models with a 1M context window can process videos **up to 3 hours at low media resolution**, or **up to 1 hour at high**. YouTube URL input is a separate preview feature; Decisions explicitly does **not** support YouTube or `gs://` URIs.
- Files API guide: store **up to 20 GB of files per project**, **2 GB per-file maximum**, files deleted after **48 hours**. Use Files API when the total request is larger than **100 MB** (this page); the video page instead says use Files API when the total request is larger than **20 MB**.

---

## Sources

All accessed Nov 21, 2026, afternoon ET.

1. npm registry (read-only): `npm view @google/genai version` → `3.6.1`; `npm view @google/genai time --json` → `3.6.1` published `2026-11-18T22:24:12.732Z`; `license` Apache-2.0; `dist-tags.latest` `3.6.1`; homepage https://github.com/googleapis/js-genai#readme. Package page: https://www.npmjs.com/package/@google/genai
2. Typings: https://unpkg.com/@google/genai@3.6.1/package.json (`types`: `dist/genai.d.ts`) and https://unpkg.com/@google/genai@3.6.1/dist/genai.d.ts
3. SDK README / Interactions examples: https://github.com/googleapis/js-genai/
4. Interactions getting started: https://ai.google.dev/gemini-api/docs/get-started
5. Models table: https://ai.google.dev/gemini-api/docs/models — Gemini 4 ids `gemini-4-carbon`, `gemini-4-neon`, `gemini-4-hydrogen`, `gemini-4-argon`; specialized task model `gemini-decision-1`; 3.x fallbacks listed above; 2.5 deprecation notes
6. Changelog: https://ai.google.dev/gemini-api/docs/changelog — Argon GA Oct 13, 2026; Carbon GA Nov 10, 2026; Decision 1 + Decisions API released Nov 11, 2026; Hydrogen GA Nov 12, 2026 (free tier mentioned); Neon GA Nov 18, 2026
7. Decisions API: https://ai.google.dev/gemini-api/docs/decisions-api and https://aistudio.google.com/docs/decisions-api (same guide)
8. Thinking / `thinking_level`: https://ai.google.dev/gemini-api/docs/thinking
9. Structured outputs / `response_format`: https://ai.google.dev/gemini-api/docs/structured-output
10. Files API: https://ai.google.dev/gemini-api/docs/files and REST/API reference https://ai.google.dev/api/files (JS upload, poll `ACTIVE`, `createPartFromUri` + `generateContent` examples)
11. Video understanding (size/duration, Interactions video blocks): https://ai.google.dev/gemini-api/docs/video-understanding
12. models.list REST: https://ai.google.dev/api/models (`GET https://generativelanguage.googleapis.com/v1beta/models`)

---

## Could NOT find / unverified

- **No live model list for Mark's hackathon key.** I did not call any Gemini API. Visibility of `gemini-4-*` and `gemini-decision-1` on that key is unverified. Engineering must print `ai.models.list()` and smoke-test.
- **No JavaScript code sample on the official Decisions API page** in the fetched HTML (Python was shown). JS support is still confirmed: the same page says `npm install @google/genai@latest` and "Requires SDK 3.2 or later", and `@google/genai@3.6.1` typings export `ai.decisions.create` with the same `model` / `input` / `questions` shape.
- **No explicit GA vs Preview badge for `gemini-decision-1`.** Changelog says "Released"; the models table lists it under specialized task models. I did not find the phrase "generally available (GA)" next to this id.
- **Decisions REST path** (the exact `https://generativelanguage.googleapis.com/...` URL) was not in the fetched guide body. The SDK method is verified; the raw REST route is unverified here.
- **Per-file upload size and "use Files API when request exceeds X MB" disagree across official pages** (see limits above). I am not choosing one.
- **No hard maximum duration for a Files API upload itself** (as opposed to what a 1M-context model can process, and the 48-hour retention). Unverified whether a longer file can be stored but not fully analyzed.
- **`gemini-3.5-flash` (no `-lite`)** still appears in some official examples (get-started / older files samples). It was **not** in the models table fetched today. Do not treat it as a verified current fallback.
- **Access by billing tier** for each Gemini 4 id on a temporary hackathon key is unverified from these pages alone. Changelog/pricing pages indicate Hydrogen is on the free tier; several other Gemini 4 ids are described as paid-tier. Forum posts were not used as evidence.
- I did not verify runtime behavior of `file.state.toString() !== "ACTIVE"` vs `file.state === FileState.ACTIVE`. Official JS samples use `.toString() !== "ACTIVE"`; typings say `state?: FileState` with string enum values including `"ACTIVE"`.
- I did not install `@google/genai` and did not inspect a built `node_modules` tree. Signatures come from the published `3.6.1` typings on unpkg plus public docs.
