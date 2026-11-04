// @ts-check
// Turns the leaking findings of every section into a few problems, each with one basic fix.
// Thirteen leaks are hard to act on; "your browser is easy to recognize" is one thing to fix.
// Pure logic: no DOM, so tests run it directly. The cards themselves are built in fixes.js.

/** @typedef {import('./browser.js').Finding} Finding */
/** @typedef {import('./browser.js').FindingId} FindingId */
/** @typedef {'browser'|'where'|'home'|'gpc'|'webrtc'} ProblemId */
/**
 * `members` are the findings the problem groups. `closes` are the ones its basic fix closes,
 * or null when that depends on the option picked (each browser hides different things).
 * @typedef {{id: ProblemId, members: FindingId[], closes: FindingId[]|null}} ProblemDef
 */
/**
 * `leaks` are the problem's findings that read LEAK; `closed` how many of them its fix closes (null: depends).
 * @typedef {{id: ProblemId, leaks: Finding[], closed: number|null}} Problem
 */

// The table order is also the tie-break order: between two problems with as many leaks,
// the one listed first comes first.
/** @type {ProblemDef[]} */
export const PROBLEMS = [
  { id: 'browser', members: ['screen', 'timezone', 'languages', 'gpu', 'fonts', 'canvas', 'audio', 'cpu'], closes: null },
  { id: 'where', members: ['publicIp', 'provider', 'location'], closes: ['publicIp', 'provider', 'location'] },
  // Answering Block closes the router leak, but not a browser that never asks (lnaPrompt).
  { id: 'home', members: ['router', 'lnaPrompt'], closes: ['router'] },
  { id: 'gpc', members: ['gpc'], closes: ['gpc'] },
  { id: 'webrtc', members: ['webrtcLocal'], closes: ['webrtcLocal'] },
];

/**
 * The problem a finding belongs to, or null for findings no fix is about (such as "other devices").
 * @param {FindingId} id
 * @returns {ProblemId|null}
 */
export function problemOf(id) {
  return PROBLEMS.find((p) => p.members.includes(id))?.id ?? null;
}

/**
 * The problems behind the leaking findings: most leaks first, ties in table order.
 * Problems without a leak are left out.
 * @param {Finding[]} findings
 * @returns {Problem[]}
 */
export function groupProblems(findings) {
  const leaking = findings.filter((f) => f.verdict === 'leak');
  const problems = PROBLEMS.map((def) => {
    const leaks = leaking.filter((f) => def.members.includes(f.id));
    const closed = def.closes === null ? null : leaks.filter((f) => /** @type {FindingId[]} */ (def.closes).includes(f.id)).length;
    return { id: def.id, leaks, closed };
  }).filter((p) => p.leaks.length > 0);
  // Array.prototype.sort is stable, so equal counts keep the table order.
  return problems.sort((a, b) => b.leaks.length - a.leaks.length);
}
