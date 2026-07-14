import { spawn } from "child_process";
import path from "path";
const mjs = path.join(process.env.APPDATA, "npm/node_modules/openclaw/openclaw.mjs");
function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [mjs, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("exit", () => resolve(out));
  });
}
await run(["browser", "focus", "t34"]);
const fn = `() => {
  const t = document.body.innerText || '';
  const idx = t.toLowerCase().indexOf('obrigat');
  return {
    href: location.href,
    around: idx >= 0 ? t.slice(Math.max(0, idx - 120), idx + 200) : null,
    hasIngresso: /forma de ingresso/i.test(t),
    hasVer: /ver condi/i.test(t),
    hasContinuar: /continuar inscri/i.test(t)
  };
}`;
console.log(await run(["browser", "evaluate", "--fn", fn]));
