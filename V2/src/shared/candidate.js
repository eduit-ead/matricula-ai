function splitName(full) {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || parts[0] };
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatPhone(digits) {
  const d = digitsOnly(digits);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

function formatCep(cep) {
  const d = digitsOnly(cep);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : String(cep || "");
}

function birthISO(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [d, m, y] = raw.split(/[/-]/);
  if (!d || !m || !y) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function phoneCheckout(phone) {
  return `+55 ${String(phone).replace(/[()-\s]/g, " ").replace(/\s+/g, " ").trim()}`;
}

function normalizeCandidate(raw = {}) {
  const fullName =
    raw.nomeCompleto ||
    raw.fullName ||
    [raw.firstName, raw.lastName].filter(Boolean).join(" ") ||
    "";
  const { firstName, lastName } = raw.firstName
    ? { firstName: raw.firstName, lastName: raw.lastName || raw.firstName }
    : splitName(fullName);
  const phone = formatPhone(raw.telefone || raw.phone || "");
  const cpfRaw = raw.cpf || "";
  const cepRaw = digitsOnly(raw.cep || raw.cepRaw || raw.postalCode || "");
  const nascimento = raw.nascimento || raw.birthDate || "";
  return {
    fullName: `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    email: String(raw.email || "").trim(),
    phone,
    phoneCheckout: phone ? phoneCheckout(phone) : "",
    cpf: cpfRaw,
    cpfDigits: digitsOnly(cpfRaw),
    nascimento,
    birthDate: birthISO(nascimento),
    postalCode: formatCep(cepRaw),
    cepRaw,
    semNumero: raw.semNumero !== false && raw.semNumero !== "nao",
    number: raw.number || raw.numero || "",
    complemento: raw.complemento || raw.complement || "",
    street: raw.street || raw.rua || "",
    neighborhood: raw.neighborhood || raw.bairro || "",
  };
}

module.exports = {
  splitName,
  digitsOnly,
  formatPhone,
  formatCep,
  birthISO,
  todayISO,
  phoneCheckout,
  normalizeCandidate,
};
