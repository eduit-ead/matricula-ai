/**
 * Observação only — transição "Continuar Processo".
 * Não foca aba, não navega, não corrige fluxo.
 */
import fs from "fs";
import path from "path";

function classifyTab(url, block = "") {
  const u = `${url} ${block}`;
  if (/recaptcha/i.test(u)) return "recaptcha";
  if (/serviceWorker|service_worker|sw_iframe|sw\.js/i.test(u)) return "service_worker";
  if (/doubleclick|googletagmanager|gtm\.|criteo|fls\./i.test(u)) return "tracker";
  if (/orderPlaced/i.test(u)) return "order_placed";
  if (/account.*minhas-inscricoes|minhas-inscricoes/i.test(u)) return "minhas_inscricoes";
  if (/\/account/i.test(u) && /myvtex/i.test(u)) return "account";
  if (/checkout/i.test(u) && /myvtex/i.test(u)) return "checkout";
  if (/myvtex\.com/i.test(u)) return "myvtex_content";
  if (/^about:blank/i.test(u) || !String(url || "").trim()) return "blank_or_unknown";
  return "other";
}

function parseTabs(tabsOut) {
  const text = String(tabsOut || "");
  const blocks = text.split(/\n(?=\d+\.)/);
  const tabs = [];
  for (const block of blocks) {
    const m = block.match(/\[use:\s*(t\d+)/);
    if (!m) continue;
    const urlMatch =
      block.match(/https?:\/\/[^\s\]]+/i) ||
      block.match(/\n\s+(https?:\/\/\S+)/i);
    const url = urlMatch ? urlMatch[0].trim() : "";
    const titleMatch = block.match(/^\s*\d+\.\s+(.+?)(?:\s+\[use:|\n)/);
    tabs.push({
      id: m[1],
      url,
      title: titleMatch ? titleMatch[1].trim().slice(0, 120) : null,
      type: classifyTab(url, block),
      blockPreview: block.slice(0, 200).replace(/\s+/g, " "),
    });
  }
  return tabs;
}

function isMinhasInscricoesUrl(url) {
  return /minhas-inscricoes/i.test(url || "") || /account#\/minhas-inscri/i.test(url || "");
}

function urlsEqual(a, b) {
  return String(a || "").replace(/\/$/, "") === String(b || "").replace(/\/$/, "");
}

/**
 * @param {object} args
 * @param {object[]} args.tabsBefore
 * @param {number} args.tClick
 * @param {string|null} args.orderId
 * @param {string|null} args.hrefBeforeClick
 * @param {object} args.ctx — { run, sleep, evaluate, mark, checkBudgets }
 * @param {object} [args.timeouts]
 * @param {object} [args.runnerMetrics]
 */
export async function observeContinuarProcessoTransition(args) {
  const {
    tabsBefore,
    tClick,
    orderId = null,
    hrefBeforeClick = null,
    focusedTabBefore = null,
    ctx,
    timeouts = {},
    runnerMetrics = null,
  } = args;
  const { run, sleep, evaluate, mark = () => {}, checkBudgets = () => true } = ctx;

  const pollMs = Number(timeouts.pollMs) || 1000;
  const stabilizeMs = Number(timeouts.stabilizeMs) || 45000;
  const stableNeeded = Number(timeouts.stablePolls) || 3;

  const beforeIds = new Set((tabsBefore || []).map((t) => t.id));
  const t0 = tClick || Date.now();

  const timeline = [];
  const push = (event, extra = {}) => {
    const row = { tMs: Date.now() - t0, wall: new Date().toISOString(), event, ...extra };
    timeline.push(row);
    mark("CONTINUAR_PROCESSO_OBS_" + event, { msg: JSON.stringify(extra) });
  };

  push("CLICK_DONE", { hrefBeforeClick, focusedTabBefore });

  let newTabId = null;
  let tTabCreated = null;
  let tFirstLoad = null;
  let firstUrl = null;
  let finalUrl = null;
  let tUrlFinal = null;
  let tMinhas = null;
  let focusChangedAuto = null;
  let oldTabStillOpen = null;
  let urlSeries = [];
  let stableCount = 0;
  let lastSeenUrl = null;

  const deadline = Date.now() + stabilizeMs;
  while (Date.now() < deadline) {
    if (!checkBudgets()) break;

    const tabsRes = await run(["browser", "tabs"]);
    const tabsNow = parseTabs(tabsRes.out);
    const newTabs = tabsNow.filter((t) => !beforeIds.has(t.id));

    // foco atual = href da aba focada (sem focus em outra)
    const here = await evaluate(`() => ({ href: location.href })`);
    const currentHref = here.parsed?.href || null;

    if (newTabs.length > 0 && !newTabId) {
      // prefer content-like new tab; else first new
      const preferred =
        newTabs.find((t) => t.type === "minhas_inscricoes" || t.type === "account" || t.type === "myvtex_content") ||
        newTabs.find((t) => t.type !== "tracker" && t.type !== "service_worker" && t.type !== "recaptcha") ||
        newTabs[0];
      newTabId = preferred.id;
      tTabCreated = Date.now();
      firstUrl = preferred.url || null;
      push("TAB_CREATED", {
        tabId: newTabId,
        url: firstUrl,
        type: preferred.type,
        allNew: newTabs.map((t) => ({ id: t.id, type: t.type, url: t.url })),
      });
    }

    if (newTabId) {
      const tracked = tabsNow.find((t) => t.id === newTabId);
      const url = tracked?.url || "";
      if (url && !/^about:blank/i.test(url)) {
        if (!tFirstLoad) {
          tFirstLoad = Date.now();
          if (!firstUrl) firstUrl = url;
          push("FIRST_LOAD", { tabId: newTabId, url });
        }
        urlSeries.push({ tMs: Date.now() - t0, url, type: tracked?.type });
        if (urlsEqual(url, lastSeenUrl)) stableCount += 1;
        else {
          stableCount = 1;
          lastSeenUrl = url;
        }
        if (stableCount >= stableNeeded && !tUrlFinal) {
          tUrlFinal = Date.now();
          finalUrl = url;
          push("URL_STABLE", { tabId: newTabId, url: finalUrl, stablePolls: stableCount });
        }
        if (isMinhasInscricoesUrl(url) && !tMinhas) {
          tMinhas = Date.now();
          finalUrl = url;
          tUrlFinal = tUrlFinal || tMinhas;
          push("MINHAS_INSCRICOES_SEEN", { tabId: newTabId, url });
        }
      }
    }

    // foco automático? URL da aba focada mudou sem nós chamarmos focus
    if (focusChangedAuto === null && hrefBeforeClick && currentHref) {
      if (!urlsEqual(currentHref, hrefBeforeClick)) {
        focusChangedAuto = true;
        push("FOCUS_CHANGED_AUTO", { from: hrefBeforeClick, to: currentHref });
      }
    }

    oldTabStillOpen = focusedTabBefore
      ? tabsNow.some((t) => t.id === focusedTabBefore)
      : tabsBefore.some((t) => tabsNow.some((n) => n.id === t.id));

    if (tMinhas && tUrlFinal) break;
    await sleep(pollMs);
  }

  if (focusChangedAuto === null) {
    const here = await evaluate(`() => ({ href: location.href })`);
    focusChangedAuto = !!(
      hrefBeforeClick &&
      here.parsed?.href &&
      !urlsEqual(here.parsed.href, hrefBeforeClick)
    );
    push("FOCUS_AUTO_FINAL", {
      focusChangedAuto,
      hrefNow: here.parsed?.href || null,
    });
  }

  const tabsAfterRes = await run(["browser", "tabs"]);
  const tabsAfter = parseTabs(tabsAfterRes.out);
  const newTabsFinal = tabsAfter.filter((t) => !beforeIds.has(t.id));

  if (!finalUrl && newTabId) {
    finalUrl = tabsAfter.find((t) => t.id === newTabId)?.url || lastSeenUrl || firstUrl;
  }

  const report = {
    observedAt: new Date().toISOString(),
    orderId,
    continuarProcesso: {
      novaAbaCriada: !!newTabId,
      idNovaAba: newTabId,
      urlInicial: firstUrl,
      urlFinal: finalUrl || null,
      tempoParaAbrirMs: tTabCreated != null ? tTabCreated - t0 : null,
      tempoParaEstabilizarMs: tUrlFinal != null ? tUrlFinal - t0 : null,
      tempoAteMinhasInscricoesMs: tMinhas != null ? tMinhas - t0 : null,
      focoAutomatico: !!focusChangedAuto,
      abaAntigaPermaneceuAberta: oldTabStillOpen !== false,
      timestamps: {
        clique: new Date(t0).toISOString(),
        tabCriada: tTabCreated ? new Date(tTabCreated).toISOString() : null,
        primeiroLoad: tFirstLoad ? new Date(tFirstLoad).toISOString() : null,
        urlFinal: tUrlFinal ? new Date(tUrlFinal).toISOString() : null,
        minhasInscricoes: tMinhas ? new Date(tMinhas).toISOString() : null,
      },
      tabsBefore,
      tabsAfterNew: newTabsFinal,
      urlSeries,
      timeline,
      note: "Observação only — nenhuma aba foi focada automaticamente pelo harness",
    },
    runnerMetrics: runnerMetrics || null,
  };

  const outPath = path.join(
    process.cwd(),
    `continuar-processo-obs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  push("REPORT_WRITTEN", { file: outPath });

  return { report, outPath };
}

export { parseTabs, classifyTab };
