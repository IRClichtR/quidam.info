// @ts-check
import { isIPv4, isIPv6 } from 'node:net';

/**
 * @typedef {{ port: number, stunPort: number, dev: boolean, devClientIp4: string|null,
 *   devClientIp6: string|null, siteOrigin: string, v4Origin: string, v6Origin: string,
 *   dataDir: string, refresh: boolean }} Config
 */

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
 * @param {Record<string, string|undefined>} env
 * @returns {Config}
 */
export function loadConfig(env) {
  const httpPort = port(env.PORT, 8080, 'PORT');
  const dev = env.NODE_ENV === 'development';
  return {
    port: httpPort,
    stunPort: port(env.STUN_PORT, 3478, 'STUN_PORT'),
    dev,
    devClientIp4: devIp(env.LEAKCHECK_DEV_CLIENT_IP4, isIPv4, 'LEAKCHECK_DEV_CLIENT_IP4', dev),
    devClientIp6: devIp(env.LEAKCHECK_DEV_CLIENT_IP6, isIPv6, 'LEAKCHECK_DEV_CLIENT_IP6', dev),
    siteOrigin: env.SITE_ORIGIN ?? `http://localhost:${httpPort}`,
    v4Origin: env.V4_ORIGIN ?? `http://127.0.0.1:${httpPort}`,
    v6Origin: env.V6_ORIGIN ?? `http://[::1]:${httpPort}`,
    dataDir: env.LEAKCHECK_DATA_DIR ?? 'data',
    refresh: env.LEAKCHECK_REFRESH !== '0',
  };
}
