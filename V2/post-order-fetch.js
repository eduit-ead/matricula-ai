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

const SIAA_BASE = "https://siaa.cruzeirodosul.edu.br";
const SIAA_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const SIAA_CONFIRM_MS = Number(process.env.SIAA_CONFIRM_MS || 180_000);
const SIAA_CONFIRM_INTERVAL_MS = Number(process.env.SIAA_CONFIRM_INTERVAL_MS || 5_000);

function codigoEmpresaSiaa(lead, fallback = "12") {
  return String(lead?.codigoIes || lead?.marca || lead?.iesNumber || fallback);
}

async function fetchSiaaMatriculaHtml(cpf, codigoEmpresa = "12") {
  const digits = cpfDigits(cpf);
  if (digits.length !== 11) return "";
  const url =
    `${SIAA_BASE}/vestibular-inscricao/resultado/matricula-unificada.jsf` +
    `?inicio=1&codigoEmpresa=${encodeURIComponent(codigoEmpresa)}&cpfCandidato=${digits}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": SIAA_UA, Accept: "text/html" },
      signal: ctrl.signal,
    });
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

function siaaPageTemNumero(html, numero) {
  if (!html || !numero) return false;
  const n = String(numero).replace(/\D/g, "");
  if (n.length < 6) return false;
  if (/n[aã]o existem inscri[cç][oõ]es abertas/i.test(html) && !html.includes(n)) return false;
  return html.includes(n);
}

async function confirmarInscricaoSiaa({ cpf, numero, codigoEmpresa = "12", cache } = {}) {
  const digits = cpfDigits(cpf);
  const n = String(numero || "").replace(/\D/g, "");
  if (digits.length !== 11 || n.length < 6) return null;
  const key = `${digits}:${codigoEmpresa}`;
  let html = cache?.get(key);
  if (html == null) {
    html = await fetchSiaaMatriculaHtml(digits, codigoEmpresa);
    cache?.set(key, html || "");
  }
  return siaaPageTemNumero(html, n) ? { numero: n, cpf: digits } : null;
}

function numerosSiaaNaPagina(html) {
  if (!html) return [];
  const hits = [];
  const re = /N[ºo°]\s*de\s*inscri[cç][aã]o[^0-9]{0,40}(\d{6,12})/gi;
  let m;
  while ((m = re.exec(html))) hits.push(m[1]);
  return [...new Set(hits)];
}

async function listarNumerosSiaa(cpf, codigoEmpresa = "12") {
  const html = await fetchSiaaMatriculaHtml(cpf, codigoEmpresa);
  if (/n[aã]o existem inscri[cç][oõ]es abertas/i.test(html) && !numerosSiaaNaPagina(html).length) {
    return [];
  }
  return numerosSiaaNaPagina(html);
}

async function pollConfirmacaoSiaa({
  cpf,
  numero,
  codigoEmpresa = "12",
  maxMs = SIAA_CONFIRM_MS,
  intervalMs = SIAA_CONFIRM_INTERVAL_MS,
  log = () => {},
} = {}) {
  const want = String(numero || "").replace(/\D/g, "");
  const start = Date.now();
  let attempt = 0;
  let seenFirst = null;
  let lastNums = [];
  while (Date.now() - start < maxMs) {
    attempt += 1;
    try {
      const hit = await confirmarInscricaoSiaa({ cpf, numero: want, codigoEmpresa });
      if (hit) return hit;
      lastNums = await listarNumerosSiaa(cpf, codigoEmpresa);
      if (seenFirst == null) seenFirst = new Set(lastNums);
      log(`SIAA ainda sem ${want} (tentativa ${attempt})`);
    } catch (err) {
      log(`confirmação SIAA falhou: ${err.message}`);
    }
    const left = maxMs - (Date.now() - start);
    if (left <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(intervalMs, left)));
  }
  const novos = lastNums.filter((n) => n !== want && !(seenFirst && seenFirst.has(n)));
  if (novos.length) {
    const alt = novos[novos.length - 1];
    log(`SIAA não tem ${want}, mas nasceu ${alt} — usando esse`);
    return { numero: alt, cpf: cpfDigits(cpf) };
  }
  return null;
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
  const siaaCache = new Map();
  for (const lead of leads) {
    if (!lead?.inscricaoSIAA) continue;
    const hit = await confirmarInscricaoVtex(lead, headers);
    if (!hit) continue;
    if (cpf && !sameCpf(hit.cpf, cpf)) continue;
    const empresa = codigoEmpresaSiaa(hit);
    let noSiaa = false;
    try {
      const siaa = await confirmarInscricaoSiaa({
        cpf: hit.cpf || cpf,
        numero: hit.inscricaoSIAA,
        codigoEmpresa: empresa,
        cache: siaaCache,
      });
      if (!siaa) noSiaa = true;
    } catch (err) {
      console.log("consulta SIAA real falhou:", err.message);
      noSiaa = true;
    }
    if (noSiaa) continue;
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

/** Múltipla/redação: o link da prova quebrava quando gerado rápido demais após
 *  a inscrição. Com as pausas de 20s entre etapas (transaction → leadOrderPut
 *  → +38s), o getProvaUrl já acontece ~76s+ depois do pedido — não precisa de
 *  espera extra. Se um dia precisar, ajustável por PROVA_WAIT_MS. */
const FORMAS_PROVA_LENTA = new Set(["multipla", "redacao"]);
const PROVA_WAIT_MS = Number(process.env.PROVA_WAIT_MS || 0);

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
      const retryable = err.status === 404 || err.status === 500 || err.status === 502 || err.status === 503;
      if (!retryable) throw err;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  console.log(`order14 ainda ${lastErr?.status || "falha"} após ${maxMs}ms — seguindo com ${orderId}`);
  return null;
}

async function getLeadOrder(email, headers = {}) {
  const url = `${BASE}/_v/leadOrder/${encodeURIComponent(email)}`;
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const data = await fetchJson(url, { headers });
      return data?.data || [];
    } catch (err) {
      lastErr = err;
      if (err.status === 404) return [];
      const retryable = err.status === 500 || err.status === 502 || err.status === 503;
      if (!retryable || attempt === 3) throw err;
      console.log(`leadOrder HTTP ${err.status} — nova tentativa ${attempt + 1}/3`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
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
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fetchJson(`${BASE}/_v/leadOrderPut/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
    } catch (err) {
      lastErr = err;
      const retryable = err.status === 500 || err.status === 502 || err.status === 503;
      if (!retryable || attempt === 3) throw err;
      console.log(`leadOrderPut HTTP ${err.status} — nova tentativa ${attempt + 1}/3`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
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
  const passoMs = Number(process.env.PASSO_MS || 38_000);
  log(`>>> pausa ${Math.round(passoMs / 1000)}s após leadOrderPut`);
  await new Promise((r) => setTimeout(r, passoMs));
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

  const siaaVtex = lead?.inscricaoSIAA || null;
  let siaaConfirmado = false;
  if (lead?.inscricaoSIAA) {
    const empresa = codigoEmpresaSiaa(lead, posPayment ? "7" : "12");
    log("\n>>> confirmando inscrição no SIAA (matricula-unificada)");
    const confirmed = await pollConfirmacaoSiaa({
      cpf: lead.cpf || leadOrderPutExtras.cpf,
      numero: lead.inscricaoSIAA,
      codigoEmpresa: empresa,
      log,
    });
    if (confirmed) {
      siaaConfirmado = true;
      if (String(confirmed.numero) !== String(lead.inscricaoSIAA)) {
        log("SIAA confirmou outro número", confirmed.numero, "(VTEX tinha", lead.inscricaoSIAA, ")");
        lead = { ...lead, inscricaoSIAA: confirmed.numero };
      } else {
        log("SIAA confirmou", lead.inscricaoSIAA);
      }
    } else {
      log("SIAA não confirmou", lead.inscricaoSIAA, "— tratando como SEM_SIAA");
      lead = { ...lead, inscricaoSIAA: null };
    }
  }

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
    try {
      provaLink = await getProvaUrl(lead, order, headers);
      log("provaLink:", provaLink.slice(0, 80) + "…");
    } catch (e) {
      log("getProvaUrl falhou:", e.message);
      provaLink = null;
    }
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
    siaaVtex,
    siaaConfirmado,
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
  getProvaUrl,
  consultarInscricoesSIAA,
  confirmarInscricaoSiaa,
  inscricoesDaForma,
  inscricoesMesmoCursoPos,
  normalizeForma,
  formaTemLimiteUmaInscricao,
  fallbackFormaVestibular,
  normalizeCiclo,
};
