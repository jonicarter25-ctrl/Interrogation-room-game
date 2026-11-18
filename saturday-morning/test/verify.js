// Verification for Saturday Morning. Usage, from the repo root or this folder:
//   node saturday-morning/test/verify.js            run every check, print PASS/FAIL per step
//   node saturday-morning/test/verify.js --fonts    also load the real web fonts for the screenshots
// It serves ../index.html inside the same skeleton the Artifact publish wraps it in, drives the page
// with Playwright at desktop and phone widths, and writes screenshots to test/shots/.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const SRC = path.join(__dirname, '..', 'index.html');
const OUT = path.join(__dirname, 'shots');
const FONTS = process.argv.includes('--fonts');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));

const wrap = (b) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${b}</body></html>`;

let pass = 0, fail = 0, section = '';
const failures = [];
function step(name) { section = name; console.log('\n' + name); }
function ok(cond, label, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; failures.push(`${section} :: ${label}`); console.log('  FAIL  ' + label + (detail !== undefined ? '\n        got: ' + JSON.stringify(detail) : '')); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const STARTER_A = [['tf', 0], ['ani', 25], ['bat', 60]];
const T = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m - 480; };

let browser, base;
async function open({ w = 1440, h = 900, touch = false, scheme = 'light', init = null, initArg = null, storage = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: scheme, hasTouch: touch, isMobile: touch, storageState: storage || undefined });
  if (!FONTS) await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (init) await ctx.addInitScript(init, initArg);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto(base);
  await page.waitForSelector('.blk-b');
  if (FONTS) await page.evaluate(() => document.fonts.ready);
  return { ctx, page, errs };
}
// What the page shows, read the way a person would: from the lineup tags and the timeline.
const stats = (page, k) => page.evaluate((k) => { const t = document.querySelector(`[data-k="tag-${k}"]`); const n = [...t.querySelectorAll('.st b')].map((b) => +b.textContent); return { booked: n[0], open: n[1], label: t.getAttribute('aria-label') }; }, k);
const slots = (page, k) => page.evaluate((k) => window.__morning.state.lineups[k].slots.map((s) => [s.show, s.at]), k);
const active = (page) => page.evaluate(() => window.__morning.state.active);
const consoleText = (page) => page.evaluate(() => document.querySelector('#console').innerText.replace(/\s+/g, ' ').trim());
const noteText = (page) => page.evaluate(() => document.querySelector('#note').innerText.replace(/\s+/g, ' ').trim());
const onTrack = (page, k, sel) => page.evaluate(([k, sel]) => [...document.querySelectorAll(`#track-${k} ${sel}`)].map((n) => [+n.style.getPropertyValue('--s'), +n.style.getPropertyValue('--d')]), [k, sel]);
const marks = (page) => page.evaluate(() => [...document.querySelectorAll('#rail .mark')].map((n) => [+n.style.getPropertyValue('--s'), +n.style.getPropertyValue('--d')]));
const diffRows = (page) => page.evaluate(() => [...document.querySelectorAll('#diffs .dlist li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()));
const click = (page, k) => page.locator(`[data-k="${k}"]`).first().click();
const aim = (page, hhmm) => page.selectOption('#aim-time', { label: hhmm });
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
let shotN = 0;
async function shot(page, name, full = false) { await page.waitForTimeout(320); await page.screenshot({ path: path.join(OUT, String(++shotN).padStart(2, '0') + '-' + name + '.png'), fullPage: full }); }

async function main() {
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(wrap(fs.readFileSync(SRC, 'utf8'))); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + srv.address().port + '/';
  browser = await chromium.launch(FONTS && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1' } } : {});

  /* ================= desktop: verification steps 1 to 6 ================= */
  let { ctx, page, errs } = await open();

  step('1. Starter lineup: 70 booked, 50 open');
  let a = await stats(page, 'A');
  ok(a.booked === 70 && a.open === 50, 'Lineup A reads 70 min booked and 50 min open', a);
  ok(eq(await slots(page, 'A'), STARTER_A), 'A holds Transformers 8:00, Animaniacs 8:25, Batman 9:00', await slots(page, 'A'));
  ok(eq(await onTrack(page, 'A', '.seg.gap'), [[40, 20], [90, 30]]), 'the remaining airtime shows as two open slots: 8:40-9:00 and 9:30-10:00', await onTrack(page, 'A', '.seg.gap'));
  ok(await page.locator('#track-A .is-locked .lockplate').count() === 1, 'Batman carries a lock plate in A');
  ok((await page.locator('[data-k="blk-A-bat"]').getAttribute('aria-label')).includes('locked'), 'Batman is announced as locked');
  await shot(page, 'desktop-starter');

  step('2. Gargoyles at 8:40 is rejected, lineup intact');
  await aim(page, '8:40');
  await page.hover('[data-k="place-gar"]');
  ok(await page.locator('#track-A .ghost.bad').count() === 1, 'hovering the Place button previews the invalid placement on the timeline');
  await click(page, 'place-gar');
  let c = await consoleText(page);
  ok(/Not placed/i.test(c), 'the console says Not placed', c);
  ok(c.includes('overlap Batman: The Animated Series (9:00–9:30) by 10 minutes'), 'it names the conflict: overlaps Batman 9:00-9:30 by 10 minutes', c);
  ok(c.includes('Lineup A is unchanged'), 'it says Lineup A is unchanged', c);
  ok(eq(await slots(page, 'A'), STARTER_A), 'Lineup A is exactly as it was', await slots(page, 'A'));
  a = await stats(page, 'A'); ok(a.booked === 70 && a.open === 50, 'still 70 booked, 50 open', a);
  ok(await page.locator('#track-A .ghost.bad').count() === 1 && eq(await onTrack(page, 'A', '.clash'), [[60, 10]]), 'the rejected attempt is drawn hatched, with the 10 clashing minutes marked on Batman', await onTrack(page, 'A', '.clash'));
  ok((await page.locator('#sr').textContent()).includes('overlap Batman'), 'the rejection is also announced to assistive tech');
  await shot(page, 'desktop-rejected');
  ok(await page.locator('[data-k="fix-0"]').innerText() === 'Place at 9:30 instead', 'a one-click recovery is offered: Place at 9:30 instead');
  await click(page, 'dismiss');
  ok(await page.locator('#track-A .ghost').count() === 0, 'dismissing clears the rejected attempt');

  step('3. Duplicate A into B, add Pinky 8:40 and Gundam Wing 9:30 to B');
  await click(page, 'dup-ab');
  ok(eq(await slots(page, 'B'), STARTER_A), 'B is now a copy of A', await slots(page, 'B'));
  ok(await active(page) === 'B', 'B becomes the lineup being edited');
  ok(eq(await marks(page), []), 'right after duplicating, no differences are marked');
  await aim(page, '8:40'); await click(page, 'place-pb');
  await click(page, 'gap-B-90'); await click(page, 'place-gw');
  let b = await stats(page, 'B'); a = await stats(page, 'A');
  ok(b.booked === 105 && b.open === 15, 'B reads 105 booked, 15 open', b);
  ok(a.booked === 70 && a.open === 50, 'A stays at 70 booked, 50 open', a);
  ok(eq(await slots(page, 'A'), STARTER_A), 'A itself is untouched');
  ok(eq(await marks(page), [[40, 10], [90, 25]]), 'the difference rail marks exactly 8:40-8:50 and 9:30-9:55', await marks(page));
  let rows = await diffRows(page);
  ok(rows.length === 2 && /8:40–8:50.*A open airtime.*B Pinky and the Brain/.test(rows[0]) && /9:30–9:55.*A open airtime.*B Gundam Wing/.test(rows[1]), 'the difference list names both additions with their times', rows);
  await page.waitForTimeout(400); // let the placement animation settle before measuring
  const geo = await page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const A = r('#track-A'), B = r('#track-B'), m = [...document.querySelectorAll('#rail .mark')].map((n) => n.getBoundingClientRect()), pb = r('[data-k="blk-B-pb"]'), gw = r('[data-k="blk-B-gw"]'); return { sameScale: Math.abs(A.left - B.left) < 1 && Math.abs(A.width - B.width) < 1, m0: Math.abs(m[0].left - pb.left) < 3 && Math.abs(m[0].right - pb.right) < 3, m1: Math.abs(m[1].left - gw.left) < 3 && Math.abs(m[1].right - gw.right) < 3 }; });
  ok(geo.sameScale, 'A and B share one time scale (same left edge and width)');
  ok(geo.m0 && geo.m1, 'each marker sits directly above the show it flags in B', geo);
  await shot(page, 'desktop-b-edited');

  step('4. Undo in B, then refresh');
  await click(page, 'undo');
  b = await stats(page, 'B');
  ok(b.booked === 80, 'after Undo, B reads 80 booked', b);
  ok(eq(await slots(page, 'B'), [['tf', 0], ['ani', 25], ['pb', 40], ['bat', 60]]), 'Pinky is still at 8:40, Gundam Wing is gone', await slots(page, 'B'));
  await page.reload(); await page.waitForSelector('.blk-b');
  b = await stats(page, 'B'); a = await stats(page, 'A');
  ok(b.booked === 80 && b.open === 40, 'after a refresh B still reads 80 booked', b);
  ok(eq(await slots(page, 'B'), [['tf', 0], ['ani', 25], ['pb', 40], ['bat', 60]]), 'Pinky is still in place after the refresh', await slots(page, 'B'));
  ok(a.booked === 70 && eq(await slots(page, 'A'), STARTER_A), 'A is intact after the refresh', a);
  ok(await page.locator('#track-A .is-locked').count() === 1 && await page.locator('#track-B .is-locked').count() === 1, 'the locked Batman slot is intact in both lineups');
  ok(await active(page) === 'B', 'the refresh comes back to the lineup being edited');
  ok(await page.locator('[data-k="undo"]').getAttribute('aria-disabled') === 'false' && await page.locator('[data-k="redo"]').getAttribute('aria-disabled') === 'false', 'undo and redo history survive the refresh too');
  await shot(page, 'desktop-after-refresh');

  step('5. Fill open airtime on the untouched starter lineup');
  await click(page, 'tag-A');
  ok(eq(await slots(page, 'A'), STARTER_A), 'starting from the untouched starter in A');
  await click(page, 'cat-Comedy');
  ok(await page.locator('#cards .card').count() === 2, 'with the library filtered to Comedy, Gargoyles is hidden');
  await click(page, 'fill');
  ok(eq(await onTrack(page, 'A', '.is-suggest'), [[40, 10], [90, 30]]), 'the preview draws suggestions at 8:40 (10 min) and 9:30 (30 min) on the timeline', await onTrack(page, 'A', '.is-suggest'));
  let adds = await page.evaluate(() => [...document.querySelectorAll('.plan-adds li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()));
  ok(eq(adds, ['Pinky and the Brain 8:40–8:50', 'Gargoyles 9:30–10:00']), 'it proposes Pinky at 8:40 and Gargoyles at 9:30', adds);
  c = await consoleText(page);
  ok(c.includes('Fills 40 of 50 open minutes') && c.includes('110 booked'), 'it says how much airtime it fills: 40 of 50 open minutes, 110 booked', c);
  ok(c.includes('8:50–9:00 stays open (10 min)') && c.includes('The only show short enough for 10 minutes is Pinky and the Brain, and this proposal already uses it at 8:40') && c.includes('Every unused show runs 25 minutes or longer'), 'it explains why the last 10 minutes stay open', c);
  ok(c.includes('including the 6 your filter is hiding'), 'it says it considered the shows the filter is hiding', c);
  ok(eq(await slots(page, 'A'), STARTER_A) && (await stats(page, 'A')).booked === 70, 'the preview changes nothing: A still 70 booked');
  ok(eq(await onTrack(page, 'A', '.is-stays'), [[50, 10]]), 'the leftover gap is labelled as staying open', await onTrack(page, 'A', '.is-stays'));
  await shot(page, 'desktop-fill-preview');
  await click(page, 'plan-dismiss');
  ok(eq(await slots(page, 'A'), STARTER_A) && await page.locator('#track-A .is-suggest').count() === 0, 'Dismiss removes the proposal and leaves A as it was');
  await click(page, 'cat-all');
  await click(page, 'fill'); await click(page, 'plan-apply');
  a = await stats(page, 'A');
  ok(a.booked === 110 && a.open === 10, 'accepting takes A to 110 booked, 10 open', a);
  ok(eq(await slots(page, 'A'), [['tf', 0], ['ani', 25], ['pb', 40], ['bat', 60], ['gar', 90]]), 'both shows landed where previewed', await slots(page, 'A'));
  await click(page, 'undo');
  a = await stats(page, 'A');
  ok(a.booked === 70 && eq(await slots(page, 'A'), STARTER_A), 'one Undo takes the whole batch back to 70', a);

  step('6. Remove Animaniacs, fill again: a full 120 minutes');
  await click(page, 'blk-A-ani'); await click(page, 'remove');
  ok(eq(await slots(page, 'A'), [['tf', 0], ['bat', 60]]), 'Animaniacs is removed', await slots(page, 'A'));
  await click(page, 'fill');
  c = await consoleText(page);
  ok(c.includes('Fills 65 of 65 open minutes') && c.includes('120 booked'), 'the proposal fills all 65 open minutes: 120 booked', c);
  await shot(page, 'desktop-fill-120');
  await click(page, 'plan-apply');
  a = await stats(page, 'A');
  ok(a.booked === 120 && a.open === 0, 'A reads 120 booked, 0 open', a);
  const full = await slots(page, 'A');
  ok(full.some((s) => eq(s, ['tf', 0])) && full.some((s) => eq(s, ['bat', 60])), 'Transformers and Batman stayed in place', full);
  ok(await page.locator('#track-A .seg.gap').count() === 0, 'no open airtime is left on the timeline');
  ok(new Set(full.map((s) => s[0])).size === full.length, 'no show appears twice');
  ok(errs.length === 0, 'no script errors during steps 1 to 6', errs);
  ok(await overflow(page) <= 0, 'no sideways scroll at 1440px');
  await ctx.close();

  /* ================= desktop: the rest of the rules and controls ================= */
  ({ ctx, page, errs } = await open());

  step('Rules: duplicates, the broadcast window, touching boundaries, the lock');
  await aim(page, '9:30'); await click(page, 'place-tf');
  c = await consoleText(page);
  ok(c.includes('Transformers G1 is already in Lineup A at 8:00') && c.includes('only once per lineup') && c.includes('Lineup A is unchanged'), 'a duplicate is rejected with the reason', c);
  ok(eq(await slots(page, 'A'), STARTER_A), 'the lineup is intact after the duplicate attempt');
  ok(await page.locator('[data-k="fix-0"]').innerText() === 'Move it to 9:30', 'the recovery offered is to move the existing airing');
  await click(page, 'fix-0');
  ok(eq(await slots(page, 'A'), [['ani', 25], ['bat', 60], ['tf', 90]]), 'taking it moves Transformers to 9:30', await slots(page, 'A'));
  await click(page, 'undo');
  await aim(page, '9:45'); await click(page, 'place-gw');
  c = await consoleText(page);
  ok(c.includes('run 10 minutes past the end of the broadcast window at 10:00') && c.includes('Lineup A is unchanged'), 'running past 10:00 is rejected with the reason', c);
  ok(eq(await slots(page, 'A'), STARTER_A), 'the lineup is intact after the out-of-window attempt');
  await click(page, 'dismiss');
  await page.locator('[data-k="blk-A-tf"]').focus(); await page.keyboard.press('ArrowLeft');
  c = await consoleText(page);
  ok(c.includes('start 5 minutes before the broadcast window opens at 8:00') && /Not moved/i.test(c), 'moving a show before 8:00 is rejected with the reason', c);
  ok(eq(await slots(page, 'A'), STARTER_A), 'the lineup is intact after that too');
  await click(page, 'dismiss');
  await click(page, 'tag-B');
  await aim(page, '8:30'); await click(page, 'place-gar');
  await aim(page, '8:05'); await click(page, 'place-tf');
  ok(eq(await slots(page, 'B'), [['tf', 5], ['gar', 30], ['bat', 60]]), 'shows may touch at their boundaries: 8:05-8:30, 8:30-9:00, 9:00-9:30', await slots(page, 'B'));
  await click(page, 'blk-B-bat');
  c = await consoleText(page);
  ok(/locked/i.test(c) && c.includes("can't be moved or removed") && await page.locator('[data-k="remove"]').count() === 0 && await page.locator('#mv-time').count() === 0, 'selecting Batman explains the lock and offers no move or remove control', c);
  await page.locator('[data-k="blk-B-bat"]').focus(); await page.keyboard.press('Delete');
  c = await consoleText(page);
  ok(c.includes("can't be moved or removed") && eq(await slots(page, 'B'), [['tf', 5], ['gar', 30], ['bat', 60]]), 'Delete on Batman is refused, lineup intact', c);
  await click(page, 'dismiss');
  await page.locator('[data-k="blk-B-bat"]').focus(); await page.keyboard.press('ArrowRight');
  ok(eq(await slots(page, 'B'), [['tf', 5], ['gar', 30], ['bat', 60]]), 'an arrow-key move on Batman is refused');
  let box = await page.locator('[data-k="blk-B-bat"]').boundingBox();
  await page.mouse.move(box.x + 40, box.y + 40); await page.mouse.down(); await page.mouse.move(box.x + 160, box.y + 40, { steps: 6 }); await page.mouse.up();
  c = await consoleText(page);
  ok(c.includes('is locked at 9:00') && eq(await slots(page, 'B'), [['tf', 5], ['gar', 30], ['bat', 60]]), 'dragging Batman is refused, lineup intact', c);
  await click(page, 'dismiss');

  step('Move, remove, undo and redo through click and keyboard paths');
  await click(page, 'blk-B-tf');
  ok((await consoleText(page)).includes('Transformers G1') && await page.locator('#mv-time').count() === 1, 'selecting a show opens its start-time controls');
  await click(page, 'mv-dec');
  ok(eq(await slots(page, 'B'), [['tf', 0], ['gar', 30], ['bat', 60]]), 'the stepper moves it 5 minutes earlier', await slots(page, 'B'));
  await page.selectOption('#mv-time', { label: '8:10' });
  c = await consoleText(page);
  ok(c.includes("can't move to 8:10") && c.includes('overlap Gargoyles (8:30–9:00) by 5 minutes') && eq(await slots(page, 'B'), [['tf', 0], ['gar', 30], ['bat', 60]]), 'an overlapping move is rejected with the reason, lineup intact', c);
  await click(page, 'dismiss');
  await page.locator('[data-k="blk-B-gar"]').focus(); await page.keyboard.press('ArrowLeft');
  ok(eq(await slots(page, 'B'), [['tf', 0], ['gar', 25], ['bat', 60]]), 'an arrow key nudges the focused show', await slots(page, 'B'));
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.k) === 'blk-B-gar', 'focus stays on the show after the nudge');
  await page.keyboard.press('Delete');
  ok(eq(await slots(page, 'B'), [['tf', 0], ['bat', 60]]), 'Delete removes the focused show', await slots(page, 'B'));
  await page.keyboard.press('Control+z');
  ok(eq(await slots(page, 'B'), [['tf', 0], ['gar', 25], ['bat', 60]]), 'Ctrl+Z undoes the removal', await slots(page, 'B'));
  await click(page, 'redo');
  ok(eq(await slots(page, 'B'), [['tf', 0], ['bat', 60]]), 'Redo brings it back', await slots(page, 'B'));
  ok(eq(await slots(page, 'A'), STARTER_A), 'none of the edits in B touched A');

  step('Dragging (mouse): move along the timeline, drop from the library, reject on a bad drop');
  await click(page, 'tag-A');
  const trk = await page.locator('#track-A').boundingBox(), ppm = trk.width / 120;
  box = await page.locator('[data-k="blk-A-ani"]').boundingBox();
  await page.mouse.move(box.x + 20, box.y + 60); await page.mouse.down(); await page.mouse.move(box.x + 20 + ppm * 5.2, box.y + 60, { steps: 8 });
  ok(await page.locator('#track-A .ghost.ok').count() === 1, 'while dragging, a preview shows where the show would land');
  await page.mouse.up();
  ok(eq(await slots(page, 'A'), [['tf', 0], ['ani', 30], ['bat', 60]]), 'dropping 5 minutes later moves Animaniacs to 8:30', await slots(page, 'A'));
  box = await page.locator('[data-k="blk-A-ani"]').boundingBox();
  await page.mouse.move(box.x + 20, box.y + 60); await page.mouse.down(); await page.mouse.move(box.x + 20 + ppm * 20, box.y + 60, { steps: 8 });
  ok(await page.locator('#track-A .ghost.bad').count() === 1, 'dragging onto Batman shows the invalid state before the drop');
  await page.mouse.up();
  c = await consoleText(page);
  ok(/Not moved/i.test(c) && c.includes('overlap Batman') && eq(await slots(page, 'A'), [['tf', 0], ['ani', 30], ['bat', 60]]), 'a bad drop is rejected with the reason, lineup intact', c);
  await click(page, 'dismiss');
  const card = await page.locator('.card[data-show="gar"] .thumb').boundingBox();
  await page.mouse.move(card.x + 10, card.y + 10); await page.mouse.down();
  await page.mouse.move(trk.x + ppm * 105, trk.y + 60, { steps: 12 });
  await page.mouse.up();
  ok(eq(await slots(page, 'A'), [['tf', 0], ['ani', 30], ['bat', 60], ['gar', 90]]), 'dragging Gargoyles from the library onto 9:30 places it', await slots(page, 'A'));

  step('Library: search, filters, the empty state');
  await page.fill('#q', 'brain');
  ok(await page.locator('#cards .card').count() === 1 && (await page.locator('#cards .c-ttl').innerText()) === 'Pinky and the Brain', 'searching "brain" finds Pinky and the Brain');
  await page.fill('#q', 'xmen');
  ok((await page.locator('#cards .c-ttl').allInnerTexts()).join() === 'X-Men', 'searching "xmen" still finds X-Men');
  await page.fill('#q', 'adventure');
  ok((await page.locator('#cards .c-ttl').allInnerTexts()).join() === 'Gargoyles,DuckTales', 'searching a category name works', await page.locator('#cards .c-ttl').allInnerTexts());
  await page.fill('#q', 'zzz');
  const empty = await page.locator('#cards .empty').innerText();
  ok(empty.includes('No shows match “zzz”') && await page.locator('[data-k="e-q"]').count() === 1, 'a search with no hits explains itself and offers Clear search', empty);
  await shot(page, 'desktop-empty-search');
  await click(page, 'e-q');
  ok(await page.locator('#cards .card').count() === 8 && await page.inputValue('#q') === '', 'Clear search brings all 8 shows back');
  await click(page, 'cat-Action');
  ok((await page.locator('#cards .c-ttl').allInnerTexts()).join() === 'Transformers G1,Batman: The Animated Series,X-Men', 'the Action filter shows the three Action shows');
  await click(page, 'cat-all'); await aim(page, '8:45'); await click(page, 'fits');
  const fitTitles = await page.locator('#cards .c-ttl').allInnerTexts();
  ok(eq(fitTitles, ['Pinky and the Brain']), 'the "Fits at 8:45" filter keeps only the show that fits the 15-minute opening', fitTitles);
  await aim(page, '8:25');
  const noFit = await page.locator('#cards .empty').innerText();
  ok(noFit.includes('No show fits at 8:25 in Lineup A') && await page.locator('[data-k="e-fits"]').count() === 1, 'when nothing fits, the list says so and offers a way back', noFit);
  await click(page, 'e-fits');
  ok(await page.locator('#cards .card').count() === 8, 'turning the filter off brings all 8 shows back');
  ok(errs.length === 0, 'no script errors in the extra checks', errs);
  await ctx.close();

  /* ================= the solver, checked against an independent brute force ================= */
  ({ ctx, page, errs } = await open());
  step('Fill solver: optimal on 400 random lineups');
  const solver = await page.evaluate(() => {
    const M = window.__morning, by = Object.fromEntries(M.SHOWS.map((s) => [s.id, s.min]));
    let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const bad = [];
    for (let n = 0; n < 400; n++) {
      const slots = [{ show: 'bat', at: 60 }];
      for (const s of M.SHOWS) { if (s.id === 'bat' || rnd() < 0.5) continue; const at = Math.floor(rnd() * ((120 - s.min) / 5 + 1)) * 5; if (!M.check(slots, s.id, at, false).length) slots.push({ show: s.id, at }); }
      const gaps = M.gapsOf(slots).map((g) => g.len), pool = M.SHOWS.filter((s) => !slots.some((x) => x.show === s.id)).map((s) => s.min);
      let best = 0; (function go(i, cap, got) { if (i === pool.length) { if (got > best) best = got; return; } go(i + 1, cap, got); for (let g = 0; g < cap.length; g++) if (cap[g] >= pool[i]) { const c = cap.slice(); c[g] -= pool[i]; go(i + 1, c, got + pool[i]); } })(0, gaps, 0);
      const p = M.proposeFill(slots), after = [...slots, ...p.adds];
      const legal = p.adds.every((a, i) => !M.check([...slots, ...p.adds.slice(0, i)], a.show, a.at, false).length);
      const left = p.left.reduce((x, l) => x + l.len, 0);
      if (p.filled !== best || !legal || M.booked(after) !== M.booked(slots) + best || left !== 120 - M.booked(after) || p.left.some((l) => !l.why)) bad.push({ slots, got: p.filled, best, legal });
    }
    return bad;
  });
  ok(solver.length === 0, 'every proposal fills the maximum possible, legally, and explains each leftover gap', solver.slice(0, 2));
  await ctx.close();

  /* ================= phone: verification step 7 ================= */
  ({ ctx, page, errs } = await open({ w: 390, h: 844, touch: true }));
  step('7. Narrow screen, touch: place a show, recover from a rejection, check A vs B');
  ok(await overflow(page) <= 0, 'no sideways scroll at 390px');
  const lanes = await page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const A = r('#track-A'), B = r('#track-B'); return { side: A.right < B.left && Math.abs(A.top - B.top) < 1 && Math.abs(A.height - B.height) < 1, inView: B.right <= innerWidth, wA: Math.round(A.width) }; });
  ok(lanes.side && lanes.inView, 'A and B sit side by side on one vertical clock, both inside the screen', lanes);
  await shot(page, 'phone-starter', true);
  await page.locator('[data-k="gap-A-40"]').tap();
  await page.waitForTimeout(350);
  ok(await page.evaluate(() => document.querySelector('#app').classList.contains('sheet-open') && document.querySelector('#lib').getAttribute('role') === 'dialog'), 'tapping the open 8:40 slot opens the library as a sheet');
  ok(await page.inputValue('#aim-time') === '40', 'the sheet is aimed at 8:40');
  await shot(page, 'phone-sheet');
  await page.locator('[data-k="place-pb"]').tap();
  await page.waitForTimeout(350);
  a = await stats(page, 'A');
  ok(a.booked === 80 && eq(await slots(page, 'A'), [['tf', 0], ['ani', 25], ['pb', 40], ['bat', 60]]), 'tapping Place puts Pinky at 8:40: A reads 80 booked', a);
  ok(!(await page.evaluate(() => document.querySelector('#app').classList.contains('sheet-open'))), 'the sheet closes after the placement');
  ok((await consoleText(page)).includes('Pinky and the Brain now airs 8:40–8:50'), 'a dock confirms the placement and offers Undo');
  await page.locator('[data-k="gap-A-50"]').tap(); await page.waitForTimeout(350);
  await page.locator('[data-k="place-gar"]').tap(); await page.waitForTimeout(200);
  let n = await noteText(page);
  ok(/Not placed/i.test(n) && n.includes('overlap Batman: The Animated Series (9:00–9:30) by 20 minutes') && n.includes('Lineup A is unchanged'), 'a rejected placement is explained inside the sheet', n);
  ok(eq(await slots(page, 'A'), [['tf', 0], ['ani', 25], ['pb', 40], ['bat', 60]]), 'the lineup is intact after the rejection');
  await shot(page, 'phone-rejected');
  await page.locator('[data-k="n-fix-0"]').tap(); await page.waitForTimeout(350);
  a = await stats(page, 'A');
  ok(a.booked === 110 && eq(await slots(page, 'A'), [['tf', 0], ['ani', 25], ['pb', 40], ['bat', 60], ['gar', 90]]), 'tapping "Place at 9:30 instead" recovers: A reads 110 booked', a);
  ok(eq(await marks(page), [[0, 50], [90, 30]]), 'the rail between the lanes marks where A and B differ', await marks(page));
  await page.locator('[data-k="hush"]').tap();
  await page.evaluate(() => window.scrollTo(0, 500)); await page.waitForTimeout(200);
  const sticky = await page.evaluate(() => { const t = document.querySelector('[data-k="tag-A"]').getBoundingClientRect(); return t.top >= 0 && t.bottom <= 120; });
  ok(sticky, 'scrolling down the morning keeps the A and B headers, with their minutes, pinned at the top');
  await shot(page, 'phone-compare-scrolled');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(200);
  rows = await diffRows(page);
  ok(rows.length === 2 && rows[1].includes('9:30–10:00') && rows[1].includes('Gargoyles'), 'the list under the lanes spells out each difference', rows);
  await shot(page, 'phone-differences');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('[data-k="tag-B"]').tap();
  ok(await active(page) === 'B', 'tapping the B header switches editing to B');
  await page.locator('[data-k="blk-A-ani"]').tap(); await page.waitForTimeout(200);
  ok(await active(page) === 'A' && (await consoleText(page)).includes('Animaniacs') && await page.locator('#mv-time').count() === 1, 'tapping a show selects it and docks its move and remove controls');
  await page.locator('[data-k="mv-inc"]').tap();
  ok(eq(await slots(page, 'A'), [['tf', 0], ['ani', 25], ['pb', 40], ['bat', 60], ['gar', 90]]) && /Not moved/i.test(await consoleText(page)), 'a nudge into Pinky is refused and explained in the dock');
  await page.locator('[data-k="dismiss"]').tap();
  await page.locator('[data-k="remove"]').tap();
  ok(eq(await slots(page, 'A'), [['tf', 0], ['pb', 40], ['bat', 60], ['gar', 90]]), 'Remove takes Animaniacs out');
  await page.locator('[data-k="flash-undo"]').tap();
  ok(eq(await slots(page, 'A'), [['tf', 0], ['ani', 25], ['pb', 40], ['bat', 60], ['gar', 90]]), 'Undo in the dock puts it back');
  const targets = await page.evaluate(() => { const h = (s) => [...document.querySelectorAll(s)].filter((n) => n.offsetParent).map((n) => Math.round(Math.min(n.getBoundingClientRect().height, 999))); return { blocks: Math.min(...h('.blk-b')), gaps: Math.min(...h('button.gap-b')), tags: Math.min(...h('.tag')), bar: Math.min(...h('.bar .btn')) }; });
  ok(targets.blocks >= 44 && targets.gaps >= 44 && targets.tags >= 44 && targets.bar >= 44, 'shows, open slots, lineup headers and toolbar buttons are at least 44px tall', targets);
  await page.locator('[data-k="gap-A-50"]').tap(); await page.waitForTimeout(350);
  const sheetTargets = await page.evaluate(() => { const h = (s) => [...document.querySelectorAll(s)].map((n) => Math.round(n.getBoundingClientRect().height)); return { place: Math.min(...h('#cards .btn')), step: Math.min(...h('#aim .stepper button')), close: h('#sheet-x')[0], chips: Math.min(...h('#chips .chip')) }; });
  ok(sheetTargets.place >= 42 && sheetTargets.step >= 44 && sheetTargets.close >= 44 && sheetTargets.chips >= 40, 'the sheet controls are touch sized', sheetTargets);
  await page.locator('#sheet-x').tap(); await page.waitForTimeout(350);
  await page.locator('[data-k="fill"]').tap(); await page.waitForTimeout(200);
  ok((await consoleText(page)).includes('Nothing unused fits') || (await consoleText(page)).includes('Fills'), 'Fill open airtime works from the phone toolbar');
  await shot(page, 'phone-fill');
  ok(await overflow(page) <= 0, 'still no sideways scroll after all of that');
  ok(errs.length === 0, 'no script errors on the phone', errs);
  await ctx.close();

  /* ================= layout sanity at other widths, dark theme ================= */
  step('Layout: no sideways scroll at in-between widths, dark theme renders');
  for (const w of [760, 1000, 1280, 1920]) {
    ({ ctx, page, errs } = await open({ w, h: 900 }));
    const o = await overflow(page);
    const sq = await page.evaluate(() => { const n = document.querySelector('[data-k="gap-A-40"]').getBoundingClientRect(); return Math.round(n.width); });
    ok(o <= 0 && errs.length === 0, `${w}px wide: no sideways scroll, no errors (a 20-minute slot is ${sq}px wide)`, { o, errs });
    if (w === 1000) await shot(page, 'tablet-1000', true);
    await ctx.close();
  }
  ({ ctx, page, errs } = await open({ scheme: 'dark' }));
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(dark === 'rgb(18, 12, 36)' && errs.length === 0, 'dark theme swaps the page tokens', dark);
  await click(page, 'fill'); await shot(page, 'desktop-dark-fill');
  await ctx.close();
  ({ ctx, page, errs } = await open({ w: 390, h: 844, touch: true, scheme: 'dark' }));
  await shot(page, 'phone-dark', true);
  await ctx.close();

  /* ================= optional cloud copy, against a mocked claude.use ================= */
  step('Cloud copy (mocked): saves after an edit, restores into an empty browser');
  const mock = (seed) => {
    const store = window.__db = { doc: seed || null, sets: 0 }; let cb = null;
    const snap = () => ({ exists: !!store.doc, data: () => store.doc, metadata: { fromCache: false, hasPendingWrites: false } });
    const ref = { set: async (d) => { store.doc = JSON.parse(JSON.stringify(d)); store.sets++; if (cb) setTimeout(() => cb(snap()), 5); }, onSnapshot: (next) => { cb = next; setTimeout(() => next(snap()), 30); return () => {}; } };
    const db = { collection: (p) => ({ doc: (id) => { window.__dbPath = p + '/' + id; return ref; } }) };
    window.claude = { use: async (n) => (n === 'db' ? db : n === 'user' ? { id: async () => 'u_test' } : null) };
  };
  ({ ctx, page, errs } = await open({ init: mock, initArg: null }));
  await page.waitForTimeout(120);
  ok(await page.evaluate(() => window.__db.sets) === 0, 'an untouched starter is not written to the cloud');
  await click(page, 'place-pb'); await page.waitForTimeout(1100);
  const saved = await page.evaluate(() => ({ sets: window.__db.sets, path: window.__dbPath, body: window.__db.doc && JSON.parse(window.__db.doc.body).lineups.A.slots.map((s) => [s.show, s.at]), note: document.querySelector('#savenote').textContent }));
  ok(saved.sets === 1 && saved.path === 'data/users/u_test/morning' && eq(saved.body, [['tf', 0], ['ani', 25], ['pb', 40], ['bat', 60]]), 'one edit makes one write to the viewer\'s private document', saved);
  ok(saved.note.includes('Claude account'), 'the footer says the lineups are also saved to the account', saved.note);
  const seedDoc = await page.evaluate(() => window.__db.doc);
  await ctx.close();
  ({ ctx, page, errs } = await open({ init: mock, initArg: seedDoc }));
  await page.waitForTimeout(200);
  ok(eq(await slots(page, 'A'), [['tf', 0], ['ani', 25], ['pb', 40], ['bat', 60]]) && (await stats(page, 'A')).booked === 80, 'a browser with nothing stored picks the saved lineups up from the cloud copy', await slots(page, 'A'));
  ok(await page.evaluate(() => window.__db.sets) === 0 && errs.length === 0, 'and does not write them straight back', errs);
  await ctx.close();
  // a stale cloud copy must not overwrite newer local edits
  ({ ctx, page, errs } = await open({ init: mock, initArg: { v: 1, stamp: 5, body: JSON.stringify({ v: 1, stamp: 5, active: 'A', lineups: { A: { slots: [{ show: 'bat', at: 60 }], target: 0, past: [], future: [] }, B: { slots: [{ show: 'bat', at: 60 }], target: 0, past: [], future: [] } } }) } }));
  await page.waitForTimeout(200);
  ok(eq(await slots(page, 'A'), [['bat', 60]]), 'a cloud copy newer than an untouched starter is adopted');
  await click(page, 'place-pb'); await page.waitForTimeout(1100);
  ok(await page.evaluate(() => JSON.parse(window.__db.doc.body).lineups.A.slots.length) === 2 && await page.evaluate(() => window.__db.doc.stamp > 5), 'the next local edit is stamped newer and replaces the cloud copy');
  await ctx.close();
  // storage blocked entirely: the page still works and says so
  ({ ctx, page, errs } = await open({ init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); } }));
  await click(page, 'place-pb');
  ok((await stats(page, 'A')).booked === 80 && errs.length === 0 && (await page.locator('#savenote').textContent()).includes('reset on refresh'), 'with storage blocked the desk still works and says the lineups will not survive a refresh', await page.locator('#savenote').textContent());
  await ctx.close();

  step('Two tabs: an edit in one shows up in the other');
  ({ ctx, page, errs } = await open());
  const tab2 = await ctx.newPage(); await tab2.goto(base); await tab2.waitForSelector('.blk-b');
  await click(page, 'place-pb'); await tab2.waitForTimeout(300);
  ok((await stats(tab2, 'A')).booked === 80 && eq(await slots(tab2, 'A'), [['tf', 0], ['ani', 25], ['pb', 40], ['bat', 60]]), 'the second tab picks up the placement without a refresh', await slots(tab2, 'A'));
  await click(tab2, 'undo'); await page.waitForTimeout(300);
  ok((await stats(page, 'A')).booked === 70 && errs.length === 0, 'and an undo in the second tab reaches the first');
  await ctx.close();

  /* ================= the source file opened straight from disk, no wrapper ================= */
  step('Standalone: index.html opened directly from disk');
  for (const [w, h, touch] of [[1440, 900, false], [390, 844, true]]) {
    const c2 = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    if (!FONTS) await c2.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const p2 = await c2.newPage(); const e2 = []; p2.on('pageerror', (e) => e2.push(e.message));
    await p2.goto('file://' + SRC); await p2.waitForSelector('.blk-b');
    const side = await p2.evaluate(() => { const A = document.querySelector('#track-A').getBoundingClientRect(), B = document.querySelector('#track-B').getBoundingClientRect(); return { stacked: A.bottom <= B.top, beside: A.right <= B.left, ov: document.documentElement.scrollWidth - innerWidth, x: getComputedStyle(document.querySelector('#q-x')).display }; });
    ok((touch ? side.beside : side.stacked) && side.ov <= 0 && side.x === 'none', `${w}px: the ${touch ? 'phone' : 'desktop'} layout renders with no sideways scroll`, side);
    await p2.locator('[data-k="gap-A-40"]').click(); await p2.waitForTimeout(350);
    await p2.locator('[data-k="place-pb"]').click(); await p2.waitForTimeout(350);
    await p2.reload(); await p2.waitForSelector('.blk-b');
    ok((await stats(p2, 'A')).booked === 80 && e2.length === 0, `${w}px: a placement survives a refresh, no script errors`, e2);
    await c2.close();
  }

  await browser.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailed:\n  ' + failures.join('\n  ')); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(2); });
