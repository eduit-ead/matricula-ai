import { spawn } from "child_process";
import path from "path";

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
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", (code) => resolve({ code, out, err }));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const find = (text, re) => {
  for (const line of text.split(/\n/)) {
    if (re.test(line)) {
      const m = line.match(/\[ref=(e\d+)\]/);
      if (m) return { ref: m[1], line: line.trim() };
    }
  }
  return null;
};

await run(["browser", "focus", "t34"]);
await run([
  "browser",
  "navigate",
  "https://cruzeirodosul.myvtex.com/grad-pedagogia-semipresencial-cruzeiro-do-sul-virtual/p",
]);
await sleep(6000);

// poison?
await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const form = document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form');
    const el = form.querySelector('input[name=completeName]');
    const pk = Object.keys(el).find(k => k.startsWith('__reactProps'));
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    desc.set.call(el, 'Gabo Loko Pedreira');
    el[pk].onChange({ target: { value: 'Gabo Loko Pedreira', name: 'completeName' }, persist(){} });
    return el.value;
  }`,
]);

const snap = await run(["browser", "snapshot", "--efficient", "--limit", "40"]);
const text = snap.out || "";
const nome = find(text, /textbox \"Nome completo/i);
const email = find(text, /textbox \"E-mail/i);
const tel = find(text, /textbox \"Telefone\"/);
const check = find(text, /checkbox \"Estou de acordo/);
const btn = find(text, /button \"Inscreva-se\"/);

await run([
  "browser",
  "fill",
  "--fields",
  JSON.stringify([
    { ref: nome.ref, value: "Gabo Loko Pedreira" },
    { ref: email.ref, value: "gaboloko@gmail.com" },
    { ref: tel.ref, value: "11987124916" },
  ]),
]);
if (check && !/\[checked\]/.test(check.line)) await run(["browser", "click", check.ref]);
await run(["browser", "click", btn.ref]);
await sleep(4000);
const after = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => ({
    hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||''),
    formText: ((document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form')||{}).innerText||'').slice(0,500)
  })`,
]);
console.log("AFTER_HEAL", after.out || after.err);
