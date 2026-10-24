// @ts-check
// Connection findings. Every request goes to leakcheck's own server, and only after a click.

/** @typedef {import('./browser.js').Finding} Finding */
/** @typedef {import('./browser.js').T} T */
/** @typedef {{ ip: string, family: 4|6, country: string|null, city: string|null, asn: number|null,
 *   asOrg: string|null, tor: boolean, privateRelay: boolean }} Whoami */
/** @typedef {Whoami|null|'unavailable'} Lookup */
/** @typedef {{v4: string|null, v6: string|null}} Srflx */
/** @typedef {{v4: string, v6: string, stunPort: number}} Origins */

/** @param {string} ip */
const isV4 = (ip) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
/** @param {string} ip */
const isV6 = (ip) => ip.includes(':');

/** The eight groups of an IPv6 address, as written (`::` expanded). @param {string} ip */
function groups6(ip) {
  const [head, tail] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  return tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
}

/** Whether two addresses are the same, however the IPv6 one is written. @param {string} a @param {string} b */
function sameIp(a, b) {
  if (!isV6(a) || !isV6(b)) return a === b;
  const [x, y] = [a, b].map((ip) => groups6(ip).map((g) => parseInt(g, 16)).join(':'));
  return x === y;
}

/**
 * The address with its host part hidden: the last IPv4 byte, or all but the first four IPv6 groups.
 * @param {string} ip
 */
export function maskIp(ip) {
  if (isV4(ip)) return ip.split('.').slice(0, 3).join('.') + '.•••';
  return groups6(ip).slice(0, 4).join(':') + ':•••';
}

/** @param {unknown} x @returns {x is Whoami} */
function isWhoami(x) {
  return typeof x === 'object' && x !== null && typeof (/** @type {any} */ (x).ip) === 'string';
}

/**
 * Ask one origin's /api/whoami ('' means this page's own origin).
 * @param {string} origin
 * @param {typeof fetch} [fetchFn]
 * @param {number} [timeoutMs]
 * @returns {Promise<Lookup>} null on timeout or network error, 'unavailable' when the server has no data
 */
export async function fetchWhoami(origin, fetchFn = fetch, timeoutMs = 3000) {
  const ctrl = new AbortController();
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => { ctrl.abort(); resolve(null); }, timeoutMs);
  });
  const lookup = (async () => {
    const res = await fetchFn(`${origin}/api/whoami`, { signal: ctrl.signal, credentials: 'omit', cache: 'no-store' });
    if (res.status === 503) return 'unavailable';
    if (!res.ok) return null;
    const body = await res.json();
    return isWhoami(body) ? body : null;
  })().catch(() => null);
  try {
    return /** @type {Lookup} */ (await Promise.race([lookup, timeout]));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * STUN addresses on our own IPv4-only and IPv6-only hostnames.
 * @param {Origins} origins
 */
export function stunUrls({ v4, v6, stunPort }) {
  return [v4, v6].map((o) => `stun:${new URL(o).hostname}:${stunPort}`);
}

/**
 * The public addresses our STUN server saw, one per family, from server-reflexive candidates.
 * @param {string[]} urls
 * @param {number} [timeoutMs]
 * @returns {Promise<Srflx|null>} null when WebRTC is missing or blocked
 */
export async function gatherSrflx(urls, timeoutMs = 5000) {
  if (typeof RTCPeerConnection === 'undefined') return null;
  /** @type {RTCPeerConnection} */
  let pc;
  try {
    pc = new RTCPeerConnection({ iceServers: [{ urls }] });
  } catch {
    return null;
  }
  /** @type {Srflx} */
  const found = { v4: null, v6: null };
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let timer;
  try {
    await new Promise((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
      pc.onicecandidate = (e) => {
        const c = e.candidate;
        if (!c) return resolve(undefined);
        const parts = c.candidate.split(' ');
        if ((c.type ?? parts[7]) !== 'srflx') return;
        // Chromium writes IPv6 addresses in brackets.
        const addr = (c.address ?? parts[4] ?? '').replace(/^\[(.*)\]$/, '$1');
        if (!addr) return;
        if (isV4(addr)) found.v4 ??= addr;
        else if (isV6(addr)) found.v6 ??= addr;
      };
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') resolve(undefined);
      };
      pc.createDataChannel('leakcheck');
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => resolve(undefined));
    });
  } finally {
    clearTimeout(timer);
    pc.close();
  }
  return found;
}

/**
 * Decide the connection findings.
 * `main` is the lookup on this page's origin; `v4`/`v6` the lookups on the single-family origins.
 * @param {{main: Lookup, v4: Lookup, v6: Lookup, srflx: Srflx|null, timeZone: string,
 *   zoneCountries: Record<string, string[]>, reveal?: boolean}} input
 * @param {T} t
 * @returns {Finding[]}
 */
export function judgeConnection({ main, v4, v6, srflx, timeZone, zoneCountries, reveal = false }, t) {
  /** @param {string} ip */
  const show = (ip) => (reveal ? ip : maskIp(ip));
  const who = [main, v4, v6].find(isWhoami);
  if (!who) {
    const unavailable = [main, v4, v6].includes('unavailable');
    return [{ id: 'publicIp', verdict: 'unknown', value: t(unavailable ? 'finding.publicIp.unavailable' : 'finding.publicIp.failed') }];
  }
  const hidden = who.tor || who.privateRelay;
  /** @type {import('./browser.js').Verdict} */
  const home = hidden ? 'ok'
    : who.country === null ? 'unknown'
      : zoneCountries[timeZone]?.includes(who.country) ? 'leak' : 'ok';
  const ipKey = who.tor ? 'finding.publicIp.tor' : who.privateRelay ? 'finding.publicIp.relay' : 'finding.publicIp.value';
  const asn = who.asn === null ? null : `AS${who.asn}`;
  const provider = [who.asOrg, asn].filter((x) => x !== null).join(' · ');
  const place = [who.city, who.country].filter((x) => x !== null).join(', ');

  /** @type {Finding[]} */
  const out = [
    { id: 'publicIp', verdict: hidden ? 'ok' : 'unknown', value: t(ipKey, { ip: show(who.ip) }) },
    { id: 'provider', verdict: home, value: provider || t('finding.unknown') },
    { id: 'location', verdict: home, value: place || t('finding.unknown') },
  ];
  for (const [id, lookup, seen] of /** @type {const} */ ([['vpn4', v4, srflx?.v4], ['vpn6', v6, srflx?.v6]])) {
    if (!isWhoami(lookup)) continue;
    if (!seen) out.push({ id, verdict: 'unknown', value: t('finding.vpn.none') });
    else if (sameIp(seen, lookup.ip)) out.push({ id, verdict: 'ok', value: t('finding.vpn.same', { ip: show(seen) }) });
    else out.push({ id, verdict: 'leak', value: t('finding.vpn.other', { ip: show(seen) }) });
  }
  return out;
}

/**
 * The VPN-off recheck: a different address with the VPN off means the VPN was hiding it.
 * @param {string} before
 * @param {string} after
 * @returns {'hidden'|'same'}
 */
export function compareVpnOff(before, after) {
  return before === after ? 'same' : 'hidden';
}
