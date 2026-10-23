// @ts-check
import { describe, it, expect } from 'vitest';
import dgram from 'node:dgram';
import { randomBytes } from 'node:crypto';
import { parseBindingRequest, buildBindingResponse, startStun } from '../../server/stun.js';
import { createRateLimiter } from '../../server/ratelimit.js';

const COOKIE = 0x2112a442;
const TID = Buffer.from('0102030405060708090a0b0c', 'hex');

/** @param {Buffer} tid @param {Buffer} [attrs] */
function request(tid = TID, attrs = Buffer.alloc(0)) {
  const h = Buffer.alloc(20);
  h.writeUInt16BE(0x0001, 0);
  h.writeUInt16BE(attrs.length, 2);
  h.writeUInt32BE(COOKIE, 4);
  tid.copy(h, 8);
  return Buffer.concat([h, attrs]);
}

/** Decode the XOR-MAPPED-ADDRESS of a response. @param {Buffer} res */
function decode(res) {
  expect(res.readUInt16BE(0)).toBe(0x0101);
  expect(res.readUInt16BE(20)).toBe(0x0020);
  const family = res[25];
  const port = res.readUInt16BE(26) ^ 0x2112;
  const mask = Buffer.alloc(16);
  mask.writeUInt32BE(COOKIE, 0);
  res.copy(mask, 4, 8, 20);
  if (family === 1) {
    return { port, address: [0, 1, 2, 3].map((i) => res[28 + i] ^ mask[i]).join('.') };
  }
  const groups = [];
  for (let i = 0; i < 16; i += 2) groups.push(((res[28 + i] ^ mask[i]) << 8 | (res[29 + i] ^ mask[i + 1])).toString(16));
  return { port, address: groups.join(':') };
}

describe('parseBindingRequest', () => {
  it('parses a valid binding request', () => {
    const r = parseBindingRequest(request());
    expect(r?.transactionId.equals(TID)).toBe(true);
  });

  it('accepts a request with attributes', () => {
    expect(parseBindingRequest(request(TID, Buffer.alloc(8, 1)))).not.toBeNull();
  });

  it('rejects junk', () => {
    expect(parseBindingRequest(Buffer.alloc(0))).toBeNull();
    expect(parseBindingRequest(request().subarray(0, 19))).toBeNull();
    const badCookie = request(); badCookie.writeUInt32BE(1, 4);
    expect(parseBindingRequest(badCookie)).toBeNull();
    const badType = request(); badType.writeUInt16BE(0x0111, 0);
    expect(parseBindingRequest(badType)).toBeNull();
    const badLen = request(); badLen.writeUInt16BE(4, 2);
    expect(parseBindingRequest(badLen)).toBeNull();
    expect(parseBindingRequest(Buffer.concat([request(), Buffer.alloc(3)]))).toBeNull();
    const top = request(); top[0] = 0x81; // top bits set (also wrong type)
    expect(parseBindingRequest(top)).toBeNull();
  });
});

describe('buildBindingResponse', () => {
  it('encodes XOR-MAPPED-ADDRESS for IPv4', () => {
    const res = buildBindingResponse(TID, '192.0.2.1', 54321);
    const expected = Buffer.concat([
      Buffer.from([0x01, 0x01, 0x00, 0x0c, 0x21, 0x12, 0xa4, 0x42]),
      TID,
      Buffer.from([0x00, 0x20, 0x00, 0x08, 0x00, 0x01]),
      Buffer.from([(54321 ^ 0x2112) >> 8, (54321 ^ 0x2112) & 0xff]),
      Buffer.from([192 ^ 0x21, 0 ^ 0x12, 2 ^ 0xa4, 1 ^ 0x42]),
    ]);
    expect(res.equals(expected)).toBe(true);
  });

  it('encodes XOR-MAPPED-ADDRESS for IPv6', () => {
    const res = buildBindingResponse(TID, '2001:db8::1', 4000);
    expect(res.length).toBe(20 + 4 + 20);
    expect(res.readUInt16BE(2)).toBe(24);
    expect(decode(res)).toEqual({ port: 4000, address: '2001:db8:0:0:0:0:0:1' });
  });
});

/** @param {number} port @param {Buffer} msg @param {'udp4'|'udp6'} [type] */
function ask(port, msg, type = 'udp4') {
  return new Promise((resolve) => {
    const c = dgram.createSocket(type);
    const timer = setTimeout(() => { c.close(); resolve(null); }, 1000);
    c.on('message', (m) => { clearTimeout(timer); c.close(); resolve(m); });
    c.send(msg, port, type === 'udp4' ? '127.0.0.1' : '::1');
  });
}

describe('startStun', () => {
  it('answers over real UDP', async () => {
    const stun = await startStun({ port: 0, limiter: createRateLimiter({ limit: 60, windowMs: 60_000 }) });
    try {
      const res = /** @type {Buffer} */ (await ask(stun.ports.udp4, request()));
      expect(decode(res).address).toBe('127.0.0.1');
      expect(res.subarray(8, 20).equals(TID)).toBe(true);
      if (stun.ports.udp6 !== null) {
        const res6 = await ask(stun.ports.udp6, request(), 'udp6');
        if (res6) expect(decode(/** @type {Buffer} */ (res6)).address).toBe('0:0:0:0:0:0:0:1');
      }
    } finally {
      await stun.close();
    }
  });

  it('drops random bytes and stays up', async () => {
    const stun = await startStun({ port: 0, limiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }) });
    try {
      const c = dgram.createSocket('udp4');
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => c.send(randomBytes(1 + (i % 60)), stun.ports.udp4, '127.0.0.1', () => r(null)));
      }
      c.close();
      expect(await ask(stun.ports.udp4, request())).not.toBeNull();
    } finally {
      await stun.close();
    }
  });

  it('drops packets over the rate limit', async () => {
    const stun = await startStun({ port: 0, limiter: createRateLimiter({ limit: 1, windowMs: 60_000 }) });
    try {
      expect(await ask(stun.ports.udp4, request())).not.toBeNull();
      expect(await ask(stun.ports.udp4, request())).toBeNull();
    } finally {
      await stun.close();
    }
  });
});
