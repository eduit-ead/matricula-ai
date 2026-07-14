/**
 * Resume checkout + capture for gaboluku (after lead/polo already done).
 * Stops if a phase exceeds its budget.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
  first: "Gabriel",
  last: "Lkonte",
  cpf: "41018624007",
  birth: "1999-09-09",
  telefone: "11987124916",
  cep: "05001200",
};

const CALL_TIMEOUT_MS = 45000;
const PHASE_MAX_MS = { checkout: 180000, capture: 90000 };
const TOTAL_MAX_MS = 5 * 60 * 1000;

const t0 = Date.now();
const log = [];
let aborted = null;
let phaseStarted = Date.now();
let currentPhase = "init";
let s;
let st;

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
    aborted = { reason: "TOTAL_TIMEOUT", phase: currentPhase, totalMs: total };
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
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [mjs, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const started = Date.now();
    const kill = setTimeout(() => {
      try {
        p.kill();
      } catch {}
      resolve({
        code: -1,
        out,
        err: "CALL_TIMEOUT",
        ms: Date.now() - started,
        timedOut: true,
      });
    }, CALL_TIMEOUT_MS);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => {
      clearTimeout(kill);
      resolve({ code, out, err, ms: Date.now() - started, timedOut: false });
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function snap(max = 40) {
  const r = await run(["browser", "snapshot", "--interactive", "--max-chars", String(max * 1000)]);
  return { text: r.out || "", ...r };
}

async function ev(fnSrc) {
  const r = await run(["browser", "evaluate", "--fn", fnSrc]);
  let parsed = null;
  try {
    const m = (r.out || "").match(/\{[\s\S]*\}\s*$/);
    if (m) parsed = JSON.parse(m[0]);
  } catch {}
  return { ...r, parsed };
}

function refOf(text, re) {
  const line = (text || "").split(/\n/).find((l) => re.test(l));
  if (!line) return null;
  const m = line.match(/\be\d+\b/);
  return m ? m[0] : null;
}

function saveAndExit(payload, code = 0) {
  const out = {
    ...payload,
    aborted,
    metrics: {
      totalElapsedSec: Math.round((Date.now() - t0) / 1000),
    },
    log,
  };
  fs.writeFileSync(
    path.join(root, "measure-gaboluku-rh-resume.json"),
    JSON.stringify(out, null, 2)
  );
  console.log("\n=== SUMMARY ===\n" + JSON.stringify(out, null, 2));
  process.exit(code);
}

// Focus content tab
const tabs = await run(["browser", "tabs"]);
const tabLines = (tabs.out || "").split(/\n/);
const content =
  tabLines.find((l) => /myvtex\.com|cruzeirodosul/i.test(l) && !/service.?worker/i.test(l)) ||
  tabLines.find((l) => /\bt1\b/.test(l));
const tabId = content?.match(/\b(t\d+)\b/)?.[1];
if (tabId) {
  await run(["browser", "focus", tabId]);
  mark("FOCUS", { msg: tabId });
}

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
  hasProfile: !!document.getElementById('client-first-name'),
  text: (document.body.innerText||'').slice(0,400)
})`);
mark("CHECKOUT_PROFILE", { msg: JSON.stringify(st.parsed) });
if (aborted) saveAndExit({ ok: false }, 2);

let orderOk = false;
let provaHrefs = [];

if (st.parsed?.emptyCart) {
  mark("CART_EMPTY");
  saveAndExit({ ok: false, reason: "empty cart" }, 2);
}

if (st.parsed?.hasProfile || /checkout/i.test(st.parsed?.href || "")) {
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
  if (aborted) saveAndExit({ ok: false }, 2);
  s = await snap(35);
  let cep = refOf(s.text, /textbox \"CEP/);
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
  let cont = refOf(s.text, /button \"Continuar Inscrição\"/);
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

if (aborted) saveAndExit({ ok: false, orderOk }, 2);

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
  return { hrefs: as.map(a => a.href), has: /Acessar prova/i.test(body), inscr, snippet: body.slice(0,500) };
}`);
provaHrefs = cap.parsed?.hrefs || [];
mark("CAPTURE", { msg: JSON.stringify(cap.parsed) });

saveAndExit(
  {
    ok: orderOk || provaHrefs.length > 0,
    funnel: {
      orderOk,
      provaHrefs,
      inscr: cap.parsed?.inscr || null,
    },
  },
  orderOk || provaHrefs.length > 0 ? 0 : 2
);
