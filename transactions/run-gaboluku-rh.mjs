/**
 * Inscrição gaboluku / Gestão RH — com timeout por chamada e por fase.
 * Se travar, aborta e grava measure-gaboluku-rh.json
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
  email: "gaboluku@gmail.com",
  cursoQuery: "Gestão de recursos humanos",
  nome: "Gabriel Lkonte",
  telefone: "11987124916",
  cep: "05001200",
  estado: "São Paulo",
  cidade: "São Paulo",
  poloPrefix: "São Paulo - Freguesia",
  first: "Gabriel",
  last: "Lkonte",
  cpf: "41018624007",
  birth: "1999-09-09",
  ingresso: "Vestibular Múltipla Escolha",
  necessidade: "Não necessito de condições especiais",
};

/** Limits */
const CALL_TIMEOUT_MS = 45000;
const PHASE_MAX_MS = {
  login: 90000,
  search_pdp: 120000,
  wait_lead: 90000,
  lead: 90000,
  polo: 180000,
  checkout: 180000,
  capture: 90000,
};
const TOTAL_MAX_MS = 10 * 60 * 1000;

const t0 = Date.now();
const log = [];
let browserToolCalls = 0;
let humanInterventions = 0;
let aborted = null;
let phaseStarted = Date.now();
let currentPhase = "init";
let s;

const mark = (step, extra = {}) => {
  const e = { t: Math.round((Date.now() - t0) / 1000), step, ...extra };
  log.push(e);
  console.log(`[${e.t}s] ${step}`, extra.msg || extra.href || extra.reason || "");
};

function beginPhase(name) {
  currentPhase = name;
  phaseStarted = Date.now();
  mark("PHASE", { msg: name });
}

function checkBudgets() {
  const total = Date.now() - t0;
  if (total > TOTAL_MAX_MS) {
    aborted = {
      reason: "TOTAL_TIMEOUT",
      phase: currentPhase,
      totalMs: total,
    };
    return false;
  }
  const maxPhase = PHASE_MAX_MS[currentPhase];
  if (maxPhase && Date.now() - phaseStarted > maxPhase) {
    aborted = {
      reason: "PHASE_TIMEOUT",
      phase: currentPhase,
      phaseMs: Date.now() - phaseStarted,
    };
    return false;
  }
  return true;
}

function run(args) {
  if (!checkBudgets()) {
    return Promise.resolve({
      code: -1,
      out: "",
      err: JSON.stringify(aborted),
      ms: 0,
      timedOut: true,
    });
  }
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
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGTERM");
      } catch {}
      aborted = {
        reason: "CALL_TIMEOUT",
        phase: currentPhase,
        args: args.slice(0, 3),
        ms: Date.now() - started,
      };
      mark("ABORT_CALL", { msg: JSON.stringify(aborted) });
      resolve({
        code: -1,
        out,
        err: "CALL_TIMEOUT",
        ms: Date.now() - started,
        timedOut: true,
      });
    }, CALL_TIMEOUT_MS);

    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const ms = Date.now() - started;
      if (ms > 20000) mark("SLOW_CALL", { msg: `${args[0]} ${args[1] || ""} ${ms}ms` });
      resolve({ code, out, err, ms });
    });
  });
}

async function ev(fn) {
  const r = await run(["browser", "evaluate", "--fn", fn]);
  if (r.timedOut || aborted) return { parsed: null, ms: r.ms, raw: "", aborted: true };
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
  if (r.timedOut || aborted) return { text: "", ms: r.ms, aborted: true };
  return { text: r.out || "", ms: r.ms };
}

function refOf(text, re) {
  for (const line of String(text || "").split(/\n/)) {
    if (re.test(line)) {
      const m = line.match(/\[ref=(e\d+)\]/);
      if (m) return m[1];
    }
  }
  return null;
}

