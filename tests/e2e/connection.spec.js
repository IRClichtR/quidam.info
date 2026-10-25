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

/** Run the check and wait for it to finish. @param {import('@playwright/test').Page} page */
async function check(page) {
  await page.locator('#run-connection').click();
  await expect(page.locator('#announce')).toContainText('Connection check', { timeout: 10_000 });
  await expect(page.locator('#run-connection')).not.toHaveAttribute('aria-disabled', 'true');
}

const V4 = { ip: '81.2.69.142', family: 4, country: 'GB', city: 'London', asn: 20712, asOrg: 'Andrews & Arnold Ltd', tor: false, privateRelay: false };
const V6 = { ...V4, ip: '2001:480:10::1', family: 6 };

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

/**
 * Replace WebRTC with a fake that offers the given candidate addresses, so the VPN checks are deterministic.
 * @param {import('@playwright/test').Page} page
 * @param {{srflx?: string[], host?: string[]}} cands
 */
async function fakeWebrtc(page, { srflx = [], host = ['a1b2c3.local'] }) {
  await page.addInitScript(({ srflx, host }) => {
    const line = (/** @type {string} */ ip, /** @type {string} */ type) => `candidate:1 1 udp 1 ${ip} 5000 typ ${type}`;
    /** @type {any} */ (window).RTCPeerConnection = class {
      /** @type {((e: any) => void)|null} */ onicecandidate = null;
      onicegatheringstatechange = null;
      iceGatheringState = 'new';
      /** @param {any} config */
      constructor(config) { this.servers = (config?.iceServers ?? []).length; }
      createDataChannel() {}
      async createOffer() { return {}; }
      async setLocalDescription() {
        setTimeout(() => {
          const all = [...host.map((ip) => line(ip, 'host')), ...(this.servers ? srflx.map((ip) => line(ip, 'srflx')) : [])];
          for (const c of all) this.onicecandidate?.({ candidate: { candidate: c } });
          this.onicecandidate?.({ candidate: null });
        }, 5);
      }
      close() {}
    };
  }, { srflx, host });
}

/** @param {import('@playwright/test').Page} page @param {'yes'|'vpn'|'unsure'} answer */
const answer = (page, answer) => page.locator(`#conn-question [data-answer="${answer}"]`).click();

test('before the click nothing is sent, and the button works without answering anything', async ({ page }) => {
  /** @type {string[]} */
  const urls = [];
  page.on('request', (r) => urls.push(r.url()));
  await open(page);
  await expect(page.locator('#connection h2')).toContainText('what sites see about your connection');
  await expect(page.locator('#connection > .block-head .block-sub')).toHaveText("on a click · asks only ombre's server · keeps nothing");
  const btn = page.locator('#run-connection');
  await expect(btn).toHaveText('SHOW WHAT SITES SEE');
  await expect(btn).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#conn-question')).toBeHidden();
  await page.waitForTimeout(300);
  expect(urls.filter((u) => u.includes('/api/'))).toEqual([]);
  await expect(page.locator('#connection')).not.toContainText(/google|cloudflare|ipify|ipinfo|stun\./i);
});

test('the result card says what sites see, then asks "is this you?"', async ({ page }) => {
  await cannedWhoami(page);
  await open(page);
  await check(page);
  await expect(page.locator('#conn-lines')).toHaveText(/a connection from Andrews & Arnold Ltd\s*near London, United Kingdom/);
  await expect(page.locator('#conn-net')).toHaveText('AS20712');
  const group = page.getByRole('radiogroup', { name: 'is this you?' });
  await expect(group.getByRole('radio')).toHaveCount(3);
  await expect(group.getByRole('radio').first()).toHaveText("yes, Andrews & Arnold Ltd is my provider and I'm near London, United Kingdom");
  // Until the visitor answers, the connection counts nowhere.
  await expect(page.locator('#conn-outcome')).toBeEmpty();
});

test('each answer shows its outcome; "that\'s my VPN" reveals step 2', async ({ page }) => {
  await cannedWhoami(page);
  await open(page);
  await check(page);
  await answer(page, 'yes');
  await expect(page.locator('#conn-outcome .tag-leak')).toHaveCount(1);
  await expect(page.locator('#conn-outcome')).toContainText('This is your real connection.');
  await expect(page.locator('#conn-outcome a')).toHaveText('basic fix: hide your address with a VPN →');
  await answer(page, 'unsure');
  await expect(page.locator('#conn-outcome .tag-leak')).toHaveCount(1);
  await expect(page.locator('#conn-outcome')).toContainText('That\'s the case for most people.');
  await answer(page, 'vpn');
  await expect(page.locator('#conn-outcome .tag-ok')).toHaveCount(1);
  await expect(page.locator('#vpn-check')).toBeHidden();
  await page.getByRole('button', { name: 'TEST MY VPN →' }).click();
  await expect(page.locator('#vpn-check')).toBeVisible();
  await expect(page.locator('#vpn-title')).toBeFocused();
  await expect(page.locator('#vpn-rows > li')).toHaveCount(3);
  await expect(page.locator('#vpn-recap')).toHaveText('a connection from Andrews & Arnold Ltd near London, United Kingdom');
});

