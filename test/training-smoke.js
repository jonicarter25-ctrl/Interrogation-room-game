// Opens the real page (with its embedded training data) under the harness mocks and plays the start of each training case.
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');
const E2E = __dirname;
const { mockInit } = require(path.join(E2E, 'mock.js'));
const canned = require(path.join(E2E, 'canned.js'));
const truthU = JSON.parse(JSON.stringify(canned.truth));
truthU.forensics = { tod: canned.truth.forensics.tod, prints: canned.truth.forensics.prints, comms: canned.truth.forensics.exchange, tox: canned.truth.forensics.tox, logs: canned.truth.forensics.staff };
const BASE = { truth: truthU, briefs: canned.briefs.briefs };
const SRC = path.join(__dirname, '..', 'index.html');
const wrap = (body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}</style></head><body>${body}</body></html>`;
(async () => {
  const srv = http.createServer((req, rsp) => { rsp.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); rsp.end(wrap(fs.readFileSync(SRC, 'utf8'))); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  let bad = 0;
  for (const setting of ['country_house', 'noir_docks', 'antarctic']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.addInitScript(mockInit, { base: BASE, seed: null, over: {} });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text()); });
    await page.goto(url);
    await page.waitForSelector('[data-act=new]');
    await page.click(`[data-act=setting][data-id=${setting}]`);
    await page.waitForSelector('[data-act=training]');
    await page.click('[data-act=training]');
    await page.waitForSelector('.file h2');
    const title = await page.$eval('.file h2', (e) => e.textContent.trim());
    const stamp = await page.$eval('.stamp.tr', (e) => e.textContent.trim()).catch(() => '');
    const bios = await page.$$eval('.bio', (els) => els.map((e) => e.querySelector('b').textContent.trim()));
    const foren = await page.$$eval('.fo .hd b', (els) => els.map((e) => e.textContent.trim()));
    // request a report, pin it, open interrogate, ask one question, see a reply land, reach the reveal via accusation
    await page.click('[data-act=forensic][data-id=tod]');
    await page.waitForSelector('[data-act=pin-forensic][data-id=tod]');
    await page.click('[data-act=pin-forensic][data-id=tod]');
    await page.click('.tabs [data-act=tab][data-tab=interrogate]');
    await page.waitForSelector('#q');
    await page.fill('#q', 'Where were you when the body was found?');
    await page.click('[data-act=ask]');
    await page.waitForFunction(() => !document.querySelector('.msg.sus .b.thinking') && document.querySelectorAll('.msg.sus').length >= 2, null, { timeout: 20000 });
    const replies = await page.$$eval('.msg.sus .b', (els) => els.map((e) => e.textContent.trim()));
    const sw = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await page.screenshot({ path: path.join(E2E, 'shots', `training-${setting}.png`), fullPage: false });
    const okTitle = title.length > 3, okStamp = /training/i.test(stamp), okBios = bios.length === 4, okForen = foren.length === 5, okReply = replies.length >= 2;
    const pass = okTitle && okStamp && okBios && okForen && okReply && sw && !errs.length;
    if (!pass) bad++;
    console.log(pass ? 'PASS' : 'FAIL', setting, '|', title, '|', bios.join(', '), '|', foren[0], '|', replies[1]?.slice(0, 50), '| overflow ok:', sw, '| errors:', errs);
    await ctx.close();
  }
  await browser.close(); srv.close();
  process.exit(bad ? 1 : 0);
})();
