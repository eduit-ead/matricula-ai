const multipla = require("./graduacao-multipla");
const { AppError, ValidationError } = require("../core/errors");

const SIAA_MATRICULA_BASE =
  "https://siaa.cruzeirodosul.edu.br/vestibular-inscricao/resultado/matricula-unificada.jsf";

const PROCESS_CONFIG = {
  ...multipla.PROCESS_CONFIG,
  formaIngresso: "ENEM",
  tipoProva: null,
  seqVest: 1,
};

const additionalFields = [
  { key: "enemAno", label: "Ano do ENEM", type: "number" },
  { key: "enemCHumanas", label: "Nota Ciências Humanas", type: "number" },
  { key: "enemCNatureza", label: "Nota Ciências da Natureza", type: "number" },
  { key: "enemLinguagens", label: "Nota Linguagens", type: "number" },
  { key: "enemMatematica", label: "Nota Matemática", type: "number" },
  { key: "enemRedacao", label: "Nota Redação", type: "number" },
  { key: "enemNumeroInscricao", label: "Nº inscrição ENEM (opcional)", required: false },
];

function parseScore(value, label) {
  if (value == null || String(value).trim() === "") {
    throw new ValidationError(`Campo obrigatório: ${label}`);
  }
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) {
    throw new ValidationError(`Nota inválida: ${label}`);
  }
  return n;
}

function computeMedia(notes) {
  const sum =
    notes.enemCHumanas +
    notes.enemCNatureza +
    notes.enemLinguagens +
    notes.enemMatematica +
    notes.enemRedacao;
  return Number((sum / 5).toFixed(1));
}

function parseEnemNotes(additionalData = {}) {
  const enemAno = String(additionalData.enemAno || "").trim();
  if (!/^\d{4}$/.test(enemAno)) {
    throw new ValidationError("Ano do ENEM inválido. Use AAAA, ex.: 2022.");
  }
  const notes = {
    enemAno,
    enemCHumanas: parseScore(additionalData.enemCHumanas, "Ciências Humanas"),
    enemCNatureza: parseScore(additionalData.enemCNatureza, "Ciências da Natureza"),
    enemLinguagens: parseScore(additionalData.enemLinguagens, "Linguagens"),
    enemMatematica: parseScore(additionalData.enemMatematica, "Matemática"),
    enemRedacao: parseScore(additionalData.enemRedacao, "Redação"),
  };
  notes.enemMedia = computeMedia(notes);
  const inscricao = additionalData.enemNumeroInscricao;
  notes.enemNumeroInscricao =
    inscricao == null || String(inscricao).trim() === "" ? null : String(inscricao).trim();
  return notes;
}

function buildMatriculaUrl({ codigoEmpresa, cpf }) {
  const empresa = Number(codigoEmpresa);
  const cpfDigits = String(cpf || "").replace(/\D/g, "");
  if (!Number.isFinite(empresa)) {
    throw new AppError("SIAA_EMPRESA_INVALID", "codigoEmpresa inválido para matrícula SIAA", {
      step: "siaa_matricula",
      statusCode: 502,
    });
  }
  if (!cpfDigits) {
    throw new AppError("SIAA_CPF_MISSING", "CPF ausente para matrícula SIAA", {
      step: "siaa_matricula",
      statusCode: 502,
    });
  }
  const qs = new URLSearchParams({
    inicio: "1",
    codigoEmpresa: String(empresa),
    cpfCandidato: cpfDigits,
  });
  return `${SIAA_MATRICULA_BASE}?${qs.toString()}`;
}

function extractNrInscricao(...sources) {
  for (const src of sources) {
    if (!src) continue;
    const raw = String(src);
    const fromQuery = raw.match(/[?&]nrInscricao=(\d+)/i);
    if (fromQuery) return fromQuery[1];
    const fromPath = raw.match(/nrInscricao[=:](\d+)/i);
    if (fromPath) return fromPath[1];
  }
  return null;
}

function buildNotesPayload(additionalData = {}) {
  const notes = parseEnemNotes(additionalData);
  const body = {
    enemAno: notes.enemAno,
    enemCHumanas: notes.enemCHumanas,
    enemCNatureza: notes.enemCNatureza,
    enemLinguagens: notes.enemLinguagens,
    enemMatematica: notes.enemMatematica,
    enemRedacao: notes.enemRedacao,
    enemTermo: true,
    enemAceite: true,
    enemMedia: notes.enemMedia,
    statusGraduacao: notes.enemMedia >= 300 ? 1 : 2,
  };
  if (notes.enemNumeroInscricao) body.enemNumeroInscricao = notes.enemNumeroInscricao;
  return body;
}

