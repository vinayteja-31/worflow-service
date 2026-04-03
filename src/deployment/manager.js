import { randomBytes } from "node:crypto";
import { buildAndPush } from "../docker/buildAndPush.js";
import { REGISTRY, resolveRegistryType, resolveRegistryTypeAuto } from "./registry.js";
import { firstInt, firstMap, firstString } from "./httpClient.js";
import { buildUpdateContainerSpec } from "./containerSpec.js";
import { resolveTowerRegistryHost } from "../config/resolveRegistryHost.js";

const DEFAULT_POLL_MS = 5000;
const DEFAULT_ROLLOUT_MS = 10 * 60 * 1000;
const DEFAULT_TOWER_REGISTRY_HOST = "test.hyd.cr.tower.cloud";

function randomToken(n = 8) {
  return randomBytes(n).toString("hex");
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {import('./types.js').ExecuteDeploymentRequest} req
 */
export function normalizeRequest(req) {
  if (req.build?.enabled) {
    const b = req.build;
    if (!b.contextDir) b.contextDir = ".";
    if (!b.dockerfile) b.dockerfile = "Dockerfile";
    if (!b.localImageName) b.localImageName = "my-app";
    if (!b.registryHost) b.registryHost = DEFAULT_TOWER_REGISTRY_HOST;
    if (!b.tag?.trim()) {
      b.tag = process.env.DEPLOY_IMAGE_TAG?.trim() || `build-${Math.floor(Date.now() / 1000)}`;
    }
    if (!b.repository?.trim()) {
      throw new Error("build.repository is required when build.enabled is true");
    }
    b.repository = b.repository.replace(/^\/+|\/+$/g, "");
    if (!req.image?.trim()) {
      const host = b.registryHost.replace(/\/+$/, "");
      req.image = `${host}/${b.repository}:${b.tag.trim()}`;
    }
  }
}

/**
 * @param {import('./types.js').ExecuteDeploymentRequest} req
 */
export function buildRegistryCredentials(req) {
  let user = req.build?.registryUsername?.trim() || "";
  let pass = req.build?.registryPassword?.trim() || "";
  if (!user) user = process.env.TOWER_REGISTRY_USERNAME || "";
  if (!pass) pass = process.env.TOWER_REGISTRY_PASSWORD || "";
  return { user, pass };
}

/**
 * @param {import('./types.js').ExecuteDeploymentRequest} req
 */
export function syncRegistryFromBuild(req) {
  if (!req.build?.enabled) return;
  if (!req.registry) req.registry = {};
  if (!req.registry.registryHost) req.registry.registryHost = req.build.registryHost;
  if (!req.registry.repository?.trim() && req.build.repository?.trim()) {
    req.registry.repository = req.build.repository.replace(/^\/+|\/+$/g, "");
  }
  const { user, pass } = buildRegistryCredentials(req);
  if (!req.registry.username && user) req.registry.username = user;
  if (!req.registry.password && pass) req.registry.password = pass;
}

/**
 * @param {import('./types.js').ExecuteDeploymentRequest} req
 */
export function validateRequest(req) {
  const buildOn = !!req.build?.enabled;
  if (!buildOn && !req.image?.trim()) {
    const reg = req.registry || {};
    const hasRepo = !!reg.repository?.trim();
    let hasHost = !!reg.registryHost?.trim();
    if (!hasHost && reg.towerRegistryName?.trim()) hasHost = true;
    if (!hasRepo || !hasHost) {
      throw new Error(
        "image is required when build is disabled (or set registry.repository + registryHost/towerRegistryName to deploy host/repo:deployMovingTag)"
      );
    }
  }
  if (!req.orgId) throw new Error("orgId is required");
  if (!req.serviceName) throw new Error("serviceName is required");
  if (!req.containerName) throw new Error("containerName is required");
  if (!req.auth?.username) throw new Error("auth.username is required");
  if (!req.auth?.password) throw new Error("auth.password is required");
  if (buildOn) {
    const { user, pass } = buildRegistryCredentials(req);
    if (!user || !pass) {
      throw new Error(
        "Tower registry credentials required: build.registryUsername/registryPassword or TOWER_REGISTRY_USERNAME / TOWER_REGISTRY_PASSWORD"
      );
    }
  }
}

/**
 * Resolve `image` when missing or `host/repo` without tag → use moving tag (default latest).
 * @param {import('./types.js').ExecuteDeploymentRequest} req
 */
export function normalizeDeployImage(req) {
  const reg = req.registry || {};
  let host = String(reg.registryHost || "").trim();
  if (!host && reg.towerRegistryName?.trim()) {
    try {
      host = resolveTowerRegistryHost({ towerRegistryName: reg.towerRegistryName });
    } catch {
      /* leave empty */
    }
  }
  const repo = String(reg.repository || "").trim();
  const moving =
    String(req.deployMovingTag || reg.movingTag || "latest").trim() || "latest";

  let img = String(req.image || "").trim();
  if (!img) {
    if (host && repo) {
      req.image = `${host.replace(/\/+$/, "")}/${repo}:${moving}`;
    }
    return;
  }
  if (/@[a-z0-9]+:/i.test(img)) return;
  const slash = img.indexOf("/");
  if (slash >= 0) {
    const rest = img.slice(slash + 1);
    if (rest && !rest.includes(":")) {
      req.image = `${img}:${moving}`;
    }
  }
}

/**
 * @param {string} url
 * @param {string} method
 * @param {string} [bearer]
 * @param {unknown} [body]
 * @param {{ organizationId?: string }} [opts] — container-mgmt requires `x-organization-id` (see authMiddleware)
 */
async function doJSON(url, method, bearer, body, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const oid = String(opts.organizationId || "").trim();
  if (oid) headers["x-organization-id"] = oid;
  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { _raw: text };
  }
  return { status: res.status, data, text };
}

