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

// Fill via React onChange (form already may have values from previous run)
await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const DATA = { completeName: 'Gabo Loko Pedreira', email: 'gaboloko@gmail.com', cellphone: '11987124916' };
    const form = document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form');
    const setViaReact = (el, value) => {
      const pk = Object.keys(el).find(k => k.startsWith('__reactProps'));
      const props = pk && el[pk];
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      const tracker = el._valueTracker;
      if (tracker) tracker.setValue(el.value === String(value) ? value + 'x' : el.value);
      desc.set.call(el, value);
      if (props && props.onChange) props.onChange({ target: el, currentTarget: el, preventDefault(){}, stopPropagation(){} });
      if (props && props.onBlur) props.onBlur({ target: el, currentTarget: el, preventDefault(){}, stopPropagation(){} });
    };
    for (const name of Object.keys(DATA)) {
      const el = form.querySelector('input[name=\"'+name+'\"]');
      if (el) setViaReact(el, DATA[name]);
    }
    const consent = form.querySelector('input[type=checkbox]');
    if (consent && !consent.checked) consent.click();
    return true;
  }`,
]);

const snap = await run(["browser", "snapshot", "--efficient", "--limit", "30"]);
let ref = null;
for (const line of (snap.out || "").split(/\n/)) {
  if (/button \"Inscreva-se\"/.test(line)) {
    const m = line.match(/\[ref=(e\d+)\]/);
    if (m) ref = m[1];
  }
}
console.log("ref", ref, "checkbox lines:");
console.log(
  (snap.out || "")
    .split(/\n/)
    .filter((l) => /checkbox|Inscreva|Nome completo|E-mail|Telefone/.test(l))
    .join("\n")
);

if (ref) {
  const cr = await run(["browser", "click", ref]);
  console.log("click", cr.out || cr.err);
}
await sleep(2000);

// watch button text / form for 8s
for (let i = 0; i < 4; i++) {
  const st = await run([
    "browser",
    "evaluate",
    "--fn",
    `() => {
      const form = document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form');
      const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
      return {
        btn: btn && (btn.textContent||'').trim(),
        disabled: btn && btn.disabled,
        hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo|País/i.test(document.body.innerText||''),
        formText: (form&&form.innerText||'').slice(0,500),
        href: location.href
      };
    }`,
  ]);
  console.log("t" + i, st.out || st.err);
  await sleep(2000);
}
