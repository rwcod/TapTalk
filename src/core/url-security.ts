import { isIP } from "node:net";

function isPrivateIpv4Address(hostname: string): boolean {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return false;
  }

  const octets = hostname.split(".").map((part) => Number(part));
  if (octets.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) {
    return true;
  }

  const [a, b] = octets;

  if (a === 10 || a === 127) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 0) {
    return true;
  }

  return false;
}

function isPrivateIpv6Address(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "::1") {
    return true;
  }

  // fe80::/10 (link-local)
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true;
  }

  // fc00::/7 (unique local)
  return normalized.startsWith("fc") || normalized.startsWith("fd");
}

export function isLoopbackOrPrivateHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }

  const ipType = isIP(normalized);
  if (ipType === 4) {
    return isPrivateIpv4Address(normalized);
  }
  if (ipType === 6) {
    return isPrivateIpv6Address(normalized);
  }

  return false;
}

export function ensureSafeCloudHttpProtocol(url: URL, label: string): void {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${label} must use http/https protocol.`);
  }

  if (url.username || url.password) {
    throw new Error(`${label} must not include URL credentials.`);
  }

  if (url.protocol === "http:" && !isLoopbackOrPrivateHost(url.hostname)) {
    throw new Error(`${label} must use https (http allowed only for localhost/private hosts).`);
  }
}
