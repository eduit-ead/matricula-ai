#!/usr/bin/env node
/**
 * Wrapper — delega ao fluxo principal api-only-poc.js
 * (Gestão Financeira / Barra Funda / Gabriel Lkonne)
 */
const fs = require("fs");
const path = require("path");
const { runInscricao } = require("./api-only-poc");

runInscricao({
  curso: "Gestão Financeira",
  polo_prefixo: "Barra Funda",
  poloNome: "São Paulo - Barra Funda - SP - UNIVERSIDADE CIDADE DE SÃO PAULO",
  email: "la525kulss@gmail.com",
  firstName: "Gabriel",
  lastName: "Lkonne",
  phone: "(13) 99712-1322",
  cpf: "342.043.830-33",
  nascimento: "09/09/1999",
  cepRaw: "05001200",
  postalCode: "05001-200",
  cidade: "São Paulo",
  estado: "São Paulo",
  formaIngresso: "Vestibular Múltipla Escolha",
  necessidadeEspecial: "0 - Não necessito de condições especiais",
  semNumero: true,
  complemento: "",
})
  .then((result) => {
    const outPath = path.join(__dirname, "inscricao-gabriel-report.json");
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(`Relatório: ${outPath}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("FALHA:", err.message);
    process.exit(1);
  });
