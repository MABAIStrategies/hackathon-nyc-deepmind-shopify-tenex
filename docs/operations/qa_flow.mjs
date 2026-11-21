// qa_flow.mjs — targeted My Player offline click-through (SAMPLE QA). Usage: node qa_flow.mjs URL OUTDIR
import { chromium } from 'playwright-core'; import fs from 'node:fs';
const url = process.argv[2] || 'http://127.0.0.1:8787/'; const out = process.argv[3] || './flow'; fs.mkdirSync(out, { recursive: true });
const R = { cases: [], errors: [], external: [], tabs: {} };
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox','--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
p.on('console', m => m.type() === 'error' && R.errors.push(m.text())); p.on('pageerror', e => R.errors.push('pageerror ' + e.message));
p.on('request', r => { const u = r.url(); if (!/^(http:\/\/(127\.0\.0\.1|localhost)|data:|blob:)/.test(u)) R.external.push(u); });
await p.goto(url, { waitUntil: 'networkidle' });
const body = async () => (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
const opts = await p.$$eval('select[aria-label="Sample case"] option', os => os.map(o => ({ v: o.value, t: o.textContent })));
let n = 0;
for (const o of opts) {
  const C = { case: o.v, title: o.t };
  await p.selectOption('select[aria-label="Sample case"]', o.v);
  C.before = await p.$$eval('.mp-node.big', ns => ns.map(x => x.dataset.state));
  await p.click('button.cta');
  await p.waitForTimeout(150); C.during = await p.$$eval('.mp-node.big', ns => ns.map(x => x.dataset.state));
  await p.screenshot({ path: `${out}/${++n}_${o.v}_during.png` });
  await p.waitForFunction(() => ![...document.querySelectorAll('.mp-node.big')].some(x => ['unverified','evidence_pending'].includes(x.dataset.state)), null, { timeout: 20000 }).catch(() => C.timeout = true);
  await p.waitForTimeout(800);
  C.after = await p.$$eval('.mp-node.big', ns => ns.map(x => x.dataset.state));
  C.stageText = (await p.$$eval('[class*=stage]', ns => ns.map(x => x.innerText.replace(/\s+/g,' ')).filter(t => /STAGE/i.test(t)))).slice(0,3);
  await p.screenshot({ path: `${out}/${++n}_${o.v}_after.png` });
  C.drawers = [];
  const whys = await p.$$('button.why');
  for (let i = 0; i < whys.length; i++) {
    const w = (await p.$$('button.why'))[i]; await w.click(); await p.waitForTimeout(300);
    const d = await p.$('aside.drawer'); if (!d) { C.drawers.push({ i, open: false }); continue; }
    const t = (await d.innerText()).replace(/\s+/g, ' ');
    const D = { i, open: true, cls: await d.getAttribute('class'), hasTs: !!(await d.$('button.ts')), hasProb: /probab|\d\.\d\d/i.test(t), hasLimit: /limitation/i.test(t), hasChallenger: /challenger/i.test(t), fallbackLbl: /Rule-based fallback, Decisions API unavailable/.test(t), sample: /SAMPLE/.test(t), text: t.slice(0, 400) };
    const ts = await d.$('button.ts');
    if (ts) { const before = await p.$eval('video', v => v.currentTime).catch(() => null); await ts.click(); await p.waitForTimeout(500); D.seek = { before, after: await p.$eval('video', v => v.currentTime).catch(() => null), label: await ts.innerText() }; }
    await p.screenshot({ path: `${out}/${++n}_${o.v}_drawer${i}.png` });
    await (await d.$('button.x'))?.click(); await p.waitForTimeout(200);
    C.drawers.push(D);
  }
  R.cases.push(C);
}
for (const tab of ['MY CARD', 'BENCHMARK', 'HOW IT WORKS']) {
  await p.click(`nav.tabs button:has-text("${tab}")`); await p.waitForTimeout(400);
  R.tabs[tab] = (await body()).slice(0, 1500); await p.screenshot({ path: `${out}/tab_${tab.replace(/ /g,'_')}.png`, fullPage: true });
}
await p.setViewportSize({ width: 390, height: 844 }); await p.click('nav.tabs button:has-text("SIGNATURE MOMENT")'); await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/mobile_390.png`, fullPage: true });
R.mobileOverflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
fs.writeFileSync(`${out}/flow_result.json`, JSON.stringify(R, null, 2));
console.log(JSON.stringify({ cases: R.cases.map(c => ({ case: c.case, before: c.before, during: c.during, after: c.after, timeout: c.timeout, stages: c.stageText, drawers: c.drawers.map(d => ({ open: d.open, cls: d.cls, ts: d.hasTs, seek: d.seek, prob: d.hasProb, lim: d.hasLimit, ch: d.hasChallenger, fb: d.fallbackLbl })) })), errors: R.errors, external: R.external, mobileOverflow: R.mobileOverflow }, null, 1));
await b.close();
