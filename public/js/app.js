// @ts-check
// The page controller. It wires buttons to the other modules: scan the browser, check the
// connection, probe the local network, then show the fix plan and rescan.
// Everything is click-gated and kept in memory (state.js, plus a Set of ticked fixes):
// there is no storage, no cookie, no analytics, so closing the tab erases it all.
import { loadStrings, t, tList } from './i18n.js';
import { collectBrowser, judgeBrowser } from './browser.js';
import { renderFindings, renderSummary, announce, el } from './render.js';
import { state } from './state.js';
import { fetchWhoami, gatherIce, judgeConnection, compareVpnOff, stunUrls, primaryLookup, isLocalIp } from './connection.js';
import { probeRouters, permissionState, probeTimeout, judgeLocalnet } from './localnet.js';
import { FIXES, orderFixes, detectBrowser, buildFixCards, rescanText } from './fixes.js';

const root = document.documentElement;
// Top-level await: the page text must be loaded before anything is drawn.
// The language comes from the <html lang> of each translated page.
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
  // Once there are results, the 'run a scan' hint is no longer needed.
  const hint = document.querySelector('#results .hint');
  if (hint instanceof HTMLElement) hint.hidden = true;
}

// ---------- browser scan ----------
const runBtn = /** @type {HTMLButtonElement} */ (document.getElementById('run-scan'));
// Each check has a busy flag, so a double click cannot start two runs. We use aria-disabled
// (not `disabled`) so the button stays focusable for keyboard users.
let scanning = false;

/** Run the browser tests and show them. A click during a scan is ignored. */
async function runScan() {
  if (scanning) return;
  scanning = true;
  runBtn.setAttribute('aria-disabled', 'true');
  announce(t('scan.running'));
  try {
    // collect (read the browser), judge (decide verdicts), render (draw), then announce for screen readers.
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
const vpnHint = /** @type {HTMLElement} */ (document.getElementById('vpn-hint'));
const vpnRadios = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('#connection input[name="vpn"]'));
let checking = false;

/** The visitor's answer to "are you using a VPN?": true, false, or null before they answer. */
function usesVpn() {
  const picked = [...vpnRadios].find((r) => r.checked);
  return picked ? picked.value === 'yes' : null;
}

/** Draw the connection rows from the saved input and the current answer, masked unless reveal is pressed. */
function drawConnection() {
  const input = state.connectionInput;
  const vpn = usesVpn();
  if (!input || vpn === null) return;
  const reveal = revealBtn.getAttribute('aria-pressed') === 'true';
  state.connection = judgeConnection({ ...input, usesVpn: vpn, vpnOff: state.vpnOff, reveal }, t);
  renderFindings(connList, state.connection, t);
  const who = primaryLookup(input.main, input.v4, input.v6);
  tools.hidden = who === null;
  // The VPN-off check is only for visitors with a VPN, and makes no sense for Tor or Private
  // Relay, which hide the address on purpose, or for a local address (testing on this machine).
  vpnOffBox.hidden = !vpn || who === null || who.tor || who.privateRelay || isLocalIp(who.ip);
}

// The check button works only once the visitor has answered, because the answer decides the verdicts.
// Changing the answer later re-judges the rows on the spot, without asking the server again.
for (const radio of vpnRadios) {
  radio.addEventListener('change', () => {
    // The hint is gone, so the button stops pointing to it (screen readers read hidden text too).
    vpnHint.hidden = true;
    connBtn.removeAttribute('aria-describedby');
    if (!checking) connBtn.removeAttribute('aria-disabled');
    if (!state.connectionInput) return;
    drawConnection();
    updateSummary();
  });
}

/** Ask our own server for the address on this origin and on the single-family origins, and run WebRTC. */
async function runConnection() {
  if (checking) return;
  // Not answered yet: lead the visitor to the question instead of doing nothing.
  if (usesVpn() === null) {
    vpnRadios[0].focus();
    announce(t('connection.vpn.hint'));
    return;
  }
  checking = true;
  state.ran.connection = true;
  connBtn.setAttribute('aria-disabled', 'true');
  // The previous VPN-off answer is kept only if this check sees the same address (see below).
  const before = state.checked;
  const kept = { vpnOff: state.vpnOff, text: vpnOffResult.textContent };
  vpnOffResult.textContent = '';
  state.vpnOff = null;
  announce(t('connection.running'));
  try {
    // /api/origins gives the IPv4-only and IPv6-only hostnames and the STUN port.
    const originsRes = await fetch('/api/origins', { credentials: 'omit', cache: 'no-store' }).catch(() => null);
    /** @type {import('./connection.js').Origins|null} */
    const origins = originsRes?.ok ? await originsRes.json().catch(() => null) : null;
    state.origins = origins;
    // All lookups run together. The v4/v6 lookups use single-family hostnames so we know the
    // address for each family; WebRTC asks our STUN server which public addresses it exposes,
    // and lists the local ones (with no origins, only the local ones: no server is asked).
    const [main, v4, v6, ice] = await Promise.all([
      fetchWhoami(''),
      origins ? fetchWhoami(origins.v4) : null,
      origins ? fetchWhoami(origins.v6) : null,
      gatherIce(origins ? stunUrls(origins) : []).catch(() => null),
    ]);
    // Kept so 'reveal' and a changed answer can redraw the findings without asking the network again.
    state.connectionInput = { main, v4, v6, ice };
    const who = primaryLookup(main, v4, v6);
    // The address of this check is what the VPN-off check compares with. If it hasn't changed
    // since the last check (a rescan, say), the earlier VPN-off answer still holds.
    state.checked = who ? { ip: who.ip, family: who.family } : null;
    if (before && state.checked && compareVpnOff(before, state.checked) === 'same') {
      state.vpnOff = kept.vpnOff;
      vpnOffResult.textContent = kept.text;
    }
    drawConnection();
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

// Reveal toggles masking of the IP; judging runs again from the saved input.
revealBtn.addEventListener('click', () => {
  revealBtn.setAttribute('aria-pressed', String(revealBtn.getAttribute('aria-pressed') !== 'true'));
  drawConnection();
});

let rechecking = false;
vpnOffBtn.addEventListener('click', async () => {
  const first = state.checked;
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
    // The comparison decides the public IP, provider, location and VPN rows, so redraw them.
    // With no answer, the rows go back to CAN'T TELL rather than keep an older comparison.
    state.vpnOff = after ? compareVpnOff(first, after) : null;
    drawConnection();
    updateSummary();
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
    // Ask the permission state first: if the browser will show a prompt, the probe waits
    // 30 s for the visitor instead of 3 s.
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

// Cards are built once; changing the threat only reorders them.
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
  // The VPN-off result is not cleared here: the connection rerun keeps it if the address is unchanged.
  // The 'before' count is taken now, before the rescan replaces the findings.
  const before = state.browser.length ? leaking() : null;
  try {
    announce(t('fix.rescan.running'));
    await runScan();
    // Only rerun what the visitor already chose to run. We never start a network check for them.
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
