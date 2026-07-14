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
  email: "Gaboloko@gmail.com",
  cursoSearch: "gestão de recursos humanos",
  nomeCompleto: "Gabo LOKO",
  primeiroNome: "Gabo",
  ultimoNome: "LOKO",
  telefone: "11987124916",
  cep: "05001200",
  estado: "São Paulo",
  cidade: "São Paulo",
  poloNeedle: "Freguesia",
  cpf: "50928152057",
  nascimentoIso: "1999-09-09",
};

const t0 = Date.now();
const timeline = [];
function mark(step, extra = {}) {
  const e = { t: Math.round((Date.now() - t0) / 1000), step, ...extra };
  timeline.push(e);
  console.log(`[${e.t}s] ${step}`, extra.msg || extra.href || "");
}

function run(args, timeoutMs = 90000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [mjs, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      resolve({ code: -1, out, err: err + "\nTIMEOUT" });
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out, err });
    });
  });
}

async function ev(fn) {
  const r = await run(["browser", "evaluate", "--fn", fn]);
  const text = (r.out || "").trim() || (r.err || "").trim();
  const i = text.search(/[\{\[]/);
  if (i >= 0) {
    try {
      return JSON.parse(text.slice(i));
    } catch {}
  }
  return { raw: text, code: r.code, err: r.err };
}

async function snap(limit = 100) {
  return (await run(["browser", "snapshot", "--efficient", "--limit", String(limit)])).out || "";
}

function refOf(snapText, re) {
  for (const line of snapText.split(/\n/)) {
    if (re.test(line)) {
      const m = line.match(/\[ref=(e\d+)\]/);
      if (m) return { ref: m[1], line: line.trim() };
    }
  }
  return null;
}

async function focusMyvtex() {
  const tabs = (await run(["browser", "tabs"])).out || "";
  const ids = [];
  for (const line of tabs.split(/\n/)) {
    const m = line.match(/\[use: (t\d+)/);
    if (m) ids.push(m[1]);
  }
  // probe recent tabs for myvtex content
  for (const id of [...new Set(ids)].slice(0, 25)) {
    await run(["browser", "focus", id]);
    const st = await ev(
      `() => ({ href: location.href, title: document.title })`
    );
    if (
      st.href &&
      /cruzeirodosul\.myvtex\.com/.test(st.href) &&
      !/recaptcha|doubleclick/.test(st.href)
    ) {
      mark("FOCUS", { msg: id + " " + st.href });
      return { id, ...st };
    }
  }
  await run(["browser", "navigate", "https://cruzeirodosul.myvtex.com/graduacao"]);
  await new Promise((r) => setTimeout(r, 4000));
  return ev(`() => ({ href: location.href })`);
}

async function ensureClientLogin() {
  const state = await ev(`() => {
    const t = document.body.innerText || '';
    return {
      hasOla: /Olá,/i.test(t) && /@/i.test(t),
      hasEntrar: !!document.querySelector('.cruzeirodosul-telemarketing-2-x-loginButton'),
      snippet: (t.match(/Olá[^\\n]{0,60}|Entrar como cliente|Atendente:[^\\n]+/)||[])[0]
    };
  }`);
  mark("LOGIN_STATE", { msg: JSON.stringify(state) });
  if (state.hasOla) return true;

  await ev(`() => {
    const btn = document.querySelector('.cruzeirodosul-telemarketing-2-x-loginButton');
    if (btn) btn.click();
    return { clicked: !!btn };
  }`);
  await new Promise((r) => setTimeout(r, 1200));
  await ev(`() => {
    const input = [...document.querySelectorAll('input')].find(i => /mail/i.test(i.placeholder||'') || i.type==='email');
    if (!input) return { ok:false };
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    d.set.call(input, ${JSON.stringify(DATA.email)});
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    const enter = [...document.querySelectorAll('button')].find(b => /^Entrar$/i.test((b.textContent||'').trim()));
    if (enter) enter.click();
    return { ok:true, enter: !!enter, value: input.value };
  }`);
  await new Promise((r) => setTimeout(r, 3500));
  const after = await ev(`() => {
    const t = document.body.innerText || '';
    return { hasOla: /Olá,/i.test(t), snippet: (t.match(/Olá[^\\n]{0,80}/)||[])[0] };
  }`);
  mark("LOGIN_AFTER", { msg: JSON.stringify(after) });
  return !!after.hasOla;
}

async function searchAndOpenCourse() {
  await ev(`() => {
    const input = [...document.querySelectorAll('input')].find(i => /o que você procura/i.test(i.placeholder||'') || /busca|pesquis/i.test(i.placeholder||''));
    if (!input) return { ok:false };
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    d.set.call(input, ${JSON.stringify(DATA.cursoSearch)});
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    input.dispatchEvent(new KeyboardEvent('keypress',{key:'Enter',bubbles:true,cancelable:true}));
    input.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',bubbles:true,cancelable:true}));
    // also try nearby button
    const btn = input.closest('form')?.querySelector('button') || input.parentElement?.querySelector('button');
    if (btn) btn.click();
    return { ok:true, value: input.value };
  }`);
  await new Promise((r) => setTimeout(r, 4500));
  let st = await ev(`() => ({ href: location.href })`);
  mark("SEARCH_URL", { href: st.href });

  // if still on graduacao without query, navigate search URL
  if (!/[?&]_q=|map=ft|recursos/i.test(st.href || "")) {
    const q = encodeURIComponent("gestão de recursos humanos");
    await run([
      "browser",
      "navigate",
      `https://cruzeirodosul.myvtex.com/${q}?_q=${q}&map=ft`,
    ]);
    await new Promise((r) => setTimeout(r, 4000));
    st = await ev(`() => ({ href: location.href })`);
    mark("SEARCH_NAV", { href: st.href });
  }

  const opened = await ev(`() => {
    const links = [...document.querySelectorAll('a')];
    const prefer = links.find(a => /recursos humanos/i.test(a.textContent||'') && /grad-/i.test(a.href||''))
      || links.find(a => /gest[aã]o de recursos humanos/i.test(a.textContent||'') && a.href.includes('/p'))
      || links.find(a => /recursos humanos/i.test(a.textContent||'') && a.href.includes('/p'));
    if (!prefer) {
      return { ok:false, texts: links.map(a => (a.textContent||'').trim()).filter(t => /humanos|gest/i.test(t)).slice(0,20) };
    }
    prefer.click();
    return { ok:true, href: prefer.href, text: (prefer.textContent||'').trim().slice(0,100) };
  }`);
  mark("OPEN_COURSE", { msg: JSON.stringify(opened) });
  await new Promise((r) => setTimeout(r, 4500));
  return ev(`() => ({ href: location.href, title: document.title })`);
}

async function fillLeadAndSubmit() {
  // scroll lead into view
  await ev(`() => {
    const h = [...document.querySelectorAll('h1,h2,h3,p,button')].find(e => /inscreva-se|nome completo|telefone/i.test(e.textContent||''));
    h?.scrollIntoView({block:'center'});
    return true;
  }`);
  const filled = await ev(`() => {
    const set = (el,v) => {
      if (!el) return false;
      const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
      d.set.call(el,v);
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      el.dispatchEvent(new Event('blur',{bubbles:true}));
      return true;
    };
    const inputs = [...document.querySelectorAll('input')].filter(i => i.offsetParent && i.type !== 'hidden');
    const name = inputs.find(i => /nome/i.test(i.placeholder||i.name||i.id||i.getAttribute('aria-label')||''));
    const email = inputs.find(i => /mail/i.test(i.placeholder||i.name||i.type||''));
    const phone = inputs.find(i => /tel|phone|celular/i.test(i.placeholder||i.name||i.type||i.id||''));
    const terms = [...document.querySelectorAll('input[type=checkbox]')].filter(c => c.offsetParent)[0];
    if (terms && !terms.checked) terms.click();
    return {
      name: set(name, ${JSON.stringify(DATA.nomeCompleto)}),
      email: set(email, ${JSON.stringify(DATA.email)}),
      phone: set(phone, ${JSON.stringify(DATA.telefone)}),
      terms: !!(terms && terms.checked),
      vals: { n: name&&name.value, e: email&&email.value, p: phone&&phone.value }
    };
  }`);
  mark("LEAD", { msg: JSON.stringify(filled) });

  // click BUTTON Inscreva-se only (not <a>)
  const sub = await ev(`() => {
    const buttons = [...document.querySelectorAll('button')].filter(b => /inscreva-se/i.test(b.textContent||'') && b.offsetParent);
    // avoid footer-looking; prefer near form
    const btn = buttons[0];
    if (!btn) {
      const links = [...document.querySelectorAll('a')].filter(a => /inscreva-se/i.test(a.textContent||''));
      return { ok:false, buttons:0, links: links.map(a => a.href).slice(0,3) };
    }
    btn.click();
    return { ok:true, text: btn.textContent.trim() };
  }`);
  mark("LEAD_CLICK", { msg: JSON.stringify(sub) });
  await new Promise((r) => setTimeout(r, 4000));
  return ev(`() => {
    const hasPolo = /selecione um pa[ií]s|digite seu cep|selecione um polo/i.test(document.body.innerText||'');
    return { href: location.href, hasPolo };
  }`);
}

async function setLocation() {
  let s = await snap(120);
  let pais = refOf(s, /combobox \"Selecione um Pa/);
  if (pais) await run(["browser", "select", pais.ref, "Brasil"]);
  await new Promise((r) => setTimeout(r, 2000));
  s = await snap(120);
  let cep = refOf(s, /textbox \"Digite seu CEP\"|textbox \"CEP/);
  if (cep) {
    await run([
      "browser",
      "fill",
      "--fields",
      JSON.stringify([{ ref: cep.ref, value: DATA.cep }]),
    ]);
  }
  await new Promise((r) => setTimeout(r, 1500));
  s = await snap(150);
  let estado = refOf(s, /combobox \"Selecione um Estado\"/);
  if (estado) await run(["browser", "select", estado.ref, DATA.estado]);
  await new Promise((r) => setTimeout(r, 2500));
  s = await snap(220);
  let cidade = refOf(s, /combobox \"Selecione uma Cidade\"/);
  if (cidade) await run(["browser", "select", cidade.ref, DATA.cidade]);
  await new Promise((r) => setTimeout(r, 3000));
  s = await snap(300);
  const poloOpt = s.split(/\n/).find((l) => /option/.test(l) && /Freguesia/i.test(l));
  const poloText = poloOpt?.match(/option \"([^\"]+)/)?.[1];
  let polo = refOf(s, /combobox \"Selecione um Polo\"/);
  mark("POLO_OPT", { msg: poloText || "NOT_FOUND" });
  if (polo && poloText) await run(["browser", "select", polo.ref, poloText]);
  await new Promise((r) => setTimeout(r, 1500));
  s = await snap(40);
  let ver = refOf(s, /button \"Ver condição especial\"/);
  if (ver) await run(["browser", "click", ver.ref]);
  mark("VER_COND", { msg: ver?.ref });
  await new Promise((r) => setTimeout(r, 3000));
}

async function setIngresso() {
  let s = await snap(80);
  let ing = refOf(s, /combobox \"Selecione uma forma de ingresso\"/);
  if (ing) await run(["browser", "select", ing.ref, "Vestibular Múltipla Escolha"]);
  await new Promise((r) => setTimeout(r, 1000));
  s = await snap(80);
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
  return ev(`() => ({ href: location.href, title: document.title })`);
}

async function checkout() {
  await focusMyvtex();
  let st = await ev(`() => ({ href: location.href })`);
  if (!/#\/profile/.test(st.href || "")) {
    // maybe already payment/shipping
    if (!/checkout/.test(st.href || "")) {
      mark("NO_CHECKOUT", { href: st.href });
      return st;
    }
  }
  // profile
  if (/#\/profile|#\/email|#\/cart|$/.test(st.href || "") || /checkout/.test(st.href||"")) {
    if (/#\/cart/.test(st.href || "")) {
      // try go to profile via UI
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
      first: set(document.getElementById('client-first-name'), ${JSON.stringify(DATA.primeiroNome)}),
      last: set(document.getElementById('client-last-name'), ${JSON.stringify(DATA.ultimoNome)}),
      cpf: set(document.getElementById('client-document'), ${JSON.stringify(DATA.cpf)}),
      phone: set(document.getElementById('client-phone'), ${JSON.stringify(DATA.telefone)}),
      birth: set(document.getElementById('client-birthDate'), ${JSON.stringify(DATA.nascimentoIso)}),
      birthOk: document.getElementById('client-birthDate')?.className
    };
  }`);
  mark("PROFILE", { msg: JSON.stringify(profile) });
  let s = await snap(30);
  let ir = refOf(s, /button \"Ir para o Endereço\"/);
  if (ir) await run(["browser", "click", ir.ref]);
  await new Promise((r) => setTimeout(r, 4000));

  st = await ev(`() => ({ href: location.href })`);
  mark("AFTER_PROFILE", { href: st.href });
  if (!/#\/shipping/.test(st.href || "")) {
    await run(["browser", "navigate", "https://cruzeirodosul.myvtex.com/checkout/#/shipping"]);
    await new Promise((r) => setTimeout(r, 3000));
  }

  s = await snap(40);
  let cep = refOf(s, /textbox \"CEP/);
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
  await new Promise((r) => setTimeout(r, 800));
  s = await snap(30);
  let go = refOf(s, /Prosseguir|Ir para o pagamento/);
  if (go) await run(["browser", "click", go.ref]);
  await new Promise((r) => setTimeout(r, 4000));
  st = await ev(`() => ({ href: location.href, gratis: /grátis|gratis/i.test(document.body.innerText||'') })`);
  mark("PAYMENT", { href: st.href, msg: "gratis=" + st.gratis });

  s = await snap(30);
  let cont = refOf(s, /button \"Continuar Inscrição\"/);
  if (cont) await run(["browser", "click", cont.ref]);
  await new Promise((r) => setTimeout(r, 7000));
  return ev(`() => ({ href: location.href, title: document.title, text: (document.body.innerText||'').slice(0,400) })`);
}

async function captureProva() {
  // from orderPlaced
  let s = await snap(40);
  let cont = refOf(s, /Continuar Processo/);
  if (cont) {
    await run(["browser", "click", cont.ref]);
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
    return { hrefs: as.map(a => a.href), page: location.href, textHas: /Acessar prova/i.test(document.body.innerText||'') };
  }`);
  mark("CAPTURE", { msg: JSON.stringify(cap) });
  return cap;
}

async function main() {
  mark("START_V2");
  await focusMyvtex();
  await run(["browser", "navigate", "https://cruzeirodosul.myvtex.com/graduacao"]);
  await new Promise((r) => setTimeout(r, 3500));
  await ensureClientLogin();
  const pdp = await searchAndOpenCourse();
  mark("PDP", { href: pdp.href, msg: pdp.title });
  if (!/\/p(?:\?|$)/.test(pdp.href || "")) {
    mark("ABORT_NO_PDP", { href: pdp.href });
    console.log(JSON.stringify({ timeline, abort: true }, null, 2));
    return;
  }
  const lead = await fillLeadAndSubmit();
  mark("AFTER_LEAD", { href: lead.href, msg: "hasPolo=" + lead.hasPolo });
  if (!lead.hasPolo) {
    // maybe need scroll / retry button
    mark("LEAD_RETRY");
  }
  await setLocation();
  const ing = await setIngresso();
  mark("AFTER_INGRESSO", { href: ing.href });
  const order = await checkout();
  mark("ORDER", { href: order.href, msg: (order.text || "").slice(0, 180) });
  const cap = await captureProva();
  const artifact = {
    provaUrl: cap.hrefs?.[0] || null,
    elapsedSec: Math.round((Date.now() - t0) / 1000),
    timeline,
  };
  fs.writeFileSync(
    path.join(process.cwd(), "run-artifact-gaboloko.json"),
    JSON.stringify(artifact, null, 2)
  );
  console.log("\n=== ARTIFACT ===");
  console.log(JSON.stringify(artifact, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
