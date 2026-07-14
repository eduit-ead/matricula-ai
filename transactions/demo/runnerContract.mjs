/**
 * Contrato único dos Runners/Gates (Sprint Estabilização — item 1).
 *
 * Camada fina: NÃO altera lógica. Normaliza o retorno para:
 *   { success, code, ms, browserCalls, output }
 *
 * Mantém shims (`ok`, `elapsedMs`, campos originais) para zero regressão
 * nos callers existentes do harness.
 */

/** @typedef {{ success: boolean, code: string, ms: number, browserCalls: number, output: object }} RunnerContract */

/**
 * Adapta resultado no formato histórico `{ ok, code, elapsedMs, ... }`.
 * @param {object|null|undefined} raw
 * @param {number} [browserCalls=0]
 * @returns {RunnerContract & object}
 */
export function adaptOkResult(raw, browserCalls = 0) {
  const r = raw && typeof raw === "object" ? raw : {};
  const success = !!r.ok;
  const ms = Number(r.elapsedMs) || 0;
  const code = r.code || (success ? "OK" : "FAIL");
  return {
    ...r,
    success,
    code,
    ms,
    browserCalls: Number(browserCalls) || 0,
    output: r,
    // shims
    ok: success,
    elapsedMs: ms,
  };
}

/**
 * Adapta resultado de Stage (`runStageTransaction`) — já usa `success`.
 * @param {object|null|undefined} raw
 * @param {number} [browserCalls]
 * @returns {RunnerContract & object}
 */
export function adaptStageResult(raw, browserCalls) {
  const r = raw && typeof raw === "object" ? raw : {};
  const success = !!r.success;
  const ms = Number(r.elapsedMs) || 0;
  const calls =
    browserCalls != null ? Number(browserCalls) : Number(r.browserCalls) || 0;
  return {
    ...r,
    success,
    code: success ? r.code || "OK" : r.code || "STAGE_FAIL",
    ms,
    browserCalls: calls,
    output: r,
    elapsedMs: ms,
  };
}

/**
 * Executa uma função que devolve `{ ok, ... }` e adapta ao contrato.
 * Throws → `{ success:false, code:'UNHANDLED' }` (sem propagar).
 *
 * @param {() => number} getBrowserCalls
 * @param {() => Promise<object>} fn
 * @returns {Promise<RunnerContract & object>}
 */
export async function runOkAsContract(getBrowserCalls, fn) {
  const t0 = Date.now();
  const before =
    typeof getBrowserCalls === "function" ? Number(getBrowserCalls()) || 0 : 0;
  try {
    const raw = await fn();
    const after =
      typeof getBrowserCalls === "function" ? Number(getBrowserCalls()) || 0 : before;
    return adaptOkResult(raw, Math.max(0, after - before));
  } catch (e) {
    const after =
      typeof getBrowserCalls === "function" ? Number(getBrowserCalls()) || 0 : before;
    const detail = String(e?.message || e);
    return {
      success: false,
      ok: false,
      code: "UNHANDLED",
      ms: Date.now() - t0,
      browserCalls: Math.max(0, after - before),
      output: { error: detail },
      detail,
      elapsedMs: Date.now() - t0,
    };
  }
}

/**
 * Executa Stage e adapta ao contrato.
 * @param {() => number} getBrowserCalls
 * @param {() => Promise<object>} fn
 * @returns {Promise<RunnerContract & object>}
 */
export async function runStageAsContract(getBrowserCalls, fn) {
  const t0 = Date.now();
  const before =
    typeof getBrowserCalls === "function" ? Number(getBrowserCalls()) || 0 : 0;
  try {
    const raw = await fn();
    // Stages já reportam browserCalls internos; preferir o valor do Stage
    const adapted = adaptStageResult(raw);
    // se o harness também incrementou, não sobrescrever com delta (evita double-count no relatório do Stage)
    return adapted;
  } catch (e) {
    const after =
      typeof getBrowserCalls === "function" ? Number(getBrowserCalls()) || 0 : before;
    const detail = String(e?.message || e);
    return {
      success: false,
      code: "UNHANDLED",
      ms: Date.now() - t0,
      browserCalls: Math.max(0, after - before),
      output: { error: detail },
      detail,
      elapsedMs: Date.now() - t0,
    };
  }
}
