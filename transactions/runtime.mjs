/**
 * Browser Transaction Runtime — ponto único de execução.
 *
 * Agent API:
 *   runStageTransaction(stageId, payload)
 *
 * Internamente: carrega Stage Definition → Write Engine → resultado.
 * Sem conhecimento de VTEX. Agent não conhece Write Engine.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defaultRun } from "./openclaw-runner.mjs";
import {
  writeWithBackend,
  PRODUCTION_WRITE_BACKEND,
  listWriteBackends,
} from "./write-engine/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STAGES_DIR = path.join(__dirname, "stages");

export { buildInPageEngineSource } from "./runtime-engine.mjs";
export { listWriteBackends, PRODUCTION_WRITE_BACKEND };

export function loadStageDefinition(stageId) {
  const file = path.join(STAGES_DIR, `${stageId}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Stage not found: ${stageId} (${file})`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function resolveBackendId(definition) {
  return (
    (definition.execution && definition.execution.writeBackend) ||
    PRODUCTION_WRITE_BACKEND
  );
}

/**
 * @param {string} stageId
 * @param {Record<string, unknown>} payload field values for the stage
 * @returns {Promise<{
 *   success: boolean,
 *   confidence: number,
 *   errors: object[],
 *   valuesFound: object|null,
 *   nextActionSuggested: string|null,
 *   stageId: string,
 *   browserCalls: number,
 *   elapsedMs: number,
 *   diagnostics?: object
 * }>}
 */
export async function runStageTransaction(stageId, payload) {
  if (typeof stageId !== "string" || !stageId) {
    throw new Error("runStageTransaction(stageId, payload): stageId required");
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("runStageTransaction(stageId, payload): payload required");
  }

  const definition = loadStageDefinition(stageId);
  const backendId = resolveBackendId(definition);
  const run = defaultRun;

  const started = Date.now();
  const result = await writeWithBackend(backendId, {
    definition,
    payload,
    run,
  });

  return {
    success: !!result.success,
    confidence: result.confidence ?? 0,
    errors: result.errors || [],
    valuesFound: result.valuesFound ?? null,
    nextActionSuggested: result.nextActionSuggested ?? null,
    stageId: definition.id || stageId,
    version: definition.version,
    browserCalls: result.browserCalls ?? 0,
    elapsedMs: result.elapsedMs ?? Date.now() - started,
    diagnostics: result.diagnostics,
  };
}
