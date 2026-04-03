/**
 * Tower container registry host pattern: `{name}.hyd.cr.tower.cloud`
 * @param {string} registryName e.g. "test"
 * @returns {string} e.g. "test.hyd.cr.tower.cloud"
 */
export function towerRegistryHostFromName(registryName) {
  const n = String(registryName || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!n) throw new Error("tower registry name is required (e.g. test → test.hyd.cr.tower.cloud)");
  return `${n}.hyd.cr.tower.cloud`;
}
