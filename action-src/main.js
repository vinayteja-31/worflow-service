"use strict";

const core = require("@actions/core");
const { buildRequestBody } = require("./input-mapper");
const { executeAndPoll } = require("./deploy-client");

async function run() {
  try {
    // Mask secrets so they don't appear in logs
    const iamPassword = core.getInput("iam-password", { required: true });
    const registryPassword = core.getInput("registry-password");
    core.setSecret(iamPassword);
    if (registryPassword) core.setSecret(registryPassword);

    // Read all inputs
    const inputs = {
      gatewayUrl: core.getInput("gateway-url", { required: true }),
      orgId: core.getInput("org-id", { required: true }),
      iamUsername: core.getInput("iam-username", { required: true }),
      iamPassword,
      serviceName: core.getInput("service-name", { required: true }),
      containerName: core.getInput("container-name", { required: true }),
      image: core.getInput("image", { required: true }),
      environment: core.getInput("environment"),
      registryMode: core.getInput("registry-mode"),
      registryHost: core.getInput("registry-host"),
      towerRegistryName: core.getInput("tower-registry-name"),
      registryUsername: core.getInput("registry-username"),
      registryPassword,
      rolloutTimeoutSeconds: core.getInput("rollout-timeout-seconds"),
      pollIntervalSeconds: core.getInput("poll-interval-seconds"),
      requestId: core.getInput("request-id"),
    };

    const body = buildRequestBody(inputs);
    core.info(`Deploying ${inputs.containerName} with image ${inputs.image}`);

    const pollInterval = parseInt(inputs.pollIntervalSeconds, 10) || 5;
    const timeout = parseInt(inputs.rolloutTimeoutSeconds, 10) || 600;

    const result = await executeAndPoll(inputs.gatewayUrl, body, pollInterval, timeout);

    // Set outputs
    core.setOutput("deployment-id", result.deploymentId);
    core.setOutput("status", result.status);
    core.setOutput("image", result.image);

    core.info(`Deployment ${result.deploymentId} ${result.status}`);
  } catch (err) {
    core.setFailed(err.message);
  }
}

run();
