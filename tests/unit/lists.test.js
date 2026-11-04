// @ts-check
import { it, expect } from 'vitest';
import { createIpLists } from '../../server/lists.js';

it('matches Tor exits exactly', () => {
  const l = createIpLists({ torText: '185.220.101.1\n2a0b:f4c2::1\n', relayCsv: '' });
  expect(l.isTor('185.220.101.1')).toBe(true);
  expect(l.isTor('2a0b:f4c2::1')).toBe(true);
  expect(l.isTor('185.220.101.2')).toBe(false);
});
it('matches relay ranges', () => {
  const l = createIpLists({ torText: '', relayCsv:
    '172.224.226.0/27,GB,GB-EN,London,\n2a02:26f7:b3c0:4000::/64,FR,FR-IDF,Paris,\n' });
  expect(l.isRelay('172.224.226.5')).toBe(true);
  expect(l.isRelay('2a02:26f7:b3c0:4000::9')).toBe(true);
  expect(l.isRelay('172.224.226.64')).toBe(false);
});
it('skips blank, comment and malformed lines', () => {
  const l = createIpLists({ torText: '#x\n\nnot-an-ip\n1.2.3.4\n',
    relayCsv: '#x\n\nnot-an-ip,GB,,,\n1.2.3.0/99,GB,,,\n1.2.3.0/,GB,,,\n10.0.0.0/8,US,,,\n' });
  expect(l.isTor('1.2.3.4')).toBe(true);
  expect(l.isRelay('10.1.1.1')).toBe(true);
  expect(l.isTor('garbage')).toBe(false);
  expect(l.isRelay('')).toBe(false);
});
it('handles IPv4-mapped IPv6', () => {
  const l = createIpLists({ torText: '185.220.101.1\n', relayCsv: '172.224.226.0/27,GB,,,\n' });
  expect(l.isTor('::ffff:185.220.101.1')).toBe(true);
  expect(l.isTor('::FFFF:185.220.101.1')).toBe(true);
  expect(l.isRelay('::ffff:172.224.226.5')).toBe(true);
});
it('merges overlapping ranges and checks both ends of a range', () => {
  const l = createIpLists({ torText: '', relayCsv:
    '10.0.0.0/24\n10.0.0.128/25\n10.0.1.0/24\n10.0.5.0/24\n2001:db8::/48\n2001:db8:0:1::/64\n' });
  for (const ip of ['10.0.0.0', '10.0.1.255', '10.0.5.0', '10.0.5.255', '2001:db8::', '2001:db8:0:ffff:ffff:ffff:ffff:ffff']) expect(l.isRelay(ip), ip).toBe(true);
  for (const ip of ['9.255.255.255', '10.0.2.0', '10.0.4.255', '10.0.6.0', '2001:db8:1::', '2001:db7:ffff::1']) expect(l.isRelay(ip), ip).toBe(false);
});
it('compares IPv6 addresses by value, however they are written', () => {
  const l = createIpLists({ torText: '2a0b:f4c2:0:0::1\n', relayCsv: '::ffff:0:0/96\n' });
  expect(l.isTor('2a0b:f4c2::0001')).toBe(true);
  expect(l.isTor('2a0b:f4c2::2')).toBe(false);
  expect(l.isRelay('64:ff9b::1.2.3.4')).toBe(false);
});
it('agrees with net.BlockList on random addresses', async () => {
  const net = await import('node:net');
  const csv = '172.224.226.0/27\n17.0.0.0/8\n2a02:26f7:b3c0:4000::/64\n2a02:26f7::/32\n';
  const l = createIpLists({ torText: '', relayCsv: csv });
  const bl = new net.BlockList();
  for (const line of csv.trim().split('\n')) {
    const [a, b] = line.split('/');
    bl.addSubnet(a, Number(b), a.includes(':') ? 'ipv6' : 'ipv4');
  }
  for (let i = 0; i < 2000; i++) {
    const r = () => Math.floor(Math.random() * 256);
    const ip4 = [i % 3 ? 17 : 172, i % 2 ? 224 : r(), r(), r()].join('.');
    const ip6 = `2a02:26f7:${(i % 4 ? 'b3c0' : r().toString(16))}:${(i % 2 ? '4000' : r().toString(16))}::${r().toString(16)}`;
    expect(l.isRelay(ip4), ip4).toBe(bl.check(ip4, 'ipv4'));
    expect(l.isRelay(ip6), ip6).toBe(bl.check(ip6, 'ipv6'));
  }
});
