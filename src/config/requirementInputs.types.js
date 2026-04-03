/**
 * @typedef {object} BuildAndPushInputs
 * @property {string} gitUrl
 * @property {string} [gitRef]
 * @property {number} [gitDepth]
 * @property {string} [towerRegistryName]
 * @property {string} [registryHost]
 * @property {string} repository
 * @property {string} [tag]
 * @property {string} registryUsername
 * @property {string} registryPassword
 * @property {string} [dockerfile]
 * @property {string} [contextSubdir]
 * @property {string} [localImageName]
 * @property {string} [platform]
 * @property {boolean} [alsoPushMovingTag]
 * @property {string} [movingTag]
 */

/**
 * @typedef {object} ContainerUpdateInputs
 * @property {string} orgId
 * @property {string} serviceName
 * @property {string} containerName
 * @property {string} [image] — `@last:digest` | `@last:latest` | `@last:build` (after run:build-push), or omit/`""` + registry.repository for `host/repo:latest`, or full ref
 * @property {string} [deployMovingTag] — when image omitted; default `latest`
 * @property {{ username: string, password: string }} auth
 * @property {import('../deployment/types.js').DeployRegistryInput} [registry]
 * @property {string} [registryMode]
 * @property {import('../deployment/types.js').RolloutInput} [rollout]
 * @property {string} [requestId]
 * @property {string} [registrySecretLabel] — optional label for registry pull secret reuse
 */

/**
 * @typedef {object} RequirementInputs
 * @property {BuildAndPushInputs} buildAndPush
 * @property {ContainerUpdateInputs} containerUpdate
 */

export {};
