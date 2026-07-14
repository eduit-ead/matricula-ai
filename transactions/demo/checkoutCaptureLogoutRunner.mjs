/**
 * Facade compatível: Checkout → PostOrder → Capture → Logout.
 *
 * Preferir chamar os runners separados no harness (Sprint Final).
 * Mantido para scripts legados que importam runCheckoutCaptureLogout.
 */
import { runCheckout } from "./checkoutRunner.mjs";
import { runPostOrder } from "./postOrderRunner.mjs";
import { runCapture } from "./captureRunner.mjs";

export async function runCheckoutCaptureLogout(input, ctx) {
  const {
    evaluate,
    run,
    sleep,
    mark = () => {},
    beginPhase = () => {},
  } = ctx;

  const t0 = Date.now();

  const checkout = await runCheckout(input, ctx);
  if (!checkout.ok) {
    return {
      ok: false,
      code: checkout.code,
      orderOk: false,
      orderId: null,
      orderHref: null,
      provaLink: null,
      numeroInscricao: null,
      logoutStatus: "nao_executado",
      logoutDetail: null,
      elapsedMs: Date.now() - t0,
      steps: checkout.steps,
      detail: checkout.detail,
    };
  }

  const post = await runPostOrder(
    { orderId: checkout.orderId, timeouts: input.timeouts },
    ctx
  );
  if (!post.ok) {
    return {
      ok: false,
      code: post.code,
      orderOk: true,
      orderId: checkout.orderId,
      orderHref: checkout.orderHref,
      provaLink: null,
      numeroInscricao: null,
      logoutStatus: "nao_executado",
      logoutDetail: null,
      elapsedMs: Date.now() - t0,
      steps: [...checkout.steps, ...post.steps],
      detail: post.detail,
    };
  }

  const capture = await runCapture(input, ctx);
  const logoutResult = await doLogout({ evaluate, run, sleep, mark, beginPhase });

  return {
    ok: capture.ok,
    code: capture.ok ? "OK" : capture.code,
    orderOk: true,
    orderId: checkout.orderId,
    orderHref: checkout.orderHref,
    provaLink: capture.provaLink,
    numeroInscricao: capture.numeroInscricao,
    logoutStatus: logoutResult.status,
    logoutDetail: logoutResult.detail,
    elapsedMs: Date.now() - t0,
    steps: [...checkout.steps, ...post.steps, ...capture.steps],
    detail: capture.detail || null,
  };
}

async function doLogout({ evaluate, run, sleep, mark, beginPhase }) {
  beginPhase("logout");
  try {
    await run([
      "browser",
      "navigate",
      "https://cruzeirodosul.myvtex.com/account",
    ]);
    await sleep(2000);
    const clicked = await evaluate(`() => {
      const candidates = [...document.querySelectorAll('a,button,[role="button"]')];
      const sair = candidates.find(el => /^\\s*Sair\\s*$/i.test((el.textContent||'').trim()));
      if (sair) { sair.click(); return { ok: true, via: 'Sair' }; }
      const tm = document.querySelector('.cruzeirodosul-telemarketing-2-x-loginButton')
        || [...document.querySelectorAll('button')].find(b => /sair|logout|trocar/i.test(b.textContent||''));
      if (tm) { tm.click(); return { ok: true, via: 'telemarketing' }; }
      return { ok: false };
    }`);
    await sleep(2000);
    const verify = await evaluate(`() => {
      const body = document.body.innerText || '';
      return {
        hasEntrar: /Entrar como cliente/i.test(body),
        hasOla: /Olá/i.test(body)
      };
    }`);
    let status = "falha";
    let detail = "botão Sair não encontrado";
    if (clicked.parsed?.ok && (verify.parsed?.hasEntrar || !verify.parsed?.hasOla)) {
      status = "ok";
      detail = `logout via ${clicked.parsed.via}`;
    } else if (clicked.parsed?.ok) {
      status = "parcial";
      detail = `clique ${clicked.parsed.via}; sessão pode persistir`;
    }
    mark("LOGOUT", { msg: `${status} — ${detail}` });
    return { status, detail };
  } catch (e) {
    return { status: "falha", detail: String(e?.message || e) };
  }
}
