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

await run(["browser", "focus", "t88"]);
await new Promise((x) => setTimeout(x, 3000));
let r = await run([
  "browser",
  "evaluate",
  "--fn",
  "() => ({ href: location.href, title: document.title, text: (document.body.innerText||'').slice(0,3000) })",
]);
console.log("PAGE:", r.out || r.err);
r = await run(["browser", "snapshot", "--efficient", "--limit", "120"]);
console.log("SNAP:", r.out);
