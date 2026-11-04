// @ts-check
// Local network findings. Runs only after a click; the only requests go to four common router addresses.
// The local network is the home or office network behind the router. A website should never
// need to reach it, so a page that can is a risk (an attacker's page could poke at your router).
// The check is click-gated and sends nothing to us: the browser itself tries the addresses.

/** @typedef {import('./browser.js').Finding} Finding */
/** @typedef {import('./browser.js').T} T */

// Addresses where home routers usually live (private ranges, never reachable from the internet).
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
  // Start all four requests at once and race them, so the check takes as long as the
  // fastest answer, not the sum. Each has its own timer and its own AbortController.
  const tries = ROUTERS.map((address) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const init = /** @type {RequestInit} */ ({
      // 'no-cors' means we cannot read the reply, only learn that the router answered at all.
      // That is enough: an answer proves this page can reach the local network.
      // `targetAddressSpace: 'local'` tells Chromium this request is meant for the local network,
      // which is what triggers its permission prompt (Local Network Access).
      mode: 'no-cors', targetAddressSpace: 'local', cache: 'no-store', credentials: 'omit', signal: ctrl.signal,
    });
    let done = false;
    // The browser refuses no-cors with redirect "manual", so redirects are followed (and CSP-blocked off-list).
    const answer = fetchFn(`http://${address}/`, init).then(() => { done = true; return { address, ms: Math.round(now() - start) }; });
    return { ctrl, timer, answer, isDone: () => done };
  });
  try {
    // Promise.any resolves with the first success and only rejects when all four fail.
    return await Promise.any(tries.map((x) => x.answer));
  } catch {
    return null;
  } finally {
    // Always clean up: stop timers and cancel requests still waiting.
    for (const x of tries) { clearTimeout(x.timer); if (!x.isDone()) x.ctrl.abort(); }
  }
}

// Chromium's 'local-network-access' permission: 'granted', 'denied' or 'prompt'.
// Browsers that do not know the name throw, which we read as 'no permission exists'.
// The name is not in TypeScript's list, hence the casts.
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

// With a 'prompt', the browser shows a dialog and the request waits for the visitor's choice.
// So we allow 30 s; otherwise a slow human would look like 'no router answered'.
// Without a prompt, 3 s is plenty for a router on the same network.
/** Wait long enough for the visitor to answer the browser's prompt. @param {PermissionState|null} state */
export function probeTimeout(state) {
  return state === 'prompt' ? 30_000 : 3_000;
}

// Verdicts: a router that answers is a LEAK (the page reached the local network).
// No answer is OK. A browser that asks first is OK; one that stays silent is a LEAK,
// because any page could scan your network unnoticed. 'Other devices' is always OK:
// we never scan them, we only tell the visitor that we don't.
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
