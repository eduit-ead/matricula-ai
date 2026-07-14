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

await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const form = document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form');
    const setFormik = (el, value) => {
      const pk = Object.keys(el).find(k => k.startsWith('__reactProps'));
      const props = el[pk];
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      const tracker = el._valueTracker;
      if (tracker) tracker.setValue(el.value === String(value) ? value + '_' : (el.value || ''));
      desc.set.call(el, value);
      const synth = {
        target: { value: String(value), name: el.name, type: el.type },
        currentTarget: { value: String(value), name: el.name, type: el.type },
        preventDefault(){}, stopPropagation(){}, persist(){}
      };
      props.onChange(synth);
      props.onBlur(synth);
    };
    setFormik(form.querySelector('input[name=completeName]'), 'Gabo Loko Pedreira');
    setFormik(form.querySelector('input[name=email]'), 'gaboloko@gmail.com');
    setFormik(form.querySelector('input[name=cellphone]'), '11987124916');
    const c = form.querySelector('input[type=checkbox]');
    const cpk = Object.keys(c).find(k => k.startsWith('__reactProps'));
    c[cpk].onChange({ target: { checked: true, name: c.name, type: 'checkbox' }, persist(){}, preventDefault(){}, stopPropagation(){} });
    return true;
  }`,
]);
await sleep(300);

// trusted click without snapshot (use CSS via evaluate click... no, use openclaw)
// get ref via quick snapshot
const snap = await run(["browser", "snapshot", "--efficient", "--limit", "20"]);
let ref = null;
for (const line of (snap.out || "").split(/\n/)) {
  if (/button \"Inscreva-se\"/.test(line)) {
    const m = line.match(/\[ref=(e\d+)\]/);
    if (m) ref = m[1];
  }
}
console.log("ref", ref);
await run(["browser", "click", ref]);
await sleep(4000);
const after = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => ({
    hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||''),
    formText: ((document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form')||{}).innerText||'').slice(0,700)
  })`,
]);
console.log("AFTER", after.out || after.err);
