// @ts-check
import { loadStrings, t, tList } from './i18n.js';
import { collectBrowser, judgeBrowser } from './browser.js';
import { renderFindings, renderSummary, announce, el } from './render.js';
import { state } from './state.js';
import { fetchWhoami, gatherSrflx, judgeConnection, compareVpnOff, stunUrls, primaryLookup } from './connection.js';
import { probeRouters, permissionState, probeTimeout, judgeLocalnet } from './localnet.js';
import zoneCountries from './tz-countries.js';
import { FIXES, orderFixes, detectBrowser, buildFixCards, rescanText } from './fixes.js';

const root = document.documentElement;
await loadStrings(root.lang);

// data-i18n="key" sets the text; placeholders come from the element's other data-* attributes.
for (const el of document.querySelectorAll('[data-i18n]')) {
  const html = /** @type {HTMLElement} */ (el);
  html.textContent = t(html.dataset.i18n ?? '', { ...html.dataset });
}
// data-i18n-attr="aria-label:key" (several pairs separated by commas) sets attributes.
for (const el of document.querySelectorAll('[data-i18n-attr]')) {
  for (const pair of (el.getAttribute('data-i18n-attr') ?? '').split(',')) {
    const [attr, key] = pair.split(':').map((s) => s.trim());
    el.setAttribute(attr, t(key));
  }
}
root.dataset.i18nReady = root.lang;

/** Leak and OK counts, formatted for the page language. @param {import('./browser.js').Finding[]} findings */
function counts(findings) {
  const num = new Intl.NumberFormat(root.lang);
  const count = (/** @type {string} */ v) => num.format(findings.filter((f) => f.verdict === v).length);
  return { leak: count('leak'), ok: count('ok') };
}

/** The summary tiles count every section's findings together. */
function updateSummary() {
  renderSummary(/** @type {HTMLElement} */ (document.querySelector('#results .tiles')), [...state.browser, ...state.connection, ...state.localnet], t, state.browser.length > 0);
  const hint = document.querySelector('#results .hint');
  if (hint instanceof HTMLElement) hint.hidden = true;
}

// ---------- browser scan ----------
const runBtn = /** @type {HTMLButtonElement} */ (document.getElementById('run-scan'));
let scanning = false;

/** Run the browser tests and show them. A click during a scan is ignored. */
async function runScan() {
  if (scanning) return;
  scanning = true;
  runBtn.setAttribute('aria-disabled', 'true');
  announce(t('scan.running'));
  try {
    const findings = judgeBrowser(await collectBrowser(), t, root.lang);
    state.browser = findings;
    renderFindings(/** @type {HTMLUListElement} */ (document.querySelector('#browser .findings')), findings, t);
    updateSummary();
    announce(t('scan.done', counts(findings)));
  } catch {
    announce(t('scan.failed'));
  } finally {
    scanning = false;
    runBtn.removeAttribute('aria-disabled');
  }
}
runBtn.addEventListener('click', runScan);

// ---------- connection check ----------
const connBtn = /** @type {HTMLButtonElement} */ (document.getElementById('run-connection'));
const revealBtn = /** @type {HTMLButtonElement} */ (document.getElementById('reveal-ip'));
const vpnOffBtn = /** @type {HTMLButtonElement} */ (document.getElementById('vpn-off'));
const vpnOffBox = /** @type {HTMLElement} */ (document.getElementById('vpn-off-box'));
const vpnOffResult = /** @type {HTMLElement} */ (document.getElementById('vpn-off-result'));
const tools = /** @type {HTMLElement} */ (document.getElementById('connection-tools'));
const connList = /** @type {HTMLUListElement} */ (document.querySelector('#connection .findings'));
let checking = false;

/** Draw the connection rows, masked unless reveal is pressed. */
function drawConnection() {
  if (!state.connectionInput) return;
  const reveal = revealBtn.getAttribute('aria-pressed') === 'true';
  state.connection = judgeConnection({ ...state.connectionInput, reveal }, t);
  renderFindings(connList, state.connection, t);
}

