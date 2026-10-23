// @ts-check
import { loadStrings, t } from './i18n.js';
import { collectBrowser, judgeBrowser } from './browser.js';
import { renderFindings, renderSummary, announce } from './render.js';
import { state } from './state.js';

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
    renderSummary(/** @type {HTMLElement} */ (document.querySelector('#results .tiles')), findings, t);
    const hint = document.querySelector('#results .hint');
    if (hint instanceof HTMLElement) hint.hidden = true;
    const num = new Intl.NumberFormat(root.lang);
    const count = (/** @type {string} */ v) => num.format(findings.filter((f) => f.verdict === v).length);
    announce(t('scan.done', { leak: count('leak'), ok: count('ok') }));
  } catch {
    announce(t('scan.failed'));
  } finally {
    scanning = false;
    runBtn.removeAttribute('aria-disabled');
  }
}
runBtn.addEventListener('click', runScan);
