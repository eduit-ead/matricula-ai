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
    const setFormik = (el, value) => {
      const pk = Object.keys(el).find(k => k.startsWith('__reactProps'));
      const props = el[pk];
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      const tracker = el._valueTracker;
      if (tracker) tracker.setValue(el.value === String(value) ? value + '_' : (el.value || ''));
      desc.set.call(el, value);
      // Formik-style synthetic event (plain target.value)
      const synth = {
        target: { value: String(value), name: el.name, type: el.type, checked: el.checked },
        currentTarget: { value: String(value), name: el.name, type: el.type },
        preventDefault(){}, stopPropagation(){}, persist(){}
      };
      if (props.onChange) props.onChange(synth);
      if (props.onBlur) props.onBlur(synth);
      return { value: el.value, reactValue: props.value };
    };
    const out = {
      n: setFormik(form.querySelector('input[name=completeName]'), 'Gabo Loko Pedreira'),
      e: setFormik(form.querySelector('input[name=email]'), 'gaboloko@gmail.com'),
      t: setFormik(form.querySelector('input[name=cellphone]'), '11987124916')
    };
    const c = form.querySelector('input[type=checkbox]');
    const cpk = Object.keys(c).find(k => k.startsWith('__reactProps'));
    const cp = c[cpk];
    if (cp && cp.onChange) {
      cp.onChange({ target: { checked: true, name: c.name, type: 'checkbox' }, persist(){}, preventDefault(){}, stopPropagation(){} });
    }
    if (!c.checked) c.click();
    // re-read props.value after setState flush
    return new Promise((resolve) => {
      setTimeout(() => {
        const read = (name) => {
          const el = form.querySelector('input[name=\"'+name+'\"]');
          const pk = Object.keys(el).find(k => k.startsWith('__reactProps'));
          return { dom: el.value, propsValue: el[pk].value, checked: el.checked };
        };
        resolve({
          out,
          after: {
            completeName: read('completeName'),
            email: read('email'),
            cellphone: read('cellphone'),
            consent: { checked: c.checked, props: c[cpk].checked }
          },
          formText: form.innerText.slice(0,400)
        });
      }, 100);
    });
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
    formText: ((document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form')||{}).innerText||'').slice(0,700)
  })`,
]);
console.log("AFTER", after.out || after.err);