async function iamLogin(iamBaseURL, req) {
  const url = `${iamBaseURL.replace(/\/+$/, "")}/public?action=login`;
  /** IAM expects `organizationId` (not `orgId`). */
  const { status, data, text } = await doJSON(url, "POST", "", {
    username: req.auth.username,
    password: req.auth.password,
    organizationId: req.orgId,
  });
  if (status >= 400) {
    const hint = text && text.length < 500 ? text : JSON.stringify(data);
    throw new Error(`iam returned status ${status}${hint ? `: ${hint}` : ""}`);
  }
  const raw = /** @type {Record<string, unknown>} */ (data);
  let token = firstString(raw, "access_token", "accessToken", "token");
  if (!token) {
    const nested = firstMap(raw, "data", "result", "payload");
    if (nested) token = firstString(nested, "access_token", "accessToken", "token");
  }
  if (!token) throw new Error("missing access token in iam response");
  let expiresIn = firstInt(raw, "expires_in", "expiresIn");
  if (!expiresIn) {
    const nested = firstMap(raw, "data", "result", "payload");
    if (nested) expiresIn = firstInt(nested, "expires_in", "expiresIn");
  }
  return { accessToken: token, expiresIn };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchContainerState(towerApiURL, containerName, token, organizationId) {
  const url = `${towerApiURL.replace(/\/+$/, "")}/service/container-instance/${encodeURIComponent(containerName)}`;
  const { status, data } = await doJSON(url, "GET", token, null, { organizationId });
  if (status >= 400) throw new Error(`status ${status}`);
  const raw = /** @type {Record<string, unknown>} */ (data);

  const dataObj = firstMap(raw, "data") || raw;
  const containerRow = firstMap(dataObj, "container") || dataObj;
  for (const key of ["state", "status"]) {
    const v = firstString(containerRow, key);
    if (v) return v.toLowerCase();
  }
  const k8s = firstMap(dataObj, "kubernetesStatus");
  if (k8s) {
    for (const key of ["phase", "state", "status"]) {
      const v = firstString(k8s, key);
      if (v) return v.toLowerCase();
    }
  }
  const rollout = firstMap(containerRow, "rollout");
  if (rollout) {
    const v = firstString(rollout, "status", "state");
    if (v) return v.toLowerCase();
  }
  throw new Error("container state unavailable");
}

/**
 * GET /service/container-instance/:name via API gateway.
 * @param {string} towerApiURL
 * @param {string} containerName
 * @param {string} token
 * @param {string} organizationId
 */
async function getContainerLookup(towerApiURL, containerName, token, organizationId) {
  const url = `${towerApiURL.replace(/\/+$/, "")}/service/container-instance/${encodeURIComponent(containerName)}`;
  return doJSON(url, "GET", token, null, { organizationId });
}

function shortHttpDetail(text, max = 1200) {
  if (!text || typeof text !== "string") return "";
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

async function waitForRollout(towerApiURL, containerName, token, timeoutMs, organizationId) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const state = await fetchContainerState(towerApiURL, containerName, token, organizationId);
      if (["running", "ready", "healthy", "succeeded"].includes(state)) return;
      if (["failed", "error", "crashloopbackoff"].includes(state)) {
        throw new Error(`container entered ${state} state`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("container entered")) throw e;
      // transient: keep polling
    }
    await sleep(DEFAULT_POLL_MS);
  }
  throw new Error("rollout timeout reached");
}

export class DeploymentManager {
  /**
   * @param {{ towerApiURL: string }} config
   */
  constructor(config) {
    this.towerApiURL = config.towerApiURL?.replace(/\/+$/, "") || "";
    /** @type {Map<string, import('./types.js').DeploymentRecord>} */
    this.deployments = new Map();
  }

  /**
   * @param {import('./types.js').ExecuteDeploymentRequest} rawReq
   */
  async start(rawReq) {
    const req = structuredClone(rawReq);
    normalizeRequest(req);
    normalizeDeployImage(req);
    validateRequest(req);
    if (!req.requestId) req.requestId = `req_${randomToken(8)}`;

    const depId = `dep_${randomToken(12)}`;
    const rt = resolveRegistryType(req);
    if (rt.error) throw new Error(rt.error);
    let registryType = rt.type;
    if (registryType === REGISTRY.UNKNOWN) {
      registryType = resolveRegistryTypeAuto(req);
    }

    const record = {
      deploymentId: depId,
      requestId: req.requestId,
      orgId: req.orgId,
      serviceName: req.serviceName,
      containerName: req.containerName,
      image: req.image || "",
      resolvedRegistryType: registryType,
      status: "pending",
      message: "deployment accepted",
      startedAt: nowIso(),
      updatedAt: nowIso(),
      completedAt: null,
    };
    this.deployments.set(depId, record);

    setImmediate(() => this.execute(depId, req, registryType).catch(() => {}));

    return this.get(depId);
  }

