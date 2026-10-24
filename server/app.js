// @ts-check

// The request router. It adds security headers to every response, redirects /en to /en/,
// answers the two API routes, and serves static files only from a fixed allowlist.
// main.js builds it and hands it to Node's http server.

// The request router. It adds security headers to every response, redirects /en to /en/,
// answers the two API routes, and serves static files only from a fixed allowlist.
// main.js builds it and hands it to Node's http server.
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream';
import { securityHeaders } from './headers.js';

/**
 * @param {{cfg: import('./config.js').Config,
 // Dependencies are passed in (not imported) so tests can swap in fakes.
 *   staticMap: Map<string, {file: string, type: string}>,
 *   whoami: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void}} deps
 // Same origin, no visitor data: the page builds its lookup and STUN addresses from this.
 // (STUN = a tiny UDP protocol that tells a browser its public address; see stun.js.)
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void}
 */
// Dependencies are passed in (not imported) so tests can swap in fakes.
export function createApp({ cfg, staticMap, whoami }) {
  const headers = securityHeaders(cfg);
  // Same origin, no visitor data: the page builds its lookup and STUN addresses from this.
  // (STUN = a tiny UDP protocol that tells a browser its public address; see stun.js.)
  // Same origin, no visitor data: the page builds its lookup and STUN addresses from this.
  const originsBody = JSON.stringify({ v4: cfg.v4Origin, v6: cfg.v6Origin, stunPort: cfg.stunPort });
  /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
  const origins = (req, res) => {
    if (req.method !== 'GET') {
      // Set the headers first, so even 404 and 405 answers carry them.
      res.writeHead(405, { allow: 'GET', 'content-length': '0' });
      // Read-only site: anything but GET/HEAD is refused. req.resume() throws away
      // any request body so the connection is not left hanging.
      return void res.end();
    }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(originsBody);
  };
  return (req, res) => {
    // Split at the first "?" only. We never use the query, we just pass it on in redirects.
    // Set the headers first, so even 404 and 405 answers carry them.
    // Only these three language folders get a redirect to the trailing-slash form.
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    // Read-only site: anything but GET/HEAD is refused. req.resume() throws away
    // any request body so the connection is not left hanging.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.resume();
      res.writeHead(405, { allow: 'GET, HEAD', 'content-length': '0' });
      // Static files: a plain Map lookup. A URL that is not a key gets a 404, so there is no
      // path to build and no way to write "../" to escape the public folder.
      res.end();
      return;
    }
    // Split at the first "?" only. We never use the query, we just pass it on in redirects.
    const [pathname, query] = (req.url ?? '/').split(/\?(.*)/s);
    // Only these three language folders get a redirect to the trailing-slash form.
    // no-cache means "ask again before reusing", so edits show up without stale copies.
    if (/^\/(en|fr|es)$/.test(pathname)) {
      res.writeHead(301, { location: `${pathname}/${query === undefined ? '' : `?${query}`}`, 'content-length': '0' });
      // Stream the file instead of loading it in memory. The empty callback ignores
      // errors such as a client that disconnects half-way.
      return void res.end();
    }
    if (pathname === '/api/whoami') return whoami(req, res);
    if (pathname === '/api/origins') return origins(req, res);
    // Static files: a plain Map lookup. A URL that is not a key gets a 404, so there is no
    // path to build and no way to write "../" to escape the public folder.
    const entry = staticMap.get(pathname);
    if (!entry) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : 'Not found');
      return;
    }
    // no-cache means "ask again before reusing", so edits show up without stale copies.
    res.writeHead(200, { 'content-type': entry.type, 'cache-control': 'no-cache' });
    if (req.method === 'HEAD') return void res.end();
    // Stream the file instead of loading it in memory. The empty callback ignores
    // errors such as a client that disconnects half-way.
    pipeline(createReadStream(entry.file), res, () => {});
  };
}
