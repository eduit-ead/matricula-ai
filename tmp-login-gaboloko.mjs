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

// Find content tab on /graduacao
const tabs = (await run(["browser", "tabs"])).out || "";
const candidates = [];
for (const line of tabs.split(/\n/)) {
  const m = line.match(/\[use: (t\d+)/);
  if (m) candidates.push(m[1]);
}
for (const id of [...new Set(candidates)]) {
  await run(["browser", "focus", id]);
  const st = await ev(
    `() => ({ href: location.href, hasEntrar: /Entrar como cliente/i.test(document.body.innerText||'') })`
  );
  if (st.href === "https://cruzeirodosul.myvtex.com/graduacao" || (st.href || "").includes("/graduacao")) {
    if (!/recaptcha|doubleclick|gtm|fls/.test(st.href || "")) {
      console.log("FOCUSED", id, st);
      break;
    }
  }
}

// Open client login ONLY (telemarketing loginButton) — do not touch attendant
const open = await ev(`() => {
  const btn = document.querySelector('.cruzeirodosul-telemarketing-2-x-loginButton');
  if (!btn) return { ok:false, reason:'no loginButton', texts: [...document.querySelectorAll('button,a')].map(e=>(e.textContent||'').trim()).filter(t=>/entrar|cliente|atendente/i.test(t)).slice(0,10) };
  btn.click();
  return { ok:true, text: (btn.textContent||'').trim() };
}`);
console.log("OPEN", open);
await new Promise((r) => setTimeout(r, 1500));

const fill = await ev(`() => {
  const input = [...document.querySelectorAll('input')].find(i =>
    /example@mail|mail\\.com|e-?mail/i.test(i.placeholder||'') || i.type === 'email'
  );
  if (!input) {
    return { ok:false, inputs: [...document.querySelectorAll('input')].filter(i=>i.offsetParent).map(i=>({ph:i.placeholder,t:i.type,id:i.id})) };
  }
  const email = 'gaboloko@gmail.com';
  const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  d.set.call(input, email);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  const enter = [...document.querySelectorAll('button')].find(b => /^\\s*Entrar\\s*$/i.test(b.textContent||''));
  if (enter) enter.click();
  return { ok:true, value: input.value, clickedEnter: !!enter };
}`);
console.log("FILL", fill);
await new Promise((r) => setTimeout(r, 4000));

const check = await ev(`() => {
  const t = document.body.innerText || '';
  return {
    href: location.href,
    hasOla: /Olá/i.test(t),
    hasGabo: /gaboloko/i.test(t),
    stillEntrar: /Entrar como cliente/i.test(t),
    attendant: (t.match(/Atendente:[^\\n]+/)||[])[0] || null,
    hello: (t.match(/Olá[^\\n]{0,80}/)||[])[0] || null
  };
}`);
console.log("CHECK", JSON.stringify(check, null, 2));
