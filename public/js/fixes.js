// @ts-check
// The fix plan: one card per problem (problems.js), each with one basic fix.
// Product policy: we name tools by type and never push one brand. A fix that needs a product
// lists several options in alphabetical order, filtered to the visitor's platform, and says
// which ones it left out. Nothing is sponsored. Ticks and open panels live in app.js memory only.
import { el, icon } from './render.js';

/** @typedef {import('./browser.js').Finding} Finding */
/** @typedef {import('./browser.js').T} T */
/** @typedef {import('./problems.js').Problem} Problem */
/** @typedef {import('./problems.js').ProblemId} ProblemId */
/** @typedef {'chrome'|'firefox'|'safari'|'edge'|'brave'|'other'} BrowserName */
/** @typedef {'windows'|'mac'|'linux'|'ios'|'android'|'other'} Platform */
/**
 * `note` is the key suffix of its `fix.opt.*` string. `on` lists the platforms it exists on;
 * `notIn` the browsers it can't be added to (extensions).
 * @typedef {{name: string, note: string, on: Platform[], notIn?: BrowserName[]}} Option
 */

/** @type {BrowserName[]} */
export const BROWSERS = ['chrome', 'firefox', 'safari', 'edge', 'brave', 'other'];
/** @type {Platform[]} */
const EVERYWHERE = ['windows', 'mac', 'linux', 'ios', 'android', 'other'];
/** @type {Platform[]} */
const DESKTOP = ['windows', 'mac', 'linux', 'other'];

// Browsers that give every user the same, or scrambled, answers. Opera is not listed: it has no
// fingerprinting protection, and its built-in "VPN" covers only the browser.
/** @type {Option[]} */
const BLENDING_BROWSERS = [
  { name: 'Brave', note: 'brave', on: EVERYWHERE },
  { name: 'DuckDuckGo', note: 'duckduckgo', on: ['windows', 'mac', 'ios', 'android'] },
  { name: 'Firefox', note: 'firefox', on: EVERYWHERE },
  { name: 'Mullvad Browser', note: 'mullvadBrowser', on: ['windows', 'mac', 'linux'] },
  { name: 'Safari', note: 'safari', on: ['mac', 'ios'] },
  { name: 'Tor Browser', note: 'torBrowser', on: ['windows', 'mac', 'linux', 'android'] },
];

// VPNs with a published independent audit, run by owners who don't make money from ads or data.
// The criteria are stated on the card; companies left out are never named.
/** @type {Record<ProblemId, Option[]>} */
export const OPTIONS = {
  browser: BLENDING_BROWSERS,
  where: [
    { name: 'Mullvad', note: 'mullvad', on: EVERYWHERE },
    { name: 'NymVPN', note: 'nymvpn', on: EVERYWHERE },
    { name: 'Proton VPN', note: 'protonvpn', on: EVERYWHERE },
  ],
  home: [],
  gpc: [
    { name: 'DuckDuckGo Privacy Essentials', note: 'ddgEssentials', on: DESKTOP, notIn: ['safari'] },
    { name: 'Privacy Badger', note: 'privacyBadger', on: DESKTOP, notIn: ['safari'] },
  ],
  webrtc: BLENDING_BROWSERS,
};

/** Effort, as the key suffix of `fix.<id>.effort`. */
// Order matters: many browsers say 'Chrome' in their user agent, so the more specific
// names are tested before the general ones. Safari's user agent has 'Safari' but not 'Chrome'.
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

// navigator.userAgentData (Chromium) names the platform directly; other browsers only have the
// user agent string. iPads ask for desktop pages and say "Macintosh", but have a touch screen.
/**
 * The visitor's operating system, to hide options that don't exist there.
 * @param {{userAgent: string, userAgentData?: {platform?: string}, maxTouchPoints?: number}} nav
 * @returns {Platform}
 */
export function detectPlatform(nav) {
  const hint = (nav.userAgentData?.platform ?? '').toLowerCase();
  const ua = nav.userAgent;
  if (hint === 'windows' || (!hint && /Windows/.test(ua))) return 'windows';
  if (hint === 'android' || (!hint && /Android/.test(ua))) return 'android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (hint === 'macos' || (!hint && /Macintosh|Mac OS X/.test(ua))) return (nav.maxTouchPoints ?? 0) > 1 ? 'ios' : 'mac';
  if (hint === 'linux' || hint === 'chrome os' || (!hint && /Linux|X11|CrOS/.test(ua))) return 'linux';
  return 'other';
}

