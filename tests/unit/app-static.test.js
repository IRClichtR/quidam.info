// @ts-check
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../server/config.js';
import { buildAllowlist } from '../../server/static.js';
import { createApp } from '../../server/app.js';

/** @type {http.Server} */
let server;
let base = '';
/** @type {Map<string, {file: string, type: string}>} */
let map;

/** Raw request so the path is sent unnormalised. */
function raw(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(base);
    const req = http.request({ host: u.hostname, port: u.port, method, path, headers }, (res) => {
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
    hasData: () => false,
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

  it('301s a language path without its trailing slash, with the security headers', async () => {
    for (const lang of ['en', 'fr', 'es']) {
      const r = await raw('GET', `/${lang}`);
      expect(r.status).toBe(301);
      expect(r.headers.location).toBe(`/${lang}/`);
      expect(r.headers['content-security-policy']).toBeTruthy();
    }
    expect((await raw('GET', '/fr?x=1')).headers.location).toBe('/fr/?x=1');
    expect((await raw('HEAD', '/es')).status).toBe(301);
    expect((await raw('GET', '/de')).status).toBe(404);
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

  it('serves /api/origins from the config, uncached, GET only', async () => {
    const r = await raw('GET', '/api/origins?x=1');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['content-security-policy']).toBeTruthy();
    expect(JSON.parse(r.body)).toEqual({ v4: 'http://127.0.0.1:8080', v6: 'http://ip6-localhost:8080', stunPort: 3478 });
    const head = await raw('HEAD', '/api/origins');
    expect(head.status).toBe(405);
    expect(head.headers.allow).toBe('GET');
  });

  it('survives a client disconnecting mid-download', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-'));
    fs.writeFileSync(path.join(dir, 'big.txt'), Buffer.alloc(8 * 1024 * 1024, 'a'));
    const m = await buildAllowlist(dir);
    const s = http.createServer(createApp({ cfg: loadConfig({}), staticMap: m, whoami: () => {} }));
    await new Promise((r) => s.listen(0, '127.0.0.1', () => r(undefined)));
    const port = /** @type {any} */ (s.address()).port;
    await new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/big.txt' }, (res) => {
        res.once('data', () => { req.destroy(); res.destroy(); resolve(undefined); });
      });
      req.on('error', () => {});
    });
    await new Promise((r) => setTimeout(r, 100));
    const r = await new Promise((resolve) => http.get({ host: '127.0.0.1', port, path: '/big.txt' }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }));
    expect(r).toBe(200);
    await new Promise((r2) => s.close(() => r2(undefined)));
    fs.rmSync(dir, { recursive: true });
  });
  it('sends compressed copies with their own ETag, and 304 when the copy is current', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-'));
    fs.writeFileSync(path.join(dir, 'app.js'), 'console.log("ombre");\n'.repeat(200));
    fs.writeFileSync(path.join(dir, 'f.woff2'), Buffer.alloc(2000, 1));
    const m = await buildAllowlist(dir);
    const s = http.createServer(createApp({ cfg: loadConfig({}), staticMap: m, whoami: () => {} }));
    await new Promise((r) => s.listen(0, '127.0.0.1', () => r(undefined)));
    const get = (/** @type {string} */ p, /** @type {Record<string,string>} */ h = {}) => new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port: /** @type {any} */ (s.address()).port, path: p, headers: h }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      });
    });
    /** @type {any} */
    const plain = await get('/app.js');
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.headers.vary).toBe('accept-encoding');
    expect(plain.headers['content-length']).toBe(String(plain.body.length));
    /** @type {any} */
    const br = await get('/app.js', { 'accept-encoding': 'gzip, deflate, br' });
    expect(br.headers['content-encoding']).toBe('br');
    expect(br.body.length).toBeLessThan(plain.body.length);
    expect(br.headers.etag).not.toBe(plain.headers.etag);
    /** @type {any} */
    const gz = await get('/app.js', { 'accept-encoding': 'gzip, br;q=0' });
    expect(gz.headers['content-encoding']).toBe('gzip');
    /** @type {any} */
    const again = await get('/app.js', { 'accept-encoding': 'br', 'if-none-match': br.headers.etag });
    expect(again.status).toBe(304);
    expect(again.body.length).toBe(0);
    /** @type {any} */
    const font = await get('/f.woff2', { 'accept-encoding': 'br' });
    expect(font.headers['content-encoding']).toBeUndefined();
    expect(font.headers['cache-control']).toBe('public, max-age=2592000');
    expect(plain.headers['cache-control']).toBe('no-cache');
    await new Promise((r) => s.close(() => r(undefined)));
    fs.rmSync(dir, { recursive: true });
  });

  it('redirects any folder without its trailing slash, nested ones too', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-'));
    fs.mkdirSync(path.join(dir, 'en', 'legal'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'en', 'legal', 'index.html'), '<p>legal</p>');
    const m = await buildAllowlist(dir);
    const s = http.createServer(createApp({ cfg: loadConfig({}), staticMap: m, whoami: () => {} }));
    await new Promise((r) => s.listen(0, '127.0.0.1', () => r(undefined)));
    const port = /** @type {any} */ (s.address()).port;
    const res = await new Promise((resolve) => http.get({ host: '127.0.0.1', port, path: '/en/legal?x=1' }, (r) => { r.resume(); resolve(r); }));
    expect(/** @type {any} */ (res).statusCode).toBe(301);
    expect(/** @type {any} */ (res).headers.location).toBe('/en/legal/?x=1');
    await new Promise((r) => s.close(() => r(undefined)));
    fs.rmSync(dir, { recursive: true });
  });

  it('answers /healthz, uncached, with whether the IP data is loaded', async () => {
    const r = await raw('GET', '/healthz');
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(r.body)).toEqual({ ok: true, data: false });
    expect((await raw('HEAD', '/healthz')).body).toBe('');
  });
});
