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

await run(["browser", "focus", "t34"]);
await run([
  "browser",
  "navigate",
  "https://cruzeirodosul.myvtex.com/grad-pedagogia-semipresencial-cruzeiro-do-sul-virtual/p",
]);
await sleep(5000);

await fillLeadForm(
  {
    nome: "Gabo Loko Pedreira",
    email: "gaboloko@gmail.com",
    telefone: "11987124916",
  },
  { run }
);

const net = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    window.__leadNet = [];
    const origFetch = window.fetch;
    window.fetch = async function() {
      const args = arguments;
      const url = String(args[0] && args[0].url || args[0]);
      try {
        const res = await origFetch.apply(this, args);
        const clone = res.clone();
        let body = '';
        try { body = (await clone.text()).slice(0, 300); } catch(_){}
        window.__leadNet.push({ url, status: res.status, body });
        return res;
      } catch (e) {
        window.__leadNet.push({ url, err: String(e) });
        throw e;
      }
    };
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
    const form = btn.closest('form');
    const fpk = Object.keys(form||{}).find(k => k.startsWith('__reactProps'));
    const hasSubmit = !!(fpk && form[fpk] && form[fpk].onSubmit);
    // native submit
    if (typeof form.requestSubmit === 'function') form.requestSubmit(btn);
    else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return { hasSubmit, formAction: form.getAttribute('action'), method: form.method };
  }`,
]);
console.log("SUBMIT", net.out || net.err);
await sleep(5000);
const after = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => ({
    hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||''),
    net: window.__leadNet || [],
    formText: ((document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form')||{}).innerText||'').slice(0,800),
    btnText: ((document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1')||{}).textContent||'').trim()
  })`,
]);
console.log("AFTER", after.out || after.err);

// also try openclaw click ref
const snap = await run(["browser", "snapshot", "--efficient", "--limit", "30"]);
let ref = null;
for (const line of (snap.out || "").split(/\n/)) {
  if (/button \"Inscreva-se\"/.test(line)) {
    const m = line.match(/\[ref=(e\d+)\]/);
    if (m) ref = m[1];
  }
}
console.log("ref", ref);
if (ref) {
  await run(["browser", "click", ref]);
  await sleep(4000);
  const after2 = await run([
    "browser",
    "evaluate",
    "--fn",
    `() => ({
      hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||''),
      net: window.__leadNet || [],
      formText: ((document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form')||{}).innerText||'').slice(0,800)
    })`,
  ]);
  console.log("AFTER2", after2.out || after2.err);
}