/**
 * The options to show for a problem, alphabetically, and the names left out on this platform or browser.
 * An unknown platform hides nothing.
 * @param {ProblemId} id
 * @param {Platform} platform
 * @param {BrowserName} browser
 * @returns {{shown: Option[], hidden: string[], where: 'platform'|'browser'|null}}
 */
export function optionsFor(id, platform, browser) {
  const byName = (/** @type {Option} */ a, /** @type {Option} */ b) => a.name.localeCompare(b.name, 'en');
  const all = [...OPTIONS[id]].sort(byName);
  const offPlatform = (/** @type {Option} */ o) => platform !== 'other' && !o.on.includes(platform);
  const offBrowser = (/** @type {Option} */ o) => (o.notIn ?? []).includes(browser);
  const shown = all.filter((o) => !offPlatform(o) && !offBrowser(o));
  const hidden = all.filter((o) => !shown.includes(o));
  // The note names the reason: the platform when it explains every hidden option, else the browser.
  const where = !hidden.length ? null : hidden.every(offPlatform) ? 'platform' : 'browser';
  return { shown, hidden: hidden.map((o) => o.name), where };
}

/** Problems whose coverage is a count ("closes 3 of 3"); the browser card says it depends instead. */
const MEASURED = /** @type {ProblemId[]} */ (['where', 'home', 'gpc', 'webrtc']);

/**
 * `key` narrowed to the first of `specifics` the language file has a variant for, else `key`.
 * @param {string} key @param {string[]} specifics most specific first
 * @param {(key: string) => boolean} has
 */
export function specificKey(key, specifics, has) {
  return specifics.map((s) => `${key}.${s}`).find((k) => has(k)) ?? key;
}

/** @param {'leak'|'ok'} kind @param {string} text */
function tagEl(kind, text) {
  const node = el('span', `tag tag-${kind}`);
  node.append(icon(kind), text);
  return node;
}

/**
 * @typedef {{
 *   t: T, tList: (key: string) => string[], tPlural: (key: string, n: number, vars?: Record<string, string|number|undefined>) => string,
 *   has: (key: string) => boolean, lang: string, browser: BrowserName, platform: Platform,
 *   onDone: (id: ProblemId, done: boolean) => void, onOpen: (id: ProblemId, open: boolean) => void,
 *   onCheck: (id: ProblemId) => void,
 * }} CardContext
 */

// Unique suffix for ids, so aria-controls and aria-describedby never point to the wrong card.
let seq = 0;

/**
 * One card: the problem on the left, its basic fix on the right, the steps in a panel below.
 * A done card collapses to one line with an undo button.
 * @param {Problem} problem
 * @param {{index: number, total: number, done: boolean, open: boolean, stale: boolean, checkResult: string|null}} where
 * @param {CardContext} ctx
 * @returns {HTMLLIElement}
 */
