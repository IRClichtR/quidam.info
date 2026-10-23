// @ts-check
import { it, expect } from 'vitest';
import { loadConfig } from '../../server/config.js';

it('defaults', () => {
  const c = loadConfig({});
  expect(c).toMatchObject({ port: 8080, stunPort: 3478, dev: false, refresh: true,
    siteOrigin: 'http://localhost:8080', v4Origin: 'http://127.0.0.1:8080', v6Origin: 'http://[::1]:8080' });
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
