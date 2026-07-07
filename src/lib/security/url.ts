import dns from "node:dns/promises";
import net from "node:net";

const blockedHostnames = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);

function isPrivateIpv4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function isPrivateIpv6(ip: string) {
  const value = ip.toLowerCase();
  if (value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb")) return true;
  const mapped = value.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  return mapped ? isPrivateIpv4(mapped[1]) : false;
}

function isPrivateAddress(address: string) {
  const version = net.isIP(address);
  return version === 4 ? isPrivateIpv4(address) : version === 6 ? isPrivateIpv6(address) : true;
}

export function normalizeUrl(input: string) {
  const raw = input.trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withProtocol);
  url.hash = "";
  if (!url.pathname) url.pathname = "/";
  return url.toString();
}

async function resolveSafeAddresses(hostname: string) {
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("Private network addresses cannot be audited.");
    return [hostname];
  }
  let addresses: { address: string }[];
  try { addresses = await dns.lookup(hostname, { all: true, verbatim: true }); } catch { throw new Error("The website hostname could not be resolved."); }
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("The website resolves to a private or unsafe address.");
  return addresses.map(({ address }) => address);
}

export async function assertSafeUrl(input: string) {
  let normalized: string;
  try { normalized = normalizeUrl(input); } catch { throw new Error("Enter a valid website URL."); }
  const url = new URL(normalized);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS websites can be audited.");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (blockedHostnames.has(hostname) || hostname.endsWith(".local") || hostname.endsWith(".internal")) throw new Error("Local and internal addresses cannot be audited.");
  await resolveSafeAddresses(hostname);
  return normalized;
}

export async function resolveSafeHostAddress(hostname: string) {
  const [address] = await resolveSafeAddresses(hostname.toLowerCase().replace(/\.$/, ""));
  return address;
}
