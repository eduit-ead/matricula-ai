/**
 * Inscrição completa: lead via Browser Transaction Runtime (stage lead-pdp).
 * Restante do funil = mesmo caminho agent-driven de run-measure-fillLeadForm.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fillLeadForm, titleCaseName } from "../helpers/fillLeadForm.mjs";

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
  nome: "Gabo Loko Pedreira",
  telefone: "11987124916",
  cep: "05001200",
  estado: "São Paulo",
  cidade: "São Paulo",
  first: "Gabo",
  last: "Loko",
  cpf: "50928152057",
  birth: "1999-09-09",
};

const PREV_HELPER = {
  source: "measure-fillLeadForm.json",
  leadMs: 21800,
  browserCallsApprox: 3,
  note: "snapshot-fill-primary path (~3 RT)",
};

const t0 = Date.now();
const log = [];
let browserToolCalls = 0;
let humanInterventions = 0;

const mark = (step, extra = {}) => {
  const e = { t: Math.round((Date.now() - t0) / 1000), step, ...extra };
  log.push(e);
  console.log(`[${e.t}s] ${step}`, extra.msg || extra.href || "");
};

function run(args) {
  browserToolCalls += 1;
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

let st = await ev(`() => ({ href: location.href, ola: /Olá/i.test(document.body.innerText||'') && /gaboloko|@/i.test(document.body.innerText||''), hasEntrar: /Entrar como cliente/i.test(document.body.innerText||'') })`);
mark("WHERE", { href: st.parsed?.href, msg: JSON.stringify(st.parsed) });

if (st.parsed?.hasEntrar || !st.parsed?.ola) {
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

// Agent: ensure PDP is fresh and lead inputs are present
await run([
  "browser",
  "navigate",
  "https://cruzeirodosul.myvtex.com/grad-pedagogia-semipresencial-cruzeiro-do-sul-virtual/p",
]);
await sleep(4000);
st = await ev(`() => ({ href: location.href })`);
mark("NAV_PDP", { href: st.parsed?.href });

for (let i = 0; i < 10; i++) {
  const ready = await ev(`() => {
    const names = [...document.querySelectorAll('input')]
      .filter(i => i.offsetParent && i.type !== 'hidden')
      .map(i => i.name || '');
    const hasLead = ['completeName','email','cellphone'].some(n => names.includes(n));
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
    return { hasLead, btnText: btn ? (btn.textContent||'').trim() : null };
  }`);
  mark("WAIT_LEAD_READY", { msg: JSON.stringify(ready.parsed) });
  if (ready.parsed?.hasLead) break;
  await sleep(1500);
}

const leadCallsBefore = browserToolCalls;
mark("LEAD_TX_START", {
  msg: JSON.stringify({
    stageId: "lead-pdp",
    nome: titleCaseName(DATA.nome),
    email: DATA.email,
    telefone: DATA.telefone,
  }),
});
const leadResult = await fillLeadForm(
  {
    nome: DATA.nome,
    email: DATA.email,
    telefone: DATA.telefone,
  },
  { run }
);
const leadBrowserCalls = browserToolCalls - leadCallsBefore;
mark("LEAD_TX_DONE", {
  msg: JSON.stringify({
    success: leadResult.success,
    confidence: leadResult.confidence,
    elapsedMs: leadResult.elapsedMs,
    browserCalls: leadBrowserCalls,
    valuesFound: leadResult.valuesFound,
    errors: leadResult.errors,
    nextActionSuggested: leadResult.nextActionSuggested,
  }),
});

if (!leadResult.ok) {
  humanInterventions += 1;
  const out = {
    ok: false,
    architecture: "browser-transaction-runtime",
    stage: "lead-pdp",
    leadResult,
    metrics: {
      leadMs: leadResult.elapsedMs,
      leadBrowserToolCalls: leadBrowserCalls,
      totalBrowserToolCalls: browserToolCalls,
      humanInterventions,
      elapsedSec: Math.round((Date.now() - t0) / 1000),
    },
    comparison: {
      prevHelperLeadMs: PREV_HELPER.leadMs,
      prevHelperBrowserCallsApprox: PREV_HELPER.browserCallsApprox,
      thisLeadMs: leadResult.elapsedMs,
      thisLeadBrowserCalls: leadBrowserCalls,
    },
    log,
  };
  fs.writeFileSync(
    path.join(root, "measure-lead-transaction.json"),
    JSON.stringify(out, null, 2)
  );
  console.log("LEAD TRANSACTION FAILED — abort inscription");
  console.log(JSON.stringify(out, null, 2));
  process.exit(2);
}

const tCta0 = Date.now();
const snapCta = await snap(30);
const ctaRef = refOf(snapCta.text, /button \"Inscreva-se\"/);
let clicked = { parsed: { ok: false, via: null } };
if (ctaRef) {
  const cr = await run(["browser", "click", ctaRef]);
  clicked = { parsed: { ok: true, via: "snapshot-click", ref: ctaRef, out: (cr.out || "").slice(0, 80) } };
} else {
  clicked = await ev(`() => {
    const btn = [...document.querySelectorAll('button')].find(b =>
      b.offsetParent && /^\\s*Inscreva-se\\s*$/i.test((b.textContent||'').trim())
    ) || document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
    if (!btn) return { ok:false };
    btn.click();
    return { ok:true, via:'evaluate-click' };
  }`);
}
const ctaMs = Date.now() - tCta0;
mark("AGENT_CTA", { msg: JSON.stringify(clicked.parsed) + ` cli=${ctaMs}ms` });
await sleep(2500);

let after = await ev(`() => ({
  hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||'')
})`);
mark("AGENT_VALIDATE_POLO", { msg: JSON.stringify(after.parsed) });

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
} else {
  humanInterventions += 1;
  mark("BLOCKED_NO_POLO", { msg: "Lead ok but UI did not advance — needs human" });
}

const capture = log.find((e) => e.step === "CAPTURE");
const report = {
  ok: !!(capture && /hrefs/.test(capture.msg || "")),
  architecture: "browser-transaction-runtime",
  stage: "lead-pdp",
  lead: {
    result: leadResult,
    elapsedMs: leadResult.elapsedMs,
    browserToolCalls: leadBrowserCalls,
  },
  metrics: {
    leadMs: leadResult.elapsedMs,
    leadBrowserToolCalls: leadBrowserCalls,
    totalBrowserToolCalls: browserToolCalls,
    humanInterventions,
    totalElapsedSec: Math.round((Date.now() - t0) / 1000),
  },
  comparison: {
    prevHelperLeadMs: PREV_HELPER.leadMs,
    prevHelperBrowserCallsApprox: PREV_HELPER.browserCallsApprox,
    thisLeadMs: leadResult.elapsedMs,
    thisLeadBrowserCalls: leadBrowserCalls,
    deltaLeadMs: PREV_HELPER.leadMs - leadResult.elapsedMs,
  },
  data: { ...DATA, nomeNormalized: titleCaseName(DATA.nome) },
  log,
};

fs.writeFileSync(
  path.join(root, "measure-lead-transaction.json"),
  JSON.stringify(report, null, 2)
);
console.log("\n=== MEASURE lead-pdp transaction ===");
console.log(JSON.stringify({ metrics: report.metrics, comparison: report.comparison }, null, 2));
console.log("Full report: measure-lead-transaction.json");
