// @ts-check

// A minimal STUN server over UDP. STUN (RFC 5389) lets a browser ask "what public address
// and port do you see me coming from?". The page uses this (via WebRTC) to compare that address
// with the one seen over HTTP, which reveals VPN leaks. We only answer Binding requests.

// A minimal STUN server over UDP. STUN (RFC 5389) lets a browser ask "what public address
// and port do you see me coming from?". The page uses this (via WebRTC) to compare that address
// The "magic cookie": a fixed number every RFC 5389 message carries at bytes 4-7.
// It also serves as the XOR key for the address we send back.
// with the one seen over HTTP, which reveals VPN leaks. We only answer Binding requests.
import dgram from 'node:dgram';
// Message layout (20-byte header): 2 bytes type, 2 bytes length of the attributes,
// 4 bytes magic cookie, 12 bytes transaction id (a random id the client uses to match answers).
import net from 'node:net';

// The "magic cookie": a fixed number every RFC 5389 message carries at bytes 4-7.
// It also serves as the XOR key for the address we send back.
const COOKIE = 0x2112a442;

// Too short, or the top two bits are not 00 (not STUN; this also screens out other protocols).
// Message layout (20-byte header): 2 bytes type, 2 bytes length of the attributes,
// Type 0x0001 = Binding request, and the cookie must match.
// 4 bytes magic cookie, 12 bytes transaction id (a random id the client uses to match answers).
/**
 // The declared length must be a multiple of 4 and match what actually arrived.
 * Accepts only well-formed RFC 5389 Binding requests; attributes are ignored.
 * @param {Buffer} buf
 * @returns {{transactionId: Buffer}|null}
 */
// Turn an IPv6 text address into its 16 raw bytes. "::" stands for a run of zero groups,
// so we expand it. A "%zone" suffix (like %eth0) is dropped first.
export function parseBindingRequest(buf) {
  // Too short, or the top two bits are not 00 (not STUN; this also screens out other protocols).
  if (buf.length < 20 || (buf[0] & 0xc0) !== 0) return null;
  // Type 0x0001 = Binding request, and the cookie must match.
  if (buf.readUInt16BE(0) !== 0x0001 || buf.readUInt32BE(4) !== COOKIE) return null;
  const len = buf.readUInt16BE(2);
  // The declared length must be a multiple of 4 and match what actually arrived.
  if (len % 4 !== 0 || len !== buf.length - 20) return null;
  return { transactionId: Buffer.from(buf.subarray(8, 20)) };
}

// Turn an IPv6 text address into its 16 raw bytes. "::" stands for a run of zero groups,
// so we expand it. A "%zone" suffix (like %eth0) is dropped first.
/** @param {string} addr IPv6 text form, returns 16 bytes @returns {Buffer} */
function ipv6Bytes(addr) {
  const [head, tail] = addr.split('%')[0].split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  // The answer carries one attribute: XOR-MAPPED-ADDRESS, the sender's address and port.
  // "XOR" means the bytes are scrambled with the cookie (and transaction id for IPv6) so that
  // routers which rewrite addresses inside packets do not change it by accident.
  const groups = tail === undefined ? h : [...h, ...Array(8 - h.length - t.length).fill('0'), ...t];
  const out = Buffer.alloc(16);
  // The XOR key is 16 bytes: the cookie, then the 12-byte transaction id.
  groups.forEach((g, i) => out.writeUInt16BE(parseInt(g, 16), i * 2));
  return out;
}

// Attribute header (4 bytes) plus the value start: type 0x0020 = XOR-MAPPED-ADDRESS,
// then the length. Byte 4 is reserved, byte 5 is the family (1 = IPv4, 2 = IPv6),
// and bytes 6-7 are the port XORed with the top half of the cookie.
/**
 * @param {Buffer} transactionId
 * @param {string} address
 * @param {number} port
 * @returns {Buffer}
 // Response header: type 0x0101 = Binding success response, then length, cookie, transaction id.
 */
