import dotenv from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

/**
 * Standalone deploy workflow HTTP API (Express).
 * Routes:
 * - POST /api/build-and-push — git clone, docker build/tag/login/push. Body: flat fields or { buildAndPush } (see requirement_inputs.example.js).
 * - POST /api/container/update-image — IAM login via API gateway + container update via API gateway. Body: flat fields or { containerUpdate }.
 * - POST /api/deployments/execute — full flow (optional build) + rollout via API gateway. Container must already exist (404 = error).
 * - GET /api/deployments/:deploymentId
 */
import express from "express";
import { DeploymentManager } from "./deployment/manager.js";
import { gitCloneAndBuildPush } from "./docker/gitBuildPush.js";
import { resolveTowerRegistryHost } from "./config/resolveRegistryHost.js";
import { pickBuildAndPushBody, pickContainerUpdateBody } from "./http/pickBodies.js";

const PORT = Number(process.env.PORT || 3000);
const TOWER_API_URL = process.env.TOWER_API_URL || "";

const manager = new DeploymentManager({
  towerApiURL: TOWER_API_URL,
});

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/api/health/live", (_req, res) => {
  res.json({ status: "ok" });
});

/**
 * Body: gitUrl, repository, registryUsername, registryPassword, towerRegistryName or registryHost,
 * optional: gitRef, tag (default build-<unix>), gitDepth, dockerfile, contextSubdir, localImageName, platform,
 * alsoPushMovingTag, movingTag. Response data includes digestRef (immutable pull ref) when Docker reports digest.
 * Or wrap the same object under `buildAndPush`.
 */
app.post("/api/build-and-push", async (req, res) => {
  try {
    const raw = pickBuildAndPushBody(req.body);
    const registryHost = resolveTowerRegistryHost({
      registryHost: raw.registryHost,
      towerRegistryName: raw.towerRegistryName,
    });
    const result = await gitCloneAndBuildPush({ ...raw, registryHost });
    res.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({
      success: false,
      error: "build_push_failed",
      message,
    });
  }
});

/**
 * Body: same as POST /api/deployments/execute but without build — requires orgId, serviceName,
 * containerName, auth; `image` or registry.repository+host. (CLI `npm run run:container-update` supports
 * `@last:digest` via `.last-build-image.json`; over HTTP pass the full digest ref or tag.)
 */
app.post("/api/container/update-image", async (req, res) => {
  try {
    const picked = pickContainerUpdateBody(req.body);
    const body = picked && typeof picked === "object" ? { ...picked } : {};
    const reg = body.registry && typeof body.registry === "object" ? { ...body.registry } : {};
    if (!reg.registryHost?.trim() && reg.towerRegistryName?.trim()) {
      reg.registryHost = resolveTowerRegistryHost({ towerRegistryName: reg.towerRegistryName });
    }
    if (Object.keys(reg).length) body.registry = reg;

    if (body.build?.enabled) {
      res.status(400).json({
        success: false,
        error: "invalid_request",
        message: "use POST /api/deployments/execute or /api/build-and-push when build is required",
      });
      return;
    }
    const deployment = await manager.start(body);
    res.status(202).json({
      success: true,
      data: {
        deploymentId: deployment.deploymentId,
        status: deployment.status,
        resolvedRegistryType: deployment.resolvedRegistryType,
        image: deployment.image,
        tracking: {
          statusUrl: `/api/deployments/${deployment.deploymentId}`,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({
      success: false,
      error: "invalid_request",
      message,
    });
  }
});

app.post("/api/deployments/execute", async (req, res) => {
  try {
    const deployment = await manager.start(req.body);
    res.status(202).json({
      success: true,
      data: {
        deploymentId: deployment.deploymentId,
        status: deployment.status,
        resolvedRegistryType: deployment.resolvedRegistryType,
        tracking: {
          statusUrl: `/api/deployments/${deployment.deploymentId}`,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({
      success: false,
      error: "invalid_request",
      message,
    });
  }
});

app.get("/api/deployments/:deploymentId", (req, res) => {
  try {
    const deployment = manager.get(req.params.deploymentId);
    res.json({ success: true, data: deployment });
  } catch {
    res.status(404).json({
      success: false,
      error: "deployment_not_found",
      message: "deployment not found",
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: "route_not_found",
    message: "no route registered",
  });
});

app.listen(PORT, () => {
  console.log(`deploy-workflow-service listening on :${PORT}`);
  if (!TOWER_API_URL) console.warn("WARN: TOWER_API_URL is not set");
});
