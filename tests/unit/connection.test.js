// @ts-check
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { loadStrings, t } from '../../public/js/i18n.js';
import {
  maskIp, judgeConnection, compareVpnOff, fetchWhoami, gatherIce, stunUrls, primaryLookup, isLocalIp,
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
const judge = (over) => judgeConnection({
  main: who(), v4: who(), v6: V6, ice: ice(), usesVpn: true, ...over,
}, t);
/** @param {import('../../public/js/browser.js').Finding[]} fs @param {string} id */
const find = (fs, id) => fs.find((f) => f.id === id);

beforeAll(async () => { await loadStrings('en'); });

describe('maskIp', () => {
  it('hides the last IPv4 byte', () => expect(maskIp('203.0.113.42')).toBe('203.0.113.•••'));
  it('keeps the first four IPv6 groups', () => {
    expect(maskIp('2001:db8:1:2::9')).toBe('2001:db8:1:2:•••');
    expect(maskIp('2001:480:10::1')).toBe('2001:480:10:0:•••');
  });
});

describe('judgeConnection', () => {
  it('with a VPN: identity rows, both VPN checks, then the local IP, in order', () => {
    expect(judge({}).map((f) => f.id)).toEqual(['publicIp', 'provider', 'location', 'vpn4', 'vpn6', 'webrtcLocal']);
  });

  it('without a VPN: no VPN check rows', () => {
    expect(judge({ usesVpn: false }).map((f) => f.id)).toEqual(['publicIp', 'provider', 'location', 'webrtcLocal']);
  });

  it('without a VPN: public IP, provider and location read LEAK', () => {
    const fs = judge({ usesVpn: false });
    for (const id of ['publicIp', 'provider', 'location']) expect(find(fs, id)?.verdict).toBe('leak');
    expect(find(fs, 'location')?.value).toBe('London, GB');
    expect(find(fs, 'provider')?.value).toBe('Andrews & Arnold Ltd · AS20712');
  });

  it('with a VPN: identity rows read CAN\'T TELL until the VPN-off comparison', () => {
    const fs = judge({});
    for (const id of ['publicIp', 'provider', 'location']) expect(find(fs, id)?.verdict).toBe('unknown');
    const other = judge({ vpnOff: 'otherFamily' });
    for (const id of ['publicIp', 'provider', 'location']) expect(find(other, id)?.verdict).toBe('unknown');
  });

  it('with a VPN: a changed address once the VPN is off reads OK, the same address LEAK', () => {
    const hidden = judge({ vpnOff: 'hidden' });
    const same = judge({ vpnOff: 'same' });
    for (const id of ['publicIp', 'provider', 'location']) {
      expect(find(hidden, id)?.verdict).toBe('ok');
      expect(find(same, id)?.verdict).toBe('leak');
    }
  });

  it('without a VPN, an old VPN-off comparison is ignored', () => {
    expect(find(judge({ usesVpn: false, vpnOff: 'hidden' }), 'publicIp')?.verdict).toBe('leak');
  });

  it('Tor and Private Relay read OK whatever the answer', () => {
    for (const usesVpn of [true, false]) {
      for (const flag of [{ tor: true }, { privateRelay: true }]) {
        const fs = judge({ usesVpn, main: who(flag) });
        for (const id of ['publicIp', 'provider', 'location']) expect(find(fs, id)?.verdict).toBe('ok');
      }
    }
  });

  it('public IP is masked', () => {
    const p = find(judge({}), 'publicIp');
    expect(p?.value).toContain('81.2.69.•••');
    expect(p?.value).not.toContain('142');
  });

  it('reveal shows the full addresses', () => {
    const fs = judge({ ice: ice({ v4: ['81.2.69.142'] }), reveal: true });
    expect(find(fs, 'publicIp')?.value).toContain('81.2.69.142');
    expect(find(fs, 'vpn4')?.value).toContain('81.2.69.142');
  });

  it('local IP: OK when hidden behind .local names, none, or WebRTC off; LEAK when a real address shows', () => {
    expect(find(judge({ ice: ice({ local: ['a1b2.local'] }) }), 'webrtcLocal')).toMatchObject({ verdict: 'ok', value: 'hidden behind a .local name' });
    expect(find(judge({ ice: ice({ local: [] }) }), 'webrtcLocal')?.verdict).toBe('ok');
    expect(find(judge({ ice: null }), 'webrtcLocal')).toMatchObject({ verdict: 'ok', value: 'WebRTC off' });
    const shown = find(judge({ ice: ice({ local: ['a1b2.local', '192.168.1.23'] }) }), 'webrtcLocal');
    expect(shown).toMatchObject({ verdict: 'leak', value: 'shown: 192.168.1.23' });
  });

  it('local IP is judged even when the server did not answer', () => {
    const fs = judge({ main: null, v4: null, v6: null, ice: ice({ local: ['10.0.0.5'] }) });
    expect(fs.map((f) => f.id)).toEqual(['publicIp', 'webrtcLocal']);
    expect(find(fs, 'webrtcLocal')?.verdict).toBe('leak');
  });

  it('no connection text mentions the removed time-zone test, in any language', async () => {
    for (const [lang, word] of [['en', /time zone/i], ['fr', /fuseau/i], ['es', /zona horaria/i]]) {
      const strings = (await import(`../../public/js/i18n/${lang}.js`)).default;
      for (const key of ['finding.publicIp.fix', 'finding.provider.why', 'finding.provider.fix', 'finding.location.why', 'finding.location.fix']) {
        expect(strings[key], `${lang} ${key}`).not.toMatch(word);
      }
    }
  });

  it('vpn: LEAK when WebRTC shows another address of the same family', () => {
    const fs = judge({ v4: who({ ip: '198.51.100.7' }), ice: ice({ v4: ['203.0.113.42'], v6: [] }) });
    expect(find(fs, 'vpn4')?.verdict).toBe('leak');
    expect(find(fs, 'vpn4')?.value).toContain('203.0.113.•••');
  });

  it('vpn: LEAK when one interface matches and another shows a different address', () => {
    const fs = judge({ ice: ice({ v4: ['81.2.69.142', '203.0.113.42'], v6: [] }) });
    expect(find(fs, 'vpn4')?.verdict).toBe('leak');
    expect(find(fs, 'vpn4')?.value).toContain('203.0.113.•••');
  });

  it('vpn: the same address in WebRTC follows the VPN-off comparison: CAN\'T TELL, then OK or LEAK', () => {
    const same = ice({ v4: ['81.2.69.142'], v6: ['2001:480:10::1'] });
    for (const [vpnOff, verdict] of /** @type {const} */ ([[null, 'unknown'], ['otherFamily', 'unknown'], ['hidden', 'ok'], ['same', 'leak']])) {
      const fs = judge({ ice: same, vpnOff });
      expect(find(fs, 'vpn4')?.verdict, String(vpnOff)).toBe(verdict);
      expect(find(fs, 'vpn6')?.verdict, String(vpnOff)).toBe(verdict);
    }
    expect(find(judge({ ice: same }), 'vpn4')?.value).toBe('WebRTC shows the same address, 81.2.69.•••');
  });

  it('vpn: the same address on Tor or Private Relay is OK without a comparison', () => {
    const same = ice({ v4: ['81.2.69.142'] });
    expect(find(judge({ v4: who({ tor: true }), ice: same }), 'vpn4')?.verdict).toBe('ok');
    expect(find(judge({ v4: who({ privateRelay: true }), ice: same }), 'vpn4')?.verdict).toBe('ok');
  });

  it('vpn: another address in WebRTC is LEAK whatever the comparison says', () => {
    expect(find(judge({ ice: ice({ v4: ['203.0.113.42'] }), vpnOff: 'hidden' }), 'vpn4')?.verdict).toBe('leak');
  });

  it('vpn: IPv6 written differently is still the same address', () => {
    const fs = judge({ vpnOff: 'hidden', v6: who({ ip: '2001:db8::5', family: 6 }), ice: ice({ v4: [], v6: ['2001:0DB8:0:0::5'] }) });
    expect(find(fs, 'vpn6')?.verdict).toBe('ok');
  });

  it('vpn: "no leak observable" when no srflx came back, or WebRTC is missing', () => {
    for (const i of [ice(), null]) {
      const fs = judge({ ice: i });
      for (const id of ['vpn4', 'vpn6']) {
        expect(find(fs, id)).toMatchObject({ verdict: 'unknown', value: 'no leak observable' });
      }
    }
  });

  it('vpn: a family whose lookup failed is left out', () => {
    expect(find(judge({ v6: null }), 'vpn6')).toBeUndefined();
    expect(find(judge({ v6: null }), 'vpn4')).toBeDefined();
    expect(find(judge({ v4: null, ice: ice({ v4: ['203.0.113.42'], v6: [] }) }), 'vpn4')).toBeUndefined();
    expect(find(judge({ v6: 'unavailable' }), 'vpn6')).toBeUndefined();
  });

  it('vpn6: LEAK when the IPv6 address is on another network than the IPv4 one (IPv4-only VPN)', () => {
    const fs = judge({ vpnOff: 'hidden', v6: who({ ...V6, asn: 668 }), ice: ice({ v4: ['81.2.69.142'], v6: ['2001:480:10::1'] }) });
    expect(find(fs, 'vpn6')).toMatchObject({ verdict: 'leak', value: 'IPv6 from a different network than IPv4 (AS668 vs AS20712)' });
    expect(find(fs, 'vpn4')?.verdict).toBe('ok');
    // Without WebRTC the network rule still applies.
    expect(find(judge({ v6: who({ ...V6, asn: 668 }), ice: null }), 'vpn6')?.verdict).toBe('leak');
  });

  it('vpn6: OK when both lookups share a network and WebRTC matches', () => {
    expect(find(judge({ vpnOff: 'hidden', ice: ice({ v4: [], v6: ['2001:480:10::1'] }) }), 'vpn6')?.verdict).toBe('ok');
  });

  it('vpn6: the network rule skips Tor, Private Relay and unknown networks', () => {
    const other = who({ ...V6, asn: 668 });
    const i6 = ice({ v6: ['2001:480:10::1'] });
    expect(find(judge({ v6: { ...other, tor: true }, ice: i6 }), 'vpn6')?.verdict).toBe('ok');
    expect(find(judge({ vpnOff: 'hidden', v4: who({ tor: true }), v6: other, ice: i6 }), 'vpn6')?.verdict).toBe('ok');
    expect(find(judge({ vpnOff: 'hidden', v4: who({ privateRelay: true }), v6: other, ice: i6 }), 'vpn6')?.verdict).toBe('ok');
    expect(find(judge({ vpnOff: 'hidden', v6: { ...other, asn: null }, ice: i6 }), 'vpn6')?.verdict).toBe('ok');
    expect(find(judge({ vpnOff: 'hidden', v4: null, v6: other, ice: i6 }), 'vpn6')?.verdict).toBe('ok');
    expect(find(judge({ v6: null }), 'vpn6')).toBeUndefined();
  });

  it('the vpn6 panel explains IPv4-only VPNs and the network comparison', () => {
    expect(t('finding.vpn6.why')).toMatch(/only carry IPv4.*provider.*compares the networks/s);
  });

  it('"busy" gives one CAN\'T TELL finding saying the server is busy', () => {
    const fs = judge({ main: 'busy', v4: 'busy', v6: null });
    expect(fs.map((f) => f.id)).toEqual(['publicIp', 'webrtcLocal']);
    expect(fs[0]).toMatchObject({ id: 'publicIp', verdict: 'unknown', value: "leakcheck's server is busy, try again in a minute" });
  });

  it('null fields read "unknown", never null or undefined', () => {
    const blank = who({ ip: '198.51.100.7', country: null, city: null, asn: null, asOrg: null });
    const fs = judge({ main: blank, v4: blank });
    for (const f of fs) expect(f.value).not.toMatch(/null|undefined/);
    expect(find(fs, 'provider')?.value).toBe('unknown');
    expect(find(fs, 'location')).toMatchObject({ value: 'unknown', verdict: 'unknown' });
    expect(find(judge({ main: who({ city: null }) }), 'location')?.value).toBe('GB');
    expect(find(judge({ main: who({ asOrg: null }) }), 'provider')?.value).toBe('AS20712');
  });

  it('"unavailable" gives one CAN\'T TELL finding saying the lookup is unavailable', () => {
    const fs = judge({ main: 'unavailable', v4: 'unavailable', v6: 'unavailable' });
    expect(fs.map((f) => f.id)).toEqual(['publicIp', 'webrtcLocal']);
    expect(fs[0]).toMatchObject({ id: 'publicIp', verdict: 'unknown' });
    expect(fs[0].value).toContain('lookup unavailable');
  });

  it('no answer at all gives one CAN\'T TELL finding', () => {
    const fs = judge({ main: null, v4: null, v6: null });
    expect(fs.map((f) => f.id)).toEqual(['publicIp', 'webrtcLocal']);
    expect(fs[0]).toMatchObject({ id: 'publicIp', verdict: 'unknown', value: t('finding.publicIp.failed') });
  });

  it('falls back to a family lookup when the main one failed', () => {
    const fs = judge({ main: null, v4: null });
    expect(find(fs, 'publicIp')?.value).toContain('2001:480:10:0:•••');
    expect(find(fs, 'location')?.value).toBe('San Diego, US');
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
  it('shows one CAN\'T TELL row explaining the address, plus the local IP, whatever the VPN answer', () => {
    for (const usesVpn of [true, false]) {
      const fs = judge({ main: loop, v4: who({ ip: '127.0.0.1', country: null, city: null, asn: null, asOrg: null }), v6: loop, usesVpn, reveal: true });
      expect(fs.map((f) => f.id)).toEqual(['publicIp', 'webrtcLocal']);
      expect(fs[0].verdict).toBe('unknown');
      expect(fs[0].value).toBe("::1 · this machine or your local network: leakcheck can't see your public address from here");
    }
  });
  it('a public family lookup wins over a local main lookup', () => {
    const fs = judge({ main: loop, v4: who() });
    expect(find(fs, 'publicIp')?.value).toContain('81.2.69.•••');
  });
  it('a family whose lookup is local gets no VPN row', () => {
    const fs = judge({ v6: loop, ice: ice({ v6: ['2001:db8::5'] }) });
    expect(find(fs, 'vpn6')).toBeUndefined();
    expect(find(fs, 'vpn4')).toBeDefined();
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
    expect(t('connection.vpnOff.otherFamily')).toBe("can't compare (different address type)");
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
