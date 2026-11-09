// @ts-check
// The page controller. It wires buttons to the other modules: scan the browser, show what sites
// see about the connection (and check the VPN), probe the local network, then group what leaks
// into problems with a basic fix each.
// Everything is click-gated and kept in memory (state.js, plus the ticked and opened fix cards):
// there is no storage, no cookie, no analytics, so closing the tab erases it all.
import { loadStrings, t, tList, tPlural, has } from './i18n.js';
import { collectBrowser, judgeBrowser } from './browser.js';
import { renderFindings, renderSummary, announce, el, icon, tag } from './render.js';
import { state } from './state.js';
import {
  fetchWhoami, gatherIce, judgeConnection, compareVpnOff, stunUrls, primaryLookup, describeConnection,
  providerName, placeName, maskIp, vpnChecks, judgeWebrtcLocal,
} from './connection.js';
import { probeRouters, permissionState, probeTimeout, judgeLocalnet } from './localnet.js';
import { detectBrowser, detectPlatform, buildProblemCard, buildResolvedCard, rescanText } from './fixes.js';
import { groupProblems, afterRescan } from './problems.js';

const root = document.documentElement;
const lang = root.lang;
// Top-level await: the page text must be loaded before anything is drawn.
// The language comes from the <html lang> of each translated page.
await loadStrings(lang);

// data-i18n="key" sets the text; placeholders come from the element's other data-* attributes.
for (const node of document.querySelectorAll('[data-i18n]')) {
  const html = /** @type {HTMLElement} */ (node);
  html.textContent = t(html.dataset.i18n ?? '', { ...html.dataset });
}
// data-i18n-attr="aria-label:key" (several pairs separated by commas) sets attributes.
for (const node of document.querySelectorAll('[data-i18n-attr]')) {
  for (const pair of (node.getAttribute('data-i18n-attr') ?? '').split(',')) {
    const [attr, key] = pair.split(':').map((s) => s.trim());
    node.setAttribute(attr, t(key));
  }
}
root.dataset.i18nReady = lang;

/** @param {string} id */
const byId = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** Every section's current findings, together. */
const allFindings = () => [...state.browser, ...state.connection, ...state.localnet];

/** Leak and OK counts, formatted for the page language. @param {import('./browser.js').Finding[]} findings */
function counts(findings) {
  const num = new Intl.NumberFormat(lang);
  const count = (/** @type {string} */ v) => num.format(findings.filter((f) => f.verdict === v).length);
  return { leak: count('leak'), ok: count('ok') };
}

/** Redraw what depends on every section: the summary tiles and the fix plan. */
function updateSummary() {
  const findings = allFindings();
  renderSummary(/** @type {HTMLElement} */ (document.querySelector('#results .tiles')), findings, {
    t, tPlural, scanned: state.browser.length > 0, problems: groupProblems(findings).length,
  });
  // Once there are results, the 'run a scan' hint is no longer needed.
  const hint = document.querySelector('#results .hint');
  if (hint instanceof HTMLElement) hint.hidden = findings.length > 0;
  drawFixes();
}

// ---------- browser scan ----------
const runBtn = /** @type {HTMLButtonElement} */ (byId('run-scan'));
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
    const findings = judgeBrowser(await collectBrowser(), t, lang);
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

// ---------- connection: what sites see ----------
const connBtn = /** @type {HTMLButtonElement} */ (byId('run-connection'));
const revealBtn = /** @type {HTMLButtonElement} */ (byId('reveal-ip'));
const resultCard = byId('conn-result');
const question = byId('conn-question');
const outcome = byId('conn-outcome');
const choices = /** @type {HTMLButtonElement[]} */ ([...question.querySelectorAll('.choice')]);
const vpnSection = byId('vpn-check');
const compareBox = byId('vpn-compare');
const vpnOffBtn = /** @type {HTMLButtonElement} */ (byId('vpn-off'));
const vpnOffResult = byId('vpn-off-result');
byId('vpn-steps').replaceChildren(...tList('vpn.cmp.steps').map((s) => el('li', undefined, s)));
let checking = false;

const revealed = () => revealBtn.getAttribute('aria-pressed') === 'true';
/** @param {string} ip */
const show = (ip) => (revealed() ? ip : maskIp(ip));

