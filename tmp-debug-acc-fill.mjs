import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { runStageTransaction } from "./transactions/runtime.mjs";

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
    child.on("exit", (code) => {
      console.log("CMD", args[0], args[1], "=>", (out || err).slice(0, 120).replace(/\n/g, " "));
      resolve({ code, out, err });
    });
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

const result = await runStageTransaction({
  stageId: "lead-pdp",
  values: {
    nome: "Gabo Loko Pedreira",
    email: "gaboloko@gmail.com",
    telefone: "11987124916",
  },
  run,
});
console.log(JSON.stringify(result, null, 2));

const dom = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const btn = [...document.querySelectorAll('button')].find(b => /inscreva-se/i.test((b.textContent||'').trim()));
    const inputs = [...document.querySelectorAll('input')].filter(i => i.offsetParent && /completeName|email|cellphone|consent/.test(i.name||i.type)).map(i => ({name:i.name,type:i.type,value:(i.value||'').slice(0,40),checked:i.checked}));
    return { btn: btn && (btn.textContent||'').trim(), inputs, form: ((btn&&btn.closest('form')||{}).innerText||'').slice(0,400) };
  }`,
]);
console.log("DOM", dom.out || dom.err);
