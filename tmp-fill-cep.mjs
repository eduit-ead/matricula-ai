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

await run(["browser", "focus", "t34"]);
let r = await run([
  "browser",
  "fill",
  "--fields",
  JSON.stringify([{ ref: "e14", value: "05001200" }]),
]);
console.log("FILL:", r.out || r.err);
await new Promise((x) => setTimeout(x, 3000));
r = await run(["browser", "snapshot", "--efficient", "--limit", "80"]);
console.log(r.out);
r = await run([
  "browser",
  "evaluate",
  "--fn",
  "() => ({ href: location.href, cep: document.querySelector('#ship-postalCode')?.value || document.querySelector('input[name=postalCode]')?.value })",
]);
console.log(r.out || r.err);
