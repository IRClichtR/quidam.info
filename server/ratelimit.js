// @ts-check
/**
 * Fixed-window, in-memory rate limiter. Keys (visitor IPs) live only in this Map.
 * @param {{limit: number, windowMs: number, now?: () => number}} opts
 */
export function createRateLimiter({ limit, windowMs, now = Date.now }) {
  /** @type {Map<string, {start: number, count: number}>} */
  const entries = new Map();

  function sweep() {
    const t = now();
    for (const [key, e] of entries) if (t - e.start >= windowMs) entries.delete(key);
  }

  return {
    /** @param {string} key */
    hit(key) {
      sweep();
      let e = entries.get(key);
      if (!e) {
        e = { start: now(), count: 0 };
        entries.set(key, e);
      }
      e.count++;
      return e.count <= limit;
    },
    size() {
      sweep();
      return entries.size;
    },
  };
}
