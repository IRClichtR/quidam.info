// @ts-check
// Turns two downloaded lists into fast "is this IP in it?" checks: the Tor exit list
// (single IPs) and the Apple Private Relay ranges (CIDR blocks, like 17.0.0.0/8, meaning
// "all addresses starting with these first 8 bits"). refresh.js feeds it the raw text.
// Addresses are turned into numbers (BigInt, so IPv6's 128 bits fit). The relay list has
// about 285 000 ranges: they are sorted and merged once, and each check is a binary search
// (about 20 steps). net.BlockList was not used: it compares with every range in turn,
// which took ~17 ms per check and blocked the whole server.
import net from 'node:net';

// An IPv4 address can arrive wrapped as IPv6 ("::ffff:1.2.3.4"). Unwrap it so it
// matches the plain IPv4 entries in the lists.
/**
 * The address as a number, with its family, or null when it is not an IP address.
 * @param {string} ip
 * @returns {{n: bigint, v6: boolean}|null}
 */
function toNumber(ip) {
  const s = ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
  const family = net.isIP(s);
  if (family === 4) return { n: s.split('.').reduce((acc, b) => (acc << 8n) | BigInt(b), 0n), v6: false };
  if (family !== 6) return null;
  // Expand "::" (a run of zero groups); a trailing dotted IPv4 part counts as two groups.
  let text = s.split('%')[0];
  const dotted = text.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    text = text.slice(0, dotted.index) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16);
  }
  const [head, tail] = text.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = tail === undefined ? h : [...h, ...Array(8 - h.length - t.length).fill('0'), ...t];
  return { n: groups.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g, 16)), 0n), v6: true };
}

/**
 * Sorted, non-overlapping ranges with a binary-search check.
 * @param {[bigint, bigint][]} ranges [first, last] addresses, any order, may overlap
 */
function rangeSet(ranges) {
  ranges.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  /** @type {bigint[]} */
  const starts = [];
  /** @type {bigint[]} */
  const ends = [];
  for (const [lo, hi] of ranges) {
    const last = ends.length - 1;
    // Overlapping or touching the previous range: extend it instead of adding one.
    if (last >= 0 && lo <= ends[last] + 1n) {
      if (hi > ends[last]) ends[last] = hi;
    } else {
      starts.push(lo);
      ends.push(hi);
    }
  }
  /** @param {bigint} n */
  return (n) => {
    // Find the last range starting at or before n, then check n is not past its end.
    let lo = 0;
    let hi = starts.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] <= n) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return found >= 0 && n <= ends[found];
  };
}

/**
 * The Tor exit check, from the list's text (one address per line).
 * @param {string} torText
 * @returns {(ip: string) => boolean}
 */
export function createTorList(torText) {
  // Tor exits are single addresses, so a Set of their numbers (per family) is enough.
  /** @type {Set<string>} */
  const tor = new Set();
  for (const line of torText.split('\n')) {
    const p = toNumber(line.trim());
    if (p) tor.add(`${p.v6 ? 6 : 4}:${p.n}`);
  }
  return (ip) => {
    const p = toNumber(ip);
    return p ? tor.has(`${p.v6 ? 6 : 4}:${p.n}`) : false;
  };
}

/**
 * The Private Relay check, from the ranges CSV. Building it takes about a second for the
 * full list, so refresh.js rebuilds it only when that file changes.
 * @param {string} relayCsv
 * @returns {(ip: string) => boolean}
 */
export function createRelayList(relayCsv) {
  /** @type {[bigint, bigint][]} */
  const v4 = [];
  /** @type {[bigint, bigint][]} */
  const v6 = [];
  for (const line of relayCsv.split('\n')) {
    // Each CSV line starts with the CIDR (address/prefix-length); other columns are ignored.
    // Bad lines are skipped, so one broken line cannot break the whole list.
    const cidr = line.split(',', 1)[0].trim();
    const slash = cidr.indexOf('/');
    if (slash < 0) continue;
    const p = toNumber(cidr.slice(0, slash));
    const bits = cidr.slice(slash + 1);
    if (!p || !/^\d{1,3}$/.test(bits)) continue;
    const width = p.v6 ? 128n : 32n;
    const prefix = BigInt(bits);
    if (prefix > width) continue; // out-of-range prefix length: skip
    // The host part (the bits after the prefix) runs from all zeros to all ones.
    const host = (1n << (width - prefix)) - 1n;
    const first = p.n & ~host;
    (p.v6 ? v6 : v4).push([first, first | host]);
  }
  const relay4 = rangeSet(v4);
  const relay6 = rangeSet(v6);
  return (ip) => {
    const p = toNumber(ip);
    return p ? (p.v6 ? relay6 : relay4)(p.n) : false;
  };
}

/**
 * Both checks at once.
 * @param {{torText: string, relayCsv: string}} src
 */
export function createIpLists({ torText, relayCsv }) {
  return { isTor: createTorList(torText), isRelay: createRelayList(relayCsv) };
}
