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
});
