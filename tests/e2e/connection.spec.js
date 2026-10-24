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

/**
 * Answer the VPN question, then run the check.
 * @param {import('@playwright/test').Page} page @param {'yes'|'no'} [vpn]
 */
async function check(page, vpn = 'yes') {
  await page.locator(`#connection input[name="vpn"][value="${vpn}"]`).check();
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
  await expect(page.locator('#connection h2')).toContainText('check my ip address');
  await expect(page.locator('#run-connection')).toHaveText('CHECK MY IP');
  await page.waitForTimeout(500);
  expect(urls.filter((u) => u.includes('/api/'))).toEqual([]);
});

test('the check button waits for the VPN answer', async ({ page }) => {
  /** @type {string[]} */
  const urls = [];
  page.on('request', (r) => urls.push(r.url()));
  await open(page);
  const btn = page.locator('#run-connection');
  await expect(btn).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#vpn-hint')).toBeVisible();
  // force: Playwright itself waits while aria-disabled is set; a real visitor can still click.
  await btn.click({ force: true });
  await page.waitForTimeout(500);
  expect(urls.filter((u) => u.includes('/api/'))).toEqual([]);
  await expect(page.locator('#connection .findings li')).toHaveCount(0);
  await page.getByRole('radio', { name: 'no VPN' }).check();
  await expect(btn).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#vpn-hint')).toBeHidden();
});

test('no VPN: public IP, provider and location read LEAK, no VPN rows, no VPN-off button', async ({ page }) => {
  await cannedWhoami(page);
  await open(page);
  await check(page, 'no');
  for (const id of ['publicIp', 'provider', 'location']) {
    await expect(page.locator(`#connection [data-finding="${id}"] .tag-leak`)).toHaveCount(1);
  }
  await expect(page.locator('#connection [data-finding^="vpn"]')).toHaveCount(0);
  await expect(page.locator('#vpn-off-box')).toBeHidden();
  await expect(page.locator('#connection [data-finding="webrtcLocal"]')).toHaveCount(1);
});

test('with a VPN: identity rows read CAN\'T TELL, then follow the VPN-off comparison', async ({ page }) => {
  await cannedWhoami(page);
  await open(page);
  await check(page, 'yes');
  const ids = ['publicIp', 'provider', 'location'];
  for (const id of ids) await expect(page.locator(`#connection [data-finding="${id}"] .tag-unknown`)).toHaveCount(1);
  await page.locator('#vpn-off').click();
  await expect(page.locator('#vpn-off-result')).toHaveText("same: your VPN isn't hiding your IP");
  for (const id of ids) await expect(page.locator(`#connection [data-finding="${id}"] .tag-leak`)).toHaveCount(1);
  await page.unroute('**/api/whoami');
  await cannedWhoami(page, () => ({ ...V4, ip: '198.51.100.7' }));
  await page.locator('#vpn-off').click();
  await expect(page.locator('#vpn-off-result')).toHaveText('different: your VPN hides your IP');
  for (const id of ids) await expect(page.locator(`#connection [data-finding="${id}"] .tag-ok`)).toHaveCount(1);
});

test('changing the answer after the check re-judges the rows without asking the server again', async ({ page }) => {
  await cannedWhoami(page);
  await open(page);
  await check(page, 'yes');
  /** @type {string[]} */
  const urls = [];
  page.on('request', (r) => urls.push(r.url()));
  await expect(page.locator('#connection [data-finding="vpn4"]')).toHaveCount(1);
  await page.getByRole('radio', { name: 'no VPN' }).check();
  await expect(page.locator('#connection [data-finding="publicIp"] .tag-leak')).toHaveCount(1);
  await expect(page.locator('#connection [data-finding^="vpn"]')).toHaveCount(0);
  await expect(page.locator('#vpn-off-box')).toBeHidden();
  await page.getByRole('radio', { name: 'yes, a VPN is on' }).check();
  await expect(page.locator('#connection [data-finding="publicIp"] .tag-unknown')).toHaveCount(1);
  await expect(page.locator('#vpn-off-box')).toBeVisible();
  expect(urls).toEqual([]);
});

test('the local IP row is in this section, not in the browser section', async ({ page }) => {
  await cannedWhoami(page);
  await open(page);
  await page.locator('#run-scan').click();
  await expect(page.locator('#browser li')).toHaveCount(9, { timeout: 10_000 });
  await expect(page.locator('#browser [data-finding="webrtcLocal"]')).toHaveCount(0);
  await check(page);
  await expect(page.locator('#connection [data-finding="webrtcLocal"]')).toHaveCount(1);
});

test.describe('without WebRTC', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      delete (/** @type {any} */ (window)).RTCPeerConnection;
    });
  });
  test('the check finishes and the local IP finding is OK', async ({ page }) => {
    await cannedWhoami(page);
    await open(page);
    await check(page);
    const row = page.locator('#connection li[data-finding="webrtcLocal"]');
    await expect(row.locator('.tag-ok')).toHaveCount(1);
    await expect(row.locator('.row-value')).toHaveText('WebRTC off');
  });
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
  await expect(page.locator('#connection .findings li')).toHaveCount(2);
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

