/**
 * Capture Runner — objetivo: obter href da prova (nunca abrir).
 *
 * Passos (fail-stop, sem contorno):
 * 1. Confirmar Minhas Inscrições
 * 2. Poll (15–30s) inscrição / orderId
 * 3. Acompanhar Inscrição
 * 4. Esperar estabilizar
 * 5. Localizar "Acessar prova" e capturar só href
 *
 * Sem decisões de LLM. Não altera Runtime / Stages / Write Engine.
 */

/**
 * @param {object} input
 * @param {object} ctx
 */
export async function runCapture(input, ctx) {
  const {
    evaluate,
    run,
    sleep,
    mark = () => {},
    beginPhase = () => {},
    checkBudgets = () => true,
    recordWaitCondition = null,
  } = ctx;

  const timeouts = {
    enrollmentPollMs: Number(input.timeouts?.enrollmentPollMs) || 30000,
    stabilizeMs: Number(input.timeouts?.stabilizeMs) || 20000,
    provaMs: Number(input.timeouts?.provaMs) || 30000,
    pollMs: Number(input.timeouts?.pollMs) || 2000,
  };

  const expectedOrderId = input.orderId ? String(input.orderId) : null;

  const t0 = Date.now();
  const steps = [];
  const step = (name, extra = {}) => {
    const e = { t: Date.now() - t0, name, ...extra };
    steps.push(e);
    mark("CAPTURE_" + name, { msg: JSON.stringify(extra) });
  };

  const fail = (code, detail = null, partial = {}) => ({
    ok: false,
    code,
    failedStep: code,
    provaLink: partial.provaLink || null,
    numeroInscricao: partial.numeroInscricao || null,
    opened: false,
    elapsedMs: Date.now() - t0,
    steps,
    detail,
  });

  async function waitUntil(label, predFnSrc, maxMs) {
    const started = Date.now();
    let last = null;
    while (Date.now() - started < maxMs) {
      if (!checkBudgets()) {
        if (recordWaitCondition) recordWaitCondition(Date.now() - started);
        return { ok: false, reason: "BUDGET", last };
      }
      last = await evaluate(predFnSrc);
      if (last.parsed?.ready) {
        if (recordWaitCondition) recordWaitCondition(Date.now() - started);
        step("WAIT_OK", { label, elapsedMs: Date.now() - started, state: last.parsed });
        return { ok: true, last };
      }
      await sleep(timeouts.pollMs);
    }
    if (recordWaitCondition) recordWaitCondition(Date.now() - started);
    step("WAIT_TIMEOUT", { label, elapsedMs: Date.now() - started, last: last?.parsed || null });
    return { ok: false, reason: "TIMEOUT", last };
  }

  beginPhase("capture");
  step("START", { orderId: expectedOrderId });

  // 1) Confirmar Minhas Inscrições — sem navigate de garantia
  const where = await evaluate(`() => {
    const href = location.href || '';
    const body = document.body.innerText || '';
    const hasTitle = /Minhas Inscri/i.test(body);
    const hasAcompanhar = /Acompanhar Inscri/i.test(body);
    const onAccount = /\\/account/i.test(href);
    const onMinhas = /minhas-inscricoes/i.test(href) || hasTitle;
    return {
      href,
      onAccount,
      onMinhas,
      hasTitle,
      hasAcompanhar,
      ready: onAccount && (hasTitle || hasAcompanhar || /minhas-inscricoes/i.test(href)),
      snippet: body.slice(0, 200),
    };
  }`);
  step("CONFIRM_MINHAS", where.parsed);

  if (!where.parsed?.ready) {
    return fail("CAPTURE_NOT_ON_MINHAS", where.parsed);
  }

  // 2) Poll inscrição / orderId (não assume sincronização imediata)
  const orderNeedle = expectedOrderId
    ? expectedOrderId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    : null;

  const enrollmentWait = await waitUntil(
    "enrollment_visible",
    `() => {
      const body = document.body.innerText || '';
      const href = location.href || '';
      const inscrs = [...body.matchAll(/(\\d{10,}-\\d{2})/g)].map(m => m[1]);
      const orderId = ${orderNeedle ? `"${expectedOrderId}"` : "null"};
      const hasOrder =
        orderId
          ? body.includes(orderId) || inscrs.some(x => x.startsWith(orderId))
          : inscrs.length > 0;
      const hasAcompanhar = [...document.querySelectorAll('button,a,[role="button"]')]
        .some(el => /Acompanhar Inscri/i.test((el.textContent||'').trim()));
      const ready = hasOrder && hasAcompanhar;
      return {
        ready,
        href,
        inscrs: inscrs.slice(0, 5),
        hasOrder,
        hasAcompanhar,
        orderId,
        snippet: body.slice(0, 240),
      };
    }`,
    timeouts.enrollmentPollMs
  );

  if (!enrollmentWait.ok) {
    return fail("CAPTURE_INSCRICAO_NOT_FOUND", {
      reason: enrollmentWait.reason,
      last: enrollmentWait.last?.parsed || null,
      expectedOrderId,
    });
  }

  const numeroFromList =
    enrollmentWait.last?.parsed?.inscrs?.find((x) =>
      expectedOrderId ? x.startsWith(expectedOrderId) : true
    ) ||
    enrollmentWait.last?.parsed?.inscrs?.[0] ||
    null;

  step("ENROLLMENT_FOUND", {
    orderId: expectedOrderId,
    numeroInscricao: numeroFromList,
    state: enrollmentWait.last?.parsed,
  });

  // 3) Acompanhar Inscrição
  const clicked = await evaluate(`() => {
    const orderId = ${orderNeedle ? `"${expectedOrderId}"` : "null"};
    const buttons = [...document.querySelectorAll('button,a,[role="button"]')]
      .filter(el => /Acompanhar Inscri/i.test((el.textContent||'').trim()));
    if (!buttons.length) return { ok: false, reason: 'no_button' };

    // Prefer button near the matching order/inscription text
    let target = buttons[0];
    if (orderId) {
      for (const btn of buttons) {
        let root = btn;
        for (let i = 0; i < 6 && root; i++) {
          const txt = root.innerText || '';
          if (txt.includes(orderId)) {
            target = btn;
            break;
          }
          root = root.parentElement;
        }
      }
    }
    target.click();
    return { ok: true, count: buttons.length, orderId };
  }`);
  step("CLICK_ACOMPANHAR", clicked.parsed);

  if (!clicked.parsed?.ok) {
    return fail("CAPTURE_ACOMPANHAR_NOT_FOUND", clicked.parsed, {
      numeroInscricao: numeroFromList,
    });
  }

  // 4) Esperar estabilizar após Acompanhar (texto "Acessar prova" ou detalhe da inscrição)
  const stabilize = await waitUntil(
    "acompanhar_stabilize",
    `() => {
      const href = location.href || '';
      const body = document.body.innerText || '';
      const hasProva = /Acessar prova/i.test(body);
      const hasDetail =
        /Status|Situa[cç][aã]o|Forma de ingresso|Vestibular/i.test(body) &&
        /\\d{10,}-\\d{2}/.test(body);
      const ready = hasProva || hasDetail;
      return {
        ready,
        href,
        hasProva,
        hasDetail,
        snippet: body.slice(0, 200),
      };
    }`,
    timeouts.stabilizeMs
  );

  if (!stabilize.ok) {
    return fail(
      "CAPTURE_STABILIZE_TIMEOUT",
      {
        reason: stabilize.reason,
        last: stabilize.last?.parsed || null,
      },
      { numeroInscricao: numeroFromList }
    );
  }
  step("STABILIZED", stabilize.last?.parsed);

  // 5) Localizar "Acessar prova" e capturar href — nunca clicar
  const provaWait = await waitUntil(
    "prova_href",
    `() => {
      const as = [...document.querySelectorAll('a')]
        .filter(a => /acessar prova/i.test(a.textContent||''))
        .map(a => ({ href: a.href, text: (a.textContent||'').trim().slice(0, 40) }));
      const body = document.body.innerText || '';
      const inscr = (body.match(/\\d{10,}-\\d{2}/) || [])[0] || null;
      const ready = as.length > 0;
      return {
        ready,
        hrefs: as.map(x => x.href),
        links: as,
        inscr,
        hasProvaText: /Acessar prova/i.test(body),
        href: location.href,
      };
    }`,
    timeouts.provaMs
  );

  const provaLink = provaWait.last?.parsed?.hrefs?.[0] || null;
  const numeroInscricao =
    provaWait.last?.parsed?.inscr || numeroFromList || null;

  if (!provaWait.ok || !provaLink) {
    return fail(
      "CAPTURE_PROVA_LINK_NOT_FOUND",
      {
        reason: provaWait.reason,
        last: provaWait.last?.parsed || null,
      },
      { numeroInscricao }
    );
  }

  step("DONE", {
    stored: true,
    opened: false,
    provaLink,
    inscr: numeroInscricao,
  });

  return {
    ok: true,
    code: "OK",
    provaLink,
    numeroInscricao,
    opened: false,
    elapsedMs: Date.now() - t0,
    steps,
  };
}
