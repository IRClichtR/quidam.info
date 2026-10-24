// @ts-check
// The fix plan: the v1 fixes, their order for each threat, the detected browser, and the cards.
import { el, icon } from './render.js';

/** @typedef {import('./browser.js').FindingId} FindingId */
/** @typedef {import('./browser.js').T} T */
/** @typedef {'block'|'dns'|'perms'|'browser'|'ip'|'split'|'tor'} FixId */
/** @typedef {'ads'|'network'|'targeted'} Threat */
/** @typedef {'chrome'|'firefox'|'safari'|'edge'|'brave'|'other'} BrowserName */
/**
 * `hides`: 1 some, 2 a lot, 3 most. `tags[].label` is the key suffix of its `fix.tag.*` string.
 * @typedef {{id: FixId, tier: 'quick'|'week'|'strong', hides: 1|2|3, minutes: number, tags: {label: string, finding: FindingId|null}[]}} Fix
 */

/** @type {BrowserName[]} */
export const BROWSERS = ['chrome', 'firefox', 'safari', 'edge', 'brave', 'other'];

/** The spec's v1 fixes, in default order. @type {Fix[]} */
export const FIXES = [
  { id: 'block', tier: 'quick', hides: 2, minutes: 2, tags: [{ label: 'trackers', finding: null }, { label: 'fingerprintScripts', finding: 'canvas' }] },
  { id: 'dns', tier: 'quick', hides: 2, minutes: 1, tags: [{ label: 'dns', finding: null }] },
  { id: 'perms', tier: 'quick', hides: 1, minutes: 2, tags: [{ label: 'location', finding: 'location' }] },
  {
    id: 'browser', tier: 'week', hides: 3, minutes: 30,
    tags: [{ label: 'screen', finding: 'screen' }, { label: 'fonts', finding: 'fonts' }, { label: 'gpu', finding: 'gpu' }, { label: 'canvas', finding: 'canvas' }],
  },
  {
    id: 'ip', tier: 'week', hides: 3, minutes: 15,
    tags: [{ label: 'publicIp', finding: 'publicIp' }, { label: 'provider', finding: 'provider' }, { label: 'location', finding: 'location' }],
  },
  { id: 'split', tier: 'week', hides: 2, minutes: 10, tags: [{ label: 'cookies', finding: null }, { label: 'profileLinking', finding: null }] },
  { id: 'tor', tier: 'strong', hides: 3, minutes: 10, tags: [{ label: 'ip', finding: 'publicIp' }, { label: 'fingerprint', finding: 'canvas' }, { label: 'dns', finding: null }] },
];

/** @type {Record<Threat, FixId[]>} */
const PROMOTED = { ads: ['block', 'browser'], network: ['dns', 'ip'], targeted: ['tor', 'ip'] };

/**
 * The fixes for a threat: its promoted fixes first, then the rest in default order. No threat keeps the default order.
 * @param {Threat|null} threat
 * @returns {Fix[]}
 */
export function orderFixes(threat) {
  const first = threat ? PROMOTED[threat] : [];
  const byId = (/** @type {FixId} */ id) => /** @type {Fix} */ (FIXES.find((f) => f.id === id));
  return [...first.map(byId), ...FIXES.filter((f) => !first.includes(f.id))];
}

/**
 * Which browser's steps to show. Brave sends Chrome's user agent but exposes `navigator.brave`;
 * Edge adds `Edg/`. Other Chromium browsers (Opera, Samsung, Vivaldi) get the generic steps.
 * @param {{userAgent: string, brave?: unknown}} nav
 * @returns {BrowserName}
 */
