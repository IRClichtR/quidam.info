// @ts-check
// Connection findings. Every request goes to ombre's own server, and only after a click.

// What we ask the network about you: your public IP (the address websites see), whose network it
// belongs to, whether a VPN really hides it, and which local addresses WebRTC shares. Every request
// goes to ombre's own server and STUN server, and only after a click. Nothing is stored (see state.js).
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
      pc.createDataChannel('ombre');
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => resolve(undefined));
    });
  } finally {
    clearTimeout(timer);
    pc.close();
  }
  return found;
}

// Chrome and Safari hide your real local address behind a random '.local' name (mDNS).
// Those names reveal nothing. Any other address is a real local IP, so it leaks.
// This row lives in the local network section: it is about the home network, not what sites see.
/**
 * The local IP finding: what WebRTC shares about this device on its own network.
 * @param {Ice|null} ice
 * @param {T} t
 * @returns {Finding}
 */
export function judgeWebrtcLocal(ice, t) {
  const shown = (ice?.local ?? []).filter((a) => !a.endsWith('.local'));
  return {
    id: 'webrtcLocal',
    verdict: shown.length ? 'leak' : 'ok',
    value: ice === null ? t('finding.webrtcLocal.off')
      : shown.length ? t('finding.webrtcLocal.shown', { ips: shown.join(', ') })
        : t('finding.webrtcLocal.hidden'),
  };
}

/**
 * What the lookups say about the connection, before the visitor answers "is this you?".
 * 'tor' and 'relay' hide the address on purpose; 'local' means testing on this machine or network;
 * the other non-public kinds are why no address came back.
 * @param {Lookup} main @param {Lookup} v4 @param {Lookup} v6
 * @returns {{kind: 'public'|'tor'|'relay'|'local', who: Whoami}|{kind: 'busy'|'unavailable'|'failed', who: null}}
 */
export function describeConnection(main, v4, v6) {
  const who = primaryLookup(main, v4, v6);
  if (!who) {
    const all = [main, v4, v6];
    return { kind: all.includes('busy') ? 'busy' : all.includes('unavailable') ? 'unavailable' : 'failed', who: null };
  }
  if (isLocalIp(who.ip)) return { kind: 'local', who };
  return { kind: who.tor ? 'tor' : who.privateRelay ? 'relay' : 'public', who };
}

/** The network's name, else its number, else null. @param {Whoami} who */
export function providerName(who) {
  return who.asOrg ?? (who.asn === null ? null : `AS${who.asn}`);
}

// The database gives a country code ('FR'); Intl.DisplayNames turns it into the visitor's language.
/**
 * "City, Country" in the page language, or whichever part is known, or null.
 * @param {Whoami} who
 * @param {string} lang
 */
export function placeName(who, lang) {
  /** @type {string|null} */
  let country = who.country;
  try {
    if (country) country = new Intl.DisplayNames([lang], { type: 'region' }).of(country) ?? country;
  } catch {
    // an unknown code stays as it is
  }
  return [who.city, country].filter((x) => x !== null).join(', ') || null;
}

/** @typedef {'yes'|'vpn'|'unsure'} Answer */

// Strong VPNs leave no sign a site can see, so the visitor tells us whether the address is theirs.
// Until they answer, the rows read CAN'T TELL and are not counted. Tor and iCloud Private Relay
// are recognised from public lists, so they are OK without asking.
/**
 * The connection findings: public IP, provider and location.
 * `answer` is the visitor's reply to "is this you?" (null before they reply);
 * `vpnOff` the result of the optional double-check with the VPN off, if it ran.
 * @param {{main: Lookup, v4: Lookup, v6: Lookup, answer: Answer|null, vpnOff?: VpnOff|null, reveal?: boolean}} input
 * @param {T} t
 * @returns {Finding[]}
 */
export function judgeConnection({ main, v4, v6, answer, vpnOff = null, reveal = false }, t) {
  /** @param {string} ip */
  const show = (ip) => (reveal ? ip : maskIp(ip));
  const { kind, who } = describeConnection(main, v4, v6);
  if (!who) return [{ id: 'publicIp', verdict: 'unknown', value: t(`finding.publicIp.${kind}`) }];
  // Local testing: the other rows would judge an address that isn't the visitor's public one.
  if (kind === 'local') return [{ id: 'publicIp', verdict: 'unknown', value: t('finding.publicIp.local', { ip: show(who.ip) }) }];
  /** @type {import('./browser.js').Verdict} */
  const own = kind !== 'public' ? 'ok'
    : answer === null ? 'unknown'
      // "That's my VPN" is believed, unless the double-check saw the same address without it.
      : answer === 'vpn' ? (vpnOff === 'same' ? 'leak' : 'ok')
        : 'leak';
  const ipKey = kind === 'tor' ? 'finding.publicIp.tor' : kind === 'relay' ? 'finding.publicIp.relay' : 'finding.publicIp.value';
  const asn = who.asn === null ? null : `AS${who.asn}`;
  const provider = [who.asOrg, asn].filter((x) => x !== null).join(' · ');
  const place = [who.city, who.country].filter((x) => x !== null).join(', ');
  return [
    { id: 'publicIp', verdict: own, value: t(ipKey, { ip: show(who.ip) }) },
    { id: 'provider', verdict: own, value: provider || t('finding.unknown') },
    { id: 'location', verdict: own, value: place || t('finding.unknown') },
  ];
}

