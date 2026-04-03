#!/usr/bin/env node
/**
 * Reads `requirement_inputs.js` (or example), runs git clone → docker build → tag → login → push.
 * Writes `.last-build-image.json` (digest + tags) for `run:container-update` `@last:*` image sentinels.
 * Loads `workflow-service/.env` when present.
 */
import dotenv from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

import { gitCloneAndBuildPush } from "../src/docker/gitBuildPush.js";
import { resolveTowerRegistryHost } from "../src/config/resolveRegistryHost.js";
import { writeFile } from "node:fs/promises";

import { loadRequirementInputs } from "./load-requirement-inputs.mjs";
import { LAST_BUILD_IMAGE_FILE } from "./lastBuildImage.js";

const mod = await loadRequirementInputs();
const raw = mod.default?.buildAndPush;
if (!raw || typeof raw !== "object") {
  console.error("requirement_inputs: missing buildAndPush section");
  process.exit(1);
}

const registryHost = resolveTowerRegistryHost({
  registryHost: raw.registryHost,
  towerRegistryName: raw.towerRegistryName,
});

const payload = {
  gitUrl: raw.gitUrl,
  gitRef: raw.gitRef,
  gitDepth: raw.gitDepth,
  registryHost,
  repository: raw.repository,
  tag: raw.tag,
  registryUsername: raw.registryUsername,
  registryPassword: raw.registryPassword,
  dockerfile: raw.dockerfile,
  contextSubdir: raw.contextSubdir,
  localImageName: raw.localImageName,
  platform: raw.platform,
  alsoPushMovingTag: raw.alsoPushMovingTag !== false,
  movingTag: raw.movingTag || "latest",
};

console.log("[build-push] registryHost:", registryHost);
console.log("[build-push] repository:", raw.repository);
console.log("[build-push] gitUrl:", raw.gitUrl);

try {
  const result = await gitCloneAndBuildPush(payload);
  await writeFile(
    LAST_BUILD_IMAGE_FILE,
    JSON.stringify({ ...result, savedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
  console.log("[build-push] wrote", LAST_BUILD_IMAGE_FILE);
  console.log(JSON.stringify({ success: true, data: result }, null, 2));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
}
