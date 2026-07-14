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

const tabs = await run(["browser", "tabs"]);
const lines = (tabs.out || "").split(/\r?\n/).filter(Boolean);
const interesting = lines.filter((l) =>
  /myvtex|cruzeiro|cursos\.|prova|vestibular|candidato|processo|account|orderPlaced|selecao|inscri/i.test(
    l
  ) && !/recaptcha|doubleclick|criteo|fls\.|service_worker|webworker|gtm\./i.test(l)
);
console.log("INTERESTING_TABS:\n" + interesting.slice(0, 40).join("\n"));

await run(["browser", "focus", "t34"]);
let r = await run([
  "browser",
  "evaluate",
  "--fn",
  "() => ({ href: location.href, title: document.title, text: (document.body.innerText||'').slice(0,1800) })",
]);
console.log("T34:", r.out || r.err);
