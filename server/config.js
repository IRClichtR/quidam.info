// @ts-check
// Reads settings from environment variables, checks them, and returns one plain object.
// Everything else gets its settings from here, so a bad value stops the server at startup.
import net, { isIPv4, isIPv6 } from 'node:net';

/**
 * `host` is the bind address (null: every address, IPv6 and IPv4). `trustProxy` lists the
 * addresses of our own reverse proxy, the only peers whose X-Forwarded-For is read.
 * `hsts` is on when the site is served over HTTPS.
 * @typedef {{ port: number, stunPort: number, host: string|null, dev: boolean, devClientIp4: string|null,
 *   devClientIp6: string|null, siteOrigin: string, v4Origin: string, v6Origin: string,
 *   dataDir: string, refresh: boolean, trustProxy: string[], hsts: boolean }} Config
 */

// The override lets a developer on localhost pretend to have a public IP. It is
// switched off outside development, so a visitor can never choose their own IP.
/**
 * Read the dev-only IP override; it is ignored unless running in development.
 * @param {string|undefined} value
 * @param {(ip: string) => boolean} isRightFamily
 * @param {string} name
 * @param {boolean} dev
 * @returns {string|null}
 */
function devIp(value, isRightFamily, name, dev) {
  if (!dev || !value) return null;
  if (!isRightFamily(value)) throw new Error(`${name} is not a valid IP of the expected family: ${value}`);
  return value;
}

/**
 * @param {string|undefined} value
 * @param {number} fallback
 * @param {string} name
 * @returns {number}
 */
function port(value, fallback, name) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(`${name} must be an integer 0-65535: ${value}`);
  return n;
}

/**
 * A comma-separated list of IP addresses; anything else stops the server.
 * @param {string|undefined} value
 * @param {string} name
 * @returns {string[]}
 */
function ipList(value, name) {
  const items = (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const ip of items) if (!net.isIP(ip)) throw new Error(`${name} must list IP addresses: ${ip}`);
  return items;
}

// Defaults suit local development. In production, set SITE_ORIGIN and the two
// origins. The v4/v6 origins are two hostnames that resolve to only IPv4 or only IPv6,
// so the page can learn both of the visitor's addresses.
/**
 * @param {Record<string, string|undefined>} env
 * @returns {Config}
 */
export function loadConfig(env) {
  const httpPort = port(env.PORT, 8080, 'PORT');
  const dev = env.NODE_ENV === 'development';
  const host = env.HOST || null;
  if (host !== null && !net.isIP(host)) throw new Error(`HOST must be an IP address: ${host}`);
  const siteOrigin = env.SITE_ORIGIN ?? `http://localhost:${httpPort}`;
  return {
    port: httpPort,
    stunPort: port(env.STUN_PORT, 3478, 'STUN_PORT'),
    host,
    dev,
    devClientIp4: devIp(env.LEAKCHECK_DEV_CLIENT_IP4, isIPv4, 'LEAKCHECK_DEV_CLIENT_IP4', dev),
    devClientIp6: devIp(env.LEAKCHECK_DEV_CLIENT_IP6, isIPv6, 'LEAKCHECK_DEV_CLIENT_IP6', dev),
    siteOrigin,
    v4Origin: env.V4_ORIGIN ?? `http://127.0.0.1:${httpPort}`,
    v6Origin: env.V6_ORIGIN ?? `http://ip6-localhost:${httpPort}`,
    dataDir: env.LEAKCHECK_DATA_DIR ?? 'data',
    refresh: env.LEAKCHECK_REFRESH !== '0',
    trustProxy: ipList(env.TRUST_PROXY, 'TRUST_PROXY'),
    hsts: siteOrigin.startsWith('https://'),
  };
}
