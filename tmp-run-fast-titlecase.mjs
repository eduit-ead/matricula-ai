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

/** Title Case: primeira maiúscula, resto minúscula por palavra */
function titleCase(s) {
  return String(s)
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

const RAW = {
  email: "gaboloko@gmail.com",
  nome: "Gabo LOKO",
  telefone: "11987124916",
  cep: "05001200",
  estado: "São Paulo",
  cidade: "São Paulo",
  cpf: "50928152057",
  birth: "1999-09-09",
};
const DATA = {
  ...RAW,
  nome: titleCase(RAW.nome), // Gabo Loko
  first: titleCase("Gabo"),
  last: titleCase("LOKO"),
  email: RAW.email.toLowerCase(),
};

const t0 = Date.now();
const timeline = [];
let last = t0;

function mark(step, extra = {}) {
  const now = Date.now();
  const e = {
    t: Math.round((now - t0) / 1000),
    dtMs: now - last,
    step,
    ...extra,
  };
  last = now;
  timeline.push(e);
  console.log(
    `[+${e.dtMs}ms | ${e.t}s] ${step}`,
    extra.why || extra.msg || extra.href || ""
  );
}

function run(args, timeoutMs = 60000) {
  const started = Date.now();
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
      resolve({ code: -1, out, err: err + "\nTIMEOUT", ms: Date.now() - started });
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out, err, ms: Date.now() - started });
    });
  });
}

