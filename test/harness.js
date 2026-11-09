// E2E harness for Interrogation Room. Usage: node harness.js [path/to/index.html] [--only=name,name]
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const canned = require('./canned');
const { mockInit, hotInit } = require('./mock');

const SRC = process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) || path.join(__dirname, '..', 'index.html');
const ONLY = ((process.argv.find((a) => a.startsWith('--only=')) || '').slice(7)).split(',').filter(Boolean);
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));

const clone = (x) => JSON.parse(JSON.stringify(x));
// unified forensic keys for the generated case; the raw canned truth keeps the old keys for migration tests
const truthU = clone(canned.truth);
truthU.forensics = { tod: canned.truth.forensics.tod, prints: canned.truth.forensics.prints, comms: canned.truth.forensics.exchange, tox: canned.truth.forensics.tox, logs: canned.truth.forensics.staff };
const BASE = { truth: truthU, briefs: canned.briefs.briefs };
const TITLE = truthU.title;
const INSPECTOR = { suspects: 4, liars: 1, accomplice: false, mistaken: true, hours: 6 };

const SET = {
  country_house: { era: 'England, November 1924', blurb: 'A shooting-party weekend', fo: ['Police surgeon: time of death', 'Fingerprint comparison', 'Telephone exchange log', 'Home Office analyst: toxicology', 'Servants’ movements and key register'], refuse: 'Wants a solicitor', present: 'Solicitor present', wait: 'Wait for the solicitor', minutes: 45, refuseLine: 'refuses to go on without a solicitor.', crew: 'The household', start: '08:00' },
  noir_docks: { era: 'San Pedro waterfront, California, February 1947', blurb: 'Fog over the cargo piers', fo: ['Coroner: time of death', 'Police lab: fingerprints', 'Telephone company: call records', 'City lab: toxicology and ballistics', 'Harbour master’s log and tide tables'], refuse: 'Wants a lawyer', present: 'Lawyer present', wait: 'Wait for the lawyer', minutes: 45, refuseLine: 'wants a lawyer and stops talking.', crew: 'The people on the pier', start: '06:00' },
  antarctic: { era: 'British station on the ice shelf, midwinter 1983', blurb: 'Nine people, four months of dark', fo: ['Station doctor: time of death', 'Fingerprints (station lab; gloves limit it)', 'Radio log and telex record', 'Lab assay: toxicology and air samples', 'Generator, door and cold-porch logs'], refuse: 'Wants the commander present', present: 'Commander present', wait: 'Fetch the base commander', minutes: 20, refuseLine: 'will not say another word without the commander present.', crew: 'The crew', start: '07:00' },
};

