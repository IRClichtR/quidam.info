// @ts-check
// Starts the HTTP server on both IPv4 and IPv6, because the checker must work for
// visitors using either. It falls back to IPv4 only on hosts that have no IPv6.
// Behind a reverse proxy, HOST pins it to one address instead (for example 127.0.0.1).

// Wraps server.listen() in a promise. Node reports a failed listen as an 'error' event,
// so we turn that into a rejection.
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
 * With `host`, listen on that address only.
 * @param {import('node:http').Server} server
 * @param {number} port
 * @param {string|null} [host]
 */
export async function listenDualStack(server, port, host = null) {
  if (host) return listenOnce(server, { port, host });
  try {
    // "::" is the IPv6 wildcard address. With ipv6Only false it also accepts IPv4
    // connections, so one socket serves both.
    await listenOnce(server, { port, host: '::', ipv6Only: false });
  } catch (e) {
    const code = /** @type {NodeJS.ErrnoException} */ (e).code;
    // Only "no IPv6 here" errors trigger the fallback. Others (like a port already in use) are real.
    if (code !== 'EAFNOSUPPORT' && code !== 'EADDRNOTAVAIL') throw e;
    await listenOnce(server, { port, host: '0.0.0.0' });
  }
}