function optionContaining(text, re) {
  for (const line of String(text || "").split(/\n/)) {
    if (/option \"/.test(line) && re.test(line)) {
      const m = line.match(/option \"([^\"]+)/);
      if (m) return m[1];
    }
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function focusContentTab() {
  const tabs = await run(["browser", "tabs"]);
  const text = tabs.out || "";
  let pick = null;
  // Prefer explicit content pages (title line then url line)
  const blocks = text.split(/\n(?=\d+\.)/);
  for (const block of blocks) {
    if (!/cruzeirodosul\.myvtex\.com/i.test(block)) continue;
    if (/recaptcha|doubleclick|criteo|serviceWorker|service_worker|fls\.|webworker/i.test(block))
      continue;
    const m = block.match(/\[use:\s*(t\d+)/);
    if (m) {
      // Prefer /graduacao or /grad- or /p product pages
      if (/\/graduacao|\/grad-|\/p(\?|$)/i.test(block) || /Graduação|Cruzeiro do Sul Virtual \[use/i.test(block)) {
        pick = m[1];
        break;
      }
      if (!pick) pick = m[1];
    }
  }
  if (!pick) pick = "t1";
  await run(["browser", "focus", pick]);
  mark("FOCUS", { msg: pick });
  return pick;
}

function saveAndExit(report, code = 0) {
  const out = {
    ...report,
    aborted,
    metrics: {
      ...(report.metrics || {}),
      totalElapsedSec: Math.round((Date.now() - t0) / 1000),
      totalBrowserToolCalls: browserToolCalls,
      humanInterventions,
    },
    log,
    data: DATA,
  };
  fs.writeFileSync(
    path.join(root, "measure-gaboluku-rh.json"),
    JSON.stringify(out, null, 2)
  );
  console.log("\n=== SUMMARY ===");
  console.log(
    JSON.stringify(
      {
        ok: out.ok,
        aborted: out.aborted,
        lead: out.lead,
        funnel: out.funnel,
        metrics: out.metrics,
      },
      null,
      2
    )
  );
  process.exit(code);
}

// --- start ---
await focusContentTab();
if (aborted) saveAndExit({ ok: false }, 2);

let st = await ev(`() => ({
  href: location.href,
  hasEntrar: /Entrar como cliente/i.test(document.body.innerText||''),
  ola: /Olá/i.test(document.body.innerText||'')
})`);
if (aborted) saveAndExit({ ok: false }, 2);
mark("WHERE", { href: st.parsed?.href, msg: JSON.stringify(st.parsed) });

beginPhase("login");
if (!/graduacao/i.test(st.parsed?.href || "")) {
  await run(["browser", "navigate", "https://cruzeirodosul.myvtex.com/graduacao"]);
  await sleep(2500);
  if (aborted) saveAndExit({ ok: false }, 2);
  mark("NAV_GRADUACAO");
}

st = await ev(`() => ({
  hasEntrar: /Entrar como cliente/i.test(document.body.innerText||''),
  ola: /Olá/i.test(document.body.innerText||''),
  emailShown: /gaboluku/i.test(document.body.innerText||'')
})`);
if (aborted) saveAndExit({ ok: false }, 2);

if (st.parsed?.hasEntrar || !st.parsed?.ola || !st.parsed?.emailShown) {
  await ev(`() => {
    const btn = document.querySelector('.cruzeirodosul-telemarketing-2-x-loginButton')
      || [...document.querySelectorAll('button')].find(b => /Entrar como cliente/i.test(b.textContent||''));
    if (btn) btn.click();
    return { ok: !!btn };
  }`);
  await sleep(700);
  await ev(`() => {
    const portal = document.querySelector('.cruzeirodosul-telemarketing-2-x-portalContainer');
    const input = (portal && portal.querySelector('input'))
      || [...document.querySelectorAll('input')].find(i => (i.placeholder||'') === 'Ex: example@mail.com');
    if (!input) return { ok:false };
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    d.set.call(input, ${JSON.stringify(DATA.email)});
    input.dispatchEvent(new Event('input',{bubbles:true}));
    const enter = [...document.querySelectorAll('button')].find(b => /^\\s*Entrar\\s*$/i.test((b.textContent||'').trim()));
    if (enter) enter.click();
    return { ok:true };
  }`);
  await sleep(2500);
  if (aborted) saveAndExit({ ok: false }, 2);
  mark("AGENT_LOGIN", { msg: DATA.email });
}

beginPhase("search_pdp");
// Graduação Tecnólogo — URL canônica (evita clicar Pós/cursos livres na SERP)
const PDP_RH =
  "https://cruzeirodosul.myvtex.com/grad-gestao-de-recursos-humanos-cruzeiro-do-sul-virtual/p";
await run(["browser", "navigate", PDP_RH]);
await sleep(5000);
await focusContentTab();
if (aborted) saveAndExit({ ok: false }, 2);
st = await ev(`() => ({ href: location.href })`);
mark("PDP", { href: st.parsed?.href });
if (!/grad-gestao-de-recursos-humanos/i.test(st.parsed?.href || "")) {
  // SERP fallback
  const q = encodeURIComponent("recursos humanos");
  await run([
    "browser",
    "navigate",
    `https://cruzeirodosul.myvtex.com/${q}?_q=${q}&map=ft`,
  ]);
  await sleep(3500);
  const found = await ev(`() => {
    const a = [...document.querySelectorAll('a')].find(x =>
      /grad-gestao-de-recursos-humanos/i.test(x.href||'')
    );
    if (a) { a.click(); return { ok:true, href:a.href }; }
    return { ok:false };
  }`);
  mark("OPEN_PDP_EVAL", { msg: JSON.stringify(found.parsed) });
  await sleep(4500);
  st = await ev(`() => ({ href: location.href })`);
  mark("PDP", { href: st.parsed?.href });
}
if (!/grad-gestao-de-recursos-humanos/i.test(st.parsed?.href || "")) {
  humanInterventions += 1;
  saveAndExit({ ok: false, reason: "RH graduacao PDP not opened", href: st.parsed?.href }, 2);
}

beginPhase("wait_lead");
let leadReady = false;
for (let i = 0; i < 8; i++) {
  if (!checkBudgets()) break;
  const ready = await ev(`() => {
    const btn = [...document.querySelectorAll('button')].find(b =>
      b.offsetParent && /^\\s*Inscreva-se\\s*$/i.test((b.textContent||'').trim())
    );
    const names = [...document.querySelectorAll('input')].filter(i => i.offsetParent).map(i => i.name||'');
    const hasLead = ['completeName','email','cellphone'].every(n => names.includes(n));
    const text = ((btn && btn.textContent) || '').trim();
    return { ready: hasLead && /^Inscreva-se$/i.test(text), hasLead, btnText: text || null };
  }`);
  if (aborted) break;
  mark("WAIT_LEAD", { msg: JSON.stringify(ready.parsed) });
  if (ready.parsed?.ready) {
    leadReady = true;
    break;
  }
  await sleep(1500);
}

if (aborted) saveAndExit({ ok: false }, 2);
if (!leadReady) {
  humanInterventions += 1;
  saveAndExit({ ok: false, reason: "lead form not ready" }, 2);
}

beginPhase("lead");
mark("STAGE_LEAD_START");
const leadStarted = Date.now();
const leadResult = await runStageTransaction("lead-pdp", {
  nome: DATA.nome,
  email: DATA.email,
  telefone: DATA.telefone,
});
browserToolCalls += leadResult.browserCalls || 0;
if (Date.now() - leadStarted > PHASE_MAX_MS.lead) {
  aborted = { reason: "PHASE_TIMEOUT", phase: "lead", phaseMs: Date.now() - leadStarted };
}
mark("STAGE_LEAD_DONE", {
  msg: JSON.stringify({
    success: leadResult.success,
    ms: leadResult.elapsedMs,
    calls: leadResult.browserCalls,
    backend: leadResult.diagnostics?.writeBackend,
    values: leadResult.valuesFound,
    errors: leadResult.errors,
  }),
});

if (!leadResult.success) {
  humanInterventions += 1;
  saveAndExit({ ok: false, lead: leadResult }, 2);
}
if (aborted) saveAndExit({ ok: false, lead: leadResult }, 2);

s = await snap(30);
const cta = refOf(s.text, /button \"Inscreva-se\"/);
if (cta) await run(["browser", "click", cta]);
else {
  await ev(`() => {
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1')
      || [...document.querySelectorAll('button')].find(b => /^\\s*Inscreva-se\\s*$/i.test((b.textContent||'').trim()));
    if (btn) btn.click();
    return { ok: !!btn };
  }`);
}
mark("AGENT_CTA");
await sleep(3000);
if (aborted) saveAndExit({ ok: false, lead: leadResult }, 2);

let after = await ev(`() => ({
  hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||'')
})`);
mark("VALIDATE_POLO", { msg: JSON.stringify(after.parsed) });

if (!after.parsed?.hasPolo) {
  await sleep(1200);
  s = await snap(30);
  const cta2 = refOf(s.text, /button \"Inscreva-se\"/);
  if (cta2) await run(["browser", "click", cta2]);
  await sleep(2500);
  after = await ev(`() => ({
    hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||'')
  })`);
  mark("CTA_RETRY", { msg: JSON.stringify(after.parsed) });
}
if (aborted) saveAndExit({ ok: false, lead: leadResult }, 2);

let provaHrefs = [];
let orderOk = false;
let poloText = null;

if (!after.parsed?.hasPolo) {
  humanInterventions += 1;
  saveAndExit({
    ok: false,
    reason: "no polo after CTA",
    lead: {
      success: leadResult.success,
      elapsedMs: leadResult.elapsedMs,
      browserCalls: leadResult.browserCalls,
    },
    funnel: { advancedToPolo: false },
  }, 2);
}

beginPhase("polo");
s = await snap(80);
let pais = refOf(s.text, /combobox \"Selecione um Pa/);
if (pais) await run(["browser", "select", pais, "Brasil"]);
await sleep(700);
s = await snap(80);
let cep = refOf(s.text, /textbox \"Digite seu CEP\"/);
if (cep)
  await run([
    "browser",
    "fill",
    "--fields",
    JSON.stringify([{ ref: cep, value: DATA.cep }]),
  ]);
await sleep(500);
s = await snap(120);
let estado = refOf(s.text, /combobox \"Selecione um Estado\"/);
if (estado) await run(["browser", "select", estado, DATA.estado]);
await sleep(1200);
if (aborted) saveAndExit({ ok: false, lead: leadResult }, 2);
s = await snap(160);
let cidade = refOf(s.text, /combobox \"Selecione uma Cidade\"/);
if (cidade) await run(["browser", "select", cidade, DATA.cidade]);
await sleep(1800);
s = await snap(220);
poloText =
  optionContaining(s.text, /Freguesia/i) ||
  optionContaining(s.text, /freguesia/i);
let polo = refOf(s.text, /combobox \"Selecione um Polo\"/);
if (polo && poloText) await run(["browser", "select", polo, poloText]);
else {
  humanInterventions += 1;
  mark("POLO_FAIL");
}
mark("POLO", { msg: poloText || "NOT_FOUND" });
if (aborted) saveAndExit({ ok: false, lead: leadResult }, 2);

s = await snap(30);
let ver = refOf(s.text, /button \"Ver condição especial\"/);
if (ver) await run(["browser", "click", ver]);
await sleep(1200);
s = await snap(50);
let ing = refOf(s.text, /combobox \"Selecione uma forma de ingresso\"/);
if (ing) await run(["browser", "select", ing, DATA.ingresso]);
await sleep(400);
s = await snap(50);
let nec = refOf(s.text, /combobox \"Possui alguma necessidade/);
if (nec) {
  const necLabel = optionContaining(s.text, /Não necessito/) || DATA.necessidade;
  await run(["browser", "select", nec, necLabel]);
}
await sleep(300);
s = await snap(25);
let cont = refOf(s.text, /button \"Continuar inscrição\"/);
if (cont) await run(["browser", "click", cont]);
await sleep(5000);
if (aborted) saveAndExit({ ok: false, lead: leadResult }, 2);

beginPhase("checkout");
await run([
  "browser",
  "navigate",
  "https://cruzeirodosul.myvtex.com/checkout/#/profile",
]);
await sleep(2500);
st = await ev(`() => ({
  href: location.href,
  emptyCart: /carrinho está vazio/i.test(document.body.innerText||''),
  hasProfile: !!document.getElementById('client-first-name')
})`);
mark("CHECKOUT_PROFILE", { msg: JSON.stringify(st.parsed) });
if (aborted) saveAndExit({ ok: false, lead: leadResult }, 2);

if (st.parsed?.emptyCart) {
  humanInterventions += 1;
  mark("CART_EMPTY");
} else if (st.parsed?.hasProfile || /checkout/i.test(st.parsed?.href || "")) {
  await ev(`() => {
    const set=(el,v)=>{ if(!el) return false; const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); el.dispatchEvent(new Event('blur',{bubbles:true})); return true; };
    return {
      first: set(document.getElementById('client-first-name'), ${JSON.stringify(DATA.first)}),
      last: set(document.getElementById('client-last-name'), ${JSON.stringify(DATA.last)}),
      doc: set(document.getElementById('client-document'), ${JSON.stringify(DATA.cpf)}),
      phone: set(document.getElementById('client-phone'), ${JSON.stringify(DATA.telefone)}),
      birth: set(document.getElementById('client-birthDate'), ${JSON.stringify(DATA.birth)})
    };
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
  await sleep(1800);
  if (aborted) saveAndExit({ ok: false, lead: leadResult }, 2);
  s = await snap(35);
  cep = refOf(s.text, /textbox \"CEP/);
  if (cep)
    await run([
      "browser",
      "fill",
      "--fields",
      JSON.stringify([{ ref: cep, value: DATA.cep }]),
    ]);
  await sleep(1200);
  s = await snap(30);
  let sem = refOf(s.text, /checkbox \"Sem número\"/);
  if (sem) {
    const line = s.text.split(/\n/).find((l) => /checkbox \"Sem número\"/.test(l));
    if (line && !/\[checked\]/.test(line)) await run(["browser", "click", sem]);
  }
  s = await snap(25);
  let go = refOf(s.text, /Prosseguir|Ir para o pagamento/);
  if (go) await run(["browser", "click", go]);
  await sleep(2000);
  s = await snap(25);
  cont = refOf(s.text, /button \"Continuar Inscrição\"/);
  if (cont) await run(["browser", "click", cont]);
  await sleep(4500);
  st = await ev(`() => ({ href: location.href, text: (document.body.innerText||'').slice(0,300) })`);
  orderOk = /orderPlaced|pedido|obrigado|confirma/i.test(
    (st.parsed?.href || "") + (st.parsed?.text || "")
  );
  mark("ORDER", { href: st.parsed?.href, msg: (st.parsed?.text || "").slice(0, 120) });
  s = await snap(25);
  let contProc = refOf(s.text, /Continuar Processo/);
  if (contProc) await run(["browser", "click", contProc]);
  await sleep(2000);
}

if (aborted) saveAndExit({ ok: false, lead: leadResult }, 2);

beginPhase("capture");
await run([
  "browser",
  "navigate",
  "https://cruzeirodosul.myvtex.com/account#/minhas-inscricoes/",
]);
await sleep(2500);
s = await snap(40);
let acomp = refOf(s.text, /Acompanhar Inscrição/);
if (acomp) {
  await run(["browser", "click", acomp]);
  await sleep(1200);
}
const cap = await ev(`() => {
  const as = [...document.querySelectorAll('a')].filter(a => /acessar prova/i.test(a.textContent||''));
  const body = document.body.innerText || '';
  const inscr = (body.match(/\\d{10,}-\\d{2}/) || [])[0] || null;
  return { hrefs: as.map(a => a.href), has: /Acessar prova/i.test(body), inscr };
}`);
provaHrefs = cap.parsed?.hrefs || [];
mark("CAPTURE", { msg: JSON.stringify(cap.parsed) });

saveAndExit(
  {
    ok: !!(leadResult.success && after?.parsed?.hasPolo),
    lead: {
      success: leadResult.success,
      elapsedMs: leadResult.elapsedMs,
      browserCalls: leadResult.browserCalls,
      writeBackend: leadResult.diagnostics?.writeBackend,
      valuesFound: leadResult.valuesFound,
    },
    funnel: {
      advancedToPolo: !!after?.parsed?.hasPolo,
      polo: poloText,
      orderOk,
      provaHrefs,
      inscr: cap.parsed?.inscr || null,
      cartEmpty: !!st?.parsed?.emptyCart,
    },
  },
  leadResult.success && after?.parsed?.hasPolo ? 0 : 2
);
