# My Player: 3-minute live demo script

Presenter: Mark. Target 3:00, hard stop 3:15. Tone: calm and direct. Let the locked node do the talking.

**Before you start:** app open on the onboarding screen, the demo video ready to upload, the evidence drawer closed. Know which mode you're in. If live, the model badges should show real ids. If wifi is down, switch to offline replay and **say so out loud** (line provided below).

**Demo claims (set up in advance or typed live):** Skill A is shown clearly in the video. Skill B is said out loud but never shown on screen. Skill C is partly shown.

---

### 0:00–0:25 | The problem
**Say:** "Everyone has a profile full of skills. Almost none of them come with proof, and the ones that do, someone has to sit and watch. My Player asks a narrower question: what does this video actually *show*, versus what I only *say*?"

**Click:** nothing yet. Stay on the onboarding screen.

### 0:25–0:50 | Make the claims
**Click:** fill in name and role, add the consented photo, enter the three skills.
**Say:** "I'm claiming three skills. One of them I'm going to say out loud in the video and never actually show. Watch what happens to it."

**Click:** Create card. The player card appears with three grey `unverified` nodes.

### 0:50–1:20 | Upload and run
**Click:** Upload proof, choose the demo video, Analyze.
**Say (while stages run):** "The video uploads once. Three Gemini stages look at it. The first pulls out timestamped observations and tags each one as shown on screen or only said aloud. The second is a challenger: it re-reads the same video and looks for gaps and contradictions. The third is a rubric gate that answers yes or no for each skill."

**Point at:** the model badges and latency per stage. **Say:** "These badges show the model that actually ran and how long it took. Nothing here is hard-coded."

### 1:20–2:10 | The refusal (signature moment)
Nodes resolve. Skill A unlocks; Skill B stays locked.

**Pause for one beat. Don't talk over it.**

**Say:** "Skill A unlocked. Skill B didn't. I said it, clearly, on camera. But I never showed it."

**Click:** Skill B's lock to open the "why" drawer.
**Say (reading from the drawer):** "Here's why. The extractor tagged that moment as *only said aloud*. The challenger flagged it as an unsupported claim. The rubric gate came back [low / no; read the real result]. So the node stays locked."

**Click:** the timestamp in the drawer. The video jumps to the moment I say the skill.
**Say:** "That's the exact moment. Words, no evidence."

### 2:10–2:30 | The contrast
**Click:** close the drawer, open Skill A's drawer.
**Say:** "Compare that to Skill A: timestamped observations of me actually doing it, no challenger objections, and the gate says yes. Same video, same pipeline, opposite result. That contrast is the product."

### 2:30–2:50 | Why you can trust the lock
**Say:** "The final call isn't made by a model. A small, unit-tested rule set makes it. If a stage times out, returns bad output, or comes back unsure, the node stays locked. It never unlocks because something broke."

**Optional click (if time):** Benchmark tab. **Say:** "We ran four test cases, baseline against the full pipeline. Here are the real counts: [REAL COUNTS]. Four cases is illustrative, not proof, and the README says that."

### 2:50–3:00 | Close
**Say:** "My Player doesn't score people. It separates shown from said, and it's honest when the answer is 'not enough evidence.' Thanks."

---

### If something goes wrong
- **Wifi down:** switch to offline replay. **Say:** "Wifi's gone, so this is a replay of sample fixtures. It's labeled SAMPLE, and it's not a live model run." (Or, if it's a cached real run: "This is a cached real run from [timestamp shown on screen].")
- **Decisions API errors:** the drawer will read "Rule-based fallback, Decisions API unavailable." **Say:** "The decision service didn't respond, so the app fell back to plain rules and told you so. That's the behavior we want."
- **A stage times out:** the node shows `insufficient_evidence`. **Say:** "Timed out, so it stays locked. Failure never unlocks."

### Don't say
"Industry first," "accurate," "proves," "AI hiring," or any number that isn't on screen.
