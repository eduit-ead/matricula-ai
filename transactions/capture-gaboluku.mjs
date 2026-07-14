/**
 * Capture prova href for gaboluku from account inscriptions.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const mjs = path.join(
  process.env.APPDATA,
  "npm",
  "node_modules",
  "openclaw",
  "openclaw.mjs"
);

const CALL_TIMEOUT_MS = 45000;
const TOTAL_MAX_MS = 3 * 60 * 1000;
const t0 = Date.now();
const log = [];
let aborted = null;
let s;

const mark = (step, extra = {}) => {
  const e = { t: Math.round((Date.now() - t0) / 1000), step, ...extra };
  log.push(e);
  console.log(`[${e.t}s] ${step}`, extra.msg || extra.href || "");
};

function checkBudgets() {
  if (Date.now() - t0 > TOTAL_MAX_MS) {
    aborted = { reason: "TOTAL_TIMEOUT", totalMs: Date.now() - t0 };
    return false;
  }
  return true;
}

function run(args) {
  if (!checkBudgets()) {
    return Promise.resolve({ code: -1, out: "", err: JSON.stringify(aborted), timedOut: true });
  }
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [mjs, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const kill = setTimeout(() => {
      try {
        p.kill();
      } catch {}
      resolve({ code: -1, out, err: "CALL_TIMEOUT", timedOut: true });
    }, CALL_TIMEOUT_MS);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => {
      clearTimeout(kill);
      resolve({ code, out, err, timedOut: false });
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function snap(max = 40) {
  const r = await run(["browser", "snapshot", "--interactive", "--max-chars", String(max * 1000)]);
  return { text: r.out || "", ...r };
}

async function ev(fnSrc) {
  const r = await run(["browser", "evaluate", "--fn", fnSrc]);
  let parsed = null;
  try {
    const m = (r.out || "").match(/\{[\s\S]*\}\s*$/);
    if (m) parsed = JSON.parse(m[0]);
  } catch {}
  return { ...r, parsed };
}

function refOf(text, re) {
  const line = (text || "").split(/\n/).find((l) => re.test(l));
  if (!line) return null;
  const m = line.match(/\be\d+\b/);
  return m ? m[0] : null;
}

const tabs = await run(["browser", "tabs"]);
const tabLines = (tabs.out || "").split(/\n/);
const content =
  tabLines.find((l) => /myvtex\.com|cruzeirodosul/i.test(l) && !/service.?worker/i.test(l)) ||
  tabLines.find((l) => /\bt1\b/.test(l));
const tabId = content?.match(/\b(t\d+)\b/)?.[1];
if (tabId) {
  await run(["browser", "focus", tabId]);
  mark("FOCUS", { msg: tabId });
}

await run([
  "browser",
  "navigate",
  "https://cruzeirodosul.myvtex.com/account#/minhas-inscricoes/",
]);
await sleep(3000);

const list = await ev(`() => {
  const body = document.body.innerText || '';
  return {
    href: location.href,
    hasList: /minhas inscric/i.test(body) || /Acompanhar/i.test(body),
    hasGaboluku: /gaboluku|Gabriel|Lkonte|recursos humanos|Gestão/i.test(body),
    snippet: body.slice(0, 1200)
  };
}`);
mark("LIST", { msg: JSON.stringify(list.parsed) });

s = await snap(50);
let acomp = refOf(s.text, /Acompanhar Inscrição/);
if (!acomp) {
  // try any Acompanhar
  acomp = refOf(s.text, /Acompanhar/);
}
if (acomp) {
  await run(["browser", "click", acomp]);
  await sleep(1500);
}

const cap = await ev(`() => {
  const as = [...document.querySelectorAll('a')].filter(a => /acessar prova/i.test(a.textContent||''));
  const body = document.body.innerText || '';
  const inscr = (body.match(/\\d{10,}-\\d{2}/) || [])[0] || null;
  return {
    href: location.href,
    hrefs: as.map(a => ({ text: (a.textContent||'').trim(), href: a.href })),
    has: /Acessar prova/i.test(body),
    inscr,
    snippet: body.slice(0, 900)
  };
}`);
mark("CAPTURE", { msg: JSON.stringify(cap.parsed) });

const out = {
  ok: !!(cap.parsed?.hrefs?.length),
  list: list.parsed,
  capture: cap.parsed,
  aborted,
  log,
};
fs.writeFileSync(path.join(root, "measure-gaboluku-capture.json"), JSON.stringify(out, null, 2));
console.log("\n=== SUMMARY ===\n" + JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 2);
