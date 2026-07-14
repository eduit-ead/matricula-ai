/**
 * Cascade write path for accessibilityFill — dependent selects/fills/clicks.
 * Driven by Stage Definition `execution.mode: "cascade"` + `steps[]`.
 * Generic form concepts only (combobox/textbox/button); no VTEX hardcoding beyond labels in the Stage JSON.
 */
import {
  normalizeHostValue,
  parseJsonFromCli,
  findSnapshotRef,
  findOptionLabel,
} from "../utils.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rolePrefix(role) {
  if (role === "combobox") return "combobox ";
  if (role === "textbox") return "textbox ";
  if (role === "button") return "button ";
  if (role === "checkbox") return "checkbox ";
  return "";
}

function buildLocatePredicates(locate) {
  const role = locate?.role || "combobox";
  const prefix = rolePrefix(role);
  const preds = [];
  for (const inc of locate?.includesAny || []) {
    const re = new RegExp(
      String(inc).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );
    preds.push((l) => l.includes(prefix.trim()) && re.test(l));
    // fallback: role word anywhere
    preds.push((l) => re.test(l) && new RegExp(role, "i").test(l));
  }
  return preds;
}

async function takeSnap(run, browserCalls) {
  browserCalls.n += 1;
  const snap = await run([
    "browser",
    "snapshot",
    "--efficient",
    "--limit",
    "80",
  ]);
  return snap.out || "";
}

async function waitForRef(run, browserCalls, locate, {
  maxAttempts = 6,
  gapMs = 800,
} = {}) {
  const preds = buildLocatePredicates(locate);
  let text = "";
  for (let i = 0; i < maxAttempts; i++) {
    text = await takeSnap(run, browserCalls);
    const hit = findSnapshotRef(text, preds);
    if (hit) return { hit, text };
    await sleep(gapMs);
  }
  return { hit: null, text };
}

/**
 * @param {{ definition: object, payload: Record<string, unknown>, run: Function }} ctx
 */
