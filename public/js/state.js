// @ts-check
// The latest results, held in memory only for this tab. Later sections add their own findings.

/**
 * `connectionInput` is what the connection findings were judged from, kept so reveal can redraw them.
 * `firstIp` is the first public address seen, for the VPN-off recheck.
 * @type {{browser: import('./browser.js').Finding[], connection: import('./browser.js').Finding[],
 *   connectionInput: Omit<Parameters<typeof import('./connection.js').judgeConnection>[0], 'reveal'>|null,
 *   firstIp: string|null}}
 */
export const state = { browser: [], connection: [], connectionInput: null, firstIp: null };
