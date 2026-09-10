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
  if (s.includes("pos")) return "pos";
  return s.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function normalizeCiclo(ciclo) {
  return String(ciclo ?? "").replace(/\D/g, "");
}

function cpfDigits(cpf) {
  return String(cpf || "").replace(/\D/g, "");
}

function sameCpf(a, b) {
  const da = cpfDigits(a);
  const db = cpfDigits(b);
  return da.length === 11 && da === db;
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
    productId: lead.productId || null,
    cpf: lead.cpf || null,
    marca: lead.marca ?? lead.iesNumber ?? null,
    iesNumber: lead.iesNumber ?? lead.marca ?? null,
  };
}

function leadEhPosReal(l) {
  if (normalizeForma(l.formaIngresso) !== "pos") return false;
  return Number(l.iesNumber ?? l.marca) === 7;
}

function inscricaoDeOutraForma(leads, numero, formaAtual) {
  const key = normalizeForma(formaAtual);
  if (!numero || !key) return false;
  return (leads || []).some((l) => {
    if (String(l.inscricaoSIAA) !== String(numero)) return false;
    const f = normalizeForma(l.formaIngresso);
    return f && f !== key;
  });
}

async function order14Existe(orderId, headers = {}) {
  if (!orderId) return false;
  const id = /-\d+$/.test(String(orderId)) ? String(orderId) : `${orderId}-01`;
  try {
    const order = await fetchJson(`${BASE}/_v/order14/${id}`, { headers });
    return Boolean(order && (order.orderId || order.status));
  } catch {
    return false;
  }
}

const OP_CONFIRM_FIELDS =
  "id,inscricaoSIAA,orderId,status,formaIngresso,courseName,ciclo,marca,iesNumber,productId,cpf";

/** Só conta inscrição se o VTEX ainda tiver a ficha finished + pedido. Número solto no lead não basta. */
async function confirmarInscricaoVtex(lead, headers = {}) {
  if (!lead?.id || !lead.inscricaoSIAA) return null;
  const doc = await getLeadDocument(lead.id, headers, OP_CONFIRM_FIELDS);
  if (!doc?.inscricaoSIAA) return null;
  if (String(doc.status || "").toLowerCase() !== "finished") return null;
  if (!doc.orderId) return null;
  if (!(await order14Existe(doc.orderId, headers))) return null;
  return summarizeInscricao({ ...lead, ...doc });
}

