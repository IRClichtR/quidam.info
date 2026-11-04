// @ts-check
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { loadStrings, t } from '../../public/js/i18n.js';
import {
  maskIp, judgeConnection, compareVpnOff, fetchWhoami, gatherIce, stunUrls, primaryLookup, isLocalIp,
  describeConnection, vpnChecks, judgeWebrtcLocal, placeName, providerName,
} from '../../public/js/connection.js';

/** @typedef {import('../../server/whoami.js').Whoami} Whoami */

/** @param {Partial<Whoami>} [over] @returns {Whoami} */
const who = (over = {}) => ({
  ip: '81.2.69.142', family: 4, country: 'GB', city: 'London', asn: 20712, asOrg: 'Andrews & Arnold Ltd',
  tor: false, privateRelay: false, ...over,
});
// Same network as the IPv4 lookup, as on a dual-stack line without a VPN.
const V6 = who({ ip: '2001:480:10::1', family: 6, country: 'US', city: 'San Diego' });

/** @param {Partial<import('../../public/js/connection.js').Ice>} [over] */
const ice = (over = {}) => ({ v4: [], v6: [], local: ['a1b2.local'], ...over });
/** @param {Partial<Parameters<typeof judgeConnection>[0]>} over */
const judge = (over) => judgeConnection({ main: who(), v4: who(), v6: V6, answer: 'yes', ...over }, t);
/** @param {Partial<Parameters<typeof vpnChecks>[0]>} over */
const checks = (over) => vpnChecks({ main: who(), v4: who(), v6: V6, ice: ice(), lang: 'en', ...over }, t);
/** @param {import('../../public/js/browser.js').Finding[]} fs @param {string} id */
const find = (fs, id) => fs.find((f) => f.id === id);
const IDS = ['publicIp', 'provider', 'location'];

beforeAll(async () => { await loadStrings('en'); });

describe('maskIp', () => {
  it('hides the last IPv4 byte', () => expect(maskIp('203.0.113.42')).toBe('203.0.113.•••'));
  it('keeps the first four IPv6 groups', () => {
    expect(maskIp('2001:db8:1:2::9')).toBe('2001:db8:1:2:•••');
    expect(maskIp('2001:480:10::1')).toBe('2001:480:10:0:•••');
  });
});

describe('judgeConnection', () => {
  it('gives the public IP, provider and location, in order, and nothing about WebRTC', () => {
    expect(judge({}).map((f) => f.id)).toEqual(IDS);
  });

  it('"yes" and "I\'m not sure" read LEAK', () => {
    for (const answer of /** @type {const} */ (['yes', 'unsure'])) {
      const fs = judge({ answer });
      for (const id of IDS) expect(find(fs, id)?.verdict, `${answer} ${id}`).toBe('leak');
    }
    expect(find(judge({}), 'location')?.value).toBe('London, GB');
    expect(find(judge({}), 'provider')?.value).toBe('Andrews & Arnold Ltd · AS20712');
  });

  it('before an answer the rows read CAN\'T TELL, so they are not counted', () => {
    for (const id of IDS) expect(find(judge({ answer: null }), id)?.verdict).toBe('unknown');
  });

  it('"that\'s my VPN" reads OK, unless the double-check saw the same address', () => {
    for (const vpnOff of /** @type {const} */ ([null, 'hidden', 'otherFamily'])) {
      for (const id of IDS) expect(find(judge({ answer: 'vpn', vpnOff }), id)?.verdict, `${vpnOff}`).toBe('ok');
    }
    for (const id of IDS) expect(find(judge({ answer: 'vpn', vpnOff: 'same' }), id)?.verdict).toBe('leak');
  });

  it('Tor and iCloud Private Relay read OK whatever the answer, even none', () => {
    for (const over of [{ tor: true }, { privateRelay: true }]) {
      for (const answer of /** @type {const} */ ([null, 'yes'])) {
        const fs = judge({ main: who(over), answer });
        for (const id of IDS) expect(find(fs, id)?.verdict).toBe('ok');
      }
    }
    expect(find(judge({ main: who({ tor: true }) }), 'publicIp')?.value).toBe('81.2.69.••• · Tor exit');
  });

  it('masks the address unless reveal is pressed', () => {
    expect(find(judge({}), 'publicIp')?.value).toBe('81.2.69.•••');
    expect(find(judge({ reveal: true }), 'publicIp')?.value).toBe('81.2.69.142');
  });

  it('says why when there is no address', () => {
    expect(judge({ main: 'busy', v4: null, v6: null })).toEqual([{ id: 'publicIp', verdict: 'unknown', value: t('finding.publicIp.busy') }]);
    expect(judge({ main: 'unavailable', v4: null, v6: null })[0].value).toBe(t('finding.publicIp.unavailable'));
    expect(judge({ main: null, v4: null, v6: null })[0].value).toBe(t('finding.publicIp.failed'));
  });

  it('falls back to a family lookup when the main one failed', () => {
    const fs = judge({ main: null, v4: null });
    expect(find(fs, 'publicIp')?.value).toContain('2001:480:10:0:•••');
    expect(find(fs, 'location')?.value).toBe('San Diego, US');
  });
});

