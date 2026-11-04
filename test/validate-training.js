// Runs the page's own normalizeTruth / normalizeBriefs / auditTruth over the training JSON files.
// Usage: node validate-training.js <dir-with-json-files>
const fs = require('fs');
const path = require('path');
const page = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const script = page.slice(page.indexOf('<script>') + 8, page.lastIndexOf('</script>'));
const lines = script.split('\n');
const find = (prefix, from = 0) => { for (let i = from; i < lines.length; i++) if (lines[i].startsWith(prefix)) return i; throw new Error('marker missing: ' + prefix); };
const block = (startPrefix, endPrefix) => { const a = find(startPrefix); const b = find(endPrefix, a + 1); return lines.slice(a, b).join('\n'); };
// Pull the pieces we need out of the IIFE, in dependency order.
const pieces = [
  block('const FORENSIC_IDS', 'const TONES'),
  block('const $ = ', '/* ───────────────────────── prompts'),
  block('const PARTS = ', 'function repairPrompt('),
  block('function normalizeBriefs(', '/* ───────────────────────── state'),
];
const src = pieces.join('\n') + '\nmodule.exports = { SETTINGS, castPlan, normDials, normalizeTruth, normalizeBriefs, auditTruth, nightOffset, toMin };';
const m = { exports: {} };
new Function('module', 'exports', 'window', 'document', 'localStorage', src)(m, m.exports, {}, { querySelector: () => null, querySelectorAll: () => [] }, {});
const E = m.exports;

const dir = process.argv[2];
let bad = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const st = E.SETTINGS[raw.settingId];
  const out = { file: f, settingId: raw.settingId, size: fs.statSync(path.join(dir, f)).size };
  try {
    if (!st) throw new Error('unknown settingId ' + raw.settingId);
    const dials = E.normDials(raw.dials || { suspects: 4, liars: 1, mistaken: true, accomplice: false, hours: 6 });
    const truth = E.normalizeTruth(JSON.parse(JSON.stringify(raw.truth)), st, dials);
    const briefs = E.normalizeBriefs({ briefs: JSON.parse(JSON.stringify(raw.briefs)) }, truth);
    const probs = E.auditTruth(truth, dials);
    out.title = truth.title; out.suspects = truth.suspects.map((s) => `${s.name} (${s.part})`); out.killer = truth.killer; out.timeline = truth.timeline.length; out.evidence = truth.evidence.length;
    out.lies = briefs.map((b) => `${b.name.split(' ').pop()}:${b.lies.length}${b.honestMistake ? '+m' : ''}`);
    out.audit = probs;
    // extra checks: lie crack conditions and knows are non-empty; movements times parse; pressure sane
    for (const b of briefs) {
      if (b.knows.length < 4) probs.push(`${b.name}: only ${b.knows.length} knows`);
      if (b.doesNotKnow.length < 2 && b.part !== 'killer') probs.push(`${b.name}: doesNotKnow too short`);
      for (const l of b.lies) if (!l.crack) probs.push(`${b.name}: lie without crack`);
      for (const mv of b.movements) if (E.toMin(mv.from) == null || E.toMin(mv.to) == null) probs.push(`${b.name}: bad movement time ${mv.from}-${mv.to}`);
    }
    // timeline must be in order through midnight
    const offs = truth.timeline.map((e) => E.nightOffset(e.time, truth.night.start));
    for (let i = 1; i < offs.length; i++) if (offs[i] < offs[i - 1]) probs.push(`timeline out of order at ${truth.timeline[i].time}`);
    if (probs.length) bad++;
  } catch (e) { out.error = String(e && e.message || e); bad++; }
  console.log(JSON.stringify(out, null, 1));
}
process.exit(bad ? 1 : 0);
