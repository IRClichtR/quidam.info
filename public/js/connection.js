// @ts-check
// Connection findings. Every request goes to leakcheck's own server, and only after a click.

// What we ask the network about you: your public IP (the address websites see), whose network it
// belongs to, and whether a VPN really hides it. Every request goes to leakcheck's own server
// and STUN server, and only after the visitor clicks. Nothing is stored (see state.js).
// Judging is pure logic; fetching and WebRTC are the browser-only parts.
/** @typedef {import('./browser.js').Finding} Finding */
/** @typedef {import('./browser.js').T} T */
/** @typedef {{ ip: string, family: 4|6, country: string|null, city: string|null, asn: number|null,
 *   asOrg: string|null, tor: boolean, privateRelay: boolean }} Whoami */
/** @typedef {Whoami|null|'unavailable'|'busy'} Lookup */
/** @typedef {{v4: string[], v6: string[]}} Srflx */
/** @typedef {{v4: string, v6: string, stunPort: number}} Origins */

// IPv4 looks like 1.2.3.4. IPv6 is the newer, longer form with colons. A connection can have one or both.
/** @param {string} ip */
const isV4 = (ip) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
/** @param {string} ip */
const isV6 = (ip) => ip.includes(':');

// Expand '::' (a run of zero groups) so two spellings of one IPv6 address can be compared.
/** The eight groups of an IPv6 address, as written (`::` expanded). @param {string} ip */
function groups6(ip) {
  const [head, tail] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  return tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
}

// Compare as numbers, so '2001:db8::1' and '2001:0db8:0:0:0:0:0:1' match.
/** Whether two addresses are the same, however the IPv6 one is written. @param {string} a @param {string} b */
function sameIp(a, b) {
  if (!isV6(a) || !isV6(b)) return a === b;
  const [x, y] = [a, b].map((ip) => groups6(ip).map((g) => parseInt(g, 16)).join(':'));
  return x === y;
}

// Hide the host part by default: the last byte (IPv4) or the last 4 groups (IPv6) point to one
// device, so a screenshot of the page stays safe to share. 'Reveal' shows the full address.
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

// Pick the first answer that is a real result. Order matters: the page's own origin first,
// then IPv4, then IPv6.
/**
 * The lookup that stands for the visitor's public address: the main one, else IPv4, else IPv6.
 * @param {Lookup} main @param {Lookup} v4 @param {Lookup} v6
 * @returns {Whoami|null}
 */
export function primaryLookup(main, v4, v6) {
  return [main, v4, v6].find(isWhoami) ?? null;
}

// A request that never answers must not freeze the page, so a timer cancels it.
/**
 * Ask one origin's /api/whoami ('' means this page's own origin).
 * @param {string} origin
 * @param {typeof fetch} [fetchFn]
 * @param {number} [timeoutMs]
 * @returns {Promise<Lookup>} null on timeout or network error, 'unavailable' when the server has no data,
 *   'busy' when it is rate-limiting this address
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
    if (res.status === 429) return 'busy';
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

// STUN is a tiny public service that tells a device 'this is the address I see you at'.
// Ours has one IPv4-only and one IPv6-only name, so we learn the address for each family.
/**
 * STUN addresses on our own IPv4-only and IPv6-only hostnames.
 * @param {Origins} origins
 */
export function stunUrls({ v4, v6, stunPort }) {
  return [v4, v6].map((o) => `stun:${new URL(o).hostname}:${stunPort}`);
}

