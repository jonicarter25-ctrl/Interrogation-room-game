// Injected into the page before its scripts run: a `window.claude.use('sample')` that forwards to the bridge server.
function liveInit({ port }) {
  const parseLoose = (text) => {
    const tryParse = (s) => { try { return { ok: true, v: JSON.parse(s) }; } catch { return { ok: false }; } };
    let r = tryParse(text.trim()); if (r.ok) return r;
    const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text); if (fence) { r = tryParse(fence[1].trim()); if (r.ok) return r; }
    const a = Math.min(...['{', '['].map((c) => { const i = text.indexOf(c); return i < 0 ? Infinity : i; }));
    const b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    if (a !== Infinity && b > a) { r = tryParse(text.slice(a, b + 1)); if (r.ok) return r; }
    return { ok: false };
  };
  const call = async (input, opts, wantJson) => {
    opts = opts || {};
    if (opts.signal?.aborted) throw { code: 'cancelled', message: 'aborted' };
    const body = JSON.stringify({ input, modelTier: opts.modelTier || 'default', model: opts.model || null, effort: opts.effort || null, json: !!wantJson });
    let r;
    try {
      const rsp = await fetch(`http://127.0.0.1:${port}/sample`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: opts.signal });
      r = await rsp.json();
    } catch (e) { if (opts.signal?.aborted) throw { code: 'cancelled', message: 'aborted' }; throw { code: 'upstream_error', message: String(e) }; }
    if (r.error) throw { code: 'upstream_error', message: r.error };
    const text = String(r.text || '');
    if (!text.trim()) throw { code: 'empty_completion', message: 'empty' };
    if (opts.onText) { try { opts.onText({ text, delta: text }); } catch {} }
    if (wantJson) { const p = parseLoose(text); if (!p.ok) throw { code: 'invalid_json', message: 'no json', text }; return p.v; }
    return { text, truncated: false, modelTierApplied: opts.modelTier || 'default' };
  };
  const sample = (input, opts) => call(input, opts, false);
  sample.json = (input, opts) => call(input, opts, true);
  sample.limits = async () => ({ maxPromptBytes: 262144 });
  window.claude = { use: async (name) => (name === 'sample' ? sample : null) };
  window.__live = true;
}
module.exports = { liveInit };
