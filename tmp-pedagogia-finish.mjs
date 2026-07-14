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
const DATA = {
  nome: "Gabo LOKO",
  email: "gaboloko@gmail.com",
  telefone: "11987124916",
  cep: "05001200",
  estado: "São Paulo",
  cidade: "São Paulo",
  poloNeedle: /Freguesia/i,
  cpf: "50928152057",
  first: "Gabo",
  last: "LOKO",
  birth: "1999-09-09",
};
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

async function snap(limit = 80) {
  return (await run(["browser", "snapshot", "--efficient", "--limit", String(limit)])).out || "";
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
mark("START_PDP", {
  href: (await ev(`() => ({ href: location.href })`)).href,
});

// LEAD — fill via DOM setters near Inscreva-se button form
const lead = await ev(`() => {
  const set = (el,v) => {
    if (!el) return false;
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    d.set.call(el,v);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    el.dispatchEvent(new Event('blur',{bubbles:true}));
    return true;
  };
  // Prefer visible lead fields on PDP (not popup)
  const inputs = [...document.querySelectorAll('input')].filter(i => i.offsetParent && i.type !== 'hidden');
  const name = inputs.find(i => /nome/i.test(i.placeholder||'') || /nome/i.test(i.name||''));
  const email = inputs.find(i => /e-?mail/i.test(i.placeholder||'') || i.name==='email' || i.type==='email');
  const phone = inputs.find(i => /tel|phone|celular/i.test(i.placeholder||i.name||''));
  const terms = [...document.querySelectorAll('input[type=checkbox]')].find(c => c.offsetParent && /priva|termo|lgpd|aceito|politica/i.test((c.closest('label')?.innerText||c.parentElement?.innerText||'')));
  const allChecks = [...document.querySelectorAll('input[type=checkbox]')].filter(c => c.offsetParent);
  const termBox = terms || allChecks[allChecks.length-1];
  if (termBox && !termBox.checked) termBox.click();
  const btn = [...document.querySelectorAll('button')].find(b => /^\\s*Inscreva-se\\s*$/i.test((b.textContent||'').trim()) && b.offsetParent);
  return {
    name: set(name, ${JSON.stringify(DATA.nome)}),
    email: set(email, ${JSON.stringify(DATA.email)}),
    phone: set(phone, ${JSON.stringify(DATA.telefone)}),
    terms: !!(termBox && termBox.checked),
    hasBtn: !!btn,
    vals: { n:name&&name.value, e:email&&email.value, p:phone&&phone.value }
  };
}`);
mark("LEAD_FILL", { msg: JSON.stringify(lead) });

// Click Inscreva-se BUTTON only
let s = await snap(50);
// Prefer button over link
let insc = null;
for (const line of s.split(/\n/)) {
  if (/button \"Inscreva-se\"/i.test(line)) {
    insc = line.match(/\[ref=(e\d+)\]/)?.[1];
    break;
  }
}
if (insc) {
  await run(["browser", "click", insc]);
  mark("LEAD_CLICK", { msg: insc });
} else {
  const clicked = await ev(`() => {
    const btn = [...document.querySelectorAll('button')].find(b => /inscreva-se/i.test(b.textContent||'') && b.offsetParent);
    if (!btn) return { ok:false };
    btn.click();
    return { ok:true };
  }`);
  mark("LEAD_CLICK_DOM", { msg: JSON.stringify(clicked) });
}
await new Promise((r) => setTimeout(r, 4000));

let st = await ev(`() => ({ href: location.href, hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||'') })`);
mark("AFTER_LEAD", { href: st.href, msg: "hasPolo=" + st.hasPolo });

// LOCATION
s = await snap(100);
let pais = refOf(s, /combobox \"Selecione um Pa/);
if (pais) await run(["browser", "select", pais.ref, "Brasil"]);
await new Promise((r) => setTimeout(r, 2000));
s = await snap(100);
let cep = refOf(s, /textbox \"Digite seu CEP\"|textbox \"CEP/);
if (cep)
  await run([
    "browser",
    "fill",
    "--fields",
    JSON.stringify([{ ref: cep.ref, value: DATA.cep }]),
  ]);
await new Promise((r) => setTimeout(r, 1200));
s = await snap(140);
let estado = refOf(s, /combobox \"Selecione um Estado\"/);
if (estado) await run(["browser", "select", estado.ref, DATA.estado]);
await new Promise((r) => setTimeout(r, 2500));
s = await snap(220);
let cidade = refOf(s, /combobox \"Selecione uma Cidade\"/);
if (cidade) await run(["browser", "select", cidade.ref, DATA.cidade]);
await new Promise((r) => setTimeout(r, 3000));
s = await snap(300);
const poloLine = s.split(/\n/).find((l) => /option/.test(l) && /Freguesia/i.test(l));
const poloText = poloLine?.match(/option \"([^\"]+)/)?.[1];
let polo = refOf(s, /combobox \"Selecione um Polo\"/);
mark("POLO", { msg: poloText || "NOT_FOUND" });
if (polo && poloText) await run(["browser", "select", polo.ref, poloText]);
await new Promise((r) => setTimeout(r, 1200));
s = await snap(40);
let ver = refOf(s, /button \"Ver condição especial\"/);
if (ver) await run(["browser", "click", ver.ref]);
mark("VER_COND", { msg: ver?.ref });
await new Promise((r) => setTimeout(r, 3000));

// INGRESSO
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
st = await ev(`() => ({ href: location.href, title: document.title })`);
mark("CHECKOUT", { href: st.href });

// Ensure profile
if (!/#\/profile/.test(st.href || "")) {
  if (/checkout/.test(st.href || "")) {
    await run(["browser", "navigate", "https://cruzeirodosul.myvtex.com/checkout/#/profile"]);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

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
    href: location.href,
    first: set(document.getElementById('client-first-name'), ${JSON.stringify(DATA.first)}),
    last: set(document.getElementById('client-last-name'), ${JSON.stringify(DATA.last)}),
    cpf: set(document.getElementById('client-document'), ${JSON.stringify(DATA.cpf)}),
    phone: set(document.getElementById('client-phone'), ${JSON.stringify(DATA.telefone)}),
    birth: set(document.getElementById('client-birthDate'), ${JSON.stringify(DATA.birth)}),
    birthClass: document.getElementById('client-birthDate')?.className
  };
}`);
mark("PROFILE", { msg: JSON.stringify(profile) });
s = await snap(30);
let ir = refOf(s, /button \"Ir para o Endereço\"/);
if (ir) await run(["browser", "click", ir.ref]);
await new Promise((r) => setTimeout(r, 4000));
st = await ev(`() => ({ href: location.href })`);
mark("SHIPPING", { href: st.href });

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
    JSON.stringify([{ ref: cep.ref, value: DATA.cep }]),
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
mark("PAYMENT", { href: st.href, msg: "gratis=" + st.gratis });

s = await snap(30);
cont = refOf(s, /button \"Continuar Inscrição\"/);
if (cont) await run(["browser", "click", cont.ref]);
await new Promise((r) => setTimeout(r, 7000));
st = await ev(`() => ({ href: location.href, title: document.title, text: (document.body.innerText||'').slice(0,450) })`);
mark("ORDER", { href: st.href, msg: (st.text || "").slice(0, 200) });

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

// CAPTURE ONLY — do not click Acessar prova
const cap = await ev(`() => {
  const as = [...document.querySelectorAll('a')].filter(a => /acessar prova/i.test(a.textContent||''));
  return {
    page: location.href,
    hrefs: as.map(a => a.href),
    textHas: /Acessar prova/i.test(document.body.innerText||'')
  };
}`);
mark("CAPTURE", { msg: JSON.stringify(cap) });

const artifact = {
  provaUrl: cap.hrefs?.[0] || null,
  elapsedSec: Math.round((Date.now() - t0) / 1000),
  course: "Pedagogia (Semipresencial)",
  email: DATA.email,
  timeline,
  note: "URL capturada sem clicar em Acessar prova",
};
fs.writeFileSync(
  path.join(process.cwd(), "run-artifact-pedagogia.json"),
  JSON.stringify(artifact, null, 2)
);
console.log("\n=== ARTIFACT ===");
console.log(JSON.stringify(artifact, null, 2));
