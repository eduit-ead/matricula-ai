import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const mjs = path.join(
  process.env.APPDATA,
  "npm",
  "node_modules",
  "openclaw",
  "openclaw.mjs"
);

const DATA = {
  nome: "Gabo Loko",
  email: "gaboloko@gmail.com",
  telefone: "11987124916",
  cep: "05001200",
  estado: "São Paulo",
  cidade: "São Paulo",
  first: "Gabo",
  last: "Loko",
  cpf: "50928152057",
  birth: "1999-09-09",
};

const t0 = Date.now();
const timeline = [];
let last = t0;
const mark = (step, extra = {}) => {
  const now = Date.now();
  const e = { t: Math.round((now - t0) / 1000), dtMs: now - last, step, ...extra };
  last = now;
  timeline.push(e);
  console.log(`[+${e.dtMs}ms | ${e.t}s] ${step}`, extra.why || extra.msg || extra.href || "");
};

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [mjs, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", (code) => resolve({ code, out, err, ms: 0 }));
  }).then(async (r) => r);
}

// patch run to include ms
function run2(args) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [mjs, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
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
  const r = await run2(["browser", "evaluate", "--fn", fn]);
  const text = (r.out || "").trim();
  const i = text.search(/[\{\[]/);
  let parsed = null;
  if (i >= 0) {
    try {
      parsed = JSON.parse(text.slice(i));
    } catch {}
  }
  return { parsed, ms: r.ms };
}

async function snap(limit = 50) {
  const r = await run2([
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
      if (m) return { ref: m[1], line: line.trim() };
    }
  }
  return null;
}

const sleep = (ms, why) => {
  mark("WAIT", { why, msg: ms + "ms" });
  return new Promise((r) => setTimeout(r, ms));
};

await run2(["browser", "focus", "t34"]);
mark("FOCUS", { why: "já logado + PDP" });

// Ensure PDP
let st = await ev(`() => ({ href: location.href, ola: /Olá/i.test(document.body.innerText||'') })`);
if (!/grad-pedagogia/.test(st.parsed?.href || "")) {
  await run2([
    "browser",
    "navigate",
    "https://cruzeirodosul.myvtex.com/grad-pedagogia-semipresencial-cruzeiro-do-sul-virtual/p",
  ]);
  await sleep(2500, "PDP load");
}
mark("PDP", { href: (await ev(`() => ({href:location.href})`)).parsed?.href });

// Fill via openclaw fill (React-friendly) using snapshot refs
let s = await snap(40);
mark("SNAP", { why: "refs lead", msg: `cli=${s.ms}ms` });
const nome = refOf(s.text, /textbox \"Nome completo|textbox \"Nome Completo|textbox \"Nome completo Nome/);
const email = refOf(s.text, /textbox \"E-mail E-mail|textbox \"E-mail\"/);
const tel = refOf(s.text, /textbox \"Telefone\"/);
const check = refOf(s.text, /checkbox.*Privacidade|checkbox \"Estou de acordo/);
const btn = refOf(s.text, /button \"Inscreva-se\"/);
mark("REFS", {
  msg: JSON.stringify({
    nome: nome?.ref,
    email: email?.ref,
    tel: tel?.ref,
    check: check?.ref,
    btn: btn?.ref,
  }),
});

const fields = [];
if (nome) fields.push({ ref: nome.ref, value: DATA.nome });
if (email) fields.push({ ref: email.ref, value: DATA.email });
if (tel) fields.push({ ref: tel.ref, value: DATA.telefone });
const fr = await run2(["browser", "fill", "--fields", JSON.stringify(fields)]);
mark("FILL", { why: "openclaw fill React", msg: (fr.out || fr.err || "").slice(0, 120) + ` cli=${fr.ms}ms` });

if (check && !/\[checked\]/.test(check.line)) {
  await run2(["browser", "click", check.ref]);
  mark("TERMS", { why: "aceitar privacidade" });
}

if (btn) {
  await run2(["browser", "click", btn.ref]);
  mark("CTA", { why: "Inscreva-se button ref " + btn.ref });
}
await sleep(2000, "aguardar polo UI");

st = await ev(`() => ({
  href: location.href,
  hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||''),
  bodySlice: (document.body.innerText||'').includes('Ver condição especial')
})`);
mark("AFTER_LEAD", { msg: JSON.stringify(st.parsed) });

if (!st.parsed?.hasPolo) {
  // try one more click after brief wait
  s = await snap(40);
  const btn2 = refOf(s.text, /button \"Inscreva-se\"/);
  if (btn2) await run2(["browser", "click", btn2.ref]);
  await sleep(2500, "retry CTA");
  st = await ev(`() => ({ hasPolo: /Selecione um Pa|Digite seu CEP/i.test(document.body.innerText||'') })`);
  mark("RETRY", { msg: JSON.stringify(st.parsed) });
}

if (!st.parsed?.hasPolo) {
  fs.writeFileSync(
    "run-timing-pedagogia.json",
    JSON.stringify({ ok: false, reason: "lead_blocked", timeline }, null, 2)
  );
  console.log("ABORT lead");
  process.exit(4);
}

// Location fast path
s = await snap(70);
let pais = refOf(s.text, /combobox \"Selecione um Pa/);
if (pais) await run2(["browser", "select", pais.ref, "Brasil"]);
mark("BRASIL", { why: "select" });
await sleep(600, "estado options");

s = await snap(70);
let cep = refOf(s.text, /textbox \"Digite seu CEP\"/);
if (cep)
  await run2([
    "browser",
    "fill",
    "--fields",
    JSON.stringify([{ ref: cep.ref, value: DATA.cep }]),
  ]);
let estado = refOf(s.text, /combobox \"Selecione um Estado\"/);
if (estado) await run2(["browser", "select", estado.ref, DATA.estado]);
mark("UF_CEP");
await sleep(1200, "cidades");

s = await snap(120);
let cidade = refOf(s.text, /combobox \"Selecione uma Cidade\"/);
if (cidade) await run2(["browser", "select", cidade.ref, DATA.cidade]);
mark("CIDADE");
await sleep(1800, "polos API");

s = await snap(200);
mark("SNAP_POLO", { why: "lista grande", msg: `cli=${s.ms}ms` });
const poloText = s.text
  .split(/\n/)
  .find((l) => /option/.test(l) && /Freguesia/i.test(l))
  ?.match(/option \"([^\"]+)/)?.[1];
let polo = refOf(s.text, /combobox \"Selecione um Polo\"/);
mark("POLO", { msg: poloText || "NOT_FOUND" });
if (polo && poloText) await run2(["browser", "select", polo.ref, poloText]);

s = await snap(25);
let ver = refOf(s.text, /button \"Ver condição especial\"/);
if (ver) await run2(["browser", "click", ver.ref]);
mark("VER_COND");
await sleep(1200, "ingresso");

s = await snap(40);
let ing = refOf(s.text, /combobox \"Selecione uma forma de ingresso\"/);
if (ing) await run2(["browser", "select", ing.ref, "Vestibular Múltipla Escolha"]);
s = await snap(40);
let nec = refOf(s.text, /combobox \"Possui alguma necessidade/);
if (nec)
  await run2([
    "browser",
    "select",
    nec.ref,
    "Não necessito de condições especiais",
  ]);
s = await snap(20);
let cont = refOf(s.text, /button \"Continuar inscrição\"/);
if (cont) await run2(["browser", "click", cont.ref]);
mark("INGRESSO");
await sleep(3500, "checkout redirect");

st = await ev(`() => ({ href: location.href })`);
mark("CHECKOUT", { href: st.parsed?.href });
if (!/checkout/.test(st.parsed?.href || "")) {
  fs.writeFileSync(
    "run-timing-pedagogia.json",
    JSON.stringify({ ok: false, reason: "no_checkout", timeline }, null, 2)
  );
  process.exit(5);
}

await run2(["browser", "navigate", "https://cruzeirodosul.myvtex.com/checkout/#/profile"]);
await sleep(1500, "profile");

await ev(`() => {
  const set=(el,v)=>{ if(!el) return; const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); el.dispatchEvent(new Event('blur',{bubbles:true})); };
  set(document.getElementById('client-first-name'), ${JSON.stringify(DATA.first)});
  set(document.getElementById('client-last-name'), ${JSON.stringify(DATA.last)});
  set(document.getElementById('client-document'), ${JSON.stringify(DATA.cpf)});
  set(document.getElementById('client-phone'), ${JSON.stringify(DATA.telefone)});
  set(document.getElementById('client-birthDate'), ${JSON.stringify(DATA.birth)});
  return true;
}`);
mark("PROFILE");
s = await snap(20);
let ir = refOf(s.text, /button \"Ir para o Endereço\"/);
if (ir) await run2(["browser", "click", ir.ref]);
await sleep(2000, "shipping");

st = await ev(`() => ({ href: location.href })`);
if (!/#\/shipping/.test(st.parsed?.href || "")) {
  await run2(["browser", "navigate", "https://cruzeirodosul.myvtex.com/checkout/#/shipping"]);
  await sleep(1500, "force shipping");
}

s = await snap(30);
cep = refOf(s.text, /textbox \"CEP/);
if (cep)
  await run2([
    "browser",
    "fill",
    "--fields",
    JSON.stringify([{ ref: cep.ref, value: DATA.cep }]),
  ]);
await sleep(1200, "CEP resolve");
s = await snap(25);
let sem = refOf(s.text, /checkbox \"Sem número\"/);
if (sem) await run2(["browser", "click", sem.ref]);
s = await snap(20);
let go = refOf(s.text, /Prosseguir|Ir para o pagamento/);
if (go) await run2(["browser", "click", go.ref]);
mark("SHIP_DONE");
await sleep(2000, "payment");

s = await snap(20);
cont = refOf(s.text, /button \"Continuar Inscrição\"/);
if (cont) await run2(["browser", "click", cont.ref]);
mark("PAY");
await sleep(4500, "orderPlaced");

st = await ev(`() => ({ href: location.href, text: (document.body.innerText||'').slice(0,350) })`);
mark("ORDER", { href: st.parsed?.href, msg: (st.parsed?.text || "").slice(0, 160) });

s = await snap(25);
let contProc = refOf(s.text, /Continuar Processo/);
if (contProc) await run2(["browser", "click", contProc.ref]);
await sleep(2500, "account");

await run2([
  "browser",
  "navigate",
  "https://cruzeirodosul.myvtex.com/account#/minhas-inscricoes/",
]);
await sleep(2500, "inscricoes");
s = await snap(40);
let acomp = refOf(s.text, /Acompanhar Inscrição/);
if (acomp) await run2(["browser", "click", acomp.ref]);
await sleep(1200, "painel");

const cap = await ev(`() => {
  const as = [...document.querySelectorAll('a')].filter(a => /acessar prova/i.test(a.textContent||''));
  return { hrefs: as.map(a => a.href), has: /Acessar prova/i.test(document.body.innerText||''), page: location.href };
}`);
mark("CAPTURE", { why: "somente copiar URL", msg: JSON.stringify(cap.parsed) });

const artifact = {
  ok: !!cap.parsed?.hrefs?.[0],
  provaUrl: cap.parsed?.hrefs?.[0] || null,
  elapsedSec: Math.round((Date.now() - t0) / 1000),
  data: DATA,
  timeline,
};
fs.writeFileSync("run-timing-pedagogia.json", JSON.stringify(artifact, null, 2));
console.log("\n=== ARTIFACT ===");
console.log(JSON.stringify(artifact, null, 2));
