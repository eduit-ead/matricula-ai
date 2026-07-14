/**
 * Experimental write backend: single page evaluate (native/React synth).
 * Not production default — often rejected by controlled React submit.
 */
import { parseJsonFromCli } from "../utils.mjs";
import { buildInPageEngineSource } from "../../runtime-engine.mjs";

/**
 * @param {{ definition: object, payload: Record<string, unknown>, run: Function }} ctx
 */
export async function nativeReactWrite(ctx) {
  const { definition, payload, run } = ctx;
  const started = Date.now();
  const fn = buildInPageEngineSource(definition, payload);
  const r = await run(["browser", "evaluate", "--fn", fn]);
  const elapsedMs = Date.now() - started;
  const result = parseJsonFromCli((r.out || "") + "\n" + (r.err || ""));
  if (!result) {
    return {
      success: false,
      confidence: 0,
      errors: [
        {
          code: "NO_JSON",
          message: "evaluate returned no JSON",
          raw: ((r.out || r.err || "") + "").slice(0, 400),
        },
      ],
      valuesFound: null,
      nextActionSuggested: "retry_stage_or_ask_human",
      browserCalls: 1,
      elapsedMs,
      diagnostics: {},
    };
  }
  return {
    ...result,
    browserCalls: 1,
    elapsedMs,
  };
}
