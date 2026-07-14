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
  curso: "Gestão de recursos humanos",
  nomeCompleto: "Gabo LOKO",
  primeiroNome: "Gabo",
  ultimoNome: "LOKO",
  telefone: "11987124916",
  cep: "05001200",
  estado: "São Paulo",
  cidade: "São Paulo",
  poloPrefix: "São Paulo - Freguesia",
  cpf: "509.281.520-57",
  nascimentoIso: "1999-09-09",
  nascimentoBr: "09/09/1999",
};

const logPath = path.join(
  process.cwd(),
  `run-log-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
);
const timeline = [];
const t0 = Date.now();

function elapsed() {
  return Math.round((Date.now() - t0) / 1000);
}

function mark(step, detail = {}) {
  const entry = { tSec: elapsed(), step, ...detail };
  timeline.push(entry);
  console.log(`[${entry.tSec}s] ${step}`, detail.href || detail.msg || "");
  fs.writeFileSync(
    logPath,
    JSON.stringify({ t0Iso: new Date(t0).toISOString(), data: DATA, timeline, artifact: globalThis.__artifact || null }, null, 2)
  );
}

function run(args, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [mjs, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
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

async function evalFn(fnSource) {
  const r = await run(["browser", "evaluate", "--fn", fnSource]);
  const text = (r.out || r.err || "").trim();
  try {
    const jsonStart = text.indexOf("{");
    const jsonArr = text.indexOf("[");
    const start =
      jsonStart >= 0 && (jsonArr < 0 || jsonStart < jsonArr)
        ? jsonStart
        : jsonArr;
    if (start >= 0) return JSON.parse(text.slice(start));
  } catch {}
  return { raw: text, code: r.code };
}

async function focusContentTab() {
  const tabs = await run(["browser", "tabs"]);
  const text = tabs.out || "";
  const re =
    /\[use: (t\d+) tab: t\d+\]\s*\n\s*(https:\/\/cruzeirodosul\.myvtex\.com[^\s]*)/gi;
  let m;
  const found = [];
  while ((m = re.exec(text))) found.push({ id: m[1], url: m[2] });
  // also match title lines
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const um = lines[i].match(/\[use: (t\d+)/);
    const urlLine = lines[i + 1] || lines[i];
    if (um && /cruzeirodosul\.myvtex\.com/.test(urlLine) && !/recaptcha|doubleclick|gtm\.|criteo|fls\./i.test(urlLine)) {
      found.push({ id: um[1], url: urlLine.trim() });
    }
  }
  const prefer =
    found.find((f) => /account#\/minhas-inscricoes/.test(f.url)) ||
    found.find((f) => /checkout/.test(f.url)) ||
    found.find((f) => /grad-/.test(f.url)) ||
    found.find((f) => /graduacao/.test(f.url)) ||
    found[0];
  if (prefer) {
    await run(["browser", "focus", prefer.id]);
    return prefer;
  }
  return null;
}

async function snap(limit = 80) {
  const r = await run([
    "browser",
    "snapshot",
    "--efficient",
    "--limit",
    String(limit),
  ]);
  return r.out || "";
}

function findRef(snapText, patterns) {
  const lines = snapText.split(/\r?\n/);
  for (const p of patterns) {
    const re = typeof p === "string" ? new RegExp(p, "i") : p;
    for (const line of lines) {
      if (re.test(line)) {
        const m = line.match(/\[ref=(e\d+)\]/);
        if (m) return { ref: m[1], line: line.trim() };
      }
    }
  }
  return null;
}

async function fillFields(fields) {
  return run([
    "browser",
    "fill",
    "--fields",
    JSON.stringify(fields),
  ]);
}

async function main() {
  mark("START");
  await run(["browser", "navigate", "https://cruzeirodosul.myvtex.com/graduacao"]);
  await new Promise((r) => setTimeout(r, 4000));
  let tab = await focusContentTab();
  mark("NAV_GRADUACAO", { href: tab?.url, tab: tab?.id });

  // --- Identify candidate ---
  const loginFn = `() => {
    const btn = document.querySelector('.cruzeirodosul-telemarketing-2-x-loginButton');
    if (btn) btn.click();
    return { clicked: !!btn };
  }`;
  await evalFn(loginFn);
  await new Promise((r) => setTimeout(r, 1500));
  const setEmail = `() => {
    const input = document.querySelector('input[placeholder*="example@mail" i], input[placeholder*="mail" i]');
    if (!input) return { ok:false };
    const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value');
    d.set.call(input, ${JSON.stringify(DATA.email)});
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    const buttons = [...document.querySelectorAll('button')];
    const enter = buttons.find(b => /^(Entrar|OK|Confirmar)$/i.test((b.textContent||'').trim()));
    if (enter) enter.click();
    return { ok:true, value: input.value, clickedEnter: !!enter };
  }`;
  let r = await evalFn(setEmail);
  mark("LOGIN_EMAIL", { msg: JSON.stringify(r) });
  await new Promise((r) => setTimeout(r, 3000));

  // validate header
  r = await evalFn(
    `() => ({ href: location.href, header: (document.body.innerText||'').match(/Olá[^\\n]{0,80}|Entrar como cliente|Atendente:[^\\n]+/)?.[0] })`
  );
  mark("LOGIN_CHECK", { msg: JSON.stringify(r) });

  // --- Search course ---
  let snapText = await snap(60);
  let search = findRef(snapText, [/textbox.*[Bb]usca/, /searchbox/, /textbox \[ref=/]);
  // try evaluate search
  const searchFn = `() => {
    const inputs = [...document.querySelectorAll('input')].filter(i => i.offsetParent && (i.type==='search' || /busca|pesquis/i.test(i.placeholder||'') || /busca|search/i.test(i.getAttribute('aria-label')||'')));
    const input = inputs[0] || document.querySelector('input[type=search]');
    if (!input) return { ok:false, inputs: [...document.querySelectorAll('input')].slice(0,8).map(i=>({ph:i.placeholder,t:i.type,aria:i.getAttribute('aria-label')})) };
    const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value');
    d.set.call(input, ${JSON.stringify(DATA.curso)});
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    input.focus();
    const form = input.closest('form');
    if (form) form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
    input.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
    return { ok:true, value: input.value };
  }`;
  r = await evalFn(searchFn);
  mark("SEARCH", { msg: JSON.stringify(r) });
  await new Promise((r) => setTimeout(r, 4000));

  // click course card
  snapText = await snap(100);
  let course = findRef(snapText, [
    /Gestão de [Rr]ecursos [Hh]umanos/,
    /Recursos Humanos/,
  ]);
  if (course) {
    await run(["browser", "click", course.ref]);
    mark("OPEN_PDP", { msg: course.line });
  } else {
    // navigate by evaluate link
    r = await evalFn(`() => {
      const a = [...document.querySelectorAll('a')].find(x => /recursos humanos/i.test(x.textContent||'') && /grad-/i.test(x.href||''));
      if (a) { a.click(); return { ok:true, href:a.href, text:a.textContent.trim().slice(0,80)}; }
      const a2 = [...document.querySelectorAll('a')].find(x => /recursos humanos/i.test(x.textContent||''));
      if (a2) { a2.click(); return { ok:true, href:a2.href, text:a2.textContent.trim().slice(0,80)}; }
      return { ok:false, samples: [...document.querySelectorAll('a')].map(a=>a.textContent.trim()).filter(t=>/gest|human|admin/i.test(t)).slice(0,15)};
    }`);
    mark("OPEN_PDP_EVAL", { msg: JSON.stringify(r) });
  }
  await new Promise((r) => setTimeout(r, 4000));
  r = await evalFn(`() => ({ href: location.href, title: document.title })`);
  mark("PDP", { href: r.href, msg: r.title });

  // --- Lead form ---
  const fillLead = `() => {
    const set = (el,v) => {
      if (!el) return false;
      const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value');
      d.set.call(el,v);
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      el.dispatchEvent(new Event('blur',{bubbles:true}));
      return true;
    };
    const byPh = (re) => [...document.querySelectorAll('input')].find(i => re.test(i.placeholder||'') || re.test(i.name||'') || re.test(i.id||'') || re.test(i.getAttribute('aria-label')||''));
    const name = byPh(/nome/i);
    const email = byPh(/e-?mail/i);
    const phone = byPh(/telefone|phone|celular/i);
    const checks = [...document.querySelectorAll('input[type=checkbox]')];
    const terms = checks.find(c => /priva|termo|lgpd|aceito/i.test((c.parentElement?.innerText||'') + (c.getAttribute('aria-label')||''))) || checks[0];
    const btn = [...document.querySelectorAll('button')].find(b => /inscreva-se/i.test(b.textContent||'') && b.type !== 'hidden');
    return {
      name: set(name, ${JSON.stringify(DATA.nomeCompleto)}),
      email: set(email, ${JSON.stringify(DATA.email)}),
      phone: set(phone, ${JSON.stringify(DATA.telefone)}),
      terms: terms ? (terms.checked || (terms.click(), true)) : false,
      btnText: btn && (btn.textContent||'').trim(),
      values: { name: name&&name.value, email: email&&email.value, phone: phone&&phone.value, terms: terms&&terms.checked }
    };
  }`;
  r = await evalFn(fillLead);
  mark("LEAD_FILL", { msg: JSON.stringify(r) });
  snapText = await snap(40);
  // Prefer button Inscreva-se over link
  let inscBtn = null;
  for (const line of snapText.split(/\n/)) {
    if (/button \"Inscreva-se\"/i.test(line)) {
      inscBtn = line.match(/\[ref=(e\d+)\]/)?.[1];
      break;
    }
  }
  if (!inscBtn) {
    // click via DOM button not link
    r = await evalFn(`() => {
      const btns = [...document.querySelectorAll('button')].filter(b => /inscreva-se/i.test(b.textContent||''));
      const btn = btns[0];
      if (!btn) return { ok:false };
      btn.click();
      return { ok:true, text: btn.textContent.trim() };
    }`);
    mark("LEAD_SUBMIT_DOM", { msg: JSON.stringify(r) });
  } else {
    await run(["browser", "click", inscBtn]);
    mark("LEAD_SUBMIT", { msg: "ref " + inscBtn });
  }
  await new Promise((r) => setTimeout(r, 4000));

  // --- Location ---
  const setLoc = `async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const selects = [...document.querySelectorAll('select')];
    const setSelect = (sel, pred) => {
      if (!sel) return false;
      const opt = [...sel.options].find(pred);
      if (!opt) return false;
      sel.value = opt.value;
      sel.dispatchEvent(new Event('input',{bubbles:true}));
      sel.dispatchEvent(new Event('change',{bubbles:true}));
      return opt.text;
    };
    const byLabel = (re) => {
      for (const lab of document.querySelectorAll('label')) {
        if (re.test(lab.textContent||'')) {
          const id = lab.getAttribute('for');
          if (id) return document.getElementById(id);
          return lab.querySelector('select,input');
        }
      }
      return null;
    };
    const pais = byLabel(/pa[ií]s/i) || selects[0];
    const cep = byLabel(/cep/i) || document.querySelector('input[placeholder*=CEP i], input[placeholder*=cep i]');
    const estado = byLabel(/estado/i);
    const cidade = byLabel(/cidade/i);
    const polo = byLabel(/polo/i);
    const set = (el,v) => {
      if (!el) return false;
      const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value');
      d.set.call(el,v);
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      el.dispatchEvent(new Event('blur',{bubbles:true}));
      return true;
    };
    const out = {};
    out.pais = setSelect(pais, o => /brasil/i.test(o.text));
    await wait(800);
    out.cep = set(cep, ${JSON.stringify(DATA.cep)});
    await wait(500);
    out.estado = setSelect(document.querySelector('select') && byLabel(/estado/i) || estado, o => /s[aã]o paulo/i.test(o.text));
    await wait(1500);
    out.cidade = setSelect(byLabel(/cidade/i) || cidade, o => /^s[aã]o paulo$/i.test(o.text.trim()));
    await wait(1500);
    const poloSel = byLabel(/polo/i) || polo;
    out.polo = setSelect(poloSel, o => /freguesia/i.test(o.text));
    out.poloOptionsSample = poloSel ? [...poloSel.options].map(o=>o.text).filter(t=>/freguesia|barra/i.test(t)).slice(0,5) : [];
    return out;
  }`;
  // evaluate may not support async well - use sync with less waits via openclaw waits outside
  snapText = await snap(100);
  let pais = findRef(snapText, [/combobox \"Selecione um Pa/]);
  if (pais) {
    await run(["browser", "select", pais.ref, "Brasil"]);
    await new Promise((r) => setTimeout(r, 2000));
  }
  snapText = await snap(100);
  let cepBox = findRef(snapText, [/textbox \"Digite seu CEP\"/, /textbox \"CEP/]);
  if (cepBox) {
    await fillFields([{ ref: cepBox.ref, value: DATA.cep }]);
    await new Promise((r) => setTimeout(r, 1500));
  }
  snapText = await snap(120);
  let estado = findRef(snapText, [/combobox \"Selecione um Estado\"/]);
  if (estado) {
    await run(["browser", "select", estado.ref, DATA.estado]);
    await new Promise((r) => setTimeout(r, 2500));
  }
  snapText = await snap(200);
  // city São Paulo - need exact
  let cidadeCb = findRef(snapText, [/combobox \"Selecione uma Cidade\"/]);
  if (cidadeCb) {
    await run(["browser", "select", cidadeCb.ref, DATA.cidade]);
    await new Promise((r) => setTimeout(r, 3000));
  }
  snapText = await snap(250);
  // find polo option with Freguesia
  const poloLine = snapText.split(/\n/).find((l) => /Freguesia/i.test(l) && /option/.test(l));
  const poloOptText = poloLine?.match(/option \"([^\"]+)\"/)?.[1];
  let poloCb = findRef(snapText, [/combobox \"Selecione um Polo\"/]);
  if (poloCb && poloOptText) {
    await run(["browser", "select", poloCb.ref, poloOptText]);
    mark("POLO", { msg: poloOptText });
  } else {
    mark("POLO_FAIL", { msg: "line=" + (poloLine || "none") });
  }
  await new Promise((r) => setTimeout(r, 1500));
  snapText = await snap(40);
  let verCond = findRef(snapText, [/button \"Ver condição especial\"/]);
  if (verCond) {
    await run(["browser", "click", verCond.ref]);
    mark("VER_CONDICAO", { msg: verCond.ref });
  }
  await new Promise((r) => setTimeout(r, 3000));

  // --- Ingresso ---
  snapText = await snap(60);
  let ingresso = findRef(snapText, [/combobox \"Selecione uma forma de ingresso\"/]);
  if (ingresso) {
    await run(["browser", "select", ingresso.ref, "Vestibular Múltipla Escolha"]);
  }
  let nec = findRef(snapText, [/combobox \"Possui alguma necessidade/]);
  // re-snap after first select may change refs
  snapText = await snap(60);
  nec = findRef(snapText, [/combobox \"Possui alguma necessidade/]);
  if (nec) {
    await run(["browser", "select", nec.ref, "Não necessito de condições especiais"]);
  }
  snapText = await snap(40);
  let cont = findRef(snapText, [/button \"Continuar inscrição\"/]);
  if (cont) {
    await run(["browser", "click", cont.ref]);
    mark("CONTINUAR_INSCRICAO_PDP", { msg: cont.ref });
  }
  await new Promise((r) => setTimeout(r, 5000));
  r = await evalFn(`() => ({ href: location.href, title: document.title })`);
  mark("CHECKOUT_PROFILE", { href: r.href });

  // ensure on profile
  await focusContentTab();
  if (!/checkout/.test(r.href || "")) {
    await run(["browser", "navigate", "https://cruzeirodosul.myvtex.com/checkout/#/profile"]);
    await new Promise((r) => setTimeout(r, 3000));
  }

  // --- Profile fill ---
  const setProfile = `() => {
    const set = (el,v) => {
      if (!el) return false;
      const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value');
      d.set.call(el,v);
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      el.dispatchEvent(new Event('blur',{bubbles:true}));
      return el.value;
    };
    return {
      first: set(document.getElementById('client-first-name'), ${JSON.stringify(DATA.primeiroNome)}),
      last: set(document.getElementById('client-last-name'), ${JSON.stringify(DATA.ultimoNome)}),
      cpf: set(document.getElementById('client-document'), ${JSON.stringify(DATA.cpf)}),
      phone: set(document.getElementById('client-phone'), ${JSON.stringify(DATA.telefone)}),
      birth: set(document.getElementById('client-birthDate'), ${JSON.stringify(DATA.nascimentoIso)}),
      birthClass: document.getElementById('client-birthDate')?.className
    };
  }`;
  r = await evalFn(setProfile);
  mark("PROFILE_FILL", { msg: JSON.stringify(r) });
  snapText = await snap(30);
  let irEnd = findRef(snapText, [/button \"Ir para o Endereço\"/]);
  if (irEnd) await run(["browser", "click", irEnd.ref]);
  await new Promise((r) => setTimeout(r, 4000));
  r = await evalFn(`() => ({ href: location.href })`);
  mark("SHIPPING", { href: r.href });

  // shipping CEP + sem numero
  snapText = await snap(40);
  cepBox = findRef(snapText, [/textbox \"CEP/]);
  if (cepBox) {
    await fillFields([{ ref: cepBox.ref, value: DATA.cep }]);
    await new Promise((r) => setTimeout(r, 2500));
  }
  snapText = await snap(40);
  let semNum = findRef(snapText, [/checkbox \"Sem número\"/]);
  if (semNum) await run(["browser", "click", semNum.ref]);
  await new Promise((r) => setTimeout(r, 800));
  snapText = await snap(30);
  let prosseguir = findRef(snapText, [/button \".*Prosseguir/, /Ir para o pagamento/]);
  if (prosseguir) await run(["browser", "click", prosseguir.ref]);
  await new Promise((r) => setTimeout(r, 4000));
  r = await evalFn(`() => ({ href: location.href, text: (document.body.innerText||'').includes('grátis') })`);
  mark("PAYMENT", { href: r.href, msg: "gratis?" + r.text });

  snapText = await snap(30);
  let contPag = findRef(snapText, [/button \"Continuar Inscrição\"/]);
  if (contPag) await run(["browser", "click", contPag.ref]);
  await new Promise((r) => setTimeout(r, 6000));
  r = await evalFn(`() => ({ href: location.href, title: document.title, text: (document.body.innerText||'').slice(0,500) })`);
  mark("ORDER", { href: r.href, msg: (r.text || "").slice(0, 200) });

  // Continuar Processo
  snapText = await snap(40);
  let contProc = findRef(snapText, [/Continuar Processo/]);
  if (contProc) {
    await run(["browser", "click", contProc.ref]);
    mark("CONTINUAR_PROCESSO", { msg: contProc.ref });
  }
  await new Promise((r) => setTimeout(r, 5000));

  // find minhas inscricoes tab
  tab = await focusContentTab();
  // navigate explicitly if needed
  r = await evalFn(`() => ({ href: location.href })`);
  if (!/minhas-inscricoes/.test(r.href || "")) {
    await run([
      "browser",
      "navigate",
      "https://cruzeirodosul.myvtex.com/account#/minhas-inscricoes/",
    ]);
    await new Promise((r) => setTimeout(r, 4000));
  }
  mark("MINHAS_INSCRICOES", {
    href: (await evalFn(`() => ({ href: location.href })`)).href,
  });

  snapText = await snap(50);
  let acomp = findRef(snapText, [/button \"Acompanhar Inscrição\"/]);
  if (acomp) {
    await run(["browser", "click", acomp.ref]);
    await new Promise((r) => setTimeout(r, 3000));
  }

  // CAPTURE prova URL — DO NOT CLICK
  const capture = `() => {
    const links = [...document.querySelectorAll('a')].filter(a => /acessar prova/i.test(a.textContent||''));
    return {
      hrefs: links.map(a => a.href),
      count: links.length,
      page: location.href
    };
  }`;
  r = await evalFn(capture);
  globalThis.__artifact = {
    provaUrl: r.hrefs?.[0] || null,
    all: r.hrefs || [],
    capturedAt: new Date().toISOString(),
    elapsedSec: elapsed(),
  };
  mark("PROVA_URL_CAPTURED", {
    msg: globalThis.__artifact.provaUrl ? "OK" : "MISSING",
    href: globalThis.__artifact.provaUrl,
  });

  mark("DONE", { msg: JSON.stringify(globalThis.__artifact) });
  console.log("\n=== ARTIFACT ===");
  console.log(JSON.stringify(globalThis.__artifact, null, 2));
  console.log("LOG:", logPath);
}

main().catch((e) => {
  console.error(e);
  mark("FATAL", { msg: String(e) });
  process.exit(1);
});
