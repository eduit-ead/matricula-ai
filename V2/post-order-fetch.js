#!/usr/bin/env node
/**
 * Pós-orderGroup — sem browser
 *
 * Endpoints:
 *   numeroInscricao → GET /_v/order14/{orderGroup}-01  (campo orderId)
 *   minhasInscrições → GET /_v/leadOrder/{email}
 *   provaLink        → GET /v1/getProvaUrl?codigoIes&email&nomeCompleto&numeroInscricao&tipoProva
 *
 * Uso:
 *   node post-order-fetch.js
 *   ORDER_GROUP=1657044165993 EMAIL=api.poc.xxx@mailinator.com node post-order-fetch.js
 */

const BASE = "https://cruzeirodosul.myvtex.com";

const TIPO_PROVA_MAP = {
  VESTIBULAR_REDACAO: "VESTIBULAR_REDACAO",
  "Vestibular Redação": "VESTIBULAR_REDACAO",
  VESTIBULAR_MULTIPLA_ESCOLHA: "VESTIBULAR_MULTIPLA_ESCOLHA",
  "Vestibular Múltipla Escolha": "VESTIBULAR_MULTIPLA_ESCOLHA",
  VESTIBULAR_MERITO: "VESTIBULAR_MERITO",
  "Vestibular Mérito": "VESTIBULAR_MERITO",
};

function mapTipoProva(formaIngresso) {
  return TIPO_PROVA_MAP[formaIngresso] || formaIngresso || "VESTIBULAR_MULTIPLA_ESCOLHA";
}