/** Ask our own server for the address on this origin and on the single-family origins, and run STUN. */
async function runConnection() {
  if (checking) return;
  checking = true;
  state.ran.connection = true;
  connBtn.setAttribute('aria-disabled', 'true');
  // An old VPN-off answer would describe the previous check.
  vpnOffResult.textContent = '';
  announce(t('connection.running'));
  try {
    const originsRes = await fetch('/api/origins', { credentials: 'omit', cache: 'no-store' }).catch(() => null);
    /** @type {import('./connection.js').Origins|null} */
    const origins = originsRes?.ok ? await originsRes.json().catch(() => null) : null;
    state.origins = origins;
    const [main, v4, v6, srflx] = await Promise.all([
      fetchWhoami(''),
      origins ? fetchWhoami(origins.v4) : null,
      origins ? fetchWhoami(origins.v6) : null,
      origins ? gatherSrflx(stunUrls(origins)).catch(() => null) : null,
    ]);
    state.connectionInput = {
      main, v4, v6, srflx, zoneCountries,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    drawConnection();
    const who = primaryLookup(main, v4, v6);
    if (who) state.first ??= { ip: who.ip, family: who.family };
    tools.hidden = who === null;
    vpnOffBox.hidden = who === null || who.tor || who.privateRelay;
    updateSummary();
    announce(t('connection.done', counts(state.connection)));
  } catch {
    announce(t('connection.failed'));
  } finally {
    checking = false;
    connBtn.removeAttribute('aria-disabled');
  }
}
connBtn.addEventListener('click', runConnection);

revealBtn.addEventListener('click', () => {
  revealBtn.setAttribute('aria-pressed', String(revealBtn.getAttribute('aria-pressed') !== 'true'));
  drawConnection();
});

let rechecking = false;
vpnOffBtn.addEventListener('click', async () => {
  const first = state.first;
  if (rechecking || !first) return;
  rechecking = true;
  vpnOffBtn.setAttribute('aria-disabled', 'true');
  vpnOffResult.textContent = '';
  try {
    // Compare like with like: the main lookup if it has the first address's family, else that family's origin.
    const lookups = [await fetchWhoami('')];
    const main = primaryLookup(lookups[0], null, null);
    let after = main?.family === first.family ? main : null;
    if (!after && state.origins) {
      lookups.push(await fetchWhoami(first.family === 4 ? state.origins.v4 : state.origins.v6));
      after = primaryLookup(lookups[1], null, null);
    }
    after ??= main;
    const failed = lookups.includes('busy') ? 'finding.publicIp.busy' : 'connection.vpnOff.failed';
    vpnOffResult.textContent = after ? t(`connection.vpnOff.${compareVpnOff(first, after)}`) : t(failed);
  } finally {
    rechecking = false;
    vpnOffBtn.removeAttribute('aria-disabled');
  }
});

// ---------- local network probe ----------
const localBtn = /** @type {HTMLButtonElement} */ (document.getElementById('run-localnet'));
let probing = false;

/** Try the router addresses and check for the browser's permission prompt. A click during a probe is ignored. */
async function runLocalnet() {
  if (probing) return;
  probing = true;
  state.ran.localnet = true;
  localBtn.setAttribute('aria-disabled', 'true');
  announce(t('localnet.running'));
  try {
    const permission = await permissionState();
    const router = await probeRouters(fetch, performance.now.bind(performance), probeTimeout(permission));
    state.localnet = judgeLocalnet({ router, promptSupported: permission !== null }, t);
    renderFindings(/** @type {HTMLUListElement} */ (document.querySelector('#localnet .findings')), state.localnet, t);
    updateSummary();
    announce(t('localnet.done', counts(state.localnet)));
  } catch {
    announce(t('localnet.failed'));
  } finally {
    probing = false;
    localBtn.removeAttribute('aria-disabled');
  }
}
localBtn.addEventListener('click', runLocalnet);

// ---------- fix plan ----------
const fixSection = /** @type {HTMLElement} */ (document.getElementById('fix'));
const showFixesBtn = /** @type {HTMLButtonElement} */ (document.getElementById('show-fixes'));
const fixList = /** @type {HTMLOListElement} */ (fixSection.querySelector('.fix-list'));
const doneCount = /** @type {HTMLElement} */ (document.getElementById('fix-done'));
const progressBar = /** @type {HTMLElement} */ (fixSection.querySelector('.progress-bar'));
const rescanBtn = /** @type {HTMLButtonElement} */ (document.getElementById('rescan'));
const rescanResult = /** @type {HTMLElement} */ (document.getElementById('rescan-result'));
/** Ticked fixes, in memory only: they vanish with the tab. @type {Set<string>} */
const done = new Set();

/** Show "N / 7 done" and one block per fix, filled when ticked. */
function drawProgress() {
  const num = new Intl.NumberFormat(root.lang);
  doneCount.textContent = t('fix.progress.done', { n: num.format(done.size), total: num.format(FIXES.length) });
  progressBar.replaceChildren(...FIXES.map((_, i) => el('span', i < done.size ? 'bar-cell is-done' : 'bar-cell')));
}

const cards = buildFixCards({
  t, tList, lang: root.lang,
  browser: detectBrowser(/** @type {{userAgent: string, brave?: unknown}} */ (navigator)),
  onToggle: (id, on) => {
    if (on) done.add(id); else done.delete(id);
    drawProgress();
  },
});

/** Put the cards in the order for the picked threat; moving the nodes keeps ticks and open panels. */
function orderCards() {
  const picked = fixSection.querySelector('input[name="threat"]:checked');
  const threat = picked instanceof HTMLInputElement ? /** @type {import('./fixes.js').Threat} */ (picked.value) : null;
  fixList.replaceChildren(...orderFixes(threat).map((f) => /** @type {HTMLLIElement} */ (cards.get(f.id))));
}
orderCards();
drawProgress();
for (const radio of fixSection.querySelectorAll('input[name="threat"]')) radio.addEventListener('change', orderCards);

showFixesBtn.addEventListener('click', () => {
  fixSection.hidden = false;
  showFixesBtn.setAttribute('aria-expanded', 'true');
  /** @type {HTMLElement} */ (document.getElementById('fix-title')).focus();
});

/** Leaks across every section's current findings. */
const leaking = () => [...state.browser, ...state.connection, ...state.localnet].filter((f) => f.verdict === 'leak').length;

let rescanning = false;
/** Rerun the browser scan, plus the click-gated checks the visitor already ran here, then compare leak counts. */
rescanBtn.addEventListener('click', async () => {
  if (rescanning) return;
  rescanning = true;
  rescanBtn.setAttribute('aria-disabled', 'true');
  rescanResult.textContent = '';
  vpnOffResult.textContent = '';
  const before = state.browser.length ? leaking() : null;
  try {
    announce(t('fix.rescan.running'));
    await runScan();
    if (state.ran.connection) await runConnection();
    if (state.ran.localnet) await runLocalnet();
    const num = new Intl.NumberFormat(root.lang);
    const text = rescanText(t, before === null ? null : num.format(before), num.format(leaking()));
    rescanResult.textContent = text;
    announce(text);
  } finally {
    rescanning = false;
    rescanBtn.removeAttribute('aria-disabled');
  }
});
