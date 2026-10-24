// @ts-check

// Turns two downloaded lists into fast "is this IP in it?" checks: the Tor exit list
// (single IPs) and the Apple Private Relay ranges (CIDR blocks, like 17.0.0.0/8, meaning
// "all addresses starting with these first 8 bits"). refresh.js feeds it the raw text.

// Turns two downloaded lists into fast "is this IP in it?" checks: the Tor exit list
// (single IPs) and the Apple Private Relay ranges (CIDR blocks, like 17.0.0.0/8, meaning
// An IPv4 address can arrive wrapped as IPv6 ("::ffff:1.2.3.4"). Unwrap it so it
// matches the plain IPv4 entries in the lists.
// "all addresses starting with these first 8 bits"). refresh.js feeds it the raw text.
import net from 'node:net';

/** @param {string} ip @returns {{ip: string, family: 'ipv4'|'ipv6'} | null} */
// An IPv4 address can arrive wrapped as IPv6 ("::ffff:1.2.3.4"). Unwrap it so it
// matches the plain IPv4 entries in the lists.
function parseIp(ip) {
  const s = ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
  const v = net.isIP(s);
  return v ? { ip: s, family: v === 4 ? 'ipv4' : 'ipv6' } : null;
// net.BlockList does the matching for us, for both IPv4 and IPv6.
}

/**
 * @param {{torText: string, relayCsv: string}} src
 */
export function createIpLists({ torText, relayCsv }) {
  // net.BlockList does the matching for us, for both IPv4 and IPv6.
  const tor = new net.BlockList();
  // Each CSV line starts with the CIDR (address/prefix-length); other columns are ignored.
  // Bad lines are skipped, so one broken line cannot break the whole list.
  const relay = new net.BlockList();

  for (const line of torText.split('\n')) {
    const p = parseIp(line.trim());
    if (p) tor.addAddress(p.ip, p.family);
  }
  for (const line of relayCsv.split('\n')) {
    // Each CSV line starts with the CIDR (address/prefix-length); other columns are ignored.
    // Bad lines are skipped, so one broken line cannot break the whole list.
    const cidr = line.split(',', 1)[0].trim();
    const slash = cidr.indexOf('/');
    if (slash < 0) continue;
    const p = parseIp(cidr.slice(0, slash));
    const bits = cidr.slice(slash + 1);
    if (!p || !/^\d{1,3}$/.test(bits)) continue;
    try {
      relay.addSubnet(p.ip, Number(bits), p.family);
    } catch {
      // out-of-range prefix length: skip
    }
  }

  /** @param {net.BlockList} list @param {string} ip */
  const has = (list, ip) => {
    const p = parseIp(ip);
    return p ? list.check(p.ip, p.family) : false;
  };
  return {
    /** @param {string} ip */
    isTor: (ip) => has(tor, ip),
    /** @param {string} ip */
    isRelay: (ip) => has(relay, ip),
  };
}
