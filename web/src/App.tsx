import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzeResponse, GatedClaim, HealthResponse, NodeState, StageResult } from "../../shared/types";
import { analyzeLive, getBench, getHealth, listCachedRuns, replay } from "./api";

const STATE_LABEL: Record<NodeState, string> = {
  unverified: "Unverified",
  evidence_pending: "Evidence pending",
  supported: "Supported · unlocked",
  insufficient_evidence: "Locked · insufficient evidence",
  contradicted: "Locked · contradicted",
};
const SIGNATURE_CASE = "case2-unsupported-claim";
// Mark's own consented headshot (from mark-bockrath.com), optimized to 600px. Fixture DATA stays labeled SAMPLE.
const PLAYER_NAME = "Mark Bockrath";
const PLAYER_PHOTO = "/player/mark-bockrath.jpg";
const VERDICT: Record<NodeState, string> = {
  unverified: "Not yet run",
  evidence_pending: "Checking…",
  supported: "Unlocked",
  insufficient_evidence: "Locked",
  contradicted: "Locked",
};
type Tab = "signature" | "card" | "bench" | "about";

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("signature");
  useEffect(() => {
    getHealth()
      .then((h) => {
        setHealth(h);
        if (h.mode === "live") setTab((t) => (t === "signature" ? "card" : t)); // live demo starts on onboarding
      }).catch((e) => setErr(`Backend not reachable (${e.message}). Is "npm run dev" running?`));
  }, []);
  const isLive = health?.mode === "live";
  return (
    <div className="app">
      <ModeBanner health={health} />
      <header className="top">
        <img src="/creative/wordmark.svg" alt="My Player" className="wordmark" />
        <p className="tagline">Skills you show, not skills you say.</p>
        <nav className="tabs" role="tablist">
          {(
            [
              ["signature", "Signature moment"],
              ["card", "My card"],
              ["bench", "Benchmark"],
              ["about", "How it works"],
            ] as [Tab, string][]
          ).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </nav>
      </header>
      {err && <div className="alert">{err}</div>}
      <main>
        {tab === "signature" && <SignatureView health={health} />}
        {tab === "card" && <CardView health={health} isLive={isLive} />}
        {tab === "bench" && <BenchView />}
        {tab === "about" && <AboutView health={health} />}
      </main>
      <footer className="foot">
        Evidence about one video, not a judgment of a person. No hiring decisions, biometrics, or personality scoring.
      </footer>
    </div>
  );
}

function ModeBanner({ health }: { health: HealthResponse | null }) {
  if (!health) return <div className="banner banner--wait">Connecting to backend…</div>;
  if (health.mode === "live")
    return (
      <div className="banner banner--live">
        <b>● LIVE</b> real Gemini calls from this laptop's backend · SDK @google/genai {health.sdkVersion ?? "?"} · Decisions API:{" "}
        {health.decisionsApi}
        {health.substitutions.length > 0 && <span className="subs"> · {health.substitutions.length} model substitution(s), see How it works</span>}
      </div>
    );
  return (
    <div className="banner banner--sample">
      <b>SAMPLE / not a live model run</b> · OFFLINE REPLAY of hand-authored fixtures · no GEMINI_API_KEY in backend .env · the
      deterministic gate runs for real on the sample data
    </div>
  );
}

/* ---------------- Signature moment ---------------- */

