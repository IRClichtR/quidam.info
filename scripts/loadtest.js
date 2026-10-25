// @ts-check
// Load test: simulates many visitors loading the page, then measures throughput and latency.
//   node scripts/loadtest.js <baseUrl> [--seconds 20] [--concurrency 50]
// It first finds every file a visit loads (the page, its stylesheet, fonts and JavaScript
// modules), then each simulated visitor repeats: load all of them, ask /api/origins and
// /api/whoami. Run it against your own server only.
// Note: all requests come from one address, so /api/whoami soon answers 429 (rate limited,
// 30 a minute). That is the limiter working, and is counted apart from errors.
import http from 'node:http';
import https from 'node:https';

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--'));
/** @param {string} name @param {number} fallback */
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
if (!base) {
  console.error('usage: node scripts/loadtest.js <baseUrl> [--seconds 20] [--concurrency 50]');
  process.exit(2);
}
const seconds = opt('seconds', 20);
const concurrency = opt('concurrency', 50);
const origin = new URL(base);
const lib = origin.protocol === 'https:' ? https : http;
const agent = new lib.Agent({ keepAlive: true, maxSockets: concurrency });

/**
 * One GET with raw bytes (no decompression), so byte counts are what crosses the network.
 * @param {string} path @param {Record<string, string>} [headers]
 * @returns {Promise<{status: number, body: Buffer, wire: number, headers: http.IncomingHttpHeaders}>}
 */
function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = lib.get(new URL(path, origin), { agent, headers: { 'accept-encoding': 'br, gzip', ...headers } }, (res) => {
      /** @type {Buffer[]} */
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        // Status line + headers + body, close to the bytes on the wire (before TLS).
        const head = 15 + res.rawHeaders.reduce((n, h) => n + h.length + 2, 0);
        resolve({ status: res.statusCode ?? 0, body, wire: head + body.length, headers: res.headers });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(10_000, () => req.destroy(new Error('timeout')));
  });
}

/** Read a body that may be compressed. @param {{body: Buffer, headers: http.IncomingHttpHeaders}} r */
async function text(r) {
  const zlib = await import('node:zlib');
  const enc = r.headers['content-encoding'];
  return (enc === 'br' ? zlib.brotliDecompressSync(r.body) : enc === 'gzip' ? zlib.gunzipSync(r.body) : r.body).toString();
}

/** Every file a first visit to /en/ loads: page, stylesheet, fonts, JS modules and the English strings. */
async function discover() {
  const found = new Set(['/en/']);
  const page = await text(await get('/en/'));
  for (const m of page.matchAll(/(?:href|src)="(\/[^"]+\.(?:css|js))"/g)) found.add(m[1]);
  /** @type {string[]} */
  const queue = [...found].filter((p) => p.endsWith('.js'));
  for (const p of queue) {
    const src = await text(await get(p));
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+\.js)['"]/g)) {
      const next = new URL(m[1], new URL(p, origin)).pathname;
      if (!found.has(next)) { found.add(next); queue.push(next); }
    }
  }
  found.add('/js/i18n/en.js');
  for (const css of [...found].filter((p) => p.endsWith('.css'))) {
    const src = await text(await get(css));
    for (const m of src.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) found.add(new URL(m[1], new URL(css, origin)).pathname);
  }
  return [...found];
}

const assets = await discover();
const visit = [...assets, '/api/origins', '/api/whoami'];

// One first visit and one repeat visit (the browser sends back the ETags it has).
/** @type {Record<string, string>} */
const etags = {};
let firstBytes = 0;
let firstMissing = 0;
for (const p of assets) {
  const r = await get(p);
  if (r.status !== 200) firstMissing++;
  firstBytes += r.wire;
  if (typeof r.headers.etag === 'string') etags[p] = r.headers.etag;
}
let repeatBytes = 0;
for (const p of assets) repeatBytes += (await get(p, etags[p] ? { 'if-none-match': etags[p] } : {})).wire;

/** @type {number[]} */
const latencies = [];
/** @type {Record<string, number>} */
const statuses = {};
let errors = 0;
let bytes = 0;
const end = Date.now() + seconds * 1000;

async function worker() {
  while (Date.now() < end) {
    for (const p of visit) {
      if (Date.now() >= end) return;
      const t0 = performance.now();
      try {
        const r = await get(p);
        latencies.push(performance.now() - t0);
        statuses[r.status] = (statuses[r.status] ?? 0) + 1;
        bytes += r.wire;
      } catch {
        errors++;
      }
    }
  }
}

const started = performance.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const elapsed = (performance.now() - started) / 1000;
agent.destroy();

latencies.sort((a, b) => a - b);
const pct = (/** @type {number} */ q) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))] : 0);
const kb = (/** @type {number} */ n) => `${(n / 1024).toFixed(1)} KB`;
const total = latencies.length;
const limited = statuses[429] ?? 0;
const bad = Object.entries(statuses).filter(([s]) => !['200', '304', '429'].includes(s)).reduce((n, [, c]) => n + c, 0);

console.log(`target           ${origin.origin}  (${concurrency} simulated visitors, ${seconds} s)`);
console.log(`files per visit  ${assets.length} + /api/origins + /api/whoami${firstMissing ? `  (${firstMissing} not 200!)` : ''}`);
console.log(`first visit      ${kb(firstBytes)} transferred (compressed)`);
console.log(`repeat visit     ${kb(repeatBytes)} transferred (304 Not Modified)`);
console.log(`requests         ${total} in ${elapsed.toFixed(1)} s = ${(total / elapsed).toFixed(0)} req/s (~${(total / elapsed / visit.length).toFixed(0)} full visits/s)`);
console.log(`latency          p50 ${pct(0.5).toFixed(1)} ms · p95 ${pct(0.95).toFixed(1)} ms · p99 ${pct(0.99).toFixed(1)} ms`);
console.log(`throughput       ${kb(bytes / elapsed)}/s`);
console.log(`statuses         ${JSON.stringify(statuses)}`);
console.log(`rate limited     ${limited} whoami answers were 429 (expected: one address, 30 lookups a minute)`);
console.log(`errors           ${errors} network errors, ${bad} unexpected statuses`);
process.exitCode = errors || bad ? 1 : 0;
