const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const flow = require("../src/flows/graduacao-multipla");
const { resolveCurso, resolvePolo } = require("../src/core/catalog-service");

describe("Golden Path payloads", () => {
  const candidate = {
    firstName: "Gabriel",
    lastName: "Lkonne",
    email: "test@example.com",
    phone: "(13) 99712-1322",
    cidade: "São Paulo",
    poloNome: "São Paulo - Barra Funda - SP - UNIVERSIDADE CIDADE DE SÃO PAULO",
    formaIngresso: "Vestibular Múltipla Escolha",
    necessidadeEspecial: "0 - Não necessito de condições especiais",
  };

  test("process config matches homologated POC", () => {
    assert.equal(flow.PROCESS_CONFIG.codVest, 581);
    assert.equal(flow.PROCESS_CONFIG.seqVest, 5);
    assert.equal(flow.PROCESS_CONFIG.campanhaId, 2708);
    assert.equal(flow.PROCESS_CONFIG.formaIngresso, "Vestibular Múltipla Escolha");
    assert.equal(flow.PROCESS_CONFIG.campanhaSeqVestPolo, "1");
  });

  test("lead / cart / setprices builders", () => {
    const curso = resolveCurso({ nome: "Gestão Financeira", department: "Graduação" });
    const polo = resolvePolo({ prefixo: "Barra Funda" });
    const course = flow.applyProcess(curso);
    const leadPost = flow.buildLeadPost(candidate, course, polo, "abc123orderformid0000000000000000");
    assert.equal(leadPost.codVestibular, 581);
    assert.equal(leadPost.tipoFormacao, "Graduação");
    assert.equal(leadPost.codigoDoCurso, course.codigoDoCursoLead);
    assert.match(leadPost.bindingUrl, /\/grad-/);

    const patchPolo = flow.buildLeadPatchPolo(candidate, course, polo, "of");
    assert.equal(patchPolo.campanhaSeqVest, "1");
    assert.equal(patchPolo.formaIngresso, "Graduação");

    const patchIng = flow.buildLeadPatchIngresso(candidate, course, polo, "of");
    assert.equal(patchIng.formaIngresso, "Vestibular Múltipla Escolha");
    assert.equal(patchIng.campanhaSeqVest, 5);

    const cart = flow.buildAddToCartBody("lead-uuid", course, polo, candidate);
    const vars = JSON.parse(Buffer.from(cart.extensions.variables, "base64").toString("utf8"));
    const assemblies = vars.items[0].options.map((o) => o.assemblyId);
    assert.ok(assemblies.includes("Forma de Ingresso"));
    assert.ok(assemblies.includes("Graduacao Info"));
    assert.ok(assemblies.includes("Campanha"));
    const ingresso = vars.items[0].options.find((o) => o.assemblyId === "Forma de Ingresso");
    assert.equal(ingresso.inputValues["Forma de Ingresso"], "Vestibular Múltipla Escolha");

    const sp = flow.buildSetPrices(course, polo, "of");
    assert.equal(sp.body.codVest, 581);
    assert.equal(sp.body.seqVest, "5");
    assert.equal(sp.body.inscricaoValor, "0.00");
  });
});
