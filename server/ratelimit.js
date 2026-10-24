// @ts-check

// A tiny rate limiter used by the web API and the STUN responder to stop one address
// from flooding us. Kept in memory only, so nothing about visitors is ever stored on disk.

// "Fixed window" means: count hits per key, and reset the count once windowMs has passed
// since the first hit. Simple, and good enough here. The `now` argument lets tests fake the clock.
// A tiny rate limiter used by the web API and the STUN responder to stop one address
// from flooding us. Kept in memory only, so nothing about visitors is ever stored on disk.
/**
 // "Fixed window" means: count hits per key, and reset the count once windowMs has passed
 // since the first hit. Simple, and good enough here. The `now` argument lets tests fake the clock.
 * Fixed-window, in-memory rate limiter. Keys (visitor IPs) live only in this Map.
 * @param {{limit: number, windowMs: number, now?: () => number}} opts
 // Delete expired entries on each call, so the Map cannot grow forever.
 */
export function createRateLimiter({ limit, windowMs, now = Date.now }) {
  /** @type {Map<string, {start: number, count: number}>} */
  const entries = new Map();

  // Delete expired entries on each call, so the Map cannot grow forever.
  function sweep() {
    const t = now();
    for (const [key, e] of entries) if (t - e.start >= windowMs) entries.delete(key);
  }

  return {
    /** @param {string} key */
    hit(key) {
      sweep();
      // true means the request is allowed, false means the limit was passed.
      let e = entries.get(key);
      if (!e) {
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
  };
}
