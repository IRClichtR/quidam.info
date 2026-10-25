// @ts-check
import { it, expect } from 'vitest';
import { loadConfig } from '../../server/config.js';

it('defaults', () => {
  const c = loadConfig({});
  expect(c).toMatchObject({ port: 8080, stunPort: 3478, dev: false, refresh: true,
    siteOrigin: 'http://localhost:8080', v4Origin: 'http://127.0.0.1:8080', v6Origin: 'http://ip6-localhost:8080' });
});
it('ignores the dev IP override outside development', () => {
  expect(loadConfig({ LEAKCHECK_DEV_CLIENT_IP4: '81.2.69.142' }).devClientIp4).toBeNull();
  expect(loadConfig({ NODE_ENV: 'production', LEAKCHECK_DEV_CLIENT_IP6: '2001:480::1' }).devClientIp6).toBeNull();
});
it('accepts the dev IP override in development', () => {
  expect(loadConfig({ NODE_ENV: 'development', LEAKCHECK_DEV_CLIENT_IP4: '81.2.69.142' }).devClientIp4).toBe('81.2.69.142');
});
it('rejects an override that is not an IP of the right family', () => {
  expect(() => loadConfig({ NODE_ENV: 'development', LEAKCHECK_DEV_CLIENT_IP4: '2001:480::1' })).toThrow();
});
it('rejects invalid ports', () => {
  expect(() => loadConfig({ PORT: 'abc' })).toThrow();
  expect(() => loadConfig({ STUN_PORT: '70000' })).toThrow();
});
it('allows port 0', () => {
  expect(loadConfig({ PORT: '0' }).port).toBe(0);
});
it('reads HOST and TRUST_PROXY, and rejects junk', () => {
  expect(loadConfig({})).toMatchObject({ host: null, trustProxy: [], hsts: false });
  expect(loadConfig({ HOST: '127.0.0.1', TRUST_PROXY: '127.0.0.1, ::1' })).toMatchObject({ host: '127.0.0.1', trustProxy: ['127.0.0.1', '::1'] });
  expect(() => loadConfig({ TRUST_PROXY: '127.0.0.1,localhost' })).toThrow(/TRUST_PROXY/);
  expect(() => loadConfig({ HOST: 'example.com' })).toThrow(/HOST/);
});
it('turns HSTS on for an https site origin', () => {
  expect(loadConfig({ SITE_ORIGIN: 'https://leak.example' }).hsts).toBe(true);
});
