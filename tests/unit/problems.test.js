// @ts-check
import { describe, it, expect } from 'vitest';
import { PROBLEMS, groupProblems, problemOf, afterRescan } from '../../public/js/problems.js';

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

describe('afterRescan', () => {
  /** @param {string[]} before @param {import('../../public/js/browser.js').Finding[]} findings @param {string[]} [done] @param {string[]} [resolved] */
  const run = (before, findings, done = [], resolved = []) => {
    const r = afterRescan(/** @type {any} */ (before), groupProblems(findings), /** @type {any} */ (new Set(done)), /** @type {any} */ (new Set(resolved)));
    return { done: [...r.done].sort(), stale: [...r.stale].sort(), resolved: [...r.resolved].sort() };
  };

  it('unticks a problem marked done whose fix did not close its leak', () => {
    expect(run(['gpc'], [f('gpc')], ['gpc'])).toEqual({ done: [], stale: ['gpc'], resolved: [] });
  });

  it('warns only about problems that were ticked', () => {
    expect(run(['gpc'], [f('gpc')])).toEqual({ done: [], stale: [], resolved: [] });
  });

  it('keeps the tick when only a leak the fix cannot close remains', () => {
    expect(run(['home'], [f('lnaPrompt')], ['home'])).toEqual({ done: ['home'], stale: [], resolved: [] });
  });

  it('keeps the tick on the browser card, where what closes depends on the option picked', () => {
    expect(run(['browser'], [f('screen')], ['browser'])).toEqual({ done: ['browser'], stale: [], resolved: [] });
  });

  it('records a problem that no longer leaks as resolved and drops its tick', () => {
    expect(run(['gpc', 'browser'], [f('screen')], ['gpc'])).toEqual({ done: [], stale: [], resolved: ['gpc'] });
  });

  it('keeps earlier resolved problems, unless the leak came back', () => {
    expect(run(['browser'], [f('screen')], [], ['gpc'])).toEqual({ done: [], stale: [], resolved: ['gpc'] });
    expect(run([], [f('gpc')], [], ['gpc'])).toEqual({ done: [], stale: [], resolved: [] });
  });
});
