/**
 * Sprint Demo — formatação de relatório (sem dependência de Runtime/Stages).
 */

/**
 * @param {object} p
 * @returns {object} payload estável para n8n
 */
export function buildN8nPayload(p) {
  return {
    resultado: p.resultado, // "Sucesso" | "Falha"
    candidato: {
      nome: p.nome || null,
      email: p.email || null,
    },
    curso: p.curso || null,
    modalidade: p.modalidade || null,
    numeroInscricao: p.numeroInscricao || null,
    linkProva: p.linkProva || null,
    tempoTotalSec: p.tempoTotalSec ?? null,
    browserToolCalls: p.browserToolCalls ?? null,
    logout: {
      status: p.logoutStatus || "nao_executado",
      detalhe: p.logoutDetail || null,
    },
    browser: {
      status: p.browserStatus || "desconhecido",
      detalhe: p.browserDetail || null,
    },
    auth: {
      attempts: p.authAttempts ?? null,
      tempoGastoMs: p.authElapsedMs ?? null,
      criterio: p.authCriterion || null,
      emailAutenticado: p.authEmail || null,
      alreadyAuthenticated: p.authAlreadyAuthenticated ?? null,
      code: p.authCode || null,
    },
    meta: {
      capturedAt: p.capturedAt || new Date().toISOString(),
      provaAbertaAutomaticamente: false,
      demo: true,
    },
  };
}

/**
 * Relatório amigável no terminal.
 * @param {ReturnType<typeof buildN8nPayload>} n8n
 */
export function printFriendlyReport(n8n) {
  const line = "─".repeat(56);
  const ok = n8n.resultado === "Sucesso";
  const rows = [
    ["Nome do candidato", n8n.candidato?.nome || "—"],
    ["Curso", n8n.curso || "—"],
    ["Modalidade", n8n.modalidade || "—"],
    ["Número da inscrição", n8n.numeroInscricao || "—"],
    ["Link da prova", n8n.linkProva || "— (não capturado)"],
    ["Tempo total", n8n.tempoTotalSec != null ? `${n8n.tempoTotalSec}s` : "—"],
    ["Browser Tool Calls", String(n8n.browserToolCalls ?? "—")],
    [
      "Status do logout",
      `${n8n.logout?.status || "—"}${n8n.logout?.detalhe ? ` — ${n8n.logout.detalhe}` : ""}`,
    ],
    [
      "Status do browser",
      `${n8n.browser?.status || "—"}${n8n.browser?.detalhe ? ` — ${n8n.browser.detalhe}` : ""}`,
    ],
    ["Auth attempts", String(n8n.auth?.attempts ?? "—")],
    [
      "Auth tempo",
      n8n.auth?.tempoGastoMs != null ? `${n8n.auth.tempoGastoMs}ms` : "—",
    ],
    ["Auth critério", n8n.auth?.criterio || "—"],
    ["Auth e-mail", n8n.auth?.emailAutenticado || "—"],
    ["Resultado final", n8n.resultado],
  ];

  console.log("");
  console.log(line);
  console.log(ok ? "  RELATÓRIO DA INSCRIÇÃO  ·  SUCESSO" : "  RELATÓRIO DA INSCRIÇÃO  ·  FALHA");
  console.log(line);
  for (const [label, value] of rows) {
    const v =
      typeof value === "string" && value.length > 90
        ? value.slice(0, 87) + "..."
        : value;
    console.log(`  ${label.padEnd(22)} ${v}`);
  }
  console.log(line);
  console.log("  Nota: link da prova apenas capturado — não foi aberto.");
  console.log(line);
  console.log("");
}
