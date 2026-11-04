// Browser-side mocks for Interrogation Room: window.claude.use('sample' | 'db' | 'user').
// Injected with page.addInitScript(mockInit, { base, seed }). Config lives in window.__cfg
// (initial values from sessionStorage '__cfg' so a test can set them before a reload).
function mockInit({ base, seed, over }) {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const stored = (() => { try { return JSON.parse(sessionStorage.getItem('__cfg') || '{}'); } catch { return {}; } })();
  const cfg = window.__cfg = Object.assign({
    genDelay: 40, actorDelay: 30, actorFail: null, actorFailOnce: true, refMode: 'ok', refDelta: 3, refParaphrase: false, refDup: false,
    scoreDelay: 80, truthMode: 'ok', truthVariant: null, truthFail: null, caps: { sample: true, db: true, user: true },
  }, over || {}, stored);
  window.__setCfg = (o) => { Object.assign(cfg, o); sessionStorage.setItem('__cfg', JSON.stringify(cfg)); };
  const log = window.__log = [];
  const viol = window.__viol = [];
  const wait = (ms, signal) => new Promise((res, rej) => {
    if (signal?.aborted) { rej({ code: 'cancelled', message: 'aborted' }); return; }
    const t = setTimeout(res, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); rej({ code: 'cancelled', message: 'aborted' }); }, { once: true });
  });
  async function stream(text, opts, n, delay) {
    const size = Math.ceil(text.length / n); let acc = '';
    for (let i = 0; i < n; i++) {
      await wait(delay, opts?.signal);
      const d = text.slice(i * size, (i + 1) * size); if (!d) continue;
      acc += d; opts?.onText?.({ text: acc, delta: d });
    }
    return acc;
  }

  // ---------- case builders honouring the prompt ----------
  const EXTRA = ['Dr Hugh Fennimore', 'Lady Beatrice Orme', 'Mr Cyril Tamworth', 'Nurse Agnes Peel', 'Captain Roland Ashby', 'Miss Dora Quill'];
  const BASE_IDX = { killer: 0, liar: 1, mistaken: 2, honest: 3 };
  const ACC = { name: 'Mrs Edith Lusk', age: 47, role: 'the Major\'s wife, who keeps his accounts', sketch: 'Tall, composed, gloves always on. Watches her husband before she answers.', part: 'accomplice' };
  function buildTruth(prompt) {
    const n = +((/CAST \(exactly (\d+) suspects/.exec(prompt) || [])[1] || 0);
    const parts = ((/Parts, in this order: ([a-z, ]+)\./.exec(prompt) || [])[1] || '').split(/,\s*/).filter(Boolean);
    if (!n || parts.length !== n) viol.push(`truth prompt: N=${n} but parts=${parts.join('|')}`);
    const t = clone(base.truth); const used = new Set(); let e = 0;
    const sus = parts.map((part) => {
      const bi = BASE_IDX[part];
      if (bi != null && !used.has(bi)) { used.add(bi); return { ...t.suspects[bi], part }; }
      if (part === 'accomplice') return { ...ACC };
      return { ...t.suspects[bi ?? 3], name: EXTRA[e++], part };
    });
    for (const s of sus) {
      if (base.truth.suspects.some((b) => b.name === s.name)) continue;
      t.timeline.push({ time: '21:00', place: 'library', present: [s.name], event: `${s.name} writes letters in the library.`, witnesses: [] });
      t.timeline.push({ time: '01:10', place: 'hall', present: [s.name], event: `${s.name} joins the household in the hall.`, witnesses: [] });
    }
    t.suspects = sus;
    t.killer = 'Major Gerald Lusk';
    t.accomplice = parts.includes('accomplice') ? ACC.name : null;
    const v = cfg.truthVariant;
    if (v === 'surname') t.killer = 'Lusk';
    if (v === 'extra') { const k = t.suspects.shift(); t.suspects.push({ ...t.suspects[t.suspects.length - 1], name: 'Mr Spare One', part: 'honest' }, { ...t.suspects[0], name: 'Mr Spare Two', part: 'honest' }, k); }
    if (v === 'accEqKiller') t.accomplice = 'Major Gerald Lusk';
    if (v === 'twoMistaken') { const i = t.suspects.find((s) => s.name === 'Miss Iris Dunmore'); if (i) i.part = 'mistaken'; }
    if (v === 'accWhenNone') { const i = t.suspects.find((s) => s.name === 'Miss Iris Dunmore'); if (i) i.part = 'accomplice'; t.accomplice = 'Miss Iris Dunmore'; }
    if (v === 'noAcc') { t.suspects.forEach((s) => { if (s.part === 'accomplice') s.part = 'honest'; }); t.accomplice = null; }
    return t;
  }
  function breakTruth(t) {
    const b = clone(t); b.forensics.tox = '';
    b.timeline.forEach((x) => { x.present = x.present.filter((p) => p !== 'Miss Iris Dunmore'); });
    return b;
  }
  function buildBriefs(truth) {
    return { briefs: truth.suspects.map((s) => {
      const own = base.briefs.find((b) => b.name === s.name);
      const tmpl = clone(own || base.briefs[BASE_IDX[s.part] ?? 0]);
      tmpl.name = s.name; tmpl.part = s.part;
      if (s.part === 'accomplice') {
        tmpl.lies = [
          { claim: 'Gerald was with me in the morning room from eleven until midnight.', truth: 'She was alone; she did not see him between 23:03 and 23:20.', when: 'asked about her husband', crack: 'the footman saw the morning room dark' },
          { claim: 'I never touched the study door.', truth: 'She bolted the back passage door after him.', when: 'asked about the back passage', crack: 'her glove print on the bolt' },
        ];
        tmpl.secret = 'She covered for her husband after he told her what he had done.';
        tmpl.pressure = { baseline: 18, breakPoint: 60, lawyerPoint: 88, style: 'shutdown' };
        tmpl.opening = 'My husband has told you everything already, Inspector.';
      } else if (s.part === 'liar' && !tmpl.lies.length) {
        tmpl.lies = [{ claim: 'I was asleep by ten.', truth: 'She was awake.', when: 'asked', crack: 'a witness' }];
      } else if (s.part === 'honest' || s.part === 'mistaken') {
        tmpl.lies = [];
      }
      if (!own) tmpl.opening = `${s.name.split(' ').pop()} here, Inspector. Ask away.`;
      return tmpl;
    }) };
  }

  // ---------- sample ----------
  let counter = 0, lastGoodTruth = null;
  async function mockSample(input, opts = {}) {
    if (!Array.isArray(input)) throw { code: 'invalid_request', message: 'actor expects turns' };
    if (input[0]?.role !== 'user' || input[input.length - 1]?.role !== 'user') viol.push('turns must start and end with user');
    input.forEach((t, i) => {
      if (!['user', 'assistant'].includes(t.role)) viol.push('bad role ' + t.role);
      if (typeof t.content !== 'string' || !t.content.trim()) viol.push('empty turn at ' + i);
      if (i > 0 && /Claude is busy|refuses to go on without|wants a lawyer and stops|will not say another word|arrives after|turns up after|comes through from the radio room/.test(t.content)) viol.push('sys message leaked into turn ' + i);
    });
    if (!/You are playing/.test(input[0]?.content || '')) viol.push('actor first turn lacks "You are playing"');
    const m = /You are playing (.+?) in a detective game/.exec(input[0]?.content || '');
    const name = m ? m[1] : '?';
    log.push({ kind: 'actor', name, first: input[0].content, turns: input.map((t) => [t.role, t.content.slice(0, 80)]) });
    if (cfg.actorFail) { const code = cfg.actorFail; if (cfg.actorFailOnce) cfg.actorFail = null; await wait(30, opts.signal); throw { code, message: 'mock failure' }; }
    const text = `${name.split(' ').pop()} reply #${++counter}: I was in the billiard room the whole evening, Inspector, and I heard nothing at all.`;
    const out = await stream(text, opts, 3, cfg.actorDelay);
    return { text: out, truncated: false, modelTierApplied: 'quick' };
  }
  mockSample.json = async (input, opts = {}) => {
    const p = String(input);
    if (p.includes('The TRUTH FILE below has problems')) {
      log.push({ kind: 'repair', prompt: p });
      await stream(JSON.stringify(lastGoodTruth), opts, 3, cfg.genDelay);
      return clone(lastGoodTruth);
    }
    if (p.includes('Design the sealed TRUTH FILE')) {
      log.push({ kind: 'truth', prompt: p });
      if (cfg.truthFail) { const code = cfg.truthFail; cfg.truthFail = null; await wait(30, opts.signal); throw { code, message: 'mock failure' }; }
      const t = buildTruth(p); lastGoodTruth = t;
      const out = cfg.truthMode === 'bad' ? breakTruth(t) : t;
      await stream(JSON.stringify(out), opts, 4, cfg.genDelay);
      return clone(out);
    }
    if (p.includes('Write a PRIVATE BRIEF')) {
      log.push({ kind: 'briefs', prompt: p });
      const tf = JSON.parse(p.split('TRUTH FILE:\n')[1].split('\n\nReply with ONLY')[0]);
      const b = buildBriefs(tf);
      await stream(JSON.stringify(b), opts, 4, cfg.genDelay);
      return b;
    }
    if (p.includes('You are the REFEREE')) {
      const ans = (p.split('PROPOSED ANSWER: ')[1] || '').split('\n\nCHECKS:')[0];
      const who = (/SUSPECT (.+?), part:/.exec(p) || [])[1] || '';
      log.push({ kind: 'referee', who, mode: cfg.refMode, prompt: p });
      await wait(20, opts.signal);
      if (cfg.refMode === 'reject') { if (cfg.refOnce) cfg.refMode = 'ok'; throw { code: 'invalid_json', message: 'mock', text: '{oops' }; }
      const corrected = cfg.refMode === 'correct';
      if (corrected && cfg.refOnce) cfg.refMode = 'ok';
      const answer = corrected ? 'CORRECTED: I was in the billiard room, Inspector. That is all I will say.' : ans;
      const label = who === 'Albert Pruett' ? 'mistaken' : 'lie';
      const first = answer.split(' ').slice(0, 12).join(' ');
      const claims = [{ text: first, label, truth: 'He was not where he says.' }, { text: 'Dinner was at eight', label: 'true', truth: '' }];
      if (cfg.refParaphrase) claims.push({ text: 'Claims he stayed put all night', label: 'lie', truth: 'He went to the study at 23:03.' });
      if (cfg.refDup) claims.push({ text: first, label, truth: 'He was not where he says.' });
      return { ok: !corrected, problems: corrected ? ['leak'] : [], answer, claims, pressureDelta: cfg.refDelta, cracked: [], hit: true };
    }
    if (p.includes('reviewing a detective\'s accusation')) {
      log.push({ kind: 'score', prompt: p });
      await wait(cfg.scoreDelay, opts.signal);
      return { motive: 14, method: 12, evidence: 16, verdict: 'Adequate work, Inspector, though you took your time about it.', missed: ['The footman at the billiard room door'], caught: ['Lusk and the billiard table'] };
    }
    log.push({ kind: 'unrouted', prompt: p.slice(0, 200) });
    throw { code: 'invalid_request', message: 'unrouted json call' };
  };

  // ---------- db (in-memory, persisted to localStorage so reloads keep it) ----------
  if (seed && !localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(seed));
  const dbLog = window.__dbLog = [];
  const inflight = {}; window.__dbMax = { any: 0, perDoc: 0 }; let inflightAny = 0;
  const load = () => { try { return JSON.parse(localStorage.getItem('__fakedb') || '{}'); } catch { return {}; } };
  const persist = (m) => localStorage.setItem('__fakedb', JSON.stringify(m));
  const SEG = /^[A-Za-z0-9_\-.~:@+]+$/;
  const check = (p, even) => { const s = String(p).split('/'); if (s.some((x) => !SEG.test(x) || x === '.' || x === '..')) throw new TypeError('bad segment in ' + p); if ((s.length % 2 === 0) !== even) throw new TypeError(`${even ? 'document' : 'collection'} path needs ${even ? 'an even' : 'an odd'} segment count: ${p}`); };
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const snap = (path, body) => ({ id: path.split('/').pop(), exists: !!body, data: () => (body ? clone(body) : undefined), metadata: { fromCache: false, hasPendingWrites: false } });
  async function write(kind, path, fn) {
    inflight[path] = (inflight[path] || 0) + 1; inflightAny++;
    window.__dbMax.perDoc = Math.max(window.__dbMax.perDoc, inflight[path]); window.__dbMax.any = Math.max(window.__dbMax.any, inflightAny);
    try { await tick(); await tick(); const m = load(); fn(m); persist(m); dbLog.push({ kind, path }); }
    finally { inflight[path]--; inflightAny--; }
  }
  function docRef(path) {
    check(path, true);
    return {
      id: path.split('/').pop(), path,
      async get() { await tick(); return snap(path, load()[path]); },
      async set(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw { code: 'invalid_argument', message: 'body must be an object' };
        const txt = JSON.stringify(data); if (new TextEncoder().encode(txt).length > 256 * 1024) throw { code: 'invalid_argument', message: 'document over 256 KiB' };
        return write('set', path, (m) => { m[path] = JSON.parse(txt); });
      },
      async update(data) { return write('update', path, (m) => { if (!m[path]) throw { code: 'invalid_argument', message: 'missing' }; Object.assign(m[path], clone(data)); }); },
      async delete() { return write('delete', path, (m) => { delete m[path]; }); },
      collection(sub) { return colRef(path + '/' + sub); },
      onSnapshot() { viol.push('unexpected onSnapshot'); return () => {}; },
    };
  }
  function query(col, filters, order, lim) {
    return {
      where(f, op, v) { if (op !== '==') throw new TypeError('mock supports == only'); return query(col, [...filters, [f, v]], order, lim); },
      orderBy(f, dir = 'asc') { if (order) throw { code: 'invalid_argument', message: 'one orderBy' }; return query(col, filters, [f, dir], lim); },
      limit(n) { if (!(n >= 1 && n <= 1000)) throw { code: 'invalid_argument', message: 'limit range' }; return query(col, filters, order, n); },
      async get() {
        await tick();
        const m = load();
        let docs = Object.keys(m).filter((p) => p.slice(0, p.lastIndexOf('/')) === col).map((p) => ({ p, b: m[p] }));
        docs = docs.filter(({ b }) => filters.every(([f, v]) => b[f] === v));
        if (order) { const [f, dir] = order; docs.sort((a, b) => { const x = a.b[f], y = b.b[f]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1); }); }
        else docs.sort((a, b) => (a.p < b.p ? -1 : 1));
        if (lim) docs = docs.slice(0, lim);
        dbLog.push({ kind: 'query', path: col, filters, order, lim });
        const out = docs.map(({ p, b }) => snap(p, b));
        return { docs: out, size: out.length, empty: !out.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
      },
      onSnapshot() { viol.push('unexpected onSnapshot'); return () => {}; },
    };
  }
  function colRef(path) { check(path, false); return Object.assign(query(path, [], null, null), { path, doc: (id) => docRef(path + '/' + (id || Math.random().toString(36).slice(2))), add: async (d) => { const r = docRef(path + '/' + Math.random().toString(36).slice(2)); await r.set(d); return r; } }); }
  const db = { doc: docRef, collection: colRef };

  // ---------- user ----------
  const user = {
    id: async () => 'user_test', can: async () => true, isOwner: async () => true, canEdit: async () => true,
    profiles: async (ids) => Object.fromEntries([].concat(ids).map((i) => [i, { id: i, name: i === 'user_test' ? 'Test Detective' : 'Other Player' }])),
  };

  window.claude = { use: async (name) => {
    await new Promise((r) => setTimeout(r, 10));
    if (!cfg.caps[name]) return null;
    return name === 'sample' ? mockSample : name === 'db' ? db : name === 'user' ? user : null;
  } };
}
function hotInit(snapData) {
  window.__snapFn = null;
  window.claude.hot = {
    snapshot(fn) { window.__snapFn = fn; },
    ready(cb) { window.__readyCalled = true; cb(snapData || null); },
  };
}
module.exports = { mockInit, hotInit };
