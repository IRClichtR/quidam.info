// @ts-check
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { it, expect, vi, afterEach } from 'vitest';
import { createDataStore } from '../../server/refresh.js';

const fixtures = new URL('../fixtures/data/', import.meta.url);
const bytes = (/** @type {string} */ f) => fs.readFileSync(new URL(f, fixtures));
const FILES = ['dbip-city-lite.mmdb', 'dbip-asn-lite.mmdb', 'tor-exits.txt', 'relay-ranges.csv'];
const ALLOWED = [
  /^https:\/\/download\.db-ip\.com\/free\/dbip-city-lite-\d{4}-\d{2}\.mmdb\.gz$/,
  /^https:\/\/download\.db-ip\.com\/free\/dbip-asn-lite-\d{4}-\d{2}\.mmdb\.gz$/,
  /^https:\/\/check\.torproject\.org\/torbulkexitlist$/,
  /^https:\/\/mask-api\.icloud\.com\/egress-ip-ranges\.csv$/,
];

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lc-refresh-'));
const copyAll = (/** @type {string} */ dir) => {
  for (const f of FILES) fs.copyFileSync(new URL(f, fixtures), path.join(dir, f));
};
const res = (/** @type {number} */ status, /** @type {Uint8Array|string} */ body) =>
  new Response(body, { status });

/** @param {string[]} seen @param {(url: string) => Response} [override] */
const fakeFetch = (seen, override) =>
  /** @type {typeof fetch} */ (
    async (input, init) => {
      const url = String(input);
      seen.push(url);
      expect(init?.signal).toBeDefined();
      expect(init?.headers).toBeUndefined();
      if (override) return override(url);
      if (url.includes('city-lite')) return res(200, zlib.gzipSync(bytes('dbip-city-lite.mmdb')));
      if (url.includes('asn-lite')) return res(200, zlib.gzipSync(bytes('dbip-asn-lite.mmdb')));
      if (url.includes('torbulkexitlist')) return res(200, '203.0.113.99\n');
      return res(200, bytes('relay-ranges.csv'));
    }
  );

const now = () => new Date('2026-10-05T12:00:00Z');

afterEach(() => vi.useRealTimers());

it('current() is null before any data', () => {
  const store = createDataStore({ dataDir: tmp(), fetch: fakeFetch([]), now });
  expect(store.current()).toBeNull();
});

it('loads existing files from disk', async () => {
  const dir = tmp();
  copyAll(dir);
  const store = createDataStore({ dataDir: dir, fetch: fakeFetch([]), now });
  await store.loadFromDisk();
  expect(store.current()).not.toBeNull();
});

it('current() stays null until all four files are present', async () => {
  const dir = tmp();
  copyAll(dir);
  fs.rmSync(path.join(dir, 'tor-exits.txt'));
  const store = createDataStore({ dataDir: dir, fetch: fakeFetch([]), now });
  await store.loadFromDisk();
  expect(store.current()).toBeNull();
});

it('downloads, gunzips and swaps atomically', async () => {
  const dir = tmp();
  const seen = /** @type {string[]} */ ([]);
  const store = createDataStore({ dataDir: dir, fetch: fakeFetch(seen), now });
  await store.refreshAll();
  expect(fs.readdirSync(dir).sort()).toEqual([...FILES].sort());
  const data = store.current();
  expect(data?.lists.isTor('203.0.113.99')).toBe(true);
  expect(data?.city.get('81.2.69.142')).toBeTruthy();
});

it('falls back to last month for DB-IP', async () => {
  const seen = /** @type {string[]} */ ([]);
  const f = fakeFetch(seen, (url) =>
    url.includes('2026-10') ? res(404, 'nope') : res(200, zlib.gzipSync(bytes('dbip-city-lite.mmdb'))),
  );
  const store = createDataStore({ dataDir: tmp(), fetch: f, now });
  await store.refreshAll();
  expect(seen).toContain('https://download.db-ip.com/free/dbip-city-lite-2026-10.mmdb.gz');
  expect(seen).toContain('https://download.db-ip.com/free/dbip-city-lite-2026-09.mmdb.gz');
});

it('previous month of January is December of the previous year', async () => {
  const seen = /** @type {string[]} */ ([]);
  const f = fakeFetch(seen, () => res(404, ''));
  const store = createDataStore({
    dataDir: tmp(),
    fetch: f,
    now: () => new Date('2027-01-01T00:30:00Z'),
  });
  await store.refreshAll();
  expect(seen).toContain('https://download.db-ip.com/free/dbip-asn-lite-2027-01.mmdb.gz');
  expect(seen).toContain('https://download.db-ip.com/free/dbip-asn-lite-2026-12.mmdb.gz');
});

