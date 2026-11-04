// @ts-check
// The request router. It adds security headers to every response, redirects folder paths
// to their trailing-slash form, answers the API and health routes, and serves static files
// only from a fixed allowlist held in memory. main.js builds it and hands it to Node's http server.
import { securityHeaders } from './headers.js';

/** @typedef {import('node:http').IncomingMessage} Req */
/** @typedef {import('node:http').ServerResponse} Res */

/**
 * Which compressed copy to send, from the Accept-Encoding header ("br", "gzip;q=0.8", ...).
 * An encoding with q=0 is refused.
 * @param {string|undefined} header
 * @param {import('./static.js').StaticEntry} entry
 * @returns {{body: Buffer, encoding: string|null, etag: string}}
 */
function pickVariant(header, entry) {
  const accepted = new Set((header ?? '').split(',').map((part) => {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    return params.some((p) => /^\s*q=0(\.0*)?\s*$/.test(p)) ? '' : name.trim();
  }));
  // Each body gets its own ETag, so a cache never mixes a compressed and a plain copy.
  if (entry.br && accepted.has('br')) return { body: entry.br, encoding: 'br', etag: entry.etag.replace(/"$/, '-br"') };
  if (entry.gz && accepted.has('gzip')) return { body: entry.gz, encoding: 'gzip', etag: entry.etag.replace(/"$/, '-gz"') };
  return { body: entry.body, encoding: null, etag: entry.etag };
}

/**
 * Whether If-None-Match names this ETag (or is "*"). The W/ prefix is ignored, as the spec asks for GET.
 * @param {string|undefined} header @param {string} etag
 */
const matches = (header, etag) => header !== undefined
  && header.split(',').some((t) => { const v = t.trim().replace(/^W\//, ''); return v === '*' || v === etag; });

// Dependencies are passed in (not imported) so tests can swap in fakes.
/**
 * `hasData` says whether the IP data is loaded, for the health check.
 * @param {{cfg: import('./config.js').Config,
 *   staticMap: Map<string, import('./static.js').StaticEntry>,
 *   whoami: (req: Req, res: Res) => void,
 *   hasData?: () => boolean}} deps
 * @returns {(req: Req, res: Res) => void}
 */
export function createApp({ cfg, staticMap, whoami, hasData = () => true }) {
  const headers = securityHeaders(cfg);
  // Same origin, no visitor data: the page builds its lookup and STUN addresses from this.
  // (STUN = a tiny UDP protocol that tells a browser its public address; see stun.js.)
  const originsBody = JSON.stringify({ v4: cfg.v4Origin, v6: cfg.v6Origin, stunPort: cfg.stunPort });
  /** @param {Req} req @param {Res} res */
  const origins = (req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405, { allow: 'GET', 'content-length': '0' });
      return void res.end();
    }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(originsBody);
  };
  // For uptime monitors and the deploy script: "is the process up, and is the IP data loaded?"
  /** @param {Req} req @param {Res} res */
  const health = (req, res) => {
    const body = JSON.stringify({ ok: true, data: hasData() });
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(body) });
    res.end(req.method === 'HEAD' ? undefined : body);
  };

  return (req, res) => {
    // Set the headers first, so even 404 and 405 answers carry them.
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    // Read-only site: anything but GET/HEAD is refused. req.resume() throws away
    // any request body so the connection is not left hanging.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.resume();
      res.writeHead(405, { allow: 'GET, HEAD', 'content-length': '0' });
      res.end();
      return;
    }
    // Split at the first "?" only. We never use the query, we just pass it on in redirects.
    const [pathname, query] = (req.url ?? '/').split(/\?(.*)/s);
    if (pathname === '/api/whoami') return whoami(req, res);
    if (pathname === '/api/origins') return origins(req, res);
    if (pathname === '/healthz') return health(req, res);
    // Static files: a plain Map lookup. A URL that is not a key gets a 404, so there is no
    // path to build and no way to write "../" to escape the public folder.
    const entry = staticMap.get(pathname);
    if (!entry) {
      // A folder asked for without its trailing slash (/en, /en/legal) goes to the slash form.
      // The three language folders always do, so the redirect never depends on a missing file.
      if (/^\/(en|fr|es)$/.test(pathname) || (!pathname.endsWith('/') && staticMap.has(`${pathname}/`))) {
        res.writeHead(301, { location: `${pathname}/${query === undefined ? '' : `?${query}`}`, 'content-length': '0' });
        return void res.end();
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : 'Not found');
      return;
    }
    const { body, encoding, etag } = pickVariant(/** @type {string|undefined} */ (req.headers['accept-encoding']), entry);
    /** @type {Record<string, string|number>} */
    const head = { 'content-type': entry.type, 'cache-control': entry.cacheControl, etag, vary: 'accept-encoding' };
    if (encoding) head['content-encoding'] = encoding;
    // 304 = Not Modified: the browser's copy is current, so no body is sent.
    if (matches(req.headers['if-none-match'], etag)) {
      res.writeHead(304, head);
      return void res.end();
    }
    head['content-length'] = body.length;
    res.writeHead(200, head);
    // A client that disconnects half-way only makes this write fail quietly.
    res.end(req.method === 'HEAD' ? undefined : body);
  };
}