export function buildProblemCard(problem, { index, total, done, open, stale, checkResult }, ctx) {
  const { t, tPlural, lang, browser, platform } = ctx;
  const { id } = problem;
  const n = ++seq;
  const num = new Intl.NumberFormat(lang);
  const li = /** @type {HTMLLIElement} */ (el('li', 'problem-card'));
  li.dataset.problem = id;
  if (index === 0) li.classList.add('is-first');
  const title = t(`fix.${id}.title`);
  const fixName = t(`fix.${id}.fix`);

  if (done) {
    li.classList.add('is-done');
    const row = el('div', 'card-done');
    const text = el('span', 'card-done-text');
    text.append(title, ' ');
    const arrow = el('span', undefined, '→');
    arrow.setAttribute('aria-hidden', 'true');
    text.append(arrow, ' ', el('strong', undefined, fixName));
    const undo = /** @type {HTMLButtonElement} */ (el('button', 'link-btn', t('fix.undo')));
    undo.type = 'button';
    undo.dataset.action = 'undo';
    undo.setAttribute('aria-describedby', `card-done-${n}`);
    text.id = `card-done-${n}`;
    undo.addEventListener('click', () => ctx.onDone(id, false));
    row.append(tagEl('ok', t('fix.fixed')), text, undo);
    li.append(row);
    return li;
  }

  // ----- left: the problem -----
  const head = el('div', 'card-index');
  head.append(el('span', 'card-count', `${num.format(index + 1)} / ${num.format(total)}`));
  if (index === 0) head.append(el('span', 'badge', t('fix.startHere')));

  const left = el('div', 'card-problem');
  const leftTags = el('div', 'tag-row');
  leftTags.append(tagEl('leak', t('fix.problem')), el('span', 'card-leaks', tPlural('fix.leaks', problem.leaks.length)));
  const h3 = el('h3', 'card-title', title);
  h3.id = `card-title-${n}`;
  const chips = el('ul', 'chips');
  chips.setAttribute('aria-label', t('fix.seen'));
  chips.append(...problem.leaks.map((f) => el('li', 'chip', t('fix.chip', { label: t(`finding.${f.id}.label`), value: f.value }))));
  left.append(leftTags, h3, el('p', 'card-desc', t(`fix.${id}.desc`)), chips);

  const arrow = el('div', 'card-arrow', '→');
  arrow.setAttribute('aria-hidden', 'true');

  // ----- right: the basic fix -----
  const right = el('div', 'card-fix');
  const rightTags = el('div', 'tag-row');
  rightTags.append(tagEl('ok', t('fix.basicFix')), el('span', 'card-effort', t(specificKey(`fix.${id}.effort`, [platform], ctx.has))));
  const h4 = el('h4', 'fix-name', fixName);
  h4.id = `fix-name-${n}`;
  const { shown, hidden, where } = optionsFor(id, platform, browser);
  // The fix names products, but none of them exists here: the card must not promise what they do.
  const noOptions = !shown.length && hidden.length > 0;
  right.append(rightTags, h4, el('p', 'fix-desc', t(noOptions ? `fix.${id}.fixDesc.noOptions` : `fix.${id}.fixDesc`)));

  if (shown.length || hidden.length) {
    const box = el('div', 'options');
    if (shown.length) {
      const list = el('ul', 'option-list');
      list.append(...shown.map((o) => {
        const row = el('li');
        row.append(el('strong', 'option-name', o.name), el('span', 'option-note', t(`fix.opt.${o.note}`)));
        return row;
      }));
      box.append(el('p', 'label', t('fix.pickOne')), list);
    }
    /** @type {string[]} */
    const notes = [];
    if (hidden.length) {
      const place = where === 'platform' ? t(`fix.platform.${platform}`) : t(`fix.browser.${browser}`);
      notes.push(t('fix.notOn', { where: place, names: hidden.join(', ') }));
    }
    if (id === 'where') notes.unshift(t(platform === 'mac' ? 'fix.where.alt.mac' : platform === 'ios' ? 'fix.where.alt.ios' : 'fix.where.alt.other'));
    if (notes.length) box.append(el('p', 'options-note', notes.join(' ')));
    right.append(box);
  }

  if (MEASURED.includes(id) && problem.closed !== null && !noOptions) {
    const cover = el('div', 'coverage');
    const meter = el('span', 'meter');
    meter.setAttribute('aria-hidden', 'true');
    for (let k = 0; k < problem.leaks.length; k++) meter.append(el('span', k < problem.closed ? 'meter-cell is-on' : 'meter-cell'));
    cover.append(meter, el('span', 'coverage-text', t('fix.closes', { a: num.format(problem.closed), b: num.format(problem.leaks.length) })));
    right.append(cover);
  } else {
    right.append(el('p', 'coverage-text', t(`fix.${id}.coverage`)));
  }
  if (ctx.has(`fix.${id}.further`)) {
    const further = el('p', 'further');
    further.append(el('strong', undefined, t('fix.further')), ' ', t(`fix.${id}.further`));
    right.append(further);
  }

  // ----- the steps panel: it follows its button in the reading order -----
  const panel = el('div', 'panel');
  panel.id = `fix-panel-${id}-${n}`;
  panel.hidden = !open;
  const stepsCol = el('div', 'panel-col');
  const steps = el('ol', 'fix-steps');
  const browserName = t(`fix.browser.${browser}`);
  // The platform comes first: Firefox on iPhone doesn't have the settings of Firefox on a computer.
  const stepsKey = specificKey(`fix.${id}.steps`, [platform, browser], ctx.has);
  steps.append(...ctx.tList(stepsKey).map((s) => el('li', undefined, s.replace('{browser}', browserName))));
  stepsCol.append(el('p', 'label', t('fix.steps')), steps);
  const sideCol = el('div', 'panel-col');
  sideCol.append(el('p', 'label', t('fix.tradeoff')), el('p', undefined, t(`fix.${id}.trade`)));
  if (ctx.has(`fix.${id}.tip`)) sideCol.append(el('p', 'label', t('fix.tip')), el('p', undefined, t(`fix.${id}.tip`)));
  panel.append(stepsCol, sideCol);

  const actions = el('div', 'card-actions');
  const how = /** @type {HTMLButtonElement} */ (el('button', 'btn btn-secondary btn-small', t(open ? 'fix.hide' : 'fix.how')));
  how.type = 'button';
  how.dataset.action = 'how';
  how.setAttribute('aria-expanded', String(open));
  how.setAttribute('aria-controls', panel.id);
  how.addEventListener('click', () => {
    const now = how.getAttribute('aria-expanded') !== 'true';
    how.setAttribute('aria-expanded', String(now));
    how.textContent = t(now ? 'fix.hide' : 'fix.how');
    panel.hidden = !now;
    ctx.onOpen(id, now);
  });
  const check = el('label', 'done-check');
  const box = /** @type {HTMLInputElement} */ (el('input'));
  box.type = 'checkbox';
  box.dataset.action = 'done';
  // "done" alone would sound the same on every card, so the fix's name describes it.
  box.setAttribute('aria-describedby', h4.id);
  box.addEventListener('change', () => ctx.onDone(id, box.checked));
  check.append(box, el('span', undefined, t('fix.done')));
  // The plan's own rescan button is screens away on a phone, so each card has one.
  const again = /** @type {HTMLButtonElement} */ (el('button', 'btn btn-secondary btn-small', t('fix.check')));
  again.type = 'button';
  again.dataset.action = 'check';
  again.setAttribute('aria-describedby', h4.id);
  again.addEventListener('click', () => ctx.onCheck(id));
  actions.append(how, again, check);
  right.append(actions);
  if (checkResult !== null) right.append(el('p', 'card-check-result', checkResult));

  const cols = el('div', 'card-cols');
  cols.append(left, arrow, right);
  const body = el('div', 'card-body');
  body.append(head);
  if (stale) body.append(el('p', 'card-warning', t('fix.stillLeaking')));
  body.append(cols, panel);
  li.append(body);
  return li;
}

