/**
 * Indicação automática no programa de afiliados BeeViral (link bvr.li).
 *
 * Fluxo: ANTES da inscrição, sorteia X% dos leads; o sorteado tem a indicação
 * enviada na hora (form da squeeze page, mesmo fluxo manual do afiliados.har)
 * e a inscrição só começa AFILIADO_DELAY_MS depois (default 55s) — simulando
 * quem entra pelo link do afiliado e se inscreve em seguida.
 *
 * Percentual: tabela `porcentagem_afiliados` do Supabase, chave
 * `afiliado_percentual` (cache de 60s). Fallback: env AFILIADO_PERCENTUAL.
 * Default 0 = desligado.
 *
 * Polo: usa o poleId (SIAA) do lead — mesmo ID que o campo aceita (ex: 50 =
 * Barra Funda). Fallback: env AFILIADO_POLO.
 *
 * Fase de teste: AFILIADO_ONLY_LEAD_ID limita o disparo a um lead (100%).
 * Nunca lança: afiliado não pode derrubar a inscrição.
 */

const crypto = require("crypto");
const { SUPABASE_URL, supabaseKey } = require("./inscricoes-log");

const BV_ID = process.env.AFILIADO_BV_ID || "ROGERIO19444899";
const TOKEN_CAMPAIGN = process.env.AFILIADO_TOKEN_CAMPAIGN || "dFhYa3Fha096RkhOakZuRGIqWmFwUT09";
const CD_CAMPAIGN = process.env.AFILIADO_CD_CAMPAIGN || "pcGRIcXXkNztkWzCkmfR9w==";
const CD_CUSTOMER = process.env.AFILIADO_CD_CUSTOMER || "W65IR*@ahIvKzclKX2r6cg==";
const POLO_FALLBACK = process.env.AFILIADO_POLO || "50";
const ONLY_LEAD = String(process.env.AFILIADO_ONLY_LEAD_ID || "").trim();
const DELAY_MS = Number(process.env.AFILIADO_DELAY_MS || 55_000);

const SQUEEZE_URL = `https://account.beeviral.app/SqueezePage?code=${encodeURIComponent(TOKEN_CAMPAIGN)}&bvid=${BV_ID}`;
const RECEIVE_URL = "https://account.beeviral.app/widget/ReceiveRecommendation";

let _pctCache = { at: 0, value: null };

