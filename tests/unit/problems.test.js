// @ts-check
import { describe, it, expect } from 'vitest';
import { PROBLEMS, groupProblems, problemOf } from '../../public/js/problems.js';

/** @typedef {import('../../public/js/browser.js').Finding} Finding */
/** @param {string} id @param {'leak'|'ok'|'unknown'} [verdict] @returns {Finding} */
const f = (id, verdict = 'leak') => /** @type {Finding} */ ({ id, verdict, value: id });
const ids = (/** @type {{id: string}[]} */ list) => list.map((p) => p.id);

describe('PROBLEMS', () => {
  it('puts each finding in exactly one problem', () => {
    const all = PROBLEMS.flatMap((p) => p.members);
    expect(new Set(all).size).toBe(all.length);
    for (const id of ['screen', 'timezone', 'languages', 'gpu', 'fonts', 'canvas', 'audio', 'cpu']) expect(problemOf(/** @type {any} */ (id))).toBe('browser');
    expect(problemOf('publicIp')).toBe('where');
    expect(problemOf('router')).toBe('home');
    expect(problemOf('gpc')).toBe('gpc');
    expect(problemOf('webrtcLocal')).toBe('webrtc');
    expect(problemOf('otherDevices')).toBeNull();
  });
});

describe('groupProblems', () => {
  it('leaves out problems with no leak and ignores OK and CAN\'T TELL', () => {
    expect(groupProblems([f('gpc', 'ok'), f('canvas', 'unknown'), f('router', 'ok')])).toEqual([]);
    expect(ids(groupProblems([f('gpc'), f('canvas', 'ok')]))).toEqual(['gpc']);
  });

  it('puts the problem with the most leaks first, ties in table order', () => {
    const got = groupProblems([f('gpc'), f('webrtcLocal'), f('publicIp'), f('provider'), f('location'), f('screen'), f('fonts'), f('router')]);
    expect(ids(got)).toEqual(['where', 'browser', 'home', 'gpc', 'webrtc']);
    expect(got.map((p) => p.leaks.length)).toEqual([3, 2, 1, 1, 1]);
  });

  it('counts how many leaks the basic fix closes; the browser card depends on the option', () => {
    const got = groupProblems([f('router'), f('lnaPrompt'), f('publicIp'), f('screen')]);
    expect(got.find((p) => p.id === 'home')?.closed).toBe(1);
    expect(got.find((p) => p.id === 'where')?.closed).toBe(1);
    expect(got.find((p) => p.id === 'browser')?.closed).toBeNull();
  });
});
