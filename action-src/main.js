"use strict";

const core = require("@actions/core");
const { iamLogin, getContainer, updateContainer } = require("./deploy-client");
const config = require("./config.json");

async function run() {
  try {
    // Read inputs
    const towerApiURL = config.gateway.url;
    const towerUser = core.getInput("tower-user", { required: true });
    const towerPassword = core.getInput("tower-password", { required: true });
    const orgId = core.getInput("organization-id", { required: true });
    const containerName = core.getInput("container-name", { required: true });
    const registryUrl = core.getInput("registry-url");
    const registryRepo = core.getInput("registry-repo");
    const registryUsername = core.getInput("registry-username");
    const registryPassword = core.getInput("registry-password");
    let image = core.getInput("image");

    // Mask secrets
    core.setSecret(towerPassword);
    if (registryPassword) core.setSecret(registryPassword);

    // Auto-generate registry repo if not provided: {github_repo_name}/{container_name}
    // Same pattern as the Go deployment action
    let resolvedRepo = registryRepo;
    if (!resolvedRepo) {
      const githubRepo = process.env.GITHUB_REPOSITORY || "";
      const repoName = githubRepo.includes("/") ? githubRepo.split("/")[1] : githubRepo;
      if (repoName) {
        resolvedRepo = `${repoName}/${containerName}`;
        core.info(`Auto-generated registry repo: ${resolvedRepo}`);
      }
    }

    // Auto-generate image if not provided: {registry_url}/{repo}:{sha}
    if (!image) {
      if (!registryUrl) {
        throw new Error("Either 'image' or 'registry-url' must be provided");
      }
      const sha = process.env.GITHUB_SHA || "latest";
      if (!resolvedRepo) {
        throw new Error("Cannot auto-generate image: registry-repo not provided and GITHUB_REPOSITORY not available");
      }
      image = `${registryUrl}/${resolvedRepo}:${sha}`;
      core.info(`Auto-generated image: ${image}`);
    }

    core.info(`Deploying container '${containerName}' with image: ${image}`);

    // Step 1: IAM login via API gateway
    const token = await iamLogin(towerApiURL, towerUser, towerPassword, orgId);
    core.setSecret(token);

    // Step 2: Preflight — verify container exists
    const lookup = await getContainer(towerApiURL, containerName, token, orgId);
    if (lookup.status === 404) {
      throw new Error(
        `Container '${containerName}' not found. Container must already exist.`
      );
    }
    if (lookup.status === 401 || lookup.status === 403) {
      throw new Error(`Container lookup failed (HTTP ${lookup.status}): check credentials`);
    }
    if (lookup.status !== 200) {
      throw new Error(`Container lookup failed (HTTP ${lookup.status}): ${(lookup.text || "").slice(0, 500)}`);
    }
    core.info(`Container '${containerName}' found`);

    // Step 3: Update container image via API gateway
    // Parse full image URL into registry (host) + imageTag (path:tag)
    let registry, imageTag;
    const firstSlash = image.indexOf("/");

    if (firstSlash < 0 || (!image.slice(0, firstSlash).includes(".") && !image.slice(0, firstSlash).includes(":"))) {
      registry = "docker.io";
      imageTag = image.includes("/") ? image : `library/${image}`;
    } else {
      registry = image.slice(0, firstSlash);
      imageTag = image.slice(firstSlash + 1);
    }

    if (!imageTag.includes(":") && !imageTag.includes("@")) {
      imageTag = `${imageTag}:latest`;
    }

    // Determine registry type and credentials
    let registryType;
    const isTower = registry.includes("tower.cloud");
    const hasCreds = !!(registryUsername && registryPassword);

    // For Tower registry, use IAM credentials if no separate registry creds provided
    let effectiveRegistryUsername = registryUsername;
    let effectiveRegistryPassword = registryPassword;

    if (isTower) {
      registryType = "tower";
      if (!hasCreds) {
        core.info("Tower registry detected — using IAM credentials for registry authentication.");
        effectiveRegistryUsername = towerUser;
        effectiveRegistryPassword = towerPassword;
      }
    } else if (hasCreds) {
      registryType = "private";
    } else {
      registryType = "public";
    }

    const containerSpec = { registryType, registry, imageTag };
    const hasEffectiveCreds = !!(effectiveRegistryUsername && effectiveRegistryPassword);

    if (hasEffectiveCreds) {
      containerSpec.registryCredentials = {
        username: effectiveRegistryUsername,
        password: effectiveRegistryPassword,
        label: `wf-${containerName.replace(/[^a-zA-Z0-9-]/g, "-")}`.slice(0, 50),
      };
    }

    core.info(`Registry: ${registry}, ImageTag: ${imageTag}, Type: ${registryType}`);

    const updateResult = await updateContainer(towerApiURL, containerName, token, orgId, containerSpec);

    const taskId = updateResult.data?.data?.taskId || updateResult.data?.taskId || "";

    // Set outputs
    core.setOutput("status", "accepted");
    core.setOutput("image", image);
    if (taskId) core.setOutput("task-id", taskId);

    core.info(`Container update accepted${taskId ? ` (taskId: ${taskId})` : ""}`);
    core.info(`Image: ${image}`);
  } catch (err) {
    core.setFailed(err.message);
  }
}

run();
