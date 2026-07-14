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
    const pasteLike = (el, value) => {
      el.focus();
      el.select();
      try {
        el.setRangeText(String(value), 0, el.value.length, 'end');
      } catch (_) {
        const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        const tracker = el._valueTracker;
        if (tracker) tracker.setValue(el.value);
        desc.set.call(el, value);
      }
      el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: String(value), inputType: 'insertFromPaste' }));
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: String(value), inputType: 'insertFromPaste' }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      const pk = Object.keys(el).find(k => k.startsWith('__reactProps'));
      if (el[pk] && el[pk].onChange) {
        el[pk].onChange({ target: { value: el.value, name: el.name, type: el.type }, persist(){}, preventDefault(){}, stopPropagation(){} });
      }
      el.blur();
      return el.value;
    };
    const vals = {
      n: pasteLike(form.querySelector('input[name=completeName]'), 'Gabo Loko Pedreira'),
      e: pasteLike(form.querySelector('input[name=email]'), 'gaboloko@gmail.com'),
      t: pasteLike(form.querySelector('input[name=cellphone]'), '11987124916')
    };
    const c = form.querySelector('input[type=checkbox]');
    if (!c.checked) c.click();
    return vals;
  }`,
]);
console.log("FILL", r.out || r.err);
await sleep(200);
const snap = await run(["browser", "snapshot", "--efficient", "--limit", "20"]);
let ref = null;
for (const line of (snap.out || "").split(/\n/)) {
  if (/button \"Inscreva-se\"/.test(line)) {
    const m = line.match(/\[ref=(e\d+)\]/);
    if (m) ref = m[1];
  }
}
await run(["browser", "click", ref]);
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
console.log("AFTER", after.out || after.err);
