// @ts-check
// Builds the security headers added to every response. The main one is the CSP
// (Content-Security-Policy): a list that tells the browser which places the page may load from.

// Common home-router addresses. The page probes them to detect a router admin page,
// so the CSP must let the page connect to them.
const ROUTERS = ['192.168.1.1', '192.168.0.1', '10.0.0.1', '192.168.1.254'];

/**
 * @param {import('./config.js').Config} cfg
 * @returns {Record<string, string>}
 */
export function securityHeaders(cfg) {
  // Pages may talk to themselves, to the two lookup hosts, and to those routers. Nothing else.
  const connect = ["'self'", cfg.v4Origin, cfg.v6Origin, ...ROUTERS.map((ip) => `http://${ip}`)].join(' ');
  /** @type {Record<string, string>} */
  const headers = {
    // Every other kind of content (scripts, styles, images, fonts) must come from our own origin.
    // This blocks injected scripts and third-party trackers.
    // No plugins, no <base> tag tricks, no form posts, and nobody may put us in a frame (clickjacking).
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
    // Stop the browser guessing a file's type from its content.
    'x-content-type-options': 'nosniff',
    // Never send the page address in the Referer header when following a link.
    'referrer-policy': 'no-referrer',
    // Keep the page isolated from other windows and other origins' requests.
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    // Switch off browser features the site never needs.
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  };
  // HSTS tells browsers to use HTTPS only for the next year, on every subdomain (v4., v6.).
  // Only sent when the site itself is HTTPS; no preload, so it can still be undone.
  if (cfg.hsts) headers['strict-transport-security'] = 'max-age=31536000; includeSubDomains';
  return headers;
}
