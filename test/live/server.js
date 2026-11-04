// Bridge: turns the page's `sample` calls into Claude CLI runs so the real game can be played with a live model.
// Usage: node test/live/server.js [port]   (the driver in play.js starts it for you)
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const MODELS = { quick: 'claude-haiku-5-5', default: 'claude-sonnet-5-5', complex: 'claude-opus-5-5' };
const SYSTEM = 'You are the language model behind a browser game. Follow the formatting instructions in the message exactly. When asked for JSON, reply with only the JSON value and no commentary or code fences.';

function flatten(input) {
  if (typeof input === 'string') return input;
  // turns array: standing instructions first, then the conversation so far, ending on the detective
  const [first, ...rest] = input;
  const lines = rest.map((t) => (t.role === 'assistant' ? `Suspect: ${t.content}` : t.content));
  return `${first.content}\n\n=== CONVERSATION SO FAR (oldest first; lines beginning "Detective" are the detective, "Suspect:" are your own earlier replies) ===\n${lines.join('\n\n')}\n\n=== Reply now, in character, to the detective's last line. Output only the suspect's words. ===`;
}

function runClaude(prompt, { model, effort }) {
  return new Promise((resolve) => {
    const args = ['-p', '--output-format', 'json', '--model', model, '--max-turns', '1', '--no-session-persistence', '--strict-mcp-config', '--system-prompt', SYSTEM];
    if (effort) args.push('--effort', effort);
    const t0 = Date.now();
    const child = spawn('claude', args, { cwd: path.join(__dirname, 'out'), env: process.env });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      const ms = Date.now() - t0;
      try {
        const j = JSON.parse(out);
        if (j.is_error) { resolve({ error: String(j.result || 'cli error').slice(0, 400), ms, code }); return; }
        resolve({ text: String(j.result ?? ''), ms, cost: j.total_cost_usd, model: Object.keys(j.modelUsage || {})[0] || model, code });
      } catch (e) {
        resolve({ error: `cli exit ${code}: ${(err || out).slice(0, 400)}`, ms, code });
      }
    });
    child.stdin.end(prompt);
  });
}

let queue = Promise.resolve();
function start(port = 0) {
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  const log = fs.createWriteStream(path.join(__dirname, 'out', 'calls.jsonl'), { flags: 'a' });
  const srv = http.createServer((req, rsp) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (req.method === 'OPTIONS') { rsp.writeHead(204, cors); rsp.end(); return; }
    if (req.method !== 'POST' || req.url !== '/sample') { rsp.writeHead(404, cors); rsp.end('no'); return; }
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      let p; try { p = JSON.parse(body); } catch { rsp.writeHead(400, cors); rsp.end('bad json'); return; }
      const prompt = flatten(p.input);
      const model = p.model || MODELS[p.modelTier] || MODELS.default;
      const effort = p.effort || null;
      const kind = /Design the sealed TRUTH FILE/.test(prompt) ? 'truth' : /TRUTH FILE below has problems/.test(prompt) ? 'repair' : /Write a PRIVATE BRIEF/.test(prompt) ? 'briefs' : /You are the REFEREE/.test(prompt) ? 'referee' : /reviewing a detective's accusation/.test(prompt) ? 'score' : 'actor';
      queue = queue.then(async () => {
        process.stdout.write(`  [${kind}] ${model}${effort ? '/' + effort : ''} ${(prompt.length / 1024).toFixed(1)}KB … `);
        const r = await runClaude(prompt, { model, effort });
        process.stdout.write(r.error ? `ERROR ${r.error.slice(0, 80)}\n` : `${(r.ms / 1000).toFixed(1)}s, ${(r.text.length / 1024).toFixed(1)}KB, $${(r.cost || 0).toFixed(3)}\n`);
        log.write(JSON.stringify({ at: Date.now(), kind, model, effort, promptChars: prompt.length, ...r, prompt: prompt.slice(0, 20000) }) + '\n');
        rsp.writeHead(200, { ...cors, 'content-type': 'application/json' });
        rsp.end(JSON.stringify(r));
      }).catch((e) => { rsp.writeHead(500, cors); rsp.end(JSON.stringify({ error: String(e) })); });
    });
  });
  return new Promise((res) => srv.listen(port, '127.0.0.1', () => res({ srv, port: srv.address().port })));
}

module.exports = { start, MODELS };
if (require.main === module) start(+process.argv[2] || 8765).then(({ port }) => console.log('bridge on', port));
