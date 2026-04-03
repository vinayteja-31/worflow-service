"use strict";

const core = require("@actions/core");

const DEFAULT_POLL_MS = 5000;

/**
 * POST /public?action=login — IAM authentication via API gateway.
 * @param {string} towerApiURL
 * @param {string} username
 * @param {string} password
 * @param {string} orgId
 * @returns {Promise<string>} access token
 */
async function iamLogin(towerApiURL, username, password, orgId) {
  const url = `${towerApiURL.replace(/\/+$/, "")}/public?action=login`;
  core.info("Authenticating with Tower Cloud...");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, organizationId: orgId }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`IAM returned non-JSON (HTTP ${res.status}): ${text.slice(0, 500)}`);
  }

  if (res.status >= 400) {
    throw new Error(`IAM login failed (HTTP ${res.status}): ${data.message || text.slice(0, 500)}`);
  }

  // Extract token from various response shapes
  const token =
    data.access_token || data.accessToken || data.token ||
    data.data?.access_token || data.data?.accessToken || data.data?.token ||
    data.result?.access_token || data.result?.accessToken || data.result?.token;

  if (!token) {
    throw new Error("Missing access token in IAM response");
  }

  core.info("Successfully authenticated");
  return token;
}

/**
 * GET /service/container-instance/:name — check container exists via API gateway.
 * @param {string} towerApiURL
 * @param {string} containerName
 * @param {string} token
 * @param {string} orgId
 */
async function getContainer(towerApiURL, containerName, token, orgId) {
  const url = `${towerApiURL.replace(/\/+$/, "")}/service/container-instance/${encodeURIComponent(containerName)}`;
  core.info(`Checking container instance '${containerName}'...`);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-organization-id": orgId,
    },
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { _raw: text };
  }

  return { status: res.status, data, text };
}

/**
 * PUT /service/container-instance/:name — update container image via API gateway.
 * @param {string} towerApiURL
 * @param {string} containerName
 * @param {string} token
 * @param {string} orgId
 * @param {object} containerSpec
 */
async function updateContainer(towerApiURL, containerName, token, orgId, containerSpec) {
  const url = `${towerApiURL.replace(/\/+$/, "")}/service/container-instance/${encodeURIComponent(containerName)}`;
  core.info(`Updating container '${containerName}' with new image...`);

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-organization-id": orgId,
    },
    body: JSON.stringify({ containerSpec }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { _raw: text };
  }

  if (res.status >= 400) {
    throw new Error(`Container update failed (HTTP ${res.status}): ${text.slice(0, 500)}`);
  }

  core.info("Container update accepted");
  return { status: res.status, data };
}

/**
 * Poll container state until healthy or timeout.
 * @param {string} towerApiURL
 * @param {string} containerName
 * @param {string} token
 * @param {string} orgId
 * @param {number} timeoutMs
 * @param {number} intervalMs
 */
async function waitForRollout(towerApiURL, containerName, token, orgId, timeoutMs, intervalMs) {
  const deadline = Date.now() + timeoutMs;
  core.info(`Polling rollout status (timeout: ${Math.round(timeoutMs / 1000)}s)...`);

  while (Date.now() < deadline) {
    try {
      const { status, data } = await getContainer(towerApiURL, containerName, token, orgId);
      if (status === 200) {
        const state = extractState(data);
        core.info(`Container '${containerName}': ${state}`);

        if (["running", "ready", "healthy", "succeeded"].includes(state)) {
          return state;
        }
        if (["failed", "error", "crashloopbackoff"].includes(state)) {
          throw new Error(`Container entered '${state}' state`);
        }
      }
    } catch (err) {
      if (err.message.startsWith("Container entered")) throw err;
      // transient error, keep polling
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Rollout timed out after ${Math.round(timeoutMs / 1000)}s`);
}

/**
 * Extract container state from API response.
 */
function extractState(data) {
  const d = data?.data || data;
  const container = d?.container || d;

  // Try direct state/status fields
  for (const key of ["state", "status"]) {
    const v = container?.[key];
    if (v && typeof v === "string") return v.toLowerCase();
  }

  // Try kubernetesStatus
  const k8s = d?.kubernetesStatus;
  if (k8s) {
    for (const key of ["phase", "state", "status"]) {
      const v = k8s[key];
      if (v && typeof v === "string") return v.toLowerCase();
    }
  }

  // Try rollout
  const rollout = container?.rollout;
  if (rollout) {
    for (const key of ["status", "state"]) {
      const v = rollout[key];
      if (v && typeof v === "string") return v.toLowerCase();
    }
  }

  return "unknown";
}

module.exports = { iamLogin, getContainer, updateContainer, waitForRollout };
