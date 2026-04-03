/**
 * @typedef {object} DeployAuthInput
 * @property {string} username
 * @property {string} password
 */

/**
 * @typedef {object} DeployRegistryInput
 * @property {string} [towerRegistryName]
 * @property {string} [registryHost]
 * @property {string} [repository] — image path without host (e.g. my-org/my-app); used with host to build `image` when omitted or for :latest
 * @property {string} [username]
 * @property {string} [password]
 * @property {string} [movingTag] — default "latest"; moving tag pushed alongside immutable build-* tags
 */

/**
 * @typedef {object} RolloutInput
 * @property {number} [timeoutSeconds]
 */

/**
 * @typedef {object} BuildInput
 * @property {boolean} enabled
 * @property {string} [contextDir]
 * @property {string} [dockerfile]
 * @property {string} [localImageName]
 * @property {string} [registryHost]
 * @property {string} [repository]
 * @property {string} [tag]
 * @property {string} [registryUsername]
 * @property {string} [registryPassword]
 * @property {boolean} [alsoPushMovingTag] — default true; also `docker push` movingTag (latest)
 * @property {string} [movingTag] — default "latest"
 * @property {boolean} [deployWithDigest] — default true; after build, set deployment image to immutable digest (`host/repo@sha256:...`) so pulls do not depend on a tag
 * @property {boolean} [deployWithMovingTag] — used when deployWithDigest is false or digest unavailable; default true; use movingTag ref instead of primary build tag
 */

/**
 * @typedef {object} ExecuteDeploymentRequest
 * @property {string} orgId — sent to IAM login body as `organizationId`
 * @property {string} [environment]
 * @property {string} serviceName
 * @property {string} containerName
 * @property {string} [image]
 * @property {string} [requestId]
 * @property {DeployAuthInput} auth
 * @property {string} [registryMode]
 * @property {DeployRegistryInput} [registry]
 * @property {RolloutInput} [rollout]
 * @property {BuildInput} [build]
 * @property {string} [deployMovingTag] — when resolving image from registry only; default "latest"
 */

export {};
