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
const r = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
    const form = document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form');
    const rect = btn.getBoundingClientRect();
    const topEl = document.elementFromPoint(rect.left + rect.width/2, rect.top + rect.height/2);
    const bpk = Object.keys(btn).find(k => k.startsWith('__reactProps'));
    const onClick = btn[bpk].onClick;
    let clickResult = null;
    let clickErr = null;
    try {
      const ret = onClick({
        preventDefault(){},
        stopPropagation(){},
        persist(){},
        isDefaultPrevented(){return false},
        isPropagationStopped(){return false},
        target: btn,
        currentTarget: btn,
        type: 'click',
        nativeEvent: { isTrusted: true }
      });
      clickResult = ret && typeof ret.then === 'function' ? 'promise' : typeof ret;
      if (ret && typeof ret.then === 'function') {
        return ret.then(v => ({ asyncOk: true, v: String(v), topEl: topEl && topEl.tagName + '.' + (topEl.className||'').toString().slice(0,60) })).catch(e => ({ asyncErr: String(e) }));
      }
    } catch (e) {
      clickErr = String(e);
    }
    // also dump onClick source snippet
    const src = onClick.toString().slice(0, 500);
    return {
      clickResult,
      clickErr,
      src,
      topEl: topEl && (topEl.tagName + ' ' + (topEl.className||'').toString().slice(0,80)),
      btnIsTop: topEl === btn || (btn.contains && btn.contains(topEl)),
      values: {
        n: form.querySelector('input[name=completeName]').value,
        e: form.querySelector('input[name=email]').value,
        t: form.querySelector('input[name=cellphone]').value,
        c: form.querySelector('input[type=checkbox]').checked
      }
    };
  }`,
]);
console.log(r.out || r.err);
await sleep(3000);
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
