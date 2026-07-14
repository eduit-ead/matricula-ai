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
let r = await run(["browser", "click", "e12"]);
console.log("CLICK:", r.out || r.err);
await new Promise((x) => setTimeout(x, 6000));
r = await run(["browser", "tabs"]);
console.log("TABS:", r.out || r.err);
r = await run([
  "browser",
  "evaluate",
  "--fn",
  "() => ({ href: location.href, title: document.title, text: (document.body.innerText||'').slice(0,2500) })",
]);
console.log(r.out || r.err);
r = await run(["browser", "snapshot", "--efficient", "--limit", "100"]);
console.log(r.out);
