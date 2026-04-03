import { readLastBuildImage } from "./lastBuildImage.js";

function str(last, key) {
  const v = last && typeof last[key] === "string" ? last[key].trim() : "";
  return v || "";
}

/**
 * Resolve `containerUpdate.image` for CLI / requirement_inputs.
 *
 * - `DEPLOY_IMAGE` env wins (CI or manual override).
 * - `@last:digest` → last successful build-push `digestRef` (immutable); if missing, falls back to
 *   `imageLatest` → primary `image` → empty (then `registry.repository` + host → `:deployMovingTag`).
 * - `@last:latest` → `imageLatest`; fallback chain then empty.
 * - `@last:build` → primary `image`; fallback chain then empty.
 * - Empty string → leave empty so DeploymentManager uses `registry.repository` + host + `deployMovingTag`.
 *
 * @param {{ image?: string, deployMovingTag?: string }} cu
 * @returns {string}
 */
export function resolveContainerUpdateImage(cu) {
  const envImg = process.env.DEPLOY_IMAGE?.trim();
  if (envImg) return envImg;

  const raw = String(cu.image ?? "").trim();

  if (raw === "@last:digest" || raw === "@last:sha") {
    const last = readLastBuildImage();
    const d = str(last, "digestRef");
    if (d) return d;
    const latest = str(last, "imageLatest");
    if (latest) {
      console.warn(
        "[container-update] @last:digest: no digestRef in .last-build-image.json — using imageLatest. Run `npm run run:build-push` to record a digest."
      );
      return latest;
    }
    const primary = str(last, "image");
    if (primary) {
      console.warn(
        "[container-update] @last:digest: no digestRef — using primary tag from last file. Run `npm run run:build-push` to refresh."
      );
      return primary;
    }
    console.warn(
      "[container-update] @last:digest: no .last-build-image.json — deploying via registry.repository + deployMovingTag (e.g. :latest). Run `npm run run:build-push` first to pin by digest."
    );
    return "";
  }

  if (raw === "@last:latest" || raw === "@last:moving") {
    const last = readLastBuildImage();
    let v = str(last, "imageLatest");
    if (!v) v = str(last, "image");
    if (!v) v = str(last, "digestRef");
    if (v) return v;
    console.warn(
      "[container-update] @last:latest: no .last-build-image.json — using registry.repository + deployMovingTag. Run `npm run run:build-push` after a push."
    );
    return "";
  }

  if (raw === "@last:build" || raw === "@last:tag") {
    const last = readLastBuildImage();
    let v = str(last, "image");
    if (!v) v = str(last, "imageLatest");
    if (!v) v = str(last, "digestRef");
    if (v) return v;
    console.warn(
      "[container-update] @last:build: no .last-build-image.json — using registry.repository + deployMovingTag."
    );
    return "";
  }

  return raw;
}
