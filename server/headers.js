// @ts-check

const ROUTERS = ['192.168.1.1', '192.168.0.1', '10.0.0.1', '192.168.1.254'];

/**
 * @param {import('./config.js').Config} cfg
 * @returns {Record<string, string>}
 */
export function securityHeaders(cfg) {
  const connect = ["'self'", cfg.v4Origin, cfg.v6Origin, ...ROUTERS.map((ip) => `http://${ip}`)].join(' ');
  return {
    'content-security-policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self'",
      "font-src 'self'",
      `connect-src ${connect}`,
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  };
}
