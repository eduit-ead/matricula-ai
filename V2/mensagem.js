/**
 * Envio de mensagem pós-inscrição via WhatsApp Cloud API.
 *
 * Fase de teste: com MSG_ONLY_LEAD_ID preenchido no .env, a mensagem só é
 * disparada para esse lead; a inscrição roda normal para todos os demais.
 * Produção: deixar MSG_ONLY_LEAD_ID vazio.
 *
 * Env: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN
 */

const ONLY_LEAD = String(process.env.MSG_ONLY_LEAD_ID || "").trim();
const PHONE_ID = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
const WA_TOKEN = String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim();

function permitido(lead) {
  if (!ONLY_LEAD) return true;
  return String(lead?.leadId || "") === ONLY_LEAD;
}

function toWaId(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length === 11 || d.length === 10) return `55${d}`;
  return d;
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

async function sendText(phone, text) {
  const to = toWaId(phone);
  if (!PHONE_ID || !WA_TOKEN) {
    console.log("[mensagem] WhatsApp sem credenciais — skip");
    return;
  }
  if (!to) {
    console.log("[mensagem] telefone ausente — skip");
    return;
  }
  const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WA_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text, preview_url: false },
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${body.slice(0, 240)}`);
  console.log(`[mensagem] enviada para ${to}`);
}

/** Nunca lança: mensagem não pode derrubar a inscrição. */
async function maybeSendMensagem(lead, out) {
  try {
    if (!permitido(lead)) return;
    await sendText(lead?.telefone || lead?.phone, buildText(lead, out));
  } catch (e) {
    console.error("[mensagem] falha ao enviar:", e.message);
  }
}

module.exports = { maybeSendMensagem, sendText, toWaId };