const wrap = (body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}</style></head><body>${body}</body></html>`;
const TRAINING_OK = JSON.stringify({ country_house: { settingId: 'country_house', truth: truthU, briefs: canned.briefs.briefs } }).replace(/</g, '\\u003c');

let failures = 0, passes = 0;
function ok(cond, label) { if (cond) passes++; else { failures++; console.log('  FAIL', label); } }

// ---------- server ----------
function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      let html = fs.readFileSync(SRC, 'utf8').replace(/<script type="application\/json" id="training-data">[\s\S]*?<\/script>\n/, '');
      const q = new URL(req.url, 'http://x').searchParams.get('training');
      if (q) {
        const block = `<script type="application/json" id="training-data">${q === 'bad' ? '{ "country_house": { not json' : TRAINING_OK}</script>\n`;
        const i = html.indexOf('\n<script>\n'); html = html.slice(0, i + 1) + block + html.slice(i + 1);
      }
      rsp.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); rsp.end(wrap(html));
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

// ---------- helpers ----------
let browser, BASEURL;
async function newCtx(vp, { scheme = 'dark', over = {}, seed = null, local = null, hot } = {}) {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (local) await ctx.addInitScript((l) => { if (!localStorage.getItem('__seededLocal')) { for (const [k, v] of Object.entries(l)) localStorage.setItem(k, JSON.stringify(v)); localStorage.setItem('__seededLocal', '1'); } }, local);
  await ctx.addInitScript(mockInit, { base: BASE, seed, over });
  if (hot !== undefined) await ctx.addInitScript(hotInit, hot);
  return ctx;
}
async function open(vp, opts = {}, url = '') {
  const ctx = await newCtx(vp, opts);
  const page = await ctx.newPage(); const errs = []; watch(page, errs); global.__page = page;
  await page.goto(BASEURL + url);
  await page.waitForSelector('.head');
  return { ctx, page, errs };
}
function watch(page, errs) {
  page.on('pageerror', (e) => errs.push('pageerror: ' + (e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|net::|Failed to load resource/.test(m.text())) errs.push('console.error: ' + m.text()); });
}
let shotN = 0;
async function screen(page, tag, label) {
  const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  ok(ov.sw <= ov.iw, `[${tag}] no horizontal overflow on ${label} (${ov.sw} <= ${ov.iw})`);
  if (ov.sw > ov.iw) console.log('    wide:', await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 8).map((e) => `${e.tagName}.${e.className} w=${Math.round(e.getBoundingClientRect().width)}`).join(' | ')));
  const clipped = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('.tab span, .btn, .brand, .sus .nm, .t-head .stt, .step .st, .badge, .chip, .seg button, .score .parts span, .scard b, .dial .k, .lpair .lmid span, .tr-sus summary, .career span')) {
      if (!el.offsetParent) continue;
      if (el.scrollWidth > el.clientWidth + 1) { const cs = getComputedStyle(el); if (cs.textOverflow !== 'ellipsis') bad.push(`${el.className}:${el.textContent.trim().slice(0, 30)} (${el.scrollWidth}>${el.clientWidth})`); }
    }
    // a visible element wider than the viewport
    for (const el of document.querySelectorAll('#app *, #modal *')) { const r = el.getBoundingClientRect(); if (r.width > window.innerWidth + 1 && el.offsetParent) { bad.push(`wide ${el.tagName}.${el.className}`); break; } }
    return bad;
  });
  ok(!clipped.length, `[${tag}] no clipped labels on ${label} ${clipped.join(' | ')}`);
  const file = path.join(OUT, `${tag}-${String(++shotN).padStart(3, '0')}-${label.replace(/\W+/g, '_')}.png`);
  await page.screenshot({ path: file, fullPage: false });
}
async function bothSchemes(page, tag, label) {
  await page.emulateMedia({ colorScheme: 'dark' }); await screen(page, tag, label + '-dark');
  const bgD = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: 'light' }); await screen(page, tag, label + '-light');
  const bgL = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(bgD === 'rgb(15, 24, 21)' && bgL === 'rgb(228, 225, 213)', `[${tag}] theme tokens switch on ${label} (${bgD} / ${bgL})`);
  await page.emulateMedia({ colorScheme: 'dark' });
}
const idle = (page) => page.waitForFunction(() => !document.querySelector('[data-act=stop]') && !document.querySelector('.b.thinking'), null, { timeout: 15000 });
const clockText = (page) => page.$eval('.clock b', (e) => e.textContent.trim());
const parseClock = (t) => { if (/Out of time/.test(t)) return 0; const m = /(?:(\d+)h )?(\d+)m/.exec(t); return (+(m[1] || 0)) * 60 + (+m[2]); };
const clock = async (page) => parseClock(await clockText(page));
const act = (page, a, extra = '') => page.click(`[data-act="${a}"]${extra}`);
async function tab(page, name) { await page.click(`.tab[data-tab="${name}"] >> visible=true`); }
async function ask(page, q, how = 'click') {
  await page.fill('#q', q);
  if (how === 'enter') await page.press('#q', 'Enter'); else await act(page, 'ask');
  await idle(page);
}
async function pickSus(page, name) { await page.click(`.sus[data-name="${name}"]`); }
const tHead = (page) => page.$eval('.t-head', (e) => e.textContent.replace(/\s+/g, ' ').trim());
const pressure = async (page) => +(/pressure (\d+)/.exec(await tHead(page)) || [])[1];
const lastSusText = (page) => page.$$eval('#msgs .msg.sus .b', (els) => els[els.length - 1].textContent);
const game = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ir.game.v1') || 'null'));
const book = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ir.casebook.v1') || '[]'));
const mlog = (page, kind) => page.evaluate((k) => window.__log.filter((x) => !k || x.kind === k), kind);
const dbLog = (page) => page.evaluate(() => window.__dbLog.slice());
const fakeDb = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb') || '{}'));
const setCfg = (page, o) => page.evaluate((x) => window.__setCfg(x), o);
const ready = (page) => page.waitForFunction(() => document.querySelector('[data-act=new]') && !document.querySelector('[data-act=new]').disabled);
async function newCase(page, preset) {
  if (preset) await act(page, 'preset', `[data-id=${preset}]`);
  await act(page, 'new');
  await page.waitForSelector('.file', { timeout: 15000 });
}
async function pinFirstScene(page) { await tab(page, 'case'); await page.click('[data-act=pin-scene] >> nth=0'); }
async function accuse(page, killer, accomplice) {
  await tab(page, 'accuse');
  await page.selectOption('#acc-killer', killer);
  if (accomplice !== undefined) await page.selectOption('#acc-accomplice', accomplice);
  await page.fill('#acc-motive', 'The loan was being called in and the will changed.');
  await page.fill('#acc-method', 'Struck him with the bronze bookend in the study at eleven.');
  await page.check('input[name=ev] >> nth=0');
  await page.click('#accform button[type=submit]');
  await page.waitForSelector('[data-act=accuse-do]');
  await act(page, 'accuse-do');
  await page.waitForSelector('.score .big', { timeout: 10000 });
  return {
    total: +(await page.$eval('.score .big', (e) => e.textContent)),
    killer: await page.$eval('.parts span', (e) => e.querySelector('b').textContent),
    text: await page.$eval('.score ~ .rule + p', (e) => e.textContent),
  };
}
async function toHomeWithCaseInProgress(page) {
  // case menu -> casebook -> open a finished case -> Back: lands on the menu with the Resume card
  await act(page, 'menu'); await act(page, 'casebook'); await page.click('#modal .cb');
  await page.waitForSelector('[data-act=replay]'); await act(page, 'home');
  await page.waitForSelector('[data-act=resume]');
}
const errsOk = (tag, errs, what) => ok(!errs.length, `[${tag}] no page/console errors in ${what} ${errs.join(' | ')}`);

// ================= 1. main flow (country house, inspector, cloud on) =================
async function mainFlow(vp, tag) {
  const { ctx, page, errs } = await open(vp);
  await ready(page);
  ok(!(await page.$('[data-act=training]')), `[${tag}] no training button without training data`);
  await bothSchemes(page, tag, 'menu');

  await act(page, 'new');
  await page.waitForSelector('.step.on');
  await page.waitForFunction(() => /KB/.test(document.querySelector('[data-gen=truth]')?.textContent || ''), null, { timeout: 5000 });
  ok(true, `[${tag}] gen truth step streams KB`);
  await screen(page, tag, 'generating');
  await page.waitForFunction(() => document.querySelectorAll('.step')[0]?.classList.contains('done') && /KB|thinking/.test(document.querySelector('[data-gen=briefs]')?.textContent || ''), null, { timeout: 5000 });
  ok((await page.$$('.step')).length === 2 && !(await page.$('[data-gen=repair]')), `[${tag}] good truth: no repair step row`);
  await page.waitForSelector('.file', { timeout: 15000 });
  ok(await page.$eval('.head-title', (e) => e.textContent) === TITLE, `[${tag}] lands on case file with title`);
  ok(!(await mlog(page, 'repair')).length, `[${tag}] auditTruth finds no problems in the canned case (no repair call)`);
  const tp = (await mlog(page, 'truth'))[0].prompt;
  ok(/CAST \(exactly 4 suspects;/.test(tp) && /Parts, in this order: killer, mistaken, liar, honest\./.test(tp) && /"accomplice": null/.test(tp), `[${tag}] inspector truth prompt: 4 suspects, parts, accomplice null`);
  ok(/"tod": "result", "prints": "result", "comms": "result", "tox": "result", "logs": "result"/.test(tp), `[${tag}] truth prompt uses unified forensic keys`);
  const lines = await page.$$eval('.file > p', (els) => els.map((e) => e.textContent));
  ok(lines[0].startsWith('England, November 1924.') && lines[1] === '4 suspects. a killer, 1 liar hiding something else, an honest witness who is wrong about one thing, 1 honest.', `[${tag}] case file heading lines (${lines[1]})`);
  await screen(page, tag, 'casefile');

  // case file
  ok(await clock(page) === 360, `[${tag}] clock starts at 6h`);
  await page.click('[data-act=pin-scene] >> nth=0');
  ok(await page.$eval('[data-act=pin-scene] >> nth=0', (e) => e.disabled && /Pinned/.test(e.textContent)), `[${tag}] scene pin disables button`);
  await page.click('[data-act=forensic][data-id=tod]');
  ok(await clock(page) === 320, `[${tag}] forensic deducts 40m`);
  ok(await page.$('.fo .res') != null, `[${tag}] forensic result shown`);
  await page.click('[data-act=pin-forensic][data-id=tod]');
  ok(await page.$eval('[data-act=pin-forensic][data-id=tod]', (e) => e.disabled), `[${tag}] forensic pinned`);
  await page.click('[data-act=present-forensic][data-id=tod]');
  await page.waitForSelector('.composer');
  ok(/Presenting: Police surgeon/.test(await page.$eval('.chip.info', (e) => e.textContent)), `[${tag}] present jumps to interrogate with chip`);

  // interrogate
  await pickSus(page, 'Mrs Constance Varley');
  ok(/Mrs Constance Varley/.test(await tHead(page)), `[${tag}] roster switches suspect`);
  await pickSus(page, 'Albert Pruett');
  await page.fill('#q', 'Where were you at eleven?');
  await act(page, 'tone', '[data-tone=gentle]');
  ok(await page.$eval('#q', (e) => e.value) === 'Where were you at eleven?', `[${tag}] draft survives tone change`);
  await pickSus(page, 'Miss Iris Dunmore');
  ok(await page.$eval('#q', (e) => e.value) === 'Where were you at eleven?', `[${tag}] draft survives suspect switch`);
  await pickSus(page, 'Albert Pruett');
  const before = await clock(page), p0 = await pressure(page);
  await setCfg(page, { refParaphrase: true });
  await page.press('#q', 'Enter');
  await page.waitForSelector('[data-act=stop]');
  ok(await page.$eval('#q', (e) => e.disabled), `[${tag}] textarea disabled while asking`);
  await page.waitForFunction(() => { const b = [...document.querySelectorAll('.msg.sus .b')].pop(); return b && /reply #/.test(b.textContent); });
  ok(true, `[${tag}] suspect bubble streams`);
  await idle(page);
  await setCfg(page, { refParaphrase: false });
  ok(/Pruett reply #\d+: I was in the billiard room the whole evening/.test(await lastSusText(page)), `[${tag}] final text in place`);
  ok(await page.$eval('#q', (e) => e.value) === '', `[${tag}] Enter sends and clears draft`);
  ok(await clock(page) === before - 5, `[${tag}] question costs 5m`);
  ok(await pressure(page) === p0 + 3, `[${tag}] pressure updated`);
  ok((await page.$$('.msg.det .pres')).length === 1, `[${tag}] presented item shown on detective bubble`);
  ok(!(await page.$('.chip.info')), `[${tag}] presenting chip cleared after ask`);
  const vis = await page.evaluate(() => { const last = [...document.querySelectorAll('#msgs .msg')].pop().getBoundingClientRect(); const comp = document.querySelector('.composer').getBoundingClientRect(); return { lb: Math.round(last.bottom), ct: Math.round(comp.top) }; });
  ok(vis.lb <= vis.ct + 1, `[${tag}] last message not hidden behind composer (${vis.lb} <= ${vis.ct})`);
  await setCfg(page, { refDup: true });
  await ask(page, 'And the whisky tray?', 'click');
  await setCfg(page, { refDup: false });
  ok(await page.$eval('#q', (e) => e.value) === '', `[${tag}] Ask click clears draft`);
  await bothSchemes(page, tag, 'interrogate');

  await page.fill('#q', 'Explain this, then.');
  await act(page, 'present');
  await page.waitForSelector('.picker button');
  await page.click('.picker button >> nth=0');
  await page.waitForSelector('.chip.info');
  ok(await page.$eval('#q', (e) => e.value) === 'Explain this, then.', `[${tag}] draft survives choosing evidence to present`);
  await act(page, 'ask'); await idle(page);

  await page.click('.msg.sus [data-act=pin-msg] >> nth=-1');
  await page.waitForSelector('#pin-text');
  await page.fill('#pin-time', '23:10');
  await screen(page, tag, 'pin-sheet');
  await act(page, 'pin-confirm');
  ok(await page.$eval('#modal', (e) => e.hidden), `[${tag}] pin sheet closes`);
  ok(/Pin another quote/.test(await page.$eval('.msg.sus [data-act=pin-msg] >> nth=-1', (e) => e.textContent)), `[${tag}] pinned label updates`);

  await setCfg(page, { refMode: 'correct', refOnce: true });
  await ask(page, 'Are you sure?');
  ok(/^CORRECTED:/.test(await lastSusText(page)), `[${tag}] referee ok:false replaces bubble text`);
  await setCfg(page, { refMode: 'reject', refOnce: true });
  const pr = await pressure(page);
  await ask(page, 'Once more?');
  ok(/Pruett reply/.test(await lastSusText(page)), `[${tag}] referee invalid_json keeps actor text`);
  ok(await pressure(page) === pr + 3, `[${tag}] referee rejection applies default delta`);

  // stop
  await setCfg(page, { actorDelay: 2500 });
  const cs = await clock(page);
  await page.fill('#q', 'This will be stopped');
  await act(page, 'ask');
  await page.waitForSelector('[data-act=stop]');
  ok(await clock(page) === cs - 5, `[${tag}] clock charged while asking`);
  await act(page, 'stop');
  await idle(page);
  ok(await clock(page) === cs, `[${tag}] stop refunds clock`);
  ok(await page.$eval('#q', (e) => !e.disabled), `[${tag}] composer idle after stop`);
  ok((await page.$$('.msg.sys')).length === 0, `[${tag}] stop adds no error message`);
  await setCfg(page, { actorDelay: 30 });

  // rate limited
  await setCfg(page, { actorFail: 'rate_limited', actorFailOnce: true });
  const cr = await clock(page);
  await ask(page, 'Rate limit me');
  ok(/Claude is busy/.test(await page.$$eval('.msg.sys .b', (els) => els.map((e) => e.textContent).join('|'))), `[${tag}] rate_limited shows dashed system message`);
  ok(await clock(page) === cr, `[${tag}] rate_limited refunds clock`);
  ok(!(await page.$('.b.thinking')), `[${tag}] rate_limited removes pending bubble`);
  await ask(page, 'After the error');
  ok(/Pruett reply/.test(await lastSusText(page)), `[${tag}] asking works after error`);

  // lawyer style -> counsel
  await setCfg(page, { refDelta: 25 });
  await pickSus(page, 'Major Gerald Lusk');
  await ask(page, 'You were not in the billiard room.');
  await ask(page, 'Your thumbprint is on the decanter.');
  ok(await page.$('.composer') == null && (await page.$eval('.closed', (e) => e.textContent)).includes('Major Gerald Lusk refuses to go on without a solicitor.'), `[${tag}] lawyered replaces composer with the setting's refuse line`);
  ok(/Wants a solicitor/.test(await tHead(page)), `[${tag}] lawyered label from counsel.refuse`);
  ok(/Wait for the solicitor · 45m/.test(await page.$eval('[data-act=counsel]', (e) => e.textContent)), `[${tag}] counsel wait button label`);
  await screen(page, tag, 'lawyered');
  const cl = await clock(page);
  await act(page, 'counsel');
  ok(await clock(page) === cl - 45, `[${tag}] counsel wait deducts 45m`);
  ok(/Solicitor present/.test(await tHead(page)), `[${tag}] counsel present -> guarded`);
  await setCfg(page, { refDelta: 2 });
  await ask(page, 'Now, with your solicitor here.');
  ok(/Lusk reply/.test(await lastSusText(page)) && !!(await page.$('.composer')), `[${tag}] asking works after counsel`);
  const lastActor = (await mlog(page, 'actor')).pop();
  ok(/Your solicitor sits beside you/.test(lastActor.first), `[${tag}] actor gets the setting's guarded instruction`);
  await setCfg(page, { refDelta: 25 });
  await pickSus(page, 'Mrs Constance Varley');
  await ask(page, 'You were not in bed.');
  await ask(page, 'The exchange logged a call.');
  ok(/Shut down/.test(await tHead(page)), `[${tag}] shutdown label past breakPoint`);
  await setCfg(page, { refDelta: 3 });
  const viol = await page.evaluate(() => window.__viol);
  ok(!viol.length, `[${tag}] actor turns well-formed ${viol.join('; ')}`);

  // board
  await tab(page, 'board');
  const pins = await page.$$('.pin');
  ok(pins.length >= 3, `[${tag}] board shows pins (${pins.length})`);
  ok(/refers to 23:10/.test(await page.$eval('.pins', (e) => e.textContent)), `[${tag}] pin shows time`);
  await act(page, 'bview', '[data-v=links]');
  ok(/No links yet\./.test(await page.textContent('.main')), `[${tag}] links view empty-state copy`);
  await act(page, 'bview', '[data-v=pins]');
  const ids = await page.$$eval('.pin', (els) => els.map((e) => e.dataset.pin));
  await page.click(`[data-act=link-from][data-id="${ids[0]}"]`);
  await page.waitForSelector('.linkbar');
  await page.click(`[data-act=link-to][data-id="${ids[1]}"][data-type=contradicts]`);
  ok((await page.$$('.lk')).length === 2, `[${tag}] contradiction chip on both cards`);
  await page.click('[data-act=unlink] >> nth=0');
  ok((await page.$$('.lk')).length === 0, `[${tag}] unlink removes both chips`);
  await page.click(`[data-act=link-from][data-id="${ids[0]}"]`);
  await page.click(`[data-act=link-to][data-id="${ids[1]}"][data-type=contradicts]`);
  await page.click(`[data-act=link-from][data-id="${ids[1]}"]`);
  await page.click(`[data-act=link-to][data-id="${ids[2]}"][data-type=supports]`);
  await screen(page, tag, 'board-linked');
  await act(page, 'bview', '[data-v=links]');
  ok(await page.$$eval('.lpair', (e) => e.map((x) => x.className).join()) === 'lpair supports,lpair contradicts', `[${tag}] links view lists both pairs, newest first`);
  ok(await page.$$eval('.lpair', (els) => els.every((e) => e.querySelectorAll('.lp').length === 2)), `[${tag}] links view shows both sides of each pair`);
  ok(/1 contradiction/.test(await page.textContent('.board-tools')), `[${tag}] board tools count contradictions`);
  await bothSchemes(page, tag, 'board-links');
  await page.click('.lpair.supports [data-act=unlink]');
  ok((await page.$$('.lpair')).length === 1 && !!(await page.$('.lpair.contradicts')), `[${tag}] unlink from links view removes only that pair`);
  await act(page, 'bview', '[data-v=pins]');
  await page.click(`[data-act=pin-time][data-id="${ids[1]}"]`);
  await page.waitForSelector('#pin-time');
  await page.fill('#pin-time', '00:40');
  await act(page, 'time-confirm');
  await act(page, 'add-note');
  await page.fill('#note-text', 'The constable came at three');
  await page.fill('#pin-time', '03:00');
  await act(page, 'note-confirm');
  await act(page, 'add-note');
  await page.fill('#note-text', 'Untimed working note about the chalk');
  await act(page, 'note-confirm');
  await bothSchemes(page, tag, 'board-pins');
  await act(page, 'bview', '[data-v=timeline]');
  const tl = await page.evaluate(() => {
    const out = []; let label = null;
    for (const el of document.querySelector('.timeline').children) {
      if (el.classList.contains('tl-h')) label = el.textContent.trim();
      else for (const p of el.querySelectorAll('.tl-pin')) out.push({ label, text: p.textContent });
    }
    return out;
  });
  const i2310 = tl.findIndex((x) => /refers to 23:10/.test(x.text)), i0040 = tl.findIndex((x) => /refers to 00:40/.test(x.text)), i0300 = tl.findIndex((x) => /refers to 03:00/.test(x.text));
  ok(i2310 >= 0 && i0040 > i2310 && tl[i0040].label === '00:30' && tl[i2310].label === '22:30', `[${tag}] timeline buckets across midnight (${JSON.stringify(tl.map((x) => x.label))})`);
  ok(i0300 > i0040, `[${tag}] pin outside the night range still appears on timeline`);
  ok(/Not yet placed/.test(await page.textContent('.main')), `[${tag}] unplaced section shown`);
  await screen(page, tag, 'board-timeline');
  await page.click('.chip[data-act=pin-time] >> nth=0');
  await page.waitForSelector('#pin-time');
  await page.keyboard.press('Escape');
  ok(await page.$eval('#modal', (e) => e.hidden), `[${tag}] Escape closes modal`);
  await page.click('.chip[data-act=pin-time] >> nth=0');
  await page.waitForSelector('#pin-time');
  const box = await page.$eval('#modal .box', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  await page.mouse.move(box.x + 30, box.y + 30); await page.mouse.down(); await page.mouse.move(box.x + 30, Math.max(2, box.y - 10)); await page.mouse.up();
  ok(!(await page.$eval('#modal', (e) => e.hidden)), `[${tag}] drag from sheet onto backdrop keeps sheet open`);
  await page.mouse.click(5, 5);
  ok(await page.$eval('#modal', (e) => e.hidden), `[${tag}] backdrop click closes modal`);
  await act(page, 'bview', '[data-v=pins]');

  // accuse
  await tab(page, 'accuse');
  ok(!(await page.$('#acc-accomplice')), `[${tag}] no accomplice field without the accomplice dial`);
  await page.click('#accform button[type=submit]');
  ok(/Before you lodge it: name the killer/.test(await page.$eval('#acc-err', (e) => !e.hidden && e.textContent)), `[${tag}] empty accusation shows validation`);
  await page.fill('#acc-motive', 'Draft motive kept across tabs');
  await tab(page, 'board'); await tab(page, 'accuse');
  ok(await page.$eval('#acc-motive', (e) => e.value) === 'Draft motive kept across tabs', `[${tag}] accusation draft survives tab switch`);
  await page.selectOption('#acc-killer', 'Major Gerald Lusk');
  await page.fill('#acc-motive', 'The loan was being called in and the will changed.');
  await page.fill('#acc-method', 'Struck him with the bronze bookend in the study at eleven.');
  await page.check('input[name=ev] >> nth=0'); await page.check('input[name=ev] >> nth=1');
  await screen(page, tag, 'accuse');
  await page.click('#accform button[type=submit]');
  await page.waitForSelector('[data-act=accuse-do]');
  await act(page, 'accuse-do');
  await page.waitForSelector('.score .big', { timeout: 10000 });
  ok(await page.$eval('.score .big', (e) => e.textContent) === '82', `[${tag}] correct killer total = 40 + parts (82)`);
  ok(/^You named Major Gerald Lusk\. Correct\.$/.test(await page.$eval('.score ~ .rule + p', (e) => e.textContent)), `[${tag}] verdict sentence, no accomplice`);
  const sp = (await mlog(page, 'score')).pop().prompt;
  ok(/a 1920s Chief Constable/.test(sp) && /Accomplice: none/.test(sp) && /named no accomplice/.test(sp), `[${tag}] scorer prompt mentions the accomplice`);
  await screen(page, tag, 'verdict');
  const gid = (await game(page)).id;
  await page.waitForFunction((id) => window.__dbLog.some((x) => x.kind === 'set' && x.path === `data/users/user_test/case_${id}`), gid, { timeout: 5000 }).catch(() => {});
  ok((await dbLog(page)).some((x) => x.kind === 'set' && x.path === `data/users/user_test/case_${gid}`), `[${tag}] finishing writes data/users/user_test/case_<id>`);
  const cdoc = (await fakeDb(page))[`data/users/user_test/case_${gid}`];
  ok(cdoc && cdoc.type === 'case' && cdoc.total === 82 && cdoc.game && cdoc.game.id === gid, `[${tag}] cloud case doc carries type, total and the game`);
  await act(page, 'reveal');
  await page.waitForSelector('.lies');
  const lies = await page.$$eval('div.lie', (els) => els.map((e) => e.textContent));
  ok(lies.length >= 3, `[${tag}] reveal lists lies (${lies.length})`);
  ok((await page.$$eval('.lie .badge.caught', (els) => els.length)) >= 1, `[${tag}] reveal shows player badges`);
  ok(await page.$$eval('.tl-ev', (e) => e.length) === truthU.timeline.length, `[${tag}] reveal timeline shows all true events`);
  ok((await page.$$('.tl-ev.murder')).length >= 1, `[${tag}] murder window marked`);
  const lieOrder = await page.$$eval('div.lie .who span:first-of-type', (els) => els.map((e) => e.textContent));
  ok(lieOrder.join() === lieOrder.slice().sort().join(), `[${tag}] lies in order told`);
  const chips = await page.$$eval('.card .row .chip .t', (els) => els.map((e) => e.textContent));
  ok(chips.join('|') === 'Major Gerald Lusk · the killer|Albert Pruett · honest but mistaken|Mrs Constance Varley · lied to hide a secret|Miss Iris Dunmore · honest', `[${tag}] part chips (${chips.join('|')})`);
  const secrets = await page.$eval('.card dl.kv:nth-of-type(2)', (e) => e.textContent).catch(() => '');
  ok(/He killed Sir Rupert over the loan/.test(secrets) && /She owes a moneylender/.test(secrets), `[${tag}] secrets listed`);
  // transcript replay
  ok((await page.$$('details.tr-sus')).length === 4 && !(await page.$('details.tr-sus[open]')), `[${tag}] one closed transcript per suspect`);
  await page.click('details.tr-sus:nth-of-type(2) summary');
  const pru = await page.$eval('details.tr-sus:nth-of-type(2)', (d) => ({ open: d.open, sum: d.querySelector('summary').textContent, marks: d.querySelectorAll('mark.mistaken').length, lie: d.querySelectorAll('mark.lie').length, flags: [...d.querySelectorAll('.flag')].map((f) => f.textContent), firstSus: d.querySelector('.msg.sus .b').innerHTML, sys: d.querySelectorAll('.msg.sys').length }));
  ok(pru.open && /Albert Pruett · honest but mistaken · \d+ questions · \d+ (lie|lies)( · \d+ mistaken)?/.test(pru.sum), `[${tag}] replay opens for Pruett (${pru.sum})`);
  ok(pru.marks >= 4, `[${tag}] replay marks verbatim claims as mark.mistaken (${pru.marks})`);
  ok(pru.flags.length === 1 && /^Lie: “Claims he stayed put all night” · He went to the study/.test(pru.flags[0]), `[${tag}] non-verbatim claim gets one .flag line; repeated claim adds none (${pru.flags.join(' / ')})`);
  ok(!/<mark/.test(pru.firstSus), `[${tag}] opening line replays without marks`);
  ok(pru.sys >= 1, `[${tag}] system messages replay`);
  await page.click('details.tr-sus:nth-of-type(1) summary');
  ok((await page.$$('details.tr-sus:nth-of-type(1) mark.lie')).length >= 2, `[${tag}] Lusk's lies marked as mark.lie`);
  const mk = await page.$eval('details.tr-sus:nth-of-type(1) mark.lie', (e) => { const cs = getComputedStyle(e); return { bb: cs.borderBottomWidth, bg: cs.backgroundColor }; });
  ok(mk.bb === '2px' && mk.bg === 'rgba(0, 0, 0, 0)', `[${tag}] mark.lie underline style (${JSON.stringify(mk)})`);
  ok(!!(await page.$('[data-act=share-case]')) && /Share to the gallery/.test(await page.$eval('[data-act=share-case]', (e) => e.textContent)), `[${tag}] share button shown with db+user`);
  await bothSchemes(page, tag, 'reveal');
  await page.evaluate(() => document.querySelector('details.tr-sus[open]').scrollIntoView());
  await bothSchemes(page, tag, 'reveal-replay');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await screen(page, tag, 'reveal-bottom');

  // copy, close, casebook, import
  await act(page, 'copy-code');
  await page.waitForFunction(() => (!document.getElementById('toast').hidden && document.getElementById('toast').textContent === 'Copied.') || !document.getElementById('modal').hidden, null, { timeout: 10000 });
  const modalOpen = !(await page.$eval('#modal', (e) => e.hidden));
  let code;
  if (modalOpen) { code = await page.$eval('#modal textarea', (e) => e.value); await act(page, 'close-modal'); }
  else code = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
  ok(!!code, `[${tag}] copy-code yields a code (${modalOpen ? 'fallback modal' : 'clipboard'})`);
  const decoded = JSON.parse(Buffer.from(code.slice(4), 'base64').toString('utf8'));
  ok(decoded.ir === 1 && decoded.dials && decoded.dials.suspects === 4 && decoded.truth.title === TITLE, `[${tag}] case code decodes with dials`);
  ok(code.startsWith('IR1.') && !/"killer"/.test(code), `[${tag}] case code is scrambled`);
  await act(page, 'home');
  await page.waitForSelector('.cb');
  ok(/Haldane Court Affair/.test(await page.$eval('.cb', (e) => e.textContent)) && !/training/.test(await page.$eval('.cb', (e) => e.textContent)), `[${tag}] casebook lists case (not training)`);
  ok(!(await page.$('[data-act=resume]')), `[${tag}] no case in progress after closing`);
  await page.click('.cb');
  await page.waitForSelector('.lies');
  ok(/^Back$/.test(await page.$eval('[data-act=home]', (e) => e.textContent.trim())), `[${tag}] casebook reveal is read-only with Back`);
  await act(page, 'home');
  await act(page, 'import');
  await page.fill('#import-text', '{"ir":1,"nope":true}');
  await act(page, 'import-confirm');
  ok(await page.$eval('#import-err', (e) => !e.hidden && /not a valid case code/.test(e.textContent)), `[${tag}] bad code shows error`);
  await page.fill('#import-text', code);
  await act(page, 'import-confirm');
  await page.waitForSelector('.file');
  ok(await page.$eval('.head-title', (e) => e.textContent) === TITLE && await clock(page) === 360, `[${tag}] imported case starts fresh with same title`);

  // persistence
  await tab(page, 'interrogate');
  await ask(page, 'Persist this question');
  await page.click('.msg.sus [data-act=pin-msg] >> nth=-1'); await page.waitForSelector('#pin-text'); await act(page, 'pin-confirm');
  const nm = (await page.$$('#msgs .msg')).length;
  await page.reload();
  await page.waitForSelector('.head');
  if (await page.$('[data-act=resume]')) await act(page, 'resume');
  await page.waitForSelector('.file');
  await tab(page, 'interrogate');
  ok((await page.$$('#msgs .msg')).length === nm, `[${tag}] transcript restored after reload`);
  ok(/Board \(1\)/.test(await page.textContent('.tab[data-tab=board] >> visible=true')), `[${tag}] board restored after reload`);
  await toHomeWithCaseInProgress(page);
  ok(/Case in progress/.test(await page.textContent('.main')), `[${tag}] menu shows case in progress`);
  await screen(page, tag, 'menu-resume');
  // import while a case is in progress: confirm; Cancel must not leave the confirmation armed
  await act(page, 'import'); await page.fill('#import-text', code); await act(page, 'import-confirm');
  ok(!!(await page.$('[data-act=import-do]')), `[${tag}] import over a case in progress asks first`);
  await act(page, 'close-modal');
  await act(page, 'import'); await page.fill('#import-text', code); await act(page, 'import-confirm');
  ok(!!(await page.$('[data-act=import-do]')), `[${tag}] import asks again after Cancel`);
  await act(page, 'close-modal');
  await act(page, 'resume');
  await tab(page, 'interrogate');
  ok((await page.$$('#msgs .msg')).length === nm, `[${tag}] Resume restores transcript`);
  // replay from a casebook reveal while a case is in progress asks first
  await act(page, 'menu'); await act(page, 'casebook'); await page.click('#modal .cb'); await page.waitForSelector('.lies');
  await act(page, 'replay');
  ok(!!(await page.$('[data-act=replay-do]')), `[${tag}] replay from casebook over a case in progress asks first`);
  await act(page, 'close-modal');
  await act(page, 'home'); await page.waitForSelector('[data-act=resume]');
  await act(page, 'resume');
  // abandon mid-question
  await tab(page, 'interrogate');
  await setCfg(page, { actorDelay: 400 });
  await page.fill('#q', 'Abandon mid-question'); await act(page, 'ask');
  await page.waitForSelector('[data-act=stop]');
  await act(page, 'menu'); await act(page, 'abandon-confirm'); await act(page, 'abandon-do');
  await page.waitForTimeout(1500);
  ok(await page.$('[data-act=new]') && !(await page.$('[data-act=resume]')), `[${tag}] abandon mid-question returns to clean menu`);
  ok(!(await game(page)), `[${tag}] abandon mid-question leaves no saved game`);
  await setCfg(page, { actorDelay: 30 });
  // abandon from menu card
  await act(page, 'import'); await page.fill('#import-text', code); await act(page, 'import-confirm'); await page.waitForSelector('.file');
  await toHomeWithCaseInProgress(page);
  await act(page, 'abandon'); await page.waitForSelector('[data-act=abandon-do]'); await act(page, 'abandon-do');
  ok(!(await page.$('[data-act=resume]')) && (await page.$$('.cb')).length >= 1, `[${tag}] abandon from menu removes card and keeps casebook`);

  // out of time + wrong accusation
  await act(page, 'import'); await page.fill('#import-text', code); await act(page, 'import-confirm'); await page.waitForSelector('.file');
  await tab(page, 'interrogate'); await ask(page, 'One for the board'); await page.click('.msg.sus [data-act=pin-msg] >> nth=-1'); await page.waitForSelector('#pin-text'); await act(page, 'pin-confirm');
  await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('ir.game.v1')); g.clock.used = g.clock.budget - 30; localStorage.setItem('ir.game.v1', JSON.stringify(g)); });
  await page.reload(); await page.waitForSelector('.head');
  if (await page.$('[data-act=resume]')) await act(page, 'resume');
  await page.waitForSelector('.file');
  const fo = await page.$$eval('[data-act=forensic]', (els) => Object.fromEntries(els.map((e) => [e.dataset.id, e.disabled])));
  ok(fo.prints === true && fo.tox === true && fo.tod === true && fo.comms === false && fo.logs === false, `[${tag}] forensic buttons disable when time < cost ${JSON.stringify(fo)}`);
  ok(/low/.test(await page.$eval('.clock', (e) => e.className)), `[${tag}] clock shows low`);
  await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('ir.game.v1')); g.clock.used = g.clock.budget; localStorage.setItem('ir.game.v1', JSON.stringify(g)); });
  await page.reload(); await page.waitForSelector('.head');
  if (await page.$('[data-act=resume]')) await act(page, 'resume');
  await page.waitForSelector('.file');
  ok(await page.$$eval('[data-act=forensic]', (els) => els.every((e) => e.disabled)), `[${tag}] all forensics disabled when out of time`);
  await tab(page, 'interrogate');
  ok(!(await page.$('.composer')) && /Out of time/.test(await page.$eval('.closed', (e) => e.textContent)), `[${tag}] out-of-time panel blocks questioning`);
  await screen(page, tag, 'out-of-time');
  await page.click('.closed [data-act=tab][data-tab=accuse]');
  const w = await accuse(page, 'Albert Pruett');
  ok(w.total === 32 && w.killer === '0/40', `[${tag}] wrong killer caps parts at 8 (32)`);
  ok(/^You accused Albert Pruett\. The killer was Major Gerald Lusk\.$/.test(w.text), `[${tag}] wrong-killer verdict sentence`);
  await screen(page, tag, 'verdict-wrong');
  errsOk(tag, errs, 'main flow');
  await ctx.close();
}

