// @ts-check
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../server/config.js';
import { securityHeaders } from '../../server/headers.js';

describe('securityHeaders', () => {
  it('sets the strict header set', () => {
    const h = securityHeaders(loadConfig({}));
    expect(h['content-security-policy']).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self' http://127.0.0.1:8080 http://ip6-localhost:8080 http://192.168.1.1 http://192.168.0.1 http://10.0.0.1 http://192.168.1.254; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('no-referrer');
    expect(h['cross-origin-opener-policy']).toBe('same-origin');
    expect(h['cross-origin-resource-policy']).toBe('same-origin');
    expect(h['permissions-policy']).toBe('camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    expect(h['strict-transport-security']).toBeUndefined();
  });
  it('adds HSTS only when the site is served over HTTPS', () => {
    const h = securityHeaders(loadConfig({ SITE_ORIGIN: 'https://leak.example' }));
    expect(h['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
  });
});
