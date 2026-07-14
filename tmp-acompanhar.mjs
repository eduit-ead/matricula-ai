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
let r = await run(["browser", "click", "e20"]);
console.log("CLICK:", r.out || r.err);
await new Promise((x) => setTimeout(x, 6000));

const tabs = await run(["browser", "tabs"]);
const lines = (tabs.out || "").split(/\r?\n/).filter(Boolean);
const interesting = lines.filter(
  (l) =>
    /myvtex|cruzeiro|cursos\.|prova|vestibular|candidato|processo|account|selecao|inscri|avaliacao|exame/i.test(
      l
    ) && !/recaptcha|doubleclick|criteo|fls\.|service_worker|webworker|gtm\./i.test(l)
);
console.log("TABS:\n" + interesting.slice(0, 30).join("\n"));

r = await run([
  "browser",
  "evaluate",
  "--fn",
  "() => ({ href: location.href, title: document.title, text: (document.body.innerText||'').slice(0,3000) })",
]);
console.log("PAGE:", r.out || r.err);
r = await run(["browser", "snapshot", "--efficient", "--limit", "100"]);
console.log("SNAP:", r.out);
