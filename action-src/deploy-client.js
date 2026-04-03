"use strict";

const core = require("@actions/core");

/**
 * POST /api/deployments/execute — start a deployment.
 * @param {string} gatewayUrl
 * @param {object} body — ExecuteDeploymentRequest
 * @returns {Promise<{ deploymentId: string, status: string, image: string }>}
 */
async function execute(gatewayUrl, body) {
  const url = `${gatewayUrl.replace(/\/+$/, "")}/api/deployments/execute`;
  core.info(`POST ${url}`);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Gateway returned non-JSON (HTTP ${res.status}): ${text.slice(0, 500)}`);
  }

  if (res.status !== 200 && res.status !== 202) {
    throw new Error(
      `Gateway returned HTTP ${res.status}: ${data.message || data.error || text.slice(0, 500)}`
    );
  }

  if (!data.success) {
    throw new Error(`Gateway returned success=false: ${data.message || JSON.stringify(data)}`);
  }

  const deploymentId = data.data?.deploymentId;
  if (!deploymentId) {
    throw new Error("Missing data.deploymentId in gateway response");
  }

  return {
    deploymentId,
    status: data.data.status || "pending",
    image: data.data.image || body.image || "",
  };
}

/**
 * Poll GET /api/deployments/:id until terminal state.
 * @param {string} gatewayUrl
 * @param {string} deploymentId
 * @param {number} timeoutMs
 * @param {number} intervalMs
 * @returns {Promise<{ status: string, message: string, image: string }>}
 */
async function poll(gatewayUrl, deploymentId, timeoutMs, intervalMs) {
  const url = `${gatewayUrl.replace(/\/+$/, "")}/api/deployments/${deploymentId}`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status === 200) {
        const json = await res.json();
        const status = json.data?.status;
        const message = json.data?.message || "";
        const image = json.data?.image || "";
        core.info(`Deployment ${deploymentId}: ${status} — ${message}`);

        if (status === "succeeded") {
          return { status, message, image };
        }
        if (status === "failed") {
          throw new Error(`Deployment failed: ${message}`);
        }
      } else {
        core.warning(`Status poll returned HTTP ${res.status}`);
      }
    } catch (err) {
      if (err.message.startsWith("Deployment failed:")) throw err;
      core.warning(`Poll error: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Rollout timed out after ${Math.round(timeoutMs / 1000)}s`);
}

/**
 * Execute deployment and poll until done.
 * @param {string} gatewayUrl
 * @param {object} body
 * @param {number} pollIntervalSec
 * @param {number} timeoutSec
 * @returns {Promise<{ deploymentId: string, status: string, image: string }>}
 */
async function executeAndPoll(gatewayUrl, body, pollIntervalSec, timeoutSec) {
  const result = await execute(gatewayUrl, body);
  core.info(`Deployment started: ${result.deploymentId}`);

  const final = await poll(
    gatewayUrl,
    result.deploymentId,
    timeoutSec * 1000,
    pollIntervalSec * 1000
  );

  return {
    deploymentId: result.deploymentId,
    status: final.status,
    image: final.image || result.image,
  };
}

module.exports = { execute, poll, executeAndPoll };
