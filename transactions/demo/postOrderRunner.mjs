/**
 * PostOrder Runner — estado POST_ORDER
 *
 * Começa somente após pedido confirmado (ORDER_ID).
 * Objetivo: Continuar Processo → focar aba correta → Minhas Inscrições.
 *
 * Seleção de aba (nunca por ordem; nunca só por URL):
 * 1) tipo = page (não tracker/recaptcha/SW/blank)
 * 2) domínio Cruzeiro
 * 3) URL account
 * 4) conteúdo confirma "Minhas Inscrições"
 *
 * Não faz Capture. Sem decisões de LLM.
 * Não altera Runtime / Stages / Write Engine.
 */
import {
  observeContinuarProcessoTransition,
  parseTabs,
  classifyTab,
} from "./observeContinuarProcesso.mjs";

const NOISE_TYPES = new Set([
  "tracker",
  "recaptcha",
  "service_worker",
  "blank_or_unknown",
]);

function isPageType(tab) {
  const type = tab.type || classifyTab(tab.url || "", tab.blockPreview || "");
  return !NOISE_TYPES.has(type);
}

function matchesStructuralFilters(tab) {
  const u = tab.url || "";
  if (!isPageType(tab)) return false;
  if (!/cruzeirodosul\.myvtex\.com/i.test(u)) return false;
  if (!/\/account/i.test(u)) return false;
  return true;
}

/**
 * @param {object} input
 * @param {object} ctx
 */
