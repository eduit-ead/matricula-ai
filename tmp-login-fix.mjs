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

// Fill ONLY telemarketing client email input; do not touch attendant
const fill = await ev(`() => {
  const portal = document.querySelector('.cruzeirodosul-telemarketing-2-x-portalContainer')
    || document.querySelector('.cruzeirodosul-telemarketing-2-x-popoverBox');
  const input = (portal && portal.querySelector('input'))
    || [...document.querySelectorAll('input')].find(i => (i.placeholder||'') === 'Ex: example@mail.com');
  if (!input) return { ok:false, reason:'no telemarketing input' };
  const email = 'gaboloko@gmail.com';
  const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  d.set.call(input, email);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  // clear mistaken popup email if filled
  const popupEmail = document.getElementById('email');
  if (popupEmail && popupEmail.value === email) {
    d.set.call(popupEmail, '');
    popupEmail.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return { ok:true, value: input.value, ph: input.placeholder, inPortal: !!(portal && portal.contains(input)) };
}`);
console.log("FILL", fill);

await run([
  "browser",
  "fill",
  "--fields",
  JSON.stringify([{ ref: "e64", value: "gaboloko@gmail.com" }]),
]);
await run(["browser", "click", "e65"]);
await new Promise((r) => setTimeout(r, 4500));

const check = await ev(`() => {
  const t = document.body.innerText || '';
  return {
    hasOla: /Olá/i.test(t),
    hasGabo: /gaboloko/i.test(t),
    stillEntrar: /Entrar como cliente/i.test(t),
    attendant: (t.match(/Atendente:[^\\n]+/)||[])[0],
    hello: (t.match(/Olá[^\\n]{0,100}/)||[])[0],
    teleVal: ([...document.querySelectorAll('input')].find(i => (i.placeholder||'') === 'Ex: example@mail.com')||{}).value || null
  };
}`);
console.log("CHECK", JSON.stringify(check, null, 2));
