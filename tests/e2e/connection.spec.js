// @ts-check
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8080';
const OWN = ['http://localhost:8080/', 'http://127.0.0.1:8080/', 'http://ip6-localhost:8080/'];
const STUN = ['stun:127.0.0.1:3478', 'stun:ip6-localhost:3478'];
const FULL_IP = /81\.2\.69\.142|2001:480:10::1/;

/** @param {import('@playwright/test').Page} page */
async function open(page) {
  await page.goto(BASE + '/en/');
  await page.locator('html[data-i18n-ready="en"]').waitFor();
}

/** @param {import('@playwright/test').Page} page */
async function check(page) {
  await page.locator('#run-connection').click();
  await expect(page.locator('#announce')).toContainText('Connection check', { timeout: 10_000 });
  await expect(page.locator('#run-connection')).not.toHaveAttribute('aria-disabled', 'true');
}

const V4 = { ip: '81.2.69.142', family: 4, country: 'GB', city: 'London', asn: null, asOrg: null, tor: false, privateRelay: false };
const V6 = { ...V4, ip: '2001:480:10::1', family: 6, country: 'US', city: 'San Diego' };

/**
 * Canned lookups for tests that don't need the real server: the whoami rate limit (30 a minute)
 * is shared by every test, since the dev override gives them all the same address.
 * @param {import('@playwright/test').Page} page
 * @param {(url: URL) => object} [body]
 */
async function cannedWhoami(page, body = (u) => (u.hostname === 'ip6-localhost' ? V6 : V4)) {
  await page.route('**/api/whoami', (route) => route.fulfill({
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': BASE },
    body: JSON.stringify(body(new URL(route.request().url()))),
  }));
}

/** Serve the main lookup from the IPv4-only origin, so its family is known (localhost may be ::1). */
/** @param {import('@playwright/test').Page} page */
async function mainFromV4(page) {
  await page.route(BASE + '/api/whoami', async (route) => {
    const res = await route.fetch({ url: 'http://127.0.0.1:8080/api/whoami' });
    await route.fulfill({ response: res });
  });
}

test('before the click the section names only leakcheck\'s own server, and nothing is sent', async ({ page }) => {
  /** @type {string[]} */
  const urls = [];
  page.on('request', (r) => urls.push(r.url()));
  await open(page);
  const text = await page.locator('#connection').innerText();
  expect(text).toContain("leakcheck's own server");
  expect(text).not.toMatch(/google|cloudflare|ipify|ipinfo|db-ip|stun\./i);
  await expect(page.locator('#run-connection')).toHaveText('CHECK MY CONNECTION');
  await page.waitForTimeout(500);
  expect(urls.filter((u) => u.includes('/api/'))).toEqual([]);
});

test('the check talks only to our own origins and our own STUN server', async ({ page }) => {
  await page.addInitScript(() => {
    const w = /** @type {any} */ (window);
    w.__ice = [];
    const Orig = w.RTCPeerConnection;
    if (!Orig) return;
    w.RTCPeerConnection = class extends Orig {
      /** @param {any} config */
      constructor(config) {
        super(config);
        w.__ice.push(JSON.parse(JSON.stringify(config ?? {})));
      }
    };
  });
  /** @type {string[]} */
  const urls = [];
  page.on('request', (r) => urls.push(r.url()));
  await open(page);
  await check(page);
  for (const u of urls) expect(OWN.some((o) => u.startsWith(o)), u).toBe(true);
  expect(urls).toContain('http://127.0.0.1:8080/api/whoami');
  expect(urls).toContain('http://ip6-localhost:8080/api/whoami');
  const ice = await page.evaluate(() => /** @type {any} */ (window).__ice);
  expect(ice.length).toBeGreaterThan(0);
  for (const config of ice) {
    for (const server of config.iceServers ?? []) {
      for (const u of [server.urls].flat()) expect(STUN).toContain(u);
    }
  }
  expect(ice.flatMap((/** @type {any} */ c) => (c.iceServers ?? []).flatMap((/** @type {any} */ s) => [s.urls].flat()))).toEqual(STUN);
  // Both families answered: both VPN rows show, and nothing reads undefined or null.
  await expect(page.locator('#connection [data-finding="vpn4"]')).toHaveCount(1);
  await expect(page.locator('#connection [data-finding="vpn6"]')).toHaveCount(1);
  await expect(page.locator('#connection .findings')).not.toContainText(/undefined|null/);
  await expect(page.locator('#connection .panel .tag')).toHaveCount(0);
});