describe('describeConnection', () => {
  it('names the kind of address', () => {
    expect(describeConnection(who(), null, null).kind).toBe('public');
    expect(describeConnection(who({ tor: true }), null, null).kind).toBe('tor');
    expect(describeConnection(who({ privateRelay: true }), null, null).kind).toBe('relay');
    expect(describeConnection(who({ ip: '127.0.0.1' }), null, null).kind).toBe('local');
    expect(describeConnection('busy', null, null)).toEqual({ kind: 'busy', who: null });
  });
});

describe('providerName and placeName', () => {
  it('prefer the name, then the number', () => {
    expect(providerName(who())).toBe('Andrews & Arnold Ltd');
    expect(providerName(who({ asOrg: null }))).toBe('AS20712');
    expect(providerName(who({ asOrg: null, asn: null }))).toBeNull();
  });
  it('write the country in the page language', () => {
    expect(placeName(who(), 'en')).toBe('London, United Kingdom');
    expect(placeName(who(), 'fr')).toBe('London, Royaume-Uni');
    expect(placeName(who({ city: null }), 'es')).toBe('Reino Unido');
    expect(placeName(who({ city: null, country: null }), 'en')).toBeNull();
  });
});

describe('vpnChecks', () => {
  /** @param {ReturnType<typeof checks>} rows @param {string} id */
  const row = (rows, id) => /** @type {import('../../public/js/connection.js').VpnCheck} */ (rows.find((r) => r.id === id));

  it('always gives exactly three rows, in order', () => {
    expect(checks({}).map((r) => r.id)).toEqual(['vpnHide', 'vpnWebrtc', 'vpnIpv6']);
  });

  it('row 1 takes the visitor\'s word unless the double-check saw the same address', () => {
    expect(row(checks({}), 'vpnHide')).toMatchObject({ verdict: 'ok', answer: 'yes: sites see Andrews & Arnold Ltd in London, United Kingdom, not you', fix: null });
    expect(row(checks({ vpnOff: 'hidden' }), 'vpnHide').verdict).toBe('ok');
    const same = row(checks({ vpnOff: 'same' }), 'vpnHide');
    expect(same.verdict).toBe('leak');
    expect(same.fix).toMatch(/^basic fix:/);
  });

  it('row 2 is LEAK when WebRTC shows another address than the site sees, in either family', () => {
    const v4 = row(checks({ ice: ice({ v4: ['198.51.100.7'] }) }), 'vpnWebrtc');
    expect(v4.verdict).toBe('leak');
    expect(v4.answer).toBe('yes: they show another address, 198.51.100.•••');
    expect(v4.fix).toMatch(/own app/);
    expect(row(checks({ ice: ice({ v6: ['2001:db8::9'] }) }), 'vpnWebrtc').verdict).toBe('leak');
    // One matching interface does not hide another that differs.
    expect(row(checks({ ice: ice({ v4: ['81.2.69.142', '198.51.100.7'] }) }), 'vpnWebrtc').verdict).toBe('leak');
  });

  it('row 2 is OK when every WebRTC address matches, or WebRTC is off', () => {
    expect(row(checks({ ice: ice({ v4: ['81.2.69.142'], v6: ['2001:0480:0010::1'] }) }), 'vpnWebrtc').verdict).toBe('ok');
    expect(row(checks({ ice: null }), 'vpnWebrtc')).toMatchObject({ verdict: 'ok', answer: t('vpn.webrtc.off') });
  });

  it('row 2 says CAN\'T TELL only when nothing could be compared, never because of the VPN', () => {
    expect(row(checks({ ice: ice() }), 'vpnWebrtc').verdict).toBe('unknown');
    // A family whose lookup is local (testing on this machine) is not compared.
    expect(row(checks({ v4: who({ ip: '127.0.0.1' }), v6: null, ice: ice({ v4: ['81.2.69.142'] }) }), 'vpnWebrtc').verdict).toBe('unknown');
  });

  it('row 3 is LEAK when IPv6 goes through another network than IPv4, and names it', () => {
    const r = row(checks({ main: who({ asn: 9009, asOrg: 'M247' }), v4: who({ asn: 9009, asOrg: 'M247' }), v6: { ...V6, asn: 12322, asOrg: 'Free SAS' } }), 'vpnIpv6');
    expect(r).toMatchObject({ verdict: 'leak', answer: 'no: newer-style addresses (IPv6) go around it, through Free SAS' });
    expect(r.fix).toMatch(/IPv6 leak protection/);
    // When the site saw IPv6 (the tunnel), it is IPv4 that goes around.
    const v6main = row(checks({ main: { ...V6, asn: 9009 }, v4: who({ asn: 12322, asOrg: 'Free SAS' }), v6: { ...V6, asn: 9009 } }), 'vpnIpv6');
    expect(v6main.answer).toBe('no: older-style addresses (IPv4) go around it, through Free SAS');
  });

  it('row 3 is OK with no IPv6, IPv6 only, or one network; CAN\'T TELL when a network is unknown', () => {
    expect(row(checks({ v6: null }), 'vpnIpv6')).toMatchObject({ verdict: 'ok', answer: t('vpn.ipv6.none') });
    expect(row(checks({ v4: null }), 'vpnIpv6')).toMatchObject({ verdict: 'ok', answer: t('vpn.ipv6.only') });
    expect(row(checks({}), 'vpnIpv6')).toMatchObject({ verdict: 'ok', answer: t('vpn.ipv6.same') });
    expect(row(checks({ v6: { ...V6, asn: null } }), 'vpnIpv6').verdict).toBe('unknown');
    expect(row(checks({ v6: 'busy' }), 'vpnIpv6').verdict).toBe('unknown');
  });
});