test('"is this you?" is a radio group that arrow keys move through, and nothing moves when picking', async ({ page }) => {
  await cannedWhoami(page);
  await open(page);
  await check(page);
  const radios = page.locator('#conn-question [role="radio"]');
  // Positions on the page (not the viewport), so focusing an option and scrolling doesn't count as moving.
  const boxes = () => page.evaluate(() => [...document.querySelectorAll('#conn-question [role="radio"], #run-connection')].map((el) => {
    const r = el.getBoundingClientRect();
    return [r.left + scrollX, r.top + scrollY, r.width, r.height].map((x) => Math.round(x));
  }));
  const before = await boxes();
  await radios.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(radios.nth(1)).toBeFocused();
  await expect(radios.nth(0)).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('ArrowUp');
  await expect(radios.nth(0)).toHaveAttribute('aria-checked', 'true');
  expect(await boxes()).toEqual(before);
});

test('the answer feeds the summary, and changing it asks the server nothing', async ({ page }) => {
  await cannedWhoami(page);
  await open(page);
  await check(page);
  const leaks = page.locator('#results .tile-leak span');
  await expect(leaks).toHaveText('0');
  /** @type {string[]} */
  const urls = [];
  page.on('request', (r) => urls.push(r.url()));
  await answer(page, 'yes');
  await expect(leaks).toHaveText('3');
  await answer(page, 'vpn');
  await expect(leaks).toHaveText('0');
  await expect(page.locator('#results .tile-ok span')).toHaveText('3');
  expect(urls.filter((u) => u.includes('/api/'))).toEqual([]);
});

test('Tor is recognised: no question, OK, and no step 2', async ({ page }) => {
  await cannedWhoami(page, () => ({ ...V4, tor: true }));
  await open(page);
  await check(page);
  await expect(page.locator('#conn-question')).toBeHidden();
  await expect(page.locator('#conn-outcome .tag-ok')).toHaveCount(1);
  await expect(page.locator('#conn-outcome')).toContainText('Sites see a Tor exit, not you.');
  await expect(page.locator('#conn-outcome button')).toHaveCount(0);
  await expect(page.locator('#results .tile-ok span')).toHaveText('3');
});

test('step 2 has three rows; WebRTC showing another address is a LEAK', async ({ page }) => {
  await fakeWebrtc(page, { srflx: ['198.51.100.7'] });
  await cannedWhoami(page);
  await open(page);
  await check(page);
  await answer(page, 'vpn');
  await page.getByRole('button', { name: 'TEST MY VPN →' }).click();
  const rows = page.locator('#vpn-rows > li');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAttribute('data-verdict', 'ok');
  await expect(rows.nth(1)).toHaveAttribute('data-verdict', 'leak');
  await expect(rows.nth(1)).toContainText('yes: they show another address, 198.51.100.•••');
  await expect(rows.nth(1)).toContainText("basic fix: use your VPN's own app");
  await expect(rows.nth(2)).toHaveAttribute('data-verdict', 'ok');
  await expect(page.locator('#vpn-summary')).toHaveText('2 OK · 1 leak');
});

test('step 2: matching WebRTC addresses are OK, and IPv6 on another network is a LEAK', async ({ page }) => {
  await fakeWebrtc(page, { srflx: ['81.2.69.142', '2001:480:10::1'] });
  await cannedWhoami(page, (u) => (u.hostname === 'ip6-localhost' ? { ...V6, asn: 12322, asOrg: 'Free SAS' } : V4));
  await open(page);
  await check(page);
  await answer(page, 'vpn');
  await page.getByRole('button', { name: 'TEST MY VPN →' }).click();
  const rows = page.locator('#vpn-rows > li');
  await expect(rows.nth(1)).toHaveAttribute('data-verdict', 'ok');
  await expect(rows.nth(2)).toHaveAttribute('data-verdict', 'leak');
  await expect(rows.nth(2)).toContainText('through Free SAS');
});

test('step 2 without any STUN answer says CAN\'T TELL with the reason, not because of the VPN', async ({ page }) => {
  await fakeWebrtc(page, { srflx: [] });
  await cannedWhoami(page);
  await open(page);
  await check(page);
  await answer(page, 'vpn');
  await page.getByRole('button', { name: 'TEST MY VPN →' }).click();
  await expect(page.locator('#vpn-rows > li').nth(1)).toHaveAttribute('data-verdict', 'unknown');
  await expect(page.locator('#vpn-rows > li').nth(1)).toContainText('nothing to compare');
});

