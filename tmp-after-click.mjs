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

// click via onClick prop directly
const click = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
    const pk = Object.keys(btn).find(k => k.startsWith('__reactProps'));
    const onClick = pk && btn[pk] && btn[pk].onClick;
    let err = null;
    try {
      if (onClick) onClick({ preventDefault(){}, stopPropagation(){}, nativeEvent: {}, target: btn, currentTarget: btn });
      else btn.click();
    } catch (e) { err = String(e); }
    return { usedReactOnClick: !!onClick, err, disabled: btn.disabled };
  }`,
]);
console.log("CLICK", click.out || click.err);
await sleep(5000);

const snap = await run(["browser", "snapshot", "--efficient", "--limit", "100"]);
const lines = (snap.out || "")
  .split(/\n/)
  .filter((l) =>
    /combobox|textbox|button|checkbox|Pa|CEP|Polo|ingresso|erro|invál|Continuar|condi/i.test(l)
  )
  .slice(0, 60);
console.log(lines.join("\n"));

const body = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const form = document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form')
      || document.querySelector('[class*=purchase-box] form');
    const t = (form && form.innerText) || '';
    return {
      formText: t.slice(0, 1200),
      selects: [...document.querySelectorAll('select, [role=combobox]')].filter(e=>e.offsetParent).map(e => ({
        tag: e.tagName,
        name: e.name || e.getAttribute('aria-label') || (e.textContent||'').slice(0,40)
      })).slice(0,15)
    };
  }`,
]);
console.log("FORM", body.out || body.err);
