/**
 * Production write backend: accessibility snapshot + OpenClaw fill + validate evaluate.
 * Generic form concepts only — Stage Definition drives field keys / normalize / success suggest.
 * When execution.mode === "cascade" (or definition.steps[]), delegates to accessibilityCascadeWrite.
 */
import {
  normalizeHostValue,
  parseJsonFromCli,
  findSnapshotRef,
} from "../utils.mjs";
import { accessibilityCascadeWrite } from "./accessibilityCascade.mjs";

function buildFieldPredicates(field) {
  const preds = [];
  if (field.key === "nome") {
    preds.push((l) => /textbox \"Nome completo/i.test(l));
    preds.push((l) => /textbox \"Nome Completo\"/i.test(l));
  } else if (field.key === "email") {
    preds.push((l) => /textbox \"E-mail E-mail/i.test(l));
    preds.push(
      (l) => /textbox \"E-mail\"/.test(l) && !/example@mail/i.test(l)
    );
  } else if (field.key === "telefone") {
    preds.push((l) => /textbox \"Telefone\"/.test(l) && !/\[nth=/.test(l));
    preds.push((l) => /textbox \"Telefone\"/.test(l));
  } else {
    for (const st of (field.locate && field.locate.strategies) || []) {
      for (const inc of st.includesAny || []) {
        const re = new RegExp(
          String(inc).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i"
        );
        preds.push((l) => /textbox /.test(l) && re.test(l));
      }
    }
  }
  return preds;
}

function buildCheckboxPredicates(box) {
  const preds = [
    (l) => /checkbox.*[Pp]rivacidade/.test(l),
    (l) => /checkbox \"Estou de acordo/.test(l),
  ];
  for (const st of (box.locate && box.locate.strategies) || []) {
    for (const inc of st.includesAny || []) {
      const re = new RegExp(
        `checkbox.*${String(inc).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        "i"
      );
      preds.push((l) => re.test(l));
    }
  }
  return preds;
}

/**
 * @param {{ definition: object, payload: Record<string, unknown>, run: Function }} ctx
 */
export async function accessibilityFillWrite(ctx) {
  const { definition, payload, run } = ctx;
  const mode = definition.execution && definition.execution.mode;
  if (mode === "cascade" || (definition.steps && definition.steps.length)) {
    return accessibilityCascadeWrite(ctx);
  }

  let browserCalls = 0;
  const started = Date.now();
  const errors = [];
  const strategiesUsed = {};
  const valuesNorm = {};

  for (const field of definition.fields || []) {
    valuesNorm[field.key] = normalizeHostValue(
      payload[field.key],
      field.write && field.write.normalize
    );
  }

  browserCalls += 1;
  const snap = await run([
    "browser",
    "snapshot",
    "--efficient",
    "--limit",
    "60",
  ]);
  const text = snap.out || "";

  const fillFields = [];
  for (const field of definition.fields || []) {
    const hit = findSnapshotRef(text, buildFieldPredicates(field));
    strategiesUsed[field.key] = hit ? ["accessibilitySnapshot", field.key] : [];
    if (!hit) {
      errors.push({
        code: "NOT_FOUND",
        message: "Field not located in accessibility snapshot",
        field: field.key,
      });
      continue;
    }
    fillFields.push({ ref: hit.ref, value: valuesNorm[field.key] });
  }

  let checkHit = null;
  for (const box of definition.checkboxes || []) {
    checkHit = findSnapshotRef(text, buildCheckboxPredicates(box));
    strategiesUsed[box.key] = checkHit ? ["accessibilitySnapshot"] : [];
    if (!checkHit) {
      errors.push({
        code: "NOT_FOUND",
        message: "Checkbox not located in accessibility snapshot",
        field: box.key,
      });
    }
  }

  if (fillFields.length) {
    browserCalls += 1;
    await run(["browser", "fill", "--fields", JSON.stringify(fillFields)]);
    await new Promise((r) => setTimeout(r, 400));
  }
  if (checkHit && !/\[checked\]/.test(checkHit.line)) {
    browserCalls += 1;
    await run(["browser", "click", checkHit.ref]);
    await new Promise((r) => setTimeout(r, 200));
  }

  const suggestOk = definition.onSuccessSuggest || null;
  const fieldKeys = (definition.fields || []).map((f) => f.key);
  const boxKeys = (definition.checkboxes || []).map((b) => b.key);

  const validateFn = `() => {
    const DATA = ${JSON.stringify(valuesNorm)};
    const FIELD_KEYS = ${JSON.stringify(fieldKeys)};
    const BOX_KEYS = ${JSON.stringify(boxKeys)};
    const btn = [...document.querySelectorAll('button')].find(b =>
      b.offsetParent && /^\\s*Inscreva-se\\s*$/i.test((b.textContent||'').trim())
    ) || document.querySelector('button[class*="cta_p1"]');
    const dist = (el) => {
      if (!btn || !el) return 99999;
      const a = el.getBoundingClientRect();
      const b = btn.getBoundingClientRect();
      return Math.abs(a.top - b.top) + Math.abs(a.left - b.left) * 0.25;
    };
    const near = (name, preferType) => {
      let list = [...document.querySelectorAll('input[name="'+name+'"]')]
        .filter(i => i.offsetParent && i.type !== 'hidden');
      if (preferType) {
        const typed = list.filter(i => i.type === preferType);
        if (typed.length) list = typed;
      }
      const first = String(DATA.nome||'').split(/\\s+/)[0].toLowerCase();
      return list.sort((a,b) => {
        const score = (el) => {
          const v = (el.value||'');
          let s = 0;
          if (name === 'completeName' && v.toLowerCase().includes(first)) s += 100;
          if (name === 'email' && v.toLowerCase() === String(DATA.email||'').toLowerCase()) s += 100;
          if (name === 'cellphone' && v.replace(/\\D/g,'').endsWith(String(DATA.telefone||'').replace(/\\D/g,'').slice(-8))) s += 100;
          if (v) s += 10;
          return s - dist(el) / 10000;
        };
        return score(b) - score(a);
      })[0];
    };
    const nome = near('completeName');
    const email = near('email', 'email');
    const tel = near('cellphone', 'tel');
    const consent = [...document.querySelectorAll('input[type=checkbox]')]
      .filter(c => c.offsetParent)
      .sort((a,b) => dist(a) - dist(b))[0];
    if (consent && !consent.checked) consent.click();
    const valuesFound = {
      nome: nome && nome.value,
      email: email && email.value,
      telefone: tel && tel.value,
      aceite: !!(consent && consent.checked)
    };
    const errors = [];
    const first = String(DATA.nome||'').split(/\\s+/)[0].toLowerCase();
    if (FIELD_KEYS.includes('nome') && !(valuesFound.nome||'').toLowerCase().includes(first))
      errors.push({ code:'NOT_ACCEPTED', field:'nome', value: valuesFound.nome });
    if (FIELD_KEYS.includes('email') && (valuesFound.email||'').toLowerCase() !== String(DATA.email||'').toLowerCase())
      errors.push({ code:'NOT_ACCEPTED', field:'email', value: valuesFound.email });
    if (FIELD_KEYS.includes('telefone') && !(valuesFound.telefone||'').replace(/\\D/g,'').endsWith(String(DATA.telefone||'').replace(/\\D/g,'').slice(-8)))
      errors.push({ code:'NOT_ACCEPTED', field:'telefone', value: valuesFound.telefone });
    if (BOX_KEYS.includes('aceite') && !valuesFound.aceite)
      errors.push({ code:'NOT_ACCEPTED', field:'aceite' });
    const form = btn && btn.closest('form');
    const formText = (form && form.innerText) || '';
    if (/preencha o seu nome|informe um e-mail|necessário concordar/i.test(formText))
      errors.push({ code:'NOT_ACCEPTED', field:null, message:'form still shows validation errors', formText: formText.slice(0,200) });
    return {
      success: errors.length === 0,
      confidence: errors.length === 0 ? 1 : 0.4,
      errors,
      valuesFound,
      nextActionSuggested: errors.length === 0 ? ${JSON.stringify(suggestOk)} : 'retry_stage_or_ask_human',
      diagnostics: {
        strategiesUsed: ${JSON.stringify(strategiesUsed)},
        fillRefs: ${JSON.stringify(fillFields.map((f) => f.ref))},
        checkRef: ${JSON.stringify(checkHit && checkHit.ref)}
      }
    };
  }`;

  browserCalls += 1;
  const vr = await run(["browser", "evaluate", "--fn", validateFn]);
  const result = parseJsonFromCli((vr.out || "") + "\n" + (vr.err || ""));
  const elapsedMs = Date.now() - started;

  if (!result) {
    return {
      success: false,
      confidence: 0,
      errors: errors.length
        ? errors
        : [{ code: "NO_JSON", message: "validate evaluate returned no JSON" }],
      valuesFound: null,
      nextActionSuggested: "retry_stage_or_ask_human",
      browserCalls,
      elapsedMs,
      diagnostics: { strategiesUsed },
    };
  }

  return {
    ...result,
    errors: [...(result.errors || []), ...errors],
    success: result.success && errors.length === 0,
    browserCalls,
    elapsedMs,
  };
}