async function getLeadsByCpf(cpf, headers = {}) {
  const digits = cpfDigits(cpf);
  if (digits.length !== 11) return [];
  try {
    const rows = await fetchJson(
      `${BASE}/api/dataentities/OP/search?an=cruzeirodosul&_fields=${OP_CONFIRM_FIELDS}&_where=cpf=${digits}`,
      { headers }
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function consultarInscricoesSIAA({ email, cpf = "", cookie = "" }) {
  const headers = withHeaders(cookie);
  const byEmail = email ? await getLeadOrder(email, headers) : [];
  const byCpf = await getLeadsByCpf(cpf, headers);
  const seen = new Set();
  const leads = [];
  for (const lead of [...byCpf, ...byEmail]) {
    if (!lead?.id || seen.has(lead.id)) continue;
    seen.add(lead.id);
    leads.push(lead);
  }
  const comSiaa = [];
  for (const lead of leads) {
    if (!lead?.inscricaoSIAA) continue;
    const hit = await confirmarInscricaoVtex(lead, headers);
    if (!hit) continue;
    if (cpf && !sameCpf(hit.cpf, cpf)) continue;
    comSiaa.push(hit);
  }
  return {
    email,
    cpf: cpfDigits(cpf) || null,
    leads: leads.map(summarizeInscricao),
    comSiaa,
  };
}

function inscricoesDaForma(consulta, formaIngresso, ciclo) {
  const key = normalizeForma(formaIngresso);
  const cicloKey = normalizeCiclo(ciclo);
  return (consulta?.comSiaa || []).filter((l) => {
    if (consulta?.cpf && !sameCpf(l.cpf, consulta.cpf)) return false;
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

/** Múltipla ↔ Redação. Outras formas não têm fallback. */
const FORMA_FALLBACK_VEST = {
  multipla: "Vestibular Redação",
  redacao: "Vestibular Múltipla Escolha",
};

/** Múltipla/redação: o link da prova quebra quando gerado rápido demais após a
 *  inscrição (info do time responsável). Espera antes de buscar — com o fluxo
 *  atual (~22s), 22s aqui fecha o processo em ~45s. Ajustável por PROVA_WAIT_MS. */
const FORMAS_PROVA_LENTA = new Set(["multipla", "redacao"]);
const PROVA_WAIT_MS = Number(process.env.PROVA_WAIT_MS || 22_000);

function fallbackFormaVestibular(forma) {
  return FORMA_FALLBACK_VEST[normalizeForma(forma)] || null;
}

function normalizeCursoKey(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*-\s*\d+\s*meses\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pós: uma inscrição SIAA por curso (família, ignora "- N meses") no ciclo. Outro curso pode.
 * Múltipla/redação/ENEM no mesmo ciclo não bloqueiam. Empresa 12 (grad) não conta como pós. */
function inscricoesMesmoCursoPos(consulta, formaIngresso, cursoNome, ciclo, productId) {
  if (normalizeForma(formaIngresso) !== "pos") return [];
  const cursoKey = normalizeCursoKey(cursoNome);
  if (!cursoKey) return [];
  const cicloKey = normalizeCiclo(ciclo);
  return (consulta?.comSiaa || []).filter((l) => {
    if (consulta?.cpf && !sameCpf(l.cpf, consulta.cpf)) return false;
    if (!leadEhPosReal(l)) return false;
    if (cicloKey) {
      const leadCiclo = normalizeCiclo(l.ciclo);
      if (!leadCiclo || leadCiclo !== cicloKey) return false;
    }
    if (productId && l.productId && String(l.productId) !== String(productId)) return false;
    return normalizeCursoKey(l.courseName) === cursoKey;
  });
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

async function getOrder14(orderGroup, headers = {}, { maxMs = 45000, intervalMs = 2000 } = {}) {
  const orderId = `${orderGroup}-01`;
  const url = `${BASE}/_v/order14/${orderId}`;
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < maxMs) {
    try {
      return await fetchJson(url, { headers });
    } catch (err) {
      lastErr = err;
      if (err.status !== 404) throw err;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  console.log(`order14 ainda 404 após ${maxMs}ms — seguindo com ${orderId}`);
  return null;
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
    statusGraduacao: Object.prototype.hasOwnProperty.call(extras, "statusGraduacao")
      ? extras.statusGraduacao
      : "0",
    inscricaoSIAA: Object.prototype.hasOwnProperty.call(extras, "inscricaoSIAA")
      ? extras.inscricaoSIAA
      : null,
    passoFicha: extras.passoFicha ?? "4",
    formaPagamento: extras.formaPagamento || lead.formaPagamento || "Isento",
    situacaoPagamento: extras.situacaoPagamento || lead.situacaoPagamento || "Isento",
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

async function pollInscricaoSIAA(email, orderId, { leadId, headers = {}, formaAtual = "", maxMs = 90000, intervalMs = 3000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const leads = await getLeadOrder(email, headers);
    if (leadId) {
      const doc = await getLeadDocument(leadId, headers);
      if (
        doc?.inscricaoSIAA &&
        !inscricaoDeOutraForma(leads, doc.inscricaoSIAA, formaAtual || doc.formaIngresso)
      ) {
        return doc;
      }
    }
    const lead = selectLead(leads, { leadId, orderId });
    if (
      lead?.inscricaoSIAA &&
      !inscricaoDeOutraForma(leads, lead.inscricaoSIAA, formaAtual || lead.formaIngresso)
    ) {
      return lead;
    }
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
  const order = (await getOrder14(orderGroup, headers)) || { orderId };
  const numeroInscricao = order.orderId || orderId;
  log("numeroInscricao:", numeroInscricao);

  log("\n>>> GET /_v/leadOrder/{email}");
  let lead = await resolveLead({ email, leadId, orderId, headers });
  log("lead encontrado:", lead?.id || "não", "leadId pedido:", leadId || "-");
  if (!lead) {
    throw new Error(`Lead da execução não encontrado (leadId=${leadId} orderId=${orderId})`);
  }
  const formaAtual = leadOrderPutExtras.formaIngresso || lead.formaIngresso;
  if (posPayment) {
    if (leadId && String(lead.id) !== String(leadId)) {
      throw new Error("Lead de pós não encontrado; não reutilizar ficha de outra forma");
    }
    if (lead.formaIngresso && normalizeForma(lead.formaIngresso) !== "pos") {
      throw new Error("Lead selecionado não é pós; múltipla/redação no ciclo não fecha no lugar da pós");
    }
  }

  const putExtras = { ...leadOrderPutExtras, orderId };

  log("\n>>> PUT /_v/leadOrderPut/ (fechamento ficha)", lead.id);
  await putLeadOrder(lead, orderId, putExtras, headers);
  const leads = await getLeadOrder(email, headers);
  lead = selectLead(leads, { leadId: lead.id, orderId }) || lead;
  if (lead?.inscricaoSIAA && inscricaoDeOutraForma(leads, lead.inscricaoSIAA, formaAtual)) {
    log("inscricaoSIAA ignorada: número já pertence a outra forma", lead.inscricaoSIAA);
    lead = { ...lead, inscricaoSIAA: null };
  }

  if (!lead?.inscricaoSIAA) {
    log("\n>>> polling inscricaoSIAA (até 90s)…");
    const polled = await pollInscricaoSIAA(email, orderId, {
      leadId: lead.id,
      headers,
      formaAtual,
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
    const formaProva = normalizeForma(lead?.formaIngresso || leadOrderPutExtras.formaIngresso);
    if (FORMAS_PROVA_LENTA.has(formaProva) && PROVA_WAIT_MS > 0) {
      log(`\n>>> aguardando ${Math.round(PROVA_WAIT_MS / 1000)}s antes de getProvaUrl (link quebra se gerado rápido demais)`);
      await new Promise((r) => setTimeout(r, PROVA_WAIT_MS));
    }
    log("\n>>> GET /v1/getProvaUrl");
    provaLink = await getProvaUrl(lead, order, headers);
    log("provaLink:", provaLink.slice(0, 80) + "…");
  } else if (enem) {
    log("\n>>> getProvaUrl omitido: formaIngresso ENEM");
  } else {
    log("\n>>> getProvaUrl adiado: sem inscricaoSIAA");
  }

  if (enem && Number(enemScores?.media) > 0) {
    log("\n>>> PATCH OP enem nota + iniciar matrícula (statusGraduacao=1)", lead.id);
    await patchEnemNota(lead.id, enemScores, headers);
    lead = { ...lead, enemMedia: Number(enemScores.media), statusGraduacao: 1 };
  } else if (enem) {
    log("\n>>> PATCH ENEM omitido: sem nota — inscrição criada, matrícula não iniciada");
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
  inscricoesMesmoCursoPos,
  normalizeForma,
  formaTemLimiteUmaInscricao,
  fallbackFormaVestibular,
  normalizeCiclo,
};
