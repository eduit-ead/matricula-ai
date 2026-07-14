import { spawn } from "child_process";
import path from "path";

const mjs = path.join(
  process.env.APPDATA,
  "npm",
  "node_modules",
  "openclaw",
  "openclaw.mjs"
);
const t0 = Date.now();
const mark = (s, x = {}) =>
  console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${s}`, x.msg || x.href || "");

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

async function ev(fn) {
  const r = await run(["browser", "evaluate", "--fn", fn]);
  const text = (r.out || "").trim();
  const i = text.search(/[\{\[]/);
  if (i >= 0) {
    try {
      return JSON.parse(text.slice(i));
    } catch {}
  }
  return { raw: text, err: r.err };
}

function refOf(snap, re) {
  for (const line of snap.split(/\n/)) {
    if (re.test(line)) {
      const m = line.match(/\[ref=(e\d+)\]/);
      if (m) return { ref: m[1], line: line.trim() };
    }
  }
  return null;
}

await run(["browser", "focus", "t34"]);
mark("FOCUS");

// Search Pedagogia
await ev(`() => {
  const input = document.querySelector('#downshift-0-input')
    || [...document.querySelectorAll('input')].find(i => /o que você procura/i.test(i.placeholder||''));
  if (!input) return { ok:false };
  const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
  d.set.call(input, 'pedagogia');
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.focus();
  return { ok:true };
}`);
let snap = (await run(["browser", "snapshot", "--efficient", "--limit", "40"])).out || "";
let searchBox = refOf(snap, /textbox \"O que você procura/);
let searchBtn = refOf(snap, /button \"Buscar produtos\"/);
if (searchBox) {
  await run([
    "browser",
    "fill",
    "--fields",
    JSON.stringify([{ ref: searchBox.ref, value: "pedagogia" }]),
  ]);
}
if (searchBtn) await run(["browser", "click", searchBtn.ref]);
else await run(["browser", "press", "Enter"]);
await new Promise((r) => setTimeout(r, 4000));

let st = await ev(`() => ({ href: location.href, title: document.title })`);
mark("SEARCH", { href: st.href });

// If search URL didn't change, navigate
if (!/pedagogia|_q=/i.test(st.href || "")) {
  await run([
    "browser",
    "navigate",
    "https://cruzeirodosul.myvtex.com/pedagogia?_q=pedagogia&map=ft",
  ]);
  await new Promise((r) => setTimeout(r, 4000));
  st = await ev(`() => ({ href: location.href })`);
  mark("SEARCH_NAV", { href: st.href });
}

snap = (await run(["browser", "snapshot", "--efficient", "--limit", "80"])).out || "";
// Collect product links - first Pedagogia course (prefer /grad-.../p)
const opened = await ev(`() => {
  const links = [...document.querySelectorAll('a')].filter(a => {
    const t = (a.textContent||'').trim();
    const h = a.href || '';
    return /pedagogia/i.test(t) && (/\\/p(?:\\?|$)/.test(h) || /grad-/i.test(h));
  });
  // de-dupe by href
  const seen = new Set();
  const uniq = [];
  for (const a of links) {
    if (seen.has(a.href)) continue;
    seen.add(a.href);
    uniq.push({ text: (a.textContent||'').trim().replace(/\\s+/g,' ').slice(0,120), href: a.href });
  }
  if (!uniq.length) {
    // fallback: any visible card with Pedagogia
    const any = [...document.querySelectorAll('a')].filter(a => /^\\s*Pedagogia/i.test((a.textContent||'').trim()) && a.href.includes('cruzeirodosul'));
    return { ok:false, samples: any.slice(0,8).map(a => ({ text: (a.textContent||'').trim().slice(0,80), href: a.href })) };
  }
  // FIRST course
  const first = uniq[0];
  const a = [...document.querySelectorAll('a')].find(x => x.href === first.href);
  if (a) a.click();
  return { ok:true, first, all: uniq.slice(0,6) };
}`);
mark("FIRST_COURSE", { msg: JSON.stringify(opened) });
await new Promise((r) => setTimeout(r, 4500));
st = await ev(`() => ({ href: location.href, title: document.title })`);
mark("PDP", { href: st.href, msg: st.title });
console.log(JSON.stringify({ opened, st }, null, 2));
