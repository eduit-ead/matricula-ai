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
await sleep(5000);

const r = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const DATA = {
      completeName: 'Gabo Loko Pedreira',
      email: 'gaboloko@gmail.com',
      cellphone: '11987124916'
    };
    const form = document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form');
    if (!form) return { ok:false, reason:'no form' };

    const setViaReact = (el, value) => {
      const pk = Object.keys(el).find(k => k.startsWith('__reactProps'));
      const props = pk && el[pk];
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      const tracker = el._valueTracker;
      if (tracker) tracker.setValue(el.value === String(value) ? value + 'x' : el.value);
      desc.set.call(el, value);
      const ev = {
        target: el,
        currentTarget: el,
        bubbles: true,
        preventDefault(){},
        stopPropagation(){},
        nativeEvent: { isTrusted: true }
      };
      // keep target.value in sync for handlers that read event.target.value
      Object.defineProperty(ev, 'target', { writable: false, value: el });
      if (props && props.onChange) props.onChange(ev);
      else el.dispatchEvent(new Event('input', { bubbles: true }));
      if (props && props.onBlur) props.onBlur(ev);
      return { hasOnChange: !!(props && props.onChange), value: el.value };
    };

    const results = {};
    for (const name of Object.keys(DATA)) {
      const el = form.querySelector('input[name=\"'+name+'\"]');
      results[name] = el ? setViaReact(el, DATA[name]) : { missing: true };
    }

    const consent = form.querySelector('input[type=checkbox]');
    if (consent) {
      const pk = Object.keys(consent).find(k => k.startsWith('__reactProps'));
      const props = pk && consent[pk];
      if (!consent.checked) {
        if (props && props.onChange) {
          const fake = { target: { checked: true, type: 'checkbox', name: consent.name }, currentTarget: consent, preventDefault(){}, stopPropagation(){} };
          props.onChange(fake);
        } else consent.click();
      }
      // if still not checked, click
      if (!consent.checked) consent.click();
      results.consent = { checked: consent.checked };
    }

    const btn = form.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1')
      || [...form.querySelectorAll('button')].find(b => /inscreva-se/i.test(b.textContent||''));
    const bpk = Object.keys(btn||{}).find(k => k.startsWith('__reactProps'));
    const onClick = bpk && btn[bpk] && btn[bpk].onClick;
    if (onClick) onClick({ preventDefault(){}, stopPropagation(){}, target: btn, currentTarget: btn });
    else if (btn) btn.click();

    return {
      results,
      formText: (form.innerText||'').slice(0,700),
      clicked: !!btn
    };
  }`,
]);
console.log("STEP1", r.out || r.err);
await sleep(4000);
const after = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const form = document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form');
    return {
      hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||''),
      formText: (form&&form.innerText||'').slice(0,900),
      values: {
        n: form.querySelector('input[name=completeName]') && form.querySelector('input[name=completeName]').value,
        e: form.querySelector('input[name=email]') && form.querySelector('input[name=email]').value,
        t: form.querySelector('input[name=cellphone]') && form.querySelector('input[name=cellphone]').value,
        c: form.querySelector('input[type=checkbox]') && form.querySelector('input[type=checkbox]').checked
      }
    };
  }`,
]);
console.log("AFTER", after.out || after.err);
