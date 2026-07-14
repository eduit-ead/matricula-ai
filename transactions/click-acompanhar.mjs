import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mjs = path.join(
  process.env.APPDATA,
  "npm",
  "node_modules",
  "openclaw",
  "openclaw.mjs"
);

function run(args) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [mjs, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let o = "";
    let e = "";
    const k = setTimeout(() => {
      try {
        p.kill();
      } catch {}
      resolve({ o, e });
    }, 45000);
    p.stdout.on("data", (d) => (o += d));
    p.stderr.on("data", (d) => (e += d));
    p.on("close", () => {
      clearTimeout(k);
      resolve({ o, e });
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ev(code) {
  const r = await run(["browser", "evaluate", "--fn", code]);
  let parsed = null;
  try {
    const m = (r.o || "").match(/\{[\s\S]*\}\s*$/);
    if (m) parsed = JSON.parse(m[0]);
  } catch {}
  return parsed;
}

await run(["browser", "focus", "t1"]);

const click = await ev(`() => {
  const btn = [...document.querySelectorAll('button')]
    .find(b => /Acompanhar Inscri/i.test((b.textContent || '').trim()));
  if (!btn) return { ok: false };
  btn.click();
  return { ok: true, text: btn.textContent.trim() };
}`);
console.log("CLICK", click);
await sleep(3500);

let after = await ev(`() => {
  const body = document.body.innerText || '';
  const links = [...document.querySelectorAll('a')].map(a => ({
    text: (a.textContent || '').trim().slice(0, 100),
    href: a.href
  })).filter(a => /prova|processo|vestibular|continuar|selecion/i.test(a.text + ' ' + a.href));
  return {
    href: location.href,
    hasProva: /Acessar prova/i.test(body),
    inscr: (body.match(/\\d{10,}-\\d{2}/) || [])[0] || null,
    links,
    snippet: body.slice(0, 1600)
  };
}`);
console.log("AFTER1", JSON.stringify(after, null, 2));

// If still on list, wait and retry click once
if (!after?.hasProva && /minhas-inscricoes/i.test(after?.href || "")) {
  await sleep(2000);
  await ev(`() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => /Acompanhar Inscri/i.test((b.textContent || '').trim()));
    if (btn) btn.click();
    return { ok: !!btn };
  }`);
  await sleep(4000);
  after = await ev(`() => {
    const body = document.body.innerText || '';
    const links = [...document.querySelectorAll('a')].map(a => ({
      text: (a.textContent || '').trim().slice(0, 100),
      href: a.href
    })).filter(a => /prova|processo|vestibular|continuar|selecion/i.test(a.text + ' ' + a.href));
    return {
      href: location.href,
      hasProva: /Acessar prova/i.test(body),
      inscr: (body.match(/\\d{10,}-\\d{2}/) || [])[0] || null,
      links,
      snippet: body.slice(0, 1600)
    };
  }`);
  console.log("AFTER2", JSON.stringify(after, null, 2));
}

const snap = await run([
  "browser",
  "snapshot",
  "--interactive",
  "--max-chars",
  "80000",
]);
const snapLines = (snap.o || "")
  .split(/\n/)
  .filter((l) => /prova|Acompanhar|Continuar|Acessar/i.test(l))
  .slice(0, 30);

const provaHrefs = (after?.links || [])
  .filter((l) => /acessar prova/i.test(l.text))
  .map((l) => l.href);

const out = {
  click,
  inscr: after?.inscr,
  pageHref: after?.href,
  hasProva: after?.hasProva,
  provaHrefs,
  links: after?.links,
  snippet: after?.snippet,
  snapLines,
};
fs.writeFileSync(
  path.join(root, "measure-gaboluku-prova.json"),
  JSON.stringify(out, null, 2)
);
console.log("\n=== SUMMARY ===\n", JSON.stringify(out, null, 2));
process.exit(provaHrefs.length ? 0 : 2);
