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
const t0 = Date.now();
const timeline = [];
const mark = (step, extra = {}) => {
  const e = { t: Math.round((Date.now() - t0) / 1000), step, ...extra };
  timeline.push(e);
  console.log(`[${e.t}s] ${step}`, extra.msg || extra.href || "");
};

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

async function snap(n = 80) {
  return (await run(["browser", "snapshot", "--efficient", "--limit", String(n)])).out || "";
}

function refOf(s, re) {
  for (const line of s.split(/\n/)) {
    if (re.test(line)) {
      const m = line.match(/\[ref=(e\d+)\]/);
      if (m) return { ref: m[1], line: line.trim() };
    }
  }
  return null;
}

await run(["browser", "focus", "t34"]);
const cur = await ev(`() => ({ href: location.href })`);
if (!/grad-pedagogia-semipresencial/.test(cur.href || "")) {
  await run([
    "browser",
    "navigate",
    "https://cruzeirodosul.myvtex.com/grad-pedagogia-semipresencial-cruzeiro-do-sul-virtual/p",
  ]);
  await new Promise((r) => setTimeout(r, 4000));
}
mark("PDP", { href: (await ev(`() => ({href:location.href})`)).href });

// Fill purchase-box lead fields (near cta_p1), accept privacy, click BUTTON Inscreva-se
const lead = await ev(`() => {
  const set = (el,v) => {
    if (!el) return false;
    el.focus();
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    d.set.call(el,v);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    el.dispatchEvent(new Event('blur',{bubbles:true}));
    return el.value;
  };
  const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
  const root = btn?.closest('[class*=\"purchase\"], [class*=\"product\"], form, section, div') || document;
  // Prefer inputs in same purchase box: visible, with ids completeName/email/cellphone and empty placeholder (form fields)
  const boxInputs = [...root.querySelectorAll('input')].filter(i => i.offsetParent && i.type !== 'hidden');
  // Walk up to find container with all three fields
  let container = btn;
  for (let i=0; i<12 && container; i++) {
    container = container.parentElement;
    const names = [...(container?.querySelectorAll('input[name=completeName],input[name=email],input[name=cellphone]')||[])].filter(x=>x.offsetParent);
    if (names.length >= 3) break;
  }
  const scope = container || document;
  const name = scope.querySelector('input[name=\"completeName\"]');
  const email = scope.querySelector('input[name=\"email\"]');
  const phone = scope.querySelector('input[name=\"cellphone\"]');
  const check = scope.querySelector('input[type=checkbox]') || document.querySelector('input[type=checkbox]');
  // if multiple completeName, pick the one closest to btn
  const pickClosest = (sel) => {
    const list = [...document.querySelectorAll(sel)].filter(i => i.offsetParent);
    if (!list.length) return null;
    if (!btn) return list[0];
    const br = btn.getBoundingClientRect();
    list.sort((a,b) => {
      const ar = a.getBoundingClientRect();
      const br2 = b.getBoundingClientRect();
      return Math.abs(ar.top-br.top) - Math.abs(br2.top-br.top);
    });
    return list[0];
  };
  const nEl = pickClosest('input[name=completeName]');
  const eEl = pickClosest('input[name=email]');
  const pEl = pickClosest('input[name=cellphone]');
  const privacy = [...document.querySelectorAll('input[type=checkbox]')].find(c => c.offsetParent && /Política de Privacidade/i.test(c.closest('label')?.innerText || c.parentElement?.innerText || ''));
  if (privacy && !privacy.checked) privacy.click();
  return {
    name: set(nEl, 'Gabo LOKO'),
    email: set(eEl, 'gaboloko@gmail.com'),
    phone: set(pEl, '11987124916'),
    privacy: !!(privacy && privacy.checked),
    hasBtn: !!btn,
    nPh: nEl && nEl.placeholder,
    eType: eEl && eEl.type
  };
}`);
mark("LEAD", { msg: JSON.stringify(lead) });

