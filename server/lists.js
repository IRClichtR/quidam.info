// @ts-check
import net from 'node:net';

/** @param {string} ip @returns {{ip: string, family: 'ipv4'|'ipv6'} | null} */
function parseIp(ip) {
  const s = ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
  const v = net.isIP(s);
  return v ? { ip: s, family: v === 4 ? 'ipv4' : 'ipv6' } : null;
}

/**
 * @param {{torText: string, relayCsv: string}} src
 */
export function createIpLists({ torText, relayCsv }) {
  const tor = new net.BlockList();
  const relay = new net.BlockList();

  for (const line of torText.split('\n')) {
    const p = parseIp(line.trim());
    if (p) tor.addAddress(p.ip, p.family);
  }
  for (const line of relayCsv.split('\n')) {
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
