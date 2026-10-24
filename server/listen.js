// @ts-check

/** @param {import('node:http').Server} server @param {import('node:net').ListenOptions} opts */
const listenOnce = (server, opts) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(opts, () => {
    server.off('error', reject);
    resolve(undefined);
  });
});

/**
 * Listen on IPv6 and IPv4 together; on a host without IPv6, on IPv4 only.
 * @param {import('node:http').Server} server
 * @param {number} port
 */
export async function listenDualStack(server, port) {
  try {
    await listenOnce(server, { port, host: '::', ipv6Only: false });
  } catch (e) {
    const code = /** @type {NodeJS.ErrnoException} */ (e).code;
    if (code !== 'EAFNOSUPPORT' && code !== 'EADDRNOTAVAIL') throw e;
    await listenOnce(server, { port, host: '0.0.0.0' });
  }
}
