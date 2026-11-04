// @ts-check
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { loadStrings, t } from '../../public/js/i18n.js';
import { ROUTERS, probeRouters, promptSupported, permissionState, probeTimeout, judgeLocalnet } from '../../public/js/localnet.js';
import en from '../../public/js/i18n/en.js';

beforeAll(async () => { await loadStrings('en'); });
afterEach(() => { vi.unstubAllGlobals(); });

/** A clock that returns 0 then `ms`. @param {number} ms */
const clock = (ms) => { let n = 0; return () => (n++ === 0 ? 0 : ms); };
/** @param {import('../../public/js/browser.js').Finding[]} fs @param {string} id */
const find = (fs, id) => fs.find((f) => f.id === id);

describe('probeRouters', () => {
  it('tries the four addresses with no-cors and a local address space', async () => {
    /** @type {{url: string, init: any}[]} */
    const calls = [];
    const fetchFn = /** @type {typeof fetch} */ (async (url, init) => { calls.push({ url: String(url), init }); throw new TypeError('refused'); });
    await probeRouters(fetchFn, clock(1), 50);
    expect(calls.map((c) => c.url)).toEqual(ROUTERS.map((a) => `http://${a}/`));
    expect(calls[0].init).toMatchObject({ mode: 'no-cors', targetAddressSpace: 'local', cache: 'no-store', credentials: 'omit' });
  });
  it('returns the address that answered, with whole milliseconds', async () => {
    const fetchFn = /** @type {typeof fetch} */ (async (url) => {
      if (String(url).includes('192.168.0.1')) return new Response('');
      throw new TypeError('refused');
    });
    expect(await probeRouters(fetchFn, clock(4.4), 50)).toEqual({ address: '192.168.0.1', ms: 4 });
  });
  it('aborts the others once one answers', async () => {
    /** @type {AbortSignal[]} */
    const signals = [];
    const fetchFn = /** @type {typeof fetch} */ ((url, init) => {
      signals.push(/** @type {AbortSignal} */ (init?.signal));
      return String(url).includes('10.0.0.1') ? Promise.resolve(new Response('')) : new Promise(() => {});
    });
    await probeRouters(fetchFn, clock(2), 5000);
    expect(signals.filter((s) => s.aborted)).toHaveLength(3);
  });
  it('returns null when every request rejects', async () => {
    const fetchFn = /** @type {typeof fetch} */ (async () => { throw new TypeError('refused'); });
    expect(await probeRouters(fetchFn, clock(1), 50)).toBeNull();
  });
  it('returns null when every request times out', async () => {
    const fetchFn = /** @type {typeof fetch} */ ((_u, init) => new Promise((_r, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')));
    }));
    expect(await probeRouters(fetchFn, clock(1), 20)).toBeNull();
  });
});

describe('promptSupported', () => {
  it('is true when the permission can be queried', async () => {
    vi.stubGlobal('navigator', { permissions: { query: async () => ({ state: 'prompt' }) } });
    expect(await promptSupported()).toBe(true);
  });
  it('is false when the query throws', async () => {
    vi.stubGlobal('navigator', { permissions: { query: async () => { throw new TypeError('bad name'); } } });
    expect(await promptSupported()).toBe(false);
  });
  it('is false without the Permissions API', async () => {
    vi.stubGlobal('navigator', {});
    expect(await promptSupported()).toBe(false);
  });
});

describe('probeTimeout', () => {
  it('waits 30 s while the prompt may be open, 3 s otherwise', () => {
    expect([probeTimeout('prompt'), probeTimeout('granted'), probeTimeout('denied'), probeTimeout(null)]).toEqual([30000, 3000, 3000, 3000]);
  });
  it('reads the state once from the permission query', async () => {
    vi.stubGlobal('navigator', { permissions: { query: async () => ({ state: 'prompt' }) } });
    expect(await permissionState()).toBe('prompt');
    vi.stubGlobal('navigator', {});
    expect(await permissionState()).toBeNull();
  });
});

describe('judgeLocalnet', () => {
  it('reports an answering router as a leak', () => {
    const fs = judgeLocalnet({ router: { address: '192.168.1.1', ms: 4 }, promptSupported: true }, t);
    expect(fs.map((f) => f.id)).toEqual(['router', 'lnaPrompt', 'otherDevices']);
    expect(find(fs, 'router')).toMatchObject({ verdict: 'leak', value: 'answered at 192.168.1.1 in 4 ms' });
    expect(find(fs, 'lnaPrompt')).toMatchObject({ verdict: 'ok', value: 'the browser asked first' });
  });
  it('reports no answer as OK', () => {
    const fs = judgeLocalnet({ router: null, promptSupported: true }, t);
    expect(find(fs, 'router')?.verdict).toBe('ok');
  });
  it('flags a missing prompt', () => {
    const fs = judgeLocalnet({ router: null, promptSupported: false }, t);
    expect(find(fs, 'lnaPrompt')).toMatchObject({ verdict: 'leak', value: 'no prompt was shown' });
  });
  it('always says other devices are not visible', () => {
    expect(find(judgeLocalnet({ router: null, promptSupported: false }, t), 'otherDevices'))
      .toMatchObject({ verdict: 'ok', value: 'not visible from a web page' });
  });
});

describe('page text', () => {
  it('says a website cannot see MAC addresses, device names or Wi-Fi details', () => {
    expect(en['localnet.intro']).toMatch(/MAC addresses, device names or Wi-Fi details/);
    expect(en['localnet.intro']).toMatch(/installed app/);
    expect(en['localnet.intro']).toMatch(/saying no/i);
  });
});