function normalizeForma(forma) {
  const s = String(forma || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (s.includes("enem")) return "enem";
  if (s.includes("redac")) return "redacao";
  if (s.includes("merito")) return "merito";
  if (s.includes("multipla")) return "multipla";
  if (s.includes("segunda")) return "segunda";
  if (s.includes("transfer")) return "transferencia";
  return s.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function normalizeCiclo(ciclo) {
  return String(ciclo ?? "").replace(/\D/g, "");
}

function summarizeInscricao(lead) {
  return {
    id: lead.id,
    orderId: lead.orderId || null,
    inscricaoSIAA: lead.inscricaoSIAA || null,
    formaIngresso: lead.formaIngresso || null,
    courseName: lead.courseName || lead.curso || null,
    ciclo: lead.ciclo || null,
    status: lead.status || null,
  };
}

async function consultarInscricoesSIAA({ email, cookie = "" }) {
  const leads = await getLeadOrder(email, withHeaders(cookie));
  const comSiaa = leads.filter((l) => l.inscricaoSIAA).map(summarizeInscricao);
  return {
    email,
    leads: leads.map(summarizeInscricao),
    comSiaa,
  };
}

function inscricoesDaForma(consulta, formaIngresso, ciclo) {
  const key = normalizeForma(formaIngresso);
  const cicloKey = normalizeCiclo(ciclo);
  return (consulta?.comSiaa || []).filter((l) => {
    if (normalizeForma(l.formaIngresso) !== key) return false;
    if (!cicloKey) return true;
    const leadCiclo = normalizeCiclo(l.ciclo);
    return leadCiclo && leadCiclo === cicloKey;
  });
}

/** Uma inscrição SIAA por candidato, por forma, no ciclo corrente. */
const FORMAS_LIMITE_UMA = new Set(["redacao", "multipla", "enem", "segunda", "transferencia"]);

function formaTemLimiteUmaInscricao(formaIngresso) {
  return FORMAS_LIMITE_UMA.has(normalizeForma(formaIngresso));
}

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, {
    headers: { Accept: "application/json", ...opts.headers },
    ...opts,
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status} ${url}: ${text.slice(0, 300)}`);
    err.status = r.status;
    err.body = text;
    throw err;
  }
  return json ?? text;
}

function withHeaders(cookie) {
  return cookie ? { Cookie: cookie } : {};
}

async function getOrder14(orderGroup, headers = {}) {
  const orderId = `${orderGroup}-01`;
  return fetchJson(`${BASE}/_v/order14/${orderId}`, { headers });
}

async function getLeadOrder(email, headers = {}) {
  try {
    const data = await fetchJson(`${BASE}/_v/leadOrder/${email}`, { headers });
    return data?.data || [];
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

async function getLeadDocument(leadId, headers = {}, fields = "id,inscricaoSIAA,orderId,status,cpf,passoFicha,formaIngresso,statusGraduacao") {
  try {
    return await fetchJson(
      `${BASE}/api/dataentities/OP/documents/${leadId}?an=cruzeirodosul&_fields=${fields}`,
      { headers }
    );
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

async function resolveLead({ email, leadId, orderId, headers = {} }) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const leads = await getLeadOrder(email, headers);
    const hit = selectLead(leads, { leadId, orderId });
    if (hit) return hit;
    if (leadId) {
      const doc = await getLeadDocument(leadId, headers, "_all");
      if (doc?.id || doc?.email) return doc;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

function selectLead(leads, { leadId, orderId }) {
  if (leadId) {
    const byId = leads.find((x) => x.id === leadId);
    if (byId) return byId;
  }
  const byOrder = leads.find((x) => x.orderId === orderId);
  if (byOrder) return byOrder;
  const pending = leads.filter((x) => x.status === "pending" || !x.orderId);
  if (pending.length === 1) return pending[0];
  if (leads.length === 1) return leads[0];
  return null;
}

async function putLeadOrder(lead, orderId, extras = {}, headers = {}) {
  const body = {
    ...lead,
    ...extras,
    orderId,
    status: "finished",
    statusGraduacao: extras.statusGraduacao ?? "0",
    passoFicha: extras.passoFicha ?? "4",
    formaPagamento: lead.formaPagamento || extras.formaPagamento || "Isento",
    situacaoPagamento: lead.situacaoPagamento || extras.situacaoPagamento || "Isento",
    identifyer: (lead.identifyer || "")
      .replace(/\s-\s(pending|finished)(?:\s-\s[\d-]+)?$/i, "")
      .concat(` - finished - ${orderId}`),
  };
  return fetchJson(`${BASE}/_v/leadOrderPut/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function pollInscricaoSIAA(email, orderId, { leadId, headers = {}, maxMs = 90000, intervalMs = 3000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (leadId) {
      const doc = await getLeadDocument(leadId, headers);
      if (doc?.inscricaoSIAA) return doc;
    }
    const leads = await getLeadOrder(email, headers);
    const lead = selectLead(leads, { leadId, orderId });
    if (lead?.inscricaoSIAA) return lead;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

function resolveNumeroProva(lead, order) {
  if (lead?.inscricaoSIAA) return lead.inscricaoSIAA;
  if (order?.sequence) return String(order.sequence);
  return String(order.orderId).replace(/-01$/, "");
}

async function patchEnemNota(leadId, scores, headers = {}) {
  const media = Number(scores.media ?? scores.enemMedia ?? 400);
  const body = {
    enemAno: String(scores.ano ?? scores.enemAno ?? "2022"),
    enemCHumanas: Number(scores.humanas ?? scores.enemCHumanas ?? media),
    enemCNatureza: Number(scores.natureza ?? scores.enemCNatureza ?? media),
    enemLinguagens: Number(scores.linguagens ?? scores.enemLinguagens ?? media),
    enemMatematica: Number(scores.matematica ?? scores.enemMatematica ?? media),
    enemRedacao: Number(scores.redacao ?? scores.enemRedacao ?? media),
    enemTermo: true,
    enemAceite: true,
    enemMedia: media,
    statusGraduacao: 1,
  };
  return fetchJson(`${BASE}/api/dataentities/OP/documents/${leadId}?an=cruzeirodosul`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function getProvaUrl(lead, order, headers = {}) {
  const numeroInscricao = lead?.inscricaoSIAA;
  if (!numeroInscricao) {
    throw new Error("getProvaUrl exige inscricaoSIAA — não usar orderGroup/sequence");
  }
  const codigoIes = lead.codigoIes || lead.marca || lead.iesNumber || "12";
  const params = new URLSearchParams({
    codigoIes: String(codigoIes),
    email: lead.email,
    nomeCompleto: lead.name || `${lead.firstName} ${lead.lastName}`.trim(),
    numeroInscricao: String(numeroInscricao),
    tipoProva: mapTipoProva(lead.formaIngresso),
  });

  for (let attempt = 0; attempt < 5; attempt++) {
    const data = await fetchJson(`${BASE}/v1/getProvaUrl?${params}`, { headers });
    if (data?.success && data?.provaUrl) return data.provaUrl;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("getProvaUrl não retornou provaUrl");
}

const POS_PAYMENT_LINK =
  "https://siaa.cruzeirodosul.edu.br/vestibular-inscricao/resultado/index.jsf?codigoEmpresa=7";

const SEGUNDA_UPLOAD_LINK = "https://upload-documentos.cruzeirodosul.edu.br/login";

function isSegundaGrad(forma) {
  return /segunda\s*gradua/i.test(String(forma || ""));
}

function isTransferencia(forma) {
  return /transfer/i.test(String(forma || ""));
}

async function runPostOrder({
  orderGroup,
  email,
  leadId = null,
  cookie = "",
  leadOrderPutExtras = {},
  enemScores = null,
  silent = false,
  posPayment = false,
  segundaGrad = false,
}) {
  const log = silent ? () => {} : console.log.bind(console);
  const headers = withHeaders(cookie);
  const orderId = `${orderGroup}-01`;

  log("\n>>> GET /_v/order14/{orderGroup}-01");
  const order = await getOrder14(orderGroup, headers);
  const numeroInscricao = order.orderId;
  log("numeroInscricao:", numeroInscricao);

  log("\n>>> GET /_v/leadOrder/{email}");
  let lead = await resolveLead({ email, leadId, orderId, headers });
  log("lead encontrado:", lead?.id || "não", "leadId pedido:", leadId || "-");
  if (!lead) {
    throw new Error(`Lead da execução não encontrado (leadId=${leadId} orderId=${orderId})`);
  }

  const putExtras = { ...leadOrderPutExtras, orderId };

  log("\n>>> PUT /_v/leadOrderPut/ (fechamento ficha)", lead.id);
  await putLeadOrder(lead, orderId, putExtras, headers);
  const leads = await getLeadOrder(email, headers);
  lead = selectLead(leads, { leadId: lead.id, orderId }) || lead;

  if (!lead?.inscricaoSIAA) {
    log("\n>>> polling inscricaoSIAA (até 90s)…");
    const polled = await pollInscricaoSIAA(email, orderId, {
      leadId: lead.id,
      headers,
    });
    if (polled?.inscricaoSIAA) {
      lead = { ...lead, ...polled, email: lead.email || polled.email };
    }
  }

  log("lead orderId:", lead?.orderId);
  log("lead id:", lead?.id);
  log("inscricaoSIAA:", lead?.inscricaoSIAA || null);

  let provaLink = null;
  let paymentLink = null;
  let documentsLink = null;
  const enem = /^enem$/i.test(String(lead?.formaIngresso || leadOrderPutExtras.formaIngresso || ""));
  const segunda =
    segundaGrad ||
    isSegundaGrad(lead?.formaIngresso || leadOrderPutExtras.formaIngresso) ||
    isTransferencia(lead?.formaIngresso || leadOrderPutExtras.formaIngresso);
  if (posPayment) {
    if (lead?.inscricaoSIAA) {
      paymentLink = POS_PAYMENT_LINK;
      log("\n>>> paymentLink (Realizar pagamento):", paymentLink);
    } else {
      log("\n>>> paymentLink adiado: sem inscricaoSIAA");
    }
  } else if (segunda) {
    if (lead?.inscricaoSIAA) {
      documentsLink = SEGUNDA_UPLOAD_LINK;
      log("\n>>> documentsLink (Upload de documentos):", documentsLink);
    } else {
      log("\n>>> documentsLink adiado: sem inscricaoSIAA");
    }
  } else if (lead?.inscricaoSIAA && !enem) {
    log("\n>>> GET /v1/getProvaUrl");
    provaLink = await getProvaUrl(lead, order, headers);
    log("provaLink:", provaLink.slice(0, 80) + "…");
  } else if (enem) {
    log("\n>>> getProvaUrl omitido: formaIngresso ENEM");
  } else {
    log("\n>>> getProvaUrl adiado: sem inscricaoSIAA");
  }

  if (enem) {
    const scores = enemScores || { media: 400, ano: "2022" };
    log("\n>>> PATCH OP enem nota + iniciar matrícula (statusGraduacao=1)", lead.id);
    await patchEnemNota(lead.id, scores, headers);
    lead = { ...lead, enemMedia: Number(scores.media ?? 400), statusGraduacao: 1 };
  }

  return {
    orderGroup,
    orderId,
    numeroInscricao,
    inscricaoSIAA: lead?.inscricaoSIAA || null,
    numeroProvaUsado: lead?.inscricaoSIAA || null,
    sequence: order?.sequence || null,
    provaLink,
    paymentLink,
    documentsLink,
    lead: lead
      ? {
          id: lead.id,
          status: lead.status,
          orderId: lead.orderId,
          courseName: lead.courseName,
          formaIngresso: lead.formaIngresso,
          pole: lead.pole,
          cpf: lead.cpf,
          inscricaoSIAA: lead.inscricaoSIAA,
          enemMedia: lead.enemMedia || null,
          statusGraduacao: lead.statusGraduacao ?? null,
        }
      : null,
  };
}

/** @deprecated use runPostOrder */
async function run(opts) {
  return runPostOrder(opts);
}

const orderGroup = process.env.ORDER_GROUP;
const email = process.env.EMAIL;

if (require.main === module) {
  if (!orderGroup || !email) {
    console.error("Defina ORDER_GROUP e EMAIL (saída de api-only-poc.js)");
    process.exit(1);
  }

  runPostOrder({ orderGroup, email })
    .then((result) => {
      console.log("\n========================================");
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("\nFALHA:", err.message);
      process.exit(1);
    });
}

module.exports = {
  runPostOrder,
  run,
  mapTipoProva,
  resolveNumeroProva,
  consultarInscricoesSIAA,
  inscricoesDaForma,
  normalizeForma,
  formaTemLimiteUmaInscricao,
  normalizeCiclo,
};
