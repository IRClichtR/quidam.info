import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { loadConfig } from '../../server/config.js';
import { buildAllowlist } from '../../server/static.js';
import { createApp } from '../../server/app.js';

/** @type {http.Server} */
let server;
let base = '';
/** @type {Map<string, {file: string, type: string}>} */
let map;

/** Raw request so the path is sent unnormalised. */
function raw(method, path, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(base);
    const req = http.request({ host: u.hostname, port: u.port, method, path }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

beforeAll(async () => {
  map = await buildAllowlist(new URL('../fixtures/public', import.meta.url).pathname);
  const app = createApp({
    cfg: loadConfig({}),
    staticMap: map,
    whoami: (_req, res) => { res.writeHead(200); res.end('{}'); },
  });
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
  base = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;
});
afterAll(() => new Promise((r) => server.close(() => r(undefined))));

describe('static serving', () => {
  it('maps index files to directory URLs', () => {
    expect([...map.keys()].sort()).toEqual(['/', '/css/a.css', '/en/', '/en/index.html', '/index.html']);
  });

  it('serves allowlisted files with headers and content type', async () => {
    const r = await raw('GET', '/en/');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(r.headers['content-security-policy']).toBeTruthy();
    expect(r.headers['cache-control']).toBe('no-cache');
    expect(r.body).toContain('en');
    expect((await raw('GET', '/css/a.css')).headers['content-type']).toBe('text/css; charset=utf-8');
  });

  it('404s on traversal', async () => {
    for (const p of ['/../package.json', '/%2e%2e/package.json', '/en/..%2f..%2fpackage.json']) {
      const r = await raw('GET', p);
      expect(r.status).toBe(404);
      expect(r.headers['content-security-policy']).toBeTruthy();
    }
  });

  it('405s on other methods', async () => {
    for (const [m, p] of [['POST', '/'], ['DELETE', '/en/']]) {
      const r = await raw(m, p);
      expect(r.status).toBe(405);
      expect(r.headers.allow).toBe('GET, HEAD');
      expect(r.headers['x-content-type-options']).toBe('nosniff');
    }
  });

  it('ignores query strings', async () => {
    expect((await raw('GET', '/en/?x=1')).status).toBe(200);
  });

  it('drops a large body without crashing', async () => {
    const r = await raw('POST', '/', Buffer.alloc(1024 * 1024, 'a'));
    expect(r.status).toBe(405);
    expect((await raw('GET', '/')).status).toBe(200);
  });

  it('HEAD has no body', async () => {
    const r = await raw('HEAD', '/');
    expect(r.status).toBe(200);
    expect(r.body).toBe('');
    expect(r.headers['content-type']).toBe('text/html; charset=utf-8');
  });

  it('routes /api/whoami to the handler', async () => {
    expect((await raw('GET', '/api/whoami?x=1')).body).toBe('{}');
  });
});
