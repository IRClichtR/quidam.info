// @ts-check
import { describe, it, expect, beforeAll } from 'vitest';
import { judgeBrowser, uniqueness } from '../../public/js/browser.js';
import { loadStrings, t } from '../../public/js/i18n.js';

/** @typedef {import('../../public/js/browser.js').RawBrowser} RawBrowser */
/** @typedef {import('../../public/js/browser.js').Finding} Finding */

/** A browser that hides everything: every finding OK. @type {RawBrowser} */
const base = {
  screen: { w: 1000, h: 900, innerW: 1000, innerH: 900, dpr: 1 },
  timeZone: 'UTC',
  offsetMin: 0,
  languages: ['en-US'],
  gpu: null,
  fontCount: 0,
  canvas: ['aaaaaaaa', 'bbbbbbbb'],
  audio: ['cccccccc', 'dddddddd'],
  cores: 4,
  memory: undefined,
  localCandidates: ['a1b2.local'],
  gpc: true,
};

/** @param {Finding[]} findings @param {string} id */
const find = (findings, id) => {
  const f = findings.find((x) => x.id === id);
  if (!f) throw new Error(`no finding ${id}`);
  return f;
};
/** @param {Finding[]} findings @param {string} id */
const v = (findings, id) => find(findings, id).verdict;
/** @param {Partial<RawBrowser>} over */
const judge = (over) => judgeBrowser({ ...base, ...over }, t);

beforeAll(async () => {
  await loadStrings('en');
});

