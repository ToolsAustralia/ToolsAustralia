// Minimal glob matcher for path patterns used in Domain Manifest.
// Supports: ** (any depth), * (single segment), {a,b} (alternatives), literal paths.
// Avoids npm dependency on minimatch — these patterns are simple enough to match in-house.

/**
 * Convert a glob pattern to a RegExp.
 * @param {string} pattern e.g. "src/services/**" or "src/models/{User,Order}.ts"
 * @returns {RegExp}
 */
export function globToRegex(pattern) {
  // Escape regex special chars except for our glob meta chars
  let regex = pattern
    .replace(/[.+^$()|[\]\\]/g, "\\$&")
    .replace(/\{([^}]+)\}/g, (_, alts) => `(${alts.split(",").join("|")})`)
    .replace(/\*\*/g, "<<DOUBLESTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<DOUBLESTAR>>/g, ".*");
  return new RegExp(`^${regex}$`);
}

/**
 * Test if a file path matches any of a domain's path patterns.
 * Path comparison is normalized to forward slashes.
 * @param {string} filePath
 * @param {string[]} patterns
 * @returns {boolean}
 */
export function matchesAny(filePath, patterns) {
  const normalized = filePath.replace(/\\/g, "/");
  return patterns.some((p) => globToRegex(p).test(normalized));
}

/**
 * Find the domain (if any) that owns the given file path.
 * Returns null if no domain matches. Returns first match if multiple
 * (manifest must guarantee uniqueness; doc-sync audit catches violations).
 * @param {object} manifest Output of readManifest()
 * @param {string} filePath
 * @returns {string|null}
 */
export function findDomain(manifest, filePath) {
  for (const [name, def] of Object.entries(manifest.domains)) {
    if (matchesAny(filePath, def.paths)) return name;
  }
  return null;
}
