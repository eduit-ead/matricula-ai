/**
 * Envio de mensagem pós-inscrição (WhatsApp do polo).
 *
 * Fase de teste: com MSG_ONLY_LEAD_ID preenchido no .env, a mensagem só é
 * disparada para esse lead; a inscrição roda normal para todos os demais.
 * Produção: deixar MSG_ONLY_LEAD_ID vazio.
 *
 * Provider: PENDENTE — a API do Kommo não envia mensagens com o token atual
 * (escopos: crm/files/notifications; rotas /api/v4/chats retornam 404).
 * Quando as credenciais do provedor de WhatsApp chegarem, implementar
 * sendText() e remover o dry-run.
 */

const ONLY_LEAD = String(process.env.MSG_ONLY_LEAD_ID || "").trim();

function permitido(lead) {
  if (!ONLY_LEAD) return true;
  return String(lead?.leadId || "") === ONLY_LEAD;
}

function buildText(lead, out) {
  const nome = lead?.nome || "";
  if (out?.ok && out?.inscricaoSIAA) {
    return (
      `Inscrição realizada: ${nome}\n` +
      `Curso: ${out.courseName || lead?.curso || ""}\n` +
      `Polo: ${lead?.polo || lead?.poloPrefixo || ""}\n` +
      `SIAA: ${out.inscricaoSIAA}`
    );
  }
  return `Falha na inscrição: ${nome}\n${out?.mensagem || out?.error || "erro desconhecido"}`;
}

// TODO: trocar pelo provedor real (Evolution/Z-API/etc.) quando chegarem as credenciais.
async function sendText(text) {
  console.log(`[mensagem] DRY-RUN (sem provider): ${text.replace(/\n/g, " | ")}`);
}

/** Nunca lança: mensagem não pode derrubar a inscrição. */
async function maybeSendMensagem(lead, out) {
  try {
    if (!permitido(lead)) return;
    await sendText(buildText(lead, out));
  } catch (e) {
    console.error("[mensagem] falha ao enviar:", e.message);
  }
}

module.exports = { maybeSendMensagem };
