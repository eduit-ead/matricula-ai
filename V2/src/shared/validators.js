const { ValidationError } = require("../core/errors");

const BASE_CANDIDATE_FIELDS = [
  { key: "nomeCompleto", aliases: ["fullName", "firstName"], label: "Nome completo" },
  { key: "email", aliases: ["email"], label: "E-mail" },
  { key: "telefone", aliases: ["phone"], label: "Telefone" },
  { key: "cpf", aliases: ["cpf"], label: "CPF" },
  { key: "nascimento", aliases: ["birthDate"], label: "Data de nascimento" },
  { key: "cep", aliases: ["cepRaw", "postalCode"], label: "CEP" },
];

function hasValue(obj, keys) {
  return keys.some((k) => {
    const v = obj[k];
    return v != null && String(v).trim() !== "";
  });
}

function validateCandidate(candidate, extraFields = []) {
  const missing = [];
  for (const field of BASE_CANDIDATE_FIELDS) {
    if (!hasValue(candidate, [field.key, ...field.aliases])) missing.push(field.label);
  }
  for (const field of extraFields) {
    const keys = [field.key, ...(field.aliases || [])];
    const src = candidate.additionalData || candidate;
    if (field.required !== false && !hasValue(src, keys) && !hasValue(candidate, keys)) {
      missing.push(field.label || field.key);
    }
  }
  if (missing.length) {
    throw new ValidationError(`Campos obrigatórios ausentes: ${missing.join(", ")}`);
  }
  if (candidate.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email)) {
    throw new ValidationError("E-mail inválido.");
  }
  if (candidate.cpfDigits && candidate.cpfDigits.length !== 11) {
    throw new ValidationError("CPF deve ter 11 dígitos.");
  }
  if (candidate.cepRaw && candidate.cepRaw.length !== 8) {
    throw new ValidationError("CEP deve ter 8 dígitos.");
  }
  if (!candidate.birthDate) {
    throw new ValidationError("Data de nascimento inválida. Use DD/MM/YYYY ou YYYY-MM-DD.");
  }
}

function emptyEnrollmentResult(type) {
  return {
    success: false,
    type: type || null,
    status: "failed",
    executionId: null,
    orderFormId: null,
    leadId: null,
    orderGroup: null,
    orderId: null,
    inscricaoSIAA: null,
    provaLink: null,
    enemNotes: null,
    enrollmentCompleted: false,
    error: null,
    nextAction: null,
    durationMs: 0,
    steps: [],
  };
}

module.exports = {
  BASE_CANDIDATE_FIELDS,
  validateCandidate,
  emptyEnrollmentResult,
};
