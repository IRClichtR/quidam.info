// @ts-check
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { loadStrings, t } from '../../public/js/i18n.js';
import {
  maskIp, judgeConnection, compareVpnOff, fetchWhoami, gatherSrflx, stunUrls, primaryLookup,
} from '../../public/js/connection.js';
import zoneCountries from '../../public/js/tz-countries.js';

/** @typedef {import('../../server/whoami.js').Whoami} Whoami */

/** @param {Partial<Whoami>} [over] @returns {Whoami} */
const who = (over = {}) => ({
  ip: '81.2.69.142', family: 4, country: 'GB', city: 'London', asn: 20712, asOrg: 'Andrews & Arnold Ltd',
  tor: false, privateRelay: false, ...over,
});
const V6 = who({ ip: '2001:480:10::1', family: 6, country: 'US', city: 'San Diego', asn: 668, asOrg: 'DoD' });
const ZONES = { 'Europe/Paris': ['FR', 'MC'], 'Europe/London': ['GB', 'GG', 'IM', 'JE'] };

/** @param {Partial<Parameters<typeof judgeConnection>[0]>} over */
const judge = (over) => judgeConnection({
  main: who(), v4: who(), v6: V6, srflx: { v4: [], v6: [] }, timeZone: 'Europe/Paris', zoneCountries: ZONES, ...over,
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
  it('returns the five findings in order', () => {
    expect(judge({}).map((f) => f.id)).toEqual(['publicIp', 'provider', 'location', 'vpn4', 'vpn6']);
  });

  it('public IP: masked, CAN\'T TELL unless Tor or Private Relay', () => {
    const p = find(judge({}), 'publicIp');
    expect(p).toMatchObject({ verdict: 'unknown' });
    expect(p?.value).toContain('81.2.69.•••');
    expect(p?.value).not.toContain('142');
    expect(find(judge({ main: who({ tor: true }) }), 'publicIp')?.verdict).toBe('ok');
    expect(find(judge({ main: who({ privateRelay: true }) }), 'publicIp')?.verdict).toBe('ok');
  });

  it('reveal shows the full addresses', () => {
    const fs = judgeConnection({ main: who(), v4: who(), v6: V6, srflx: { v4: ['81.2.69.142'], v6: [] },
      timeZone: 'Europe/Paris', zoneCountries: ZONES, reveal: true }, t);
    expect(find(fs, 'publicIp')?.value).toContain('81.2.69.142');
    expect(find(fs, 'vpn4')?.value).toContain('81.2.69.142');
  });

  it('location: OK when the country has no zone matching the browser, LEAK when it has, OK on Tor', () => {
    const gb = find(judge({}), 'location');
    expect(gb).toMatchObject({ verdict: 'ok', value: 'London, GB' });
    expect(find(judge({ main: who({ country: 'FR', city: 'Lyon' }) }), 'location')?.verdict).toBe('leak');
    expect(find(judge({ main: who({ country: 'FR', tor: true }) }), 'location')?.verdict).toBe('ok');
    expect(find(judge({ main: who({ country: 'FR', privateRelay: true }) }), 'location')?.verdict).toBe('ok');
  });

  it('provider follows the location rule', () => {
    expect(find(judge({}), 'provider')).toMatchObject({ verdict: 'ok', value: 'Andrews & Arnold Ltd · AS20712' });
    expect(find(judge({ main: who({ country: 'FR' }) }), 'provider')?.verdict).toBe('leak');
    expect(find(judge({ main: who({ country: 'FR', tor: true }) }), 'provider')?.verdict).toBe('ok');
  });

  it('the location panel warns that a VPN in your own time zone still reads LEAK', () => {
    expect(t('finding.location.why')).toMatch(/own time zone.*LEAK/);
  });

  it('vpn: LEAK when WebRTC shows another address of the same family', () => {
    const fs = judge({ v4: who({ ip: '198.51.100.7' }), srflx: { v4: ['203.0.113.42'], v6: [] } });
    expect(find(fs, 'vpn4')?.verdict).toBe('leak');
    expect(find(fs, 'vpn4')?.value).toContain('203.0.113.•••');
  });

  it('vpn: LEAK when one interface matches and another shows a different address', () => {
    const fs = judge({ srflx: { v4: ['81.2.69.142', '203.0.113.42'], v6: [] } });
    expect(find(fs, 'vpn4')?.verdict).toBe('leak');
    expect(find(fs, 'vpn4')?.value).toContain('203.0.113.•••');
  });

  it('vpn: OK when WebRTC shows the same address', () => {
    const fs = judge({ srflx: { v4: ['81.2.69.142'], v6: ['2001:480:10::1'] } });
    expect(find(fs, 'vpn4')?.verdict).toBe('ok');
    expect(find(fs, 'vpn6')?.verdict).toBe('ok');
  });

  it('vpn: IPv6 written differently is still the same address', () => {
    const fs = judge({ v6: who({ ip: '2001:db8::5', family: 6 }), srflx: { v4: [], v6: ['2001:0DB8:0:0::5'] } });
    expect(find(fs, 'vpn6')?.verdict).toBe('ok');
  });

  it('vpn: "no leak observable" when no srflx came back, or WebRTC is missing', () => {
    for (const srflx of [{ v4: [], v6: [] }, null]) {
      const fs = judge({ srflx });
      for (const id of ['vpn4', 'vpn6']) {
        expect(find(fs, id)).toMatchObject({ verdict: 'unknown', value: 'no leak observable' });
      }
    }
  });

  it('vpn: a family whose lookup failed is left out', () => {
    expect(find(judge({ v6: null }), 'vpn6')).toBeUndefined();
    expect(find(judge({ v6: null }), 'vpn4')).toBeDefined();
    expect(find(judge({ v4: null, srflx: { v4: ['203.0.113.42'], v6: [] } }), 'vpn4')).toBeUndefined();
    expect(find(judge({ v6: 'unavailable' }), 'vpn6')).toBeUndefined();
  });

  it('null fields read "unknown", never null or undefined', () => {
    const blank = who({ ip: '127.0.0.1', country: null, city: null, asn: null, asOrg: null });
    const fs = judge({ main: blank, v4: blank });
    for (const f of fs) expect(f.value).not.toMatch(/null|undefined/);
    expect(find(fs, 'provider')?.value).toBe('unknown');
    expect(find(fs, 'location')).toMatchObject({ value: 'unknown', verdict: 'unknown' });
    expect(find(judge({ main: who({ city: null }) }), 'location')?.value).toBe('GB');
    expect(find(judge({ main: who({ asOrg: null }) }), 'provider')?.value).toBe('AS20712');
  });

  it('"unavailable" gives one CAN\'T TELL finding saying the lookup is unavailable', () => {
    const fs = judge({ main: 'unavailable', v4: 'unavailable', v6: 'unavailable' });
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ id: 'publicIp', verdict: 'unknown' });
    expect(fs[0].value).toContain('lookup unavailable');
  });

  it('no answer at all gives one CAN\'T TELL finding', () => {
    const fs = judge({ main: null, v4: null, v6: null });
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ id: 'publicIp', verdict: 'unknown', value: t('finding.publicIp.failed') });
  });

  it('falls back to a family lookup when the main one failed', () => {
    const fs = judge({ main: null, v4: null });
    expect(find(fs, 'publicIp')?.value).toContain('2001:480:10:0:•••');
    expect(find(fs, 'location')?.value).toBe('San Diego, US');
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
  it('returns null on other errors, a bad body, a network error or a timeout', async () => {
    expect(await fetchWhoami('', reply(429, { error: 'rate-limited' }))).toBeNull();
    expect(await fetchWhoami('', reply(200, { nope: 1 }))).toBeNull();
    expect(await fetchWhoami('', async () => { throw new TypeError('Failed to fetch'); })).toBeNull();
    const started = Date.now();
    expect(await fetchWhoami('', () => new Promise(() => {}), 50)).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('gatherSrflx', () => {
  const g = /** @type {any} */ (globalThis);
  afterEach(() => { delete g.RTCPeerConnection; });

  it('returns null when RTCPeerConnection is missing', async () => {
    expect(await gatherSrflx(['stun:127.0.0.1:3478'])).toBeNull();
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

  it('collects srflx addresses split by family, with only the given STUN servers', async () => {
    const log = fakePc([
      { candidate: { type: 'host', address: '192.168.1.20', candidate: 'candidate:1 1 udp 1 192.168.1.20 5000 typ host' } },
      { candidate: { type: 'srflx', address: '203.0.113.42', candidate: 'candidate:2 1 udp 1 203.0.113.42 6000 typ srflx raddr 0.0.0.0 rport 0' } },
      { candidate: { candidate: 'candidate:3 1 udp 1 2001:db8::5 6001 typ srflx raddr :: rport 0' } },
      { candidate: null },
    ]);
    const urls = ['stun:127.0.0.1:3478', 'stun:ip6-localhost:3478'];
    expect(await gatherSrflx(urls)).toEqual({ v4: ['203.0.113.42'], v6: ['2001:db8::5'] });
    expect(log.config).toEqual({ iceServers: [{ urls }] });
    expect(log.channel).not.toBe('');
    expect(log.closed).toBe(true);
  });

  it('drops the brackets Chromium puts around IPv6 addresses', async () => {
    fakePc([{ candidate: { type: 'srflx', address: '[2001:db8::5]', candidate: 'candidate:3 1 udp 1 2001:db8::5 6001 typ srflx raddr :: rport 0' } }]);
    expect(await gatherSrflx(['stun:ip6-localhost:3478'])).toEqual({ v4: [], v6: ['2001:db8::5'] });
  });

  it('stops at the timeout and still closes the connection', async () => {
    const log = fakePc([], { complete: false });
    const started = Date.now();
    expect(await gatherSrflx(['stun:127.0.0.1:3478'], 50)).toEqual({ v4: [], v6: [] });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(log.closed).toBe(true);
  });

  it('returns null when the connection cannot be created', async () => {
    g.RTCPeerConnection = class { constructor() { throw new Error('blocked'); } };
    expect(await gatherSrflx(['stun:127.0.0.1:3478'])).toBeNull();
  });
});

describe('tz-countries', () => {
  it('table generated from zone1970.tab', () => {
    expect(zoneCountries['Europe/Paris']).toContain('FR');
    expect(zoneCountries['America/New_York']).toEqual(['US']);
  });
  it('includes zone.tab names and backward links', () => {
    expect(zoneCountries['Europe/Amsterdam']).toContain('NL');
    expect(zoneCountries['Asia/Calcutta']).toContain('IN');
    expect(zoneCountries['Europe/Oslo']).toContain('NO');
    expect(zoneCountries.UTC).toBeUndefined();
  });
});
