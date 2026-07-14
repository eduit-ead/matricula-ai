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

// ONLY openclaw fill with name Gabo Loko (2 words) - already know works with Pedreira
// Now: evaluate formik then IMMEDIATELY click via evaluate in SAME evaluate (no second RT for click - wait user said agent clicks)
// Here we test if click in same evaluate after formik set works
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
      const synth = {
        target: { value: String(value), name: el.name, type: el.type },
        currentTarget: { value: String(value), name: el.name, type: el.type },
        preventDefault(){}, stopPropagation(){}, persist(){}
      };
      if (props.onChange) props.onChange(synth);
      if (props.onBlur) props.onBlur(synth);
    };
    setFormik(form.querySelector('input[name=completeName]'), 'Gabo Loko Pedreira');
    setFormik(form.querySelector('input[name=email]'), 'gaboloko@gmail.com');
    setFormik(form.querySelector('input[name=cellphone]'), '11987124916');
    const c = form.querySelector('input[type=checkbox]');
    const cpk = Object.keys(c).find(k => k.startsWith('__reactProps'));
    c[cpk].onChange({ target: { checked: true, name: c.name, type: 'checkbox' }, persist(){}, preventDefault(){}, stopPropagation(){} });

    return new Promise((resolve) => {
      // wait for React state flush then click
      setTimeout(() => {
        const btn = form.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
        const bpk = Object.keys(btn).find(k => k.startsWith('__reactProps'));
        // use fresh props after re-render
        const btn2 = form.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
        const bpk2 = Object.keys(btn2).find(k => k.startsWith('__reactProps'));
        try {
          btn2[bpk2].onClick({ preventDefault(){}, stopPropagation(){}, persist(){}, target: btn2, currentTarget: btn2 });
        } catch (e) {
          return resolve({ err: String(e) });
        }
        setTimeout(() => {
          resolve({
            hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||''),
            formText: form.innerText.slice(0,700),
            values: {
              n: form.querySelector('input[name=completeName]').value,
              e: form.querySelector('input[name=email]').value,
              t: form.querySelector('input[name=cellphone]').value,
              c: form.querySelector('input[type=checkbox]').checked
            }
          });
        }, 2500);
      }, 150);
    });
  }`,
]);
console.log(r.out || r.err);
