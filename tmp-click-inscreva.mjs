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
const snap = await run(["browser", "snapshot", "--efficient", "--limit", "80"]);
const text = snap.out || "";
console.log(
  text
    .split(/\n/)
    .filter((l) => /Inscreva|textbox|checkbox|Nome|E-mail|Telefone|Privacidade|CEP|Polo/i.test(l))
    .slice(0, 40)
    .join("\n")
);

const find = (re) => {
  for (const line of text.split(/\n/)) {
    if (re.test(line)) {
      const m = line.match(/\[ref=(e\d+)\]/);
      if (m) return { ref: m[1], line: line.trim() };
    }
  }
  return null;
};

const btn =
  find(/button \"Inscreva-se\"/) || find(/button.*Inscreva-se/i);
console.log("BTN", btn);

if (btn) {
  const cr = await run(["browser", "click", btn.ref]);
  console.log("CLICK_OUT", cr.out || cr.err);
  await sleep(3500);
}

const after = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => ({
    hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||''),
    alerts: [...document.querySelectorAll('[class*=error],[class*=Error],[role=alert],.vtex-input__error')]
      .map(e => (e.textContent||'').trim()).filter(Boolean).slice(0,15),
    values: {
      n: (document.querySelector('input[name=completeName]')||{}).value,
      e: (document.querySelector('input[name=email]')||{}).value,
      t: (document.querySelector('input[name=cellphone]')||{}).value,
      c: (document.querySelector('input[name=consent]')||{}).checked
    },
    bodyHit: (document.body.innerText||'').match(/.{0,40}(obrigat|inválid|erro|consent|privacidade).{0,40}/gi)
  })`,
]);
console.log("AFTER", after.out || after.err);