async function ev(fn) {
  const r = await run(["browser", "evaluate", "--fn", fn]);
  const text = (r.out || "").trim();
  const i = text.search(/[\{\[]/);
  let parsed = null;
  if (i >= 0) {
    try {
      parsed = JSON.parse(text.slice(i));
    } catch {}
  }
  return { parsed, raw: text, ms: r.ms, err: r.err };
}

async function snap(limit = 60) {
  const r = await run([
    "browser",
    "snapshot",
    "--efficient",
    "--limit",
    String(limit),
  ]);
  return { text: r.out || "", ms: r.ms };
}

function refOf(text, re) {
  for (const line of text.split(/\n/)) {
    if (re.test(line)) {
      const m = line.match(/\[ref=(e\d+)\]/);
      if (m) return { ref: m[1], line: line.trim() };
    }
  }
  return null;
}

async function waitMs(ms, why) {
  mark("WAIT", { why, msg: `${ms}ms` });
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  mark("START", {
    why: "dados normalizados",
    msg: JSON.stringify({ nome: DATA.nome, first: DATA.first, last: DATA.last, email: DATA.email }),
  });

  await run(["browser", "focus", "t34"]);
  mark("FOCUS_T34", { why: "openclaw focus via gateway CDP" });

  // --- LOGIN cliente (não mexer no atendente) ---
  let r = await ev(`() => {
    const btn = document.querySelector('.cruzeirodosul-telemarketing-2-x-loginButton');
    if (btn) btn.click();
    return { ok: !!btn };
  }`);
  mark("OPEN_CLIENT_LOGIN", { why: "evaluate click telemarketing", msg: JSON.stringify(r.parsed) + ` cli=${r.ms}ms` });
  await waitMs(600, "popover telemarketing abrir");

  r = await ev(`() => {
    const portal = document.querySelector('.cruzeirodosul-telemarketing-2-x-portalContainer');
    const input = (portal && portal.querySelector('input'))
      || [...document.querySelectorAll('input')].find(i => (i.placeholder||'') === 'Ex: example@mail.com');
    if (!input) return { ok:false };
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    d.set.call(input, ${JSON.stringify(DATA.email)});
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    return { ok:true, value: input.value };
  }`);
  mark("TYPE_EMAIL", { why: "setter React no input telemarketing", msg: JSON.stringify(r.parsed) + ` cli=${r.ms}ms` });

  // snapshot só para ref do Entrar do portal
  let s = await snap(30);
  mark("SNAP_LOGIN", { why: "snapshot para ref Entrar", msg: `cli=${s.ms}ms` });
  let enter = refOf(s.text, /button \"Entrar\"/);
  if (enter) {
    const c = await run(["browser", "click", enter.ref]);
    mark("CLICK_ENTRAR", { why: "click ref Entrar", msg: `cli=${c.ms}ms` });
  } else {
    await ev(`() => {
      const b = [...document.querySelectorAll('button')].find(x => /^\\s*Entrar\\s*$/i.test(x.textContent||''));
      if (b) b.click();
      return { ok: !!b };
    }`);
    mark("CLICK_ENTRAR_DOM", { why: "fallback DOM" });
  }
  await waitMs(2000, "sessão cliente aplicar no header");

  r = await ev(`() => {
    const t = document.body.innerText||'';
    return { hasOla:/Olá/i.test(t), hasEmail:/gaboloko/i.test(t), attendant:(t.match(/Atendente:[^\\n]+/)||[])[0], hello:(t.match(/Olá[^\\n]{0,80}/)||[])[0] };
  }`);
  mark("LOGIN_OK", { why: "validação header", msg: JSON.stringify(r.parsed) });
  if (!r.parsed?.hasOla) {
    console.log("ABORT: login cliente falhou");
    process.exit(2);
  }

  // --- Busca Pedagogia ---
  r = await ev(`() => {
    const input = document.querySelector('#downshift-0-input')
      || [...document.querySelectorAll('input')].find(i => /o que você procura/i.test(i.placeholder||''));
    if (!input) return { ok:false };
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    d.set.call(input, 'pedagogia');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    return { ok:true };
  }`);
  mark("SEARCH_TYPE", { why: "preenche busca", msg: JSON.stringify(r.parsed) + ` cli=${r.ms}ms` });
  s = await snap(25);
  mark("SNAP_SEARCH", { why: "refs busca", msg: `cli=${s.ms}ms` });
  const searchBtn = refOf(s.text, /button \"Buscar produtos\"/);
  if (searchBtn) await run(["browser", "click", searchBtn.ref]);
  else await run(["browser", "press", "Enter"]);
  mark("SEARCH_SUBMIT", { why: "submit busca" });
  await waitMs(2500, "SERP carregar resultados");

  r = await ev(`() => {
    const links = [...document.querySelectorAll('a')].filter(a => {
      const t=(a.textContent||'').trim();
      return /pedagogia/i.test(t) && (/\\/p(?:\\?|$)/.test(a.href) || /grad-/i.test(a.href));
    });
    const seen=new Set(); const uniq=[];
    for (const a of links){ if(seen.has(a.href)) continue; seen.add(a.href); uniq.push(a); }
    if(!uniq.length) return { ok:false };
    uniq[0].click();
    return { ok:true, text:(uniq[0].textContent||'').trim().replace(/\\s+/g,' ').slice(0,100), href:uniq[0].href };
  }`);
  mark("OPEN_FIRST_COURSE", { why: "primeiro card Pedagogia", msg: JSON.stringify(r.parsed) + ` cli=${r.ms}ms` });
  await waitMs(3000, "PDP carregar");

  r = await ev(`() => ({ href: location.href, title: document.title })`);
  mark("PDP", { href: r.parsed?.href, msg: r.parsed?.title });
  if (!/\/p/.test(r.parsed?.href || "")) {
    console.log("ABORT: sem PDP");
    process.exit(3);
  }

  // --- Lead form (purchase box) — Title Case nome ---
  r = await ev(`() => {
    const set = (el,v) => {
      if (!el) return null;
      el.focus();
      const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
      d.set.call(el, v);
      el.dispatchEvent(new InputEvent('input',{bubbles:true,data:v,inputType:'insertText'}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      el.dispatchEvent(new Event('blur',{bubbles:true}));
      return el.value;
    };
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
    const pickClosest = (sel) => {
      const list = [...document.querySelectorAll(sel)].filter(i => i.offsetParent);
      if (!list.length || !btn) return list[0]||null;
      const br = btn.getBoundingClientRect();
      return list.sort((a,b) => Math.abs(a.getBoundingClientRect().top-br.top) - Math.abs(b.getBoundingClientRect().top-br.top))[0];
    };
    const nEl = pickClosest('input[name=completeName]');
    const eEl = pickClosest('input[name=email]');
    const pEl = pickClosest('input[name=cellphone]');
    const privacy = [...document.querySelectorAll('input[type=checkbox]')].find(c =>
      c.offsetParent && /Política de Privacidade/i.test(c.closest('label')?.innerText || c.parentElement?.innerText || '')
    );
    if (privacy && !privacy.checked) privacy.click();
    // force email on ALL purchase-box email inputs type=email near btn
    const emails = [...document.querySelectorAll('input[name=email]')].filter(i => i.offsetParent);
    const emailVals = emails.map(el => set(el, ${JSON.stringify(DATA.email)}));
    return {
      name: set(nEl, ${JSON.stringify(DATA.nome)}),
      phone: set(pEl, ${JSON.stringify(DATA.telefone)}),
      emailVals,
      privacy: !!(privacy&&privacy.checked),
      hasBtn: !!btn
    };
  }`);
  mark("LEAD_FILL", { why: "fill purchase-box + privacy", msg: JSON.stringify(r.parsed) + ` cli=${r.ms}ms` });

  // If email still empty, use fill via snapshot
  s = await snap(50);
  mark("SNAP_LEAD", { why: "refs lead se email falhou", msg: `cli=${s.ms}ms` });
  const emailEmpty = !(r.parsed?.emailVals || []).some((v) => v && /gaboloko/i.test(v));
  if (emailEmpty) {
    const fields = [];
    const nomeRef = refOf(s.text, /textbox \"Nome Completo\"/) || refOf(s.text, /textbox \"Nome\"/);
    const emailRef = refOf(s.text, /textbox \"E-mail\"/);
    const telRef = refOf(s.text, /textbox \"Telefone\"/);
    if (nomeRef) fields.push({ ref: nomeRef.ref, value: DATA.nome });
    if (emailRef) fields.push({ ref: emailRef.ref, value: DATA.email });
    if (telRef) fields.push({ ref: telRef.ref, value: DATA.telefone });
    if (fields.length) {
      const fr = await run(["browser", "fill", "--fields", JSON.stringify(fields)]);
      mark("LEAD_FILL_REFS", { why: "fallback openclaw fill", msg: `cli=${fr.ms}ms` });
    }
    const chk = refOf(s.text, /checkbox/);
    if (chk) await run(["browser", "click", chk.ref]);
  }

  r = await ev(`() => {
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1');
    if (!btn) return { ok:false };
    btn.click();
    return { ok:true };
  }`);
  mark("LEAD_SUBMIT", { why: "click cta_p1 (não link processo-seletivo)", msg: JSON.stringify(r.parsed) });
  await waitMs(2500, "UI polo/CEP após lead");

  r = await ev(`() => ({
    href: location.href,
    hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||''),
    vals: [...document.querySelectorAll('input')].filter(i=>i.offsetParent&&['text','email','tel'].includes(i.type)).slice(0,6).map(i=>({name:i.name,ph:i.placeholder,v:i.value}))
  })`);
  mark("AFTER_LEAD", { why: "gate polo", msg: JSON.stringify(r.parsed) });
  if (!r.parsed?.hasPolo) {
    fs.writeFileSync(
      "run-timing-pedagogia.json",
      JSON.stringify({ ok: false, reason: "lead_no_polo", DATA, timeline }, null, 2)
    );
    console.log("ABORT: lead não avançou para polo");
    process.exit(4);
  }

  // --- Localização ---
  s = await snap(80);
  mark("SNAP_LOC1", { why: "refs país/CEP", msg: `cli=${s.ms}ms` });
  let pais = refOf(s.text, /combobox \"Selecione um Pa/);
  if (pais) await run(["browser", "select", pais.ref, "Brasil"]);
  mark("SELECT_BRASIL", { why: "select país" });
  await waitMs(800, "opções estado após país");

  s = await snap(80);
  mark("SNAP_LOC2", { why: "refs CEP/estado", msg: `cli=${s.ms}ms` });
  let cep = refOf(s.text, /textbox \"Digite seu CEP\"/);
  if (cep)
    await run([
      "browser",
      "fill",
      "--fields",
      JSON.stringify([{ ref: cep.ref, value: DATA.cep }]),
    ]);
  let estado = refOf(s.text, /combobox \"Selecione um Estado\"/);
  if (estado) await run(["browser", "select", estado.ref, DATA.estado]);
  mark("ESTADO_CEP", { why: "CEP+estado" });
  await waitMs(1500, "cidades carregar");

  s = await snap(150);
  mark("SNAP_CIDADE", { why: "lista cidades grande", msg: `cli=${s.ms}ms` });
  let cidade = refOf(s.text, /combobox \"Selecione uma Cidade\"/);
  if (cidade) await run(["browser", "select", cidade.ref, DATA.cidade]);
  mark("CIDADE", { why: "select São Paulo" });
  await waitMs(2000, "polos carregar (API)");

  s = await snap(250);
  mark("SNAP_POLO", { why: "lista polos muito grande = snapshot lento", msg: `cli=${s.ms}ms` });
  const poloText = s.text
    .split(/\n/)
    .find((l) => /option/.test(l) && /Freguesia/i.test(l))
    ?.match(/option \"([^\"]+)/)?.[1];
  let polo = refOf(s.text, /combobox \"Selecione um Polo\"/);
  mark("POLO_OPT", { msg: poloText || "NOT_FOUND" });
  if (polo && poloText) await run(["browser", "select", polo.ref, poloText]);
  await waitMs(500, "UI estabilizar polo");

  s = await snap(30);
  let ver = refOf(s.text, /button \"Ver condição especial\"/);
  if (ver) await run(["browser", "click", ver.ref]);
  mark("VER_CONDICAO", { why: "avanço ingresso", msg: ver?.ref });
  await waitMs(1500, "combobox ingresso");

  s = await snap(50);
  mark("SNAP_INGRESSO", { why: "refs ingresso", msg: `cli=${s.ms}ms` });
  let ing = refOf(s.text, /combobox \"Selecione uma forma de ingresso\"/);
  if (ing) await run(["browser", "select", ing.ref, "Vestibular Múltipla Escolha"]);
  s = await snap(50);
  let nec = refOf(s.text, /combobox \"Possui alguma necessidade/);
  if (nec)
    await run([
      "browser",
      "select",
      nec.ref,
      "Não necessito de condições especiais",
    ]);
  s = await snap(25);
  let cont = refOf(s.text, /button \"Continuar inscrição\"/);
  if (cont) await run(["browser", "click", cont.ref]);
  mark("CONTINUAR_INSCRICAO", { why: "vai ao checkout", msg: cont?.ref });
  await waitMs(4000, "redirect checkout VTEX (rede)");

  r = await ev(`() => ({ href: location.href })`);
  mark("CHECKOUT", { href: r.parsed?.href });
  if (!/checkout/.test(r.parsed?.href || "")) {
    fs.writeFileSync(
      "run-timing-pedagogia.json",
      JSON.stringify({ ok: false, reason: "no_checkout", timeline }, null, 2)
    );
    process.exit(5);
  }

  if (!/#\/profile/.test(r.parsed?.href || "")) {
    await run(["browser", "navigate", "https://cruzeirodosul.myvtex.com/checkout/#/profile"]);
    await waitMs(2000, "navigate #/profile");
  }

  r = await ev(`() => {
    const set=(el,v)=>{ if(!el) return null; const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); el.dispatchEvent(new Event('blur',{bubbles:true})); return el.value; };
    return {
      first: set(document.getElementById('client-first-name'), ${JSON.stringify(DATA.first)}),
      last: set(document.getElementById('client-last-name'), ${JSON.stringify(DATA.last)}),
      cpf: set(document.getElementById('client-document'), ${JSON.stringify(DATA.cpf)}),
      phone: set(document.getElementById('client-phone'), ${JSON.stringify(DATA.telefone)}),
      birth: set(document.getElementById('client-birthDate'), ${JSON.stringify(DATA.birth)}),
      birthClass: document.getElementById('client-birthDate')?.className
    };
  }`);
  mark("PROFILE_FILL", { why: "ISO date + title case nomes", msg: JSON.stringify(r.parsed) + ` cli=${r.ms}ms` });
  s = await snap(25);
  let ir = refOf(s.text, /button \"Ir para o Endereço\"/);
  if (ir) await run(["browser", "click", ir.ref]);
  mark("IR_ENDERECO", { why: "profile → shipping" });
  await waitMs(2500, "shipping render");

  r = await ev(`() => ({ href: location.href })`);
  if (!/#\/shipping/.test(r.parsed?.href || "")) {
    await run(["browser", "navigate", "https://cruzeirodosul.myvtex.com/checkout/#/shipping"]);
    await waitMs(2000, "force shipping");
  }

  s = await snap(35);
  cep = refOf(s.text, /textbox \"CEP/);
  if (cep)
    await run([
      "browser",
      "fill",
      "--fields",
      JSON.stringify([{ ref: cep.ref, value: DATA.cep }]),
    ]);
  mark("SHIP_CEP", { why: "CEP entrega" });
  await waitMs(1500, "CEP resolve endereço");
  s = await snap(30);
  let sem = refOf(s.text, /checkbox \"Sem número\"/);
  if (sem) await run(["browser", "click", sem.ref]);
  s = await snap(25);
  let go = refOf(s.text, /Prosseguir|Ir para o pagamento/);
  if (go) await run(["browser", "click", go.ref]);
  mark("PROSSEGUIR", { why: "shipping → payment" });
  await waitMs(2500, "payment");

  r = await ev(`() => ({ href: location.href, gratis: /gr[aá]tis/i.test(document.body.innerText||'') })`);
  mark("PAYMENT", { href: r.parsed?.href, msg: "gratis=" + r.parsed?.gratis });
  s = await snap(25);
  cont = refOf(s.text, /button \"Continuar Inscrição\"/);
  if (cont) await run(["browser", "click", cont.ref]);
  mark("FINALIZAR", { why: "Continuar Inscrição" });
  await waitMs(5000, "orderPlaced (pedido)");

  r = await ev(`() => ({ href: location.href, text: (document.body.innerText||'').slice(0,400) })`);
  mark("ORDER", { href: r.parsed?.href, msg: (r.parsed?.text || "").slice(0, 180) });

  s = await snap(30);
  let contProc = refOf(s.text, /Continuar Processo/);
  if (contProc) await run(["browser", "click", contProc.ref]);
  mark("CONTINUAR_PROCESSO", { why: "vai minhas-inscricoes / nova aba" });
  await waitMs(3000, "account carregar");

  await run([
    "browser",
    "navigate",
    "https://cruzeirodosul.myvtex.com/account#/minhas-inscricoes/",
  ]);
  mark("NAV_INSCRICOES", { why: "garantir aba certa" });
  await waitMs(3000, "lista inscrições");

  s = await snap(40);
  let acomp = refOf(s.text, /Acompanhar Inscrição/);
  if (acomp) await run(["browser", "click", acomp.ref]);
  await waitMs(1500, "painel inscrição");

  // CAPTURE ONLY
  r = await ev(`() => {
    const as = [...document.querySelectorAll('a')].filter(a => /acessar prova/i.test(a.textContent||''));
    return { hrefs: as.map(a => a.href), has: /Acessar prova/i.test(document.body.innerText||''), page: location.href };
  }`);
  mark("CAPTURE_URL", {
    why: "gol=copiar href, NÃO clicar",
    msg: JSON.stringify(r.parsed),
  });

  const artifact = {
    ok: !!r.parsed?.hrefs?.[0],
    provaUrl: r.parsed?.hrefs?.[0] || null,
    elapsedSec: Math.round((Date.now() - t0) / 1000),
    data: DATA,
    timeline,
    delayNotes: [
      "Cada openclaw browser_* passa pelo Gateway CDP (~1–4s overhead).",
      "snapshot --efficient em listas de cidade/polo é o maior custo local.",
      "waits explícitos só para rede/UI VTEX (SERP, polos, checkout, orderPlaced).",
      "Title Case aplicado em nome/primeiro/último antes de preencher.",
    ],
  };
  fs.writeFileSync("run-timing-pedagogia.json", JSON.stringify(artifact, null, 2));
  console.log("\n=== ARTIFACT ===");
  console.log(JSON.stringify(artifact, null, 2));
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(
    "run-timing-pedagogia.json",
    JSON.stringify({ ok: false, error: String(e), timeline }, null, 2)
  );
  process.exit(1);
});
