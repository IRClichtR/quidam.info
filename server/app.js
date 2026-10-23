// @ts-check
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream';
import { securityHeaders } from './headers.js';

/**
 * @param {{cfg: import('./config.js').Config,
 *   staticMap: Map<string, {file: string, type: string}>,
 *   whoami: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void}} deps
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void}
 */
export function createApp({ cfg, staticMap, whoami }) {
  const headers = securityHeaders(cfg);
  return (req, res) => {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.resume();
      res.writeHead(405, { allow: 'GET, HEAD', 'content-length': '0' });
      res.end();
      return;
    }
    const pathname = (req.url ?? '/').split('?')[0];
    if (pathname === '/api/whoami') return whoami(req, res);
    const entry = staticMap.get(pathname);
    if (!entry) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : 'Not found');
      return;
    }
    res.writeHead(200, { 'content-type': entry.type, 'cache-control': 'no-cache' });
    if (req.method === 'HEAD') return void res.end();
    pipeline(createReadStream(entry.file), res, () => {});
  };
}
