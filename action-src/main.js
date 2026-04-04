"use strict";

const core = require("@actions/core");
const { iamLogin, getContainer, updateContainer } = require("./deploy-client");

async function run() {
  try {
    // Read inputs
    const towerApiURL = core.getInput("tower-api-url", { required: true }) || process.env.TOWER_API_URL;
    const towerUser = core.getInput("tower-user", { required: true });
    const towerPassword = core.getInput("tower-password", { required: true });
    const orgId = core.getInput("organization-id", { required: true });
    const containerName = core.getInput("container-name", { required: true });
    const image = core.getInput("image", { required: true });
    const registryUsername = core.getInput("registry-username");
    const registryPassword = core.getInput("registry-password");

    // Mask secrets
    core.setSecret(towerPassword);
    if (registryPassword) core.setSecret(registryPassword);

    if (!towerApiURL) {
      throw new Error("tower-api-url is required (or set TOWER_API_URL variable)");
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
    // e.g. "test2.hyd.cr.tower.cloud/my-org/my-app:sha" → registry="test2.hyd.cr.tower.cloud", imageTag="my-org/my-app:sha"
    // Docker Hub short-form: "nginx:latest" → registry="docker.io", imageTag="library/nginx:latest"
    let registry, imageTag;
    const firstSlash = image.indexOf("/");

    if (firstSlash < 0 || (!image.slice(0, firstSlash).includes(".") && !image.slice(0, firstSlash).includes(":"))) {
      // No slash or first segment is not a hostname (e.g. "nginx:latest" or "library/nginx:latest")
      registry = "docker.io";
      imageTag = image.includes("/") ? image : `library/${image}`;
    } else {
      registry = image.slice(0, firstSlash);
      imageTag = image.slice(firstSlash + 1);
    }

    if (!imageTag.includes(":") && !imageTag.includes("@")) {
      imageTag = `${imageTag}:latest`;
    }

    // Determine registry type
    let registryType;
    const isTower = registry.includes("tower.cloud");
    const hasCreds = !!(registryUsername && registryPassword);

    if (isTower) {
      registryType = "tower";
      if (!hasCreds) {
        core.warning("Tower registry detected but no registry-username/registry-password provided. Image pull may fail.");
      }
    } else if (hasCreds) {
      registryType = "private";
    } else {
      registryType = "public";
    }

    const containerSpec = { registryType, registry, imageTag };

    // Add registry credentials for tower/private registries
    if (hasCreds) {
      containerSpec.registryCredentials = {
        username: registryUsername,
        password: registryPassword,
        label: `wf-${containerName.replace(/[^a-zA-Z0-9-]/g, "-")}`.slice(0, 50),
      };
    }

    core.info(`Registry: ${registry}, ImageTag: ${imageTag}, Type: ${registryType}`);

    const updateResult = await updateContainer(towerApiURL, containerName, token, orgId, containerSpec);

    // Extract taskId if returned (same as Go deployment action)
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
