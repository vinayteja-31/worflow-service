/**
 * Build container-mgmt API containerSpec objects (create/update).
 * @see container-mgmt/service-container-mgmt validateRequest.ts, interfaces/container.ts
 */
import { REGISTRY } from "./registry.js";

/**
 * @param {string} image full ref e.g. host/ns/repo:tag or host/ns/repo@sha256:...
 * @returns {{ registry: string, imageTag: string }}
 */
export function parseRegistryImage(image) {
  const s = String(image || "").trim();
  const slash = s.indexOf("/");
  if (slash < 0) {
    throw new Error(
      "invalid image: expected registryhost/namespace/repo:tag or repo@sha256:... (e.g. test2.hyd.cr.tower.cloud/my-org/my-app:v1)"
    );
  }
  const registry = s.slice(0, slash).replace(/\/+$/, "");
  let rest = s.slice(slash + 1).trim();
  if (!registry || !rest) {
    throw new Error("invalid image: empty registry or image path");
  }
  if (!rest.includes(":") && !/@[a-z0-9]+:/i.test(rest)) {
    rest = `${rest}:latest`;
  }
  return { registry, imageTag: rest };
}

/**
 * @param {import('./registry.js').RegistryType} registryType
 * @returns {'tower'|'private'|'public'}
 */
export function registryTypeForContainerMgmt(registryType) {
  if (registryType === REGISTRY.TOWER_MANAGED) return "tower";
  if (registryType === REGISTRY.EXTERNAL_PRIV) return "private";
  return "public";
}

/**
 * Partial update — image + registry auth for private/tower.
 * @param {import('./types.js').ExecuteDeploymentRequest} req
 * @param {import('./registry.js').RegistryType} registryType
 * @returns {Record<string, unknown>}
 */
export function buildUpdateContainerSpec(req, registryType) {
  const rt = registryTypeForContainerMgmt(registryType);
  const { registry, imageTag } = parseRegistryImage(req.image);

  /** @type {Record<string, unknown>} */
  const containerSpec = {
    registryType: rt,
    registry,
    imageTag,
  };

  if (rt === "tower" || rt === "private") {
    const user = String(req.registry?.username || "").trim();
    const pass = String(req.registry?.password || "").trim();
    if (user && pass) {
      const label =
        String(req.registry?.registrySecretLabel || "").trim() ||
        `wf-${String(req.containerName || "app").replace(/[^a-zA-Z0-9-]/g, "-")}`.slice(0, 50);
      containerSpec.registryCredentials = {
        username: user,
        password: pass,
        label,
      };
    }
  }

  return containerSpec;
}