export function detectBrowser(nav) {
  const ua = nav.userAgent;
  if (nav.brave) return 'brave';
  if (/\bEdg(A|iOS)?\//.test(ua)) return 'edge';
  if (/\b(OPR|SamsungBrowser|Vivaldi|YaBrowser)\//.test(ua)) return 'other';
  if (/\b(Firefox|FxiOS)\//.test(ua)) return 'firefox';
  if (/(Chrome|CriOS|Chromium)\//.test(ua)) return 'chrome';
  if (/\bVersion\/[\d.]+.*\bSafari\//.test(ua)) return 'safari';
  return 'other';
}

/** Connection findings: without their row, a tag link goes to the button that makes it. */
const CONNECTION = ['publicIp', 'provider', 'location'];

/**
 * A tag: a link to its finding row when it has one, plain text otherwise.
 * @param {Fix['tags'][number]} tag
 * @param {T} t
 */
function tagItem(tag, t) {
  const li = el('li');
  const text = `${t('fix.tags.prefix')} ${t(`fix.tag.${tag.label}`)}`;
  if (tag.finding === null) {
    li.append(el('span', 'fix-tag', text));
    return li;
  }
  const id = tag.finding;
  const a = /** @type {HTMLAnchorElement} */ (el('a', 'fix-tag', text));
  a.href = `#finding-${id}`;
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.getElementById(`finding-${id}`) ?? document.getElementById(CONNECTION.includes(id) ? 'run-connection' : 'run-scan');
    target?.focus();
  });
  li.append(a);
  return li;
}

/**
 * Three blocks, filled or outlined, named for screen readers.
 * @param {1|2|3} hides
 * @param {T} t
 */
function meter(hides, t) {
  const m = el('span', 'meter');
  m.setAttribute('role', 'img');
  m.setAttribute('aria-label', t('fix.hides.aria', { level: t(`fix.hides.${hides}`) }));
  for (const k of [1, 2, 3]) m.append(el('span', k <= hides ? 'meter-cell is-on' : 'meter-cell'));
  return m;
}

/**
 * @param {string} key
 * @param {HTMLElement} value
 * @param {string} [text] shown next to `value`, hidden from screen readers when `value` already names it
 */
function metaRow(key, value, text) {
  const row = el('div', 'fix-meta-row');
  const label = el('span', 'fix-meta-key', key);
  row.append(label, value);
  if (text !== undefined) {
    label.setAttribute('aria-hidden', 'true');
    const v = el('span', 'fix-meta-val', text);
    v.setAttribute('aria-hidden', 'true');
    row.append(v);
  }
  return row;
}

let seq = 0;

/**
 * One card per fix, keyed by id, so a reorder moves the same nodes (ticks and open panels stay).
 * @param {{t: T, tList: (key: string) => string[], browser: BrowserName, lang: string, onToggle: (id: FixId, done: boolean) => void}} opts
 * @returns {Map<FixId, HTMLLIElement>}
 */
export function buildFixCards({ t, tList, browser, lang, onToggle }) {
  const num = new Intl.NumberFormat(lang);
  /** @type {Map<FixId, HTMLLIElement>} */
  const cards = new Map();
  for (const fix of FIXES) {
    const n = ++seq;
    const li = /** @type {HTMLLIElement} */ (el('li', 'fix-card'));
    li.dataset.fix = fix.id;

    const box = /** @type {HTMLInputElement} */ (el('input'));
    box.type = 'checkbox';
    box.addEventListener('change', () => onToggle(fix.id, box.checked));
    const title = el('span', 'fix-title', t(`fix.${fix.id}.title`));
    title.id = `fix-title-${fix.id}-${n}`;
    const why = el('span', 'fix-why', t(`fix.${fix.id}.why`));
    why.id = `fix-why-${fix.id}-${n}`;
    box.setAttribute('aria-labelledby', title.id);
    box.setAttribute('aria-describedby', why.id);
    const text = el('span', 'fix-text');
    text.append(title, why);
    const check = el('label', 'fix-check');
    check.append(box, text);

    const meta = el('div', 'fix-meta');
    meta.append(
      metaRow(t('fix.hides.label'), meter(fix.hides, t), t(`fix.hides.${fix.hides}`)),
      metaRow(t('fix.effort.label'), el('span', 'fix-meta-val', t('fix.effort.value', { n: num.format(fix.minutes) }))),
    );
    const head = el('div', 'fix-head');
    head.append(check, meta);

    const tags = el('ul', 'fix-tags');
    tags.append(...fix.tags.map((tag) => tagItem(tag, t)));

    const panel = el('div', 'panel');
    panel.id = `fix-panel-${fix.id}-${n}`;
    panel.hidden = true;
    const steps = el('div', 'panel-col');
    const list = el('ol', 'fix-steps');
    list.append(...tList(`fix.${fix.id}.steps.${browser}`).map((s) => el('li', undefined, s)));
    steps.append(el('p', 'label', t('fix.steps.title', { browser: t(`fix.browser.${browser}`) })), list);
    const trade = el('div', 'panel-col');
    trade.append(el('p', 'label', t('fix.tradeoff.label')), el('p', undefined, t(`fix.${fix.id}.tradeoff`)));
    panel.append(steps, trade);

    const toggle = /** @type {HTMLButtonElement} */ (el('button', 'fix-toggle'));
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', panel.id);
    toggle.append(icon('chevron', 2), el('span', undefined, t('fix.steps.toggle')));
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
    });

    li.append(el('p', 'label fix-tier', t(`fix.tier.${fix.tier}`)), head, tags, toggle, panel);
    cards.set(fix.id, li);
  }
  return cards;
}

/**
 * The rescan result: leak counts before and after, or only after when there was nothing to compare with.
 * @param {T} t
 * @param {string|null} before formatted count, null when the browser scan had not run
 * @param {string} after formatted count
 */
export function rescanText(t, before, after) {
  return before === null ? t('fix.rescan.after', { after }) : t('fix.rescan.result', { before, after });
}