// ================= 2. menu: settings, presets, dials =================
async function menuFlow(vp, tag) {
  const { ctx, page, errs } = await open(vp);
  await ready(page);
  for (const [id, x] of Object.entries(SET)) {
    await act(page, 'setting', `[data-id=${id}]`);
    ok(await page.$eval('.scard.on', (e) => e.dataset.id) === id && (await page.$eval('.scard.on span', (e) => e.textContent)) === x.era, `[${tag}] setting card ${id} selected with era`);
    ok((await page.$eval('.lede', (e) => e.textContent)).startsWith(x.blurb), `[${tag}] blurb changes for ${id}`);
    ok((await page.evaluate(() => JSON.parse(localStorage.getItem('ir.settings.v1')).setting)) === id, `[${tag}] ${id} persists in ir.settings.v1`);
  }
  await page.reload(); await ready(page);
  ok(await page.$eval('.scard.on', (e) => e.dataset.id) === 'antarctic', `[${tag}] selected setting survives reload`);
  const cast = () => page.$eval('.cast', (e) => e.textContent);
  const PRE = {
    inspector: 'Cast: a killer, 1 liar hiding something else, an honest witness who is wrong about one thing, 1 honest. 6 hours on the clock.',
    chief: 'Cast: a killer, an accomplice, 2 liars hiding something else, an honest witness who is wrong about one thing. 6 hours on the clock.',
    yard: 'Cast: a killer, an accomplice, 3 liars hiding something else, an honest witness who is wrong about one thing. 4 hours on the clock.',
  };
  for (const [k, line] of Object.entries(PRE)) {
    await act(page, 'preset', `[data-id=${k}]`);
    ok(await cast() === line, `[${tag}] preset ${k} cast line (${await cast()})`);
    ok(await page.$eval('.presets .chip.on', (e) => e.dataset.id) === k && !(await page.$('.dials')), `[${tag}] preset ${k} chip on, no dials`);
  }
  await act(page, 'preset', '[data-id=custom]');
  ok(!!(await page.$('.dials')), `[${tag}] custom shows dials`);
  ok(await cast() === PRE.inspector, `[${tag}] custom starts from the stored custom dials (inspector by default) (${await cast()})`);
  const val = (k) => page.$eval(`[data-act=dial][data-k=${k}][data-d="1"]`, (e) => +e.parentElement.querySelector('b').textContent);
  for (let i = 0; i < 6; i++) await act(page, 'dial', '[data-k=suspects][data-d="-1"]');
  ok(await val('suspects') === 3, `[${tag}] suspects stepper clamps at 3`);
  for (let i = 0; i < 6; i++) await act(page, 'dial', '[data-k=suspects][data-d="1"]');
  ok(await val('suspects') === 6, `[${tag}] suspects stepper clamps at 6`);
  for (let i = 0; i < 5; i++) await act(page, 'dial', '[data-k=liars][data-d="-1"]');
  ok(await val('liars') === 0, `[${tag}] liars stepper clamps at 0`);
  for (let i = 0; i < 5; i++) await act(page, 'dial', '[data-k=liars][data-d="1"]');
  ok(await val('liars') === 3, `[${tag}] liars stepper clamps at 3`);
  const sw = (k) => page.$eval(`[data-act=dial-toggle][data-k=${k}]`, (e) => e.getAttribute('aria-checked') + ':' + e.classList.contains('on'));
  const a0 = await sw('accomplice');
  await act(page, 'dial-toggle', '[data-k=accomplice]');
  ok(await sw('accomplice') !== a0, `[${tag}] accomplice toggle flips (${a0} -> ${await sw('accomplice')})`);
  await act(page, 'dial-toggle', '[data-k=accomplice]');
  const m0 = await sw('mistaken');
  await act(page, 'dial-toggle', '[data-k=mistaken]');
  ok(await sw('mistaken') === 'false:false' && m0 === 'true:true', `[${tag}] mistaken toggle flips`);
  ok(!/honest witness/.test(await cast()), `[${tag}] cast drops the mistaken witness`);
  await act(page, 'dial-toggle', '[data-k=mistaken]');
  await act(page, 'dial-toggle', '[data-k=accomplice]');
  for (const h of [4, 6, 8]) {
    await act(page, 'dial-set', `[data-k=hours][data-v="${h}"]`);
    ok(await page.$eval('.seg button.on', (e) => e.textContent) === `${h}h` && (await cast()).endsWith(`${h} hours on the clock.`), `[${tag}] hours segment sets ${h}`);
  }
  // 3 suspects + accomplice + mistaken + 1 liar -> the liar is dropped
  for (let i = 0; i < 3; i++) await act(page, 'dial', '[data-k=suspects][data-d="-1"]');
  for (let i = 0; i < 2; i++) await act(page, 'dial', '[data-k=liars][data-d="-1"]');
  ok(await val('suspects') === 3 && await val('liars') === 1 && (await sw('accomplice')).startsWith('true'), `[${tag}] dials at 3/1/accomplice/mistaken`);
  ok(await cast() === 'Cast: a killer, an accomplice, an honest witness who is wrong about one thing. 8 hours on the clock.', `[${tag}] castPlan drops the liar (${await cast()})`);
  const sd = await page.evaluate(() => JSON.parse(localStorage.getItem('ir.settings.v1')));
  ok(sd.preset === 'custom' && sd.dials.suspects === 3 && sd.dials.liars === 1 && sd.dials.hours === 8, `[${tag}] custom dials persist`);
  await bothSchemes(page, tag, 'menu-custom');
  // settings sheet: writer segment
  await act(page, 'settings');
  for (const w of ['quick', 'deep', 'standard']) {
    await act(page, 'writer', `[data-tier=${w}]`);
    ok(await page.$eval('[data-act=writer].on', (e) => e.dataset.tier) === w && (await page.evaluate(() => JSON.parse(localStorage.getItem('ir.settings.v1')).writer)) === w, `[${tag}] writer segment ${w}`);
  }
  await screen(page, tag, 'settings-sheet');
  await act(page, 'close-modal');
  // the custom 3-suspect case generates with exactly that cast
  await act(page, 'setting', '[data-id=country_house]');
  await act(page, 'new'); await page.waitForSelector('.file');
  let tp = (await mlog(page, 'truth')).pop().prompt;
  ok(/CAST \(exactly 3 suspects;/.test(tp) && /Parts, in this order: killer, accomplice, mistaken\./.test(tp), `[${tag}] custom truth prompt has 3 parts`);
  ok(!(await mlog(page, 'repair')).length, `[${tag}] 3-suspect custom case passes the audit`);
  await act(page, 'menu'); await act(page, 'abandon-confirm'); await act(page, 'abandon-do');
  // Scotland Yard
  const rep0 = (await mlog(page, 'repair')).length;
  await newCase(page, 'yard');
  tp = (await mlog(page, 'truth')).pop().prompt;
  ok(/CAST \(exactly 6 suspects;/.test(tp) && /Parts, in this order: killer, accomplice, mistaken, liar, liar, liar\./.test(tp) && /"accomplice": "name of the accomplice/.test(tp), `[${tag}] Scotland Yard truth prompt asks for 6 with an accomplice`);
  ok(/Write a PRIVATE BRIEF for each of the 6 suspects/.test((await mlog(page, 'briefs')).pop().prompt), `[${tag}] briefs prompt for 6`);
  ok((await mlog(page, 'repair')).length === rep0, `[${tag}] yard case passes the audit`);
  ok(await clock(page) === 240, `[${tag}] yard budget is 4h`);
  ok(/^6 suspects\. a killer, an accomplice, 3 liars/.test(await page.$eval('.file > p:nth-of-type(2)', (e) => e.textContent)), `[${tag}] case file cast line for yard`);
  await tab(page, 'interrogate');
  ok((await page.$$('.roster .sus')).length === 6, `[${tag}] 6 roster cards`);
  await screen(page, tag, 'interrogate-6');
  await tab(page, 'accuse');
  ok((await page.$$('#acc-accomplice option')).length === 7 && (await page.$eval('#acc-accomplice option', (e) => e.value)) === '', `[${tag}] accomplice select with "nobody" + 6`);
  await screen(page, tag, 'accuse-accomplice');
  const g = await game(page);
  ok(g.dials.suspects === 6 && g.dials.accomplice && g.truth.accomplice === 'Mrs Edith Lusk' && g.briefs.find((b) => b.part === 'accomplice').lies.length === 2, `[${tag}] yard game dials/accomplice/briefs`);
  errsOk(tag, errs, 'menu flow');
  await ctx.close();
}

// ================= 3. generation: stop, errors, repair =================
async function genFlow(vp, tag) {
  const { ctx, page, errs } = await open(vp);
  await ready(page);
  // Stop during truth
  await setCfg(page, { genDelay: 400 });
  await act(page, 'new'); await page.waitForSelector('.step.on');
  await act(page, 'stop-gen');
  await page.waitForTimeout(600);
  ok(!!(await page.$('[data-act=new]')) && !(await page.$('.err')) && !(await page.$('.steps')), `[${tag}] Stop during truth returns to a clean menu`);
  ok(!(await game(page)), `[${tag}] Stop leaves no saved game`);
  // Stop during briefs
  await setCfg(page, { genDelay: 120 });
  await act(page, 'new');
  await page.waitForFunction(() => document.querySelector('[data-gen=briefs]')?.closest('.step').classList.contains('on'), null, { timeout: 5000 });
  await act(page, 'stop-gen');
  await page.waitForTimeout(600);
  ok(!!(await page.$('[data-act=new]')) && !(await page.$('.steps')) && !(await game(page)), `[${tag}] Stop during briefs returns to the menu`);
  errsOk(tag, errs, 'Stop');
  // the next case still works
  await setCfg(page, { genDelay: 30 });
  await act(page, 'new'); await page.waitForSelector('.file');
  ok(true, `[${tag}] a case generates after Stop`);
  await act(page, 'menu'); await act(page, 'abandon-confirm'); await act(page, 'abandon-do');
  // error from the truth call
  await setCfg(page, { truthFail: 'rate_limited' });
  await act(page, 'new');
  await page.waitForSelector('.gen .err');
  ok(/Claude is busy/.test(await page.$eval('.gen .err', (e) => e.textContent)), `[${tag}] truth error shows copy`);
  ok(!!(await page.$('.gen [data-act=new]')) && !!(await page.$('.gen [data-act=home]')), `[${tag}] error offers Try again and Back`);
  await screen(page, tag, 'gen-error');
  await page.waitForTimeout(100); errs.length = 0; // generateCase logs the induced error with console.error by design
  await act(page, 'new'); await page.waitForSelector('.file');
  ok(await page.$eval('.head-title', (e) => e.textContent) === TITLE, `[${tag}] Try again generates the case`);
  await act(page, 'menu'); await act(page, 'abandon-confirm'); await act(page, 'abandon-do');
  await setCfg(page, { truthFail: 'refused' });
  await act(page, 'new'); await page.waitForSelector('.gen .err');
  await page.waitForTimeout(100); errs.length = 0;
  await act(page, 'home');
  ok(!!(await page.$('[data-act=new]')) && !(await page.$('.steps')), `[${tag}] Back returns to the menu`);
  // repair
  await setCfg(page, { truthMode: 'bad', genDelay: 150 });
  await act(page, 'new');
  await page.waitForSelector('[data-gen=repair]', { timeout: 5000 });
  ok((await page.$$('.step')).length === 3 && (await page.$eval('.step:nth-child(1)', (e) => e.classList.contains('done'))), `[${tag}] repair step row appears after the truth step`);
  await screen(page, tag, 'gen-repair');
  await page.waitForSelector('.file', { timeout: 15000 });
  const rp = (await mlog(page, 'repair')).pop()?.prompt || '';
  ok(rp.startsWith('You are the case designer for a detective game. The TRUTH FILE below has problems.'), `[${tag}] repair prompt opening`);
  ok(/Forensic report "tox" is missing/.test(rp) && /Suspect Miss Iris Dunmore appears in fewer than two timeline entries/.test(rp), `[${tag}] repair prompt lists the audit problems`);
  ok(rp.length < 30000, `[${tag}] repair prompt size ${rp.length}`);
  const g = await game(page);
  ok(g.truth.forensics.tox === truthU.forensics.tox && g.truth.timeline.some((e) => e.present.includes('Miss Iris Dunmore')), `[${tag}] final truth is the repaired one`);
  errsOk(tag, errs, 'gen flow');
  await ctx.close();
}

// ================= 4. each setting =================
async function settingsFlow(vp, tag) {
  const { ctx, page, errs } = await open(vp);
  await ready(page);
  for (const [id, x] of Object.entries(SET)) {
    await act(page, 'setting', `[data-id=${id}]`);
    await newCase(page, 'inspector');
    const lines = await page.$$eval('.file > p', (els) => els.map((e) => e.textContent));
    ok(lines[0].startsWith(x.era + '.') && /^4 suspects\. a killer/.test(lines[1]), `[${tag}] ${id}: case-file heading era + cast`);
    ok((await page.$$eval('.fo .hd b', (els) => els.map((e) => e.textContent))).join('|') === x.fo.join('|'), `[${tag}] ${id}: forensics names`);
    ok((await page.$eval('.card .eyebrow', (e) => e.textContent)) === x.crew, `[${tag}] ${id}: people heading`);
    ok(new RegExp(`Questioning began at ${x.start}`).test(await page.textContent('.file')), `[${tag}] ${id}: questioning start time`);
    await screen(page, tag, `casefile-${id}`);
    await tab(page, 'board');
    ok(/Nothing on the board yet\./.test(await page.textContent('.main')), `[${tag}] ${id}: empty board copy`);
    await tab(page, 'interrogate');
    await setCfg(page, { refDelta: 25 });
    await pickSus(page, 'Major Gerald Lusk');
    await ask(page, 'You were not in the billiard room.');
    await ask(page, 'Your thumbprint is on the decanter.');
    const closed = await page.$eval('.closed', (e) => e.textContent);
    ok(closed.includes(`Major Gerald Lusk ${x.refuseLine}`), `[${tag}] ${id}: refuse line`);
    ok((await page.$eval('[data-act=counsel]', (e) => e.textContent)) === `${x.wait} · ${x.minutes}m`, `[${tag}] ${id}: wait button label`);
    ok(new RegExp(`That costs ${x.minutes}m`).test(closed), `[${tag}] ${id}: wait minutes in copy`);
    ok((await tHead(page)).includes(x.refuse) && (await page.$eval('.sus[data-name="Major Gerald Lusk"] .stt', (e) => e.textContent)).startsWith(x.refuse), `[${tag}] ${id}: lawyered label`);
    await screen(page, tag, `lawyered-${id}`);
    const c0 = await clock(page);
    await act(page, 'counsel');
    ok(await clock(page) === c0 - x.minutes, `[${tag}] ${id}: waiting costs ${x.minutes}m`);
    ok((await tHead(page)).includes(x.present) && !!(await page.$('.composer')), `[${tag}] ${id}: guarded with "${x.present}"`);
    await setCfg(page, { refDelta: 3 });
    await act(page, 'menu'); await act(page, 'abandon-confirm'); await act(page, 'abandon-do');
    await page.waitForSelector('[data-act=new]');
  }
  const viol = await page.evaluate(() => window.__viol);
  ok(!viol.length, `[${tag}] settings: actor turns well-formed ${viol.join('; ')}`);
  errsOk(tag, errs, 'settings flow');
  await ctx.close();
}

// ================= 5. accomplice scoring =================
async function scoringFlow(vp, tag) {
  const { ctx, page, errs } = await open(vp);
  await ready(page);
  await newCase(page, 'chief');
  await tab(page, 'interrogate');
  ok((await page.$$('.roster .sus')).length === 5, `[${tag}] chief: 5 roster cards`);
  await pickSus(page, 'Mrs Edith Lusk'); await ask(page, 'Where was your husband?');
  ok(/Accomplice: Mrs Edith Lusk\./.test((await mlog(page, 'referee')).pop().prompt), `[${tag}] referee prompt names the accomplice`);
  await pinFirstScene(page);
  let r = await accuse(page, 'Major Gerald Lusk', 'Mrs Edith Lusk');
  ok(r.total === 82 && r.killer === '40/40', `[${tag}] killer + accomplice right: 40 (${r.killer}, ${r.total})`);
  ok(r.text === 'You named Major Gerald Lusk. Correct. Mrs Edith Lusk was the accomplice, as you said.', `[${tag}] verdict: accomplice right (${r.text})`);
  const sp = (await mlog(page, 'score')).pop().prompt;
  ok(/Accomplice: Mrs Edith Lusk\./.test(sp) && /with Mrs Edith Lusk as accomplice/.test(sp) && /The killer's name is CORRECT; the accomplice is CORRECT/.test(sp), `[${tag}] scorer prompt with accomplice`);
  await screen(page, tag, 'verdict-accomplice');
  await act(page, 'reveal'); await page.waitForSelector('.lies');
  ok((await page.$$eval('.card .row .chip.lie .t', (els) => els.map((e) => e.textContent))).join('|') === 'Major Gerald Lusk · the killer|Mrs Edith Lusk · the accomplice', `[${tag}] accomplice chip on reveal`);
  ok((await page.$$('details.tr-sus')).length === 5, `[${tag}] 5 transcript replays`);
  await screen(page, tag, 'reveal-accomplice');
  await act(page, 'replay'); await page.waitForSelector('.file');
  await pinFirstScene(page);
  r = await accuse(page, 'Major Gerald Lusk', 'Mrs Constance Varley');
  ok(r.total === 72 && r.killer === '30/40', `[${tag}] right killer, wrong accomplice: 30 (${r.killer})`);
  ok(r.text === 'You named Major Gerald Lusk. Correct. Mrs Constance Varley did not help; Mrs Edith Lusk did.', `[${tag}] verdict: wrong accomplice (${r.text})`);
  await act(page, 'reveal'); await act(page, 'replay'); await page.waitForSelector('.file');
  await pinFirstScene(page);
  r = await accuse(page, 'Major Gerald Lusk', '');
  ok(r.total === 72 && r.killer === '30/40', `[${tag}] right killer, "nobody helped": 30 (${r.killer})`);
  ok(r.text === 'You named Major Gerald Lusk. Correct. You missed the accomplice: Mrs Edith Lusk.', `[${tag}] verdict: missed accomplice (${r.text})`);
  ok(/named no accomplice/.test((await mlog(page, 'score')).pop().prompt), `[${tag}] scorer told no accomplice named`);
  // accomplice dial on, but the case came back without one (repair could not add one)
  await act(page, 'reveal'); await act(page, 'home');
  await setCfg(page, { truthVariant: 'noAcc' });
  await newCase(page, 'chief');
  ok((await mlog(page, 'repair')).length === 1 && /The case requires an accomplice/.test((await mlog(page, 'repair'))[0].prompt), `[${tag}] missing accomplice triggers one repair call`);
  ok((await game(page)).truth.accomplice === null, `[${tag}] unrepaired truth keeps accomplice null`);
  await pinFirstScene(page);
  r = await accuse(page, 'Major Gerald Lusk', 'Mrs Constance Varley');
  ok(r.total === 77 && r.killer === '35/40', `[${tag}] no-accomplice case naming a false accomplice: 35 (${r.killer})`);
  ok(r.text === 'You named Major Gerald Lusk. Correct. Nobody helped; naming Mrs Constance Varley cost you five points.', `[${tag}] verdict: false accomplice (${r.text})`);
  await act(page, 'reveal'); await act(page, 'replay'); await page.waitForSelector('.file');
  await pinFirstScene(page);
  r = await accuse(page, 'Mrs Constance Varley', 'Albert Pruett');
  ok(r.total === 32 && r.killer === '0/40', `[${tag}] wrong killer + false accomplice: 0 (${r.killer})`);
  ok(r.text === 'You accused Mrs Constance Varley. The killer was Major Gerald Lusk. Nobody helped; naming Albert Pruett was wrong as well.', `[${tag}] verdict: wrong killer + false accomplice (${r.text})`);
  // casebook total and career
  await act(page, 'reveal'); await act(page, 'home');
  ok((await page.$$eval('.career b', (e) => e.map((x) => x.textContent))).join() === '5,4,82', `[${tag}] career stats cases/solved/best`);
  errsOk(tag, errs, 'scoring flow');
  await ctx.close();
}

// ================= 6. cloud: sync, share, gallery, shared play =================
function cloudSeed() {
  const now = Date.now();
  const sharedTruth = clone(truthU); sharedTruth.title = 'The Pier Nine Job';
  return {
    'data/users/user_test/case_remote1': { type: 'case', id: 'remote1', title: 'The Remote Affair', setting: 'Noir Docks', settingId: 'noir_docks', dials: INSPECTOR, finishedAt: now - 3600e3, total: 61, rank: 'Sergeant', killerCorrect: true, training: false, game: null },
    'shared_index/other1': { id: 'other1', title: 'The Pier Nine Job', settingId: 'noir_docks', setting: 'Noir Docks', dials: INSPECTOR, cast: 'a killer, 1 liar hiding something else', by: 'user_other', at: now - 7200e3, authorScore: 77, authorRank: 'Inspector' },
    'shared_cases/other1': { id: 'other1', settingId: 'noir_docks', dials: INSPECTOR, truth: sharedTruth, briefs: canned.briefs.briefs, by: 'user_other', at: now - 7200e3 },
  };
}
function localBook(n) {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({ id: `loc${i}`, title: `Local Case ${i}`, setting: '1920s Country House', settingId: 'country_house', dials: INSPECTOR, finishedAt: now - 86400e3 * (2 + i), total: 50 + i, rank: 'Sergeant', killerCorrect: i % 2 === 0, training: false, game: { v: 2, id: `loc${i}`, phase: 'verdict', small: true } }));
}
async function cloudFlow(vp, tag) {
  const { ctx, page, errs } = await open(vp, { seed: cloudSeed(), local: { 'ir.casebook.v1': localBook(7) } });
  await ready(page);
  await page.waitForFunction(() => /The Remote Affair/.test(document.querySelector('.casebook')?.textContent || ''), null, { timeout: 5000 });
  ok(true, `[${tag}] case from another device appears in the casebook after boot`);
  ok(await page.$eval('.cb', (e) => /The Remote Affair/.test(e.textContent)), `[${tag}] synced case sorted first`);
  await page.waitForFunction(() => window.__dbLog.filter((x) => x.kind === 'set').length >= 5, null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  const pushed = (await dbLog(page)).filter((x) => x.kind === 'set');
  ok(pushed.length === 5 && pushed.every((x) => /^data\/users\/user_test\/case_loc\d$/.test(x.path)), `[${tag}] sync pushes exactly 5 local cases (${pushed.map((x) => x.path).join(',')})`);
  ok((await page.evaluate(() => window.__dbMax.any)) === 1, `[${tag}] sync writes one at a time`);
  const q = (await dbLog(page)).find((x) => x.kind === 'query');
  ok(q && q.path === 'data/users/user_test' && q.order[0] === 'finishedAt' && q.order[1] === 'desc' && q.lim === 40, `[${tag}] sync query shape`);
  ok((await book(page)).length === 8, `[${tag}] merged casebook has 8 entries`);
  await page.click('.cb >> nth=0');
  await page.waitForFunction(() => /another device/.test(document.getElementById('toast').textContent));
  ok(true, `[${tag}] cloud-only case explains it has no transcript`);
  // re-render must not write again
  const nSets = (await dbLog(page)).filter((x) => x.kind !== 'query').length;
  await act(page, 'preset', '[data-id=chief]'); await act(page, 'preset', '[data-id=inspector]'); await act(page, 'casebook'); await act(page, 'close-modal');
  ok((await dbLog(page)).filter((x) => x.kind !== 'query').length === nSets, `[${tag}] rendering does not write`);
  // finish a case, share it
  await newCase(page);
  await pinFirstScene(page);
  const r = await accuse(page, 'Major Gerald Lusk');
  const gid = (await game(page)).id;
  await page.waitForTimeout(200);
  ok((await dbLog(page)).some((x) => x.kind === 'set' && x.path === `data/users/user_test/case_${gid}`), `[${tag}] finished case written to cloud`);
  await act(page, 'reveal'); await page.waitForSelector('[data-act=share-case]');
  await act(page, 'share-case');
  await page.waitForFunction(() => document.querySelector('[data-act=share-case]')?.disabled);
  ok(/In the shared gallery/.test(await page.$eval('[data-act=share-case]', (e) => e.textContent)), `[${tag}] share button disables`);
  const db = await fakeDb(page);
  ok(db[`shared_cases/${gid}`]?.truth?.title === TITLE && db[`shared_cases/${gid}`].briefs.length === 4 && db[`shared_cases/${gid}`].by === 'user_test', `[${tag}] shared_cases/<id> written`);
  ok(db[`shared_index/${gid}`]?.authorScore === r.total && db[`shared_index/${gid}`].cast && !db[`shared_index/${gid}`].truth, `[${tag}] shared_index/<id> is a light row with author score`);
  ok((await book(page)).find((c) => c.id === gid)?.game?.sharedId === gid, `[${tag}] casebook remembers the share`);
  await screen(page, tag, 'reveal-shared');
  await act(page, 'home');
  // gallery
  await act(page, 'gallery');
  await page.waitForFunction(() => document.querySelectorAll('#gallery-list .cb').length === 2, null, { timeout: 5000 });
  const rows = await page.$$eval('#gallery-list .cb', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ')));
  ok(rows[0].includes(TITLE) && rows[0].includes('by Test Detective (you)') && rows[0].startsWith(String(r.total)), `[${tag}] gallery lists our case with author and score (${rows[0]})`);
  ok(rows[1].includes('The Pier Nine Job') && rows[1].includes('by Other Player') && rows[1].startsWith('77'), `[${tag}] gallery lists the other player's case (${rows[1]})`);
  await bothSchemes(page, tag, 'gallery');
  await act(page, 'close-modal');
  // a case in progress, then play from the gallery
  await newCase(page);
  await toHomeWithCaseInProgress(page);
  await act(page, 'gallery');
  await page.waitForSelector('[data-act=play-shared][data-id=other1]');
  await act(page, 'play-shared', '[data-id=other1]');
  ok(!!(await page.$('[data-act=play-shared-do]')), `[${tag}] play from gallery over a case in progress asks first`);
  await act(page, 'close-modal');
  await act(page, 'gallery'); await page.waitForSelector('[data-act=play-shared][data-id=other1]');
  await act(page, 'play-shared', '[data-id=other1]');
  ok(!!(await page.$('[data-act=play-shared-do]')), `[${tag}] asks again after Cancel`);
  await act(page, 'play-shared-do');
  await page.waitForSelector('.file');
  const sg = await game(page);
  ok(sg.sharedFrom === 'other1' && sg.settingId === 'noir_docks' && sg.truth.title === 'The Pier Nine Job' && Object.keys(sg.suspects).length === 4, `[${tag}] shared case opens as a new game with sharedFrom`);
  ok(await page.$eval('.head-title', (e) => e.textContent) === 'The Pier Nine Job', `[${tag}] shared case title in header`);
  await pinFirstScene(page);
  const r2 = await accuse(page, 'Major Gerald Lusk');
  await page.waitForTimeout(200);
  const sc = (await fakeDb(page))['shared_scores/other1_user_test'];
  ok(sc && sc.caseId === 'other1' && sc.by === 'user_test' && sc.total === r2.total, `[${tag}] shared_scores/<id>_user_test written`);
  await act(page, 'reveal');
  const before = (await dbLog(page)).length;
  await act(page, 'share-case');
  await page.waitForFunction(() => /from the gallery already/.test(document.getElementById('toast').textContent));
  ok((await dbLog(page)).length === before, `[${tag}] a gallery case is not re-shared`);
  // replay keeps the gallery link
  await act(page, 'replay'); await page.waitForSelector('.file');
  ok((await game(page)).sharedFrom === 'other1', `[${tag}] replaying a gallery case keeps sharedFrom`);
  await act(page, 'menu'); await act(page, 'abandon-confirm'); await act(page, 'abandon-do');
  await act(page, 'gallery');
  await page.waitForFunction(() => /1 play/.test(document.getElementById('gallery-list')?.textContent || ''), null, { timeout: 5000 });
  const row = (await page.$$eval('#gallery-list .cb', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ')))).find((x) => x.includes('Pier Nine'));
  ok(row.includes(`1 play, best ${r2.total}, yours ${r2.total}`), `[${tag}] gallery shows plays/best/yours (${row})`);
  await act(page, 'close-modal');
  // a reload does not re-push or duplicate
  const sets0 = (await dbLog(page)).filter((x) => x.kind === 'set').length;
  await page.reload(); await ready(page); await page.waitForTimeout(500);
  const newSets = (await dbLog(page)).filter((x) => x.kind === 'set');
  ok(newSets.length <= 2, `[${tag}] after reload only remaining local cases are pushed (${newSets.map((x) => x.path).join(',')}, before ${sets0})`);
  ok(new Set((await book(page)).map((c) => c.id)).size === (await book(page)).length, `[${tag}] casebook has no duplicates after re-sync`);
  ok((await page.evaluate(() => window.__dbMax.perDoc)) <= 1, `[${tag}] never two writes in flight to one document`);
  errsOk(tag, errs, 'cloud flow');
  await ctx.close();
}

async function localOnlyFlow(vp, tag) {
  const { ctx, page, errs } = await open(vp, { over: { caps: { sample: true, db: false, user: false } } });
  await ready(page);
  await act(page, 'gallery');
  ok(/The gallery needs a signed-in claude\.ai viewer/.test(await page.textContent('#modal')), `[${tag}] local-only: gallery explains`);
  await screen(page, tag, 'gallery-local');
  await act(page, 'close-modal');
  await newCase(page);
  await pinFirstScene(page);
  await accuse(page, 'Major Gerald Lusk');
  await act(page, 'reveal');
  ok(!(await page.$('[data-act=share-case]')), `[${tag}] local-only: no share button`);
  await act(page, 'home');
  ok(/Haldane Court Affair/.test(await page.$eval('.cb', (e) => e.textContent)), `[${tag}] local-only: casebook works`);
  ok(!(await page.evaluate(() => localStorage.getItem('__fakedb'))) && !(await dbLog(page)).length, `[${tag}] local-only: nothing written to db`);
  errsOk(tag, errs, 'local-only flow');
  await ctx.close();
  // db present, user capability absent: no uid, so no sync and no share
  const o2 = await open(vp, { over: { caps: { sample: true, db: true, user: false } }, seed: cloudSeed() });
  await ready(o2.page);
  await o2.page.waitForTimeout(300);
  ok(!(await dbLog(o2.page)).length, `[${tag}] db without user: no sync`);
  await newCase(o2.page); await pinFirstScene(o2.page); await accuse(o2.page, 'Major Gerald Lusk'); await act(o2.page, 'reveal');
  ok(!(await o2.page.$('[data-act=share-case]')) && !(await dbLog(o2.page)).some((x) => x.kind === 'set'), `[${tag}] db without user: no share, no writes`);
  errsOk(tag, o2.errs, 'db-without-user flow');
  await o2.ctx.close();
}

// ================= 7. training =================
async function trainingFlow(vp, tag) {
  const { ctx, page, errs } = await open(vp, {}, '?training=ok');
  await ready(page);
  ok(!!(await page.$('[data-act=training]')), `[${tag}] training button shown for the country house`);
  await act(page, 'setting', '[data-id=noir_docks]');
  ok(!(await page.$('[data-act=training]')), `[${tag}] no training button for a setting without one`);
  await act(page, 'setting', '[data-id=country_house]');
  await act(page, 'training');
  await page.waitForSelector('.file');
  ok(await page.$eval('.stamp.tr', (e) => e.textContent) === 'Training case', `[${tag}] Training case stamp`);
  ok(!(await mlog(page, 'truth')).length && !(await mlog(page, 'briefs')).length, `[${tag}] training opens without generation`);
  await screen(page, tag, 'training-casefile');
  await tab(page, 'interrogate'); await ask(page, 'Tell me about the evening.');
  await page.click('.msg.sus [data-act=pin-msg] >> nth=-1'); await page.waitForSelector('#pin-text'); await act(page, 'pin-confirm');
  const r = await accuse(page, 'Major Gerald Lusk');
  ok(r.total === 82, `[${tag}] training case scores`);
  await act(page, 'reveal');
  ok(!(await page.$('[data-act=share-case]')), `[${tag}] training reveal has no share button`);
  await act(page, 'home');
  ok(/ · training · /.test(await page.$eval('.cb', (e) => e.textContent)), `[${tag}] casebook row says training`);
  await page.waitForTimeout(200);
  ok((await fakeDb(page))[Object.keys(await fakeDb(page)).find((k) => k.startsWith('data/users/user_test/case_'))]?.training === true, `[${tag}] cloud case doc marked training`);
  // training over a case in progress
  await newCase(page);
  await toHomeWithCaseInProgress(page);
  await act(page, 'training');
  ok(!!(await page.$('[data-act=training-do]')), `[${tag}] training over a case in progress asks first`);
  await act(page, 'close-modal');
  await act(page, 'training');
  ok(!!(await page.$('[data-act=training-do]')), `[${tag}] training asks again after Cancel`);
  await act(page, 'training-do');
  await page.waitForSelector('.stamp.tr');
  ok((await game(page)).training === true, `[${tag}] training case replaced the case in progress`);
  errsOk(tag, errs, 'training flow');
  await ctx.close();
  const b = await open(vp, {}, '?training=bad');
  await ready(b.page);
  ok(!(await b.page.$('[data-act=training]')), `[${tag}] malformed training data: no button`);
  errsOk(tag, b.errs, 'malformed training data');
  await b.ctx.close();
}

// ================= 8. normalizeTruth through the generation path =================
async function normalizeFlow(vp, tag) {
  const { ctx, page, errs } = await open(vp);
  await ready(page);
  const run = async (variant, preset) => { await setCfg(page, { truthVariant: variant }); await newCase(page, preset); const g = await game(page); await act(page, 'menu'); await act(page, 'abandon-confirm'); await act(page, 'abandon-do'); await page.waitForSelector('[data-act=new]'); return g; };
  let g = await run('surname', 'chief');
  ok(g.truth.killer === 'Major Gerald Lusk' && g.truth.accomplice === 'Mrs Edith Lusk' && g.briefs.find((b) => b.name === 'Major Gerald Lusk').part === 'killer' && g.briefs.find((b) => b.name === 'Mrs Edith Lusk').part === 'accomplice', `[${tag}] killer by surname resolves to the killer part when two share it (${g.truth.killer}/${g.truth.accomplice})`);
  g = await run('extra', 'inspector');
  ok(g.truth.suspects.length === 4 && g.truth.killer === 'Major Gerald Lusk' && g.truth.suspects.some((s) => s.name === 'Major Gerald Lusk' && s.part === 'killer') && Object.keys(g.suspects).length === 4, `[${tag}] more suspects than asked: trimmed to 4 keeping the killer (${g.truth.suspects.map((s) => s.name).join(',')})`);
  g = await run('accEqKiller', 'chief');
  ok(g.truth.accomplice === 'Mrs Edith Lusk', `[${tag}] accomplice equal to killer falls back to the accomplice part (${g.truth.accomplice})`);
  g = await run('twoMistaken', 'inspector');
  ok(g.truth.suspects.filter((s) => s.part === 'mistaken').length === 1, `[${tag}] two mistaken parts -> one`);
  g = await run('accWhenNone', 'inspector');
  ok(g.truth.accomplice === null && g.truth.suspects.find((s) => s.name === 'Miss Iris Dunmore').part === 'liar', `[${tag}] accomplice named when the dials said none is dropped`);
  ok(!(await mlog(page, 'repair')).length, `[${tag}] normalize variants need no repair`);
  await setCfg(page, { truthVariant: null });
  // shared/imported 6-suspect case keeps all six (dials null path)
  await newCase(page, 'yard');
  const code = await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('ir.game.v1')); const b = new TextEncoder().encode(JSON.stringify({ ir: 1, settingId: g.settingId, dials: g.dials, truth: g.truth, briefs: g.briefs })); let s = ''; b.forEach((x) => { s += String.fromCharCode(x); }); return 'IR1.' + btoa(s); });
  await act(page, 'menu'); await act(page, 'abandon-confirm'); await act(page, 'abandon-do');
  await act(page, 'import'); await page.fill('#import-text', code); await act(page, 'import-confirm'); await page.waitForSelector('.file');
  g = await game(page);
  ok(g.truth.suspects.length === 6 && Object.keys(g.suspects).length === 6 && g.truth.accomplice === 'Mrs Edith Lusk' && g.dials.suspects === 6, `[${tag}] imported 6-suspect case keeps all six (${g.truth.suspects.length})`);
  await tab(page, 'accuse');
  ok(!!(await page.$('#acc-accomplice')), `[${tag}] imported accomplice case shows the accomplice field`);
  errsOk(tag, errs, 'normalize flow');
  await ctx.close();
}

// ================= 9. migration of an old save and an old case code =================
function oldSave() {
  const t = clone(canned.truth); delete t.accomplice;
  const sus = {};
  for (const b of canned.briefs.briefs) sus[b.name] = { pressure: b.pressure.baseline, state: 'calm', transcript: [{ id: 'o' + b.name.length, role: 'sus', text: b.opening, clock: 0, opening: true }], claims: [], cracked: [], solicitor: false, waited: false };
  sus['Major Gerald Lusk'].state = 'lawyered'; sus['Major Gerald Lusk'].pressure = 90;
  return { v: 1, id: 'old1', settingId: 'country_house', createdAt: Date.now(), phase: 'play', truth: t, briefs: canned.briefs.briefs, clock: { used: 100, budget: 360 }, suspects: sus, board: { pins: [{ id: 'p1', kind: 'forensic', text: t.forensics.exchange, source: 'Telephone exchange log', msgId: 'exchange', time: null, clock: 50, createdAt: Date.now() }], links: [] }, forensics: { exchange: { at: 50, result: t.forensics.exchange } }, lieLog: [], accusation: null, score: null, active: 'Major Gerald Lusk' };
}
async function migrationFlow(vp, tag) {
  const { ctx, page, errs } = await open(vp, { local: { 'ir.game.v1': oldSave() } });
  await page.waitForSelector('.file');
  ok(await clock(page) === 260, `[${tag}] old save resumes with its clock`);
  ok(/received/.test(await page.$eval('[data-act=pin-forensic][data-id=comms]', (e) => e.closest('.fo').textContent)) && await page.$eval('[data-act=pin-forensic][data-id=comms]', (e) => e.disabled), `[${tag}] old exchange report migrates to comms and stays pinned`);
  ok(!!(await page.$('[data-act=forensic][data-id=logs]')), `[${tag}] logs report requestable`);
  ok(/^4 suspects\. a killer, 1 liar/.test(await page.$eval('.file > p:nth-of-type(2)', (e) => e.textContent)), `[${tag}] old save gets default dials`);
  await tab(page, 'interrogate');
  ok(/Wants a solicitor/.test(await tHead(page)) && !!(await page.$('[data-act=counsel]')), `[${tag}] old lawyered suspect shows counsel panel`);
  await act(page, 'counsel');
  ok(/Solicitor present/.test(await tHead(page)), `[${tag}] old save: waiting for counsel works`);
  await ask(page, 'With your solicitor present, then.');
  ok(/Solicitor present/.test(await tHead(page)), `[${tag}] applyState keeps guarded with solicitor set`);
  await tab(page, 'accuse');
  ok(!(await page.$('#acc-accomplice')), `[${tag}] old save has no accomplice field`);
  // an old IR1 code without dials and with old forensic keys
  const code = 'IR1.' + Buffer.from(JSON.stringify({ ir: 1, settingId: 'country_house', truth: canned.truth, briefs: canned.briefs.briefs })).toString('base64');
  await act(page, 'menu'); await act(page, 'abandon-confirm'); await act(page, 'abandon-do');
  await act(page, 'import'); await page.fill('#import-text', code); await act(page, 'import-confirm'); await page.waitForSelector('.file');
  await page.click('[data-act=forensic][data-id=comms]');
  ok((await page.$eval('[data-act=pin-forensic][data-id=comms]', (e) => e.closest('.fo').querySelector('.res').textContent)) === canned.truth.forensics.exchange, `[${tag}] old code: exchange result under comms`);
  errsOk(tag, errs, 'migration flow');
  await ctx.close();
}

// ================= 10. hot reload boot =================
async function hotFlow(vp, tag) {
  const { ctx, page, errs } = await open(vp, { hot: null });
  ok(await page.evaluate(() => window.__readyCalled && typeof window.__snapFn === 'function'), `[${tag}] hot: registers snapshot and boots through ready`);
  await ready(page);
  await newCase(page);
  await tab(page, 'interrogate');
  await ask(page, 'Hot question one');
  await page.click('.msg.sus [data-act=pin-msg] >> nth=-1'); await page.waitForSelector('#pin-text'); await act(page, 'pin-confirm');
  await tab(page, 'board');
  const snap = await page.evaluate(() => JSON.parse(JSON.stringify(window.__snapFn())));
  ok(snap.G && snap.G.truth && snap.ui.tab === 'board', `[${tag}] hot: snapshot carries G and ui`);
  await tab(page, 'interrogate');
  await setCfg(page, { actorDelay: 3000 });
  await page.fill('#q', 'Snapshot me mid-question'); await act(page, 'ask'); await page.waitForSelector('[data-act=stop]');
  const midSnap = await page.evaluate(() => JSON.parse(JSON.stringify(window.__snapFn())));
  await act(page, 'stop'); await idle(page);
  errsOk(tag, errs, 'hot');
  await ctx.close();
  for (const [s, label] of [[snap, 'board'], [midSnap, 'mid-question']]) {
    const o = await open(vp, { hot: s, over: { actorDelay: 30 } });
    const p2 = o.page;
    ok(await p2.$eval('.head-title', (e) => e.textContent) === TITLE, `[${tag}] hot(${label}): restores the game`);
    if (label === 'board') ok(!!(await p2.$('.pin')), `[${tag}] hot(board): restores tab and board`);
    else {
      await p2.waitForTimeout(300);
      ok(!(await p2.$('.b.thinking')), `[${tag}] hot(mid-question): no stuck pending bubble`);
      ok(await clock(p2) === 355, `[${tag}] hot(mid-question): unanswered question refunded`);
      await p2.waitForFunction(() => document.querySelector('#q') && !document.querySelector('#q').disabled);
      await ask(p2, 'After hot restore');
      ok(/reply #/.test(await lastSusText(p2)), `[${tag}] hot(mid-question): asking works after restore`);
    }
    errsOk(tag, o.errs, `hot(${label})`);
    await o.ctx.close();
  }
  const scoring = clone(snap); scoring.G.phase = 'scoring';
  const o3 = await open(vp, { hot: scoring });
  ok(!/Chief Constable is reading/.test(await o3.page.textContent('#app')), `[${tag}] hot(scoring): does not hang on scoring screen`);
  await o3.ctx.close();
}

async function noClaude(vp, tag) {
  const { ctx, page, errs } = await open(vp, { over: { caps: { sample: false, db: false, user: false } } });
  await page.waitForSelector('.err');
  ok(await page.$eval('[data-act=new]', (e) => e.disabled), `[${tag}] no claude: new case disabled with notice`);
  errsOk(tag, errs, 'no claude');
  await ctx.close();
  // no window.claude at all
  const c2 = await browser.newContext({ viewport: vp });
  await c2.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p2 = await c2.newPage(); const e2 = []; watch(p2, e2);
  await p2.goto(BASEURL); await p2.waitForSelector('.err');
  await p2.click('[data-act=gallery]');
  ok(/needs a signed-in/.test(await p2.textContent('#modal')), `[${tag}] no window.claude: gallery note`);
  errsOk(tag, e2, 'no window.claude');
  await c2.close();
}

async function sweep() {
  const { ctx, page, errs } = await open({ width: 860, height: 800 });
  await ready(page);
  await act(page, 'preset', '[data-id=custom]');
  for (const w of [360, 390, 519, 520, 639, 640]) { await page.setViewportSize({ width: w, height: 800 }); const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); ok(ov <= 0, `[sweep ${w}] no overflow on custom menu (${ov})`); }
  await page.setViewportSize({ width: 860, height: 800 });
  await newCase(page, 'yard');
  await page.click('[data-act=pin-scene] >> nth=0'); await page.click('[data-act=pin-scene] >> nth=1');
  await tab(page, 'board'); await page.click('[data-act=link-from] >> nth=0'); await page.click('[data-act=link-to][data-type=contradicts] >> nth=0');
  for (const w of [320, 360, 639, 640, 759, 760, 859, 860, 1000]) {
    await page.setViewportSize({ width: w, height: 800 });
    for (const t of ['case', 'interrogate', 'board', 'accuse']) {
      await tab(page, t);
      if (t === 'board') { await act(page, 'bview', '[data-v=links]'); }
      const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      ok(ov.sw <= ov.iw, `[sweep ${w}] no overflow on ${t} (${ov.sw})`);
      if (t === 'board') await act(page, 'bview', '[data-v=pins]');
    }
    await act(page, 'menu'); await page.waitForSelector('#modal .box');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `[sweep ${w}] no overflow with menu sheet`);
    await act(page, 'close-modal');
  }
  await page.setViewportSize({ width: 860, height: 800 }); await tab(page, 'interrogate');
  await screen(page, 'sweep', 'interrogate-860');
  errsOk('sweep', errs, 'sweep');
  await ctx.close();
}

(async () => {
  const srv = await serve();
  BASEURL = `http://127.0.0.1:${srv.address().port}/`;
  browser = await chromium.launch();
  const flows = [mainFlow, menuFlow, genFlow, settingsFlow, scoringFlow, cloudFlow, localOnlyFlow, trainingFlow, normalizeFlow, migrationFlow, hotFlow, noClaude];
  const deskOnly = new Set(['normalizeFlow', 'migrationFlow']);
  const t0 = Date.now();
  for (const [vp, tag] of [[{ width: 390, height: 844 }, 'phone'], [{ width: 1280, height: 800 }, 'desk']]) {
    console.log(`== ${tag} ${vp.width}x${vp.height}`);
    for (const fn of flows) {
      if (ONLY.length && !ONLY.includes(fn.name)) continue;
      if (deskOnly.has(fn.name) && tag === 'phone') continue;
      const f0 = failures, p0 = passes, s = Date.now();
      try { await fn(vp, tag); } catch (e) { failures++; console.log(`  CRASH in ${fn.name} [${tag}]:`, e.message.split('\n')[0], (e.stack.match(/harness\.js:\d+/g) || []).slice(0, 3).join(' ')); try { await global.__page.screenshot({ path: path.join(OUT, `CRASH-${tag}-${fn.name}.png`) }); console.log('    state:', await global.__page.evaluate(() => ({ modal: !document.getElementById('modal').hidden, toast: document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent, acts: [...new Set([...document.querySelectorAll('[data-act]')].map((e) => e.dataset.act))].join(',') }))); } catch (x) { console.log('    (no state)', x.message.split('\n')[0]); } }
      console.log(`  ${fn.name}: ${passes - p0} passed, ${failures - f0} failed (${((Date.now() - s) / 1000).toFixed(1)}s)`);
    }
  }
  if (!ONLY.length || ONLY.includes('sweep')) { try { await sweep(); } catch (e) { failures++; console.log('  CRASH in sweep:', e.message.split('\n')[0], (e.stack.match(/harness\.js:\d+/g) || []).join(' ')); } }
  await browser.close(); srv.close();
  console.log(`\n${passes} passed, ${failures} failed (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  process.exit(failures ? 1 : 0);
})();
