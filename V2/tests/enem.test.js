const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { ValidationError } = require("../src/core/errors");
const flow = require("../src/flows/graduacao-enem");
const { resolveCurso, resolvePolo } = require("../src/core/catalog-service");
const { runEnrollment } = require("../src/core/enrollment-engine");

const notes = {
  enemAno: "2022",
  enemCHumanas: 112.3,
  enemCNatureza: 234.2,
  enemLinguagens: 234.2,
  enemMatematica: 234.2,
  enemRedacao: 234,
};

const candidate = {
  nomeCompleto: "Ana Silva",
  email: "ana.enem@example.com",
  telefone: "11988887777",
  cpf: "12345678909",
  nascimento: "01/02/2000",
  cep: "05001200",
};

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { getSetCookie: () => [], get: () => null },
    text: async () => JSON.stringify(body),
  };
}

describe("Graduação ENEM", () => {
  test("media matches HAR (one decimal)", () => {
    assert.equal(flow.computeMedia(notes), 209.8);
    const payload = flow.buildNotesPayload(notes);
    assert.equal(payload.enemMedia, 209.8);
    assert.equal(payload.enemTermo, true);
    assert.equal(payload.enemAceite, true);
    assert.equal(payload.statusGraduacao, 2);
    assert.equal(payload.enemAno, "2022");
    assert.equal("enemNumeroInscricao" in payload, false);
  });

  test("approved HAR uses statusGraduacao 1 when media >= 300", () => {
    const approved = {
      enemAno: "2023",
      enemCHumanas: 568,
      enemCNatureza: 586,
      enemLinguagens: 970,
      enemMatematica: 566,
      enemRedacao: 703.5,
    };
    const payload = flow.buildNotesPayload(approved);
    assert.equal(payload.enemMedia, 678.7);
    assert.equal(payload.statusGraduacao, 1);
  });

  test("rejects invalid year", () => {
    assert.throws(() => flow.parseEnemNotes({ ...notes, enemAno: "22" }), ValidationError);
  });

  test("payloads use formaIngresso ENEM and seqVest 1", () => {
    const curso = resolveCurso({ nome: "Gestão Financeira", department: "Graduação" });
    const polo = resolvePolo({ prefixo: "Barra Funda" });
    const payloads = flow.buildPayloads({
      candidate: { firstName: "Ana", lastName: "Silva", email: candidate.email },
      course: curso,
      polo,
      leadId: "lead-uuid",
      orderFormId: "abc123orderformid0000000000000000",
      additionalData: { ...notes, cidade: polo.cidade, poloNome: polo.poloNome2 || polo.poloLabel },
    });
    assert.equal(payloads.input.formaIngresso, "ENEM");
    assert.equal(payloads.course.seqVest, 1);
    assert.equal(payloads.course.codVest, 581);
    assert.equal(payloads.course.campanhaId, 2708);
    assert.equal(payloads.leadPatchIngresso.formaIngresso, "ENEM");
    assert.equal(payloads.leadPatchIngresso.campanhaSeqVest, 1);
    assert.equal(payloads.leadPatchIngresso.enemAno, null);
    assert.equal(payloads.setPrices.body.seqVest, "1");
    assert.equal(payloads.enemNotes.enemMedia, 209.8);

    const vars = JSON.parse(Buffer.from(payloads.addToCart.extensions.variables, "base64").toString("utf8"));
    const ingresso = vars.items[0].options.find((o) => o.assemblyId === "Forma de Ingresso");
    assert.equal(ingresso.inputValues["Forma de Ingresso"], "ENEM");
    const campanha = vars.items[0].options.find((o) => o.assemblyId === "Campanha");
    assert.equal(campanha.inputValues.seqVest, 1);
  });

  test("dry-run requires notes and previews PATCH body", async () => {
    const missing = await runEnrollment(
      { type: "graduacao_enem", course: "Gestão Financeira", pole: "Barra Funda", candidate },
      { allowRealEnrollments: false, skipDiscovery: true, muted: true, fetchImpl: async () => jsonResponse(200, {}) }
    );
    assert.equal(missing.success, false);
    assert.equal(missing.enrollmentCompleted, false);
    assert.equal(missing.status, "inscricao_nao_realizada");
    assert.equal(missing.error.code, "VALIDATION_ERROR");

    const result = await runEnrollment(
      {
        type: "graduacao_enem",
        course: "Gestão Financeira",
        pole: "Barra Funda",
        candidate,
        additionalData: notes,
      },
      {
        allowRealEnrollments: false,
        skipDiscovery: true,
        muted: true,
        fetchImpl: async (url) => {
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
        },
      }
    );
    assert.equal(result.success, true);
    assert.equal(result.status, "dry_run");
    assert.equal(result.payloadPreview.formaIngresso, "ENEM");
    assert.equal(result.payloadPreview.campanha.seqVest, 1);
    assert.equal(result.payloadPreview.enemNotes.enemMedia, 209.8);
    assert.equal(result.payloadPreview.enemNotes.statusGraduacao, 2);
  });

  test("matricula SIAA URL matches HAR Iniciar matrícula", () => {
    const url = flow.buildMatriculaUrl({ codigoEmpresa: 12, cpf: "229.483.450-06" });
    assert.equal(
      url,
      "https://siaa.cruzeirodosul.edu.br/vestibular-inscricao/resultado/matricula-unificada.jsf?inicio=1&codigoEmpresa=12&cpfCandidato=22948345006"
    );
    assert.equal(
      flow.extractNrInscricao(
        "https://siaa.cruzeirodosul.edu.br/vestibular-inscricao/resultado/matricula-unificada.jsf?inicio=1&codigoEmpresa=12&cpfCandidato=22948345006&nrInscricao=265953507"
      ),
      "265953507"
    );
  });

  test("afterOrder skips SIAA when reprovado", async () => {
    const calls = [];
    const client = {
      baseUrl: "https://cruzeirodosul.myvtex.com",
      request: async (step, method, url, body) => {
        calls.push({ step, method, url, body });
        return { status: 204, json: null, text: "", url, location: null };
      },
    };
    const after = await flow.afterOrder({
      client,
      leadId: "lead-uuid",
      additionalData: notes,
      candidate: { cpfDigits: "12345678909" },
      payloads: { course: { marca: 12 } },
      siaaWaitMs: 0,
    });
    assert.equal(after.notes.statusGraduacao, 2);
    assert.equal(after.inscricaoSIAA, null);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].step, "enem_notes");
  });

  test("afterOrder aprovado calls SIAA and reads nrInscricao from Location", async () => {
    const approved = {
      enemAno: "2023",
      enemCHumanas: 568,
      enemCNatureza: 586,
      enemLinguagens: 970,
      enemMatematica: 566,
      enemRedacao: 703.5,
    };
    const calls = [];
    const client = {
      baseUrl: "https://cruzeirodosul.myvtex.com",
      steps: [],
      request: async (step, method, url, body) => {
        calls.push({ step, method, url, body });
        return { status: 204, json: null, text: "", url, location: null };
      },
      fetchImpl: async (url, opts) => {
        calls.push({ step: "siaa_matricula", method: opts.method, url, headers: opts.headers });
        return {
          ok: false,
          status: 302,
          url,
          headers: {
            get: (name) =>
              name.toLowerCase() === "location"
                ? "https://siaa.cruzeirodosul.edu.br/vestibular-inscricao/resultado/matricula-unificada.jsf?inicio=1&codigoEmpresa=12&cpfCandidato=22948345006&nrInscricao=265953507"
                : null,
          },
          text: async () => "",
        };
      },
    };
    const after = await flow.afterOrder({
      client,
      leadId: "lead-uuid",
      additionalData: approved,
      candidate: { cpfDigits: "22948345006" },
      payloads: { course: { marca: 12 } },
      siaaWaitMs: 0,
      siaaAttempts: 1,
    });
    assert.equal(after.notes.statusGraduacao, 1);
    assert.equal(after.inscricaoSIAA, "265953507");
    assert.equal(calls[0].step, "enem_notes");
    assert.equal(calls[1].step, "siaa_matricula");
    assert.equal(calls[1].headers["Content-Type"], undefined);
    assert.match(calls[1].url, /cpfCandidato=22948345006/);
    assert.match(calls[1].url, /codigoEmpresa=12/);
  });
});