describe('judgeBrowser', () => {
  it('lists the ten findings in the spec table order', () => {
    expect(judge({}).map((f) => f.id)).toEqual(['screen', 'timezone', 'languages', 'gpu', 'fonts', 'canvas', 'audio', 'cpu', 'webrtcLocal', 'gpc']);
  });
  it('all OK for a browser that hides everything', () => {
    expect(judge({}).map((f) => f.verdict)).toEqual(Array(10).fill('ok'));
  });
  it('screen OK when the screen equals the window inner size', () => {
    expect(v(judge({ screen: { w: 1000, h: 900, innerW: 1000, innerH: 900, dpr: 2 } }), 'screen')).toBe('ok');
    expect(v(judge({ screen: { w: 2560, h: 1440, innerW: 1280, innerH: 900, dpr: 2 } }), 'screen')).toBe('leak');
    expect(v(judge({ screen: { w: 1000, h: 1000, innerW: 1000, innerH: 900, dpr: 1 } }), 'screen')).toBe('leak');
  });
  it('timezone OK only when UTC or Etc/UTC', () => {
    expect(v(judge({ timeZone: 'UTC' }), 'timezone')).toBe('ok');
    expect(v(judge({ timeZone: 'Etc/UTC' }), 'timezone')).toBe('ok');
    expect(v(judge({ timeZone: 'Europe/Paris', offsetMin: 120 }), 'timezone')).toBe('leak');
    expect(v(judge({ timeZone: 'Europe/London', offsetMin: 0 }), 'timezone')).toBe('leak');
  });
  it('languages OK only with exactly one language, en or en-US', () => {
    expect(v(judge({ languages: ['en'] }), 'languages')).toBe('ok');
    expect(v(judge({ languages: ['en-US'] }), 'languages')).toBe('ok');
    expect(v(judge({ languages: ['en-US', 'en'] }), 'languages')).toBe('leak');
    expect(v(judge({ languages: ['fr-FR'] }), 'languages')).toBe('leak');
    expect(v(judge({ languages: ['en-GB'] }), 'languages')).toBe('leak');
  });
  it('graphics card OK when WebGL is off or the renderer is generic', () => {
    expect(v(judge({ gpu: null }), 'gpu')).toBe('ok');
    for (const gpu of ['Mozilla', 'WebKit WebGL', 'Generic Renderer']) expect(v(judge({ gpu }), 'gpu')).toBe('ok');
    expect(v(judge({ gpu: 'ANGLE (Apple, Apple M2, OpenGL 4.1)' }), 'gpu')).toBe('leak');
  });
  it('fonts OK when fewer than 5 test fonts are detected', () => {
    expect(v(judge({ fontCount: 4 }), 'fonts')).toBe('ok');
    expect(v(judge({ fontCount: 5 }), 'fonts')).toBe('leak');
  });
  it('canvas OK when two renderings hash differently', () => {
    expect(v(judge({ canvas: ['11111111', '22222222'] }), 'canvas')).toBe('ok');
    expect(v(judge({ canvas: ['11111111', '11111111'] }), 'canvas')).toBe('leak');
  });
  it('audio OK when two renderings hash differently, CAN\'T TELL when audio is unavailable', () => {
    expect(v(judge({ audio: ['11111111', '22222222'] }), 'audio')).toBe('ok');
    expect(v(judge({ audio: ['11111111', '11111111'] }), 'audio')).toBe('leak');
    expect(v(judge({ audio: null }), 'audio')).toBe('unknown');
  });
  it('cpu / memory OK when deviceMemory is hidden', () => {
    expect(v(judge({ cores: 8, memory: undefined }), 'cpu')).toBe('ok');
    expect(v(judge({ cores: 8, memory: 8 }), 'cpu')).toBe('leak');
  });
  it('webrtc local IP OK when only .local names or WebRTC off', () => {
    expect(v(judge({ localCandidates: ['a1b2.local'] }), 'webrtcLocal')).toBe('ok');
    expect(v(judge({ localCandidates: [] }), 'webrtcLocal')).toBe('ok');
    expect(v(judge({ localCandidates: null }), 'webrtcLocal')).toBe('ok');
    expect(v(judge({ localCandidates: ['192.168.1.23'] }), 'webrtcLocal')).toBe('leak');
    expect(v(judge({ localCandidates: ['a1b2.local', '10.0.0.5'] }), 'webrtcLocal')).toBe('leak');
  });
  it('GPC OK only when the browser sends it', () => {
    expect(v(judge({ gpc: true }), 'gpc')).toBe('ok');
    expect(v(judge({ gpc: false }), 'gpc')).toBe('leak');
    expect(v(judge({ gpc: undefined }), 'gpc')).toBe('leak');
  });
  it('shows the visitor\'s own values', () => {
    const f = judge({
      screen: { w: 2560, h: 1440, innerW: 1280, innerH: 900, dpr: 2 },
      timeZone: 'Asia/Kolkata', offsetMin: 330,
      languages: ['fr-FR', 'fr', 'en-US'],
      gpu: 'Apple M2', fontCount: 17, canvas: ['a3f90b7e', 'a3f90b7e'],
      cores: 8, memory: 8, localCandidates: ['192.168.1.23'], gpc: false,
    });
    expect(find(f, 'screen').value).toContain('2560 × 1440');
    expect(find(f, 'timezone').value).toBe('Asia/Kolkata (UTC+5:30)');
    expect(find(f, 'languages').value).toBe('fr-FR, fr, en-US');
    expect(find(f, 'gpu').value).toContain('Apple M2');
    expect(find(f, 'fonts').value).toContain('17');
    expect(find(f, 'canvas').value).toContain('a3f90b7e');
    expect(find(f, 'cpu').value).toContain('8');
    expect(find(f, 'webrtcLocal').value).toContain('192.168.1.23');
    expect(judge({ timeZone: 'America/Sao_Paulo', offsetMin: -180 }).find((x) => x.id === 'timezone')?.value).toBe('America/Sao_Paulo (UTC-3)');
  });
  it('formats numbers for the page language', () => {
    const f = judgeBrowser({ ...base, screen: { w: 2560, h: 1440, innerW: 2560, innerH: 1440, dpr: 1.5 } }, t, 'fr');
    expect(find(f, 'screen').value).toBe('2560 × 1440 · pixel ratio 1,5');
    expect(judgeBrowser({ ...base, fontCount: 1234 }, t, 'de').find((x) => x.id === 'fonts')?.value).toBe('1.234 of 30 detected');
  });
  it('never shows "undefined"', () => {
    const f = judge({ cores: undefined, memory: undefined, audio: null, gpc: undefined, gpu: null, localCandidates: null, languages: [] });
    for (const x of f) {
      expect(x.value, x.id).not.toMatch(/undefined|null|NaN/);
      expect(x.value.trim(), x.id).not.toBe('');
    }
  });
});

describe('uniqueness', () => {
  const SIGNALS = ['screen', 'timezone', 'languages', 'gpu', 'fonts', 'canvas', 'audio', 'cpu'];
  /** @param {number} n leaking fingerprint signals @returns {Finding[]} */
  const withLeaks = (n) => [
    ...SIGNALS.map((id, i) => /** @type {Finding} */ ({ id, verdict: i < n ? 'leak' : 'ok', value: 'x' })),
    // Leaks outside the fingerprint signals never count.
    { id: 'webrtcLocal', verdict: 'leak', value: 'x' },
    { id: 'gpc', verdict: 'leak', value: 'x' },
  ];
  it('uniqueness thresholds', () => {
    expect(uniqueness(withLeaks(0))).toBe('low');
    expect(uniqueness(withLeaks(2))).toBe('low');
    expect(uniqueness(withLeaks(3))).toBe('medium');
    expect(uniqueness(withLeaks(5))).toBe('medium');
    expect(uniqueness(withLeaks(6))).toBe('high');
    expect(uniqueness(withLeaks(8))).toBe('high');
  });
  it('does not count CAN\'T TELL as a leak', () => {
    const f = withLeaks(3);
    f[0] = { ...f[0], verdict: 'unknown' };
    expect(uniqueness(f)).toBe('low');
  });
});
