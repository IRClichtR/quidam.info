// @ts-check
// A tiny rate limiter used by the web API and the STUN responder to stop one address
// from flooding us. Kept in memory only, so nothing about visitors is ever stored on disk.

// "Fixed window" means: count hits per key, and reset the count once windowMs has passed
// since the first hit. Simple, and good enough here. The `now` argument lets tests fake the clock.
/**
 * Fixed-window, in-memory rate limiter. Keys (visitor IPs) live only in this Map.
 * At most `maxKeys` keys are tracked: when full, a new key is refused rather than stored,
 * so a flood of addresses cannot grow memory without bound.
 * @param {{limit: number, windowMs: number, maxKeys?: number, now?: () => number}} opts
 */
export function createRateLimiter({ limit, windowMs, maxKeys = 100_000, now = Date.now }) {
  /** @type {Map<string, {start: number, count: number}>} */
  const entries = new Map();

  // A Map keeps insertion order, and a key is only (re)inserted when its window starts,
  // so the entries are sorted by start time. Sweeping stops at the first live entry:
  // each entry is visited once after it expires, which keeps every call cheap.
  function sweep() {
    const t = now();
    for (const [key, e] of entries) {
      if (t - e.start < windowMs) break;
      entries.delete(key);
    }
  }

  // Sweep every second as well, not only on the next request: on a quiet server an address
  // would otherwise stay in memory until someone else came by. The privacy notice promises
  // that it is gone one minute after its window starts. unref(): this timer never keeps the process alive.
  const timer = setInterval(sweep, 1000);
  timer.unref();

  return {
    /** @param {string} key */
    hit(key) {
      sweep();
      let e = entries.get(key);
      if (!e) {
        if (entries.size >= maxKeys) return false;
        e = { start: now(), count: 0 };
        entries.set(key, e);
      }
      e.count++;
      // true means the request is allowed, false means the limit was passed.
      return e.count <= limit;
    },
    size() {
      sweep();
      return entries.size;
    },
    /** Stop the background sweep (tests, shutdown). */
    stop() {
      clearInterval(timer);
    },
  };
}
