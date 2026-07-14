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
    nome: "Gabo Loko Teste Runtime",
    email: "gaboloko@gmail.com",
    telefone: "11987124916",
  },
  { run }
);
console.log("tx", {
  success: lead.success,
  values: lead.valuesFound,
  diag: lead.diagnostics,
});

const state = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
    const checks = [...document.querySelectorAll('input[type=checkbox]')].filter(c => c.offsetParent).map(c => {
      const r = c.getBoundingClientRect();
      const br = btn ? btn.getBoundingClientRect() : {top:0,left:0};
      const dist = Math.abs(r.top-br.top)+Math.abs(r.left-br.left)*0.25;
      return {
        name: c.name,
        checked: c.checked,
        dist: Math.round(dist),
        label: ((c.closest('label')||c.parentElement||{}).innerText||'').slice(0,60)
      };
    }).sort((a,b)=>a.dist-b.dist);
    return { checks, btnText: btn && (btn.textContent||'').trim() };
  }`,
]);
console.log("CHECKS", state.out || state.err);

// Force-check nearest consent + click CTA in one evaluate (agent-side recovery test)
const go = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
    const checks = [...document.querySelectorAll('input[type=checkbox]')].filter(c => c.offsetParent);
    const dist = (el) => {
      const a = el.getBoundingClientRect();
      const b = btn.getBoundingClientRect();
      return Math.abs(a.top-b.top)+Math.abs(a.left-b.left)*0.25;
    };
    const nearest = checks.sort((a,b)=>dist(a)-dist(b))[0];
    if (nearest && !nearest.checked) nearest.click();
    if (btn) btn.click();
    return { checked: nearest && nearest.checked, clicked: !!btn };
  }`,
]);
console.log("GO", go.out || go.err);
await sleep(3500);
const after = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => ({ hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||'') })`,
]);
console.log("AFTER", after.out || after.err);
