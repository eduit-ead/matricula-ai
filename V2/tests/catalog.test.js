const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
  deriveCodigoCurso,
  resolveCurso,
  resolvePolo,
  listDepartments,
  listCourses,
} = require("../src/core/catalog-service");

describe("catalog", () => {
  test("departments are Graduação and Pós-Graduação", () => {
    const deps = listDepartments().map((d) => d.name).sort();
    assert.deepEqual(deps, ["Graduação", "Pós-Graduação"]);
  });

  test("deriveCodigoCurso only for 012 refs", () => {
    const grad = deriveCodigoCurso("0120000000425");
    assert.equal(grad.codigoCurso, "164250");
    assert.equal(grad.codigoCursoLead, "4250");
    const pos = deriveCodigoCurso("0070000001574");
    assert.equal(pos.codigoCurso, null);
    assert.equal(pos.codigoCursoLead, null);
  });

  test("resolveCurso Graduação", () => {
    const c = resolveCurso({ nome: "Gestão Financeira", department: "Graduação" });
    assert.equal(c.department, "Graduação");
    assert.match(c.productRef, /^012/);
    assert.ok(c.codigoCurso);
    assert.ok(c.skuId);
  });

  test("resolveCurso Pós-Graduação uses 007 ref and no codigoCurso", () => {
    const all = listCourses({ department: "Pós-Graduação", limit: 500 });
    const counts = {};
    for (const c of all) counts[c.courseName] = (counts[c.courseName] || 0) + 1;
    const sample = all.find((c) => counts[c.courseName] === 1);
    assert.ok(sample, "catálogo deve ter Pós com nome único");
    const c = resolveCurso({ nome: sample.courseName, department: "Pós-Graduação" });
    assert.equal(c.department, "Pós-Graduação");
    assert.match(c.productRef, /^007/);
    assert.equal(c.codigoCurso, null);
  });

  test("resolvePolo Barra Funda", () => {
    const p = resolvePolo({ prefixo: "Barra Funda", cidade: "São Paulo" });
    assert.ok(p.poleId);
    assert.match(String(p.poloLabel + p.poloShort), /Barra Funda/i);
  });
});
