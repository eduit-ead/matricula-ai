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
  return { raw: text, err: r.err };
}

await run(["browser", "focus", "t34"]);
// go back to PDP if needed
const st = await ev(`() => ({ href: location.href })`);
console.log("NOW", st);
if (!/grad-pedagogia/.test(st.href || "")) {
  await run([
    "browser",
    "navigate",
    "https://cruzeirodosul.myvtex.com/grad-pedagogia-semipresencial-cruzeiro-do-sul-virtual/p",
  ]);
  await new Promise((r) => setTimeout(r, 4000));
}

const info = await ev(`() => {
  const buttons = [...document.querySelectorAll('button,a')].filter(el => /inscreva-se/i.test(el.textContent||'')).map(el => ({
    tag: el.tagName, text: (el.textContent||'').trim().slice(0,40), href: el.href || null, cls: (el.className||'').toString().slice(0,100),
    near: (el.closest('form,section,div')?.innerText||'').slice(0,200)
  }));
  const inputs = [...document.querySelectorAll('input')].filter(i => i.offsetParent && i.type !== 'hidden' && i.type !== 'checkbox').map(i => ({
    ph: i.placeholder, name: i.name, id: i.id, type: i.type, value: i.value, cls: (i.className||'').toString().slice(0,80)
  }));
  const checks = [...document.querySelectorAll('input[type=checkbox]')].filter(c => c.offsetParent).map(c => ({
    checked: c.checked,
    label: (c.closest('label')?.innerText || c.parentElement?.innerText || '').replace(/\\s+/g,' ').slice(0,120)
  }));
  return { href: location.href, buttons, inputs, checks, hasPoloUI: /Selecione um Pa|Digite seu CEP/i.test(document.body.innerText||'') };
}`);
console.log(JSON.stringify(info, null, 2));

const snap = await run(["browser", "snapshot", "--efficient", "--limit", "60"]);
console.log("---SNAP---");
console.log(snap.out);
