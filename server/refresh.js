// @ts-check

// Keeps the lookup data fresh. It loads the saved files at startup, downloads new copies
// on a timer, and swaps them in safely. whoami.js reads the result through current().
// The sources are the DB-IP Lite databases (.mmdb, a compact binary format for IP lookups:
// city/country, and ASN = the number and name of the network company that owns the IP),
// the Tor exit list, and the Apple Private Relay ranges.

// Keeps the lookup data fresh. It loads the saved files at startup, downloads new copies
// on a timer, and swaps them in safely. whoami.js reads the result through current().
// The sources are the DB-IP Lite databases (.mmdb, a compact binary format for IP lookups:
// city/country, and ASN = the number and name of the network company that owns the IP),
// the Tor exit list, and the Apple Private Relay ranges.
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import zlib from 'node:zlib';
import { Reader } from 'mmdb-lib';
import { createIpLists } from './lists.js';
// A file must pass its parser before it is used. A truncated or junk download throws here
// and is ignored, so a bad download can never replace a good copy.

/** @typedef {import('./whoami.js').Data} Data */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// A file must pass its parser before it is used. A truncated or junk download throws here
// and is ignored, so a bad download can never replace a good copy.
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
// DB-IP publishes one file per month. Early in a month the new file may not exist yet,
// so we try this month, then last month.
export function createDataStore({ dataDir, fetch: doFetch, now = () => new Date() }) {
  /** @type {Record<string, any>} */
  const parsed = {};
  /** @type {Data|null} */
  let cached = null;
// How often each source is refreshed: databases weekly, the Tor list hourly (it changes
// fast), the relay ranges daily.

  /** @param {Date} d */
  const ym = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  // DB-IP publishes one file per month. Early in a month the new file may not exist yet,
  // so we try this month, then last month.
  const months = () => {
    const d = now();
    return [ym(d), ym(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)))];
  };

  // How often each source is refreshed: databases weekly, the Tor list hourly (it changes
  // fast), the relay ranges daily.
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
      // Store the parsed value and drop the cached bundle, so current() rebuilds it.
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
// Errors are ignored on purpose: the old copy stays in use.

  // Store the parsed value and drop the cached bundle, so current() rebuilds it.
  /** @param {string} file @param {any} value */
  const accept = (file, value) => {
    parsed[file] = value;
    cached = null;
  };

  /** @param {typeof sources[number]} s */
  // A 404 on the gzip databases means this month's file is not out yet: try last month's.
  async function loadOne(s) {
    try {
      accept(s.file, s.parse(await fs.readFile(path.join(dataDir, s.file))));
    // The download is gzip-compressed for the databases; unpack it before parsing.
    } catch {
      // Errors are ignored on purpose: the old copy stays in use.
      // Write to a temporary file, then rename. A rename is atomic, so a reader or a crash
      // never sees a half-written file.
      // missing or corrupt: keep whatever we have
    }
  }

  /** @param {typeof sources[number]} s */
  async function refreshOne(s) {
    try {
      for (const url of s.urls()) {
        const r = await doFetch(url, { signal: AbortSignal.timeout(60_000) });
        // A 404 on the gzip databases means this month's file is not out yet: try last month's.
        if (r.status === 404 && s.gunzip) continue;
        if (!r.ok) return;
        let buf = Buffer.from(await r.arrayBuffer());
        // The download is gzip-compressed for the databases; unpack it before parsing.
        if (s.gunzip) buf = zlib.gunzipSync(buf);
        const value = s.parse(buf); // throws on junk: nothing is written
        // Write to a temporary file, then rename. A rename is atomic, so a reader or a crash
        // never sees a half-written file.
        const dest = path.join(dataDir, s.file);
        const tmp = `${dest}.tmp`;
        try {
          await fs.writeFile(tmp, buf);
          // Built lazily and cached. Returns null until all four sources have loaded at least once
          // (the handler then answers 503).
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
    // Built lazily and cached. Returns null until all four sources have loaded at least once
    // (the handler then answers 503).
    // Stale means: the file is missing, or older than its refresh interval.
    current() {
      if (cached) return cached;
      if (!sources.every((s) => parsed[s.file])) return null;
      cached = {
        city: parsed['dbip-city-lite.mmdb'],
        asn: parsed['dbip-asn-lite.mmdb'],
        lists: createIpLists({ torText: parsed['tor-exits.txt'], relayCsv: parsed['relay-ranges.csv'] }),
      };
      // unref() lets the process exit even though these timers are still scheduled.
      return cached;
    },
    async loadFromDisk() {
      await Promise.all(sources.map(loadOne));
    },
    /**
     * Download every source; with `onlyStale`, only those whose file is missing or older than its interval
     * (so a restart does not fetch everything again).
     * @param {{ onlyStale?: boolean }} [opts]
     */
    async refreshAll({ onlyStale = false } = {}) {
      /** @param {typeof sources[number]} s */
      // Stale means: the file is missing, or older than its refresh interval.
      const stale = async (s) => {
        const st = await fs.stat(path.join(dataDir, s.file)).catch(() => null);
        return !st || now().getTime() - st.mtimeMs >= s.every;
      };
      await Promise.all(sources.map(async (s) => { if (!onlyStale || await stale(s)) await refreshOne(s); }));
    },
    start() {
      this.stop();
      // unref() lets the process exit even though these timers are still scheduled.
      timers = sources.map((s) => setInterval(() => void refreshOne(s), s.every).unref());
    },
    stop() {
      for (const t of timers) clearInterval(t);
      timers = [];
    },
  };
}
