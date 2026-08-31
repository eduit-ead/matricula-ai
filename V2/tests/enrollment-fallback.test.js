const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { runEnrollment } = require("../src/core/enrollment-engine");

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
  email: "ana.fallback@example.com",
  telefone: "11988887777",
  cpf: "12345678909",
  nascimento: "01/02/2000",
  cep: "05001200",
};

const ORDER_FORM_ID = "a0ee087ff6ef468798e15c755cc8f428";

describe("enrollment failure fallback", () => {
  test("VTEX 404 on lead returns inscricao_nao_realizada with error payload", async () => {
    const result = await runEnrollment(
      {
        type: "graduacao_multipla",
        course: "Gestão Financeira",
        pole: "Barra Funda",
        candidate,
      },
      {
        allowRealEnrollments: true,
        skipDiscovery: true,
        muted: true,
        fetchImpl: async (url) => {
          const u = String(url);
          if (u.includes("postal-code")) {
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
          if (u.includes("/api/sessions")) return jsonResponse(201, {});
          if (u.includes("graphql")) {
            return jsonResponse(200, { orderFormId: ORDER_FORM_ID });
          }
          if (u.includes("/v1/lead")) {
            return jsonResponse(404, { message: "Not Found" });
          }
          throw new Error("unexpected " + u);
        },
      }
    );

    assert.equal(result.success, false);
    assert.equal(result.enrollmentCompleted, false);
    assert.equal(result.status, "inscricao_nao_realizada");
    assert.equal(result.nextAction, "retry");
    assert.equal(result.error.code, "VTEX_HTTP_ERROR");
    assert.equal(result.error.httpStatus, 404);
    assert.equal(result.error.step, "lead_created");
    assert.equal(result.leadId, null);
    assert.equal(result.orderFormId, ORDER_FORM_ID);
  });
});
