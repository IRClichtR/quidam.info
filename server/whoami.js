// @ts-check
import net from 'node:net';

/**
 * @typedef {{ get(ip: string): any }} Reader
 * @typedef {{ city: Reader, asn: Reader, lists: { isTor(ip: string): boolean, isRelay(ip: string): boolean } }} Data
 * @typedef {{ ip: string, family: 4|6, country: string|null, city: string|null, asn: number|null,
 *   asOrg: string|null, tor: boolean, privateRelay: boolean }} Whoami
 */

/**
 * @param {string} ip
 * @param {Data} data
 * @returns {Whoami}
 */
export function lookup(ip, data) {
  const c = data.city.get(ip);
  const a = data.asn.get(ip);
  return {
    ip,
    family: net.isIP(ip) === 6 ? 6 : 4,
    country: c?.country?.iso_code ?? null,
    city: c?.city?.names?.en ?? null,
    asn: a?.autonomous_system_number ?? null,
    asOrg: a?.autonomous_system_organization ?? null,
    tor: data.lists.isTor(ip),
    privateRelay: data.lists.isRelay(ip),
  };
}

/**
 * The socket address only; forwarding headers are never read.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('./config.js').Config} cfg
 * @returns {string}
 */
export function clientIp(req, cfg) {
  const ip = (req.socket.remoteAddress ?? '').replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
  if (!cfg.dev) return ip;
  return (net.isIP(ip) === 6 ? cfg.devClientIp6 : cfg.devClientIp4) ?? ip;
}

/**
 * @param {{ cfg: import('./config.js').Config, getData: () => Data|null,
 *   limiter: { hit(key: string): boolean } }} deps
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void}
 */
export function createWhoamiHandler({ cfg, getData, limiter }) {
  /** @param {import('node:http').ServerResponse} res @param {number} status @param {unknown} [body] */
  const send = (res, status, body) => {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': cfg.siteOrigin,
      vary: 'Origin',
      ...(status === 405 ? { allow: 'GET' } : {}),
    });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  return (req, res) => {
    try {
      if (req.method !== 'GET') return send(res, 405, { error: 'method-not-allowed' });
      const ip = clientIp(req, cfg);
      if (!limiter.hit(ip)) return send(res, 429, { error: 'rate-limited' });
      const data = getData();
      if (!data) return send(res, 503, { error: 'data-unavailable' });
      send(res, 200, lookup(ip, data));
    } catch {
      if (!res.headersSent) send(res, 500, { error: 'internal' });
      else res.end();
    }
  };
}
