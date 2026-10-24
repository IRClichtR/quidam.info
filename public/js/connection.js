// @ts-check
// Connection findings. Every request goes to leakcheck's own server, and only after a click.

// What we ask the network about you: your public IP (the address websites see), whose network it
// belongs to, whether a VPN really hides it, and which local addresses WebRTC shares. Every request
// goes to leakcheck's own server and STUN server, and only after the visitor answers the VPN
// question and clicks. Nothing is stored (see state.js).
// Judging is pure logic; fetching and WebRTC are the browser-only parts.
/** @typedef {import('./browser.js').Finding} Finding */
/** @typedef {import('./browser.js').T} T */
/** @typedef {{ ip: string, family: 4|6, country: string|null, city: string|null, asn: number|null,
 *   asOrg: string|null, tor: boolean, privateRelay: boolean }} Whoami */
/** @typedef {Whoami|null|'unavailable'|'busy'} Lookup */
/** @typedef {{v4: string[], v6: string[], local: string[]}} Ice */
/** @typedef {'hidden'|'same'|'otherFamily'} VpnOff */
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

// When the browser and the server are on the same machine or network (local testing), the server
// sees a loopback or private address, never the public one. Such an address says nothing about
// the visitor, so it must not be judged as if it were public.
/**
 * Whether an address is loopback, private (RFC 1918, IPv6 fc00::/7), link-local or carrier-grade NAT.
 * @param {string} ip
 */
