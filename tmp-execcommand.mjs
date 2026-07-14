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

await run(["browser", "focus", "t34"]);
await run([
  "browser",
  "navigate",
  "https://cruzeirodosul.myvtex.com/grad-pedagogia-semipresencial-cruzeiro-do-sul-virtual/p",
]);
await sleep(6000);

const r = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const form = document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form');
    const typeLike = (el, value) => {
      el.focus();
      el.select();
      const ok = document.execCommand('insertText', false, String(value));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      return { ok, value: el.value };
    };
    const n = typeLike(form.querySelector('input[name=completeName]'), 'Gabo Loko Pedreira');
    const e = typeLike(form.querySelector('input[name=email]'), 'gaboloko@gmail.com');
    const t = typeLike(form.querySelector('input[name=cellphone]'), '11987124916');
    const c = form.querySelector('input[type=checkbox]');
    if (c && !c.checked) c.click();
    return { n, e, t, checked: c && c.checked, formText: form.innerText.slice(0,400) };
  }`,
]);
console.log("FILL", r.out || r.err);

const snap = await run(["browser", "snapshot", "--efficient", "--limit", "30"]);
let ref = null;
for (const line of (snap.out || "").split(/\n/)) {
  if (/button \"Inscreva-se\"/.test(line)) {
    const m = line.match(/\[ref=(e\d+)\]/);
    if (m) ref = m[1];
  }
}
await run(["browser", "click", ref]);
await sleep(3500);
const after = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => ({
    hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||''),
    formText: ((document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form')||{}).innerText||'').slice(0,500)
  })`,
]);
console.log("AFTER", after.out || after.err);
