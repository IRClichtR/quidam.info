// @ts-check
import dgram from 'node:dgram';
import net from 'node:net';

const COOKIE = 0x2112a442;

/**
 * Accepts only well-formed RFC 5389 Binding requests; attributes are ignored.
 * @param {Buffer} buf
 * @returns {{transactionId: Buffer}|null}
 */
export function parseBindingRequest(buf) {
  if (buf.length < 20 || (buf[0] & 0xc0) !== 0) return null;
  if (buf.readUInt16BE(0) !== 0x0001 || buf.readUInt32BE(4) !== COOKIE) return null;
  const len = buf.readUInt16BE(2);
  if (len % 4 !== 0 || len !== buf.length - 20) return null;
  return { transactionId: Buffer.from(buf.subarray(8, 20)) };
}

/** @param {string} addr IPv6 text form, returns 16 bytes @returns {Buffer} */
function ipv6Bytes(addr) {
  const [head, tail] = addr.split('%')[0].split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = tail === undefined ? h : [...h, ...Array(8 - h.length - t.length).fill('0'), ...t];
  const out = Buffer.alloc(16);
  groups.forEach((g, i) => out.writeUInt16BE(parseInt(g, 16), i * 2));
  return out;
}

/**
 * @param {Buffer} transactionId
 * @param {string} address
 * @param {number} port
 * @returns {Buffer}
 */
export function buildBindingResponse(transactionId, address, port) {
  const v4 = net.isIPv4(address);
  const raw = v4 ? Buffer.from(address.split('.').map(Number)) : ipv6Bytes(address);
  const mask = Buffer.alloc(16);
  mask.writeUInt32BE(COOKIE, 0);
  transactionId.copy(mask, 4);
  const addr = Buffer.from(raw.map((b, i) => b ^ mask[i]));
  const attr = Buffer.alloc(8);
  attr.writeUInt16BE(0x0020, 0);
  attr.writeUInt16BE(4 + addr.length, 2);
  attr[5] = v4 ? 1 : 2;
  attr.writeUInt16BE(port ^ (COOKIE >>> 16), 6);
  const head = Buffer.alloc(20);
  head.writeUInt16BE(0x0101, 0);
  head.writeUInt16BE(attr.length + addr.length, 2);
  head.writeUInt32BE(COOKIE, 4);
  transactionId.copy(head, 8);
  return Buffer.concat([head, attr, addr]);
}

/**
 * `mapAddress` turns the sender's address into the one to report (development override only);
 * the rate limit always uses the real sender.
 * @param {{port: number, limiter: {hit(key: string): boolean}, mapAddress?: (address: string) => string}} opts
 * @returns {Promise<{close(): Promise<void>, ports: {udp4: number, udp6: number|null}}>}
 */
export async function startStun({ port, limiter, mapAddress = (a) => a }) {
  /** @param {dgram.Socket} sock */
  function handle(sock) {
    sock.on('error', () => {});
    sock.on('message', (msg, rinfo) => {
      const parsed = parseBindingRequest(msg);
      if (!parsed) return;
      const address = rinfo.address.replace(/^::ffff:/i, '');
      if (!limiter.hit(address)) return;
      sock.send(buildBindingResponse(parsed.transactionId, mapAddress(address), rinfo.port), rinfo.port, rinfo.address, () => {});
    });
  }

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
  const s6 = await bind('udp6', port === 0 ? 0 : port);
  const sockets = [s4, s6].filter((s) => s !== null);

  return {
    ports: { udp4: s4.address().port, udp6: s6 ? s6.address().port : null },
    close: () => Promise.all(sockets.map((s) => new Promise((r) => s.close(() => r(null))))).then(() => {}),
  };
}