/** @typedef {'vpnHide'|'vpnWebrtc'|'vpnIpv6'} VpnCheckId */
/**
 * One row of "your VPN, checked": `answer` is the plain-words reply, `fix` the basic fix for a leak.
 * @typedef {{id: VpnCheckId, verdict: import('./browser.js').Verdict, answer: string, fix: string|null}} VpnCheck
 */

// The three things that usually go wrong with a VPN, answered from the lookups we already have.
// 1. The address: we take the visitor's word, unless the double-check with the VPN off saw the same one.
// 2. WebRTC: ICE candidates of type 'srflx' are the public addresses our STUN server saw. WebRTC can
//    bypass a VPN's tunnel, so an srflx address other than the one the site sees is a leak.
// 3. IPv6: some VPNs only tunnel IPv4. Then one family exits through another network (ASN) than the other.
/**
 * The three VPN checks, shown after the visitor says the address is their VPN's.
 * @param {{main: Lookup, v4: Lookup, v6: Lookup, ice: Ice|null, vpnOff?: VpnOff|null, lang: string, reveal?: boolean}} input
 * @param {T} t
 * @returns {VpnCheck[]}
 */
export function vpnChecks({ main, v4, v6, ice, vpnOff = null, lang, reveal = false }, t) {
  /** @param {string} ip */
  const show = (ip) => (reveal ? ip : maskIp(ip));
  const who = primaryLookup(main, v4, v6);
  const seen = who ? { provider: providerName(who) ?? t('finding.unknown'), place: placeName(who, lang) ?? t('finding.unknown') } : null;

  /** @type {VpnCheck} */
  const hide = vpnOff === 'same' ? { id: 'vpnHide', verdict: 'leak', answer: t('vpn.hide.same'), fix: t('vpn.hide.fix') }
    : vpnOff === 'hidden' ? { id: 'vpnHide', verdict: 'ok', answer: t('vpn.hide.checked'), fix: null }
      : { id: 'vpnHide', verdict: 'ok', answer: t('vpn.hide.said', seen ?? {}), fix: null };

  /** @type {VpnCheck} */
  let webrtc;
  if (ice === null) {
    // WebRTC missing or blocked: video-call features can't open a path around the VPN.
    webrtc = { id: 'vpnWebrtc', verdict: 'ok', answer: t('vpn.webrtc.off'), fix: null };
  } else {
    let compared = false;
    /** @type {string[]} */
    const other = [];
    for (const [lookup, found] of /** @type {const} */ ([[v4, ice.v4], [v6, ice.v6]])) {
      // A local address (testing on this machine) can't be compared with a public STUN address.
      if (!isWhoami(lookup) || isLocalIp(lookup.ip) || !found.length) continue;
      compared = true;
      // Any interface showing another address is a leak, even if another one matches.
      other.push(...found.filter((ip) => !sameIp(ip, lookup.ip)));
    }
    webrtc = other.length ? { id: 'vpnWebrtc', verdict: 'leak', answer: t('vpn.webrtc.other', { ip: other.map(show).join(', ') }), fix: t('vpn.webrtc.fix') }
      : compared ? { id: 'vpnWebrtc', verdict: 'ok', answer: t('vpn.webrtc.same'), fix: null }
        // No STUN answer of either family: nothing to compare, and we won't guess.
        : { id: 'vpnWebrtc', verdict: 'unknown', answer: t('vpn.webrtc.none'), fix: null };
  }

  /** @type {VpnCheck} */
  let ipv6;
  if (!isWhoami(v6) || isLocalIp(v6.ip)) {
    // 'busy' or 'unavailable' mean the server couldn't say; null means no IPv6 route at all.
    ipv6 = v6 === 'busy' || v6 === 'unavailable' ? { id: 'vpnIpv6', verdict: 'unknown', answer: t('vpn.ipv6.unknown'), fix: null }
      : { id: 'vpnIpv6', verdict: 'ok', answer: t('vpn.ipv6.none'), fix: null };
  } else if (!isWhoami(v4) || isLocalIp(v4.ip)) {
    ipv6 = { id: 'vpnIpv6', verdict: 'ok', answer: t('vpn.ipv6.only'), fix: null };
  } else if (v4.asn === null || v6.asn === null) {
    ipv6 = { id: 'vpnIpv6', verdict: 'unknown', answer: t('vpn.ipv6.unknown'), fix: null };
  } else if (v4.asn !== v6.asn) {
    // The family on another network than the one the site saw is the one going around the VPN.
    const around = who && who.family === 6 ? v4 : v6;
    ipv6 = {
      id: 'vpnIpv6', verdict: 'leak',
      answer: t(around === v6 ? 'vpn.ipv6.other6' : 'vpn.ipv6.other4', { provider: providerName(around) ?? t('finding.unknown') }),
      fix: t('vpn.ipv6.fix'),
    };
  } else {
    ipv6 = { id: 'vpnIpv6', verdict: 'ok', answer: t('vpn.ipv6.same'), fix: null };
  }
  return [hide, webrtc, ipv6];
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
