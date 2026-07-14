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

async function ev(fn) {
  const r = await run(["browser", "evaluate", "--fn", fn]);
  const text = (r.out || "").trim();
  const i = text.search(/[\{\[]/);
  if (i >= 0) {
    try {
      return JSON.parse(text.slice(i));
    } catch {}
  }
  return { raw: text };
}

await run(["browser", "focus", "t34"]);
const st = await ev(`() => ({
  href: location.href,
  hello: (document.body.innerText||'').match(/Olá[^\\n]{0,80}/)?.[0],
  hasPolo: /Selecione um Pa|Digite seu CEP/i.test(document.body.innerText||''),
  inputs: [...document.querySelectorAll('input')].filter(i => i.offsetParent && i.type !== 'hidden' && i.type !== 'checkbox').map(i => ({
    name: i.name, id: i.id, ph: i.placeholder, type: i.type, value: i.value,
    rect: (() => { const r=i.getBoundingClientRect(); return {top:Math.round(r.top), left:Math.round(r.left)}; })()
  })),
  btn: (() => {
    const b = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { text: b.textContent.trim(), top: Math.round(r.top), disabled: b.disabled };
  })()
})`);
console.log(JSON.stringify(st, null, 2));

const snap = await run(["browser", "snapshot", "--efficient", "--limit", "40"]);
console.log("---");
console.log(snap.out);
