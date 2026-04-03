"use strict";

/**
 * Maps GitHub Action inputs to the ExecuteDeploymentRequest shape
 * expected by POST /api/deployments/execute on the gateway.
 *
 * @param {object} inputs — parsed action inputs (camelCase keys)
 * @returns {object} request body for the gateway
 */
function buildRequestBody(inputs) {
  const body = {
    orgId: inputs.orgId,
    environment: inputs.environment || "dev",
    serviceName: inputs.serviceName,
    containerName: inputs.containerName,
    image: inputs.image,
    requestId:
      inputs.requestId ||
      `ci-run-${process.env.GITHUB_RUN_ID || "local"}-${process.env.GITHUB_RUN_ATTEMPT || "1"}`,
    auth: {
      username: inputs.iamUsername,
      password: inputs.iamPassword,
    },
    registryMode: inputs.registryMode || "auto",
    rollout: {
      timeoutSeconds: parseInt(inputs.rolloutTimeoutSeconds, 10) || 600,
    },
  };

  const registry = {};
  if (inputs.towerRegistryName) registry.towerRegistryName = inputs.towerRegistryName;
  if (inputs.registryHost) registry.registryHost = inputs.registryHost;
  if (inputs.registryUsername) registry.username = inputs.registryUsername;
  if (inputs.registryPassword) registry.password = inputs.registryPassword;
  if (Object.keys(registry).length) body.registry = registry;

  return body;
}

module.exports = { buildRequestBody };
