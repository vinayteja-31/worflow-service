import { towerRegistryHostFromName } from "./towerRegistry.js";

/**
 * @param {{ registryHost?: string, towerRegistryName?: string }} opts
 */
export function resolveTowerRegistryHost(opts) {
  const explicit = String(opts.registryHost || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const name = String(opts.towerRegistryName || "").trim();
  if (!name) {
    throw new Error("Provide towerRegistryName (e.g. test) or full registryHost");
  }
  return towerRegistryHostFromName(name);
}
