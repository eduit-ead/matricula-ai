const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { emptyEnrollmentResult } = require("../src/shared/validators");
const { validateCandidate } = require("../src/shared/validators");
const { normalizeCandidate } = require("../src/shared/candidate");

describe("enrollment contract", () => {
  test("missing fields are null, provaLink absence is not failure", () => {
    const r = emptyEnrollmentResult("graduacao_transferencia");
    assert.equal(r.success, false);
    assert.equal(r.provaLink, null);
    assert.equal(r.inscricaoSIAA, null);
    assert.equal(r.orderGroup, null);
    assert.equal(r.enrollmentCompleted, false);
    assert.equal(r.error, null);
    assert.equal(r.type, "graduacao_transferencia");
  });

  test("validators require base candidate fields", () => {
    const c = normalizeCandidate({ nomeCompleto: "A B", email: "x" });
    assert.throws(() => validateCandidate(c), /Campos obrigatórios/);
  });

  test("valid candidate passes", () => {
    const c = normalizeCandidate({
      nomeCompleto: "Ana Silva",
      email: "ana@example.com",
      telefone: "11988887777",
      cpf: "12345678909",
      nascimento: "01/02/2000",
      cep: "01310100",
    });
    validateCandidate(c);
  });
});
