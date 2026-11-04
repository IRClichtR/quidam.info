// @ts-check
// The /api/whoami endpoint: it tells a visitor what we see about their IP (country, city,
// network, Tor, Private Relay). We never store or log the IP; it is looked up, sent back, and forgotten.
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
  // Both lookups return null for unknown addresses, hence the ?. and ?? chains.
  // "asn" is the Autonomous System Number: the id of the network (usually an ISP) that owns the IP.
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

// Unwrap IPv4-in-IPv6 ("::ffff:1.2.3.4") so IPv4 visitors show as IPv4.
/** @param {string} ip */
const unwrap = (ip) => ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');

// Security: X-Forwarded-For can be written by anyone, so it is read only when the request
// comes from our own reverse proxy (an address listed in TRUST_PROXY). Even then we take only
// the right-most entry, the one that proxy appended; entries further left came from the visitor.
/**
 * The visitor's address: the socket's, or the proxy's right-most X-Forwarded-For entry
 * when the socket is a trusted proxy. In development only, an override stands in.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('./config.js').Config} cfg
 * @returns {string}
 */
export function clientIp(req, cfg) {
  let ip = unwrap(req.socket.remoteAddress ?? '');
  if (cfg.trustProxy.includes(ip)) {
    const header = req.headers['x-forwarded-for'];
    const last = unwrap([header ?? ''].flat().join(',').split(',').pop()?.trim() ?? '');
    if (net.isIP(last)) ip = last;
  }
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
      // no-store: the answer is about this visitor and must never be cached or shared.
      'cache-control': 'no-store',
      // The CORS header lets our own site (and only it) read the answer from the IPv4/IPv6 hosts.
      'access-control-allow-origin': cfg.siteOrigin,
      vary: 'Origin',
      ...(status === 405 ? { allow: 'GET' } : {}),
    });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  return (req, res) => {
    // Order matters: method check, then rate limit, then data check. Any unexpected error
    // becomes a generic 500 so no internal details leak.
    try {
      if (req.method !== 'GET') return send(res, 405, { error: 'method-not-allowed' });
      const ip = clientIp(req, cfg);
      // 429 = Too Many Requests.
      if (!limiter.hit(ip)) return send(res, 429, { error: 'rate-limited' });
      const data = getData();
      // 503 = data files not loaded yet (first start with no network).
      if (!data) return send(res, 503, { error: 'data-unavailable' });
      send(res, 200, lookup(ip, data));
    } catch {
      if (!res.headersSent) send(res, 500, { error: 'internal' });
      else res.end();
    }
  };
}
