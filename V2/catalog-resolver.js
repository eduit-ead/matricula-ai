/**
 * Compat wrapper — catálogo de fatos + process config só para callers antigos.
 * Novos callers devem usar src/core/catalog-service.js + o fluxo correspondente.
 */
const catalog = require("./src/core/catalog-service");
const { PROCESS_CONFIG } = require("./src/flows/graduacao-multipla");

function logCatalog(resolvedCurso, resolvedPolo) {
  const lines = [
    `[CATALOG]`,
    `curso: ${resolvedCurso.courseName}`,
    `skuId: ${resolvedCurso.skuId}`,
    `productId: ${resolvedCurso.productId}`,
    `fonte: ${resolvedCurso.fonte}`,
    `[CATALOG]`,
    `polo: ${resolvedPolo.poloLabel}`,
    `poleId: ${resolvedPolo.poleId}`,
    `fonte: ${resolvedPolo.fonte}`,
  ];
  for (const line of lines) console.log(line);
  return lines;
}

function buildCourseConfig(resolvedCurso, defaults = {}) {
  return {
    productId: resolvedCurso.productId,
    skuId: resolvedCurso.skuId,
    courseName: resolvedCurso.courseName,
    productLabel: resolvedCurso.productLabel,
    codigoDoCurso: resolvedCurso.codigoCurso,
    codigoDoCursoLead: resolvedCurso.codigoCursoLead,
    codCursoSetprices: resolvedCurso.codigoCurso,
    productRef: resolvedCurso.productRef,
    slugGuess: resolvedCurso.slugGuess,
    department: resolvedCurso.department,
    codVest: defaults.codVest ?? PROCESS_CONFIG.codVest,
    seqVest: defaults.seqVest ?? PROCESS_CONFIG.seqVest,
    campanhaId: defaults.campanhaId ?? PROCESS_CONFIG.campanhaId,
    campanhaNome: defaults.campanhaNome ?? PROCESS_CONFIG.campanhaNome,
    productValue: defaults.productValue ?? PROCESS_CONFIG.productValue,
    areaInteresse: defaults.areaInteresse ?? PROCESS_CONFIG.areaInteresse,
    tipoFormacao: defaults.tipoFormacao ?? PROCESS_CONFIG.tipoFormacao,
    modalidade: defaults.modalidade ?? PROCESS_CONFIG.modalidade,
    unidade: defaults.unidade ?? PROCESS_CONFIG.unidade,
    ciclo: defaults.ciclo ?? PROCESS_CONFIG.ciclo,
  };
}

function resolveCatalog(input) {
  const facts = catalog.resolveCatalogFacts({
    curso: input.curso,
    department: input.department,
    polo_prefixo: input.polo_prefixo,
    cidade: input.cidade,
    estado: input.estado,
  });
  const course = buildCourseConfig(facts.curso, input.courseDefaults || {});
  const logs = logCatalog(facts.curso, facts.polo);
  return {
    curso: facts.curso,
    polo: facts.polo,
    course,
    catalogLookupMs: facts.catalogLookupMs,
    logs,
  };
}

module.exports = {
  CatalogError: catalog.CatalogError,
  resolveCurso: (opts) =>
    catalog.resolveCurso({ department: "Graduação", ...opts }),
  resolvePolo: catalog.resolvePolo,
  resolveCatalog,
  logCatalog,
  buildCourseConfig,
  loadCatalog: catalog.loadCatalog,
  resetCache: catalog.resetCache,
  deriveCodigoCurso: catalog.deriveCodigoCurso,
};
