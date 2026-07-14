/**
 * Teste: inscrição usando fillLeadForm() só na etapa de lead.
 * Agente (este script) decide navegação; helper só preenche/valida.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fillLeadForm, titleCaseName } from "./fillLeadForm.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const mjs = path.join(
  process.env.APPDATA,
  "npm",
  "node_modules",
  "openclaw",
  "openclaw.mjs"
);

const DATA = {
  email: "gaboloko@gmail.com",
  nome: "Gabo Loko Teste Helper",
  telefone: "11987124916",
  cep: "05001200",
  estado: "São Paulo",
  cidade: "São Paulo",
  first: "Gabo",
  last: "Loko",
  cpf: "50928152057",
  birth: "1999-09-09",
};

// Baseline da sessão anterior (fill lead sem helper dedicado)
const BASELINE_LEAD_MS = {
  source: "run-timing-pedagogia.json (continuação PDP)",
  fillCliMs: 6926,
  snapBeforeFillMs: 6361,
  ctaClickMs: 7131,
  retryUntilPoloMs: 2500 + 12308,
  totalUntilPoloReadyMs: 6361 + 6926 + 7131 + 1 + 12918 + 13437 + 12308,
  note: "Inclui snapshot + fill refs + CTA + waits/retry até hasPolo=true. Helper cobre só fill+aceite+validate (não CTA).",
};

const t0 = Date.now();
const log = [];
const mark = (step, extra = {}) => {
  const e = { t: Math.round((Date.now() - t0) / 1000), step, ...extra };
  log.push(e);
  console.log(`[${e.t}s] ${step}`, extra.msg || extra.href || "");
};

function run(args) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [mjs, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      cwd: root,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", (code) =>
      resolve({ code, out, err, ms: Date.now() - started })
    );
  });
}

async function ev(fn) {
  const r = await run(["browser", "evaluate", "--fn", fn]);
  const text = (r.out || "").trim();
  const i = text.search(/[\{\[]/);
  let parsed = null;
  if (i >= 0) {
    try {
      parsed = JSON.parse(text.slice(i));
    } catch {}
  }
  return { parsed, ms: r.ms, raw: text };
}

async function snap(limit = 40) {
  const r = await run([
    "browser",
    "snapshot",
    "--efficient",
    "--limit",
    String(limit),
  ]);
  return { text: r.out || "", ms: r.ms };
}

function refOf(text, re) {
  for (const line of text.split(/\n/)) {
    if (re.test(line)) {
      const m = line.match(/\[ref=(e\d+)\]/);
      if (m) return m[1];
    }
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await run(["browser", "focus", "t34"]);
mark("FOCUS");

// Agent: ensure PDP Pedagogia
let st = await ev(`() => ({ href: location.href, ola: /Olá/i.test(document.body.innerText||'') && /gaboloko|@/i.test(document.body.innerText||''), hasEntrar: /Entrar como cliente/i.test(document.body.innerText||'') })`);
mark("WHERE", { href: st.parsed?.href, msg: JSON.stringify(st.parsed) });

if (st.parsed?.hasEntrar || !st.parsed?.ola) {
  // Agent: garantir cliente (não é o helper de lead)
  await ev(`() => {
    const btn = document.querySelector('.cruzeirodosul-telemarketing-2-x-loginButton');
    if (btn) btn.click();
    return { ok: !!btn };
  }`);
  await sleep(600);
  await ev(`() => {
    const portal = document.querySelector('.cruzeirodosul-telemarketing-2-x-portalContainer');
    const input = (portal && portal.querySelector('input')) || [...document.querySelectorAll('input')].find(i => (i.placeholder||'') === 'Ex: example@mail.com');
    if (!input) return { ok:false };
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    d.set.call(input, ${JSON.stringify(DATA.email)});
    input.dispatchEvent(new Event('input',{bubbles:true}));
    const enter = [...document.querySelectorAll('button')].find(b => /^\\s*Entrar\\s*$/i.test(b.textContent||''));
    if (enter) enter.click();
    return { ok:true, value: input.value };
  }`);
  await sleep(2000);
  mark("AGENT_LOGIN");
}

if (!/grad-pedagogia-semipresencial/.test(st.parsed?.href || "")) {
  await run([
    "browser",
    "navigate",
    "https://cruzeirodosul.myvtex.com/grad-pedagogia-semipresencial-cruzeiro-do-sul-virtual/p",
  ]);
  await sleep(3000);
  st = await ev(`() => ({ href: location.href })`);
  mark("NAV_PDP", { href: st.parsed?.href });
}

// --- HELPER ONLY THIS STEP ---
mark("HELPER_START", {
  msg: JSON.stringify({
    nome: titleCaseName(DATA.nome),
    email: DATA.email,
    telefone: DATA.telefone,
  }),
});
const helperResult = await fillLeadForm(
  {
    nome: DATA.nome,
    email: DATA.email,
    telefone: DATA.telefone,
  },
  { run }
);
mark("HELPER_DONE", {
  msg: JSON.stringify({
    ok: helperResult.ok,
    elapsedMs: helperResult.elapsedMs,
    stage: helperResult.stage,
    values: helperResult.values,
    errors: helperResult.errors,
    strategies: helperResult.strategies,
  }),
});

if (!helperResult.ok) {
  const out = {
    ok: false,
    helperResult,
    baseline: BASELINE_LEAD_MS,
    comparison: {
      beforeFillRelatedMs: BASELINE_LEAD_MS.fillCliMs + BASELINE_LEAD_MS.snapBeforeFillMs,
      afterHelperMs: helperResult.elapsedMs,
    },
    log,
  };
  fs.writeFileSync(
    path.join(root, "measure-fillLeadForm.json"),
    JSON.stringify(out, null, 2)
  );
  console.log("HELPER FAILED — abort inscription");
  console.log(JSON.stringify(out, null, 2));
  process.exit(2);
}

// Agent decides: click Inscreva-se
const tCta0 = Date.now();
const clicked = await ev(`() => {
  const btn = [...document.querySelectorAll('button')].find(b =>
    b.offsetParent && /^\\s*Inscreva-se\\s*$/i.test((b.textContent||'').trim())
  ) || document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
  if (!btn) return { ok:false };
  btn.click();
  return { ok:true };
}`);
const ctaMs = Date.now() - tCta0;
mark("AGENT_CTA", { msg: JSON.stringify(clicked.parsed) + ` cli=${ctaMs}ms` });
await sleep(2500);

let after = await ev(`() => ({
  hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||'')
})`);
mark("AGENT_VALIDATE_POLO", { msg: JSON.stringify(after.parsed) });

// Agent: um retry de CTA se UI ainda não avançou (não é responsabilidade do helper)
if (!after.parsed?.hasPolo) {
  await sleep(1500);
  await ev(`() => {
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1')
      || [...document.querySelectorAll('button')].find(b => b.offsetParent && /inscreva-se/i.test(b.textContent||''));
    if (btn) btn.click();
    return { ok: !!btn };
  }`);
  await sleep(2500);
  after = await ev(`() => ({
    hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||'')
  })`);
  mark("AGENT_CTA_RETRY", { msg: JSON.stringify(after.parsed) });
}

// Continue minimal path to prove enrollment (agent-driven)
if (after.parsed?.hasPolo) {
  let s = await snap(70);
  let pais = refOf(s.text, /combobox \"Selecione um Pa/);
  if (pais) await run(["browser", "select", pais.ref, "Brasil"]);
  await sleep(600);
  s = await snap(70);
  let cep = refOf(s.text, /textbox \"Digite seu CEP\"/);
  if (cep)
    await run([
      "browser",
      "fill",
      "--fields",
      JSON.stringify([{ ref: cep.ref, value: DATA.cep }]),
    ]);
  let estado = refOf(s.text, /combobox \"Selecione um Estado\"/);
  if (estado) await run(["browser", "select", estado.ref, DATA.estado]);
  await sleep(1200);
  s = await snap(120);
  let cidade = refOf(s.text, /combobox \"Selecione uma Cidade\"/);
  if (cidade) await run(["browser", "select", cidade.ref, DATA.cidade]);
  await sleep(1800);
  s = await snap(200);
  const poloText = s.text
    .split(/\n/)
    .find((l) => /option/.test(l) && /Freguesia/i.test(l))
    ?.match(/option \"([^\"]+)/)?.[1];
  let polo = refOf(s.text, /combobox \"Selecione um Polo\"/);
  if (polo && poloText) await run(["browser", "select", polo.ref, poloText]);
  mark("POLO", { msg: poloText || "NOT_FOUND" });
  s = await snap(25);
  let ver = refOf(s.text, /button \"Ver condição especial\"/);
  if (ver) await run(["browser", "click", ver.ref]);
  await sleep(1200);
  s = await snap(40);
  let ing = refOf(s.text, /combobox \"Selecione uma forma de ingresso\"/);
  if (ing) await run(["browser", "select", ing.ref, "Vestibular Múltipla Escolha"]);
  s = await snap(40);
  let nec = refOf(s.text, /combobox \"Possui alguma necessidade/);
  if (nec)
    await run([
      "browser",
      "select",
      nec.ref,
      "Não necessito de condições especiais",
    ]);
  s = await snap(20);
  let cont = refOf(s.text, /button \"Continuar inscrição\"/);
  if (cont) await run(["browser", "click", cont.ref]);
  await sleep(4000);
  st = await ev(`() => ({ href: location.href })`);
  mark("CHECKOUT", { href: st.parsed?.href });

  if (/checkout/.test(st.parsed?.href || "")) {
    await run([
      "browser",
      "navigate",
      "https://cruzeirodosul.myvtex.com/checkout/#/profile",
    ]);
    await sleep(1500);
    await ev(`() => {
      const set=(el,v)=>{ if(!el) return; const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); el.dispatchEvent(new Event('blur',{bubbles:true})); };
      set(document.getElementById('client-first-name'), ${JSON.stringify(DATA.first)});
      set(document.getElementById('client-last-name'), ${JSON.stringify(DATA.last)});
      set(document.getElementById('client-document'), ${JSON.stringify(DATA.cpf)});
      set(document.getElementById('client-phone'), ${JSON.stringify(DATA.telefone)});
      set(document.getElementById('client-birthDate'), ${JSON.stringify(DATA.birth)});
      return true;
    }`);
    s = await snap(20);
    let ir = refOf(s.text, /button \"Ir para o Endereço\"/);
    if (ir) await run(["browser", "click", ir.ref]);
    await sleep(2000);
    st = await ev(`() => ({ href: location.href })`);
    if (!/#\/shipping/.test(st.parsed?.href || "")) {
      await run([
        "browser",
        "navigate",
        "https://cruzeirodosul.myvtex.com/checkout/#/shipping",
      ]);
      await sleep(1500);
    }
    s = await snap(30);
    cep = refOf(s.text, /textbox \"CEP/);
    if (cep)
      await run([
        "browser",
        "fill",
        "--fields",
        JSON.stringify([{ ref: cep.ref, value: DATA.cep }]),
      ]);
    await sleep(1200);
    s = await snap(25);
    let sem = refOf(s.text, /checkbox \"Sem número\"/);
    if (sem) await run(["browser", "click", sem.ref]);
    s = await snap(20);
    let go = refOf(s.text, /Prosseguir|Ir para o pagamento/);
    if (go) await run(["browser", "click", go.ref]);
    await sleep(2000);
    s = await snap(20);
    cont = refOf(s.text, /button \"Continuar Inscrição\"/);
    if (cont) await run(["browser", "click", cont.ref]);
    await sleep(4500);
    st = await ev(`() => ({ href: location.href, text: (document.body.innerText||'').slice(0,300) })`);
    mark("ORDER", { href: st.parsed?.href, msg: (st.parsed?.text || "").slice(0, 150) });

    s = await snap(25);
    let contProc = refOf(s.text, /Continuar Processo/);
    if (contProc) await run(["browser", "click", contProc.ref]);
    await sleep(2500);
    await run([
      "browser",
      "navigate",
      "https://cruzeirodosul.myvtex.com/account#/minhas-inscricoes/",
    ]);
    await sleep(2500);
    s = await snap(40);
    let acomp = refOf(s.text, /Acompanhar Inscrição/);
    if (acomp) await run(["browser", "click", acomp.ref]);
    await sleep(1200);
    const cap = await ev(`() => {
      const as = [...document.querySelectorAll('a')].filter(a => /acessar prova/i.test(a.textContent||''));
      return { hrefs: as.map(a => a.href), has: /Acessar prova/i.test(document.body.innerText||'') };
    }`);
    mark("CAPTURE", { msg: JSON.stringify(cap.parsed) });
  }
}

const report = {
  ok: true,
  helper: {
    name: "fillLeadForm",
    result: helperResult,
    elapsedMs: helperResult.elapsedMs,
  },
  baseline: BASELINE_LEAD_MS,
  comparison: {
    before_fill_plus_snap_ms:
      BASELINE_LEAD_MS.fillCliMs + BASELINE_LEAD_MS.snapBeforeFillMs,
    after_helper_fill_validate_ms: helperResult.elapsedMs,
    delta_ms:
      BASELINE_LEAD_MS.fillCliMs +
      BASELINE_LEAD_MS.snapBeforeFillMs -
      helperResult.elapsedMs,
    before_until_polo_ready_ms: BASELINE_LEAD_MS.totalUntilPoloReadyMs,
    note: "Helper não inclui CTA nem wait de polo; compara fill+localizar. Resiliência: validação estruturada + cascata semântica.",
  },
  data: { ...DATA, nomeNormalized: titleCaseName(DATA.nome) },
  log,
  elapsedSec: Math.round((Date.now() - t0) / 1000),
};

fs.writeFileSync(
  path.join(root, "measure-fillLeadForm.json"),
  JSON.stringify(report, null, 2)
);
console.log("\n=== MEASURE ===");
console.log(JSON.stringify(report.comparison, null, 2));
console.log("Full report: measure-fillLeadForm.json");
