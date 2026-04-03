/** @typedef {'tower-managed'|'external-private'|'external-public'|'unknown'} RegistryType */

export const REGISTRY = {
  TOWER_MANAGED: "tower-managed",
  EXTERNAL_PRIV: "external-private",
  EXTERNAL_PUB: "external-public",
  UNKNOWN: "unknown",
};

const KNOWN_PUBLIC = new Set([
  "docker.io",
  "index.docker.io",
  "registry-1.docker.io",
  "ghcr.io",
  "gcr.io",
  "k8s.gcr.io",
  "registry.k8s.io",
  "quay.io",
  "mcr.microsoft.com",
]);

export function parseImageHost(image) {
  const parts = String(image || "").split("/");
  if (parts.length < 2) return "";
  const first = parts[0];
  if (first.includes(".") || first.includes(":") || first === "localhost") {
    return first.toLowerCase();
  }
  return "";
}

/**
 * @param {import('./types.js').ExecuteDeploymentRequest} req
 * @returns {RegistryType}
 */
export function resolveRegistryTypeAuto(req) {
  if (req.registry?.towerRegistryName) return REGISTRY.TOWER_MANAGED;
  if (req.registry?.registryHost) {
    if (req.registry.username || req.registry.password) return REGISTRY.EXTERNAL_PRIV;
    return REGISTRY.EXTERNAL_PUB;
  }
  const host = parseImageHost(req.image || "");
  if (!host) return REGISTRY.UNKNOWN;
  if (host.includes("tower.cloud") || host.startsWith("tcr.")) return REGISTRY.TOWER_MANAGED;
  if (KNOWN_PUBLIC.has(host)) return REGISTRY.EXTERNAL_PUB;
  return REGISTRY.EXTERNAL_PRIV;
}

/**
 * @param {import('./types.js').ExecuteDeploymentRequest} req
 * @returns {{ type: RegistryType, error?: string }}
 */
export function resolveRegistryType(req) {
  const mode = String(req.registryMode || "").toLowerCase().trim();
  if (!mode || mode === "auto") {
    return { type: resolveRegistryTypeAuto(req) };
  }
  if (mode === "tower-managed") return { type: REGISTRY.TOWER_MANAGED };
  if (mode === "external-private") return { type: REGISTRY.EXTERNAL_PRIV };
  if (mode === "external-public") return { type: REGISTRY.EXTERNAL_PUB };
  return { type: REGISTRY.UNKNOWN, error: `unsupported registryMode "${req.registryMode}"` };
}

/**
 * @param {import('./types.js').ExecuteDeploymentRequest} req
 * @param {RegistryType} registryType
 */
export function buildRegistryPayload(req, registryType) {
  /** @type {Record<string, unknown>} */
  const payload = { type: registryType };
  if (req.registry?.registryHost) payload.host = req.registry.registryHost;
  if (req.registry?.towerRegistryName) payload.towerRegistryName = req.registry.towerRegistryName;
  if (registryType === REGISTRY.EXTERNAL_PRIV || registryType === REGISTRY.TOWER_MANAGED) {
    if (req.registry?.username) payload.username = req.registry.username;
    if (req.registry?.password) payload.password = req.registry.password;
    payload.secretPolicy = "reuse-or-create";
  }
  return payload;
}