export async function accessibilityCascadeWrite(ctx) {
  const { definition, payload, run } = ctx;
  const browserCalls = { n: 0 };
  const started = Date.now();
  const errors = [];
  const valuesFound = {};
  const stepsLog = [];

  const steps = definition.steps || [];
  if (!steps.length) {
    return {
      success: false,
      confidence: 0,
      errors: [
        {
          code: "INVALID_STAGE",
          message: "cascade mode requires definition.steps[]",
        },
      ],
      valuesFound: null,
      nextActionSuggested: "retry_stage_or_ask_human",
      browserCalls: 0,
      elapsedMs: Date.now() - started,
      diagnostics: { mode: "cascade" },
    };
  }

  for (const step of steps) {
    const key = step.key;
    const payloadKey = step.payloadKey || key;

    if (step.kind === "fill") {
      const raw = payload[payloadKey];
      if (raw == null || raw === "") {
        if (step.required !== false) {
          errors.push({
            code: "INVALID_INPUT",
            field: key,
            message: "missing payload value",
          });
        }
        stepsLog.push({ key, kind: "fill", ok: false, reason: "missing" });
        continue;
      }
      const value = normalizeHostValue(raw, step.normalize || []);
      const { hit } = await waitForRef(run, browserCalls, step.locate);
      if (!hit) {
        errors.push({
          code: "NOT_FOUND",
          field: key,
          message: "textbox not located",
        });
        stepsLog.push({ key, kind: "fill", ok: false, reason: "not_found" });
        continue;
      }
      browserCalls.n += 1;
      await run([
        "browser",
        "fill",
        "--fields",
        JSON.stringify([{ ref: hit.ref, value }]),
      ]);
      valuesFound[key] = value;
      stepsLog.push({ key, kind: "fill", ok: true, ref: hit.ref, value });
      if (step.waitAfterMs) await sleep(step.waitAfterMs);
      continue;
    }

    if (step.kind === "click") {
      const { hit } = await waitForRef(run, browserCalls, step.locate, {
        maxAttempts: step.optional ? 3 : 6,
        gapMs: 600,
      });
      if (!hit) {
        if (!step.optional) {
          errors.push({
            code: "NOT_FOUND",
            field: key,
            message: "button not located",
          });
        }
        stepsLog.push({
          key,
          kind: "click",
          ok: false,
          optional: !!step.optional,
        });
        continue;
      }
      browserCalls.n += 1;
      await run(["browser", "click", hit.ref]);
      valuesFound[key] = true;
      stepsLog.push({ key, kind: "click", ok: true, ref: hit.ref });
      if (step.waitAfterMs) await sleep(step.waitAfterMs);
      continue;
    }

    if (step.kind === "select") {
      let desired =
        payload[payloadKey] != null && payload[payloadKey] !== ""
          ? String(payload[payloadKey])
          : step.default != null
            ? String(step.default)
            : "";
      if (!desired) {
        errors.push({
          code: "INVALID_INPUT",
          field: key,
          message: "missing payload value",
        });
        stepsLog.push({ key, kind: "select", ok: false, reason: "missing" });
        continue;
      }

      const { hit, text } = await waitForRef(run, browserCalls, step.locate);
      if (!hit) {
        errors.push({
          code: "NOT_FOUND",
          field: key,
          message: "combobox not located",
        });
        stepsLog.push({ key, kind: "select", ok: false, reason: "not_found" });
        continue;
      }

      let optionLabel = desired;
      if (step.match === "optionContains") {
        const found = findOptionLabel(text, desired);
        if (!found) {
          // refresh once more — options may load late
          await sleep(1000);
          const again = await waitForRef(run, browserCalls, step.locate, {
            maxAttempts: 4,
            gapMs: 700,
          });
          const found2 = findOptionLabel(again.text, desired);
          if (!found2) {
            errors.push({
              code: "OPTION_NOT_FOUND",
              field: key,
              message: `no option containing: ${desired}`,
            });
            stepsLog.push({
              key,
              kind: "select",
              ok: false,
              reason: "option_not_found",
              needle: desired,
            });
            continue;
          }
          optionLabel = found2;
          browserCalls.n += 1;
          await run(["browser", "select", again.hit.ref, optionLabel]);
          valuesFound[key] = optionLabel;
          stepsLog.push({
            key,
            kind: "select",
            ok: true,
            ref: again.hit.ref,
            value: optionLabel,
          });
          if (step.waitAfterMs) await sleep(step.waitAfterMs);
          continue;
        }
        optionLabel = found;
      }

      browserCalls.n += 1;
      await run(["browser", "select", hit.ref, optionLabel]);
      valuesFound[key] = optionLabel;
      stepsLog.push({
        key,
        kind: "select",
        ok: true,
        ref: hit.ref,
        value: optionLabel,
      });
      if (step.waitAfterMs) await sleep(step.waitAfterMs);
      continue;
    }

    errors.push({
      code: "INVALID_STAGE",
      field: key,
      message: `unknown step kind: ${step.kind}`,
    });
  }

  // Validate required keys present in valuesFound
  const required = definition.success?.requiredKeys || [];
  for (const rk of required) {
    if (valuesFound[rk] == null || valuesFound[rk] === "") {
      if (!errors.some((e) => e.field === rk)) {
        errors.push({
          code: "NOT_ACCEPTED",
          field: rk,
          message: "required value missing after cascade",
        });
      }
    }
  }

  // Light DOM check: Continuar inscrição should be available (agent will click)
  browserCalls.n += 1;
  const vr = await run([
    "browser",
    "evaluate",
    "--fn",
    `() => {
      const body = document.body.innerText || '';
      const cont = [...document.querySelectorAll('button')].some(b =>
        b.offsetParent && /Continuar inscrição/i.test((b.textContent||'').trim())
      );
      const ingresso = /forma de ingresso|Vestibular/i.test(body);
      return { contVisible: cont, ingressoHint: ingresso, href: location.href };
    }`,
  ]);
  const check = parseJsonFromCli((vr.out || "") + "\n" + (vr.err || ""));

  const success = errors.length === 0;
  const elapsedMs = Date.now() - started;

  return {
    success,
    confidence: success ? 1 : 0.4,
    errors,
    valuesFound,
    nextActionSuggested: success
      ? definition.onSuccessSuggest || "select_necessidade_then_continuar"
      : "retry_stage_or_ask_human",
    browserCalls: browserCalls.n,
    elapsedMs,
    diagnostics: {
      mode: "cascade",
      stepsLog,
      postCheck: check,
    },
  };
}
