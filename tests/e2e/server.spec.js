// @ts-check
import { test, expect } from '@playwright/test';

test('serves the root with the CSP header', async ({ request }) => {
  const res = await request.get('http://localhost:8080/');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-security-policy']).toBeTruthy();
});

test('whoami answers from fixtures via the dev override', async ({ request }) => {
  const res = await request.get('http://127.0.0.1:8080/api/whoami');
  expect(res.status()).toBe(200);
  expect((await res.json()).country).toBe('GB');
});

test('whoami answers on the IPv6 origin', async ({ request }) => {
  const res = await request.get('http://[::1]:8080/api/whoami');
  expect(res.status()).toBe(200);
  expect((await res.json()).family).toBe(6);
});
