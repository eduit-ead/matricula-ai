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

await run(["browser", "focus", "t34"]);
let s = await run(["browser", "snapshot", "--efficient", "--limit", "80"]);
console.log(
  (s.out || "")
    .split(/\n/)
    .filter((l) => /combobox|option|button \"Continuar|ingresso|forma/i.test(l))
    .slice(0, 60)
    .join("\n")
);

let ing = refOf(s.out || "", /combobox \"Selecione uma forma de ingresso\"/);
if (ing) {
  await run(["browser", "select", ing, "Vestibular Múltipla Escolha"]);
  console.log("selected ingresso");
}
await sleep(800);
s = await run(["browser", "snapshot", "--efficient", "--limit", "80"]);
let nec = refOf(s.out || "", /combobox \"Possui alguma necessidade/);
if (nec) {
  await run([
    "browser",
    "select",
    nec,
    "Não necessito de condições especiais",
  ]);
  console.log("selected nec");
}
await sleep(500);
s = await run(["browser", "snapshot", "--efficient", "--limit", "40"]);
console.log(
  (s.out || "")
    .split(/\n/)
    .filter((l) => /combobox|Continuar|selected|option.*Múltipla|option.*Não/i.test(l))
    .slice(0, 30)
    .join("\n")
);

const cont = refOf(s.out || "", /button \"Continuar inscrição\"/);
await run(["browser", "click", cont]);
await sleep(6000);

let st = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => ({
    href: location.href,
    hasCart: /checkout|cart|orderForm/i.test(location.href + document.body.innerText),
    text: (document.body.innerText||'').match(/.{0,30}(erro|inválid|obrigat|checkout|carrinho).{0,40}/gi)
  })`,
]);
console.log("AFTER_CLICK", st.out || st.err);

// try navigate checkout directly if add-to-cart happened
await run([
  "browser",
  "navigate",
  "https://cruzeirodosul.myvtex.com/checkout/#/profile",
]);
await sleep(2500);
st = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => ({
    href: location.href,
    hasProfile: !!document.getElementById('client-first-name'),
    text: (document.body.innerText||'').slice(0,400)
  })`,
]);
console.log("CHECKOUT", st.out || st.err);

const DATA = {
  first: "Gabo",
  last: "Loko",
  cpf: "50928152057",
  telefone: "11987124916",
  birth: "1999-09-09",
  cep: "05001200",
};

if (/client-first-name|profile|checkout/i.test(st.out || "")) {
  await run([
    "browser",
    "evaluate",
    "--fn",
    `() => {
      const set=(el,v)=>{ if(!el) return false; const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); el.dispatchEvent(new Event('blur',{bubbles:true})); return true; };
      return {
        first: set(document.getElementById('client-first-name'), ${JSON.stringify(DATA.first)}),
        last: set(document.getElementById('client-last-name'), ${JSON.stringify(DATA.last)}),
        doc: set(document.getElementById('client-document'), ${JSON.stringify(DATA.cpf)}),
        phone: set(document.getElementById('client-phone'), ${JSON.stringify(DATA.telefone)}),
        birth: set(document.getElementById('client-birthDate'), ${JSON.stringify(DATA.birth)})
      };
    }`,
  ]);
  s = await run(["browser", "snapshot", "--efficient", "--limit", "30"]);
  let ir = refOf(s.out || "", /button \"Ir para o Endereço\"/);
  if (ir) await run(["browser", "click", ir]);
  await sleep(2500);
  await run([
    "browser",
    "navigate",
    "https://cruzeirodosul.myvtex.com/checkout/#/shipping",
  ]);
  await sleep(2000);
  s = await run(["browser", "snapshot", "--efficient", "--limit", "40"]);
  let cep = refOf(s.out || "", /textbox \"CEP/);
  if (cep)
    await run([
      "browser",
      "fill",
      "--fields",
      JSON.stringify([{ ref: cep, value: DATA.cep }]),
    ]);
  await sleep(1500);
  s = await run(["browser", "snapshot", "--efficient", "--limit", "30"]);
  let sem = refOf(s.out || "", /checkbox \"Sem número\"/);
  if (sem) await run(["browser", "click", sem]);
  s = await run(["browser", "snapshot", "--efficient", "--limit", "25"]);
  let go = refOf(s.out || "", /Prosseguir|Ir para o pagamento/);
  if (go) await run(["browser", "click", go]);
  await sleep(2500);
  s = await run(["browser", "snapshot", "--efficient", "--limit", "25"]);
  let cont2 = refOf(s.out || "", /button \"Continuar Inscrição\"/);
  if (cont2) await run(["browser", "click", cont2]);
  await sleep(5000);
  st = await run([
    "browser",
    "evaluate",
    "--fn",
    `() => ({ href: location.href, text: (document.body.innerText||'').slice(0,400) })`,
  ]);
  console.log("ORDER", st.out || st.err);

  s = await run(["browser", "snapshot", "--efficient", "--limit", "30"]);
  let contProc = refOf(s.out || "", /Continuar Processo/);
  if (contProc) await run(["browser", "click", contProc]);
  await sleep(2500);
  await run([
    "browser",
    "navigate",
    "https://cruzeirodosul.myvtex.com/account#/minhas-inscricoes/",
  ]);
  await sleep(3000);
  s = await run(["browser", "snapshot", "--efficient", "--limit", "50"]);
  let acomp = refOf(s.out || "", /Acompanhar Inscrição/);
  if (acomp) await run(["browser", "click", acomp]);
  await sleep(1500);
  const cap = await run([
    "browser",
    "evaluate",
    "--fn",
    `() => {
      const as = [...document.querySelectorAll('a')].filter(a => /acessar prova/i.test(a.textContent||''));
      return { hrefs: as.map(a => a.href), has: /Acessar prova/i.test(document.body.innerText||'') };
    }`,
  ]);
  console.log("CAPTURE", cap.out || cap.err);

  const prev = JSON.parse(
    fs.readFileSync(path.join(root, "measure-lead-transaction.json"), "utf8")
  );
  prev.capture = JSON.parse(
    ((cap.out || "").match(/\{[\s\S]*\}/) || ["null"])[0]
  );
  prev.ok = !!(prev.capture && prev.capture.hrefs && prev.capture.hrefs.length);
  fs.writeFileSync(
    path.join(root, "measure-lead-transaction.json"),
    JSON.stringify(prev, null, 2)
  );
}
