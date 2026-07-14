/**
 * Inscrição completa — Lead exclusivamente via:
 *   runStageTransaction("lead-pdp", payload)
 * Restante do funil = agent-driven (não são Stages ainda).
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runStageTransaction } from "./runtime.mjs";

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

const PREV = {
  source: "measure-lead-transaction.json / measure-fillLeadForm.json",
  leadMs: 26202,
  leadBrowserCalls: 4,
  note: "prior Runtime accessibilityFill path",
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

let st = await ev(`() => ({
  href: location.href,
  ola: /Olá/i.test(document.body.innerText||'') && /gaboloko|@/i.test(document.body.innerText||''),
  hasEntrar: /Entrar como cliente/i.test(document.body.innerText||'')
})`);
mark("WHERE", { href: st.parsed?.href, msg: JSON.stringify(st.parsed) });

if (st.parsed?.hasEntrar || !st.parsed?.ola) {
  humanInterventions += 1;
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
    return { ok:true };
  }`);
  await sleep(2000);
  mark("AGENT_LOGIN");
}

await run([
  "browser",
  "navigate",
  "https://cruzeirodosul.myvtex.com/grad-pedagogia-semipresencial-cruzeiro-do-sul-virtual/p",
]);
await sleep(8000);
st = await ev(`() => ({ href: location.href })`);
mark("NAV_PDP", { href: st.parsed?.href });

let leadReady = false;
for (let i = 0; i < 15; i++) {
  const ready = await ev(`() => {
    const btn = [...document.querySelectorAll('button')].find(b =>
      b.offsetParent && /^\\s*Inscreva-se\\s*$/i.test((b.textContent||'').trim())
    ) || document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
    const names = [...document.querySelectorAll('input')]
      .filter(i => i.offsetParent && i.type !== 'hidden')
      .map(i => i.name || '');
    const hasLead = ['completeName','email','cellphone'].every(n => names.includes(n));
    const text = ((btn && btn.textContent) || '').trim();
    return {
      hasLead,
      btnText: text || null,
      ready: hasLead && /^Inscreva-se$/i.test(text)
    };
  }`);
  mark("WAIT_LEAD_READY", { msg: JSON.stringify(ready.parsed) });
  if (ready.parsed?.ready) {
    leadReady = true;
    break;
  }
  await sleep(2000);
}

if (!leadReady) {
  humanInterventions += 1;
  // one hard reload
  await run([
    "browser",
    "navigate",
    "https://cruzeirodosul.myvtex.com/grad-pedagogia-semipresencial-cruzeiro-do-sul-virtual/p",
  ]);
  await sleep(10000);
  const ready2 = await ev(`() => {
    const names = [...document.querySelectorAll('input')].filter(i => i.offsetParent).map(i => i.name||'');
    return { hasLead: ['completeName','email','cellphone'].every(n => names.includes(n)) };
  }`);
  leadReady = !!ready2.parsed?.hasLead;
  mark("RELOAD_LEAD", { msg: JSON.stringify(ready2.parsed) });
}

if (!leadReady) {
  const report = {
    ok: false,
    reason: "lead form not ready — agent precondition failed before Runtime",
    metrics: {
      totalElapsedSec: Math.round((Date.now() - t0) / 1000),
      totalBrowserToolCalls: browserToolCalls,
      humanInterventions,
    },
    log,
  };
  fs.writeFileSync(
    path.join(root, "measure-architecture-lead.json"),
    JSON.stringify(report, null, 2)
  );
  console.log("PRECONDITION FAILED");
  process.exit(2);
}

// --- ONLY STAGE: lead-pdp via Runtime (Agent knows stageId + payload only) ---
const leadCallsBefore = browserToolCalls;
mark("STAGE_LEAD_START", {
  msg: JSON.stringify({ stageId: "lead-pdp", api: "runStageTransaction(stageId, payload)" }),
});
const leadResult = await runStageTransaction("lead-pdp", {
  nome: DATA.nome,
  email: DATA.email,
  telefone: DATA.telefone,
});
// Runtime uses its own OpenClaw runner — count its calls separately
const leadBrowserCalls = leadResult.browserCalls ?? 0;
browserToolCalls += leadBrowserCalls;
mark("STAGE_LEAD_DONE", {
  msg: JSON.stringify({
    success: leadResult.success,
    confidence: leadResult.confidence,
    elapsedMs: leadResult.elapsedMs,
    browserCalls: leadBrowserCalls,
    writeBackend: leadResult.diagnostics?.writeBackend,
    valuesFound: leadResult.valuesFound,
    errors: leadResult.errors,
    nextActionSuggested: leadResult.nextActionSuggested,
  }),
});

if (!leadResult.success) {
  humanInterventions += 1;
  const report = {
    ok: false,
    architecture: "Agent → Runtime → Stage → Write Engine",
    stages: {
      "lead-pdp": {
        success: false,
        elapsedMs: leadResult.elapsedMs,
        browserToolCalls: leadBrowserCalls,
        result: leadResult,
      },
    },
    metrics: {
      totalElapsedSec: Math.round((Date.now() - t0) / 1000),
      totalBrowserToolCalls: browserToolCalls,
      humanInterventions,
      successRate: 0,
    },
    comparison: PREV,
    log,
  };
  fs.writeFileSync(
    path.join(root, "measure-architecture-lead.json"),
    JSON.stringify(report, null, 2)
  );
  console.log("LEAD STAGE FAILED");
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}

// Agent: CTA (not part of Write Engine / Stage)
const snapCta = await snap(30);
const ctaRef = refOf(snapCta.text, /button \"Inscreva-se\"/);
if (ctaRef) await run(["browser", "click", ctaRef]);
else {
  await ev(`() => {
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
    if (btn) btn.click();
    return { ok: !!btn };
  }`);
}
mark("AGENT_CTA");
await sleep(3000);

let after = await ev(`() => ({
  hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||'')
})`);
mark("AGENT_VALIDATE_POLO", { msg: JSON.stringify(after.parsed) });

if (!after.parsed?.hasPolo) {
  humanInterventions += 1;
  await sleep(1500);
  const s2 = await snap(30);
  const r2 = refOf(s2.text, /button \"Inscreva-se\"/);
  if (r2) await run(["browser", "click", r2]);
  await sleep(3000);
  after = await ev(`() => ({
    hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||'')
  })`);
  mark("AGENT_CTA_RETRY", { msg: JSON.stringify(after.parsed) });
}

let funnelOk = false;
let provaHrefs = [];

if (after.parsed?.hasPolo) {
  let s = await snap(80);
  let pais = refOf(s.text, /combobox \"Selecione um Pa/);
  if (pais) await run(["browser", "select", pais, "Brasil"]);
  await sleep(800);
  s = await snap(80);
  let cep = refOf(s.text, /textbox \"Digite seu CEP\"/);
  if (cep)
    await run([
      "browser",
      "fill",
      "--fields",
      JSON.stringify([{ ref: cep, value: DATA.cep }]),
    ]);
  await sleep(600);
  s = await snap(100);
  let estado = refOf(s.text, /combobox \"Selecione um Estado\"/);
  if (estado) await run(["browser", "select", estado, DATA.estado]);
  await sleep(1500);
  s = await snap(150);
  let cidade = refOf(s.text, /combobox \"Selecione uma Cidade\"/);
  if (cidade) await run(["browser", "select", cidade, DATA.cidade]);
  await sleep(2000);
  s = await snap(220);
  const poloText = s.text
    .split(/\n/)
    .find((l) => /option/.test(l) && /Freguesia/i.test(l))
    ?.match(/option \"([^\"]+)/)?.[1];
  let polo = refOf(s.text, /combobox \"Selecione um Polo\"/);
  if (polo && poloText) await run(["browser", "select", polo, poloText]);
  else {
    const any = s.text
      .split(/\n/)
      .find((l) => /option \"/.test(l) && /São Paulo -/i.test(l))
      ?.match(/option \"([^\"]+)/)?.[1];
    if (polo && any) await run(["browser", "select", polo, any]);
    else humanInterventions += 1;
  }
  mark("POLO", { msg: poloText || "fallback/unknown" });

  s = await snap(30);
  let ver = refOf(s.text, /button \"Ver condição especial\"/);
  if (ver) await run(["browser", "click", ver]);
  await sleep(1500);
  s = await snap(50);
  let ing = refOf(s.text, /combobox \"Selecione uma forma de ingresso\"/);
  if (ing) await run(["browser", "select", ing, "Vestibular Múltipla Escolha"]);
  await sleep(500);
  s = await snap(50);
  let nec = refOf(s.text, /combobox \"Possui alguma necessidade/);
  if (nec) {
    const necLabel =
      s.text
        .split(/\n/)
        .find((l) => /option \"Não necessito/.test(l))
        ?.match(/option \"([^\"]+)/)?.[1] ||
      "Não necessito de condições especiais";
    await run(["browser", "select", nec, necLabel]);
  }
  await sleep(400);
  s = await snap(25);
  let cont = refOf(s.text, /button \"Continuar inscrição\"/);
  if (cont) await run(["browser", "click", cont]);
  await sleep(5000);
  st = await ev(`() => ({ href: location.href })`);
  mark("AFTER_CONTINUAR", { href: st.parsed?.href });

  if (!/checkout/.test(st.parsed?.href || "")) {
    await run([
      "browser",
      "navigate",
      "https://cruzeirodosul.myvtex.com/checkout/#/profile",
    ]);
    await sleep(2000);
    st = await ev(`() => ({ href: location.href, empty: /carrinho está vazio/i.test(document.body.innerText||'') })`);
    mark("NAV_CHECKOUT", { msg: JSON.stringify(st.parsed) });
  }

  if (/checkout/.test(st.parsed?.href || "") && !st.parsed?.empty) {
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
    s = await snap(25);
    let ir = refOf(s.text, /button \"Ir para o Endereço\"/);
    if (ir) await run(["browser", "click", ir]);
    await sleep(2000);
    await run([
      "browser",
      "navigate",
      "https://cruzeirodosul.myvtex.com/checkout/#/shipping",
    ]);
    await sleep(1500);
    s = await snap(30);
    cep = refOf(s.text, /textbox \"CEP/);
    if (cep)
      await run([
        "browser",
        "fill",
        "--fields",
        JSON.stringify([{ ref: cep, value: DATA.cep }]),
      ]);
    await sleep(1200);
    s = await snap(25);
    let sem = refOf(s.text, /checkbox \"Sem número\"/);
    if (sem) await run(["browser", "click", sem]);
    s = await snap(20);
    let go = refOf(s.text, /Prosseguir|Ir para o pagamento/);
    if (go) await run(["browser", "click", go]);
    await sleep(2000);
    s = await snap(20);
    cont = refOf(s.text, /button \"Continuar Inscrição\"/);
    if (cont) await run(["browser", "click", cont]);
    await sleep(4500);
    mark("ORDER");
    s = await snap(25);
    let contProc = refOf(s.text, /Continuar Processo/);
    if (contProc) await run(["browser", "click", contProc]);
    await sleep(2500);
  } else if (st.parsed?.empty) {
    humanInterventions += 1;
    mark("CART_EMPTY", { msg: "Continuar não adicionou ao carrinho" });
  }

  await run([
    "browser",
    "navigate",
    "https://cruzeirodosul.myvtex.com/account#/minhas-inscricoes/",
  ]);
  await sleep(2500);
  s = await snap(40);
  let acomp = refOf(s.text, /Acompanhar Inscrição/);
  if (acomp) await run(["browser", "click", acomp]);
  await sleep(1200);
  const cap = await ev(`() => {
    const as = [...document.querySelectorAll('a')].filter(a => /acessar prova/i.test(a.textContent||''));
    return { hrefs: as.map(a => a.href), has: /Acessar prova/i.test(document.body.innerText||'') };
  }`);
  provaHrefs = cap.parsed?.hrefs || [];
  funnelOk = !!(cap.parsed?.has && provaHrefs.length);
  mark("CAPTURE", { msg: JSON.stringify(cap.parsed) });
} else {
  humanInterventions += 1;
  mark("BLOCKED_NO_POLO");
}

const leadSuccess = !!leadResult.success;
const report = {
  ok: leadSuccess,
  architecture: "Agent → Runtime → Stage Definition → Write Engine",
  agentApi: 'runStageTransaction(stageId, payload)',
  stages: {
    "lead-pdp": {
      success: leadSuccess,
      elapsedMs: leadResult.elapsedMs,
      browserToolCalls: leadBrowserCalls,
      writeBackend: leadResult.diagnostics?.writeBackend,
      confidence: leadResult.confidence,
      nextActionSuggested: leadResult.nextActionSuggested,
      valuesFound: leadResult.valuesFound,
    },
  },
  funnelAfterLead: {
    advancedToPolo: !!after?.parsed?.hasPolo,
    provaCaptured: funnelOk,
    provaHrefs,
    note: "Address/Checkout are agent-driven, not Stages",
  },
  metrics: {
    leadElapsedMs: leadResult.elapsedMs,
    leadBrowserToolCalls: leadBrowserCalls,
    totalElapsedSec: Math.round((Date.now() - t0) / 1000),
    totalBrowserToolCalls: browserToolCalls,
    humanInterventions,
    successRateLead: leadSuccess ? 1 : 0,
    successRateFunnelProva: funnelOk ? 1 : 0,
  },
  comparison: {
    previousLeadMs: PREV.leadMs,
    previousLeadBrowserCalls: PREV.leadBrowserCalls,
    thisLeadMs: leadResult.elapsedMs,
    thisLeadBrowserCalls: leadBrowserCalls,
    deltaLeadMs: PREV.leadMs - leadResult.elapsedMs,
    deltaLeadCalls: PREV.leadBrowserCalls - leadBrowserCalls,
  },
  data: DATA,
  log,
};

fs.writeFileSync(
  path.join(root, "measure-architecture-lead.json"),
  JSON.stringify(report, null, 2)
);

console.log("\n=== ARCHITECTURE VALIDATION REPORT ===");
console.log(JSON.stringify({
  stages: report.stages,
  metrics: report.metrics,
  comparison: report.comparison,
  funnelAfterLead: report.funnelAfterLead,
}, null, 2));
console.log("Full: measure-architecture-lead.json");
