// @ts-check
import { it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { listenDualStack } from '../../server/listen.js';

/** A server whose listen() fails with `code` on the hosts in `failOn`. @param {string|null} code @param {string[]} failOn */
function fakeServer(code, failOn) {
  /** @type {any[]} */
  const calls = [];
  const s = Object.assign(new EventEmitter(), {
    /** @param {any} opts @param {() => void} cb */
    listen(opts, cb) {
      calls.push(opts);
      setImmediate(() => {
        if (code && failOn.includes(opts.host)) s.emit('error', Object.assign(new Error(code), { code }));
        else cb();
      });
      return s;
    },
  });
  return { server: /** @type {any} */ (s), calls };
}

it('listens on :: (dual stack) when it can', async () => {
  const { server, calls } = fakeServer(null, []);
  await listenDualStack(server, 8080);
  expect(calls).toEqual([{ port: 8080, host: '::', ipv6Only: false }]);
});

it('falls back to 0.0.0.0 when the host has no IPv6', async () => {
  for (const code of ['EAFNOSUPPORT', 'EADDRNOTAVAIL']) {
    const { server, calls } = fakeServer(code, ['::']);
    await listenDualStack(server, 8080);
    expect(calls.map((c) => c.host)).toEqual(['::', '0.0.0.0']);
  }
});

it('rethrows other errors without retrying', async () => {
  const { server, calls } = fakeServer('EADDRINUSE', ['::', '0.0.0.0']);
  await expect(listenDualStack(server, 8080)).rejects.toMatchObject({ code: 'EADDRINUSE' });
  expect(calls).toHaveLength(1);
});

it('works on a real server', async () => {
  const s = http.createServer();
  await listenDualStack(s, 0);
  expect(/** @type {any} */ (s.address()).port).toBeGreaterThan(0);
  await new Promise((r) => s.close(() => r(undefined)));
});
