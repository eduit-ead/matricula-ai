#!/usr/bin/env node
/**
 * Adapter CLI — Golden Path Graduação Múltipla Escolha.
 * Delega a runEnrollment({ type: "graduacao_multipla" }).
 *
 * ALLOW_REAL_ENROLLMENTS=true para criar inscrição de verdade (default: false).
 */
const fs = require("fs");
const path = require("path");
const { CatalogError } = require("./src/core/errors");
const { runEnrollment } = require("./src/core/enrollment-engine");
const { normalizeCandidate, formatPhone, formatCep, birthISO, digitsOnly } = require("./src/shared/candidate");

function env(key, fallback = "") {
  return process.env[key] || process.env[`POC_${key}`] || fallback;
}

function loadInput(overrides = {}) {
  const nomeCompleto = env("NOME_COMPLETO", env("NOME", "Gabriel Lkonne"));
  const phone = formatPhone(env("TELEFONE", "13997121322"));
  const cpf = env("CPF", "342.043.830-33");
  const nascimento = env("NASCIMENTO", "09/09/1999");
  const cidade = env("CIDADE", "São Paulo");
  const estado = env("ESTADO", "São Paulo");
  const poloResolved = env("POLO_PREFIXO", env("POLO", "Barra Funda"));

  const base = {
    curso: env("CURSO", "Gestão Financeira"),
    department: env("DEPARTMENT", "Graduação"),
    polo_prefixo: poloResolved,
    poloNome: env("POLO_NOME") || `${cidade} - ${poloResolved} - SP - UNIVERSIDADE CIDADE DE SÃO PAULO`,
    email: env("EMAIL", `api.poc.${Date.now()}@mailinator.com`),
    firstName: nomeCompleto.trim().split(/\s+/)[0],
    lastName: nomeCompleto.trim().split(/\s+/).slice(1).join(" ") || nomeCompleto.trim().split(/\s+/)[0],
    phone,
    cpf,
    nascimento,
    birthDate: birthISO(nascimento),
    postalCode: formatCep(env("CEP", "05001200")),
    cepRaw: digitsOnly(env("CEP", "05001200")),
    cidade,
    estado,
    formaIngresso: env("FORMA_INGRESSO", "Vestibular Múltipla Escolha"),
    necessidadeEspecial: env("NECESSIDADE_ESPECIAL", "0 - Não necessito de condições especiais"),
    semNumero: env("SEM_NUMERO", "sim") !== "nao",
    complemento: env("COMPLEMENTO", ""),
  };
  return { ...base, ...overrides };
}

async function runInscricao(overrides = {}) {
  const input = loadInput(overrides);
  const candidate = normalizeCandidate({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    telefone: input.phone,
    cpf: input.cpf,
    nascimento: input.nascimento || input.birthDate,
    cep: input.cepRaw || input.postalCode,
    semNumero: input.semNumero,
    complemento: input.complemento,
  });

  const enrolled = await runEnrollment({
    type: "graduacao_multipla",
    course: input.curso,
    pole: input.polo_prefixo,
    candidate,
    additionalData: {
      formaIngresso: input.formaIngresso,
      necessidadeEspecial: input.necessidadeEspecial,
      poloNome: input.poloNome,
      cidade: input.cidade,
      estado: input.estado,
    },
  });

  const result = {
    ok: enrolled.success,
    catalogLookupMs: enrolled.catalogLookupMs || null,
    checkoutMs: enrolled.durationMs,
    tempoTotalInscricaoMs: enrolled.durationMs,
    orderGroup: enrolled.orderGroup,
    orderId: enrolled.orderId,
    email: input.email,
    catalog: enrolled.catalog,
    course: enrolled.course,
    ctx: { orderFormId: enrolled.orderFormId, leadId: enrolled.leadId },
    post: enrolled.post || null,
    enrollment: enrolled,
  };

  console.log("\n========================================");
  console.log("EMAIL:", input.email);
  console.log(JSON.stringify({
    ok: enrolled.success,
    status: enrolled.status,
    catalogLookupMs: enrolled.catalogLookupMs,
    tempoTotalInscricaoMs: enrolled.durationMs,
    orderGroup: enrolled.orderGroup,
    orderId: enrolled.orderId,
    inscricaoSIAA: enrolled.inscricaoSIAA,
    provaLink: enrolled.provaLink,
  }, null, 2));

  return result;
}

if (require.main === module) {
  runInscricao()
    .then((result) => {
      const outPath = path.join(__dirname, "inscricao-report.json");
      fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
      console.log(`Relatório: ${outPath}`);
      process.exit(result.ok ? 0 : 1);
    })
    .catch((err) => {
      const code = err instanceof CatalogError ? err.code : err.code || "INSCRICAO_FAILED";
      console.error("\nFALHA:", code, err.message);
      process.exit(1);
    });
}

module.exports = { runInscricao, loadInput };
