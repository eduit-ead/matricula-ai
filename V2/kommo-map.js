/**
 * Mapa Kommo → motor. Polo_Inscicao só entra por chave exata → poleId.
 * Nunca resolve por substring (vila / taboão / campinas ambíguos).
 *
 * Slugs oficiais = coluna `polo` de catalog/Polos.xlsx (13 polos).
 * "polo mais próximo" → polo-proximo.js (Supabase polo_loc + geocode).
 */
const { CatalogError } = require("./catalog-resolver");

function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** slug Kommo / Excel `polo` → { poleId, prefixo } prefixo = valor exato do Excel */
const POLO_INSCRICAO = {
  morumbi: { poleId: 45, prefixo: "Morumbi" },
  "sapopemba (vila ema)": { poleId: 1876, prefixo: "sapopemba (vila ema)" },
  sapopemba: { poleId: 1876, prefixo: "sapopemba (vila ema)" },
  freguesia: { poleId: 2257, prefixo: "freguesia" },
  "vila prudente 2": { poleId: 2841, prefixo: "vila prudente 2" },
  "santana 2": { poleId: 43, prefixo: "santana 2" },
  "barra funda": { poleId: 50, prefixo: "barra funda" },
  mituzi: { poleId: 1823, prefixo: "mituzi" },
  "taboao mituzi": { poleId: 1823, prefixo: "mituzi" },
  "ouro verde": { poleId: 3135, prefixo: "ouro verde" },
  campinas: { poleId: 3135, prefixo: "ouro verde" },
  capivari: { poleId: 3136, prefixo: "capivari" },
  "taboao centro": { poleId: 3146, prefixo: "taboão centro" },
  ibirapuera: { poleId: 8932, prefixo: "ibirapuera" },
  itapira: { poleId: 3137, prefixo: "Itapira" },
  "vila mariana": { poleId: 2188, prefixo: "Vila Mariana" },
};

const POLO_VALIDOS = [
  "morumbi",
  "sapopemba (vila ema)",
  "freguesia",
  "vila prudente 2",
  "santana 2",
  "barra funda",
  "mituzi",
  "ouro verde",
  "capivari",
  "taboão centro",
  "ibirapuera",
  "itapira",
  "vila mariana",
];

const FIELD = {
  formacao: ["formacao"],
  tipoInscricao: ["tipo inscricao", "tipo_inscricao"],
  poloInscricao: ["polo inscicao", "polo inscricao", "polo_inscicao", "polo_inscricao"],
  cursoInscricao: ["curso inscricao"],
  nome: ["nome"],
  cpf: ["cpf"],
  email: ["e-mail", "email"],
  cep: ["cep"],
  telefone: ["telefone inscricao"],
  nascimento: ["data de nascimento"],
  resultadoEnem: ["resultado enem"],
};

function fieldExact(fields, names) {
  if (!Array.isArray(fields) || !names?.length) return "";
  const want = new Set(names.map(norm));
  for (const f of fields) {
    const label = norm(f.field_name || f.field_code || "");
    if (!want.has(label)) continue;
    const v = f.values?.[0]?.value;
    if (v == null || String(v).trim() === "") continue;
    if (typeof v === "object") return String(v.name || v.enum || "").trim();
    return String(v).trim();
  }
  return "";
}

function fieldFileMeta(fields, names) {
  if (!Array.isArray(fields) || !names?.length) return null;
  const want = new Set(names.map(norm));
  for (const f of fields) {
    const label = norm(f.field_name || f.field_code || "");
    if (!want.has(label)) continue;
    const row = f.values?.[0];
    if (!row) continue;
    const v = row.value;
    if (v && typeof v === "object") {
      const uuid = v.file_uuid || v.uuid || row.file_uuid;
      if (uuid) return { uuid, name: v.file_name || v.name || "" };
    }
    if (row.file_uuid) return { uuid: row.file_uuid, name: row.file_name || "" };
  }
  return null;
}

