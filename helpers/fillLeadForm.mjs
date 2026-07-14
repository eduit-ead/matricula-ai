/**
 * fillLeadForm — adapter temporário de migração.
 * Sem lógica própria: apenas encaminha para o Runtime (stage lead-pdp).
 * Preferir: import { runStageTransaction } from "../transactions/runtime.mjs"
 */
import { runStageTransaction } from "../transactions/runtime.mjs";

export function titleCaseName(s) {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * @deprecated Use runStageTransaction("lead-pdp", payload)
 */
export async function fillLeadForm(payload) {
  const result = await runStageTransaction("lead-pdp", {
    nome: payload.nome,
    email: payload.email,
    telefone: payload.telefone,
  });
  return {
    ok: !!result.success,
    success: !!result.success,
    confidence: result.confidence,
    errors: result.errors || [],
    values: result.valuesFound,
    valuesFound: result.valuesFound,
    nextActionSuggested: result.nextActionSuggested,
    elapsedMs: result.elapsedMs,
    browserCalls: result.browserCalls,
    stage: result.success ? "done" : "transaction",
    path: "runtime-adapter",
    stageId: result.stageId,
    diagnostics: result.diagnostics,
  };
}
