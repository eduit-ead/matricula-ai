import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { fillLeadForm } from "./helpers/fillLeadForm.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
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
      cwd: root,
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
await sleep(5000);

const lead = await fillLeadForm(
  {
    nome: "Gabo Loko Pedreira",
    email: "gaboloko@gmail.com",
    telefone: "11987124916",
  },
  { run }
);
console.log("tx", lead.success, lead.valuesFound);

const state = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
    const form = document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form');
    const consent = [...document.querySelectorAll('input[type=checkbox]')].filter(c=>c.offsetParent)
      .sort((a,b)=>Math.abs(a.getBoundingClientRect().top-btn.getBoundingClientRect().top)-Math.abs(b.getBoundingClientRect().top-btn.getBoundingClientRect().top))[0];
    const readReactChecked = (el) => {
      const fk = Object.keys(el||{}).find(k => k.startsWith('__reactFiber'));
      let f = el && el[fk];
      for (let i=0;i<12 && f;i++) {
        if (f.memoizedProps && ('checked' in f.memoizedProps)) return f.memoizedProps.checked;
        f = f.return;
      }
      return null;
    };
    return {
      formText: (form&&form.innerText||'').slice(0,600),
      domChecked: consent && consent.checked,
      reactChecked: readReactChecked(consent),
      name: consent && consent.name
    };
  }`,
]);
console.log("STATE", state.out || state.err);

// ensure consent via react onChange if needed, then click
const go = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
    const form = document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form');
    const consent = [...document.querySelectorAll('input[type=checkbox]')].filter(c=>c.offsetParent)
      .sort((a,b)=>Math.abs(a.getBoundingClientRect().top-btn.getBoundingClientRect().top)-Math.abs(b.getBoundingClientRect().top-btn.getBoundingClientRect().top))[0];
    const pk = Object.keys(consent||{}).find(k => k.startsWith('__reactProps'));
    const onChange = pk && consent[pk] && consent[pk].onChange;
    const readReactChecked = (el) => {
      const fk = Object.keys(el||{}).find(k => k.startsWith('__reactFiber'));
      let f = el && el[fk];
      for (let i=0;i<12 && f;i++) {
        if (f.memoizedProps && ('checked' in f.memoizedProps)) return f.memoizedProps.checked;
        f = f.return;
      }
      return null;
    };
    let forced = false;
    if (onChange && !readReactChecked(consent)) {
      onChange({ target: { checked: true, type: 'checkbox', name: consent.name }, currentTarget: consent, preventDefault(){}, stopPropagation(){} });
      forced = true;
    } else if (!consent.checked) {
      consent.click();
      forced = true;
    }
    const bpk = Object.keys(btn).find(k => k.startsWith('__reactProps'));
    const onClick = bpk && btn[bpk] && btn[bpk].onClick;
    if (onClick) onClick({ preventDefault(){}, stopPropagation(){}, target: btn, currentTarget: btn });
    else btn.click();
    return {
      forced,
      reactChecked: readReactChecked(consent),
      formText: (form&&form.innerText||'').slice(0,600)
    };
  }`,
]);
console.log("GO", go.out || go.err);
await sleep(4000);
const after = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const form = document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form');
    return {
      hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||''),
      formText: (form&&form.innerText||'').slice(0,800)
    };
  }`,
]);
console.log("AFTER", after.out || after.err);