export async function runPostOrder(input, ctx) {
  const {
    evaluate,
    run,
    snap,
    sleep,
    mark = () => {},
    beginPhase = () => {},
    checkBudgets = () => true,
    refOf,
    recordWaitCondition = null,
  } = ctx;

  const observeOnly = input.observeContinuarProcesso === true;

  const timeouts = {
    minhasInscricoesMs: Number(input.timeouts?.minhasInscricoesMs) || 45000,
    pollMs: Number(input.timeouts?.pollMs) || 2000,
    contentProbeMs: Number(input.timeouts?.contentProbeMs) || 8000,
  };

  const expectedOrderId = input.orderId ? String(input.orderId) : null;

  const t0 = Date.now();
  const steps = [];
  const step = (name, extra = {}) => {
    const e = { t: Date.now() - t0, name, ...extra };
    steps.push(e);
    mark("POST_ORDER_" + name, { msg: JSON.stringify(extra) });
  };

  const fail = (code, detail = null) => ({
    ok: false,
    code,
    orderId: expectedOrderId,
    openedNewTab: false,
    tabId: null,
    href: null,
    elapsedMs: Date.now() - t0,
    steps,
    detail,
  });

  async function probeMinhasContent() {
    return evaluate(`() => {
      const href = location.href || '';
      const body = document.body.innerText || '';
      const hasTitle = /Minhas Inscri/i.test(body);
      const hasAcompanhar = /Acompanhar Inscri/i.test(body);
      const onAccount = /\\/account/i.test(href);
      const ready = onAccount && (hasTitle || hasAcompanhar);
      return {
        ready,
        href,
        hasTitle,
        hasAcompanhar,
        onAccount,
        snippet: body.slice(0, 160),
      };
    }`);
  }

  /**
   * Candidatos estruturais → focus + conteúdo. Nunca escolhe só por URL/ordem.
   * Prefere abas novas (diff) mas valida conteúdo em cada uma.
   */
  async function findAndFocusCorrectTab(beforeIds, deadline) {
    const probed = new Set();
    const waitT0 = Date.now();
    let lastDetail = null;

    while (Date.now() < deadline) {
      if (!checkBudgets()) {
        if (recordWaitCondition) recordWaitCondition(Date.now() - waitT0);
        return { ok: false, reason: "BUDGET", lastDetail, probed: [...probed] };
      }

      const tabsRes = await run(["browser", "tabs"]);
      const tabsNow = parseTabs(tabsRes.out);
      const structural = tabsNow.filter(matchesStructuralFilters);
      const newFirst = [
        ...structural.filter((t) => !beforeIds.has(t.id)),
        ...structural.filter((t) => beforeIds.has(t.id)),
      ];
      // Dedup preserving preference (new before old), not raw tab-list order alone
      const seen = new Set();
      const candidates = [];
      for (const t of newFirst) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        candidates.push(t);
      }

      for (const cand of candidates) {
        if (probed.has(cand.id)) continue;
        probed.add(cand.id);

        await run(["browser", "focus", cand.id]);
        step("PROBE_TAB", {
          tabId: cand.id,
          url: cand.url,
          type: cand.type,
          isNew: !beforeIds.has(cand.id),
        });

        const contentDeadline = Date.now() + timeouts.contentProbeMs;
        let content = null;
        while (Date.now() < contentDeadline) {
          content = await probeMinhasContent();
          lastDetail = {
            tabId: cand.id,
            url: cand.url,
            content: content.parsed,
          };
          if (content.parsed?.ready) {
            if (recordWaitCondition) recordWaitCondition(Date.now() - waitT0);
            step("CORRECT_TAB", {
              tabId: cand.id,
              url: content.parsed.href,
              via: "content_confirmed",
              isNew: !beforeIds.has(cand.id),
            });
            return {
              ok: true,
              tabId: cand.id,
              href: content.parsed.href,
              openedNewTab: !beforeIds.has(cand.id),
              content: content.parsed,
            };
          }
          await sleep(timeouts.pollMs);
        }
        step("PROBE_TAB_REJECT", {
          tabId: cand.id,
          url: cand.url,
          content: content?.parsed || null,
        });
      }

      await sleep(timeouts.pollMs);
    }

    if (recordWaitCondition) recordWaitCondition(Date.now() - waitT0);
    return { ok: false, reason: "TIMEOUT", lastDetail, probed: [...probed] };
  }

  beginPhase("post_order");
  step("START", { orderId: expectedOrderId, observeOnly });

  const gate = await evaluate(`() => {
    const href = location.href || '';
    const body = document.body.innerText || '';
    const og = (href.match(/[?&]og=(\\d{8,})/i) || [])[1]
      || (body.match(/#\\s*(\\d{10,})(?:-\\d{2})?/) || [])[1]
      || null;
    const hasCta = [...document.querySelectorAll('button,a,[role="button"]')]
      .some(el => /Continuar Processo/i.test((el.textContent||'').trim()));
    const orderPath = /orderPlaced/i.test(href);
    return { href, og, hasCta, orderPath, snippet: body.slice(0, 200) };
  }`);

  if (!gate.parsed?.hasCta && !gate.parsed?.orderPath && !gate.parsed?.og) {
    return fail("POST_ORDER_NOT_READY", gate.parsed);
  }
  step("GATE", gate.parsed);

  const tabsBeforeRes = await run(["browser", "tabs"]);
  const tabsBefore = parseTabs(tabsBeforeRes.out);
  const beforeIds = new Set(tabsBefore.map((t) => t.id));
  step("TABS_BEFORE", {
    tabs: tabsBefore.map((t) => ({ id: t.id, type: t.type, url: t.url })),
  });

  const hrefBefore = gate.parsed?.href || null;
  const focusedTabBefore =
    tabsBefore.find((t) => hrefBefore && (t.url || "").includes("orderPlaced"))?.id ||
    tabsBefore.find((t) => /checkout/i.test(t.url || ""))?.id ||
    null;

  let s = await snap(30);
  let contProc = refOf(s.text, /Continuar Processo/);
  const tClick = Date.now();
  if (contProc) {
    await run(["browser", "click", contProc]);
    step("CLICK_CONTINUAR_PROCESSO", { ref: contProc, tClick });
  } else {
    const clicked = await evaluate(`() => {
      const b = [...document.querySelectorAll('button,a,[role="button"]')].find(x =>
        /Continuar Processo/i.test((x.textContent||'').trim()));
      if (b) b.click();
      return { ok: !!b };
    }`);
    if (!clicked.parsed?.ok) {
      return fail("POST_ORDER_CTA_NOT_FOUND", clicked.parsed);
    }
    step("CLICK_CONTINUAR_PROCESSO", { via: "dom", tClick });
  }

  if (observeOnly) {
    const { report, outPath } = await observeContinuarProcessoTransition({
      tabsBefore,
      tClick,
      orderId: expectedOrderId,
      hrefBeforeClick: hrefBefore,
      focusedTabBefore,
      ctx: { run, sleep, evaluate, mark, checkBudgets },
      timeouts: {
        pollMs: Number(input.timeouts?.obsPollMs) || 1000,
        stabilizeMs: Number(input.timeouts?.obsStabilizeMs) || 45000,
        stablePolls: 3,
      },
      runnerMetrics: input.runnerMetrics || null,
    });
    step("OBSERVE_DONE", {
      file: outPath,
      novaAba: report.continuarProcesso.novaAbaCriada,
      tabId: report.continuarProcesso.idNovaAba,
      urlFinal: report.continuarProcesso.urlFinal,
    });
    return {
      ok: false,
      code: "POST_ORDER_CONTINUAR_PROCESSO_OBS",
      orderId: expectedOrderId,
      openedNewTab: !!report.continuarProcesso.novaAbaCriada,
      tabId: report.continuarProcesso.idNovaAba,
      href: report.continuarProcesso.urlFinal,
      elapsedMs: Date.now() - t0,
      steps,
      detail: { reportPath: outPath, report },
    };
  }

  const found = await findAndFocusCorrectTab(
    beforeIds,
    Date.now() + timeouts.minhasInscricoesMs
  );

  if (!found.ok) {
    return fail("POST_ORDER_CORRECT_TAB_TIMEOUT", {
      reason: found.reason,
      lastDetail: found.lastDetail,
      probed: found.probed,
    });
  }

  step("MINHAS_INSCRICOES", {
    via: "content_confirmed",
    href: found.href,
    openedNewTab: found.openedNewTab,
    tabId: found.tabId,
  });

  return {
    ok: true,
    code: "OK",
    orderId: expectedOrderId,
    openedNewTab: found.openedNewTab,
    tabId: found.tabId,
    href: found.href,
    elapsedMs: Date.now() - t0,
    steps,
  };
}