describe('judgeWebrtcLocal', () => {
  it('a .local name hides the address: OK', () => {
    expect(judgeWebrtcLocal(ice(), t)).toEqual({ id: 'webrtcLocal', verdict: 'ok', value: t('finding.webrtcLocal.hidden') });
  });
  it('a real local address leaks', () => {
    expect(judgeWebrtcLocal(ice({ local: ['192.168.1.20', 'x.local'] }), t)).toEqual({ id: 'webrtcLocal', verdict: 'leak', value: 'shown: 192.168.1.20' });
  });
  it('WebRTC off: OK', () => {
    expect(judgeWebrtcLocal(null, t)).toMatchObject({ verdict: 'ok', value: t('finding.webrtcLocal.off') });
  });
});

describe('isLocalIp', () => {
  it('is true for loopback, private, link-local and carrier-grade NAT addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.20', '169.254.3.4', '100.64.0.1', '100.127.255.255',
      '::1', 'fd12:3456::1', 'fc00::1', 'fe80::1', 'FE80::abcd', '::', '0.0.0.0', '::ffff:127.0.0.1', '::FFFF:192.168.1.5'])
      expect(isLocalIp(ip), ip).toBe(true);
  });
  it('is false for public addresses', () => {
    for (const ip of ['81.2.69.142', '172.32.0.1', '172.15.0.1', '100.128.0.1', '192.169.0.1', '2001:480:10::1', '2a00::1', '::ffff:81.2.69.142'])
      expect(isLocalIp(ip), ip).toBe(false);
  });
});

