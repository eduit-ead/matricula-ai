import { spawn } from "child_process";
import fs from "fs";
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

async function ev(fn) {
  const r = await run(["browser", "evaluate", "--fn", fn]);
  const text = (r.out || "").trim();
  const i = text.search(/[\{\[]/);
  if (i >= 0) {
    try {
      return JSON.parse(text.slice(i));
    } catch {}
  }
  return { raw: text };
}

await run(["browser", "focus", "t34"]);
console.log(await ev(`() => ({ href: location.href, hasPolo: /Selecione um Polo|Digite seu CEP/i.test(document.body.innerText||''), text: (document.body.innerText||'').slice(0,400) })`));

// Prefer DOM select for location (faster than huge snapshots)
const loc = await ev(`async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const visible = (el) => el && el.offsetParent;
  const byLabel = (re) => {
    for (const lab of document.querySelectorAll('label')) {
      if (!re.test(lab.textContent||'')) continue;
      const id = lab.getAttribute('for');
      if (id) { const el = document.getElementById(id); if (visible(el)) return el; }
      const nest = lab.querySelector('select,input');
      if (visible(nest)) return nest;
    }
    return [...document.querySelectorAll('select,input')].find(el => visible(el) && re.test((el.getAttribute('aria-label')||'') + (el.placeholder||'')));
  };
  const setSelect = (sel, pred) => {
    if (!sel) return null;
    const opt = [...sel.options].find(pred);
    if (!opt) return null;
    sel.value = opt.value;
    sel.dispatchEvent(new Event('input',{bubbles:true}));
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    return opt.text;
  };
  const setInput = (el,v) => {
    if (!el) return false;
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    d.set.call(el,v);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  };
  const out = {};
  out.pais = setSelect(byLabel(/pa[ií]s/i), o => /brasil/i.test(o.text));
  await wait(700);
  setInput(byLabel(/cep/i) || document.querySelector('input[placeholder*=CEP i]'), '05001200');
  out.estado = setSelect(byLabel(/estado/i), o => /s[aã]o paulo/i.test(o.text));
  await wait(1500);
  out.cidade = setSelect(byLabel(/cidade/i), o => /^\\s*s[aã]o paulo\\s*$/i.test(o.text));
  await wait(2000);
  out.polo = setSelect(byLabel(/polo/i), o => /freguesia/i.test(o.text));
  const ver = [...document.querySelectorAll('button')].find(b => /ver condi/i.test(b.textContent||'') && b.offsetParent);
  if (ver) ver.click();
  out.clickedVer = !!ver;
  return out;
}`);
console.log("LOC", loc);
await new Promise((r) => setTimeout(r, 2000));

const ing = await ev(`() => {
  const byLabel = (re) => {
    for (const lab of document.querySelectorAll('label')) {
      if (!re.test(lab.textContent||'')) continue;
      const id = lab.getAttribute('for');
      if (id) return document.getElementById(id);
      return lab.querySelector('select');
    }
    return [...document.querySelectorAll('select')].find(s => re.test(s.getAttribute('aria-label')||''));
  };
  const setSelect = (sel, textRe) => {
    if (!sel) return null;
    const opt = [...sel.options].find(o => textRe.test(o.text));
    if (!opt) return null;
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    return opt.text;
  };
  const out = {
    ingresso: setSelect(byLabel(/ingresso/i), /m[uú]ltipla escolha/i),
    necessidade: setSelect(byLabel(/necessidade/i), /n[aã]o necessito/i)
  };
  const cont = [...document.querySelectorAll('button')].find(b => /continuar inscri/i.test(b.textContent||'') && b.offsetParent);
  if (cont) cont.click();
  out.clicked = !!cont;
  return out;
}`);
console.log("ING", ing);
await new Promise((r) => setTimeout(r, 5000));
console.log(await ev(`() => ({ href: location.href })`));
