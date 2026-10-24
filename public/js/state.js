// @ts-check
// The latest results, held in memory only for this tab. Later sections add their own findings.

/**
 * `connectionInput` is what the connection findings were judged from, kept so reveal can redraw them.
 * `first` is the first public address seen, with its family, for the VPN-off recheck;
 * `origins` are the single-family origins, so the recheck can ask the same family again.
 * @type {{browser: import('./browser.js').Finding[], connection: import('./browser.js').Finding[], localnet: import('./browser.js').Finding[],
 *   connectionInput: Omit<Parameters<typeof import('./connection.js').judgeConnection>[0], 'reveal'>|null,
 *   first: {ip: string, family: 4|6}|null, origins: import('./connection.js').Origins|null}}
 */
export const state = { browser: [], connection: [], localnet: [], connectionInput: null, first: null, origins: null };
