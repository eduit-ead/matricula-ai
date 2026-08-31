const { config } = require("../core/config");
const { todayISO } = require("../shared/candidate");

/** Valores homologados no Golden Path (Graduação / Vestibular Múltipla Escolha). */
const PROCESS_CONFIG = {
  formaIngresso: "Vestibular Múltipla Escolha",
  tipoProva: "VESTIBULAR_MULTIPLA_ESCOLHA",
  necessidadeEspecial: "0 - Não necessito de condições especiais",
  codVest: 581,
  seqVest: 5,
  campanhaId: 2708,
  campanhaNome: "Aprovados - Grad EAD [PDP VTEX]",
  productValue: 5855.48,
  areaInteresse: "Gestão e Negócios",
  tipoFormacao: "Graduação",
  modalidade: 8,
  unidade: 16,
  ciclo: "2026/2",
  cicloSku: 20262,
  marca: 12,
  tipoDoCursoSku: 3,
  pdpPrefix: "grad",
  campanhaSeqVestPolo: "1",
};

function pdpUrl(course) {
  const prefix = course.pdpPrefix || PROCESS_CONFIG.pdpPrefix;
  return `${config.vtexBaseUrl}/${prefix}-${course.slugGuess || "curso"}-cruzeiro-do-sul-virtual/p`;
}

function applyProcess(curso, process = PROCESS_CONFIG) {
  return {
    ...curso,
    codigoDoCurso: curso.codigoCurso,
    codigoDoCursoLead: curso.codigoCursoLead,
    codCursoSetprices: curso.codigoCurso,
    ...process,
  };
}

function buildAddToCartBody(leadId, course, polo, input) {
  const vars = {
    items: [{
      id: course.skuId,
      quantity: 1,
      seller: "1",
      options: [
        {
          assemblyId: "Polo",
          inputValues: {
            Id: String(polo.poleId),
            Estado: polo.estado || "SP",
            Cidade: input.cidade,
            Nome: input.poloNome,
          },
        },
        { assemblyId: "Empresa Parceira", inputValues: { Empresa: "" } },
        {
          assemblyId: "Curso SKU info",
          inputValues: {
            Ciclo: PROCESS_CONFIG.cicloSku,
            Marca: PROCESS_CONFIG.marca,
            "Tipo do Curso": PROCESS_CONFIG.tipoDoCursoSku,
            "Codigo do Curso": course.codigoDoCurso,
            Modalidade: course.modalidade,
            Unidade: course.unidade,
          },
        },
        { assemblyId: "Treineiro", inputValues: { Ano: "", Treineiro: false } },
        {
          assemblyId: "Necessidade Especial",
          inputValues: { "Necessidade Especial": input.necessidadeEspecial },
        },
        { assemblyId: "Documento ID", inputValues: { "Documento ID": leadId } },
        {
          assemblyId: "Graduacao Info",
          inputValues: {
            curso: course.courseName,
            id: course.productId,
            link: `${PROCESS_CONFIG.pdpPrefix}-${course.slugGuess || "curso"}-cruzeiro-do-sul-virtual`,
          },
        },
        {
          assemblyId: "Especificacoes produto",
          inputValues: { turno: "Online", unidade: "Virtual", "plano de pagamento": "6" },
        },
        {
          assemblyId: "Campanha",
          inputValues: {
            Id: course.campanhaId,
            Nome: course.campanhaNome,
            codVest: course.codVest,
            seqVest: course.seqVest,
            codPolo: polo.poleId,
            poloTipo: polo.poleType,
            codCurso: course.codigoDoCurso,
            valorMatricula: 0,
            descontoMensalidade: 10,
            turno: "Online",
            isComercial: false,
          },
        },
        {
          assemblyId: "Forma de Ingresso",
          inputValues: {
            "Forma de Ingresso": input.formaIngresso,
            "Valor da Inscricao": 0,
          },
        },
      ],
    }],
    marketingData: {},
  };
  return {
    operationName: "addToCart",
    variables: {},
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: "a63161354718146c4282079551df81aaa8fa3d59584520cf5ea1c278fac0db33",
        sender: "vtex.checkout-resources@0.x",
        provider: "vtex.checkout-graphql@0.x",
      },
      variables: Buffer.from(JSON.stringify(vars), "utf8").toString("base64"),
    },
  };
}

function buildLeadPost(input, course, _polo, orderFormId) {
  return {
    ciclo: course.ciclo,
    marca: PROCESS_CONFIG.marca,
    tipoDoCurso: course.tipoFormacao,
    codigoDoCurso: course.codigoDoCursoLead,
    modalidade: "EAD",
    duracao: 4,
    unidade: "16,18,22,60,71,75,80",
    account: "1",
    productId: course.productId,
    email: input.email,
    name: `${input.firstName} ${input.lastName}`,
    firstName: input.firstName,
    lastName: input.lastName,
    operadorComercial: config.vtexOperatorEmail,
    operadorComercialLogado: config.vtexOperatorEmail,
    phone: input.phone,
    product: course.productLabel,
    orderFormId,
    status: "pending",
    productValue: course.productValue,
    discountValue: course.productValue,
    utmSource: "direct",
    utmMedium: "direct",
    subscriptionDate: todayISO(),
    tipoFormacao: course.tipoFormacao,
    lgpd: true,
    passoFicha: "1",
    codVestibular: course.codVest,
    turno: "0",
    iesNumber: PROCESS_CONFIG.marca,
    courseName: course.courseName,
    areaInteresse: course.areaInteresse,
    ies: "Cruzeiro do Sul Virtual",
    bindingForm: "Ficha de inscrição",
    bindingId: todayISO(),
    bindingUrl: pdpUrl(course),
    codigoAfiliado: "",
  };
}

