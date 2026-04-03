/**
 * @param {Record<string, unknown>} m
 * @param {string[]} keys
 */
export function firstString(m, ...keys) {
  if (!m) return "";
  for (const key of keys) {
    const v = m[key];
    if (typeof v === "string" && v) return v;
  }
  return "";
}

/**
 * @param {Record<string, unknown>} m
 * @param {string[]} keys
 */
export function firstInt(m, ...keys) {
  if (!m) return 0;
  for (const key of keys) {
    const v = m[key];
    if (typeof v === "number" && !Number.isNaN(v)) return Math.floor(v);
  }
  return 0;
}

/**
 * @param {Record<string, unknown>} m
 * @param {string[]} keys
 * @returns {Record<string, unknown>|null}
 */
export function firstMap(m, ...keys) {
  if (!m) return null;
  for (const key of keys) {
    const v = m[key];
    if (v && typeof v === "object" && !Array.isArray(v)) return /** @type {Record<string, unknown>} */ (v);
  }
  return null;
}
