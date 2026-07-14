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

// close popups
await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    [...document.querySelectorAll('button')].filter(b => /^\\s*✕\\s*$/.test(b.textContent||'') || /fechar|close/i.test(b.getAttribute('aria-label')||'')).forEach(b => b.click());
    return true;
  }`,
]);
await sleep(500);

const dig = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const form = document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form');
    const fk = Object.keys(form).find(k => k.startsWith('__reactFiber'));
    let f = form[fk];
    const found = [];
    for (let i = 0; i < 40 && f; i++) {
      const p = f.memoizedProps || {};
      const s = f.memoizedState;
      const keys = Object.keys(p).slice(0, 30);
      if (p.values || p.errors || p.initialValues || p.onSubmit || (p.form && p.form.values)) {
        found.push({
          depth: i,
          type: f.type && (f.type.name || f.type.displayName || typeof f.type),
          propKeys: keys,
          values: p.values || (p.form && p.form.values) || null,
          errors: p.errors || (p.form && p.form.errors) || null,
          isValid: p.isValid,
          dirty: p.dirty
        });
      }
      // also check hooks state objects
      let st = s;
      let guard = 0;
      while (st && guard++ < 8) {
        const mem = st.memoizedState;
        if (mem && typeof mem === 'object' && (mem.values || mem.completeName || mem.email)) {
          found.push({ depth: i, hook: true, mem: JSON.parse(JSON.stringify(mem)) });
        }
        st = st.next;
      }
      f = f.return;
    }
    return found.slice(0, 10);
  }`,
]);
console.log("FIBER", dig.out || dig.err);

await run([
  "browser",
  "navigate",
  "https://cruzeirodosul.myvtex.com/grad-administracao-ead-cruzeiro-do-sul-virtual/p",
]);
await sleep(5000);
const adm = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const form = document.querySelector('form.cruzeirodosul-product-purchase-box-0-x-form');
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
    return {
      href: location.href,
      hasForm: !!form,
      btn: btn && (btn.textContent||'').trim(),
      inputs: form ? [...form.querySelectorAll('input')].map(i => i.name+':'+i.type) : []
    };
  }`,
]);
console.log("ADM", adm.out || adm.err);
