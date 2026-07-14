import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { fillLeadForm } from "./helpers/fillLeadForm.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const mjs = path.join(
  process.env.APPDATA,
  "npm",
  "node_modules",
  "openclaw",
  "openclaw.mjs"
);

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

const NOME = "Gabo Loko Pedreira";

await run(["browser", "focus", "t34"]);
await run([
  "browser",
  "navigate",
  "https://cruzeirodosul.myvtex.com/grad-pedagogia-semipresencial-cruzeiro-do-sul-virtual/p",
]);
await sleep(5000);

const lead = await fillLeadForm(
  {
    nome: NOME,
    email: "gaboloko@gmail.com",
    telefone: "11987124916",
  },
  { run }
);
console.log("tx", lead.success, lead.valuesFound);

// blur name to trigger validation clear
await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
    const near = (name) => [...document.querySelectorAll('input[name=\"'+name+'\"]')].filter(i=>i.offsetParent)
      .sort((a,b)=>Math.abs(a.getBoundingClientRect().top-btn.getBoundingClientRect().top)-Math.abs(b.getBoundingClientRect().top-btn.getBoundingClientRect().top))[0];
    const n = near('completeName');
    n.focus();
    n.dispatchEvent(new Event('blur',{bubbles:true}));
    const form = document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form');
    return { formText: (form&&form.innerText||'').slice(0,500), value: n.value };
  }`,
]);

const snap = await run(["browser", "snapshot", "--efficient", "--limit", "40"]);
const text = snap.out || "";
const find = (re) => {
  for (const line of text.split(/\n/)) {
    if (re.test(line)) {
      const m = line.match(/\[ref=(e\d+)\]/);
      if (m) return m[1];
    }
  }
  return null;
};
const fields = [];
const nome = find(/textbox \"Nome completo/i);
const email = find(/textbox \"E-mail/i);
const tel = find(/textbox \"Telefone\"/);
const check = find(/checkbox.*Privacidade|checkbox \"Estou de acordo/);
if (nome) fields.push({ ref: nome, value: NOME });
if (email) fields.push({ ref: email, value: "gaboloko@gmail.com" });
if (tel) fields.push({ ref: tel, value: "11987124916" });
await run(["browser", "fill", "--fields", JSON.stringify(fields)]);
if (check) await run(["browser", "click", check]);
const btn = find(/button \"Inscreva-se\"/);
console.log("clicking", btn);
if (btn) await run(["browser", "click", btn]);
await sleep(4000);

const after = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const form = document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form');
    return {
      hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||''),
      formText: (form&&form.innerText||'').slice(0,800)
    };
  }`,
]);
console.log("AFTER", after.out || after.err);
