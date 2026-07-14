/**
 * Write Engine — pluggable write backends.
 * Production default: accessibilityFill
 * Target: low-RT trusted backend without changing Runtime / Stages / Agent
 */
import { accessibilityFillWrite } from "./backends/accessibilityFill.mjs";
import { nativeReactWrite } from "./backends/nativeReact.mjs";

/** @type {Record<string, (ctx: object) => Promise<object>>} */
const registry = Object.create(null);

export function registerWriteBackend(id, fn) {
  registry[id] = fn;
}

export function listWriteBackends() {
  return Object.keys(registry);
}

/** Production default — not the target architecture. */
export const PRODUCTION_WRITE_BACKEND = "accessibilityFill";

/**
 * @param {string} backendId
 * @param {{ definition: object, payload: object, run: Function }} ctx
 */
export async function writeWithBackend(backendId, ctx) {
  const id = backendId || PRODUCTION_WRITE_BACKEND;
  const fn = registry[id];
  if (!fn) {
    return {
      success: false,
      confidence: 0,
      errors: [
        {
          code: "UNKNOWN_WRITE_BACKEND",
          message: `Write backend not registered: ${id}`,
          available: listWriteBackends(),
        },
      ],
      valuesFound: null,
      nextActionSuggested: "retry_stage_or_ask_human",
      browserCalls: 0,
      elapsedMs: 0,
      diagnostics: { writeBackend: id },
    };
  }
  const result = await fn(ctx);
  return {
    ...result,
    diagnostics: {
      ...(result.diagnostics || {}),
      writeBackend: id,
    },
  };
}

registerWriteBackend("accessibilityFill", accessibilityFillWrite);
registerWriteBackend("nativeReact", nativeReactWrite);
registerWriteBackend("evaluate", nativeReactWrite);