async function getPercentual() {
  const now = Date.now();
  if (_pctCache.value != null && now - _pctCache.at < 60_000) return _pctCache.value;
  const fallback = Number(process.env.AFILIADO_PERCENTUAL || 0) || 0;
  const key = supabaseKey();
  if (!key) return fallback;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/porcentagem_afiliados?chave=eq.afiliado_percentual&select=valor`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) throw new Error(`config ${res.status}`);
    const rows = await res.json();
    const pct = Number(rows?.[0]?.valor);
    const value = Number.isFinite(pct) && pct >= 0 ? Math.min(pct, 100) : fallback;
    _pctCache = { at: now, value };
    return value;
  } catch (e) {
    console.error("[afiliado] config:", e.message);
    return fallback;
  }
}

function fmtCpf(cpf) {
  const d = String(cpf || "").replace(/\D/g, "");
  if (d.length !== 11) return String(cpf || "");
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function foneDigitos(f) {
  const d = String(f || "").replace(/\D/g, "");
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

function fmtFone(f) {
  const d = foneDigitos(f).slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(f || "");
}

async function enviarAfiliado({ nome, email, telefone, cpf, curso, poleId }) {
  const page = await fetch(SQUEEZE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  });
  const html = await page.text();
  const m =
    html.match(/id="payload"[^>]*value="([^"]+)"/) ||
    html.match(/value="([^"]+)"[^>]*id="payload"/);
  if (!m) throw new Error("payload não encontrado na squeeze page");

  const uuid = crypto.randomUUID();
  const foneFmt = fmtFone(telefone);
  const fone55 = foneDigitos(telefone);
  const cpfFmt = fmtCpf(cpf);
  const cursoV = curso || "Administração";
  const unidade = "CRUZEIRO DO SUL - VIRTUAL";
  const poloV = poleId != null && poleId !== "" ? String(poleId) : POLO_FALLBACK;
  const poloLabel = "Se você escolheu a Cruzeiro do Sul Virtual, informe o seu Polo:";

  const additional = JSON.stringify({
    37688: fone55,
    37689: email,
    37823: cpfFmt,
    37833: cursoV,
    37834: "EAD",
    37876: unidade,
    37877: poloV,
    Email: email,
    Telefone: fone55,
    CPF: cpfFmt,
    "Cursos de Interesse": cursoV,
    "Modalidade do Curso ": "EAD",
    "Unidade desejada": unidade,
    [poloLabel]: poloV,
  });

  const fd = new FormData();
  fd.append("NM_PEOPLE_DI", nome);
  fd.append("Email", email);
  fd.append("Telefone", foneFmt);
  fd.append("CPF", cpfFmt);
  fd.append("Cursos de Interesse", cursoV);
  fd.append("Modalidade do Curso ", "EAD");
  fd.append("Unidade desejada", unidade);
  fd.append(poloLabel, poloV);
  fd.append("CD_CAMPAIGN", CD_CAMPAIGN);
  fd.append("CD_CUSTOMER", CD_CUSTOMER);
  fd.append("CD_CHANNEL_RECOMMENDATION", "Manual");
  fd.append("NM_REFERRAL", nome);
  fd.append("ISCREATERANDOMEMAIL", "Y");
  fd.append("ORIGIN_REGISTER", "SqueezePage");
  fd.append("TOKEN_CAMPAIGN", TOKEN_CAMPAIGN);
  fd.append("BV_ID", BV_ID);
  fd.append("UUID", uuid);
  fd.append("payload", m[1]);
  fd.append("DS_EMAIL", email);
  fd.append("DS_PHONE", fone55);
  fd.append("DS_ADDITIONAL_FIELD", additional);

  const res = await fetch(RECEIVE_URL, {
    method: "POST",
    headers: {
      "x-bvid": BV_ID,
      "x-uuid": uuid,
      Referer: "https://account.beeviral.app/SqueezePage",
    },
    body: fd,
  });
  const body = await res.text();
  let json = null;
  try {
    json = JSON.parse(body);
  } catch {}
  if (!res.ok || !json?.success) {
    throw new Error(`BeeViral ${res.status}: ${body.slice(0, 200)}`);
  }
  return json;
}

/** Sorteio: true = lead entra no programa. Nunca lança. */
async function sortearAfiliado(lead) {
  try {
    if (!lead?.nome || !lead?.email || !lead?.telefone || !lead?.cpf) {
      console.log(`[afiliado] lead ${lead?.leadId}: dados incompletos — skip`);
      return false;
    }
    // Modo teste: com AFILIADO_ONLY_LEAD_ID, só esse lead participa — sempre 100%.
    if (ONLY_LEAD) {
      const match = String(lead?.leadId || "") === ONLY_LEAD;
      if (match) console.log(`[afiliado] lead ${lead.leadId}: modo teste — 100% (AFILIADO_ONLY_LEAD_ID)`);
      return match;
    }
    const pct = await getPercentual();
    if (!(pct > 0)) return false;
    const roll = Math.random() * 100;
    const sorteado = roll < pct;
    console.log(
      `[afiliado] lead ${lead.leadId}: ${sorteado ? "SORTEADO" : "não sorteado"} (${roll.toFixed(1)} ${sorteado ? "<" : ">="} ${pct}%)`
    );
    return sorteado;
  } catch (e) {
    console.error("[afiliado] sorteio:", e.message);
    return false;
  }
}

/** Nota no card do Kommo para dar visibilidade ao envio (nunca lança). */
async function kommoNote(leadId, text) {
  try {
    const token = process.env.KOMMO_ACCESS_TOKEN;
    const base = (process.env.KOMMO_BASE_URL || `https://${process.env.KOMMO_SUBDOMAIN || "admamoeduitcombr"}.kommo.com`).replace(/\/$/, "");
    if (!token || !leadId) return;
    await fetch(`${base}/api/v4/leads/${leadId}/notes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ note_type: "common", params: { text } }]),
    });
  } catch {}
}

/**
 * Fluxo pré-inscrição: sorteia; se sorteado, envia a indicação AGORA e espera
 * DELAY_MS (default 55s) antes de liberar a inscrição. Retorna true se a
 * indicação foi enviada. Nunca lança.
 */
async function executarAfiliadoPreInscricao(lead) {
  try {
    if (!(await sortearAfiliado(lead))) return false;
    try {
      await enviarAfiliado({
        nome: lead.nome,
        email: lead.email,
        telefone: lead.telefone,
        cpf: lead.cpf,
        curso: lead.curso,
        poleId: lead.poleId,
      });
      console.log(`[afiliado] lead ${lead.leadId}: indicação enviada (polo ${lead.poleId || POLO_FALLBACK})`);
      await kommoNote(lead.leadId, "Indicação ao programa de afiliados enviada ✔");
    } catch (e) {
      console.error(`[afiliado] lead ${lead.leadId}: falha —`, e.message);
      await kommoNote(lead.leadId, `Falha ao enviar indicação de afiliado: ${e.message}`);
      return false; // sem indicação, sem espera
    }
    console.log(`[afiliado] lead ${lead.leadId}: aguardando ${Math.round(DELAY_MS / 1000)}s antes da inscrição`);
    await new Promise((r) => setTimeout(r, DELAY_MS));
    return true;
  } catch (e) {
    console.error("[afiliado] pré-inscrição:", e.message);
    return false;
  }
}

module.exports = { sortearAfiliado, executarAfiliadoPreInscricao, enviarAfiliado, getPercentual };
