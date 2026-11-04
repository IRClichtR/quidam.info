// @ts-check
import { describe, it, expect } from 'vitest';
import { createRateLimiter } from '../../server/ratelimit.js';

/** @param {number} limit */
function setup(limit = 3) {
  let t = 1000;
  const windowMs = 60_000;
  const rl = createRateLimiter({ limit, windowMs, now: () => t });
  return { rl, windowMs, advance: (/** @type {number} */ ms) => { t += ms; } };
}

describe('createRateLimiter', () => {
  it('allows up to the limit then refuses', () => {
    const { rl } = setup(3);
    expect([rl.hit('a'), rl.hit('a'), rl.hit('a'), rl.hit('a')]).toEqual([true, true, true, false]);
  });

  it('keys are independent', () => {
    const { rl } = setup(3);
    for (let i = 0; i < 4; i++) rl.hit('a');
    expect(rl.hit('b')).toBe(true);
  });

  it('resets after the window', () => {
    const { rl, advance, windowMs } = setup(3);
    for (let i = 0; i < 4; i++) rl.hit('a');
    advance(windowMs);
    expect(rl.hit('a')).toBe(true);
  });

  it('forgets old keys', () => {
    const { rl, advance, windowMs } = setup(3);
    rl.hit('a');
    rl.hit('b');
    expect(rl.size()).toBe(2);
    advance(2 * windowMs);
    expect(rl.size()).toBe(0);
  });

  it('sweeps only expired keys, oldest first', () => {
    const { rl, advance, windowMs } = setup(3);
    rl.hit('a');
    advance(windowMs / 2);
    rl.hit('b');
    advance(windowMs / 2);
    // 'a' has expired, 'b' is half-way through its window.
    expect(rl.size()).toBe(1);
    for (let i = 0; i < 2; i++) rl.hit('b');
    expect(rl.hit('b')).toBe(false);
    expect(rl.hit('a')).toBe(true);
  });

  it('refuses new keys when full, and accepts them again once old ones expire', () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 5, windowMs: 1000, maxKeys: 2, now: () => t });
    expect([rl.hit('a'), rl.hit('b'), rl.hit('c')]).toEqual([true, true, false]);
    expect(rl.hit('a')).toBe(true);
    expect(rl.size()).toBe(2);
    t = 1000;
    expect(rl.hit('c')).toBe(true);
  });
});
