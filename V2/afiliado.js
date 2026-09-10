/**
 * Indicação automática no programa de afiliados BeeViral (link bvr.li).
 *
 * Após inscrição bem-sucedida, sorteia X% dos leads e, após delay aleatório
 * de 45-90s, envia o formulário da squeeze page com os dados do lead —
 * mesmo fluxo do preenchimento manual (ver afiliados.har).
 *
 * Percentual: tabela `porcentagem_afiliados` do Supabase, chave
 * `afiliado_percentual` (cache de 60s). Fallback: env AFILIADO_PERCENTUAL.
 * Default 0 = desligado.
 *
 * Polo: usa o poleId (SIAA) do lead — mesmo ID que o campo aceita (ex: 50 =
 * Barra Funda). Fallback: env AFILIADO_POLO.
 *
 * Fase de teste: AFILIADO_ONLY_LEAD_ID limita o disparo a um lead.
 * Nunca lança: afiliado não pode derrubar/atrasar a inscrição.
 */

const crypto = require("crypto");
const { SUPABASE_URL, supabaseKey } = require("./inscricoes-log");

const BV_ID = process.env.AFILIADO_BV_ID || "ROGERIO19444899";
const TOKEN_CAMPAIGN = process.env.AFILIADO_TOKEN_CAMPAIGN || "dFhYa3Fha096RkhOakZuRGIqWmFwUT09";
const CD_CAMPAIGN = process.env.AFILIADO_CD_CAMPAIGN || "pcGRIcXXkNztkWzCkmfR9w==";
const CD_CUSTOMER = process.env.AFILIADO_CD_CUSTOMER || "W65IR*@ahIvKzclKX2r6cg==";
const POLO_FALLBACK = process.env.AFILIADO_POLO || "50";
const ONLY_LEAD = String(process.env.AFILIADO_ONLY_LEAD_ID || "").trim();

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

/** Sorteio: true = lead entra no programa (chamar agendarEnvioAfiliado). Nunca lança. */
async function sortearAfiliado(lead, out) {
  try {
    if (!out?.ok || !out?.inscricaoSIAA) return false;
    if (ONLY_LEAD && String(lead?.leadId || "") !== ONLY_LEAD) return false;
    if (!lead?.nome || !lead?.email || !lead?.telefone || !lead?.cpf) {
      console.log(`[afiliado] lead ${lead?.leadId}: dados incompletos — skip`);
      return false;
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

/** Agenda o envio para 45-90s depois. Fire-and-forget, nunca lança. */
function agendarEnvioAfiliado(lead) {
  try {
    const delay = 45_000 + Math.floor(Math.random() * 45_000);
    console.log(`[afiliado] lead ${lead.leadId}: envio em ${Math.round(delay / 1000)}s`);
    const t = setTimeout(async () => {
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
      } catch (e) {
        console.error(`[afiliado] lead ${lead.leadId}: falha —`, e.message);
      }
    }, delay);
    t.unref?.();
  } catch (e) {
    console.error("[afiliado] agendamento:", e.message);
  }
}

module.exports = { sortearAfiliado, agendarEnvioAfiliado, enviarAfiliado, getPercentual };