test('the double-check is collapsed, then compares with the VPN off', async ({ page }) => {
  await cannedWhoami(page);
  await open(page);
  await check(page);
  await answer(page, 'vpn');
  await page.getByRole('button', { name: 'TEST MY VPN →' }).click();
  const toggle = page.locator('#vpn-dbl');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#vpn-compare')).toBeHidden();
  await toggle.click();
  await expect(page.locator('#vpn-compare')).toBeVisible();
  await expect(page.locator('#vpn-steps li')).toHaveText(['Turn your VPN off.', 'Press COMPARE.', 'Turn your VPN back on.']);
  // Same address with the VPN off: it isn't hiding anything.
  await page.locator('#vpn-off').click();
  await expect(page.locator('#vpn-off-result')).toContainText("same address: your VPN isn't hiding it");
  await expect(page.locator('#vpn-off-result .compare-card')).toHaveCount(2);
  await expect(page.locator('#vpn-off-result')).toContainText('Done? Turn your VPN back on.');
  await expect(page.locator('#vpn-rows > li').first()).toHaveAttribute('data-verdict', 'leak');
  await expect(page.locator('#results .tile-leak span')).toHaveText('3');
  // Another address with the VPN off: it was hiding the real one.
  await page.unroute('**/api/whoami');
  await cannedWhoami(page, () => ({ ...V4, ip: '198.51.100.7', city: 'Lyon', asOrg: 'Free SAS' }));
  await page.locator('#vpn-off').click();
  await expect(page.locator('#vpn-off-result')).toContainText('different addresses: your VPN hides your real one');
  await expect(page.locator('#vpn-off-result .is-without')).toContainText('Free SAS · Lyon');
  await expect(page.locator('#vpn-rows > li').first()).toHaveAttribute('data-verdict', 'ok');
});

test('a check from a new address asks again; a rescan from the same one keeps the answer', async ({ page }) => {
  await cannedWhoami(page);
  await open(page);
  await check(page);
  await answer(page, 'yes');
  await check(page);
  await expect(page.locator('#conn-question [aria-checked="true"]')).toHaveAttribute('data-answer', 'yes');
  await page.unroute('**/api/whoami');
  await cannedWhoami(page, () => ({ ...V4, ip: '198.51.100.7' }));
  await check(page);
  await expect(page.locator('#conn-question [aria-checked="true"]')).toHaveCount(0);
  await expect(page.locator('#conn-outcome')).toBeEmpty();
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
  expect(ice.flatMap((/** @type {any} */ c) => (c.iceServers ?? []).flatMap((/** @type {any} */ s) => [s.urls].flat()))).toEqual(STUN);
  await expect(page.locator('#connection')).not.toContainText(/undefined|null/);
});

test('the IP is masked until "show" is pressed', async ({ page }) => {
  await cannedWhoami(page);
  await open(page);
  await check(page);
  const reveal = page.locator('#reveal-ip');
  await expect(page.locator('#conn-ip')).toHaveText('81.2.69.•••');
  expect(await page.locator('#connection').innerText()).not.toMatch(FULL_IP);
  await reveal.click();
  await expect(reveal).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#conn-ip')).toHaveText('81.2.69.142');
  await reveal.click();
  expect(await page.locator('#connection').innerText()).not.toMatch(FULL_IP);
});

test('with the IPv6 origin blocked, the check still finishes', async ({ page }) => {
  await page.route('http://ip6-localhost:8080/**', (route) => route.abort());
  await open(page);
  await check(page);
  await expect(page.locator('#announce')).toContainText('Connection check finished');
  await expect(page.locator('#conn-result')).toBeVisible();
});

test('a 503 from /api/whoami says the lookup is unavailable, with no question', async ({ page }) => {
  await page.route('**/api/whoami', (route) => route.fulfill({
    status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': BASE }, body: '{"error":"data-unavailable"}',
  }));
  await open(page);
  await check(page);
  await expect(page.locator('#conn-note')).toContainText('lookup unavailable');
  await expect(page.locator('#conn-question')).toBeHidden();
});

test('testing on this machine explains why no public address is shown', async ({ page }) => {
  await cannedWhoami(page, () => ({ ...V4, ip: '127.0.0.1', country: null, city: null, asn: null, asOrg: null }));
  await open(page);
  await check(page);
  await expect(page.locator('#conn-lines')).toHaveText('this machine or your local network');
  await expect(page.locator('#conn-note')).toContainText("ombre can't see your public address from here");
  await expect(page.locator('#conn-question')).toBeHidden();
});

test('the local IP via WebRTC row is in the local network section, not here', async ({ page }) => {
  await cannedWhoami(page);
  for (const a of ['192.168.1.1', '192.168.0.1', '10.0.0.1', '192.168.1.254']) await page.route(`http://${a}/**`, (r) => r.abort('connectionrefused'));
  await open(page);
  await check(page);
  await expect(page.locator('#connection [data-finding="webrtcLocal"]')).toHaveCount(0);
  await page.locator('#run-localnet').click();
  await expect(page.locator('#localnet [data-finding="webrtcLocal"]')).toHaveCount(1, { timeout: 10_000 });
});