describe('judgeConnection on this machine or a local network', () => {
  const loop = who({ ip: '::1', family: 6, country: null, city: null, asn: null, asOrg: null });
  it('shows one CAN\'T TELL row explaining the address, whatever the answer', () => {
    for (const answer of /** @type {const} */ (['yes', 'vpn', null])) {
      const fs = judge({ main: loop, v4: who({ ip: '127.0.0.1', country: null, city: null, asn: null, asOrg: null }), v6: loop, answer, reveal: true });
      expect(fs.map((f) => f.id)).toEqual(['publicIp']);
      expect(fs[0].verdict).toBe('unknown');
      expect(fs[0].value).toBe("::1 · this machine or your local network: quidam can't see your public address from here");
    }
  });
  it('a public family lookup wins over a local main lookup', () => {
    expect(find(judge({ main: loop, v4: who() }), 'publicIp')?.value).toContain('81.2.69.•••');
  });
  it('masks the address unless reveal is pressed', () => {
    expect(judge({ main: who({ ip: '192.168.1.20' }), v4: null, v6: null })[0].value).toContain('192.168.1.•••');
  });
});

describe('compareVpnOff', () => {
  const a = { ip: '1.1.1.1', family: /** @type {4} */ (4) };
  it('different addresses mean the VPN hides the IP', () => expect(compareVpnOff(a, { ip: '2.2.2.2', family: 4 })).toBe('hidden'));
  it('the same address means it does not', () => expect(compareVpnOff(a, { ...a })).toBe('same'));
  it('the same IPv6 address written differently is the same', () => {
    expect(compareVpnOff({ ip: '2001:db8::5', family: 6 }, { ip: '2001:DB8:0::5', family: 6 })).toBe('same');
  });
  it('addresses of different families cannot be compared', () => {
    expect(compareVpnOff(a, { ip: '2001:db8::5', family: 6 })).toBe('otherFamily');
  });
  it('says so in plain words', () => {
    expect(t('vpn.cmp.otherFamily')).toBe("can't compare: the two addresses are of different types");
  });
});

describe('primaryLookup', () => {
  it('is the main lookup, else IPv4, else IPv6, else null', () => {
    expect(primaryLookup(who({ ip: '9.9.9.9' }), who(), V6)?.ip).toBe('9.9.9.9');
    expect(primaryLookup('unavailable', who(), V6)?.ip).toBe('81.2.69.142');
    expect(primaryLookup(null, null, V6)?.ip).toBe('2001:480:10::1');
    expect(primaryLookup(null, 'unavailable', null)).toBeNull();
  });
});

describe('stunUrls', () => {
  it('points only at our own hostnames', () => {
    expect(stunUrls({ v4: 'http://127.0.0.1:8080', v6: 'http://ip6-localhost:8080', stunPort: 3478 }))
      .toEqual(['stun:127.0.0.1:3478', 'stun:ip6-localhost:3478']);
    expect(stunUrls({ v4: 'https://v4.example.org', v6: 'https://v6.example.org', stunPort: 3478 }))
      .toEqual(['stun:v4.example.org:3478', 'stun:v6.example.org:3478']);
  });
});