test('with the IPv4 dev override, location shows London, GB', async ({ page }) => {
  await mainFromV4(page);
  await open(page);
  await check(page);
  await expect(page.locator('#connection [data-finding="location"] .row-value')).toHaveText('London, GB');
});

test('the IP is masked until reveal is pressed', async ({ page }) => {
  await cannedWhoami(page);
  await open(page);
  await check(page);
  const section = page.locator('#connection .findings');
  const reveal = page.locator('#reveal-ip');
  await expect(page.locator('#connection [data-finding="publicIp"] .row-value')).toContainText('•••');
  expect(await section.innerText()).not.toMatch(FULL_IP);
  await expect(reveal).toHaveAttribute('aria-pressed', 'false');
  await reveal.click();
  await expect(reveal).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#connection [data-finding="publicIp"] .row-value')).toContainText(FULL_IP);
  await reveal.click();
  await expect(reveal).toHaveAttribute('aria-pressed', 'false');
  expect(await section.innerText()).not.toMatch(FULL_IP);
});

test('with the IPv6 origin blocked, only the IPv4 rows show and there is no error', async ({ page }) => {
  await page.route('http://ip6-localhost:8080/**', (route) => route.abort());
  await open(page);
  await check(page);
  await expect(page.locator('#announce')).toContainText('Connection check finished');
  await expect(page.locator('#connection [data-finding="vpn4"]')).toHaveCount(1);
  await expect(page.locator('#connection [data-finding="vpn6"]')).toHaveCount(0);
  await expect(page.locator('#connection [data-finding="publicIp"]')).toHaveCount(1);
});

test('a 503 from /api/whoami shows "lookup unavailable"', async ({ page }) => {
  await page.route('**/api/whoami', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': BASE },
    body: '{"error":"data-unavailable"}',
  }));
  await open(page);
  await check(page);
  await expect(page.locator('#connection .findings li')).toHaveCount(1);
  await expect(page.locator('#connection [data-finding="publicIp"]')).toContainText('lookup unavailable');
  await expect(page.locator('#connection [data-finding="publicIp"] .tag-unknown')).toHaveCount(1);
});

test('the VPN-off recheck says "same" when both lookups match', async ({ page }) => {
  await cannedWhoami(page);
  await open(page);
  await check(page);
  const again = page.locator('#vpn-off');
  await expect(again).toBeVisible();
  await again.click();
  await expect(page.locator('#vpn-off-result')).toHaveText("same: your VPN isn't hiding your IP");
});

test('the VPN-off recheck says "different" when the second lookup changed', async ({ page }) => {
  await cannedWhoami(page);
  await open(page);
  await check(page);
  await page.unroute('**/api/whoami');
  await cannedWhoami(page, () => ({ ...V4, ip: '198.51.100.7' }));
  await page.locator('#vpn-off').click();
  await expect(page.locator('#vpn-off-result')).toHaveText('different: your VPN hides your IP');
});

test('the VPN-off recheck never compares across address families', async ({ page }) => {
  await cannedWhoami(page, (u) => (u.hostname === 'ip6-localhost' ? V6 : V4));
  await open(page);
  await check(page);
  // Second round: the main lookup now answers over IPv6, and so does the IPv4 origin (no IPv4 left).
  await page.unroute('**/api/whoami');
  /** @type {string[]} */
  const asked = [];
  await cannedWhoami(page, (u) => { asked.push(u.href); return { ...V6, ip: '2001:db8::9' }; });
  await page.locator('#vpn-off').click();
  await expect(page.locator('#vpn-off-result')).toHaveText("can't compare (different address type)");
  expect(asked).toEqual([BASE + '/api/whoami', 'http://127.0.0.1:8080/api/whoami']);
});

test('the summary counts browser and connection findings together', async ({ page }) => {
  await cannedWhoami(page);
  await open(page);
  await page.locator('#run-scan').click();
  await expect(page.locator('#browser li')).toHaveCount(10, { timeout: 10_000 });
  await check(page);
  const leak = Number(await page.locator('#results .tile-leak span').textContent());
  const ok = Number(await page.locator('#results .tile-ok span').textContent());
  expect(leak).toBe(await page.locator('#browser .tag-leak, #connection .tag-leak').count());
  expect(ok).toBe(await page.locator('#browser .tag-ok, #connection .tag-ok').count());
});
