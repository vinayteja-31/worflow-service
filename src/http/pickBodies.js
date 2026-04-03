/**
 * @param {Record<string, unknown>} [body]
 */
export function pickBuildAndPushBody(body) {
  if (!body || typeof body !== "object") return {};
  const nested = body.buildAndPush;
  if (nested && typeof nested === "object") return { ...nested };
  return { ...body };
}

/**
 * @param {Record<string, unknown>} [body]
 */
export function pickContainerUpdateBody(body) {
  if (!body || typeof body !== "object") return {};
  const nested = body.containerUpdate;
  if (nested && typeof nested === "object") return { ...nested };
  return { ...body };
}
