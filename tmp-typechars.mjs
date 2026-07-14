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
    const typeChars = (el, value) => {
      el.focus();
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      const tracker = el._valueTracker;
      if (tracker) tracker.setValue(el.value);
      desc.set.call(el, '');
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      let cur = '';
      for (const ch of String(value)) {
        cur += ch;
        if (tracker) tracker.setValue(cur.slice(0, -1));
        desc.set.call(el, cur);
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ch }));
        el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, key: ch }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ch }));
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      return el.value;
    };
    const vals = {
      n: typeChars(form.querySelector('input[name=completeName]'), 'Gabo Loko Pedreira'),
      e: typeChars(form.querySelector('input[name=email]'), 'gaboloko@gmail.com'),
      t: typeChars(form.querySelector('input[name=cellphone]'), '11987124916')
    };
    const c = form.querySelector('input[type=checkbox]');
    if (c && !c.checked) c.click();
    return { vals, checked: !!(c&&c.checked) };
  }`,
]);
console.log("FILL", r.out || r.err);

const snap = await run(["browser", "snapshot", "--efficient", "--limit", "25"]);
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
    formText: ((document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form')||{}).innerText||'').slice(0,600),
    values: {
      n: document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form input[name=completeName]').value,
      e: document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form input[name=email]').value,
      t: document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form input[name=cellphone]').value,
      c: document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form input[type=checkbox]').checked
    }
  })`,
]);
console.log("AFTER", after.out || after.err);
