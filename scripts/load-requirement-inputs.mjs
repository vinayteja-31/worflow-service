import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @returns {Promise<{ default: import('../src/config/requirementInputs.types.js').RequirementInputs }>}
 */
export async function loadRequirementInputs() {
  const userPath = path.join(root, "requirement_inputs.js");
  const examplePath = path.join(root, "requirement_inputs.example.js");
  let filePath = userPath;
  if (!fs.existsSync(userPath)) {
    if (!fs.existsSync(examplePath)) {
      throw new Error(
        "Missing requirement_inputs.js — copy requirement_inputs.example.js to requirement_inputs.js and fill values."
      );
    }
    console.warn(
      "[config] requirement_inputs.js not found — using requirement_inputs.example.js (copy and edit for real runs)."
    );
    filePath = examplePath;
  }
  return import(pathToFileURL(filePath).href);
}

export function projectRoot() {
  return root;
}
