/**
 * git clone → docker build → tag → login → push.
 * Requires git and docker CLIs on PATH.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildAndPush, fullRemoteImage } from "./buildAndPush.js";

function runCmd(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout?.on("data", (d) => {
      out += d.toString();
    });
    child.stderr?.on("data", (d) => {
      out += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} ${args.join(" ")} failed (exit ${code})\n${out}`));
    });
  });
}

/**
 * @param {object} opts
 * @param {string} opts.gitUrl
 * @param {string} [opts.gitRef] branch/tag; omit for remote default branch
 * @param {number} [opts.gitDepth] default 1
 * @param {string} opts.registryHost e.g. test.hyd.cr.tower.cloud
 * @param {string} opts.repository e.g. my-org/my-app
 * @param {string} [opts.tag]
 * @param {string} opts.registryUsername
 * @param {string} opts.registryPassword
 * @param {string} [opts.dockerfile]
 * @param {string} [opts.contextSubdir] relative to repo root, default "."
 * @param {string} [opts.localImageName]
 * @param {string} [opts.platform]
 * @param {boolean} [opts.alsoPushMovingTag] default true — also push `:latest` (or movingTag)
 * @param {string} [opts.movingTag] default "latest"
 */
export async function gitCloneAndBuildPush(opts) {
  const {
    gitUrl,
    gitRef,
    gitDepth = 1,
    registryHost,
    repository,
    tag = `build-${Math.floor(Date.now() / 1000)}`,
    registryUsername,
    registryPassword,
    dockerfile = "Dockerfile",
    contextSubdir = ".",
    localImageName = "my-app",
    platform = "linux/amd64",
    alsoPushMovingTag = true,
    movingTag = "latest",
  } = opts;

  if (!gitUrl?.trim()) throw new Error("gitUrl is required");
  if (!registryHost?.trim()) throw new Error("registryHost is required");
  if (!repository?.trim()) throw new Error("repository is required");
  const user = String(registryUsername || "").trim();
  const pass = String(registryPassword || "").trim();
  if (!user || !pass) throw new Error("registryUsername and registryPassword are required");

  const repo = repository.replace(/^\/+|\/+$/g, "");
  const t = String(tag || "").trim();
  if (!t) throw new Error("tag is required");

  const workRoot = await mkdtemp(join(tmpdir(), "wf-git-"));
  const cloneDest = join(workRoot, "repo");

  try {
    const cloneArgs = ["clone", `--depth=${gitDepth}`];
    const ref = String(gitRef || "").trim();
    if (ref) {
      cloneArgs.push("--branch", ref);
    }
    cloneArgs.push(gitUrl.trim(), cloneDest);
    await runCmd("git", cloneArgs);

    const sub = contextSubdir.replace(/^\/+|\/+$/g, "") || ".";
    const contextDir = sub === "." ? cloneDest : join(cloneDest, sub);

    const { primaryRef, movingRef, digestRef } = await buildAndPush({
      contextDir,
      dockerfile,
      platform,
      localImage: localImageName,
      remoteImage: {
        host: registryHost.trim(),
        repository: repo,
        tag: t,
      },
      registryHost: registryHost.trim(),
      username: user,
      password: pass,
      alsoPushMovingTag,
      movingTag,
    });

    const mt = String(movingTag || "latest").trim() || "latest";

    return {
      image: primaryRef,
      imageLatest: movingRef,
      digestRef: digestRef || null,
      remoteImage: fullRemoteImage({
        host: registryHost.trim(),
        repository: repo,
        tag: t,
      }),
      repository: repo,
      tag: t,
      movingTag: mt,
    };
  } finally {
    await rm(workRoot, { recursive: true, force: true }).catch(() => {});
  }
}