/** The two big lines of the result card: whose connection, and where. @param {import('./connection.js').Whoami} who @param {string} kind */
function cardLines(who, kind) {
  const provider = providerName(who);
  const place = placeName(who, lang);
  const line1 = kind === 'tor' ? t('conn.line.tor') : kind === 'relay' ? t('conn.line.relay') : kind === 'local' ? t('conn.line.local')
    : provider ? t('conn.line.provider', { provider }) : t('conn.line.noProvider');
  const line2 = kind === 'local' ? '' : place ? t('conn.line.place', { place }) : t('conn.line.noPlace');
  return { line1, line2, provider: provider ?? t('finding.unknown'), place: place ?? t('finding.unknown') };
}

/**
 * The outcome under the question: the verdict tag, what it means, and where to go next.
 * @param {'leak'|'ok'} verdict @param {string} text @param {HTMLElement|null} next
 */
function outcomePanel(verdict, text, next) {
  const panel = el('div', 'outcome-panel');
  panel.dataset.outcome = verdict;
  const body = el('div', 'outcome-body');
  body.append(el('p', undefined, text));
  if (next) body.append(next);
  panel.append(tag(verdict, t), body);
  return panel;
}

/** Draw the result card, the question, the outcome and step 2 from the saved lookups. */
function drawConnection() {
  const input = state.connectionInput;
  if (!input) return;
  const { kind, who } = describeConnection(input.main, input.v4, input.v6);
  const isPublic = kind === 'public';
  // An answer only means something for a public address we haven't recognised ourselves.
  const answer = isPublic ? state.answer : null;
  state.connection = judgeConnection({ ...input, answer, vpnOff: state.vpnOff, reveal: revealed() }, t);

  resultCard.hidden = false;
  const lines = byId('conn-lines');
  const note = byId('conn-note');
  const details = byId('conn-details');
  if (!who) {
    lines.replaceChildren();
    note.textContent = t(`finding.publicIp.${kind}`);
    note.hidden = false;
    details.hidden = true;
  } else {
    const { line1, line2, provider, place } = cardLines(who, kind);
    lines.replaceChildren(...[line1, line2].filter(Boolean).map((s) => el('span', undefined, s)));
    note.textContent = kind === 'local' ? t('conn.local') : '';
    note.hidden = kind !== 'local';
    details.hidden = false;
    byId('conn-ip').textContent = show(who.ip);
    byId('conn-net').textContent = who.asn === null ? '' : `AS${who.asn}`;
    byId('conn-net-row').hidden = who.asn === null;
    byId('conn-opt-yes').textContent = t('conn.opt.yes', { provider, place });
    byId('vpn-recap').textContent = t('vpn.recap', { line1, line2 });
  }

  question.hidden = !isPublic;
  for (const c of choices) {
    const on = c.dataset.answer === answer;
    c.setAttribute('aria-checked', String(on));
  }
  // Roving tabindex: Tab reaches the group once, on the picked option (or the first).
  const focusable = choices.find((c) => c.dataset.answer === answer) ?? choices[0];
  for (const c of choices) c.tabIndex = c === focusable ? 0 : -1;

  /** @type {HTMLElement|null} */
  let panel = null;
  if (kind === 'tor' || kind === 'relay') {
    panel = outcomePanel('ok', t(`conn.${kind}.text`), null);
  } else if (isPublic && (answer === 'yes' || answer === 'unsure')) {
    const link = /** @type {HTMLAnchorElement} */ (el('a', undefined, t('conn.fixLink')));
    link.href = document.getElementById('fix-where') ? '#fix-where' : '#fix';
    panel = outcomePanel('leak', t(answer === 'yes' ? 'conn.yes.text' : 'conn.unsure.text'), link);
  } else if (isPublic && answer === 'vpn') {
    const go = /** @type {HTMLButtonElement} */ (el('button', 'btn', t('conn.vpn.run')));
    go.type = 'button';
    go.id = 'test-vpn';
    go.setAttribute('aria-controls', 'vpn-check');
    go.setAttribute('aria-expanded', String(state.vpnOpen));
    go.addEventListener('click', () => {
      state.vpnOpen = true;
      drawConnection();
      byId('vpn-title').focus();
    });
    panel = outcomePanel('ok', t('conn.vpn.text'), go);
  }
  outcome.replaceChildren(...(panel ? [panel] : []));
  drawVpnCheck(isPublic && answer === 'vpn' && state.vpnOpen);
}

