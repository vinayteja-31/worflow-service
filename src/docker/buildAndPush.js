/**
 * docker build → tag → login → push (Tower / OCI).
 * Requires Docker CLI available to this process.
 *
 * Note: `docker build -f Dockerfile <context>` resolves a relative `-f` path from the
 * **current working directory**, not the context. Spawning from workflow-service would
 * pick workflow-service/Dockerfile instead of the clone. Always pass an absolute `-f`
 * under the context dir.
 */
import { spawn } from "node:child_process";
import { isAbsolute, resolve } from "node:path";

const defaultPlatform = "linux/amd64";

function fullRemoteImage({ host, repository, tag }) {
  const h = String(host || "").trim().replace(/\/+$/, "");
  const repo = String(repository || "").trim().replace(/^\/+|\/+$/g, "");
  const t = String(tag || "").trim();
  if (!h || !repo || !t) return "";
  return `${h}/${repo}:${t}`;
}

/** @param {string} output */
function parseDigestFromPushOutput(output) {
  const m = String(output || "").match(/digest:\s*(sha256:[a-f0-9]{64})/i);
  return m ? m[1] : null;
}

/**
 * @param {string} taggedRef e.g. registry/ns/repo:tag
 * @param {string} digestSha e.g. sha256:abc...
 */
function taggedRefToDigestRef(taggedRef, digestSha) {
  const firstSlash = taggedRef.indexOf("/");
  const lastColon = taggedRef.lastIndexOf(":");
  if (firstSlash < 0 || lastColon <= firstSlash) return null;
  return `${taggedRef.slice(0, lastColon)}@${digestSha}`;
}

/**
 * @param {string} taggedRef
 * @returns {Promise<string|null>}
 */
async function resolveDigestViaLocalRepoDigest(taggedRef) {
  try {
    const out = await runDocker([
      "inspect",
      "--format",
      "{{index .RepoDigests 0}}",
      taggedRef,
    ]);
    const d = out.trim();
    if (d && /@sha256:[a-f0-9]{64}$/i.test(d)) return d;
  } catch {
    /* local tag missing or engine quirk */
  }
  return null;
}

async function resolveDigestViaImagetools(taggedRef) {
  try {
    const out = await runDocker([
      "buildx",
      "imagetools",
      "inspect",
      taggedRef,
      "--format",
      "{{.Digest}}",
    ]);
    const d = out.trim();
    if (!/^sha256:[a-f0-9]{64}$/i.test(d)) return null;
    return taggedRefToDigestRef(taggedRef, d);
  } catch {
    return null;
  }
}

function runDocker(args, { stdin } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      stdio: stdin != null ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout?.on("data", (d) => {
      out += d.toString();
    });
    child.stderr?.on("data", (d) => {
      out += d.toString();
    });
    if (stdin != null && child.stdin) {
      child.stdin.write(typeof stdin === "string" ? stdin : Buffer.from(stdin));
      child.stdin.end();
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`docker ${args.join(" ")} failed (exit ${code})\n${out}`));
    });
  });
}

/**
 * @param {object} opts
 * @param {string} opts.contextDir
 * @param {string} [opts.dockerfile]
 * @param {string} [opts.platform]
 * @param {string} opts.localImage
 * @param {{ host: string, repository: string, tag: string }} opts.remoteImage
 * @param {string} [opts.registryHost]
 * @param {string} opts.username
 * @param {string} opts.password
 * @param {boolean} [opts.alsoPushMovingTag] default true — also tag+push `movingTag` (e.g. latest)
 * @param {string} [opts.movingTag] default "latest"
 * @returns {Promise<{ primaryRef: string, movingRef: string, digestRef: string | null }>}
 */
export async function buildAndPush(opts) {
  const {
    contextDir,
    dockerfile = "Dockerfile",
    platform = defaultPlatform,
    localImage,
    remoteImage,
    registryHost: regHostOpt,
    username,
    password,
    alsoPushMovingTag = true,
    movingTag: movingTagOpt = "latest",
  } = opts;

  if (!contextDir) throw new Error("contextDir is required");
  if (!localImage) throw new Error("localImage is required");

  const full = fullRemoteImage(remoteImage);
  if (!full) throw new Error("invalid remote image (host, repository, tag required)");

  const user = String(username || "").trim();
  const pass = String(password || "").trim();
  if (!user || !pass) {
    throw new Error(
      "registry username and password are required (build.registryUsername/Password or TOWER_REGISTRY_USERNAME / TOWER_REGISTRY_PASSWORD)"
    );
  }

  const registryHost = (regHostOpt || remoteImage.host || "").trim();
  if (!registryHost) throw new Error("registryHost is required");

  let localRef = localImage;
  if (!localRef.includes(":")) localRef = `${localRef}:latest`;

  const contextAbs = resolve(contextDir);
  const dockerfileAbs = isAbsolute(dockerfile) ? dockerfile : resolve(contextAbs, dockerfile);

  await runDocker(
    ["build", `--platform=${platform}`, "-t", localRef, "-f", dockerfileAbs, contextAbs],
    {}
  );

  await runDocker(["tag", localRef, full], {});

  await runDocker(["login", registryHost, "-u", user, "--password-stdin"], {
    stdin: pass,
  });

  const pushPrimaryOut = await runDocker(["push", full], {});

  let digestSha = parseDigestFromPushOutput(pushPrimaryOut);
  let digestRef = digestSha ? taggedRefToDigestRef(full, digestSha) : null;
  if (!digestRef) {
    digestRef = await resolveDigestViaLocalRepoDigest(full);
  }
  if (!digestRef) {
    digestRef = await resolveDigestViaImagetools(full);
  }

  const movingTag = String(movingTagOpt || "latest").trim() || "latest";
  let movingRef = full;
  if (alsoPushMovingTag && movingTag !== remoteImage.tag) {
    movingRef = fullRemoteImage({
      host: remoteImage.host,
      repository: remoteImage.repository,
      tag: movingTag,
    });
    if (!movingRef) throw new Error("invalid moving tag image ref");
    await runDocker(["tag", localRef, movingRef], {});
    await runDocker(["push", movingRef], {});
  }

  return { primaryRef: full, movingRef, digestRef };
}

export { fullRemoteImage };
