"use strict";

const core = require("@actions/core");

/**
 * POST /public?action=login — IAM authentication via API gateway.
 * @param {string} towerApiURL
 * @param {string} username
 * @param {string} password
 * @param {string} orgId
 * @returns {Promise<string>} access token
 */
async function iamLogin(towerApiURL, username, password, orgId) {
  const url = `${towerApiURL.replace(/\/+$/, "")}/public?action=login`;
  core.info("Authenticating with Tower Cloud...");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, organizationId: orgId }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`IAM returned non-JSON (HTTP ${res.status}): ${text.slice(0, 500)}`);
  }

  if (res.status >= 400) {
    throw new Error(`IAM login failed (HTTP ${res.status}): ${data.message || text.slice(0, 500)}`);
  }

  // Extract token from various response shapes
  const token = data.access_token; 

  if (!token) {
    throw new Error("Missing access token in IAM response");
  }

  core.info("Successfully authenticated");
  return token;
}

/**
 * GET /service/container-instance/:name — check container exists via API gateway.
 * @param {string} towerApiURL
 * @param {string} containerName
 * @param {string} token
 * @param {string} orgId
 */
async function getContainer(towerApiURL, containerName, token, orgId) {
  const url = `${towerApiURL.replace(/\/+$/, "")}/service/container-instance/${encodeURIComponent(containerName)}`;
  core.info(`Checking container instance '${containerName}'...`);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-organization-id": orgId,
    },
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { _raw: text };
  }

  return { status: res.status, data, text };
}

/**
 * PUT /service/container-instance/:name — update container image via API gateway.
 * @param {string} towerApiURL
 * @param {string} containerName
 * @param {string} token
 * @param {string} orgId
 * @param {object} containerSpec
 */
async function updateContainer(towerApiURL, containerName, token, orgId, containerSpec) {
  const url = `${towerApiURL.replace(/\/+$/, "")}/service/container-instance/${encodeURIComponent(containerName)}`;
  core.info(`Updating container '${containerName}' with new image...`);

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-organization-id": orgId,
    },
    body: JSON.stringify({ containerSpec }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { _raw: text };
  }

  if (res.status >= 400) {
    throw new Error(`Container update failed (HTTP ${res.status}): ${text.slice(0, 500)}`);
  }

  core.info("Container update accepted");
  return { status: res.status, data };
}

module.exports = { iamLogin, getContainer, updateContainer };