function buildLeadPatchPolo(input, course, polo, orderFormId) {
  return {
    identifyer: `${course.productId} - ${input.email} - pending`,
    productId: course.productId,
    email: input.email,
    cpf: "",
    pole: input.poloNome,
    poleId: String(polo.poleId),
    poleType: String(polo.poleType),
    state: polo.estado || "SP",
    city: input.cidade,
    country: "BRA",
    product: course.productLabel,
    orderFormId,
    codVestibular: course.codVest,
    period: "Online",
    espUnidade: "Virtual",
    espTurno: "EAD",
    campanhaId: course.campanhaId,
    campanhaNome: course.campanhaNome,
    campanhaMensalidade: 10,
    campanhaPoloId: String(polo.poleId),
    campanhaPoloType: String(polo.poleType),
    campanhaSeqVest: PROCESS_CONFIG.campanhaSeqVestPolo,
    passoFicha: "2",
    marca: PROCESS_CONFIG.marca,
    codigoDoCurso: course.codigoDoCurso,
    turno: "0",
    unidade: course.unidade,
    iesNumber: PROCESS_CONFIG.marca,
    modalidade: course.modalidade,
    ciclo: course.ciclo,
    formaIngressoValue: course.tipoFormacao,
    formaIngresso: course.tipoFormacao,
    tipoDoCurso: course.tipoFormacao,
    tipoFormacao: course.tipoFormacao,
  };
}

function buildLeadPatchIngresso(input, course, polo, orderFormId) {
  return {
    orderFormId,
    cpf: "",
    formaIngresso: input.formaIngresso,
    formaIngressoValue: input.formaIngresso,
    necessidadeEspecial: input.necessidadeEspecial,
    treineiro: "Não",
    statusGraduacao: null,
    tipoFormacao: course.tipoFormacao,
    campanhaId: course.campanhaId,
    campanhaNome: course.campanhaNome,
    campanhaMensalidade: 10,
    campanhaSeqVest: course.seqVest,
    passoFicha: "3",
    inscricaoValor: "0.00",
    priceAllCourseUnified: 0,
    ciclo: course.ciclo,
    city: input.cidade,
    state: polo.estado || "SP",
    poleId: polo.poleId,
    country: "BRA",
    unidade: course.unidade,
    codigoDoCurso: course.codigoDoCurso,
  };
}

function buildSetPrices(course, polo, orderFormId) {
  const query = {
    unidade: "Virtual",
    turno: "Online",
    orderFormId,
    itemIndex: "0",
    codCurso: course.codCursoSetprices,
    codVest: String(course.codVest),
    codPolo: String(polo.poleId),
    poloTipo: String(polo.poleType),
    seqVest: String(course.seqVest),
    inscricaoValor: "0.00",
  };
  const body = {
    unidade: "Virtual",
    turno: "Online",
    orderFormId,
    itemIndex: "0",
    codCurso: course.codCursoSetprices,
    codVest: course.codVest,
    codPolo: polo.poleId,
    poloTipo: polo.poleType,
    seqVest: String(course.seqVest),
    inscricaoValor: "0.00",
    priceAllCourseUnified: 0,
  };
  return { query, body };
}

function buildPayloads({ candidate, course, polo, leadId, orderFormId, additionalData = {}, process = PROCESS_CONFIG }) {
  const input = {
    ...candidate,
    cidade: additionalData.cidade || polo.cidade,
    poloNome: additionalData.poloNome || polo.poloNome2 || polo.poloLabel,
    formaIngresso: additionalData.formaIngresso || process.formaIngresso,
    necessidadeEspecial: additionalData.necessidadeEspecial || process.necessidadeEspecial,
  };
  const processed = applyProcess(course, process);
  return {
    pdp: pdpUrl(processed),
    input,
    course: processed,
    leadPost: orderFormId ? buildLeadPost(input, processed, polo, orderFormId) : buildLeadPost(input, processed, polo, "<orderFormId>"),
    leadPatchPolo: orderFormId ? buildLeadPatchPolo(input, processed, polo, orderFormId) : null,
    leadPatchIngresso: orderFormId ? buildLeadPatchIngresso(input, processed, polo, orderFormId) : null,
    addToCart: leadId ? buildAddToCartBody(leadId, processed, polo, input) : null,
    setPrices: orderFormId ? buildSetPrices(processed, polo, orderFormId) : buildSetPrices(processed, polo, "<orderFormId>"),
  };
}

const flow = {
  id: "graduacao_multipla",
  label: "Graduação — Múltipla Escolha",
  department: "Graduação",
  homologated: true,
  additionalFields: [],
  successCriterion: "provaLink",
  postOrder: { fetchProva: true, tipoProva: PROCESS_CONFIG.tipoProva },
  PROCESS_CONFIG,
  applyProcess,
  pdpUrl,
  buildAddToCartBody,
  buildLeadPost,
  buildLeadPatchPolo,
  buildLeadPatchIngresso,
  buildSetPrices,
  buildPayloads,
};

module.exports = flow;
module.exports.PROCESS_CONFIG = PROCESS_CONFIG;
module.exports.flow = flow;
