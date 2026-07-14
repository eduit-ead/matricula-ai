import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const mjs = path.join(
  process.env.APPDATA,
  "npm",
  "node_modules",
  "openclaw",
  "openclaw.mjs"
);
const root = process.cwd();

function run(args) {
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
    child.on("exit", (code) => resolve({ code, out, err }));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const refOf = (text, re) => {
  for (const line of text.split(/\n/)) {
    if (re.test(line)) {
      const m = line.match(/\[ref=(e\d+)\]/);
      if (m) return m[1];
    }
  }
  return null;
};

const DATA = {
  email: "gaboloko@gmail.com",
  cep: "05001200",
  estado: "São Paulo",
  cidade: "São Paulo",
  first: "Gabo",
  last: "Loko",
  cpf: "50928152057",
  telefone: "11987124916",
  birth: "1999-09-09",
};

const t0 = Date.now();
const log = [];
const mark = (step, extra = {}) => {
  const e = { t: Math.round((Date.now() - t0) / 1000), step, ...extra };
  log.push(e);
  console.log(`[${e.t}s] ${step}`, extra.msg || extra.href || "");
};

await run(["browser", "focus", "t34"]);
let st = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => ({ href: location.href, text: (document.body.innerText||'').slice(0,500) })`,
]);
mark("WHERE", { msg: (st.out || "").slice(0, 300) });

let s = await run(["browser", "snapshot", "--efficient", "--limit", "120"]);
console.log(
  (s.out || "")
    .split(/\n/)
    .filter((l) => /combobox|textbox|button|option|Pa|CEP|Polo|Estado|Cidade|Continuar|condi/i.test(l))
    .slice(0, 50)
    .join("\n")
);

let pais = refOf(s.out || "", /combobox \"Selecione um Pa/);
if (pais) {
  await run(["browser", "select", pais, "Brasil"]);
  mark("PAIS");
}
await sleep(800);
s = await run(["browser", "snapshot", "--efficient", "--limit", "120"]);
let cep = refOf(s.out || "", /textbox \"Digite seu CEP\"/);
if (cep) {
  await run([
    "browser",
    "fill",
    "--fields",
    JSON.stringify([{ ref: cep, value: DATA.cep }]),
  ]);
  mark("CEP");
}
await sleep(600);
s = await run(["browser", "snapshot", "--efficient", "--limit", "120"]);
let estado = refOf(s.out || "", /combobox \"Selecione um Estado\"/);
if (estado) {
  await run(["browser", "select", estado, DATA.estado]);
  mark("ESTADO");
}
await sleep(1500);
s = await run(["browser", "snapshot", "--efficient", "--limit", "150"]);
let cidade = refOf(s.out || "", /combobox \"Selecione uma Cidade\"/);
if (cidade) {
  await run(["browser", "select", cidade, DATA.cidade]);
  mark("CIDADE");
}
await sleep(2000);
s = await run(["browser", "snapshot", "--efficient", "--limit", "220"]);
const poloLines = (s.out || "")
  .split(/\n/)
  .filter((l) => /option/.test(l) || /Polo|Freguesia|combobox/.test(l));
console.log("POLO_LINES", poloLines.slice(0, 40).join("\n"));
const poloText = (s.out || "")
  .split(/\n/)
  .find((l) => /option/.test(l) && /Freguesia/i.test(l))
  ?.match(/option \"([^\"]+)/)?.[1];
let polo = refOf(s.out || "", /combobox \"Selecione um Polo\"/);
if (polo && poloText) {
  await run(["browser", "select", polo, poloText]);
  mark("POLO", { msg: poloText });
} else {
  // try any polo option
  const anyPolo = (s.out || "")
    .split(/\n/)
    .find((l) => /option \"/.test(l) && !/Selecione/.test(l));
  const anyText = anyPolo?.match(/option \"([^\"]+)/)?.[1];
  if (polo && anyText) {
    await run(["browser", "select", polo, anyText]);
    mark("POLO_FALLBACK", { msg: anyText });
  } else mark("POLO_FAIL", { msg: "no option" });
}

s = await run(["browser", "snapshot", "--efficient", "--limit", "40"]);
let ver = refOf(s.out || "", /button \"Ver condição especial\"/);
if (ver) {
  await run(["browser", "click", ver]);
  mark("VER_COND");
}
await sleep(1500);
s = await run(["browser", "snapshot", "--efficient", "--limit", "50"]);
let ing = refOf(s.out || "", /combobox \"Selecione uma forma de ingresso\"/);
if (ing) {
  await run(["browser", "select", ing, "Vestibular Múltipla Escolha"]);
  mark("INGRESSO");
}
s = await run(["browser", "snapshot", "--efficient", "--limit", "50"]);
let nec = refOf(s.out || "", /combobox \"Possui alguma necessidade/);
if (nec) {
  await run([
    "browser",
    "select",
    nec,
    "Não necessito de condições especiais",
  ]);
  mark("NEC");
}
s = await run(["browser", "snapshot", "--efficient", "--limit", "30"]);
let cont = refOf(s.out || "", /button \"Continuar inscrição\"/);
if (cont) {
  await run(["browser", "click", cont]);
  mark("CONTINUAR");
}
await sleep(4000);
st = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => ({ href: location.href })`,
]);
mark("CHECKOUT", { href: JSON.parse((st.out || "{}").replace(/^[^{]*/, "") || "{}").href || (st.out || "").slice(0, 120) });

const href = (st.out || "");
if (/checkout/.test(href)) {
  await run([
    "browser",
    "navigate",
    "https://cruzeirodosul.myvtex.com/checkout/#/profile",
  ]);
  await sleep(1500);
  await run([
    "browser",
    "evaluate",
    "--fn",
    `() => {
      const set=(el,v)=>{ if(!el) return; const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); el.dispatchEvent(new Event('blur',{bubbles:true})); };
      set(document.getElementById('client-first-name'), ${JSON.stringify(DATA.first)});
      set(document.getElementById('client-last-name'), ${JSON.stringify(DATA.last)});
      set(document.getElementById('client-document'), ${JSON.stringify(DATA.cpf)});
      set(document.getElementById('client-phone'), ${JSON.stringify(DATA.telefone)});
      set(document.getElementById('client-birthDate'), ${JSON.stringify(DATA.birth)});
      return true;
    }`,
  ]);
  s = await run(["browser", "snapshot", "--efficient", "--limit", "25"]);
  let ir = refOf(s.out || "", /button \"Ir para o Endereço\"/);
  if (ir) await run(["browser", "click", ir]);
  await sleep(2000);
  st = await run([
    "browser",
    "evaluate",
    "--fn",
    `() => ({ href: location.href })`,
  ]);
  if (!/#\/shipping/.test(st.out || "")) {
    await run([
      "browser",
      "navigate",
      "https://cruzeirodosul.myvtex.com/checkout/#/shipping",
    ]);
    await sleep(1500);
  }
  s = await run(["browser", "snapshot", "--efficient", "--limit", "30"]);
  cep = refOf(s.out || "", /textbox \"CEP/);
  if (cep)
    await run([
      "browser",
      "fill",
      "--fields",
      JSON.stringify([{ ref: cep, value: DATA.cep }]),
    ]);
  await sleep(1200);
  s = await run(["browser", "snapshot", "--efficient", "--limit", "25"]);
  let sem = refOf(s.out || "", /checkbox \"Sem número\"/);
  if (sem) await run(["browser", "click", sem]);
  s = await run(["browser", "snapshot", "--efficient", "--limit", "20"]);
  let go = refOf(s.out || "", /Prosseguir|Ir para o pagamento/);
  if (go) await run(["browser", "click", go]);
  await sleep(2000);
  s = await run(["browser", "snapshot", "--efficient", "--limit", "20"]);
  cont = refOf(s.out || "", /button \"Continuar Inscrição\"/);
  if (cont) await run(["browser", "click", cont]);
  await sleep(4500);
  st = await run([
    "browser",
    "evaluate",
    "--fn",
    `() => ({ href: location.href, text: (document.body.innerText||'').slice(0,300) })`,
  ]);
  mark("ORDER", { msg: (st.out || "").slice(0, 200) });
  s = await run(["browser", "snapshot", "--efficient", "--limit", "25"]);
  let contProc = refOf(s.out || "", /Continuar Processo/);
  if (contProc) await run(["browser", "click", contProc]);
  await sleep(2500);
  await run([
    "browser",
    "navigate",
    "https://cruzeirodosul.myvtex.com/account#/minhas-inscricoes/",
  ]);
  await sleep(2500);
  s = await run(["browser", "snapshot", "--efficient", "--limit", "40"]);
  let acomp = refOf(s.out || "", /Acompanhar Inscrição/);
  if (acomp) await run(["browser", "click", acomp]);
  await sleep(1200);
  const cap = await run([
    "browser",
    "evaluate",
    "--fn",
    `() => {
      const as = [...document.querySelectorAll('a')].filter(a => /acessar prova/i.test(a.textContent||''));
      return { hrefs: as.map(a => a.href), has: /Acessar prova/i.test(document.body.innerText||'') };
    }`,
  ]);
  mark("CAPTURE", { msg: (cap.out || "").slice(0, 400) });
}

const prev = JSON.parse(
  fs.readFileSync(path.join(root, "measure-lead-transaction.json"), "utf8")
);
prev.continuation = { log, elapsedSec: Math.round((Date.now() - t0) / 1000) };
prev.ok = !!(log.find((e) => e.step === "CAPTURE") || log.find((e) => e.step === "ORDER"));
fs.writeFileSync(
  path.join(root, "measure-lead-transaction.json"),
  JSON.stringify(prev, null, 2)
);
console.log("done", JSON.stringify(log, null, 2));
