export const LEGACY_VERCEL_HOSTNAME = "aloptama-collect.vercel.app";
export const CANONICAL_HOSTINGER_ORIGIN = "https://aloptama-collect.azkahariz.com";

export function legacyVercelRedirectDestination(hostname: string, pathname: string, search: string) {
  if (hostname.trim().toLowerCase().replace(/\.$/, "") !== LEGACY_VERCEL_HOSTNAME) return null;
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const normalizedSearch = !search || search.startsWith("?") ? search : `?${search}`;
  return new URL(`${normalizedPathname}${normalizedSearch}`, CANONICAL_HOSTINGER_ORIGIN);
}
