/**
 * @file localAddress.test.ts
 * @description Plain HTTP is only accepted for a server on the home network (ISS-021).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {isAllowedServerUrl} from '../../src/utils/localAddress';

describe('isAllowedServerUrl', () => {
  it('accepts HTTPS anywhere', () => {
    expect(isAllowedServerUrl('https://music.example.com')).toBe(true);
    expect(isAllowedServerUrl(' HTTPS://8.8.8.8:4533 ')).toBe(true);
  });
  it('accepts HTTP on the home network', () => {
    for (const url of [
      'http://192.168.1.20:4533', 'http://10.0.0.5', 'http://172.16.3.4/', 'http://172.31.255.1',
      'http://127.0.0.1:4533', 'http://100.101.102.103', 'http://169.254.10.1',
      'http://[fd12:3456::1]:4533', 'http://[::1]', 'http://[fe80::1]',
      'http://nas.local:4533', 'http://server.lan', 'http://box.home.arpa', 'http://raspberrypi:4533', 'http://localhost',
    ]) {
      expect([url, isAllowedServerUrl(url)]).toEqual([url, true]);
    }
  });
  it('refuses HTTP on the internet', () => {
    for (const url of [
      'http://music.example.com', 'http://8.8.8.8', 'http://172.32.0.1', 'http://192.169.1.1',
      'http://100.128.0.1', 'http://[2001:db8::1]', 'http://user:pw@music.example.com', 'http://1234',
      'ftp://192.168.1.2', 'music.example.com',
    ]) {
      expect([url, isAllowedServerUrl(url)]).toEqual([url, false]);
    }
  });
});
