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
const refOf = (text, re) => {
  for (const line of text.split(/\n/)) {
    if (re.test(line)) {
      const m = line.match(/\[ref=(e\d+)\]/);
      if (m) return m[1];
    }
  }
  return null;
};

await run(["browser", "focus", "t34"]);
const ev = await run([
  "browser",
  "evaluate",
  "--fn",
  `() => {
    const form = document.querySelector('form');
    return {
      href: location.href,
      formText: ((document.querySelector('[class*=purchase-box]')||document.body).innerText||'').slice(0,1200),
      hasCheckout: /checkout/i.test(location.href)
    };
  }`,
]);
console.log(ev.out || ev.err);

let s = await run(["browser", "snapshot", "--efficient", "--limit", "60"]);
console.log(
  (s.out || "")
    .split(/\n/)
    .filter((l) =>
      /button|combobox|Continuar|ingresso|erro|invál|condição|Polo|CEP/i.test(l)
    )
    .slice(0, 40)
    .join("\n")
);

const cont = refOf(s.out || "", /button \"Continuar inscrição\"/);
if (cont) {
  console.log("clicking continuar", cont);
  await run(["browser", "click", cont]);
  await sleep(5000);
  const after = await run([
    "browser",
    "evaluate",
    "--fn",
    `() => ({ href: location.href, text: (document.body.innerText||'').slice(0,400) })`,
  ]);
  console.log("AFTER", after.out || after.err);
}
