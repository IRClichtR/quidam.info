// @ts-check

// The /api/whoami endpoint: it tells a visitor what we see about their IP (country, city,
// network, Tor, Private Relay). We never store or log the IP; it is looked up, sent back, and forgotten.

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
 // Both lookups return null for unknown addresses, hence the ?. and ?? chains.
 // "asn" is the Autonomous System Number: the id of the network (usually an ISP) that owns the IP.
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
    // Security: we use the socket's address, never X-Forwarded-For or similar headers. Those can
    // be set by the visitor, so reading them would let anyone claim to be someone else.
    tor: data.lists.isTor(ip),
    privateRelay: data.lists.isRelay(ip),
  };
}

// Security: we use the socket's address, never X-Forwarded-For or similar headers. Those can
// be set by the visitor, so reading them would let anyone claim to be someone else.
// Unwrap IPv4-in-IPv6 ("::ffff:1.2.3.4") so IPv4 visitors show as IPv4.
/**
 // In development only, an override can stand in for localhost addresses.
 * The socket address only; forwarding headers are never read.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('./config.js').Config} cfg
 * @returns {string}
 */
export function clientIp(req, cfg) {
  // Unwrap IPv4-in-IPv6 ("::ffff:1.2.3.4") so IPv4 visitors show as IPv4.
  const ip = (req.socket.remoteAddress ?? '').replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
  // In development only, an override can stand in for localhost addresses.
  if (!cfg.dev) return ip;
  return (net.isIP(ip) === 6 ? cfg.devClientIp6 : cfg.devClientIp4) ?? ip;
// no-store: the answer is about this visitor and must never be cached or shared.
// The CORS header lets our own site (and only it) read the answer from the IPv4/IPv6 hosts.
}

/**
 * @param {{ cfg: import('./config.js').Config, getData: () => Data|null,
 *   limiter: { hit(key: string): boolean } }} deps
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void}
 */
export function createWhoamiHandler({ cfg, getData, limiter }) {
  /** @param {import('node:http').ServerResponse} res @param {number} status @param {unknown} [body] */
  // no-store: the answer is about this visitor and must never be cached or shared.
  // The CORS header lets our own site (and only it) read the answer from the IPv4/IPv6 hosts.
  // Order matters: method check, then rate limit, then data check. Any unexpected error
  // becomes a generic 500 so no internal details leak.
  const send = (res, status, body) => {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      // 429 = Too Many Requests.
      'cache-control': 'no-store',
      'access-control-allow-origin': cfg.siteOrigin,
      // 503 = data files not loaded yet (first start with no network).
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
