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

const inspect = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
    const form = btn && (btn.closest('form') || btn.closest('[class*=purchase]'));
    const fiberKey = btn && Object.keys(btn).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    const getReactProps = (el) => {
      const key = Object.keys(el||{}).find(k => k.startsWith('__reactProps') || k.startsWith('__reactEventHandlers'));
      if (!key) return null;
      const p = el[key];
      return p ? Object.keys(p).slice(0, 20) : null;
    };
    const inputs = ['completeName','email','cellphone'].map(name => {
      const el = [...document.querySelectorAll('input[name=\"'+name+'\"]')].filter(i=>i.offsetParent).sort((a,b)=>{
        const db = btn.getBoundingClientRect();
        const da = (el)=>Math.abs(el.getBoundingClientRect().top-db.top);
        return da(a)-da(b);
      })[0];
      const propsKey = Object.keys(el||{}).find(k => k.startsWith('__reactProps'));
      let reactValue = null;
      try {
        // walk fiber for pending props value
        const fk = Object.keys(el||{}).find(k => k.startsWith('__reactFiber'));
        let f = el && el[fk];
        for (let i=0;i<8 && f;i++) {
          if (f.memoizedProps && 'value' in f.memoizedProps) { reactValue = f.memoizedProps.value; break; }
          f = f.return;
        }
      } catch(e) { reactValue = 'err:'+e.message; }
      return { name, dom: el && el.value, reactValue, propsKeys: getReactProps(el) };
    });
    return {
      btnType: btn && btn.type,
      btnDisabled: btn && btn.disabled,
      formTag: form && form.tagName,
      formClass: form && String(form.className||'').slice(0,80),
      fiberKey: !!fiberKey,
      inputs,
      listenersGuess: btn && getReactProps(btn)
    };
  }`,
]);
console.log(inspect.out || inspect.err);

// Try requestSubmit / mouse events
const trySubmit = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
    const set = (el,v) => {
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
      const tracker = el._valueTracker; if (tracker) tracker.setValue(el.value === v ? v+'x' : el.value);
      desc.set.call(el, v);
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
    };
    const near = (name) => [...document.querySelectorAll('input[name=\"'+name+'\"]')].filter(i=>i.offsetParent)
      .sort((a,b)=> {
        const t = btn.getBoundingClientRect().top;
        return Math.abs(a.getBoundingClientRect().top-t)-Math.abs(b.getBoundingClientRect().top-t);
      })[0];
    set(near('completeName'), 'Gabo Loko Teste Runtime');
    set(near('email'), 'gaboloko@gmail.com');
    set(near('cellphone'), '11987124916');
    const consent = [...document.querySelectorAll('input[type=checkbox]')].filter(c=>c.offsetParent)
      .sort((a,b)=>Math.abs(a.getBoundingClientRect().top-btn.getBoundingClientRect().top)-Math.abs(b.getBoundingClientRect().top-btn.getBoundingClientRect().top))[0];
    if (consent && !consent.checked) consent.click();

    // read react values after set
    const readReact = (el) => {
      const fk = Object.keys(el||{}).find(k => k.startsWith('__reactFiber'));
      let f = el && el[fk];
      for (let i=0;i<10 && f;i++) {
        if (f.memoizedProps && 'value' in f.memoizedProps) return f.memoizedProps.value;
        f = f.return;
      }
      return null;
    };
    const n = near('completeName'); const e = near('email'); const t = near('cellphone');
    const before = { n: readReact(n), e: readReact(e), t: readReact(t), c: consent && consent.checked };

    btn.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
    btn.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    btn.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    return { before, clicked: true };
  }`,
]);
console.log("TRY", trySubmit.out || trySubmit.err);
await sleep(4000);
const after = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => ({
    hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||''),
    href: location.href,
    textHas: /País|CEP|Polo|erro|inválid/i.test(document.body.innerText||'')
  })`,
]);
console.log("AFTER", after.out || after.err);