// 'srflx' (server-reflexive) is a WebRTC ICE candidate type: the public address a STUN server
// saw when the browser contacted it. WebRTC can bypass a VPN's tunnel, so if the srflx address
// differs from the IP the website sees, the real address leaks around the VPN.
// We collect per family because IPv4 can only be compared with IPv4 (and IPv6 with IPv6).
/**
 * Every public address our STUN server saw, by family, from server-reflexive candidates (one per interface).
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
  const found = { v4: [], v6: [] };
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let timer;
  try {
    await new Promise((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
      pc.onicecandidate = (e) => {
        const c = e.candidate;
        if (!c) return resolve(undefined);
        // A candidate line looks like 'candidate:1 1 udp 2113 203.0.113.5 54321 typ srflx ...'.
        // Field 5 is the address and field 8 is the type. Older browsers lack c.address / c.type, so we parse.
        const parts = c.candidate.split(' ');
        if ((c.type ?? parts[7]) !== 'srflx') return;
        // Chromium writes IPv6 addresses in brackets.
        const addr = (c.address ?? parts[4] ?? '').replace(/^\[(.*)\]$/, '$1');
        if (!addr) return;
        const list = isV4(addr) ? found.v4 : isV6(addr) ? found.v6 : null;
        if (list && !list.some((a) => sameIp(a, addr))) list.push(addr);
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

// Some VPNs only tunnel IPv4. Then IPv6 still exits through the home provider, a different
// network (different ASN, the number that identifies a provider's network).
/**
 * Whether the IPv6 lookup comes from another network than the IPv4 one: an IPv4-only VPN
 * leaves IPv6 on the provider's network. Tor and Private Relay are left out, as are unknown networks.
 * @param {Lookup} v4 @param {Whoami} v6
 */
function otherNetwork(v4, v6) {
  if (!isWhoami(v4) || [v4, v6].some((w) => w.tor || w.privateRelay)) return false;
  return v4.asn !== null && v6.asn !== null && v4.asn !== v6.asn;
}

// 'publicIp' is CAN'T TELL (not a leak by itself: the site must see some address). Verdicts for
// provider and location depend on whether they point to where the browser says it is.
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
  const who = primaryLookup(main, v4, v6);
  if (!who) {
    const all = [main, v4, v6];
    const key = all.includes('busy') ? 'busy' : all.includes('unavailable') ? 'unavailable' : 'failed';
    return [{ id: 'publicIp', verdict: 'unknown', value: t(`finding.publicIp.${key}`) }];
  }
  // Tor and iCloud Private Relay hide the real address on purpose, so these are OK.
  const hidden = who.tor || who.privateRelay;
  // A zone with no country (such as UTC) says nothing about where the browser is.
  const zone = zoneCountries[timeZone];
  // Does the IP's country match the country of the browser's time zone? A match means the IP
  // still points to where you are: LEAK. A mismatch (VPN) is OK. If either side is unknown
  // (no country for the IP, or a zone such as UTC that belongs to no one country) we cannot
  // compare, so CAN'T TELL rather than a wrong guess.
  /** @type {import('./browser.js').Verdict} */
  const home = hidden ? 'ok'
    : who.country === null || zone === undefined ? 'unknown'
      : zone.includes(who.country) ? 'leak' : 'ok';
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
  // One VPN check per family that answered. 'seen' = srflx addresses from STUN; 'lookup' = what
  // the website sees. Different means WebRTC bypasses the VPN.
  for (const [id, lookup, seen] of /** @type {const} */ ([['vpn4', v4, srflx?.v4], ['vpn6', v6, srflx?.v6]])) {
    if (!isWhoami(lookup)) continue;
    // Any interface showing another address is a leak, even if another one matches.
    const other = (seen ?? []).filter((ip) => !sameIp(ip, lookup.ip));
    if (other.length) out.push({ id, verdict: 'leak', value: t('finding.vpn.other', { ip: other.map(show).join(', ') }) });
    // No STUN address of this family: we cannot compare, so CAN'T TELL.
    else if (id === 'vpn6' && otherNetwork(v4, lookup)) {
      out.push({ id, verdict: 'leak', value: t('finding.vpn.otherNetwork', { v6: `AS${lookup.asn}`, v4: `AS${/** @type {Whoami} */ (v4).asn}` }) });
    } else if (!seen?.length) out.push({ id, verdict: 'unknown', value: t('finding.vpn.none') });
    else out.push({ id, verdict: 'ok', value: t('finding.vpn.same', { ip: show(lookup.ip) }) });
  }
  return out;
}

// 'hidden' means the address changed once the VPN was off, so the VPN was doing its job.
/**
 * The VPN-off recheck: a different address with the VPN off means the VPN was hiding it.
 * Addresses of different families say nothing about each other.
 * @param {{ip: string, family: 4|6}} before
 * @param {{ip: string, family: 4|6}} after
 * @returns {'hidden'|'same'|'otherFamily'}
 */
export function compareVpnOff(before, after) {
  if (before.family !== after.family) return 'otherFamily';
  return sameIp(before.ip, after.ip) ? 'same' : 'hidden';
}
