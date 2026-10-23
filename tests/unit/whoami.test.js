// @ts-check
import fs from 'node:fs';
import { it, expect } from 'vitest';
import { Reader } from 'mmdb-lib';
import { loadConfig } from '../../server/config.js';
import { createIpLists } from '../../server/lists.js';
import { createRateLimiter } from '../../server/ratelimit.js';
import { lookup, clientIp, createWhoamiHandler } from '../../server/whoami.js';

const dir = new URL('../fixtures/data/', import.meta.url);
const read = (/** @type {string} */ f) => fs.readFileSync(new URL(f, dir));
const lists = createIpLists({
  torText: read('tor-exits.txt').toString(),
  relayCsv: read('relay-ranges.csv').toString(),
});
const data = { city: new Reader(read('dbip-city-lite.mmdb')), asn: new Reader(read('dbip-asn-lite.mmdb')), lists };
const cfg = loadConfig({ NODE_ENV: 'production', SITE_ORIGIN: 'https://leak.example' });
const devCfg = loadConfig({
  NODE_ENV: 'development',
  LEAKCHECK_DEV_CLIENT_IP4: '81.2.69.142',
  LEAKCHECK_DEV_CLIENT_IP6: '2001:480:10::1',
});

/** @param {string} addr @param {Record<string,string>} [headers] @param {string} [method] */
const fakeReq = (addr, headers = {}, method = 'GET') =>
  /** @type {any} */ ({ method, headers, socket: { remoteAddress: addr } });

/** @returns {any} */
function fakeRes() {
  const r = {
    status: 0, headers: /** @type {Record<string,string>} */ ({}), body: '',
    writeHead(/** @type {number} */ s, /** @type {Record<string,string>} */ h = {}) {
      r.status = s;
      for (const [k, v] of Object.entries(h)) r.headers[k.toLowerCase()] = String(v);
      return r;
    },
    setHeader(/** @type {string} */ k, /** @type {string} */ v) { r.headers[k.toLowerCase()] = String(v); },
    end(/** @type {string} */ b) { r.body = b ?? ''; },
  };
  return r;
}

/** @param {any} [over] */
const handler = (over = {}) =>
  createWhoamiHandler({ cfg, getData: () => data, limiter: createRateLimiter({ limit: 30, windowMs: 60_000 }), ...over });

it('looks up city, country and AS', () => {
  expect(lookup('81.2.69.142', data)).toMatchObject({ country: 'GB', city: 'London', family: 4 });
  expect(lookup('1.128.0.0', data).asn).toBe(1221);
  expect(lookup('2001:480:10::1', data)).toMatchObject({ country: 'US', city: 'San Diego', family: 6 });
});
it('returns nulls for unknown IPs', () => {
  expect(lookup('127.0.0.1', data)).toMatchObject({
    country: null, city: null, asn: null, asOrg: null, tor: false, privateRelay: false });
});
it('sets tor and privateRelay from the lists', () => {
  expect(lookup('203.0.113.7', data)).toMatchObject({ tor: true, privateRelay: false });
  expect(lookup('198.51.100.9', data)).toMatchObject({ tor: false, privateRelay: true });
});
it('uses the socket IP outside development', () => {
  const noDev = { ...cfg, devClientIp4: '9.9.9.9' };
  expect(clientIp(fakeReq('::ffff:5.6.7.8'), noDev)).toBe('5.6.7.8');
  expect(clientIp(fakeReq('2001:db8::1'), noDev)).toBe('2001:db8::1');
});
it('applies the dev override per family', () => {
  expect(clientIp(fakeReq('127.0.0.1'), devCfg)).toBe('81.2.69.142');
  expect(clientIp(fakeReq('::ffff:127.0.0.1'), devCfg)).toBe('81.2.69.142');
  expect(clientIp(fakeReq('::1'), devCfg)).toBe('2001:480:10::1');
});
it('never reads X-Forwarded-For', () => {
  expect(clientIp(fakeReq('5.6.7.8', { 'x-forwarded-for': '1.2.3.4' }), cfg)).toBe('5.6.7.8');
});
it('200 with JSON, no-store and CORS for the site origin only', () => {
  const res = fakeRes();
  handler()(fakeReq('81.2.69.142', { origin: 'https://evil.example' }), res);
  expect(res.status).toBe(200);
  expect(JSON.parse(res.body)).toMatchObject({ ip: '81.2.69.142', country: 'GB' });
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.headers['access-control-allow-origin']).toBe('https://leak.example');
  expect(res.headers['vary']).toBe('Origin');
});
it('405 for non-GET, including HEAD', () => {
  for (const m of ['HEAD', 'POST']) {
    const res = fakeRes();
    handler()(fakeReq('81.2.69.142', {}, m), res);
    expect(res.status).toBe(405);
    expect(res.headers['cache-control']).toBe('no-store');
  }
});
it('503 when data is missing', () => {
  const res = fakeRes();
  handler({ getData: () => null })(fakeReq('81.2.69.142'), res);
  expect(res.status).toBe(503);
  expect(JSON.parse(res.body)).toEqual({ error: 'data-unavailable' });
  expect(res.headers['cache-control']).toBe('no-store');
});
it('429 after 30 requests', () => {
  const h = handler();
  for (let i = 0; i < 30; i++) {
    const res = fakeRes();
    h(fakeReq('81.2.69.142'), res);
    expect(res.status).toBe(200);
  }
  const res = fakeRes();
  h(fakeReq('81.2.69.142'), res);
  expect(res.status).toBe(429);
  expect(res.headers['cache-control']).toBe('no-store');
  const other = fakeRes();
  h(fakeReq('1.128.0.0'), other);
  expect(other.status).toBe(200);
});
it('500 internal on a failing database', () => {
  const res = fakeRes();
  handler({ getData: () => ({ ...data, city: { get() { throw new Error('corrupt'); } } }) })(fakeReq('81.2.69.142'), res);
  expect(res.status).toBe(500);
  expect(JSON.parse(res.body)).toEqual({ error: 'internal' });
  expect(res.headers['cache-control']).toBe('no-store');
});
