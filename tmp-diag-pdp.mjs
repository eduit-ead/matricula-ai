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
await run([
  "browser",
  "navigate",
  "https://cruzeirodosul.myvtex.com/grad-pedagogia-semipresencial-cruzeiro-do-sul-virtual/p",
]);
await sleep(8000);
const ev = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => ({
    href: location.href,
    ready: document.readyState,
    btn: (() => {
      const b = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
      return b ? { text: (b.textContent||'').trim(), disabled: b.disabled } : null;
    })(),
    inputs: [...document.querySelectorAll('input')].filter(i=>i.offsetParent).map(i=>({name:i.name,type:i.type})).slice(0,12),
    bodyHasInscreva: /Inscreva-se/i.test(document.body.innerText||'')
  })`,
]);
console.log(ev.out || ev.err);
const snap = await run(["browser", "snapshot", "--efficient", "--limit", "40"]);
console.log(
  (snap.out || "")
    .split(/\n/)
    .filter((l) => /Inscreva|Nome|E-mail|Telefone|checkbox|textbox|button/i.test(l))
    .slice(0, 25)
    .join("\n")
);
