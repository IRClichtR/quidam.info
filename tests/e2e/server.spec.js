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
  const res = await request.get('http://ip6-localhost:8080/api/whoami');
  expect(res.status()).toBe(200);
  expect((await res.json()).family).toBe(6);
});

test('the footer links to the legal page in the same language, which loads no script', async ({ page }) => {
  /** @type {string[]} */
  const scripts = [];
  page.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(r.url()); });
  await page.goto('http://localhost:8080/fr/');
  await page.locator('html[data-i18n-ready="fr"]').waitFor();
  scripts.length = 0;
  await page.getByRole('link', { name: 'mentions légales et confidentialité' }).click();
  await expect(page).toHaveURL('http://localhost:8080/fr/legal/');
  await expect(page.locator('h1')).toHaveText('Mentions légales et confidentialité');
  await expect(page.locator('#privacy')).toBeVisible();
  expect(scripts).toEqual([]);
  const res = await page.request.get('http://localhost:8080/.well-known/security.txt');
  expect(res.status()).toBe(200);
  expect(await res.text()).toMatch(/^Contact: mailto:/);
});
