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

const fn = `() => {
  const inputs = [...document.querySelectorAll('input')].filter(i => i.type !== 'hidden').map(i => ({
    name: i.name, id: i.id, ph: i.placeholder, value: i.value, type: i.type,
    required: i.required, validity: i.validationMessage, disabled: i.disabled,
    ariaInvalid: i.getAttribute('aria-invalid'),
    className: i.className,
    visible: !!i.offsetParent
  }));
  const errors = [...document.querySelectorAll('.error, .help.error, .vtex-input__error, [class*=\"error\"], [class*=\"Error\"], .span[role=alert], [role=alert]')]
    .map(e => (e.textContent || '').trim()).filter(Boolean).slice(0, 20);
  const buttons = [...document.querySelectorAll('button')].filter(b => /endereço|address|sim|não/i.test(b.textContent||''))
    .map(b => ({ text: (b.textContent||'').trim(), disabled: b.disabled, className: b.className }));
  return { href: location.href, inputs: inputs.filter(i => i.visible).slice(0, 25), errors, buttons };
}`;

const r = await run(["browser", "evaluate", "--fn", fn]);
console.log(r.out || r.err);
