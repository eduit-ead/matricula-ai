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

async function ev(fn) {
  const r = await run(["browser", "evaluate", "--fn", fn]);
  const text = (r.out || "").trim();
  const i = text.search(/[\{\[]/);
  if (i >= 0) {
    try {
      return JSON.parse(text.slice(i));
    } catch {}
  }
  return { raw: text, err: r.err };
}

await run(["browser", "focus", "t34"]);
await run([
  "browser",
  "navigate",
  "https://cruzeirodosul.myvtex.com/grad-pedagogia-semipresencial-cruzeiro-do-sul-virtual/p",
]);
await new Promise((r) => setTimeout(r, 4000));

const snap = (await run(["browser", "snapshot", "--efficient", "--limit", "80"])).out || "";
console.log(snap);

// Find refs for Nome Completo, E-mail, Telefone, checkbox, button Inscreva-se
const lines = snap.split(/\n/);
const find = (re) => {
  for (const line of lines) {
    if (re.test(line)) {
      const m = line.match(/\[ref=(e\d+)\]/);
      if (m) return { ref: m[1], line: line.trim() };
    }
  }
  return null;
};

const nome = find(/textbox \"Nome Completo\"|textbox \"Nome\"/);
const email = find(/textbox \"E-mail\"/);
const tel = find(/textbox \"Telefone\"/);
const check = find(/checkbox/);
const btn = find(/button \"Inscreva-se\"/);
console.log({ nome, email, tel, check, btn });

const fields = [];
if (nome) fields.push({ ref: nome.ref, value: "Gabo LOKO" });
if (email) fields.push({ ref: email.ref, value: "gaboloko@gmail.com" });
if (tel) fields.push({ ref: tel.ref, value: "11987124916" });

if (fields.length) {
  const fr = await run(["browser", "fill", "--fields", JSON.stringify(fields)]);
  console.log("FILL", fr.out || fr.err);
}
if (check) await run(["browser", "click", check.ref]);
if (btn) await run(["browser", "click", btn.ref]);

await new Promise((r) => setTimeout(r, 4500));
const after = await ev(`() => ({
  href: location.href,
  hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||''),
  vals: [...document.querySelectorAll('input')].filter(i=>i.offsetParent&&i.type!=='hidden'&&i.type!=='checkbox').slice(0,8).map(i=>({ph:i.placeholder,name:i.name,type:i.type,value:i.value}))
})`);
console.log("AFTER", JSON.stringify(after, null, 2));