function buildPayloads(ctx) {
  const additionalData = {
    ...ctx.additionalData,
    formaIngresso: PROCESS_CONFIG.formaIngresso,
  };
  const payloads = multipla.buildPayloads({
    ...ctx,
    additionalData,
    process: PROCESS_CONFIG,
  });
  if (payloads.leadPatchIngresso) {
    payloads.leadPatchIngresso.treineiroAno = "";
    payloads.leadPatchIngresso.enemAno = null;
    payloads.leadPatchIngresso.enemNumeroInscricao = additionalData.enemNumeroInscricao || null;
  }
  payloads.enemNotes = buildNotesPayload(ctx.additionalData);
  return payloads;
}

const SIAA_NAV_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  Referer: "https://cruzeirodosul.myvtex.com/account",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
};

async function startSiaaMatricula(fetchImpl, matriculaUrl) {
  const res = await fetchImpl(matriculaUrl, {
    method: "GET",
    redirect: "manual",
    headers: SIAA_NAV_HEADERS,
  });
  const location = typeof res.headers?.get === "function" ? res.headers.get("location") : null;
  let text = "";
  try {
    text = await res.text();
  } catch {
    text = "";
  }
  const allowed = res.ok || [301, 302, 303, 307, 308].includes(res.status);
  const inscricaoSIAA = extractNrInscricao(location, res.url, text);
  return {
    status: res.status,
    location,
    url: res.url || matriculaUrl,
    text,
    allowed,
    inscricaoSIAA,
  };
}

async function sleep(ms) {
  if (!ms || ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

async function afterOrder({
  client,
  leadId,
  additionalData,
  candidate,
  payloads,
  siaaWaitMs,
  siaaAttempts = 1,
  siaaRetryMs = 30_000,
}) {
  const body = buildNotesPayload(additionalData);
  await client.request(
    "enem_notes",
    "PATCH",
    `${client.baseUrl}/api/dataentities/OP/documents/${leadId}?an=cruzeirodosul`,
    body
  );

  if (body.statusGraduacao !== 1) {
    return { notes: body, inscricaoSIAA: null, matriculaUrl: null, siaaLocation: null };
  }

  const codigoEmpresa = payloads?.course?.marca ?? PROCESS_CONFIG.marca;
  const cpf = candidate?.cpfDigits || candidate?.cpf;
  const matriculaUrl = buildMatriculaUrl({ codigoEmpresa, cpf });
  const fetchImpl = client.fetchImpl || fetch;
  const waitMs = siaaWaitMs === undefined ? 0 : siaaWaitMs;
  await sleep(waitMs);

  let siaaRes = null;
  const attempts = Math.max(1, siaaAttempts);
  for (let i = 0; i < attempts; i++) {
    siaaRes = await startSiaaMatricula(fetchImpl, matriculaUrl);
    if (siaaRes.inscricaoSIAA) break;
    if (i < attempts - 1) await sleep(siaaRetryMs);
  }

  if (client.steps) {
    client.steps.push({
      step: "siaa_matricula",
      status: siaaRes.inscricaoSIAA ? "ok" : "error",
      httpStatus: siaaRes.status,
      errorCode: siaaRes.inscricaoSIAA ? null : `HTTP_${siaaRes.status}`,
    });
  }

  return {
    notes: body,
    inscricaoSIAA: siaaRes.inscricaoSIAA || null,
    matriculaUrl,
    siaaLocation: siaaRes.location || null,
  };
}

module.exports = {
  id: "graduacao_enem",
  label: "Graduação — ENEM",
  department: "Graduação",
  homologated: true,
  additionalFields,
  successCriterion: "enemNotes",
  postOrder: { fetchProva: false },
  discoveryNotes: null,
  PROCESS_CONFIG,
  parseEnemNotes,
  computeMedia,
  buildNotesPayload,
  buildMatriculaUrl,
  extractNrInscricao,
  startSiaaMatricula,
  buildPayloads,
  afterOrder,
};