it('uses UTC for the month', async () => {
  const seen = /** @type {string[]} */ ([]);
  const store = createDataStore({
    dataDir: tmp(),
    fetch: fakeFetch(seen, () => res(404, '')),
    now: () => new Date('2026-10-31T23:30:00-05:00'),
  });
  await store.refreshAll();
  expect(seen).toContain('https://download.db-ip.com/free/dbip-city-lite-2026-11.mmdb.gz');
});

it('keeps the last good copy when a download fails', async () => {
  const dir = tmp();
  copyAll(dir);
  const store = createDataStore({
    dataDir: dir,
    fetch: /** @type {typeof fetch} */ (async () => {
      throw new Error('offline');
    }),
    now,
  });
  await store.loadFromDisk();
  const before = store.current();
  await expect(store.refreshAll()).resolves.toBeUndefined();
  expect(store.current()).toBe(before);
  expect(fs.readdirSync(dir).sort()).toEqual([...FILES].sort());
});

it('rejects downloads that do not parse and leaves no .tmp file', async () => {
  const dir = tmp();
  copyAll(dir);
  const before = fs.readFileSync(path.join(dir, 'tor-exits.txt'));
  const store = createDataStore({
    dataDir: dir,
    fetch: fakeFetch([], (url) =>
      url.includes('lite') ? res(200, zlib.gzipSync('not an mmdb')) : res(200, '\n'),
    ),
    now,
  });
  await store.loadFromDisk();
  const data = store.current();
  await store.refreshAll();
  expect(store.current()).toBe(data);
  expect(fs.readFileSync(path.join(dir, 'tor-exits.txt'))).toEqual(before);
  expect(fs.readdirSync(dir).sort()).toEqual([...FILES].sort());
});

it('keeps old files on non-2xx responses', async () => {
  const dir = tmp();
  copyAll(dir);
  const store = createDataStore({ dataDir: dir, fetch: fakeFetch([], () => res(500, 'x')), now });
  await store.loadFromDisk();
  const data = store.current();
  await store.refreshAll();
  expect(store.current()).toBe(data);
});

it('sends no visitor data', async () => {
  const seen = /** @type {string[]} */ ([]);
  const store = createDataStore({ dataDir: tmp(), fetch: fakeFetch(seen), now });
  await store.refreshAll();
  expect(seen.length).toBeGreaterThanOrEqual(4);
  for (const url of seen) expect(ALLOWED.some((re) => re.test(url))).toBe(true);
});

it('start() schedules per-source intervals and stop() clears them', async () => {
  vi.useFakeTimers();
  const seen = /** @type {string[]} */ ([]);
  const store = createDataStore({ dataDir: tmp(), fetch: fakeFetch(seen), now });
  store.start();
  expect(seen).toEqual([]);
  await vi.advanceTimersByTimeAsync(3_600_000);
  expect(seen).toEqual(['https://check.torproject.org/torbulkexitlist']);
  await vi.advanceTimersByTimeAsync(23 * 3_600_000);
  expect(seen.filter((u) => u.includes('icloud'))).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(6 * 24 * 3_600_000);
  expect(seen.filter((u) => u.includes('city-lite'))).toHaveLength(1);
  store.stop();
  const n = seen.length;
  await vi.advanceTimersByTimeAsync(30 * 24 * 3_600_000);
  expect(seen.length).toBe(n);
});

it('refreshAll({ onlyStale: true }) skips files younger than their interval, and fetches missing ones', async () => {
  const dir = tmp();
  copyAll(dir);
  const at = (/** @type {number} */ msAgo) => new Date(now().getTime() - msAgo);
  // DB-IP weekly, relay list daily: fresh. Tor list hourly: two hours old, so stale.
  fs.utimesSync(path.join(dir, 'dbip-city-lite.mmdb'), at(6 * 86_400_000), at(6 * 86_400_000));
  fs.utimesSync(path.join(dir, 'relay-ranges.csv'), at(3_600_000), at(3_600_000));
  fs.utimesSync(path.join(dir, 'tor-exits.txt'), at(2 * 3_600_000), at(2 * 3_600_000));
  fs.utimesSync(path.join(dir, 'dbip-asn-lite.mmdb'), at(60_000), at(60_000));
  const seen = /** @type {string[]} */ ([]);
  const store = createDataStore({ dataDir: dir, fetch: fakeFetch(seen), now });
  await store.loadFromDisk();
  await store.refreshAll({ onlyStale: true });
  expect(seen).toEqual(['https://check.torproject.org/torbulkexitlist']);

  fs.rmSync(path.join(dir, 'relay-ranges.csv'));
  seen.length = 0;
  await store.refreshAll({ onlyStale: true });
  expect(seen).toEqual(['https://mask-api.icloud.com/egress-ip-ranges.csv']);

  seen.length = 0;
  await store.refreshAll();
  expect(seen).toHaveLength(4);
});
