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

await run(["browser", "focus", "t34"]);

const setBirth = `() => {
  const el = document.getElementById('client-birthDate');
  if (!el) return { ok: false, reason: 'missing' };
  const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  d.set.call(el, '1990-09-29');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  return { ok: true, value: el.value, validity: el.validationMessage, className: el.className };
}`;

let r = await run(["browser", "evaluate", "--fn", setBirth]);
console.log("BIRTH:", r.out || r.err);

r = await run(["browser", "snapshot", "--efficient", "--limit", "80"]);
console.log("SNAP:", r.out);
