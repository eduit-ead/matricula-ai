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

// capture href of Acessar prova before click
const hrefFn = `() => {
  const links = [...document.querySelectorAll('a,button')].filter(el => /acessar prova/i.test(el.textContent||''));
  return links.map(el => ({ tag: el.tagName, text: (el.textContent||'').trim(), href: el.href || el.getAttribute('href'), onclick: el.getAttribute('onclick') }));
}`;
let r = await run(["browser", "evaluate", "--fn", hrefFn]);
console.log("LINKS:", r.out || r.err);

r = await run(["browser", "click", "e65"]);
console.log("CLICK:", r.out || r.err);
await new Promise((x) => setTimeout(x, 7000));

const tabs = await run(["browser", "tabs"]);
const lines = (tabs.out || "").split(/\r?\n/).filter(Boolean);
const interesting = lines.filter(
  (l) =>
    /myvtex|cruzeiro|cursos\.|prova|vestibular|candidato|processo|account|selecao|inscri|avaliacao|exame|selecione|quest/i.test(
      l
    ) && !/recaptcha|doubleclick|criteo|fls\.|service_worker|webworker|gtm\./i.test(l)
);
console.log("TABS:\n" + interesting.slice(0, 40).join("\n"));

// try focus newest content-looking tab - prefer non-account if present
const tabIds = [...interesting.join("\n").matchAll(/tab: (t\d+)/g)].map((m) => m[1]);
const unique = [...new Set(tabIds)];
console.log("TAB_IDS:", unique);

for (const id of unique.slice(0, 5)) {
  await run(["browser", "focus", id]);
  r = await run([
    "browser",
    "evaluate",
    "--fn",
    "() => ({ id: 'focus', href: location.href, title: document.title, text: (document.body.innerText||'').slice(0,800) })",
  ]);
  console.log("FOCUS_" + id + ":", r.out || r.err);
}
