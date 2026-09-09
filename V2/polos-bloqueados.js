/**
 * TEMPORÁRIO — bloqueio de polos sem cota estratégica.
 * Para reverter: apagar este arquivo e remover os usos em
 * polo-proximo.js (POLOS_BLOQUEADOS) e inscricao-http.js (assertPoloPermitido).
 */
const { CatalogError } = require("./catalog-resolver");

/** poleId → nome. Capivari, Campinas (ouro verde), Itapira, Freguesia do Ó, Vila Mariana. */
const POLOS_BLOQUEADOS = new Map([
  [3136, "Capivari"],
  [3135, "Campinas"],
  [3137, "Itapira"],
  [2257, "Freguesia do Ó"],
  [2188, "Vila Mariana"],
]);

function poloBloqueado(poleId) {
  return POLOS_BLOQUEADOS.get(Number(poleId)) || null;
}

function assertPoloPermitido(poleId) {
  const nome = poloBloqueado(poleId);
  if (!nome) return;
  throw new CatalogError(
    "SEM_COTA_ESTRATEGICA",
    `Inscrição não foi feita: não tem cota estratégica para esse polo (${nome}).`
  );
}

module.exports = { POLOS_BLOQUEADOS, poloBloqueado, assertPoloPermitido };