function SignatureView({ health }: { health: HealthResponse | null }) {
  const cases = health?.sampleCases ?? [];
  const [caseId, setCaseId] = useState(SIGNATURE_CASE);
  const { run, phase, stageIdx, start, setRun, setPhase } = useReplay();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState<string | null>(null);
  // Switching cases clears the previous result so no stale state is shown against a different video.
  useEffect(() => {
    setRun(null);
    setPhase("idle");
    setOpen(null);
  }, [caseId, setRun, setPhase]);
  const fx = cases.find((c) => c.id === caseId);

  return (
    <section>
      <div className="sig-head">
        <div>
          <h1>Said aloud vs. shown on screen</h1>
          <p className="muted">
            Two claims, one video. The claim that is shown unlocks. The claim that is only said stays <b>LOCKED</b>, and the drawer says
            why.
          </p>
        </div>
        <div className="controls">
          <select value={caseId} onChange={(e) => setCaseId(e.target.value)} aria-label="Sample case" disabled={phase === "running"}>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <button className="cta" onClick={() => { setOpen(null); start(caseId); }} disabled={!fx || phase === "running"}>
            {phase === "running" ? "Replaying…" : run ? "Replay again" : "▶ Run SAMPLE replay"}
          </button>
        </div>
      </div>
      <div className="sig-grid">
        <div className="video-wrap">
          {fx?.videoUrl ? (
            <video ref={videoRef} src={fx.videoUrl} controls preload="metadata" />
          ) : (
            <div className="video-missing">SAMPLE video missing. Copy Delivery's mp4s into web/public/samples/.</div>
          )}
          <span className="tag-sample">SAMPLE synthetic video · not a real person</span>
          <StageBadges run={run} phase={phase} stageIdx={stageIdx} />
        </div>
        <div className="claims">
          <PlayerStrip
            nodes={(run?.gated ?? fx?.claims.map((c) => ({ claim: c }) as Partial<GatedClaim>) ?? []).map((g) => ({
              id: g.claim!.id,
              text: g.claim!.text,
              state: phase === "running" ? "evidence_pending" : ((g.state as NodeState) ?? "unverified"),
            }))}
          />
          {(run?.gated ?? fx?.claims.map((c) => ({ claim: c }) as Partial<GatedClaim>) ?? []).map((g, i) => {
            const state: NodeState = phase === "running" ? "evidence_pending" : (g.state as NodeState) ?? "unverified";
            const id = g.claim!.id;
            return (
              <ClaimPanel
                key={`${caseId}-${id}`}
                letter={String.fromCharCode(65 + i)}
                g={g as GatedClaim}
                state={state}
                active={open === id}
                onWhy={() => setOpen(open === id ? null : id)}
              />
            );
          })}
        </div>
      </div>
      {run && phase === "done" && <Verdict run={run} />}
      {run && open && phase === "done" && (
        <EvidenceDrawer run={run} g={run.gated.find((x) => x.claim.id === open)!} videoRef={videoRef} onClose={() => setOpen(null)} />
      )}
      {run && phase === "done" && <p className="fixture-note">{run.label}. Fixture: hand-authored from Delivery's labels.json; probabilities are illustrative, not measured.</p>}
    </section>
  );
}

function PlayerStrip({ nodes }: { nodes: { id: string; text: string; state: NodeState }[] }) {
  return (
    <div className="player-strip">
      <img className="ps-photo" src={PLAYER_PHOTO} alt={`${PLAYER_NAME} headshot`} />
      <div className="ps-body">
        <div className="claim-letter">Player card</div>
        <div className="ps-name">{PLAYER_NAME}</div>
        <div className="ps-role">Claims from SAMPLE case</div>
      </div>
      <div className="ps-nodes">
        {nodes.map((n) => (
          <div key={n.id} className={`mp-node ${n.state === "supported" ? "mp-unlock" : n.state === "evidence_pending" || n.state === "unverified" ? "" : "mp-deny"}`} data-state={n.state} title={`${n.text}: ${STATE_LABEL[n.state]}`}>
            <img src={`/creative/nodes/node-${n.state}.svg`} alt={STATE_LABEL[n.state]} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Verdict({ run }: { run: AnalyzeResponse }) {
  const up = run.gated.filter((g) => g.state === "supported").length;
  const locked = run.gated.length - up;
  const said = run.gated.find((g) => g.state !== "supported" && g.observations.some((o) => o.modality === "only_said_aloud") && !g.observations.some((o) => o.modality === "shown_on_screen"));
  const sayAt = said?.observations.find((o) => o.modality === "only_said_aloud");
  return (
    <div className="verdict" role="status">
      <span className="v-up">{up} unlocked</span>
      <span className="v-lock">{locked} locked</span>
      {said && sayAt && (
        <span className="v-why">
          “{said.claim.text}” was said at {fmtT(sayAt.t_start)} and never shown on screen. Said ≠ shown.
        </span>
      )}
    </div>
  );
}

function useReplay() {
  const [run, setRun] = useState<AnalyzeResponse | null>(null);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [stageIdx, setStageIdx] = useState(0);
  const start = useCallback(async (caseId: string) => {
    setPhase("running");
    setRun(null);
    setStageIdx(0);
    try {
      const r = await replay(caseId);
      // Staged reveal for readability only. Replay is instant; no latency is claimed (badges show "—").
      for (let i = 1; i <= 3; i++) {
        setStageIdx(i);
        await new Promise((res) => setTimeout(res, 800));
      }
      setStageIdx(4);
      setRun(r);
      setPhase("done");
    } catch (e) {
      alert((e as Error).message);
      setPhase("idle");
    }
  }, []);
  return { run, phase, stageIdx, start, setRun, setPhase };
}

function ClaimPanel({ letter, g, state, active, onWhy }: { letter: string; g: GatedClaim; state: NodeState; active: boolean; onWhy: () => void }) {
  const prev = useRef<NodeState>(state);
  const [anim, setAnim] = useState("");
  useEffect(() => {
    if (prev.current === "evidence_pending" && state !== "evidence_pending") {
      setAnim(state === "supported" ? "mp-unlock" : "mp-deny");
      const t = setTimeout(() => setAnim(""), 900);
      prev.current = state;
      return () => clearTimeout(t);
    }
    prev.current = state;
  }, [state]);
  const locked = state === "insufficient_evidence" || state === "contradicted";
  const done = state !== "evidence_pending" && state !== "unverified";
  return (
    <article className={`claim claim--${state} ${anim ? "claim--flash" : ""}`}>
      <div className={`mp-node big ${anim}`} data-state={state}>
        <img src={`/creative/nodes/node-${state}.svg`} alt="" />
      </div>
      <div className="claim-body">
        <div className="claim-top">
          <span className="claim-letter">Claim {letter}</span>
          <span className={`claim-verdict claim-verdict--${state}`}>{VERDICT[state]}</span>
        </div>
        <q className="claim-text">{g.claim.text}</q>
        <div className={`state-pill state-pill--${state}`}>{STATE_LABEL[state]}</div>
        {done && g.probability != null && <ProbBar p={g.probability} threshold={0.7} />}
        {done && (
          <button className={`why ${active ? "on" : ""} ${locked && !active ? "why--attn" : ""}`} onClick={onWhy}>
            {locked ? "Why is this locked?" : "Why did this unlock?"} {active ? "▴" : "▾"}
          </button>
        )}
        {done && locked && g.reasons?.[0] && <p className="reason-peek">{g.reasons[0]}</p>}
      </div>
    </article>
  );
}

function ProbBar({ p, threshold }: { p: number; threshold: number }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(p), 60); // animate from 0 to the value (CSS transition; off under reduced motion)
    return () => clearTimeout(t);
  }, [p]);
  const ok = p >= threshold;
  return (
    <div className="prob" title={`Rubric Gate P(yes) ${p.toFixed(2)}; unlock threshold ${threshold}`}>
      <div className="prob-head">
        <span className="prob-cap">Rubric Gate P(yes)</span>
        <span className={`prob-val ${ok ? "ok" : "no"}`}>{p.toFixed(2)}</span>
      </div>
      <div className="prob-track">
        <div className={`prob-fill ${ok ? "ok" : "no"}`} style={{ width: `${Math.round(w * 100)}%` }} />
        <div className="prob-thr" style={{ left: `${threshold * 100}%` }}>
          <span>unlock ≥ {threshold.toFixed(2)}</span>
        </div>
      </div>
      <div className="prob-lbl">{ok ? "At or above" : "Below"} the PROPOSED {threshold.toFixed(2)} threshold</div>
    </div>
  );
}

function fmtT(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

function EvidenceDrawer({ run, g, videoRef, onClose }: { run: AnalyzeResponse; g: GatedClaim; videoRef: React.RefObject<HTMLVideoElement>; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [g.claim.id, onClose]);
  const ans = run.stages.rubric.data?.per_claim.find((a) => a.claim_id === g.claim.id);
  const src = run.stages.rubric.data?.source;
  const seek = (t: number) => {
    const v = videoRef.current;
    if (v) {
      v.currentTime = t;
      v.play().catch(() => undefined);
      v.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };
  return (
    <aside ref={ref} className={`drawer drawer--${g.state}`} aria-label="Evidence drawer">
      <div className="drawer-head">
        <div>
          <div className="claim-letter">Evidence drawer · {run.runKind === "sample_fixture" ? "SAMPLE fixture" : run.label}</div>
          <h2>“{g.claim.text}”</h2>
          <div className={`state-pill state-pill--${g.state}`}>{STATE_LABEL[g.state]}</div>
        </div>
        <button className="x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="drawer-grid">
        <div>
          <h3>Gate decision (deterministic TypeScript)</h3>
          <ul className="reasons">{g.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          <h3>Stage 1 · Extractor observations</h3>
          {g.observations.length === 0 && <p className="muted">No observations for this claim.</p>}
          <ul className="obs">
            {g.observations.map((o, i) => (
              <li key={i} className={`obs--${o.modality}`}>
                <button className="ts" onClick={() => seek(o.t_start)} title="Seek video">
                  ▶ {fmtT(o.t_start)}–{fmtT(o.t_end)}
                </button>
                <span className={`mod mod--${o.modality}`}>{o.modality === "shown_on_screen" ? "SHOWN ON SCREEN" : "ONLY SAID ALOUD"}</span>
                <span className="obs-d">{o.description}</span>
                <span className="conf">conf {o.confidence.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Stage 2 · Challenger notes</h3>
          {!run.stages.challenger.ok && <p className="fail">Challenger failed: {run.stages.challenger.error}</p>}
          {g.challenger ? (
            <ul className="reasons">
              {g.challenger.contradictions.map((c, i) => <li key={`c${i}`} className="contra">Contradiction: {c}</li>)}
              {g.challenger.unsupported && <li>Flagged unsupported</li>}
              {g.challenger.missing_visual_proof.map((m, i) => <li key={`m${i}`}>Missing visual proof: {m}</li>)}
              {g.challenger.uncertainty && <li className="muted">Uncertainty: {g.challenger.uncertainty}</li>}
            </ul>
          ) : run.stages.challenger.ok ? <p className="muted">No note.</p> : null}
          <h3>Stage 3 · Rubric Gate {src === "rule_based_fallback" ? "(Rule-based fallback, Decisions API unavailable)" : src === "sample_fixture" ? "(SAMPLE fixture, not a Decisions API result)" : ""}</h3>
          {!run.stages.rubric.ok && <p className="fail">Rubric Gate did not run: {run.stages.rubric.error}</p>}
          {ans && (
            <>
              <ProbBar p={ans.probability} threshold={run.thresholds.support_probability} />
              <div className="stat-row">
                <div className="stat"><span>noul P(yes)</span><b>{ans.probability.toFixed(2)}</b><i>unlock ≥ {run.thresholds.support_probability.toFixed(2)}</i></div>
                {ans.confidence !== undefined && (
                  <div className="stat"><span>confidence</span><b>{ans.confidence.toFixed(2)}</b><i>min {run.thresholds.min_decision_confidence.toFixed(2)} (PROPOSED)</i></div>
                )}
              </div>
            </>
          )}
          {run.stages.rubric.data?.rubric && (
            <table className="rubric">
              <tbody>
                {Object.entries(run.stages.rubric.data.rubric).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k.replace(/_/g, " ")}</td>
                    <td>
                      <b>{v.toFixed(2)}</b> / 3 <span className="muted">(expected level; ≈{Math.round(v)})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {src === "rule_based_fallback" && run.stages.rubric.data?.fallback_reason && (
            <p className="fail small">Decisions API error: {run.stages.rubric.data.fallback_reason}</p>
          )}
          <h3>Limitations</h3>
          <ul className="reasons muted">{g.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      </div>
    </aside>
  );
}

function badgeKind(s: StageResult<unknown> | undefined, runKind?: string) {
  if (!s) return "sample";
  if (runKind === "sample_fixture") return s.model.includes("rule-based") ? "fallback" : "sample";
  if (!s.ok || s.model.startsWith("rule-based")) return "fallback";
  if (/substitut|generateContent/.test(s.model)) return "substituted";
  return "ran";
}

function StageBadges({ run, phase, stageIdx }: { run: AnalyzeResponse | null; phase: string; stageIdx?: number }) {
  const rows: [string, StageResult<unknown> | undefined][] = [
    ["Stage 1 · Extractor", run?.stages.extractor],
    ["Stage 2 · Challenger", run?.stages.challenger],
    ["Stage 3 · Rubric Gate", run?.stages.rubric],
  ];
  return (
    <div className="badges pipeline-strip">
      {rows.map(([name, s], i) => {
        const kind = badgeKind(s, run?.runKind);
        const step = phase === "running" ? (stageIdx && stageIdx - 1 > i ? "done" : stageIdx && stageIdx - 1 === i ? "active" : "queued") : s ? "done" : "idle";
        const status = phase === "running" ? (step === "done" ? "DONE" : step === "active" ? "RUNNING…" : "QUEUED") : !s ? "IDLE" : s.timedOut ? "TIMEOUT" : !s.ok ? "FAILED" : kind === "sample" ? "SAMPLE" : kind === "fallback" ? (run?.runKind === "sample_fixture" ? "SAMPLE · FALLBACK" : "FALLBACK") : "RAN";
        return (
          <div key={name} className={`mp-badge mp-badge--${kind} stage stage--${step}`} style={{ animationDelay: `${i * 120}ms` }}>
            <span className="mp-badge__stage"><b className="stage-n">{i + 1}</b>{name.replace(/^Stage \d · /, "")}</span>
            <span className="mp-badge__status">{status}</span>
            <span className="mp-badge__model">{s ? s.model : "—"}</span>
            <span className="mp-badge__ms">{s?.latencyMs != null ? `${s.latencyMs} ms` : "— ms"}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- My card (onboard + live analyze) ---------------- */

function CardView({ health, isLive }: { health: HealthResponse | null; isLive: boolean }) {
  const [name, setName] = useState(PLAYER_NAME);
  const [role, setRole] = useState("");
  const [photo, setPhoto] = useState<string | null>(PLAYER_PHOTO); // Mark's own consented headshot
  const [consent, setConsent] = useState(true);
  const [claims, setClaims] = useState(["", "", ""]);
  const [video, setVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [run, setRun] = useState<AnalyzeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [sampleId, setSampleId] = useState(SIGNATURE_CASE);
  const [pending, setPending] = useState<{ id: string; text: string }[]>([]);
  const [cached, setCached] = useState<AnalyzeResponse[]>([]);
  useEffect(() => { if (isLive) listCachedRuns().then(setCached).catch(() => undefined); }, [isLive, run]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cleanClaims = claims.map((t, i) => ({ id: `c${i + 1}`, text: t.trim() })).filter((c) => c.text);

  const go = async (forceSample = false) => {
    setError(null);
    setBusy(true);
    setRun(null);
    setOpen(null);
    const sampleClaims = health?.sampleCases.find((c) => c.id === sampleId)?.claims ?? [];
    setPending(isLive && !forceSample ? cleanClaims : sampleClaims);
    if (!(isLive && !forceSample)) setVideoUrl(health?.sampleCases.find((c) => c.id === sampleId)?.videoUrl ?? null);
    try {
      if (isLive && !forceSample) {
        if (!video) throw new Error("Choose a proof video first.");
        if (!cleanClaims.length) throw new Error("Add at least one skill claim.");
        setRun(await analyzeLive(video, cleanClaims));
      } else {
        const r = await replay(sampleId);
        await new Promise((res) => setTimeout(res, 1600)); // staged reveal only; no latency is claimed for SAMPLE
        setRun(r);
        setVideoUrl(r.videoUrl);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const nodes: { id: string; text: string; state: NodeState }[] = run
    ? run.gated.map((g) => ({ id: g.claim.id, text: g.claim.text, state: g.state }))
    : (busy && pending.length ? pending : cleanClaims.length ? cleanClaims : [{ id: "c1", text: "Skill A" }, { id: "c2", text: "Skill B" }, { id: "c3", text: "Skill C" }]).map((c) => ({
        ...c,
        state: busy ? "evidence_pending" : video ? "unverified" : "unverified",
      }));

  return (
    <section className="card-view">
      <form className="onboard" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <h2>1 · Onboard</h2>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></label>
        <label>Role<input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Data analyst" /></label>
        <label className="check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I consent to using my photo and video on
          this card. The photo stays in this browser and is never analyzed.
        </label>
        <label>
          Photo (consented)
          <input type="file" accept="image/*" disabled={!consent} onChange={(e) => { const f = e.target.files?.[0]; setPhoto(f ? URL.createObjectURL(f) : null); }} />
        </label>
        <h2>2 · Three skill claims</h2>
        {claims.map((c, i) => (
          <input key={i} value={c} maxLength={120} placeholder={`Skill claim ${i + 1}`} onChange={(e) => setClaims(claims.map((x, j) => (j === i ? e.target.value : x)))} />
        ))}
        <h2>3 · Proof video</h2>
        {isLive ? (
          <>
            <input type="file" accept="video/*" disabled={!consent} onChange={(e) => { const f = e.target.files?.[0] ?? null; setVideo(f); setVideoUrl(f ? URL.createObjectURL(f) : null); setRun(null); }} />
            <p className="small muted">Keep it under 60 s. Uploaded once via the Files API; the URI is reused for all three stages and cached locally.</p>
          </>
        ) : (
          <>
            <p className="small warn">
              OFFLINE REPLAY: no key in the backend .env, so uploaded videos are NOT analyzed. Pick a SAMPLE case; its own claims are shown
              (your typed claims are not used with sample evidence).
            </p>
            <select value={sampleId} onChange={(e) => setSampleId(e.target.value)}>
              {health?.sampleCases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </>
        )}
        <button className="cta" disabled={busy || (isLive && (!consent || !video))}>{busy ? "Analyzing…" : isLive ? "Analyze (LIVE)" : "Replay SAMPLE"}</button>
        {isLive && (
          <details className="fallback-replay">
            <summary>Wifi down? Replay a SAMPLE case instead</summary>
            <p className="small warn">This is a replay of hand-authored SAMPLE fixtures, not a live model run. Say so out loud.</p>
            <select value={sampleId} onChange={(e) => setSampleId(e.target.value)}>
              {health?.sampleCases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <button type="button" className="why" onClick={() => go(true)} disabled={busy}>Replay SAMPLE</button>
            {cached.length > 0 && (
              <>
                <p className="small">Or replay a cached REAL run from this laptop (shows its original timestamp):</p>
                {cached.map((c, i) => (
                  <button type="button" key={i} className="why" onClick={() => { setRun({ ...c, runKind: "cached_live", label: `CACHED real run from ${new Date(c.createdAt).toLocaleString()} (not re-run)` }); setVideoUrl(c.videoUrl); setOpen(null); }}>
                    {new Date(c.createdAt).toLocaleTimeString()} · {c.claims.map((x) => x.text).join(" / ").slice(0, 60)}
                  </button>
                ))}
              </>
            )}
          </details>
        )}
        {error && <p className="fail">{error}</p>}
      </form>
      <div className="card-col">
        <div className="mp-card">
          <div className="mp-card__photo" style={photo ? { backgroundImage: `url(${photo})` } : undefined}>
            {!photo && <span className="nophoto">No photo</span>}
          </div>
          <div className="mp-card__name">{name || "Your name"}</div>
          <div className="mp-card__role">{role || "Proof-gated player card"}</div>
          <div className="mp-card__nodes">
            {nodes.map((n) => (
              <button key={n.id} className={`mp-node ${run ? (n.state === "supported" ? "mp-unlock" : "mp-deny") : ""}`} data-state={n.state} onClick={() => run && setOpen(n.id)} title={n.text}>
                <img src={`/creative/nodes/node-${n.state}.svg`} alt={STATE_LABEL[n.state]} />
                <span className="node-txt">{n.text.length > 22 ? n.text.slice(0, 21) + "…" : n.text}</span>
              </button>
            ))}
          </div>
          {run?.runKind === "sample_fixture" && <div className="card-sample">SAMPLE</div>}
        </div>
        {videoUrl && <video ref={videoRef} src={videoUrl} controls className="card-video" />}
        {(run || busy) && <StageBadges run={run} phase={busy ? "running" : "done"} />}
        {run && <p className="fixture-note">{run.label}</p>}
      </div>
      {(run || busy) && (
        <div className="card-claims">
          {(run ? run.gated : pending.map((c) => ({ claim: c }) as GatedClaim)).map((g, i) => (
            <ClaimPanel
              key={g.claim.id}
              letter={String.fromCharCode(65 + i)}
              g={g}
              state={busy ? "evidence_pending" : g.state}
              active={open === g.claim.id}
              onWhy={() => setOpen(open === g.claim.id ? null : g.claim.id)}
            />
          ))}
        </div>
      )}
      {run && open && <EvidenceDrawer run={run} g={run.gated.find((g) => g.claim.id === open)!} videoRef={videoRef} onClose={() => setOpen(null)} />}
    </section>
  );
}

/* ---------------- Benchmark ---------------- */

type BenchRow = { pipeline: string; correct_support: number | null; incorrect_support: number | null; correct_rejection: number | null; false_refusal?: number | null; abstention: number | null; errors: number | null; median_latency_ms: number | null };
function BenchView() {
  const [b, setB] = useState<any>(null);
  useEffect(() => { getBench().then(setB).catch(() => setB({ status: "error" })); }, []);
  const empty = (pipeline: string): BenchRow => ({ pipeline, correct_support: null, incorrect_support: null, correct_rejection: null, false_refusal: null, abstention: null, errors: null, median_latency_ms: null });
  const rows: BenchRow[] = b?.rows ?? [empty("Stage-1-only baseline (PROPOSED rule)"), empty("Full 3-stage pipeline")];
  const isSample = b?.mode !== "live";
  return (
    <section>
      <h1>Benchmark · Stage-1-only baseline vs full 3-stage pipeline</h1>
      <p className="muted">n=4, illustrative, not statistically meaningful. Ground truth: Delivery's labels.json (SAMPLE synthetic videos).</p>
      {(!b || b.status === "not_run") && (
        <p className="warn">Not run yet. On a laptop with GEMINI_API_KEY: <code>npm run bench -- --mode live</code>. Counts appear here only from real runs.</p>
      )}
      {b && b.status !== "not_run" && (
          <div className={`banner ${isSample ? "banner--sample" : "banner--live"}`}>
            {isSample ? <b>SAMPLE / not a live model run: replay of hand-authored fixtures through the real gate. Not a model benchmark.</b> : <b>LIVE run {b.ranAt}</b>}
          </div>
      )}
        <>
          <div className="bench-key">
            <div className="bk bk--hot"><b>Incorrect support</b><span>Unlocked a claim the video doesn't show. The failure My Player exists to prevent. Lower is better.</span></div>
            <div className="bk"><b>Correct rejection</b><span>Kept a said-but-not-shown claim locked. Higher is better.</span></div>
            <div className="bk"><b>False refusal</b><span>Locked a claim the video does show. The cost of being strict.</span></div>
          </div>
          <table className="bench">
            <thead>
              <tr><th>Pipeline</th><th>Correct support</th><th className="hot">Incorrect support</th><th>Correct rejection</th><th>False refusal</th><th>Abstention</th><th>Errors</th><th>Median latency</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.pipeline}>
                  <td>{r.pipeline}</td>
                  {[r.correct_support, r.incorrect_support, r.correct_rejection, r.false_refusal ?? null, r.abstention, r.errors].map((v, i) => <td key={i} className={`${i === 1 ? "hot" : ""} ${v == null ? "unfilled" : ""}`}>{v ?? "[REAL COUNTS]"}</td>)}
                  <td>{r.median_latency_ms != null ? `${r.median_latency_ms} ms` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {b?.models && <p className="small muted">Models: {JSON.stringify(b.models)}</p>}
        </>
    </section>
  );
}

/* ---------------- About ---------------- */

function AboutView({ health }: { health: HealthResponse | null }) {
  const smoke = useMemo(() => health?.smoke ?? [], [health]);
  return (
    <section className="about">
      <h1>How it works</h1>
      <ol className="pipeline">
        <li><b>Upload once</b> · Files API; the same URI feeds all stages; cached in data/cache.json by video hash.</li>
        <li><b>Stage 1 · Extractor</b> · timestamped observations, each tagged <i>shown_on_screen</i> or <i>only_said_aloud</i>.</li>
        <li><b>Stage 2 · Challenger</b> · re-watches with Stage 1 output and looks for contradictions and missing proof.</li>
        <li><b>Stage 3 · Rubric Gate</b> · Decisions API: noul P(yes) per skill + 0–3 scores. If unavailable: labeled rule-based fallback.</li>
        <li><b>Deterministic gate</b> · unit-tested TypeScript. Timeouts (45 s/stage), malformed JSON, low confidence ⇒ insufficient_evidence. Never unlocks on failure.</li>
      </ol>
      <h2>Runtime provenance</h2>
      <table className="rubric">
        <tbody>
          <tr><td>Mode</td><td>{health?.modeLabel ?? "?"}</td></tr>
          <tr><td>@google/genai</td><td>{health?.sdkVersion ?? "?"}</td></tr>
          <tr><td>Extractor</td><td>{health?.models.extractor}</td></tr>
          <tr><td>Challenger</td><td>{health?.models.challenger}</td></tr>
          <tr><td>Rubric Gate</td><td>{health?.models.rubric} · Decisions API {health?.decisionsApi}</td></tr>
          {health?.substitutions.map((s, i) => <tr key={i}><td>Substitution</td><td>{s}</td></tr>)}
          {smoke.map((s, i) => <tr key={`s${i}`}><td>Smoke {s.model}</td><td>{s.ok ? `OK ${s.latencyMs} ms` : `FAIL ${s.error}`}</td></tr>)}
        </tbody>
      </table>
      <h2>Node states</h2>
      <div className="legend">
        {(Object.keys(STATE_LABEL) as NodeState[]).map((s) => (
          <div key={s} className="mp-node" data-state={s}><img src={`/creative/nodes/node-${s}.svg`} alt="" /><span>{s}</span></div>
        ))}
      </div>
    </section>
  );
}
