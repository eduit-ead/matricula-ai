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
      resolve({ out, err: err + "TIMEOUT" });
    }, 45000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", () => {
      clearTimeout(t);
      resolve({ out, err });
    });
  });
}

await run(["browser", "focus", "t1"]);
const tabs = await run(["browser", "tabs"]);
console.log("TABS\n", tabs.out);

await run([
  "browser",
  "navigate",
  "https://cruzeirodosul.myvtex.com/recursos%20humanos?_q=recursos%20humanos&map=ft",
]);
await new Promise((r) => setTimeout(r, 4000));
await run(["browser", "focus", "t1"]);
const snap = await run(["browser", "snapshot", "--efficient", "--limit", "80"]);
console.log(
  "LINKS\n",
  (snap.out || "")
    .split(/\n/)
    .filter((l) => /link |Recursos|Humanos|grad-|Gest/i.test(l))
    .slice(0, 40)
    .join("\n")
);
const ev = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => ({
    href: location.href,
    links: [...document.querySelectorAll('a')].filter(a => /recursos.?humanos/i.test(a.textContent||'') || /recursos-humanos/i.test(a.href||'')).slice(0,10).map(a => ({ text: (a.textContent||'').trim().replace(/\\s+/g,' ').slice(0,90), href: a.href }))
  })`,
]);
console.log("EV", ev.out || ev.err);
