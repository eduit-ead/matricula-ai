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
    const t = setTimeout(() => {
      child.kill();
      resolve({ out, err: err + "\nTIMEOUT" });
    }, 40000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", () => {
      clearTimeout(t);
      resolve({ out, err });
    });
  });
}

await run(["browser", "focus", "t34"]);
const ev = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => ({
    href: location.href,
    title: document.title,
    hasEntrar: /Entrar como cliente/i.test(document.body.innerText||''),
    ola: /Olá/i.test(document.body.innerText||''),
    gaboluku: /gaboluku/i.test(document.body.innerText||''),
    searchPh: [...document.querySelectorAll('input')].filter(i=>i.offsetParent).slice(0,8).map(i=>({type:i.type,ph:i.placeholder,name:i.name}))
  })`,
]);
console.log("EV", ev.out || ev.err);
const snap = await run(["browser", "snapshot", "--efficient", "--limit", "40"]);
console.log(
  (snap.out || snap.err || "")
    .split(/\n/)
    .filter((l) => /textbox|search|Buscar|estudar|Entrar|Olá|link |button /i.test(l))
    .slice(0, 30)
    .join("\n")
);