const clicked = await ev(`() => {
  const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
  if (!btn) return { ok:false };
  btn.scrollIntoView({block:'center'});
  btn.click();
  return { ok:true, text: btn.textContent.trim() };
}`);
mark("CLICK_CTA", { msg: JSON.stringify(clicked) });
await new Promise((r) => setTimeout(r, 4500));

let after = await ev(`() => ({
  href: location.href,
  hasPolo: /Selecione um Pa[ií]s|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||''),
  errors: [...document.querySelectorAll('[class*=error], .error, [role=alert]')].map(e => (e.textContent||'').trim()).filter(Boolean).slice(0,5)
})`);
mark("AFTER_LEAD", { href: after.href, msg: JSON.stringify(after) });

if (!after.hasPolo) {
  console.log("STILL_NO_POLO — aborting to avoid empty cart wander");
  fs.writeFileSync(
    "run-artifact-pedagogia.json",
    JSON.stringify({ ok: false, timeline, after }, null, 2)
  );
  process.exit(2);
}

// LOCATION via selects
let s = await snap(120);
let pais = refOf(s, /combobox \"Selecione um Pa/);
if (pais) await run(["browser", "select", pais.ref, "Brasil"]);
await new Promise((r) => setTimeout(r, 2000));
s = await snap(100);
let cep = refOf(s, /textbox \"Digite seu CEP\"/);
if (cep)
  await run([
    "browser",
    "fill",
    "--fields",
    JSON.stringify([{ ref: cep.ref, value: "05001200" }]),
  ]);
await new Promise((r) => setTimeout(r, 1000));
s = await snap(140);
let estado = refOf(s, /combobox \"Selecione um Estado\"/);
if (estado) await run(["browser", "select", estado.ref, "São Paulo"]);
await new Promise((r) => setTimeout(r, 2500));
s = await snap(220);
let cidade = refOf(s, /combobox \"Selecione uma Cidade\"/);
if (cidade) await run(["browser", "select", cidade.ref, "São Paulo"]);
await new Promise((r) => setTimeout(r, 3000));
s = await snap(300);
const poloText = s
  .split(/\n/)
  .find((l) => /option/.test(l) && /Freguesia/i.test(l))
  ?.match(/option \"([^\"]+)/)?.[1];
let polo = refOf(s, /combobox \"Selecione um Polo\"/);
mark("POLO", { msg: poloText || "NOT_FOUND" });
if (polo && poloText) await run(["browser", "select", polo.ref, poloText]);
await new Promise((r) => setTimeout(r, 1000));
s = await snap(40);
let ver = refOf(s, /button \"Ver condição especial\"/);
if (ver) await run(["browser", "click", ver.ref]);
await new Promise((r) => setTimeout(r, 3000));

s = await snap(70);
let ing = refOf(s, /combobox \"Selecione uma forma de ingresso\"/);
if (ing) await run(["browser", "select", ing.ref, "Vestibular Múltipla Escolha"]);
await new Promise((r) => setTimeout(r, 800));
s = await snap(70);
let nec = refOf(s, /combobox \"Possui alguma necessidade/);
if (nec)
  await run([
    "browser",
    "select",
    nec.ref,
    "Não necessito de condições especiais",
  ]);
s = await snap(40);
let cont = refOf(s, /button \"Continuar inscrição\"/);
if (cont) await run(["browser", "click", cont.ref]);
mark("INGRESSO", { msg: cont?.ref });
await new Promise((r) => setTimeout(r, 6000));

let st = await ev(`() => ({ href: location.href })`);
mark("TO_CHECKOUT", { href: st.href });
if (!/checkout/.test(st.href || "")) {
  console.log("NO_CHECKOUT", st);
  fs.writeFileSync(
    "run-artifact-pedagogia.json",
    JSON.stringify({ ok: false, reason: "no checkout", timeline }, null, 2)
  );
  process.exit(3);
}

await run(["browser", "navigate", "https://cruzeirodosul.myvtex.com/checkout/#/profile"]);
await new Promise((r) => setTimeout(r, 3000));

const profile = await ev(`() => {
  const set = (el,v) => {
    if (!el) return null;
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    d.set.call(el,v);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    el.dispatchEvent(new Event('blur',{bubbles:true}));
    return el.value;
  };
  return {
    first: set(document.getElementById('client-first-name'), 'Gabo'),
    last: set(document.getElementById('client-last-name'), 'LOKO'),
    cpf: set(document.getElementById('client-document'), '50928152057'),
    phone: set(document.getElementById('client-phone'), '11987124916'),
    birth: set(document.getElementById('client-birthDate'), '1999-09-09'),
    birthClass: document.getElementById('client-birthDate')?.className,
    href: location.href
  };
}`);
mark("PROFILE", { msg: JSON.stringify(profile) });
s = await snap(30);
let ir = refOf(s, /button \"Ir para o Endereço\"/);
if (ir) await run(["browser", "click", ir.ref]);
await new Promise((r) => setTimeout(r, 4000));

st = await ev(`() => ({ href: location.href })`);
mark("SHIP", { href: st.href });
if (!/#\/shipping/.test(st.href || "")) {
  await run(["browser", "navigate", "https://cruzeirodosul.myvtex.com/checkout/#/shipping"]);
  await new Promise((r) => setTimeout(r, 3000));
}

s = await snap(40);
cep = refOf(s, /textbox \"CEP/);
if (cep)
  await run([
    "browser",
    "fill",
    "--fields",
    JSON.stringify([{ ref: cep.ref, value: "05001200" }]),
  ]);
await new Promise((r) => setTimeout(r, 2500));
s = await snap(40);
let sem = refOf(s, /checkbox \"Sem número\"/);
if (sem) await run(["browser", "click", sem.ref]);
await new Promise((r) => setTimeout(r, 700));
s = await snap(30);
let go = refOf(s, /Prosseguir|Ir para o pagamento/);
if (go) await run(["browser", "click", go.ref]);
await new Promise((r) => setTimeout(r, 4000));
st = await ev(`() => ({ href: location.href, gratis: /gr[aá]tis/i.test(document.body.innerText||'') })`);
mark("PAY", { href: st.href, msg: "gratis=" + st.gratis });

s = await snap(30);
cont = refOf(s, /button \"Continuar Inscrição\"/);
if (cont) await run(["browser", "click", cont.ref]);
await new Promise((r) => setTimeout(r, 7000));
st = await ev(`() => ({ href: location.href, text: (document.body.innerText||'').slice(0,500) })`);
mark("ORDER", { href: st.href, msg: (st.text || "").slice(0, 220) });

s = await snap(40);
let contProc = refOf(s, /Continuar Processo/);
if (contProc) {
  await run(["browser", "click", contProc.ref]);
  await new Promise((r) => setTimeout(r, 5000));
}
await run([
  "browser",
  "navigate",
  "https://cruzeirodosul.myvtex.com/account#/minhas-inscricoes/",
]);
await new Promise((r) => setTimeout(r, 5000));
s = await snap(60);
let acomp = refOf(s, /Acompanhar Inscrição/);
if (acomp) {
  await run(["browser", "click", acomp.ref]);
  await new Promise((r) => setTimeout(r, 3000));
}
const cap = await ev(`() => {
  const as = [...document.querySelectorAll('a')].filter(a => /acessar prova/i.test(a.textContent||''));
  return { hrefs: as.map(a => a.href), page: location.href, has: /Acessar prova/i.test(document.body.innerText||'') };
}`);
mark("CAPTURE", { msg: JSON.stringify(cap) });

const artifact = {
  ok: !!cap.hrefs?.[0],
  provaUrl: cap.hrefs?.[0] || null,
  elapsedSec: Math.round((Date.now() - t0) / 1000),
  course: "Pedagogia (Semipresencial)",
  email: "gaboloko@gmail.com",
  timeline,
  note: "URL only — did not click Acessar prova",
};
fs.writeFileSync("run-artifact-pedagogia.json", JSON.stringify(artifact, null, 2));
console.log("\n=== ARTIFACT ===");
console.log(JSON.stringify(artifact, null, 2));
