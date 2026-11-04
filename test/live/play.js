// Plays one full case in the real page with a live model through the CLI bridge, then writes a review report.
// Usage: node test/live/play.js [--setting=country_house|noir_docks|antarctic] [--preset=inspector|chief|yard] [--writer=quick|standard|deep] [--tier=quick|deep]
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { start } = require('./server');
const { liveInit } = require('./init');

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const SETTING = arg('setting', 'country_house'), PRESET = arg('preset', 'inspector'), WRITER = arg('writer', 'standard'), TIER = arg('tier', 'quick');
const SRC = path.join(__dirname, '..', '..', 'index.html');
const OUT = path.join(__dirname, 'out', `${new Date().toISOString().replace(/[:.]/g, '-')}-${SETTING}-${PRESET}`);
fs.mkdirSync(OUT, { recursive: true });
const wrap = (body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}</style></head><body>${body}</body></html>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const pageSrv = http.createServer((req, rsp) => { rsp.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); rsp.end(wrap(fs.readFileSync(SRC, 'utf8'))); });
  await new Promise((r) => pageSrv.listen(0, '127.0.0.1', r));
  const { srv: bridge, port } = await start(0);
  const url = `http://127.0.0.1:${pageSrv.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 1 });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript((s) => { localStorage.setItem('ir.settings.v1', JSON.stringify(s)); }, { tier: TIER, writer: WRITER, setting: SETTING, preset: PRESET, dials: null });
  await ctx.addInitScript(liveInit, { port });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errs.push('console: ' + m.text()); });
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png'), fullPage: true });
  const game = () => page.evaluate(() => JSON.parse(localStorage.getItem('ir.game.v1') || 'null'));
  const waitIdle = async (timeout = 400000) => { await page.waitForFunction(() => !document.querySelector('.b.thinking') && !!document.querySelector('[data-act=ask], .closed, [data-act=counsel]'), null, { timeout }); };

  await page.goto(url);
  await page.waitForSelector('[data-act=new]');
  say('menu ready; starting a case', SETTING, PRESET, 'writer', WRITER, 'suspects', TIER);
  await page.click('[data-act=new]');
  const t0 = Date.now();
  try { await page.waitForSelector('.file h2', { timeout: 900000 }); }
  catch (e) { await shot('gen-failed'); const err = await page.$eval('.err', (el) => el.textContent).catch(() => ''); say('GENERATION FAILED', err); fs.writeFileSync(path.join(OUT, 'FAILED.txt'), err + '\n' + errs.join('\n')); await browser.close(); bridge.close(); pageSrv.close(); process.exit(1); }
  const genMs = Date.now() - t0;
  let G = await game();
  const t = G.truth;
  say(`case open in ${(genMs / 1000).toFixed(0)}s: "${t.title}" killer=${t.killer} accomplice=${t.accomplice || 'none'} suspects=${t.suspects.map((s) => s.name + '(' + s.part + ')').join(', ')}`);
  await shot('01-casefile');

  // forensics: time of death and comms
  for (const id of ['tod', 'comms']) { await page.click(`[data-act=forensic][data-id=${id}]`); await page.waitForSelector(`[data-act=pin-forensic][data-id=${id}]`); await page.click(`[data-act=pin-forensic][data-id=${id}]`); await sleep(200); }

  const ask = async (name, text, tone = 'direct', presentPinId = null) => {
    await page.click('.tabs [data-act=tab][data-tab=interrogate]');
    await page.waitForSelector('#q, .closed');
    await page.click(`button.sus[data-name="${name.replace(/"/g, '\\"')}"]`);
    await sleep(150);
    if (await page.$('.closed')) { say(`  ${name} is closed (${await page.$eval('.closed', (e) => e.textContent.trim().slice(0, 80))})`); return null; }
    await page.click(`[data-act=tone][data-tone=${tone}]`);
    if (presentPinId) { await page.click('[data-act=present]'); await page.waitForSelector(`[data-act=present-choose][data-id="${presentPinId}"]`); await page.click(`[data-act=present-choose][data-id="${presentPinId}"]`); await sleep(150); }
    await page.fill('#q', text);
    await page.click('[data-act=ask]');
    await waitIdle();
    G = await game();
    const s = G.suspects[name]; const last = s.transcript.filter((m) => m.role === 'sus').slice(-1)[0];
    const lies = G.lieLog.filter((l) => l.msgId === last?.id);
    say(`  Q(${tone}) ${name}: ${text}`);
    say(`  A: ${(last?.text || '').replace(/\s+/g, ' ').slice(0, 220)}`);
    say(`     pressure ${s.pressure} ${s.state}; claims: ${lies.map((l) => l.label).join(',') || 'none'}`);
    return last;
  };

  const gap = t.alibiGap || {};
  const names = t.suspects.map((s) => s.name);
  const killer = t.killer;
  const pins = () => G.board.pins;
  const pinOf = (kind, msgId) => pins().find((p) => p.kind === kind && p.msgId === msgId);
  const pinQuote = async (name, msg, time) => {
    await page.click(`[data-act=pin-msg][data-id="${msg.id}"]`);
    await page.waitForSelector('#pin-text');
    if (time) await page.fill('#pin-time', time);
    await page.click('[data-act=pin-confirm]');
    await sleep(200); G = await game();
    return pins().find((p) => p.msgId === msg.id);
  };

  // round 1: everyone, gentle, whereabouts in the gap
  for (const n of names) { const m = await ask(n, `Where were you between ${gap.from} and ${gap.to}, and who can confirm it?`, 'gentle'); if (m) await pinQuote(n, m, gap.from); }
  // round 2: everyone, direct, what they saw of the others
  for (const n of names) await ask(n, `Did you see or hear any of the others after ${gap.from}? Be exact about times.`, 'direct');
  // round 3: motive probes to the killer and one other
  await ask(killer, `How did you get on with ${t.victim.name}? Any trouble between you lately?`, 'direct');
  const other = names.find((n) => n !== killer);
  await ask(other, `Is there anything you have not told me about last night?`, 'gentle');
  // confront the killer with the time-of-death report, then with their own pinned alibi
  const todPin = pinOf('forensic', 'tod');
  const m1 = await ask(killer, `This report puts the death inside the time you say you were elsewhere. Explain that.`, 'hard', todPin?.id);
  const alibiPin = pins().find((p) => p.kind === 'quote' && p.source === killer);
  if (alibiPin && todPin) { await page.click('.tabs [data-act=tab][data-tab=board]'); await page.waitForSelector(`[data-act=link-from][data-id="${alibiPin.id}"]`); await page.click(`[data-act=link-from][data-id="${alibiPin.id}"]`); await page.click(`[data-act=link-to][data-id="${todPin.id}"][data-type=contradicts]`); await sleep(200); }
  const m2 = await ask(killer, `Nobody can confirm where you were. I think you were with ${t.victim.name}. Tell me what happened.`, 'hard');
  if (m2) await pinQuote(killer, m2, gap.to);
  await shot('02-interrogate');
  G = await game();

  // accuse with the truth (tests scoring and the reveal, not deduction)
  await page.click('.tabs [data-act=tab][data-tab=accuse]');
  await page.waitForSelector('#acc-killer');
  await page.selectOption('#acc-killer', killer);
  if (await page.$('#acc-accomplice')) await page.selectOption('#acc-accomplice', t.accomplice || '');
  await page.fill('#acc-motive', t.motive);
  await page.fill('#acc-method', t.method);
  for (const cb of await page.$$('input[name=ev]')) await cb.check();
  await page.click('#accform button[type=submit]');
  await page.waitForSelector('[data-act=accuse-do]');
  await page.click('[data-act=accuse-do]');
  await page.waitForSelector('.score .big', { timeout: 600000 });
  await shot('03-verdict');
  await page.click('[data-act=reveal]');
  await page.waitForSelector('.lies');
  await shot('04-reveal');
  G = await game();

  // report
  const lines = [];
  lines.push(`# Live play: ${t.title}`, '', `Setting ${SETTING}, preset ${PRESET}, writer ${WRITER}, suspects ${TIER}. Generation ${(genMs / 1000).toFixed(0)}s. Page errors: ${errs.length ? errs.join(' | ') : 'none'}`, '');
  lines.push(`Killer: ${t.killer}. Accomplice: ${t.accomplice || 'none'}. Gap ${gap.from}-${gap.to}.`, `Motive: ${t.motive}`, `Method: ${t.method}`, '', `Cast: ${t.suspects.map((s) => `${s.name} (${s.part})`).join('; ')}`, '', `Audit problems on the final truth: (run validate for details)`, '');
  lines.push('## Score', `Total ${G.score.total} (${G.score.rank}): killer ${G.score.killer}, motive ${G.score.motive}, method ${G.score.method}, evidence ${G.score.evidence}${G.score.unscored ? ' [UNSCORED]' : ''}`, '', `Verdict: ${G.score.verdict}`, '', `Caught: ${(G.score.caught || []).join(' / ')}`, `Missed: ${(G.score.missed || []).join(' / ')}`, '');
  lines.push('## Transcript with referee labels');
  for (const b of G.briefs) {
    const s = G.suspects[b.name];
    lines.push('', `### ${b.name} (${b.part}) — final pressure ${s.pressure}, state ${s.state}`, `Lies in brief: ${b.lies.map((l) => l.claim).join(' || ') || 'none'}`, b.honestMistake ? `Honest mistake: ${b.honestMistake.claim}` : '', '');
    for (const m of s.transcript) {
      if (m.role === 'det') lines.push(`**Detective (${m.tone}${m.presented ? ', presenting ' + m.presented.source : ''}):** ${m.text}`);
      else if (m.role === 'sus') { lines.push(`**${b.name}:** ${m.text}${m.corrected ? ' _[referee corrected]_' : ''}${m.refereed === false ? ' _[no referee]_' : ''}`); const cl = G.lieLog.filter((l) => l.msgId === m.id); if (cl.length) lines.push(cl.map((l) => `  - ${l.label.toUpperCase()}: "${l.text}"${l.truth ? ' — truth: ' + l.truth : ''}`).join('\n')); }
      else lines.push(`_${m.text}_`);
      lines.push('');
    }
  }
  fs.writeFileSync(path.join(OUT, 'report.md'), lines.join('\n'));
  fs.writeFileSync(path.join(OUT, 'game.json'), JSON.stringify(G, null, 1));
  say('done. report:', path.join(OUT, 'report.md'));
  await browser.close(); bridge.close(); pageSrv.close();
})().catch((e) => { console.error('DRIVER ERROR', e); process.exit(1); });
