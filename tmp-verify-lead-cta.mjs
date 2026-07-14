/**
 * Quick verify: reload PDP → lead-pdp transaction → click Inscreva-se → check polo.
 */
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
console.log("LEAD", JSON.stringify(lead, null, 2));

const click = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1')
      || [...document.querySelectorAll('button')].find(b =>
          b.offsetParent && /^\\s*Inscreva-se\\s*$/i.test((b.textContent||'').trim()));
    if (!btn) return { ok:false };
    btn.click();
    return { ok:true, text:(btn.textContent||'').trim() };
  }`,
]);
console.log("CLICK", click.out || click.err);
await sleep(3000);

const after = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => ({
    hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||''),
    btn: (() => {
      const b = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
      return b ? (b.textContent||'').trim() : null;
    })(),
    bodySlice: (document.body.innerText||'').replace(/\\s+/g,' ').slice(0,500)
  })`,
]);
console.log("AFTER", after.out || after.err);
