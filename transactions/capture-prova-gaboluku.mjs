/**
 * Click Acompanhar and copy Acessar prova href (no click on prova).
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
const t0 = Date.now();
const log = [];

const mark = (step, extra = {}) => {
  const e = { t: Math.round((Date.now() - t0) / 1000), step, ...extra };
  log.push(e);
  console.log(`[${e.t}s] ${step}`, extra.msg || "");
};

function run(args) {
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
      resolve({ code: -1, out, err: "CALL_TIMEOUT" });
    }, CALL_TIMEOUT_MS);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => {
      clearTimeout(kill);
      resolve({ code, out, err });
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function snap() {
  const r = await run(["browser", "snapshot", "--interactive", "--max-chars", "80000"]);
  return r.out || "";
}

async function ev(fnSrc) {
  const r = await run(["browser", "evaluate", "--fn", fnSrc]);
  let parsed = null;
  try {
    const m = (r.out || "").match(/\{[\s\S]*\}\s*$/);
    if (m) parsed = JSON.parse(m[0]);
  } catch {}
  return { raw: r.out, parsed };
}

function refsMatching(text, re) {
  return (text || "")
    .split(/\n/)
    .filter((l) => re.test(l))
    .map((l) => {
      const m = l.match(/\be\d+\b/);
      return m ? { ref: m[0], line: l.trim() } : null;
    })
    .filter(Boolean);
}

const tabs = await run(["browser", "tabs"]);
const tabId =
  (tabs.out || "").match(/\b(t\d+)\b.*(?:myvtex|cruzeiro)/i)?.[1] ||
  (tabs.out || "").match(/\b(t1)\b/)?.[1];
if (tabId) await run(["browser", "focus", tabId]);

await run([
  "browser",
  "navigate",
  "https://cruzeirodosul.myvtex.com/account#/minhas-inscricoes/",
]);
await sleep(3500);

let text = await snap();
mark("SNAP1", {
  msg: refsMatching(text, /Acompanhar|prova|164627/).map((x) => x.line).join(" | "),
});

const acompRefs = refsMatching(text, /Acompanhar Inscri/);
if (acompRefs[0]) {
  mark("CLICK_ACOMP", { msg: acompRefs[0].ref + " " + acompRefs[0].line });
  await run(["browser", "click", acompRefs[0].ref]);
  await sleep(2500);
} else {
  // DOM click fallback
  const clicked = await ev(`() => {
    const el = [...document.querySelectorAll('a,button,[role="button"]')]
      .find(e => /acompanhar inscric/i.test((e.textContent||'').trim()));
    if (el) { el.click(); return { ok: true, tag: el.tagName, text: (el.textContent||'').trim().slice(0,80) }; }
    return { ok: false };
  }`);
  mark("CLICK_DOM", { msg: JSON.stringify(clicked.parsed) });
  await sleep(2500);
}

text = await snap();
mark("SNAP2", {
  msg: refsMatching(text, /Acessar prova|Continuar|prova|processo/i)
    .map((x) => x.line)
    .slice(0, 15)
    .join(" | "),
});

const cap = await ev(`() => {
  const links = [...document.querySelectorAll('a')].map(a => ({
    text: (a.textContent||'').trim().slice(0,80),
    href: a.href
  })).filter(a => /prova|processo|vestibular|acompanhar/i.test(a.text + ' ' + a.href));
  const body = document.body.innerText || '';
  return {
    href: location.href,
    links,
    inscr: (body.match(/\\d{10,}-\\d{2}/) || [])[0] || null,
    status: (body.match(/Aguardando[^\\n]{0,60}|Conclu[ií]d[^\\n]{0,40}/i) || [])[0] || null,
    hasProva: /Acessar prova/i.test(body),
    snippet: body.slice(0, 1500)
  };
}`);
mark("CAP", { msg: JSON.stringify(cap.parsed) });

const prova = (cap.parsed?.links || []).filter((l) => /acessar prova/i.test(l.text));
const out = {
  ok: prova.length > 0 || !!cap.parsed?.inscr,
  inscr: cap.parsed?.inscr,
  status: cap.parsed?.status,
  provaHrefs: prova.map((p) => p.href),
  allRelevantLinks: cap.parsed?.links || [],
  pageHref: cap.parsed?.href,
  snippet: cap.parsed?.snippet,
  log,
};
fs.writeFileSync(path.join(root, "measure-gaboluku-prova.json"), JSON.stringify(out, null, 2));
console.log("\n=== SUMMARY ===\n" + JSON.stringify(out, null, 2));
process.exit(prova.length ? 0 : 2);