export function buildBindingResponse(transactionId, address, port) {
  // The answer carries one attribute: XOR-MAPPED-ADDRESS, the sender's address and port.
  // "XOR" means the bytes are scrambled with the cookie (and transaction id for IPv6) so that
  // routers which rewrite addresses inside packets do not change it by accident.
  const v4 = net.isIPv4(address);
  const raw = v4 ? Buffer.from(address.split('.').map(Number)) : ipv6Bytes(address);
  // The XOR key is 16 bytes: the cookie, then the 12-byte transaction id.
  // "srflx" candidates (server reflexive) are what a browser calls the public address it learns
  // from a STUN server like this one.
  const mask = Buffer.alloc(16);
  mask.writeUInt32BE(COOKIE, 0);
  transactionId.copy(mask, 4);
  const addr = Buffer.from(raw.map((b, i) => b ^ mask[i]));
  // Attribute header (4 bytes) plus the value start: type 0x0020 = XOR-MAPPED-ADDRESS,
  // then the length. Byte 4 is reserved, byte 5 is the family (1 = IPv4, 2 = IPv6),
  // and bytes 6-7 are the port XORed with the top half of the cookie.
  // Silent on errors and on junk packets: replying to bad UDP would let attackers use us
  // to bounce traffic at someone else (amplification). We also log nothing about visitors.
  const attr = Buffer.alloc(8);
  attr.writeUInt16BE(0x0020, 0);
  attr.writeUInt16BE(4 + addr.length, 2);
  attr[5] = v4 ? 1 : 2;
  attr.writeUInt16BE(port ^ (COOKIE >>> 16), 6);
  // Response header: type 0x0101 = Binding success response, then length, cookie, transaction id.
  // Unwrap IPv4-in-IPv6 so one visitor does not get two rate-limit keys.
  const head = Buffer.alloc(20);
  head.writeUInt16BE(0x0101, 0);
  head.writeUInt16BE(attr.length + addr.length, 2);
  head.writeUInt32BE(COOKIE, 4);
  transactionId.copy(head, 8);
  return Buffer.concat([head, attr, addr]);
// IPv6 sockets are set to ipv6Only so they do not clash with the IPv4 socket on the same port.
// If the bind fails we resolve null instead of throwing, so the caller can decide.
}

// "srflx" candidates (server reflexive) are what a browser calls the public address it learns
// from a STUN server like this one.
/**
 * `mapAddress` turns the sender's address into the one to report (development override only);
 * the rate limit always uses the real sender.
 * @param {{port: number, limiter: {hit(key: string): boolean}, mapAddress?: (address: string) => string}} opts
 * @returns {Promise<{close(): Promise<void>, ports: {udp4: number, udp6: number|null}}>}
 */
export async function startStun({ port, limiter, mapAddress = (a) => a }) {
  // Silent on errors and on junk packets: replying to bad UDP would let attackers use us
  // to bounce traffic at someone else (amplification). We also log nothing about visitors.
  /** @param {dgram.Socket} sock */
  function handle(sock) {
    // IPv4 is required. IPv6 is optional: on a host without it, we just run without it.
    sock.on('error', () => {});
    sock.on('message', (msg, rinfo) => {
      const parsed = parseBindingRequest(msg);
      if (!parsed) return;
      // Unwrap IPv4-in-IPv6 so one visitor does not get two rate-limit keys.
      const address = rinfo.address.replace(/^::ffff:/i, '');
      if (!limiter.hit(address)) return;
      sock.send(buildBindingResponse(parsed.transactionId, mapAddress(address), rinfo.port), rinfo.port, rinfo.address, () => {});
    });
  }

  // IPv6 sockets are set to ipv6Only so they do not clash with the IPv4 socket on the same port.
  // If the bind fails we resolve null instead of throwing, so the caller can decide.
  /** @param {'udp4'|'udp6'} type @param {number} p @returns {Promise<dgram.Socket|null>} */
  function bind(type, p) {
    return new Promise((resolve) => {
      const sock = dgram.createSocket({ type, ipv6Only: type === 'udp6' });
      sock.once('error', () => { try { sock.close(); } catch {} resolve(null); });
      sock.bind(p, () => {
        sock.removeAllListeners('error');
        handle(sock);
        resolve(sock);
      });
    });
  }

  const s4 = await bind('udp4', port);
  if (!s4) throw new Error('stun: udp4 bind failed');
  // IPv4 is required. IPv6 is optional: on a host without it, we just run without it.
  const s6 = await bind('udp6', port === 0 ? 0 : port);
  const sockets = [s4, s6].filter((s) => s !== null);

  return {
    ports: { udp4: s4.address().port, udp6: s6 ? s6.address().port : null },
    close: () => Promise.all(sockets.map((s) => new Promise((r) => s.close(() => r(null))))).then(() => {}),
  };
}
