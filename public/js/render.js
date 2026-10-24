// @ts-check
// DOM rendering for findings and the summary. Text goes in through textContent only (CSP, no innerHTML).
// Turns findings into page elements. Text always goes in through textContent, never innerHTML,
// so a hostile value (say, a strange GPU name) can never inject markup. The page's CSP
// (Content Security Policy) forbids inline scripts and styles anyway.
import { uniqueness } from './browser.js';

/** @typedef {import('./browser.js').Finding} Finding */
/** @typedef {import('./browser.js').Verdict} Verdict */
/** @typedef {import('./browser.js').T} T */

const SVG = 'http://www.w3.org/2000/svg';
// Each verdict has its own shape, not only a colour, so it is readable without seeing colour:
// cross = leak, tick = OK, question mark = can't tell.
/** Icon paths on a 16 × 16 grid. */
const ICONS = {
  leak: ['M3.5 3.5l9 9M12.5 3.5l-9 9'],
  ok: ['M2.5 8.5l3.5 3.5 7.5-8'],
  unknown: ['M5 5.5a3 3 0 1 1 4.2 2.7C8.4 8.6 8 9.2 8 10v.5', 'M8 13v1.5'],
  chevron: ['M5 3l5 5-5 5'],
};

/** @typedef {keyof typeof ICONS} IconName */

/**
 * An inline SVG icon, hidden from screen readers.
 * @param {IconName} name
 * @param {number} [stroke]
 */
export function icon(name, stroke = 3) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of ICONS[name]) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', String(stroke));
    path.setAttribute('stroke-linecap', 'square');
    svg.append(path);
  }
  return svg;
}

/**
 * A new element with an optional class and text (set as textContent).
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {Verdict} verdict @param {T} t */
function tag(verdict, t) {
  const node = el('span', `tag tag-${verdict}`);
  node.append(icon(verdict), t(`tag.${verdict}`));
  return node;
}

// Counter that makes every panel id unique, even after a rescan redraws the rows.
let panelSeq = 0;

/**
 * Replace the list's rows with one row per finding.
 * @param {HTMLUListElement} listEl
 * @param {Finding[]} findings
 * @param {T} t
 */
export function renderFindings(listEl, findings, t) {
  const rows = findings.map((f) => {
    const li = el('li');
    // Stable target for the fix plan's tag links; tabindex lets a link move focus here.
    li.id = `finding-${f.id}`;
    li.tabIndex = -1;
    li.dataset.finding = f.id;
    li.dataset.verdict = f.verdict;

    const panel = el('div', 'panel');
    panel.id = `panel-${f.id}-${++panelSeq}`;
    panel.hidden = true;
    for (const part of ['why', 'fix']) {
      const col = el('div', 'panel-col');
      col.append(el('p', 'label', t(`panel.${part}`)), el('p', undefined, t(`finding.${f.id}.${part}`)));
      panel.append(col);
    }

    // The label is a real button with aria-expanded/aria-controls, so keyboard and
    // screen reader users can open the 'why' and 'fix' panel.
    const toggle = /** @type {HTMLButtonElement} */ (el('button', 'row-label row-toggle'));
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', panel.id);
    toggle.append(icon('chevron', 2), el('span', undefined, t(`finding.${f.id}.label`)));
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
    });

    const row = el('div', 'row');
    row.append(toggle, el('span', 'row-value', f.value), tag(f.verdict, t));
    li.append(row, panel);
    return li;
  });
  listEl.replaceChildren(...rows);
}

/**
 * Three tiles: how many leak, how many are protected, and uniqueness in words
 * ("not scanned yet" until the browser scan has run).
 * @param {HTMLElement} tilesEl
 * @param {Finding[]} findings
 * @param {T} t
 * @param {boolean} [scanned] whether the browser scan has run
 */
export function renderSummary(tilesEl, findings, t, scanned = true) {
  // Intl.NumberFormat writes numbers the way the page language does.
  const num = new Intl.NumberFormat(document.documentElement.lang || 'en');
  /** @param {'leak'|'ok'} kind */
  const countTile = (kind) => {
    const tile = el('div', 'tile');
    const big = el('div', `tile-num tile-${kind}`);
    big.append(icon(kind, 2.4), el('span', undefined, num.format(findings.filter((f) => f.verdict === kind).length)));
    tile.append(big, el('p', 'tile-text', t(`summary.${kind}`)));
    return tile;
  };
  const unique = el('div', 'tile');
  // Uniqueness is only meaningful once the browser scan ran, so before that it reads 'not scanned yet'.
  unique.append(el('div', 'tile-num tile-word', t(`summary.unique.${scanned ? uniqueness(findings) : 'none'}`)), el('p', 'tile-text', t('summary.unique.sub')));
  tilesEl.replaceChildren(countTile('leak'), countTile('ok'), unique);
}

// The live region (aria-live) makes screen readers speak status changes without moving focus.
/** Say `text` to screen readers through the page's live region. @param {string} text */
export function announce(text) {
  const region = document.getElementById('announce');
  if (region) region.textContent = text;
}
