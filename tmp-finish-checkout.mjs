import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const mjs = path.join(process.env.APPDATA, "npm/node_modules/openclaw/openclaw.mjs");
const DATA = {
  first: "Gabo",
  last: "Loko",
  cpf: "50928152057",
  telefone: "11987124916",
  birth: "1999-09-09",
  cep: "05001200",
};

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [mjs, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", (code) => resolve({ code, out, err }));
  });
}
async function ev(source) {
  const r = await run(["browser", "evaluate", "--fn", source]);
  const text = (r.out || "").trim();
  const i = text.search(/[\{\[]/);
  if (i >= 0) {
    try {
      return JSON.parse(text.slice(i));
    } catch {}
  }
  return { raw: text };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function snap(n = 30) {
  return (await run(["browser", "snapshot", "--efficient", "--limit", String(n)])).out || "";
}
function refOf(t, re) {
  for (const line of t.split(/\n/)) {
    if (re.test(line)) {
      const m = line.match(/\[ref=(e\d+)\]/);
      if (m) return m[1];
    }
  }
  return null;
}

await run(["browser", "focus", "t34"]);
console.log(
  await ev(`() => {
  const cont = [...document.querySelectorAll('button')].find(b => /continuar inscri/i.test(b.textContent||'') && b.offsetParent);
  if (cont) cont.click();
  return { clicked: !!cont };
}`)
);
await sleep(7000);
let st = await ev(`() => ({ href: location.href })`);
console.log("AFTER_CONT", st);
if (!/checkout/.test(st.href || "")) {
  console.log("NO_CHECKOUT");
  process.exit(2);
}

await run([
  "browser",
  "navigate",
  "https://cruzeirodosul.myvtex.com/checkout/#/profile",
]);
await sleep(2000);
await ev(`() => {
  const set=(el,v)=>{ if(!el) return; const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); el.dispatchEvent(new Event('blur',{bubbles:true})); };
  set(document.getElementById('client-first-name'), 'Gabo');
  set(document.getElementById('client-last-name'), 'Loko');
  set(document.getElementById('client-document'), '50928152057');
  set(document.getElementById('client-phone'), '11987124916');
  set(document.getElementById('client-birthDate'), '1999-09-09');
  return true;
}`);
let s = await snap(25);
let ir = refOf(s, /button "Ir para o Endereço"/);
if (ir) await run(["browser", "click", ir]);
await sleep(2500);
st = await ev(`() => ({ href: location.href })`);
if (!/#\/shipping/.test(st.href || "")) {
  await run([
    "browser",
    "navigate",
    "https://cruzeirodosul.myvtex.com/checkout/#/shipping",
  ]);
  await sleep(2000);
}
s = await snap(30);
let cep = refOf(s, /textbox "CEP/);
if (cep)
  await run([
    "browser",
    "fill",
    "--fields",
    JSON.stringify([{ ref: cep, value: DATA.cep }]),
  ]);
await sleep(1500);
s = await snap(25);
let sem = refOf(s, /checkbox "Sem número"/);
if (sem) await run(["browser", "click", sem]);
s = await snap(20);
let go = refOf(s, /Prosseguir|Ir para o pagamento/);
if (go) await run(["browser", "click", go]);
await sleep(2500);
s = await snap(20);
let cont = refOf(s, /button "Continuar Inscrição"/);
if (cont) await run(["browser", "click", cont]);
await sleep(5000);
st = await ev(
  `() => ({ href: location.href, text: (document.body.innerText||'').slice(0,400) })`
);
console.log("ORDER", st);
s = await snap(25);
let contProc = refOf(s, /Continuar Processo/);
if (contProc) await run(["browser", "click", contProc]);
await sleep(3000);
await run([
  "browser",
  "navigate",
  "https://cruzeirodosul.myvtex.com/account#/minhas-inscricoes/",
]);
await sleep(3000);
s = await snap(40);
let acomp = refOf(s, /Acompanhar Inscrição/);
if (acomp) await run(["browser", "click", acomp]);
await sleep(1500);
const cap = await ev(`() => {
  const as = [...document.querySelectorAll('a')].filter(a => /acessar prova/i.test(a.textContent||''));
  return { hrefs: as.map(a => a.href), has: /Acessar prova/i.test(document.body.innerText||'') };
}`);
console.log("CAPTURE", cap);
fs.writeFileSync(
  "measure-fillLeadForm-artifact.json",
  JSON.stringify({ order: st, prova: cap }, null, 2)
);
