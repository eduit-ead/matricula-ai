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

const inspect = await ev(`() => {
  const root = document.querySelector('[class*=\"telemarketing\"]') || document.body;
  const html = [...document.querySelectorAll('[class*=\"telemarketing\"]')].map(e => ({
    cls: e.className,
    text: (e.innerText||'').slice(0,300),
    tag: e.tagName
  })).slice(0,15);
  const inputs = [...document.querySelectorAll('input')].filter(i => i.offsetParent).map(i => ({
    ph: i.placeholder, type: i.type, id: i.id, name: i.name, value: i.value, cls: i.className
  }));
  const buttons = [...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => ({
    text: (b.textContent||'').trim().slice(0,60), cls: b.className.slice(0,80)
  })).filter(b => /entrar|cliente|login|ok|enviar/i.test(b.text + b.cls)).slice(0,20);
  return { html, inputs, buttons };
}`);
console.log(JSON.stringify(inspect, null, 2));

// snapshot refs
const snap = await run(["browser", "snapshot", "--efficient", "--limit", "40"]);
console.log("---SNAP---");
console.log(snap.out);