/** Step 2, "your VPN, checked": three plain questions answered from the lookups. @param {boolean} open */
function drawVpnCheck(open) {
  vpnSection.hidden = !open;
  const input = state.connectionInput;
  if (!open || !input) return;
  const rows = vpnChecks({ ...input, vpnOff: state.vpnOff, lang, reveal: revealed() }, t);
  byId('vpn-rows').replaceChildren(...rows.map((r) => {
    const li = el('li', 'vpn-row');
    li.dataset.check = r.id;
    li.dataset.verdict = r.verdict;
    const head = el('div', 'vpn-row-head');
    const text = el('div', 'vpn-row-text');
    text.append(el('p', 'vpn-q', t(`vpn.${r.id}.q`)), el('p', 'vpn-a', r.answer));
    head.append(text, tag(r.verdict, t));
    li.append(head, el('p', 'vpn-desc', t(`vpn.${r.id}.desc`)));
    if (r.fix) li.append(el('p', 'vpn-fix', r.fix));
    if (r.id === 'vpnHide') {
      const toggle = /** @type {HTMLButtonElement} */ (el('button', 'link-btn', t(compareBox.hidden ? 'vpn.dbl' : 'vpn.dblHide')));
      toggle.type = 'button';
      toggle.id = 'vpn-dbl';
      toggle.setAttribute('aria-expanded', String(!compareBox.hidden));
      toggle.setAttribute('aria-controls', 'vpn-compare');
      toggle.addEventListener('click', () => {
        compareBox.hidden = !compareBox.hidden;
        toggle.setAttribute('aria-expanded', String(!compareBox.hidden));
        toggle.textContent = t(compareBox.hidden ? 'vpn.dbl' : 'vpn.dblHide');
      });
      li.append(toggle);
    }
    return li;
  }));
  const n = (/** @type {string} */ v) => rows.filter((r) => r.verdict === v).length;
  const num = new Intl.NumberFormat(lang);
  const text = tPlural('vpn.summary', n('leak'), { ok: num.format(n('ok')) });
  byId('vpn-summary').textContent = n('unknown') ? t('vpn.summary.unknown', { text, u: num.format(n('unknown')) }) : text;
}

/** Pick an answer to "is this you?" and re-judge, without asking the server again. @param {HTMLButtonElement} choice */
function choose(choice) {
  const answer = /** @type {import('./connection.js').Answer} */ (choice.dataset.answer);
  if (answer !== 'vpn') state.vpnOpen = false;
  state.answer = answer;
  drawConnection();
  updateSummary();
}

for (const c of choices) {
  c.addEventListener('click', () => choose(c));
  // Arrow keys move through the options and pick them, as in any radio group.
  c.addEventListener('keydown', (e) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = choices[(choices.indexOf(c) + step + choices.length) % choices.length];
    choose(next);
    next.focus();
  });
}

