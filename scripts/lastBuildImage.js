import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Written by `run-build-push.mjs` after a successful push. */
export const LAST_BUILD_IMAGE_FILE = join(__dirname, "..", ".last-build-image.json");

/**
 * @returns {Record<string, unknown> | null}
 */
export function readLastBuildImage() {
  if (!fs.existsSync(LAST_BUILD_IMAGE_FILE)) return null;
  try {
    const t = fs.readFileSync(LAST_BUILD_IMAGE_FILE, "utf8");
    const o = JSON.parse(t);
    return typeof o === "object" && o !== null ? o : null;
  } catch {
    return null;
  }
}
