/**
 * Normalize landing URLs for grouping spend: origin + path, no query/hash,
 * consistent trailing-slash handling.
 */
export function canonicalizeLandingUrl(urlString: string): string {
  const trimmed = urlString.trim();
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    if (!u.protocol.startsWith("http")) return trimmed;
    let path = u.pathname || "/";
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    return `${u.origin.toLowerCase()}${path}`;
  } catch {
    return trimmed;
  }
}