function resolvePoloInscricao(raw) {
  const q = norm(raw);
  if (!q || q === "selecione") {
    throw new CatalogError("POLO_VAZIO", "Polo_Inscicao vazio ou 'Selecione'.");
  }
  const hit = POLO_INSCRICAO[q];
  if (!hit) {
    throw new CatalogError(
      "POLO_DESCONHECIDO",
      `Polo_Inscicao="${raw}" não está no mapa. Válidos: ${POLO_VALIDOS.join(", ")}.`
    );
  }
  return hit;
}

function mapForma(raw) {
  const n = norm(raw);
  if (!n) return "";
  if (n.includes("segunda")) return "Segunda Graduação";
  if (n.includes("transfer")) return "Transferência";
  if (n.includes("enem")) return "ENEM";
  if (n.includes("redac")) return "Vestibular Redação";
  if (n.includes("multipl") || n === "vestibular") return "Vestibular Múltipla Escolha";
  if (n.includes("pos") || n.includes("mba")) return "Pós Graduação";
  return "";
}

function mapFormacaoTipo(formacao, tipo) {
  const formaTipo = mapForma(tipo);
  if (formaTipo) {
    const pos = formaTipo === "Pós Graduação";
    return {
      department: pos ? "Pós-Graduação" : "Graduação",
      formaIngresso: formaTipo,
    };
  }
  const nForm = norm(formacao);
  if (nForm === "pos" || nForm === "pos graduacao") {
    return { department: "Pós-Graduação", formaIngresso: "Pós Graduação" };
  }
  return {
    department: "Graduação",
    formaIngresso: "Vestibular Múltipla Escolha",
  };
}

function cepDigits(cep) {
  return String(cep || "").replace(/\D/g, "");
}

function requireCep(cep) {
  let d = cepDigits(cep);
  if (!d) {
    const err = new Error("CEP ausente no lead");
    err.code = "CEP_AUSENTE";
    throw err;
  }
  if (d.length === 7) d = `0${d}`;
  if (d.length !== 8) {
    const err = new Error(`CEP inválido: "${cep}" (${cepDigits(cep).length} dígitos). Informe 8 dígitos.`);
    err.code = "CEP_INVALIDO";
    throw err;
  }
  return d;
}

async function assertCepExiste(cep8) {
  const res = await fetch(`https://cruzeirodosul.myvtex.com/api/checkout/pub/postal-code/BRA/${cep8}`);
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok || !json?.postalCode) {
    const err = new Error(`CEP inválido ou não encontrado: ${cep8}`);
    err.code = "CEP_INVALIDO";
    throw err;
  }
  return json;
}

function normalizePhone(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  return d;
}

function leadFromKommoFields(lead, contact = {}) {
  const fields = lead.custom_fields_values || [];
  const cfields = contact.custom_fields_values || [];
  const all = [...fields, ...cfields];
  const formacao = fieldExact(all, FIELD.formacao);
  const tipo = fieldExact(all, FIELD.tipoInscricao);
  const { department, formaIngresso } = mapFormacaoTipo(formacao, tipo);
  const poloRaw = fieldExact(all, FIELD.poloInscricao);
  return {
    leadId: lead.id != null ? String(lead.id) : "",
    nome: fieldExact(all, FIELD.nome) || lead.name || contact.name || "",
    cpf: fieldExact(all, FIELD.cpf),
    email: fieldExact(all, FIELD.email),
    telefone: normalizePhone(fieldExact(all, FIELD.telefone)),
    nascimento: fieldExact(all, FIELD.nascimento),
    curso: fieldExact(all, FIELD.cursoInscricao),
    poloRaw,
    department,
    formaIngresso,
    formacao,
    tipoInscricao: tipo,
    cep: cepDigits(fieldExact(all, FIELD.cep)),
    enemFile: fieldFileMeta(all, FIELD.resultadoEnem),
  };
}

module.exports = {
  norm,
  POLO_INSCRICAO,
  POLO_VALIDOS,
  FIELD,
  fieldExact,
  fieldFileMeta,
  resolvePoloInscricao,
  mapFormacaoTipo,
  cepDigits,
  requireCep,
  assertCepExiste,
  normalizePhone,
  leadFromKommoFields,
};
