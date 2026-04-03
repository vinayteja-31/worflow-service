#!/usr/bin/env node
/**
 * Reads `requirement_inputs.js`, calls IAM + container management PUT (roll out image).
 * Loads `workflow-service/.env` so IAM_SERVICE_URL / SERVICE_CONTAINER_MGMT_URL apply.
 * Resolves `image`: `DEPLOY_IMAGE` env, or `@last:digest` / `@last:latest` (from `.last-build-image.json`
 * written by `run:build-push`), or empty + `registry.repository` → `host/repo:latest`.
 * Container must already exist (GET 404 = error).
 * Same behavior as POST /api/container/update-image with body.containerUpdate.
 */
import dotenv from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

import { DeploymentManager } from "../src/deployment/manager.js";
import { resolveTowerRegistryHost } from "../src/config/resolveRegistryHost.js";
import { loadRequirementInputs } from "./load-requirement-inputs.mjs";
import { resolveContainerUpdateImage } from "./resolveContainerUpdateImage.js";

const IAM_SERVICE_URL = process.env.IAM_SERVICE_URL || "";
const SERVICE_CONTAINER_MGMT_URL = process.env.SERVICE_CONTAINER_MGMT_URL || "";

const mod = await loadRequirementInputs();
const cu = mod.default?.containerUpdate;
if (!cu || typeof cu !== "object") {
  console.error("requirement_inputs: missing containerUpdate section");
  process.exit(1);
}

const registry = { ...(cu.registry || {}) };
if (!registry.registryHost?.trim() && registry.towerRegistryName?.trim()) {
  registry.registryHost = resolveTowerRegistryHost({
    towerRegistryName: registry.towerRegistryName,
  });
}
if (!registry.repository?.trim() && mod.default?.buildAndPush?.repository?.trim()) {
  registry.repository = mod.default.buildAndPush.repository.replace(/^\/+|\/+$/g, "");
}

const resolvedImage = resolveContainerUpdateImage(cu);

const body = {
  orgId: cu.orgId,
  serviceName: cu.serviceName,
  containerName: cu.containerName,
  image: resolvedImage,
  auth: cu.auth,
  registry,
  registryMode: cu.registryMode || "auto",
  rollout: cu.rollout,
  requestId: cu.requestId,
};
if (cu.deployMovingTag != null && String(cu.deployMovingTag).trim()) {
  body.deployMovingTag = String(cu.deployMovingTag).trim();
}

const manager = new DeploymentManager({
  iamBaseURL: IAM_SERVICE_URL,
  containerMgmtBaseURL: SERVICE_CONTAINER_MGMT_URL,
});

console.log("[container-update] image:", body.image || "(resolve via registry.repository → :latest)");
console.log("[container-update] container:", body.containerName);

try {
  const dep = await manager.start(body);
  const id = dep.deploymentId;
  console.log("[container-update] deploymentId:", id);

  for (;;) {
    const d = manager.get(id);
    if (d.status === "succeeded") {
      console.log(JSON.stringify({ success: true, data: d }, null, 2));
      process.exit(0);
    }
    if (d.status === "failed") {
      console.error(d.message || "deployment failed");
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
}