/** Ask our own server for the address on this origin and on the single-family origins, and run WebRTC. */
async function runConnection() {
  if (checking) return;
  checking = true;
  state.ran.connection = true;
  connBtn.setAttribute('aria-disabled', 'true');
  announce(t('connection.running'));
  const before = state.checked;
  try {
    // /api/origins gives the IPv4-only and IPv6-only hostnames and the STUN port.
    const originsRes = await fetch('/api/origins', { credentials: 'omit', cache: 'no-store' }).catch(() => null);
    /** @type {import('./connection.js').Origins|null} */
    const origins = originsRes?.ok ? await originsRes.json().catch(() => null) : null;
    state.origins = origins;
    // All lookups run together. The v4/v6 lookups use single-family hostnames so we know the
    // address for each family; WebRTC asks our STUN server which public addresses it exposes.
    const [main, v4, v6, ice] = await Promise.all([
      fetchWhoami(''),
      origins ? fetchWhoami(origins.v4) : null,
      origins ? fetchWhoami(origins.v6) : null,
      origins ? gatherIce(stunUrls(origins)).catch(() => null) : null,
    ]);
    // Kept so 'show', a changed answer and step 2 can redraw without asking the network again.
    state.connectionInput = { main, v4, v6, ice };
    const who = primaryLookup(main, v4, v6);
    state.checked = who ? { ip: who.ip, family: who.family } : null;
    // A rescan from the same address keeps the answer and the double-check; a new address
    // (the VPN went on or off) asks again.
    if (!(before && state.checked && compareVpnOff(before, state.checked) === 'same')) {
      state.answer = null;
      state.vpnOff = null;
      state.vpnOpen = false;
      vpnOffResult.replaceChildren();
      compareBox.hidden = true;
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

// 'show' toggles masking of the IP; judging runs again from the saved input.
revealBtn.addEventListener('click', () => {
  revealBtn.setAttribute('aria-pressed', String(!revealed()));
  drawConnection();
});

/** One side of the comparison: provider · city, and the (masked) address. @param {'with'|'without'} side @param {import('./connection.js').Whoami} who */
function compareCard(side, who) {
  const card = el('div', `compare-card is-${side}`);
  const place = [providerName(who), who.city].filter(Boolean).join(' · ') || t('finding.unknown');
  card.append(el('p', 'label', t(`vpn.cmp.${side}`)), el('p', 'compare-place', place), el('p', 'compare-ip', show(who.ip)));
  return card;
}

let rechecking = false;
vpnOffBtn.addEventListener('click', async () => {
  const first = state.checked;
  const input = state.connectionInput;
  if (rechecking || !first || !input) return;
  rechecking = true;
  vpnOffBtn.setAttribute('aria-disabled', 'true');
  vpnOffResult.replaceChildren();
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
    // With no answer, row 1 goes back to the visitor's word rather than keep an older comparison.
    state.vpnOff = after ? compareVpnOff(first, after) : null;
    if (!after) {
      vpnOffResult.append(el('p', 'compare-verdict', t(lookups.includes('busy') ? 'finding.publicIp.busy' : 'vpn.cmp.failed')));
    } else {
      const withVpn = /** @type {import('./connection.js').Whoami} */ (primaryLookup(input.main, input.v4, input.v6));
      const cards = el('div', 'compare-cards');
      cards.append(compareCard('with', withVpn), compareCard('without', after));
      const verdict = el('p', 'compare-verdict');
      if (state.vpnOff === 'otherFamily') verdict.append(tag('unknown', t), t('vpn.cmp.otherFamily'));
      else verdict.append(tag(state.vpnOff === 'hidden' ? 'ok' : 'leak', t), t(`vpn.cmp.${state.vpnOff}`));
      const back = el('p', 'back-on');
      back.setAttribute('role', 'note');
      back.append(icon('ok', 2), t('vpn.cmp.backOn'));
      vpnOffResult.append(cards, verdict, back);
    }
    drawConnection();
    updateSummary();
  } finally {
    rechecking = false;
    vpnOffBtn.removeAttribute('aria-disabled');
  }
});

// ---------- local network probe ----------
const localBtn = /** @type {HTMLButtonElement} */ (byId('run-localnet'));
let probing = false;

/** Try the router addresses, check for the browser's permission prompt, and read the local IP WebRTC shares. */
async function runLocalnet() {
  if (probing) return;
  probing = true;
  state.ran.localnet = true;
  localBtn.setAttribute('aria-disabled', 'true');
  announce(t('localnet.running'));
  try {
    // Ask the permission state first: if the browser will show a prompt, the probe waits
    // 30 s for the visitor instead of 3 s. WebRTC with no server asks nobody: it only lists
    // this device's own addresses.
    const permission = await permissionState();
    const [router, ice] = await Promise.all([
      probeRouters(fetch, performance.now.bind(performance), probeTimeout(permission)),
      gatherIce([]).catch(() => null),
    ]);
    const [routerRow, prompt, others] = judgeLocalnet({ router, promptSupported: permission !== null }, t);
    state.localnet = [routerRow, prompt, judgeWebrtcLocal(ice, t), others];
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
const fixList = /** @type {HTMLOListElement} */ (document.querySelector('#fix .fix-list'));
const progressBar = /** @type {HTMLElement} */ (document.querySelector('#fix .progress-bar'));
const rescanBtn = /** @type {HTMLButtonElement} */ (byId('rescan'));
const rescanResult = byId('rescan-result');
/** Problems ticked as done, and cards opened or closed by the visitor. In memory only. */
let done = new Set();
/** Ticked problems the last rescan still found, and problems it no longer finds. */
let stale = new Set();
let resolved = new Set();
/** The rescan result to show on the card whose button started it. @type {{id: string, text: string}|null} */
let checked = null;
/** @type {Map<string, boolean>} */
const opened = new Map();
const ctx = {
  t, tList, tPlural, has, lang,
  browser: detectBrowser(/** @type {{userAgent: string, brave?: unknown}} */ (navigator)),
  platform: detectPlatform(/** @type {any} */ (navigator)),
  /** @param {string} id @param {boolean} on */
  onDone: (id, on) => {
    if (on) done.add(id); else done.delete(id);
    stale.delete(id);
    drawFixes();
    // The control that was pressed is gone: move focus to its counterpart on the redrawn card.
    const card = document.getElementById(`fix-${id}`);
    /** @type {HTMLElement|null|undefined} */ (card?.querySelector(on ? '[data-action="undo"]' : '[data-action="done"]'))?.focus();
  },
  /** @param {string} id @param {boolean} open */
  onOpen: (id, open) => { opened.set(id, open); },
  /** @param {string} id */
  onCheck: (id) => { rescan(id); },
};

/** The lead sentence, the progress row and one card per problem. Ticks never change the counts; a rescan does. */
function drawFixes() {
  const findings = allFindings();
  const problems = groupProblems(findings);
  byId('fix-empty').hidden = findings.length > 0;
  byId('fix-plan').hidden = findings.length === 0;
  const num = new Intl.NumberFormat(lang);
  const leaks = problems.reduce((sum, p) => sum + p.leaks.length, 0);
  byId('fix-lead').textContent = !problems.length ? t('fix.none')
    : leaks === 1 ? t('fix.lead.single')
      : problems.length === 1 ? t('fix.lead.oneProblem', { leaks: num.format(leaks) })
        : t('fix.lead.many', { leaks: num.format(leaks), problems: num.format(problems.length) });
  byId('fix-progress').hidden = !problems.length;
  const d = problems.filter((p) => done.has(p.id)).length;
  byId('fix-done').textContent = tPlural('fix.progress', problems.length, { d: num.format(d) });
  progressBar.replaceChildren(...problems.map((p) => el('span', done.has(p.id) ? 'bar-cell is-done' : 'bar-cell')));
  const cards = problems.map((p, index) => {
    const checkResult = checked?.id === p.id ? checked.text : null;
    const card = buildProblemCard(p, { index, total: problems.length, done: done.has(p.id), open: opened.get(p.id) ?? index === 0, stale: stale.has(p.id), checkResult }, ctx);
    card.id = `fix-${p.id}`;
    return card;
  });
  const lines = [...resolved].filter((id) => !problems.some((p) => p.id === id)).map((id) => {
    const line = buildResolvedCard(id, t);
    line.id = `fix-${id}`;
    return line;
  });
  fixList.replaceChildren(...cards, ...lines);
}

/** Leaks across every section's current findings. */
const leaking = () => allFindings().filter((f) => f.verdict === 'leak').length;

let rescanning = false;
/**
 * Rerun the browser scan, plus the click-gated checks the visitor already ran here, then compare leak counts.
 * @param {string} [from] the problem whose card started it: the result shows there and the focus stays there
 */
async function rescan(from) {
  if (rescanning) return;
  rescanning = true;
  rescanBtn.setAttribute('aria-disabled', 'true');
  rescanResult.textContent = '';
  checked = null;
  // The 'before' values are taken now, before the rescan replaces the findings.
  const before = state.browser.length ? leaking() : null;
  const problemsBefore = groupProblems(allFindings()).map((p) => p.id);
  try {
    announce(t('fix.rescan.running'));
    await runScan();
    // Only rerun what the visitor already chose to run. We never start a network check for them.
    if (state.ran.connection) await runConnection();
    if (state.ran.localnet) await runLocalnet();
    const num = new Intl.NumberFormat(lang);
    const text = rescanText(t, before === null ? null : num.format(before), num.format(leaking()));
    rescanResult.textContent = text;
    ({ done, stale, resolved } = afterRescan(problemsBefore, groupProblems(allFindings()), done, resolved));
    if (from) checked = { id: from, text };
    drawFixes();
    if (from) {
      const card = document.getElementById(`fix-${from}`);
      /** @type {HTMLElement|null|undefined} */ (resolved.has(from) ? card : card?.querySelector('[data-action="check"]'))?.focus();
    }
    announce(text);
  } finally {
    rescanning = false;
    rescanBtn.removeAttribute('aria-disabled');
  }
}
rescanBtn.addEventListener('click', () => { rescan(); });
