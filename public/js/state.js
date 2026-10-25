// @ts-check
// The latest results, held in memory only for this tab.

// Nothing here is ever written to disk, cookies or localStorage. A reload starts clean.
// The fix plan reads these arrays to count leaks and to rescan.
/**
 * `connectionInput` is what the connection findings were judged from, kept so 'show', a changed answer
 * and the VPN checks can redraw them without asking the network again.
 * `answer` is the visitor's reply to "is this you?"; `vpnOpen` whether they opened "your VPN, checked".
 * `vpnOff` is the result of the double-check with the VPN off, if any.
 * `checked` is the public address of the latest connection check, with its family, for that double-check;
 * `origins` are the single-family origins, so the double-check can ask the same family again.
 * `ran` records which click-gated checks the visitor started in this tab, so a rescan reruns only those.
 * @type {{browser: import('./browser.js').Finding[], connection: import('./browser.js').Finding[], localnet: import('./browser.js').Finding[],
 *   connectionInput: {main: import('./connection.js').Lookup, v4: import('./connection.js').Lookup, v6: import('./connection.js').Lookup,
 *     ice: import('./connection.js').Ice|null}|null,
 *   answer: import('./connection.js').Answer|null, vpnOpen: boolean,
 *   vpnOff: import('./connection.js').VpnOff|null,
 *   checked: {ip: string, family: 4|6}|null, origins: import('./connection.js').Origins|null,
 *   ran: {connection: boolean, localnet: boolean}}}
 */
export const state = {
  browser: [], connection: [], localnet: [], connectionInput: null, answer: null, vpnOpen: false,
  vpnOff: null, checked: null, origins: null, ran: { connection: false, localnet: false },
};