describe('fetchWhoami', () => {
  /** @param {number} status @param {unknown} body */
  const reply = (status, body) => async () => new Response(JSON.stringify(body), { status });

  it('returns the lookup and calls the origin\'s /api/whoami without credentials', async () => {
    /** @type {any[]} */
    const calls = [];
    /** @type {typeof fetch} */
    const fake = async (url, init) => { calls.push([url, init]); return new Response(JSON.stringify(who()), { status: 200 }); };
    expect(await fetchWhoami('http://127.0.0.1:8080', fake)).toEqual(who());
    expect(calls[0][0]).toBe('http://127.0.0.1:8080/api/whoami');
    expect(calls[0][1]).toMatchObject({ credentials: 'omit', cache: 'no-store' });
    await fetchWhoami('', fake);
    expect(calls[1][0]).toBe('/api/whoami');
  });
  it('returns "unavailable" on 503', async () => {
    expect(await fetchWhoami('', reply(503, { error: 'data-unavailable' }))).toBe('unavailable');
  });
  it('returns "busy" on 429', async () => {
    expect(await fetchWhoami('', reply(429, { error: 'rate-limited' }))).toBe('busy');
  });
  it('returns null on other errors, a bad body, a network error or a timeout', async () => {
    expect(await fetchWhoami('', reply(500, { error: 'internal' }))).toBeNull();
    expect(await fetchWhoami('', reply(200, { nope: 1 }))).toBeNull();
    expect(await fetchWhoami('', async () => { throw new TypeError('Failed to fetch'); })).toBeNull();
    const started = Date.now();
    expect(await fetchWhoami('', () => new Promise(() => {}), 50)).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('gatherIce', () => {
  const g = /** @type {any} */ (globalThis);
  afterEach(() => { delete g.RTCPeerConnection; });

  it('returns null when RTCPeerConnection is missing', async () => {
    expect(await gatherIce(['stun:127.0.0.1:3478'])).toBeNull();
  });

  /** @param {{candidate: any}[]} events @param {{complete?: boolean}} [opts] */
  function fakePc(events, opts = {}) {
    const log = { config: /** @type {any} */ (null), closed: false, channel: '' };
    g.RTCPeerConnection = class {
      /** @param {any} config */
      constructor(config) { log.config = config; this.iceGatheringState = 'new'; /** @type {any} */ this.onicecandidate = null; /** @type {any} */ this.onicegatheringstatechange = null; }
      /** @param {string} name */
      createDataChannel(name) { log.channel = name; }
      async createOffer() { return { type: 'offer', sdp: '' }; }
      async setLocalDescription() {
        setTimeout(() => {
          for (const e of events) this.onicecandidate?.(e);
          if (opts.complete !== false) {
            this.iceGatheringState = 'complete';
            this.onicegatheringstatechange?.();
          }
        }, 0);
      }
      close() { log.closed = true; }
    };
    return log;
  }

  it('collects srflx addresses split by family and local (host) addresses, with only the given STUN servers', async () => {
    const log = fakePc([
      { candidate: { type: 'host', address: '192.168.1.20', candidate: 'candidate:1 1 udp 1 192.168.1.20 5000 typ host' } },
      { candidate: { type: 'srflx', address: '203.0.113.42', candidate: 'candidate:2 1 udp 1 203.0.113.42 6000 typ srflx raddr 0.0.0.0 rport 0' } },
      { candidate: { candidate: 'candidate:3 1 udp 1 2001:db8::5 6001 typ srflx raddr :: rport 0' } },
      { candidate: { candidate: 'candidate:4 1 udp 1 a1b2.local 5001 typ host' } },
      { candidate: null },
    ]);
    const urls = ['stun:127.0.0.1:3478', 'stun:ip6-localhost:3478'];
    expect(await gatherIce(urls)).toEqual({ v4: ['203.0.113.42'], v6: ['2001:db8::5'], local: ['192.168.1.20', 'a1b2.local'] });
    expect(log.config).toEqual({ iceServers: [{ urls }] });
    expect(log.channel).not.toBe('');
    expect(log.closed).toBe(true);
  });

  it('drops the brackets Chromium puts around IPv6 addresses', async () => {
    fakePc([{ candidate: { type: 'srflx', address: '[2001:db8::5]', candidate: 'candidate:3 1 udp 1 2001:db8::5 6001 typ srflx raddr :: rport 0' } }]);
    expect(await gatherIce(['stun:ip6-localhost:3478'])).toEqual({ v4: [], v6: ['2001:db8::5'], local: [] });
  });

  it('with no STUN server, asks no server and still lists local addresses', async () => {
    const log = fakePc([{ candidate: { type: 'host', address: '10.0.0.5', candidate: 'candidate:1 1 udp 1 10.0.0.5 5000 typ host' } }, { candidate: null }]);
    expect(await gatherIce([])).toEqual({ v4: [], v6: [], local: ['10.0.0.5'] });
    expect(log.config).toEqual({ iceServers: [] });
  });

  it('stops at the timeout and still closes the connection', async () => {
    const log = fakePc([], { complete: false });
    const started = Date.now();
    expect(await gatherIce(['stun:127.0.0.1:3478'], 50)).toEqual({ v4: [], v6: [], local: [] });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(log.closed).toBe(true);
  });

  it('returns null when the connection cannot be created', async () => {
    g.RTCPeerConnection = class { constructor() { throw new Error('blocked'); } };
    expect(await gatherIce(['stun:127.0.0.1:3478'])).toBeNull();
  });
});