export function isLocalIp(ip) {
  // An IPv4 address written inside IPv6 ('::ffff:1.2.3.4') is judged as the IPv4 address.
  ip = ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
  if (isV4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  const first = parseInt(groups6(ip)[0] || '0', 16);
  return sameIp(ip, '::1') || sameIp(ip, '::') || (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

/** @param {unknown} x @returns {x is Whoami} */
function isWhoami(x) {
  return typeof x === 'object' && x !== null && typeof (/** @type {any} */ (x).ip) === 'string';
}

// Pick the first answer that is a real result. Order matters: the page's own origin first,
// then IPv4, then IPv6. A public address wins over a local one (testing on this machine).
/**
 * The lookup that stands for the visitor's public address: the main one, else IPv4, else IPv6,
 * preferring a public address to a local one.
 * @param {Lookup} main @param {Lookup} v4 @param {Lookup} v6
 * @returns {Whoami|null}
 */
export function primaryLookup(main, v4, v6) {
  const found = [main, v4, v6].filter(isWhoami);
  return found.find((w) => !isLocalIp(w.ip)) ?? found[0] ?? null;
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

// ICE candidates are the network addresses WebRTC offers for a call. Two types matter here:
// 'host' is an address of this device on its own network (or a random '.local' name hiding it),
// 'srflx' (server-reflexive) is the public address a STUN server saw when the browser contacted it.
// WebRTC can bypass a VPN's tunnel, so if the srflx address differs from the IP the website sees,
// the real address leaks around the VPN.
// We collect srflx per family because IPv4 can only be compared with IPv4 (and IPv6 with IPv6).
/**
 * The addresses WebRTC offers: public ones our STUN server saw, by family (one per interface),
 * and local (host) ones. With no URL, no server is asked and only local addresses come back.
 * @param {string[]} urls
 * @param {number} [timeoutMs]
 * @returns {Promise<Ice|null>} null when WebRTC is missing or blocked
 */
export async function gatherIce(urls, timeoutMs = 5000) {
  if (typeof RTCPeerConnection === 'undefined') return null;
  /** @type {RTCPeerConnection} */
  let pc;
  try {
    pc = new RTCPeerConnection({ iceServers: urls.length ? [{ urls }] : [] });
  } catch {
    return null;
  }
  /** @type {Ice} */
  const found = { v4: [], v6: [], local: [] };
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
        const type = c.type ?? parts[7];
        // Chromium writes IPv6 addresses in brackets.
        const addr = (c.address ?? parts[4] ?? '').replace(/^\[(.*)\]$/, '$1');
        if (!addr) return;
        if (type === 'host' && !found.local.includes(addr)) found.local.push(addr);
        if (type !== 'srflx') return;
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

// Chrome and Safari hide your real local address behind a random '.local' name (mDNS).
// Those names reveal nothing. Any other address is a real local IP, so it leaks.
/**
 * The local IP finding: what WebRTC shares about this device on its own network.
 * @param {Ice|null} ice
 * @param {T} t
 * @returns {Finding}
 */
function judgeLocal(ice, t) {
  const shown = (ice?.local ?? []).filter((a) => !a.endsWith('.local'));
  return {
    id: 'webrtcLocal',
    verdict: shown.length ? 'leak' : 'ok',
    value: ice === null ? t('finding.webrtcLocal.off')
      : shown.length ? t('finding.webrtcLocal.shown', { ips: shown.join(', ') })
        : t('finding.webrtcLocal.hidden'),
  };
}

// The visitor tells us whether a VPN is on, because strong VPNs leave no sign a site can see.
// Without a VPN, the address, its provider and its location are the visitor's own: LEAK.
// With a VPN we can't tell until the VPN-off recheck: a different address then means the VPN
// hid it (OK), the same one means it didn't (LEAK).
/**
 * Decide the connection findings.
 * `main` is the lookup on this page's origin; `v4`/`v6` the lookups on the single-family origins;
 * `usesVpn` the visitor's answer; `vpnOff` the result of the VPN-off recheck, if one ran.
 * @param {{main: Lookup, v4: Lookup, v6: Lookup, ice: Ice|null, usesVpn: boolean,
 *   vpnOff?: VpnOff|null, reveal?: boolean}} input
 * @param {T} t
 * @returns {Finding[]}
 */
export function judgeConnection({ main, v4, v6, ice, usesVpn, vpnOff = null, reveal = false }, t) {
  /** @param {string} ip */
  const show = (ip) => (reveal ? ip : maskIp(ip));
  const local = judgeLocal(ice, t);
  const who = primaryLookup(main, v4, v6);
  if (!who) {
    const all = [main, v4, v6];
    const key = all.includes('busy') ? 'busy' : all.includes('unavailable') ? 'unavailable' : 'failed';
    return [{ id: 'publicIp', verdict: 'unknown', value: t(`finding.publicIp.${key}`) }, local];
  }
  // Local testing: the other rows would judge an address that isn't the visitor's public one.
  if (isLocalIp(who.ip)) return [{ id: 'publicIp', verdict: 'unknown', value: t('finding.publicIp.local', { ip: show(who.ip) }) }, local];
  // Tor and iCloud Private Relay hide the real address on purpose, so these are OK whatever the answer.
  const hidden = who.tor || who.privateRelay;
  /** @type {import('./browser.js').Verdict} */
  const own = hidden ? 'ok'
    : !usesVpn || vpnOff === 'same' ? 'leak'
      : vpnOff === 'hidden' ? 'ok' : 'unknown';
  const ipKey = who.tor ? 'finding.publicIp.tor' : who.privateRelay ? 'finding.publicIp.relay' : 'finding.publicIp.value';
  const asn = who.asn === null ? null : `AS${who.asn}`;
  const provider = [who.asOrg, asn].filter((x) => x !== null).join(' · ');
  const place = [who.city, who.country].filter((x) => x !== null).join(', ');

  /** @type {Finding[]} */
  const out = [
    { id: 'publicIp', verdict: own, value: t(ipKey, { ip: show(who.ip) }) },
    { id: 'provider', verdict: own, value: provider || t('finding.unknown') },
    { id: 'location', verdict: own, value: place || t('finding.unknown') },
  ];
  // One VPN check per family that answered, only for visitors with a VPN: without one there is
  // nothing to leak past. 'seen' = srflx addresses from STUN; 'lookup' = what the website sees.
  // Different means WebRTC bypasses the VPN.
  const families = usesVpn ? /** @type {const} */ ([['vpn4', v4, ice?.v4], ['vpn6', v6, ice?.v6]]) : [];
  for (const [id, lookup, seen] of families) {
    // A local address (testing on this machine) can't be compared with a public STUN address.
    if (!isWhoami(lookup) || isLocalIp(lookup.ip)) continue;
    // Any interface showing another address is a leak, even if another one matches.
    const other = (seen ?? []).filter((ip) => !sameIp(ip, lookup.ip));
    if (other.length) out.push({ id, verdict: 'leak', value: t('finding.vpn.other', { ip: other.map(show).join(', ') }) });
    // IPv6 on another network than IPv4: an IPv4-only VPN leaves IPv6 outside the tunnel.
    else if (id === 'vpn6' && otherNetwork(v4, lookup)) {
      out.push({ id, verdict: 'leak', value: t('finding.vpn.otherNetwork', { v6: `AS${lookup.asn}`, v4: `AS${/** @type {Whoami} */ (v4).asn}` }) });
    // No STUN address of this family: we cannot compare, so CAN'T TELL.
    } else if (!seen?.length) out.push({ id, verdict: 'unknown', value: t('finding.vpn.none') });
    // The same address only proves WebRTC doesn't get around the VPN. A VPN that hides nothing
    // (or one that is off) gives a match too, so this follows the VPN-off comparison like the rows above.
    else {
      const verdict = lookup.tor || lookup.privateRelay ? 'ok' : vpnOff === 'hidden' ? 'ok' : vpnOff === 'same' ? 'leak' : 'unknown';
      out.push({ id, verdict, value: t('finding.vpn.same', { ip: show(lookup.ip) }) });
    }
  }
  out.push(local);
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
