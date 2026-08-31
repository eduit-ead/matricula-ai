const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { runEnrollment } = require("../src/core/enrollment-engine");
const { listCourses } = require("../src/core/catalog-service");

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { getSetCookie: () => [], get: () => null },
    text: async () => JSON.stringify(body),
  };
}

const candidate = {
  nomeCompleto: "Ana Silva",
  email: "ana.dry@example.com",
  telefone: "11988887777",
  cpf: "12345678909",
  nascimento: "01/02/2000",
  cep: "05001200",
};

describe("dry-run engine", () => {
  test("homologated flow does not POST lead", async () => {
    const calls = [];
    const fetchImpl = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || "GET" });
      if (String(url).includes("postal-code")) {
        return jsonResponse(200, {
          postalCode: "05001-200",
          city: "São Paulo",
          state: "SP",
          country: "BRA",
          street: "Rua Exemplo",
          neighborhood: "Bairro",
          geoCoordinates: [-46.6, -23.5],
        });
      }
      throw new Error("unexpected " + url);
    };

    const result = await runEnrollment(
      {
        type: "graduacao_multipla",
        course: "Gestão Financeira",
        pole: "Barra Funda",
        candidate,
      },
      { allowRealEnrollments: false, fetchImpl, skipDiscovery: true, muted: true }
    );

    assert.equal(result.success, true);
    assert.equal(result.status, "dry_run");
    assert.equal(result.leadId, null);
    assert.equal(result.provaLink, null);
    assert.ok(result.steps.some((s) => s.step === "catalog_resolved"));
    assert.equal(calls.some((c) => String(c.url).includes("/v1/lead")), false);
    assert.equal(calls.some((c) => String(c.url).includes("transaction")), false);
    assert.equal(result.nextAction, "enable_ALLOW_REAL_ENROLLMENTS");
  });

  test("unhomologated real enrollment is refused", async () => {
    const result = await runEnrollment(
      {
        type: "graduacao_redacao",
        course: "Gestão Financeira",
        pole: "Barra Funda",
        candidate,
      },
      { allowRealEnrollments: true, skipDiscovery: true, muted: true, fetchImpl: async () => jsonResponse(200, {}) }
    );
    assert.equal(result.success, false);
    assert.equal(result.enrollmentCompleted, false);
    assert.equal(result.status, "inscricao_nao_realizada");
    assert.equal(result.error.code, "FLOW_NOT_HOMOLOGATED");
    assert.equal(result.nextAction, "retry");
  });

  test("unhomologated dry-run succeeds without payloads", async () => {
    const all = listCourses({ department: "Pós-Graduação", limit: 500 });
    const counts = {};
    for (const c of all) counts[c.courseName] = (counts[c.courseName] || 0) + 1;
    const sample = all.find((c) => counts[c.courseName] === 1);
    assert.ok(sample);
    const result = await runEnrollment(
      {
        type: "pos",
        course: sample.courseName,
        pole: "Barra Funda",
        candidate,
      },
      {
        allowRealEnrollments: false,
        skipDiscovery: true,
        muted: true,
        fetchImpl: async (url) => {
          if (String(url).includes("postal-code")) {
            return jsonResponse(200, { city: "São Paulo", state: "SP", street: "X", neighborhood: "Y", postalCode: "05001-200", country: "BRA", geoCoordinates: [] });
          }
          throw new Error("unexpected " + url);
        },
      }
    );
    assert.equal(result.success, true);
    assert.equal(result.status, "dry_run");
    assert.equal(result.nextAction, "flow_discovery_required");
    assert.equal(result.payloadPreview, null);
  });
});