  /**
   * @param {string} id
   */
  get(id) {
    const d = this.deployments.get(id);
    if (!d) throw new Error("deployment not found");
    return { ...d };
  }

  update(id, status, message, complete) {
    const d = this.deployments.get(id);
    if (!d) return;
    d.status = status;
    d.message = message;
    d.updatedAt = nowIso();
    if (complete) d.completedAt = nowIso();
  }

  fail(id, message) {
    this.update(id, "failed", message, true);
  }

  /**
   * @param {string} deploymentId
   * @param {import('./types.js').ExecuteDeploymentRequest} req
   * @param {import('./registry.js').RegistryType} registryType
   */
  async execute(deploymentId, req, registryType) {
    this.update(deploymentId, "in_progress", "starting deployment workflow", false);

    try {
      if (req.build?.enabled) {
        this.update(deploymentId, "in_progress", "docker build, tag, login, push", false);
        const { user, pass } = buildRegistryCredentials(req);
        const b = req.build;
        const movingTag =
          String(b.movingTag || req.registry?.movingTag || "latest").trim() || "latest";
        const bp = await buildAndPush({
          contextDir: b.contextDir,
          dockerfile: b.dockerfile,
          platform: "linux/amd64",
          localImage: b.localImageName,
          remoteImage: {
            host: b.registryHost,
            repository: b.repository,
            tag: b.tag,
          },
          registryHost: b.registryHost,
          username: user,
          password: pass,
          alsoPushMovingTag: b.alsoPushMovingTag !== false,
          movingTag,
        });
        const preferDigest = b.deployWithDigest !== false;
        if (preferDigest && bp.digestRef) {
          req.image = bp.digestRef;
        } else {
          const useMoving = b.deployWithMovingTag !== false;
          req.image = useMoving ? bp.movingRef : bp.primaryRef;
        }
        const dep = this.deployments.get(deploymentId);
        if (dep) dep.image = req.image;
        syncRegistryFromBuild(req);
        const rt2 = resolveRegistryType(req);
        if (!rt2.error) {
          let t = rt2.type;
          if (t === REGISTRY.UNKNOWN) t = resolveRegistryTypeAuto(req);
          registryType = t;
          if (dep) dep.resolvedRegistryType = registryType;
        }
      }

      if (!this.towerApiURL) throw new Error("TOWER_API_URL is not configured");

      const api = this.towerApiURL;

      // Step 1: IAM login via API gateway (same path as deployment action)
      const loginResp = await iamLogin(api, req);
      if (loginResp.expiresIn > 0 && loginResp.expiresIn < 120) {
        throw new Error("iam access token ttl below threshold");
      }

      const token = loginResp.accessToken;
      const name = req.containerName;

      // Step 2: Container lookup via API gateway
      const lookup = await getContainerLookup(api, name, token, req.orgId);
      const lookupStatus = lookup.status;
      const lookupErr = shortHttpDetail(lookup.text);
      if (lookupStatus === 401 || lookupStatus === 403) {
        throw new Error(
          `container lookup failed: ${lookupStatus}${lookupErr ? ` — ${lookupErr}` : " (check token / API gateway)"}`
        );
      }

      if (lookupStatus === 404) {
        throw new Error(
          `container "${name}" not found (GET returned 404). ` +
            `Container must already exist. Check containerName, orgId, and that the app exists in this organization.`
        );
      } else if (lookupStatus === 200) {
        // Step 3: Update container image via API gateway
        this.update(deploymentId, "in_progress", "updating container image via API gateway", false);
        const containerSpec = buildUpdateContainerSpec(req, registryType);
        const putUrl = `${api}/service/container-instance/${encodeURIComponent(name)}`;
        const putRes = await doJSON(putUrl, "PUT", token, { containerSpec }, { organizationId: req.orgId });
        if (putRes.status >= 400) {
          throw new Error(`container update failed: ${putRes.status} ${putRes.text}`);
        }
      } else {
        throw new Error(
          `container lookup failed: status ${lookupStatus}${lookupErr ? ` — ${lookupErr}` : ""}`
        );
      }

      // Step 4: Poll rollout status via API gateway
      this.update(deploymentId, "in_progress", "container rollout in progress", false);

      let timeoutMs = DEFAULT_ROLLOUT_MS;
      if (req.rollout?.timeoutSeconds > 0) {
        timeoutMs = req.rollout.timeoutSeconds * 1000;
      }
      await waitForRollout(
        api,
        req.containerName,
        loginResp.accessToken,
        timeoutMs,
        req.orgId
      );

      this.update(deploymentId, "succeeded", "deployment rollout completed", true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.fail(deploymentId, msg);
    }
  }
}
