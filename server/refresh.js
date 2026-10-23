// @ts-check
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import zlib from 'node:zlib';
import { Reader } from 'mmdb-lib';
import { createIpLists } from './lists.js';

/** @typedef {import('./whoami.js').Data} Data */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** @param {Buffer} buf */
const parseMmdb = (buf) => new Reader(buf);

/** @param {Buffer} buf */
const parseTor = (buf) => {
  const text = buf.toString();
  if (!text.split('\n').some((l) => net.isIP(l.trim()))) throw new Error('empty tor list');
  return text;
};

/** @param {Buffer} buf */
const parseRelay = (buf) => {
  const text = buf.toString();
  if (!text.split('\n').some((l) => l.includes('/'))) throw new Error('empty relay list');
  return text;
};

/**
 * @param {{ dataDir: string, fetch: typeof fetch, now?: () => Date }} opts
 */
export function createDataStore({ dataDir, fetch: doFetch, now = () => new Date() }) {
  /** @type {Record<string, any>} */
  const parsed = {};
  /** @type {Data|null} */
  let cached = null;

  /** @param {Date} d */
  const ym = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const months = () => {
    const d = now();
    return [ym(d), ym(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)))];
  };

  /** @type {{ file: string, every: number, parse: (b: Buffer) => any, urls: () => string[], gunzip: boolean }[]} */
  const sources = [
    ...['city', 'asn'].map((k) => ({
      file: `dbip-${k}-lite.mmdb`,
      every: 7 * DAY,
      parse: parseMmdb,
      gunzip: true,
      urls: () => months().map((m) => `https://download.db-ip.com/free/dbip-${k}-lite-${m}.mmdb.gz`),
    })),
    {
      file: 'tor-exits.txt',
      every: HOUR,
      parse: parseTor,
      gunzip: false,
      urls: () => ['https://check.torproject.org/torbulkexitlist'],
    },
    {
      file: 'relay-ranges.csv',
      every: DAY,
      parse: parseRelay,
      gunzip: false,
      urls: () => ['https://mask-api.icloud.com/egress-ip-ranges.csv'],
    },
  ];

  /** @param {string} file @param {any} value */
  const accept = (file, value) => {
    parsed[file] = value;
    cached = null;
  };

  /** @param {typeof sources[number]} s */
  async function loadOne(s) {
    try {
      accept(s.file, s.parse(await fs.readFile(path.join(dataDir, s.file))));
    } catch {
      // missing or corrupt: keep whatever we have
    }
  }

  /** @param {typeof sources[number]} s */
  async function refreshOne(s) {
    try {
      for (const url of s.urls()) {
        const r = await doFetch(url, { signal: AbortSignal.timeout(60_000) });
        if (r.status === 404 && s.gunzip) continue;
        if (!r.ok) return;
        let buf = Buffer.from(await r.arrayBuffer());
        if (s.gunzip) buf = zlib.gunzipSync(buf);
        const value = s.parse(buf); // throws on junk: nothing is written
        const dest = path.join(dataDir, s.file);
        const tmp = `${dest}.tmp`;
        try {
          await fs.writeFile(tmp, buf);
          await fs.rename(tmp, dest);
        } catch (e) {
          await fs.rm(tmp, { force: true });
          throw e;
        }
        accept(s.file, value);
        return;
      }
    } catch {
      // keep the last good copy
    }
  }

  /** @type {NodeJS.Timeout[]} */
  let timers = [];

  return {
    /** @returns {Data|null} */
    current() {
      if (cached) return cached;
      if (!sources.every((s) => parsed[s.file])) return null;
      cached = {
        city: parsed['dbip-city-lite.mmdb'],
        asn: parsed['dbip-asn-lite.mmdb'],
        lists: createIpLists({ torText: parsed['tor-exits.txt'], relayCsv: parsed['relay-ranges.csv'] }),
      };
      return cached;
    },
    async loadFromDisk() {
      await Promise.all(sources.map(loadOne));
    },
    async refreshAll() {
      await Promise.all(sources.map(refreshOne));
    },
    start() {
      this.stop();
      timers = sources.map((s) => setInterval(() => void refreshOne(s), s.every).unref());
    },
    stop() {
      for (const t of timers) clearInterval(t);
      timers = [];
    },
  };
}