test('re-running the check from another address clears the VPN-off result', async ({ page }) => {
  await cannedWhoami(page);
  await open(page);
  await check(page);
  await page.locator('#vpn-off').click();
  await expect(page.locator('#vpn-off-result')).toHaveText("same: your VPN isn't hiding your IP");
  await page.unroute('**/api/whoami');
  await cannedWhoami(page, () => ({ ...V4, ip: '198.51.100.7' }));
  await check(page);
  await expect(page.locator('#vpn-off-result')).toHaveText('');
  await expect(page.locator('#connection [data-finding="publicIp"] .tag-unknown')).toHaveCount(1);
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
  await expect(page.locator('#browser li')).toHaveCount(9, { timeout: 10_000 });
  await check(page);
  const leak = Number(await page.locator('#results .tile-leak span').textContent());
  const ok = Number(await page.locator('#results .tile-ok span').textContent());
  expect(leak).toBe(await page.locator('#browser .tag-leak, #connection .tag-leak').count());
  expect(ok).toBe(await page.locator('#browser .tag-ok, #connection .tag-ok').count());
});

test('with only the connection checked, the uniqueness tile says the browser is not scanned yet', async ({ page }) => {
  await cannedWhoami(page);
  await open(page);
  await check(page);
  const tile = page.locator('#results .tiles .tile').nth(2);
  await expect(tile).toContainText('not scanned yet');
  await expect(tile).not.toContainText('blends in');
});

test('the VPN-off check compares with the address of the latest check, not an older one', async ({ page }) => {
  // First check with the VPN off (home address), then with the VPN on (another address).
  await cannedWhoami(page);
  await open(page);
  await check(page, 'no');
  await page.unroute('**/api/whoami');
  await cannedWhoami(page, () => ({ ...V4, ip: '198.51.100.7' }));
  await check(page, 'yes');
  // VPN off again: the home address comes back, which differs from the VPN address.
  await page.unroute('**/api/whoami');
  await cannedWhoami(page);
  await page.locator('#vpn-off').click();
  await expect(page.locator('#vpn-off-result')).toHaveText('different: your VPN hides your IP');
  await expect(page.locator('#connection [data-finding="publicIp"] .tag-ok')).toHaveCount(1);
});

test('a failed VPN-off check puts the rows back to CAN\'T TELL', async ({ page }) => {
  await cannedWhoami(page);
  await open(page);
  await check(page, 'yes');
  await page.locator('#vpn-off').click();
  await expect(page.locator('#connection [data-finding="publicIp"] .tag-leak')).toHaveCount(1);
  await page.unroute('**/api/whoami');
  await page.route('**/api/whoami', (route) => route.abort());
  await page.locator('#vpn-off').click();
  await expect(page.locator('#vpn-off-result')).toHaveText('The second lookup did not answer. Try again.');
  await expect(page.locator('#connection [data-finding="publicIp"] .tag-unknown')).toHaveCount(1);
});

test('a rescan keeps the VPN-off verdict while the address is unchanged', async ({ page }) => {
  await cannedWhoami(page);
  await open(page);
  await check(page, 'yes');
  await page.locator('#vpn-off').click();
  await expect(page.locator('#connection [data-finding="publicIp"] .tag-leak')).toHaveCount(1);
  await page.locator('#show-fixes').click();
  await page.getByRole('button', { name: 'RESCAN TO VERIFY' }).click();
  await expect(page.locator('#rescan-result')).not.toBeEmpty({ timeout: 15_000 });
  await expect(page.locator('#connection [data-finding="publicIp"] .tag-leak')).toHaveCount(1);
  await expect(page.locator('#vpn-off-result')).toHaveText("same: your VPN isn't hiding your IP");
});

test('pressing the check button before answering points to the question', async ({ page }) => {
  await open(page);
  // force: Playwright itself waits while aria-disabled is set; a real visitor can still click.
  await page.locator('#run-connection').click({ force: true });
  await expect(page.getByRole('radio', { name: 'yes, a VPN is on' })).toBeFocused();
  await expect(page.locator('#announce')).toHaveText('Answer the question first, then press CHECK MY IP.');
  await page.getByRole('radio', { name: 'no VPN' }).check();
  // The hint is gone, so the button no longer points to it.
  await expect(page.locator('#run-connection')).not.toHaveAttribute('aria-describedby');
});

test('testing on this machine explains why no public address is shown', async ({ page }) => {
  const loop = { ...V4, ip: '::1', family: 6, country: null, city: null };
  await cannedWhoami(page, (u) => (u.hostname === '127.0.0.1' ? { ...loop, ip: '127.0.0.1', family: 4 } : loop));
  await open(page);
  await check(page, 'yes');
  await expect(page.locator('#connection .findings > li')).toHaveCount(2);
  await expect(page.locator('#connection [data-finding="publicIp"]')).toContainText("this machine or your local network: leakcheck can't see your public address from here");
  await expect(page.locator('#connection [data-finding="publicIp"] .tag-unknown')).toHaveCount(1);
  await expect(page.locator('#vpn-off-box')).toBeHidden();
});