/**
 * The line left where a card was once a rescan no longer finds its leak. Without it the card
 * would just vanish, and the page would jump. It can take the focus of the button that is gone.
 * @param {ProblemId} id
 * @param {T} t
 * @returns {HTMLLIElement}
 */
export function buildResolvedCard(id, t) {
  const li = /** @type {HTMLLIElement} */ (el('li', 'problem-card is-done'));
  li.dataset.problem = id;
  li.tabIndex = -1;
  const row = el('div', 'card-done');
  const text = el('span', 'card-done-text');
  text.append(t(`fix.${id}.title`), ' ');
  const arrow = el('span', undefined, '→');
  arrow.setAttribute('aria-hidden', 'true');
  text.append(arrow, ' ', el('strong', undefined, t('fix.resolved')));
  row.append(tagEl('ok', t('fix.fixed')), text);
  li.append(row);
  return li;
}

// Compare leak counts to show progress. With no earlier scan there is nothing to compare.
/**
 * The rescan result: leak counts before and after, or only after when there was nothing to compare with.
 * @param {T} t
 * @param {string|null} before formatted count, null when the browser scan had not run
 * @param {string} after formatted count
 */
export function rescanText(t, before, after) {
  return before === null ? t('fix.rescan.after', { after }) : t('fix.rescan.result', { before, after });
}
