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
