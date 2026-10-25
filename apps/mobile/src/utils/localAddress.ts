/**
 * @file localAddress.ts
 * @description Whether a server address may be used in plain HTTP (ISS-021):
 *   only on the home network (private IPv4 ranges, Tailscale's 100.64/10,
 *   loopback, link-local, IPv6 unique-local, `.local` / `.lan` / `.home.arpa`
 *   names and single-label hosts). Any other address must use HTTPS.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

/** Host of an address, lowercase, without brackets (IPv6) or port; null when it cannot be read. */
function hostOfUrl(url: string): string | null {
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?(\[[^\]]+\]|[^:/?#]+)/i.exec(url.trim());
  if (!m) return null;
  return m[1].replace(/^\[|\]$/g, '').toLowerCase();
}

function isPrivateIPv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return false;
  const [a, b] = parts.map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isLocalIPv6(host: string): boolean {
  if (!host.includes(':')) return false;
  return host === '::1' || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host);
}

/** True when the host is on the home network. */
export function isLocalHost(host: string): boolean {
  if (isPrivateIPv4(host) || isLocalIPv6(host)) return true;
  if (host === 'localhost') return true;
  if (/\.(local|lan|home\.arpa|internal)$/.test(host)) return true;
  // A single-label name ("nas", "raspberrypi") only resolves on the local network.
  return /^[a-z0-9-]+$/.test(host) && !/^\d+$/.test(host);
}

/** True when the address can be used: HTTPS anywhere, HTTP only on the home network. */
export function isAllowedServerUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('https://')) return true;
  if (!trimmed.startsWith('http://')) return false;
  const host = hostOfUrl(trimmed);
  return host !== null && isLocalHost(host);
}
