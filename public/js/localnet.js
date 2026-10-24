// @ts-check
// Local network findings. Runs only after a click; the only requests go to four common router addresses.

/** @typedef {import('./browser.js').Finding} Finding */
/** @typedef {import('./browser.js').T} T */

export const ROUTERS = ['192.168.1.1', '192.168.0.1', '10.0.0.1', '192.168.1.254'];

/**
 * Try every router address at once; the first to answer wins and the rest are cancelled.
 * A refused, blocked or timed-out request counts as no answer.
 * @param {typeof fetch} [fetchFn]
 * @param {() => number} [now]
 * @param {number} [timeoutMs]
 * @returns {Promise<{address: string, ms: number}|null>}
 */
export async function probeRouters(fetchFn = fetch, now = performance.now.bind(performance), timeoutMs = 3000) {
  const start = now();
  const tries = ROUTERS.map((address) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const init = /** @type {RequestInit} */ ({
      mode: 'no-cors', targetAddressSpace: 'local', cache: 'no-store', credentials: 'omit', signal: ctrl.signal,
    });
    let done = false;
    // The browser refuses no-cors with redirect "manual", so redirects are followed (and CSP-blocked off-list).
    const answer = fetchFn(`http://${address}/`, init).then(() => { done = true; return { address, ms: Math.round(now() - start) }; });
    return { ctrl, timer, answer, isDone: () => done };
  });
  try {
    return await Promise.any(tries.map((x) => x.answer));
  } catch {
    return null;
  } finally {
    for (const x of tries) { clearTimeout(x.timer); if (!x.isDone()) x.ctrl.abort(); }
  }
}

/** The local network permission state, or null when the browser has no such permission. */
export async function permissionState() {
  try {
    const status = await navigator.permissions.query(/** @type {PermissionDescriptor} */ (/** @type {unknown} */ ({ name: 'local-network-access' })));
    return status.state;
  } catch {
    return null;
  }
}

/** Whether this browser has a local network permission (and so asks before a page reaches the network). */
export async function promptSupported() {
  return (await permissionState()) !== null;
}

/** Wait long enough for the visitor to answer the browser's prompt. @param {PermissionState|null} state */
export function probeTimeout(state) {
  return state === 'prompt' ? 30_000 : 3_000;
}

/**
 * @param {{router: {address: string, ms: number}|null, promptSupported: boolean}} input
 * @param {T} t
 * @returns {Finding[]}
 */
export function judgeLocalnet({ router, promptSupported: asked }, t) {
  return [
    router
      ? { id: 'router', verdict: 'leak', value: t('finding.router.answered', { address: router.address, ms: router.ms }) }
      : { id: 'router', verdict: 'ok', value: t('finding.router.none') },
    asked
      ? { id: 'lnaPrompt', verdict: 'ok', value: t('finding.lnaPrompt.asked') }
      : { id: 'lnaPrompt', verdict: 'leak', value: t('finding.lnaPrompt.silent') },
    { id: 'otherDevices', verdict: 'ok', value: t('finding.otherDevices.value') },
  ];
}
