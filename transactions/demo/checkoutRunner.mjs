/**
 * Checkout Runner — objetivo de negócio: criar um pedido válido (ORDER_ID / og).
 *
 * Termina quando o pedido está confirmado (ID extraído), não por URL fixa.
 * Não faz Continuar Processo / Capture / Logout.
 *
 * Sem decisões de LLM. Não altera Runtime / Stages / Write Engine.
 */
import fs from "fs";
import path from "path";

/**
 * @param {object} input
 * @param {object} ctx
 * @returns {Promise<{
 *   ok: boolean,
 *   code: string,
 *   orderOk: boolean,
 *   orderId: string|null,
 *   orderHref: string|null,
 *   confirmationVia: string|null,
 *   elapsedMs: number,
 *   steps: object[],
 *   detail?: any
 * }>}
 */
export async function runCheckout(input, ctx) {
  const {
    evaluate,
    run,
    snap,
    sleep,
    mark = () => {},
    beginPhase = () => {},
    checkBudgets = () => true,
    refOf,
  } = ctx;

  const data = {
    first: input.first,
    last: input.last,
    cpf: String(input.cpf || "").replace(/\D/g, ""),
    telefone: String(input.telefone || "").replace(/\D/g, ""),
    birth: input.birth,
    cep: String(input.cep || "").replace(/\D/g, ""),
    semNumero: input.semNumero !== false,
  };

  const timeouts = {
    profileReadyMs: Number(input.timeouts?.profileReadyMs) || 30000,
    orderConfirmMs: Number(input.timeouts?.orderConfirmMs || input.timeouts?.orderPlacedMs) || 60000,
    pollMs: Number(input.timeouts?.pollMs) || 2000,
  };

  const instrumentContinuar = input.instrumentContinuarClick === true;

  const t0 = Date.now();
  const steps = [];
  const step = (name, extra = {}) => {
    const e = { t: Date.now() - t0, name, ...extra };
    steps.push(e);
    mark("CHECKOUT_" + name, { msg: JSON.stringify(extra) });
  };

  const fail = (code, detail = null) => ({
    ok: false,
    code,
    orderOk: false,
    orderId: null,
    orderHref: null,
    confirmationVia: null,
    elapsedMs: Date.now() - t0,
    steps,
    detail,
  });

  async function waitUntil(label, predFnSrc, maxMs) {
    const started = Date.now();
    let last = null;
    while (Date.now() - started < maxMs) {
      if (!checkBudgets()) {
        return { ok: false, reason: "BUDGET", last };
      }
      last = await evaluate(predFnSrc);
      if (last.parsed?.ready) {
        step("WAIT_OK", { label, elapsedMs: Date.now() - started, state: last.parsed });
        return { ok: true, last };
      }
      await sleep(timeouts.pollMs);
    }
    step("WAIT_TIMEOUT", { label, elapsedMs: Date.now() - started, last: last?.parsed || null });
    return { ok: false, reason: "TIMEOUT", last };
  }

  beginPhase("checkout");
  step("START");

  const hrefNow = await evaluate(`() => ({ href: location.href })`);
  if (!/checkout\/#\/profile/i.test(hrefNow.parsed?.href || "")) {
    await run([
      "browser",
      "navigate",
      "https://cruzeirodosul.myvtex.com/checkout/#/profile",
    ]);
    await sleep(2000);
  }

  const profileReady = await waitUntil(
    "profile_fields",
    `() => {
      const body = document.body.innerText || '';
      const emptyCart = /carrinho está vazio/i.test(body);
      const hasProfile = !!document.getElementById('client-first-name');
      let itemCount = 0;
      try {
        const of = window.vtexjs && window.vtexjs.checkout && window.vtexjs.checkout.orderForm;
        if (of && Array.isArray(of.items)) itemCount = of.items.length;
      } catch {}
      const ready = !emptyCart && hasProfile && (/checkout/i.test(location.href));
      return { ready, emptyCart, hasProfile, itemCount, href: location.href };
    }`,
    timeouts.profileReadyMs
  );

  if (!profileReady.ok) {
    if (profileReady.last?.parsed?.emptyCart) {
      return fail("CHECKOUT_CART_EMPTY", profileReady.last?.parsed);
    }
    return fail("CHECKOUT_PROFILE_NOT_READY", profileReady.last?.parsed);
  }

  const filled = await evaluate(`() => {
    const set=(el,v)=>{ if(!el) return false; const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); el.dispatchEvent(new Event('blur',{bubbles:true})); return true; };
    return {
      first: set(document.getElementById('client-first-name'), ${JSON.stringify(data.first)}),
      last: set(document.getElementById('client-last-name'), ${JSON.stringify(data.last)}),
      doc: set(document.getElementById('client-document'), ${JSON.stringify(data.cpf)}),
      phone: set(document.getElementById('client-phone'), ${JSON.stringify(data.telefone)}),
      birth: set(document.getElementById('client-birthDate'), ${JSON.stringify(data.birth)})
    };
  }`);
  step("PROFILE_FILLED", { values: filled.parsed });
  if (!filled.parsed?.first || !filled.parsed?.doc) {
    return fail("CHECKOUT_PROFILE_FILL_FAILED", filled.parsed);
  }

  let s = await snap(30);
  let ir = refOf(s.text, /button \"Ir para o Endereço\"/);
  if (ir) {
    await run(["browser", "click", ir]);
    step("CLICK_IR_ENDERECO", { ref: ir });
  } else {
    await evaluate(`() => {
      const b = [...document.querySelectorAll('button')].find(x =>
        /Ir para o Endereço/i.test((x.textContent||'').trim()));
      if (b) b.click();
      return { ok: !!b };
    }`);
    step("CLICK_IR_ENDERECO", { via: "dom" });
  }
  await sleep(1500);

  await run([
    "browser",
    "navigate",
    "https://cruzeirodosul.myvtex.com/checkout/#/shipping",
  ]);
  await sleep(1800);

  const shippingReady = await waitUntil(
    "shipping_cep",
    `() => {
      const body = document.body.innerText || '';
      const hasCep = /CEP/i.test(body);
      const emptyCart = /carrinho está vazio/i.test(body);
      const ready = /checkout/i.test(location.href) && hasCep && !emptyCart;
      return { ready, href: location.href, hasCep, emptyCart };
    }`,
    25000
  );
  if (!shippingReady.ok) {
    return fail("CHECKOUT_SHIPPING_NOT_READY", shippingReady.last?.parsed);
  }

  s = await snap(40);
  let cepRef = refOf(s.text, /textbox \"CEP/);
  if (cepRef) {
    await run([
      "browser",
      "fill",
      "--fields",
      JSON.stringify([{ ref: cepRef, value: data.cep }]),
    ]);
    step("SHIPPING_CEP", { ref: cepRef, cep: data.cep });
  } else {
    await evaluate(`() => {
      const el = document.getElementById('ship-postalCode')
        || [...document.querySelectorAll('input')].find(i => /cep|postal/i.test((i.id||'')+(i.name||'')+(i.placeholder||'')));
      if (!el) return { ok:false };
      const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
      d.set.call(el, ${JSON.stringify(data.cep)});
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      return { ok:true };
    }`);
    step("SHIPPING_CEP", { via: "dom", cep: data.cep });
  }
  await sleep(1200);

  if (data.semNumero) {
    s = await snap(30);
    let sem = refOf(s.text, /checkbox \"Sem número\"/);
    if (sem) {
      const line = s.text.split(/\n/).find((l) => /checkbox \"Sem número\"/.test(l));
      if (line && !/\[checked\]/.test(line)) {
        await run(["browser", "click", sem]);
        step("SHIPPING_SEM_NUMERO", { ref: sem });
      } else {
        step("SHIPPING_SEM_NUMERO", { already: true });
      }
    } else {
      await evaluate(`() => {
        const el = [...document.querySelectorAll('input[type=checkbox]')].find(c =>
          /sem número|sem numero/i.test((c.parentElement&&c.parentElement.textContent)||c.id||''));
        if (el && !el.checked) el.click();
        return { ok: !!el, checked: el && el.checked };
      }`);
      step("SHIPPING_SEM_NUMERO", { via: "dom" });
    }
  }

  s = await snap(25);
  let go = refOf(s.text, /Prosseguir|Ir para o pagamento/);
  if (go) {
    await run(["browser", "click", go]);
    step("CLICK_PROSSEGUIR", { ref: go });
  } else {
    await evaluate(`() => {
      const b = [...document.querySelectorAll('button,a')].find(x =>
        /Prosseguir|Ir para o pagamento/i.test((x.textContent||'').trim()));
      if (b) b.click();
      return { ok: !!b };
    }`);
    step("CLICK_PROSSEGUIR", { via: "dom" });
  }
  await sleep(2000);

  s = await snap(25);
  let cont = refOf(s.text, /button \"Continuar Inscrição\"/);
  if (cont) {
    await run(["browser", "click", cont]);
    step("CLICK_CONTINUAR_INSCRICAO", { ref: cont });
  } else {
    await evaluate(`() => {
      const b = [...document.querySelectorAll('button')].find(x =>
        /Continuar Inscrição/i.test((x.textContent||'').trim()));
      if (b) b.click();
      return { ok: !!b };
    }`);
    step("CLICK_CONTINUAR_INSCRICAO", { via: "dom" });
  }

  // DIAG opt-in — não bloqueia o fluxo Sprint Final por padrão
  if (instrumentContinuar) {
    const diag = await runContinuarDiag({ evaluate, run, sleep, step, diagFail: fail });
    return diag;
  }

  // Objetivo de negócio: pedido confirmado com ORDER_ID (og ou equivalente)
  const orderWait = await waitUntil(
    "order_confirmed",
    `() => {
      const href = location.href || '';
      const body = document.body.innerText || '';
      const ogFromUrl = (href.match(/[?&]og=(\\d{8,})/i) || [])[1] || null;
      const ogFromHash = (body.match(/#\\s*(\\d{10,})(?:-\\d{2})?/) || [])[1] || null;
      const ogFromPedido = (body.match(/pedido[^\\d]{0,20}(\\d{10,})/i) || [])[1] || null;
      const orderId = ogFromUrl || ogFromHash || ogFromPedido || null;
      const confirmedCopy = /pedido\\s*(recebido|confirmado|realizado)|obrigado|confirmação do pedido|order\\s*placed/i.test(body);
      const onOrderPath = /orderPlaced/i.test(href);
      // Fronteira = pedido válido com ID (URL não basta sozinha; ID sem confirmação fraca também não)
      const ready = !!(ogFromUrl) || !!(orderId && (onOrderPath || confirmedCopy));
      let via = null;
      if (ogFromUrl) via = 'og_query';
      else if (orderId && onOrderPath) via = 'order_path_id';
      else if (orderId && confirmedCopy) via = 'confirm_copy_id';
      return {
        ready,
        orderId,
        via,
        onOrderPath,
        confirmedCopy,
        href,
        snippet: body.slice(0, 220)
      };
    }`,
    timeouts.orderConfirmMs
  );

  if (!orderWait.ok || !orderWait.last?.parsed?.orderId) {
    const st = await evaluate(
      `() => ({ href: location.href, text: (document.body.innerText||'').slice(0,400) })`
    );
    step("ORDER_NOT_CONFIRMED", { state: st.parsed });
    return fail("ORDER_NOT_CONFIRMED", st.parsed);
  }

  const orderId = orderWait.last.parsed.orderId;
  const orderHref = orderWait.last.parsed.href || null;
  const confirmationVia = orderWait.last.parsed.via || null;
  step("ORDER_CONFIRMED", { orderId, orderHref, via: confirmationVia });

  return {
    ok: true,
    code: "OK",
    orderOk: true,
    orderId,
    orderHref,
    confirmationVia,
    elapsedMs: Date.now() - t0,
    steps,
  };
}

/** Instrumentação opcional (input.instrumentContinuarClick=true) — aborta sem corrigir. */
async function runContinuarDiag({ evaluate, run, sleep, step, diagFail }) {
  const diagDir = path.join(
    process.cwd(),
    `runner-checkout-diag-${new Date().toISOString().replace(/[:.]/g, "-")}`
  );
  fs.mkdirSync(diagDir, { recursive: true });

  const extractShotPath = (out) => {
    const text = String(out || "");
    const m =
      text.match(/([A-Za-z]:\\[^\r\n\"']+\.(?:png|jpe?g|webp))/i) ||
      text.match(/(~\\[^\r\n\"']+\.(?:png|jpe?g|webp))/i) ||
      text.match(/(\/[^\r\n\"']+\.(?:png|jpe?g|webp))/i) ||
      text.match(/([^\s\"']+\.(?:png|jpe?g|webp))/i);
    if (!m) return null;
    let p = m[1];
    if (p.startsWith("~\\") || p.startsWith("~/")) {
      p = path.join(
        process.env.USERPROFILE || process.env.HOME || "",
        p.slice(2).replace(/^[\\/]/, "")
      );
    }
    return p;
  };

  const takeScreenshot = async (label) => {
    const r = await run(["browser", "screenshot", "--full-page"]);
    const raw = `${r.out || ""}\n${r.err || ""}`.trim();
    fs.writeFileSync(path.join(diagDir, `${label}-screenshot-cli.txt`), raw, "utf8");
    const src = extractShotPath(raw);
    let dest = null;
    if (src && fs.existsSync(src)) {
      dest = path.join(diagDir, `${label}${path.extname(src) || ".png"}`);
      try {
        fs.copyFileSync(src, dest);
      } catch {
        dest = src;
      }
    }
    return { cliPath: src, savedAs: dest, raw: raw.slice(0, 500) };
  };

  const saveHtml = async (label) => {
    const htmlRes = await evaluate(`() => ({
      href: location.href,
      title: document.title,
      html: document.documentElement.outerHTML
    })`);
    const htmlFile = path.join(diagDir, `${label}.html`);
    let bytes = 0;
    if (htmlRes.parsed?.html) {
      fs.writeFileSync(htmlFile, htmlRes.parsed.html, "utf8");
      bytes = Buffer.byteLength(htmlRes.parsed.html, "utf8");
    } else {
      fs.writeFileSync(path.join(diagDir, `${label}.html.raw.txt`), htmlRes.raw || "", "utf8");
    }
    return { file: htmlFile, href: htmlRes.parsed?.href || null, bytes };
  };

  step("DIAG_START", { dir: diagDir });
  const shot0 = await takeScreenshot("01-immediate");
  const html0 = await saveHtml("01-immediate");
  await sleep(5000);
  const shot1 = await takeScreenshot("02-after-5s");
  const html1 = await saveHtml("02-after-5s");
  const probe = await evaluate(`() => ({
    href: location.href,
    errorMessages: [...new Set([...document.querySelectorAll('.error,.help.error,[role="alert"]')]
      .map(e => (e.textContent||'').replace(/\\s+/g,' ').trim()).filter(Boolean))].slice(0,20),
    invalidElementsCount: document.querySelectorAll(':invalid').length,
    recaptchaPresent: !!document.querySelector('iframe[src*="recaptcha"],.g-recaptcha,[class*="recaptcha"]')
  })`);
  const report = {
    capturedAt: new Date().toISOString(),
    dir: diagDir,
    t0: { screenshot: shot0, html: html0 },
    t1: { screenshot: shot1, html: html1 },
    diagnostics: probe.parsed || null,
  };
  fs.writeFileSync(path.join(diagDir, "diagnostics.json"), JSON.stringify(report, null, 2), "utf8");
  step("DIAG_DONE", { dir: diagDir });
  return diagFail("CHECKOUT_CONTINUAR_DIAG", report);
}
