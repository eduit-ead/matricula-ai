/**
 * After transaction fill, try openclaw semantic fill once; then click CTA.
 * Diagnostic only — not the target architecture.
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
console.log("tx", lead.success, lead.elapsedMs);

const snap = await run(["browser", "snapshot", "--efficient", "--limit", "50"]);
const text = snap.out || "";
const find = (re) => {
  for (const line of text.split(/\n/)) {
    if (re.test(line)) {
      const m = line.match(/\[ref=(e\d+)\]/);
      if (m) return m[1];
    }
  }
  return null;
};
const nome = find(/textbox \"Nome completo/i) || find(/textbox \"Nome Completo\"/i);
const email = find(/textbox \"E-mail/i);
const tel = find(/textbox \"Telefone\"/);
const check = find(/checkbox.*[Pp]rivacidade|checkbox \"Estou de acordo/);
const fields = [];
if (nome) fields.push({ ref: nome, value: "Gabo Loko Teste Runtime" });
if (email) fields.push({ ref: email, value: "gaboloko@gmail.com" });
if (tel) fields.push({ ref: tel, value: "11987124916" });
console.log("refs", { nome, email, tel, check, fields });
if (fields.length) {
  const fr = await run(["browser", "fill", "--fields", JSON.stringify(fields)]);
  console.log("fill", (fr.out || fr.err || "").slice(0, 200));
}
if (check) {
  await run(["browser", "click", check]);
}

await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
    if (btn) btn.click();
    return { ok: !!btn };
  }`,
]);
await sleep(3000);
const after = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => ({ hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||'') })`,
]);
console.log("AFTER_FILL_PATH", after.out || after.err);
