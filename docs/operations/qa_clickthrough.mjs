// qa_clickthrough.mjs — Operations UI click-through for My Player (SAMPLE QA harness).
// Usage: node qa_clickthrough.mjs [url=http://127.0.0.1:5173] [outdir=./shots]
// Needs playwright-core + a local Chrome (/usr/bin/google-chrome). No browser download.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://127.0.0.1:5173';
const out = process.argv[3] || './shots';
fs.mkdirSync(out, { recursive: true });
const STATES = ['unverified','evidence_pending','supported','insufficient_evidence','contradicted'];
const res = { url, at: new Date().toString(), checks: {}, consoleErrors: [], externalRequests: [], clicks: [] };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('console', m => { if (m.type() === 'error') res.consoleErrors.push(m.text()); });
p.on('pageerror', e => res.consoleErrors.push('pageerror: ' + e.message));
p.on('request', r => { const u = r.url(); if (!/^(http:\/\/(127\.0\.0\.1|localhost)|data:|blob:|about:)/.test(u)) res.externalRequests.push(u); });
await p.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
await p.screenshot({ path: `${out}/00_load.png`, fullPage: true });
const txt = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
let body = await txt();
const seen = new Set();
const note = t => { const l = t.toLowerCase(); for (const s of STATES) if (l.includes(s) || l.includes(s.replace('_', ' '))) seen.add(s); };
note(body);
const cands = await p.$$('button, [role=button], [role=tab], [data-state], [data-node], .node, a[href^="#"]');
let i = 0;
for (const el of cands.slice(0, 60)) {
  const label = ((await el.innerText().catch(() => '')) || (await el.getAttribute('aria-label')) || (await el.getAttribute('data-state')) || '').trim().slice(0, 60);
  if (/upload|delete|reset|push|deploy|send/i.test(label)) { res.clicks.push({ label, skipped: 'destructive/outbound' }); continue; }
  try { await el.click({ timeout: 2000 }); await p.waitForTimeout(400); i++;
    await p.screenshot({ path: `${out}/${String(i).padStart(2,'0')}_${label.replace(/\W+/g,'_').slice(0,30)}.png`, fullPage: true });
    note(await txt()); res.clicks.push({ label, ok: true });
    await p.keyboard.press('Escape').catch(() => {});
  } catch (e) { res.clicks.push({ label, ok: false, err: e.message.split('\n')[0] }); }
}
body = await txt();
res.checks.sample_label = /SAMPLE/.test(body) && /not a live model run/i.test(body);
res.checks.model_id_shown = /gemini[-\w.]*/i.test(body);
res.checks.offline_or_fallback_indicated = /offline|replay|fallback|unavailable|no key/i.test(body);
res.checks.rule_based_fallback_label = /Rule-based fallback, Decisions API unavailable/i.test(body);
res.checks.latency_ms_shown = /\d+\s?ms/.test(body);
res.checks.limitations_shown = /limitation/i.test(body);
res.checks.n4_disclaimer = /n\s?=\s?4.*illustrative/i.test(body);
res.checks.states_seen = [...seen]; res.checks.states_missing = STATES.filter(s => !seen.has(s));
res.checks.no_external_requests = res.externalRequests.length === 0;
res.checks.no_console_errors = res.consoleErrors.length === 0;
fs.writeFileSync(`${out}/clickthrough_result.json`, JSON.stringify(res, null, 2));
console.log(JSON.stringify(res.checks, null, 2), `\nclicks=${res.clicks.length} consoleErrors=${res.consoleErrors.length} external=${res.externalRequests.length}`);
await b.close();
