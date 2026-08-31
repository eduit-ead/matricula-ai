const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
  splitName,
  digitsOnly,
  formatPhone,
  formatCep,
  birthISO,
  normalizeCandidate,
} = require("../src/shared/candidate");

describe("candidate normalization", () => {
  test("splitName", () => {
    assert.deepEqual(splitName("Gabriel Lkonne"), { firstName: "Gabriel", lastName: "Lkonne" });
    assert.equal(splitName("Maria").lastName, "Maria");
  });

  test("formatPhone and CEP", () => {
    assert.equal(formatPhone("13997121322"), "(13) 99712-1322");
    assert.equal(formatCep("05001200"), "05001-200");
    assert.equal(digitsOnly("342.043.830-33"), "34204383033");
  });

  test("birthISO accepts BR and ISO", () => {
    assert.equal(birthISO("09/09/1999"), "1999-09-09");
    assert.equal(birthISO("1999-09-09"), "1999-09-09");
  });

  test("normalizeCandidate", () => {
    const c = normalizeCandidate({
      nomeCompleto: "Ana Silva",
      email: "ana@example.com",
      telefone: "11988887777",
      cpf: "123.456.789-09",
      nascimento: "01/02/2000",
      cep: "01310-100",
    });
    assert.equal(c.firstName, "Ana");
    assert.equal(c.lastName, "Silva");
    assert.equal(c.cpfDigits, "12345678909");
    assert.equal(c.birthDate, "2000-02-01");
    assert.equal(c.cepRaw, "01310100");
  });
});
