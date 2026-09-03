#!/usr/bin/env node
/**
 * Inscrição API-only — Cruzeiro do Sul Virtual (Graduação EAD R$0)
 *
 * Fluxo: catálogo Excel → resolver → checkout API → pós-pedido
 *
 * Env principais:
 *   POC_CURSO / CURSO          — ex.: Gestão Financeira
 *   POC_POLO / POLO_PREFIXO  — ex.: Barra Funda
 *   POC_POLO_NOME            — nome completo VTEX do polo (assembly)
 *   POC_EMAIL / EMAIL
 *   POC_NOME / NOME_COMPLETO
 *   POC_TELEFONE / TELEFONE
 *   POC_CPF / CPF
 *   POC_NASCIMENTO / NASCIMENTO  — DD/MM/YYYY
 *   POC_CEP / CEP
 *   POC_CIDADE / CIDADE
 *   POC_ESTADO / ESTADO
 *   POC_FORMA_INGRESSO         — default: Vestibular Múltipla Escolha
 *   SKIP_POST_ORDER=1          — só até orderGroup
 *
 * Contrato SIAA (não “alinhar ao HAR”):
 *   setprices seqVest = 5; sem getprices/campaigns/clientupdate;
 *   shipping/leadOrderPut = Matarazzo / Água Branca (CEP só preenche o número).
 *   CLI exige POC_CPF. Polo/cidade/poloNome vêm do Excel se não forem passados.
 *   Uma inscrição SIAA por candidato/forma no ciclo corrente
 *   (Redação, Múltipla Escolha, ENEM, Segunda Graduação, Transferência).
 *   Ciclo anterior não bloqueia.
 */

const fs = require("fs");
const path = require("path");
const { resolveCatalog, CatalogError } = require("./catalog-resolver");
const { runPostOrder, consultarInscricoesSIAA, inscricoesDaForma, formaTemLimiteUmaInscricao } = require("./post-order-fetch");

const BASE = "https://cruzeirodosul.myvtex.com";
const BINDING_ID = "b609c118-0b5f-4ae9-b099-d94f79af4a58";

const GQL_QS = `workspace=master&maxAge=long&appsEtag=remove&domain=store&locale=pt-BR&__bindingId=${BINDING_ID}`;
const GQL_QS_ZERO = `workspace=master&maxAge=zero&appsEtag=remove&domain=store&locale=pt-BR&__bindingId=${BINDING_ID}`;

const SESSIONS_QS =
  "items=account.id,account.accountName,store.channel,store.countryCode,store.cultureInfo,store.currencyCode,store.currencySymbol,store.admin_cultureInfo,creditControl.creditAccounts,creditControl.deadlines,creditControl.minimumInstallmentValue,authentication.storeUserId,authentication.storeUserEmail,profile.firstName,profile.document,profile.email,profile.id,profile.isAuthenticated,profile.lastName,profile.phone,public.favoritePickup,public.utm_source,public.utm_medium,public.utm_campaign,public.utmi_cp,public.utmi_pc&__bindingId=" +
  BINDING_ID;

const EXPECTED_SECTIONS = [
  "items", "totalizers", "clientProfileData", "shippingData", "paymentData",
  "sellers", "messages", "marketingData", "clientPreferencesData",
  "storePreferencesData", "giftRegistryData", "ratesAndBenefitsData",
  "openTextField", "commercialConditionData", "customData",
];

const ORDER_FORM_GQL = {
  operationName: "orderForm",
  variables: {},
  extensions: {
    persistedQuery: {
      version: 1,
      sha256Hash: "a0cb131e8b0829895916aa4cfc2634a73ccdf77423f825c3e9bebd055685e84e",
      sender: "vtex.store-resources@0.x",
      provider: "vtex.store-graphql@2.x",
    },
  },
};

function env(key, fallback = "") {
  return process.env[key] || process.env[`POC_${key}`] || fallback;
}

function envIsSet(key) {
  return process.env[key] != null || process.env[`POC_${key}`] != null;
}

const IES_UNICID = "UNIVERSIDADE CIDADE DE SÃO PAULO";
const IES_CRUZEIRO = "UNIVERSIDADE CRUZEIRO DO SUL";

/** Nomes VTEX homologados (13 polos do Excel). poleId é a chave. */
const POLO_NOME_VTEX = {
  45: `São Paulo - Morumbi - SP - ${IES_UNICID}`,
  1876: `São Paulo - Sapopemba - SP - ${IES_UNICID}`,
  2257: `São Paulo - Freguesia - SP - ${IES_UNICID}`,
  2841: `São Paulo - Vila Prudente 2 - SP - ${IES_UNICID}`,
  43: `São Paulo - santana 2 - SP - ${IES_UNICID}`,
  50: `São Paulo - Barra Funda - SP - ${IES_UNICID}`,
  1823: `Capivari - Taboão Mituzi - SP - ${IES_CRUZEIRO}`,
  3135: `Campinas - Campinas - SP - ${IES_CRUZEIRO}`,
  3136: `Capivari - Capivari - SP - ${IES_CRUZEIRO}`,
  3146: `Capivari - Taboão Centro - SP - ${IES_CRUZEIRO}`,
  8932: `São Paulo - Ibirapuera - SP - ${IES_UNICID}`,
  3137: `Itapira - Centro (Santo Antônio) - SP - ${IES_CRUZEIRO}`,
  2188: `São Paulo - Vila Mariana - SP - ${IES_UNICID}`,
};

const POLO_NOME_VTEX_POS = {
  2257: "São Paulo - Freguesia do Ó (Moinho Velho) - SP - CRUZEIRO DO SUL - PÓS EAD",
};

function poloNomeFromCatalog(polo, pos = false) {
  if (pos) {
    if (POLO_NOME_VTEX_POS[polo.poleId]) return POLO_NOME_VTEX_POS[polo.poleId];
    const city = polo.cidade || "São Paulo";
    return `${city} - ${polo.poloLabel} - SP - CRUZEIRO DO SUL - PÓS EAD`;
  }
  if (POLO_NOME_VTEX[polo.poleId]) return POLO_NOME_VTEX[polo.poleId];
  const city = polo.cidade || "São Paulo";
  const ies = /s[aã]o paulo/i.test(city) ? IES_UNICID : IES_CRUZEIRO;
  return `${city} - ${polo.poloLabel} - SP - ${ies}`;
}

function splitName(full) {
  const parts = String(full).trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || parts[0] };
}

function formatPhone(digits) {
  const d = String(digits).replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

function formatCep(cep) {
  const d = String(cep).replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep;
}

function birthISO(ddmmyyyy) {
  const [d, m, y] = String(ddmmyyyy).split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function cpfDigits(cpf) {
  return String(cpf).replace(/\D/g, "");
}

/** Perfil VTEX completo (SmartCheckout) mascara o CPF, ex. "***71". */
function maskedDocMatchesCpf(document, cpf) {
  const digits = cpfDigits(cpf);
  const raw = String(document || "");
  if (!raw || !digits) return false;
  if (!raw.includes("*")) return cpfDigits(raw) === digits;
  const suffix = raw.replace(/\D/g, "");
  return suffix.length > 0 && digits.endsWith(suffix);
}

function isExistingLockedProfile(orderForm, input) {
  const p = orderForm?.clientProfileData;
  if (!p) return false;
  if (String(p.email || "").toLowerCase() !== String(input.email).toLowerCase()) return false;
  if (!maskedDocMatchesCpf(p.document, input.cpf)) return false;
  return p.profileCompleteOnLoading === true || orderForm?.canEditData === false;
}

function pickSavedAddressId(orderForm) {
  const ship = orderForm?.shippingData;
  return ship?.selectedAddresses?.[0]?.addressId
    || ship?.availableAddresses?.[0]?.addressId
    || null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function genAddressId() {
  return String(Math.floor(Math.random() * 9e12) + 1e12);
}

function loadInput(overrides = {}) {
  const nomeCompleto =
    overrides.nome ||
    overrides.nomeCompleto ||
    env("NOME_COMPLETO", env("NOME", `Candidato Poc ${Date.now()}`));
  const { firstName, lastName } = splitName(nomeCompleto);
  const phone = formatPhone(env("TELEFONE", "13997121322"));
  const cpf = env("CPF");
  const nascimento = env("NASCIMENTO", "09/09/1999");
  const cidade = env("CIDADE", "São Paulo");
  const estado = env("ESTADO", "São Paulo");
  const poloResolved = env("POLO_PREFIXO", env("POLO", "Barra Funda"));

  const base = {
    curso: env("CURSO", "Gestão Financeira"),
    department: env("DEPARTMENT", "Graduação"),
    polo_prefixo: poloResolved,
    poloNome: env("POLO_NOME") || "",
    email: env("EMAIL", `api.poc.${Date.now()}@mailinator.com`),
    firstName,
    lastName,
    phone,
    phoneCheckout: `+55 ${phone.replace(/[()-\s]/g, " ").replace(/\s+/g, " ").trim()}`,
    cpf,
    cpfDigits: cpfDigits(cpf),
    nascimento,
    birthDate: birthISO(nascimento),
    postalCode: formatCep(env("CEP", "05001200")),
    cepRaw: env("CEP", "05001200").replace(/\D/g, ""),
    cidade,
    estado,
    formaIngresso: env("FORMA_INGRESSO", "Vestibular Múltipla Escolha"),
    enemAno: env("ENEM_ANO", "2022"),
    enemNota: env("ENEM_NOTA", "400"),
    necessidadeEspecial: env(
      "NECESSIDADE_ESPECIAL",
      "0 - Não necessito de condições especiais"
    ),
    semNumero: env("SEM_NUMERO", "sim") !== "nao",
    complemento: env("COMPLEMENTO", ""),
    street: env("RUA", "Avenida Francisco Matarazzo"),
    neighborhood: env("BAIRRO", "Água Branca"),
    geoCoordinates: env("GEO")
      ? env("GEO").split(",").map(Number)
      : [-46.67549133300781, -23.52617073059082],
  };
  const input = { ...base, ...overrides };
  if (overrides.nascimento && !overrides.birthDate) {
    input.birthDate = birthISO(overrides.nascimento);
  }
  if (overrides.phone && !overrides.phoneCheckout) {
    input.phoneCheckout = `+55 ${String(overrides.phone).replace(/[()-\s]/g, " ").replace(/\s+/g, " ").trim()}`;
  }
  if (overrides.cepRaw && !overrides.postalCode) {
    input.postalCode = formatCep(overrides.cepRaw);
  }
  if (overrides.cpf && !overrides.cpfDigits) {
    input.cpfDigits = cpfDigits(overrides.cpf);
  }
  return input;
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }
  ingest(setCookieHeaders) {
    if (!setCookieHeaders) return;
    const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    for (const raw of list) {
      if (!raw) continue;
      const part = raw.split(";")[0];
      const eq = part.indexOf("=");
      if (eq > 0) this.cookies.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

function buildAddToCartBody(leadId, course, polo, input) {
  const poloOpt = {
    assemblyId: "Polo",
    inputValues: {
      Id: String(polo.poleId),
      Estado: polo.estado || "SP",
      Cidade: input.cidade,
      Nome: input.poloNome,
    },
  };
  const options = course.pos
    ? [
        poloOpt,
        { assemblyId: "Empresa Parceira", inputValues: { Empresa: "" } },
        {
          assemblyId: "Curso SKU info",
          inputValues: {
            Ciclo: 20262,
            Marca: 7,
            "Tipo do Curso": 8,
            "Codigo do Curso": course.codCursoSetprices,
            Modalidade: 2,
            Unidade: course.unidade,
          },
        },
        { assemblyId: "Documento ID", inputValues: { "Documento ID": leadId } },
        {
          assemblyId: "Especificacoes produto",
          inputValues: { turno: "Online", unidade: "Virtual", "plano de pagamento": String(course.planoPagamento || 18) },
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
            codCurso: course.codCursoSetprices,
            valorMatricula: course.matriculaValor ?? 99,
            descontoMatricula: "",
            descontoMensalidade: "",
            descontoInscricao: "",
            turno: "Online",
            isComercial: false,
          },
        },
        {
          assemblyId: "Forma de Ingresso",
          inputValues: {
            "Forma de Ingresso": "Pós-Graduação",
            "Valor da Inscricao": course.matriculaValor ?? 99,
          },
        },
      ]
    : [
        poloOpt,
        { assemblyId: "Empresa Parceira", inputValues: { Empresa: "" } },
        {
          assemblyId: "Curso SKU info",
          inputValues: {
            Ciclo: 20262,
            Marca: 12,
            "Tipo do Curso": 3,
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
            link: course.pdpSlug || `grad-${course.slugGuess || "curso"}-cruzeiro-do-sul-virtual`,
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
      ];
  const vars = {
    items: [{
      id: course.skuId,
      quantity: 1,
      seller: "1",
      options,
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

function buildLeadPost(input, course, polo, orderFormId) {
  const pdp = `${BASE}/${course.pdpSlug || `grad-${course.slugGuess || "curso"}-cruzeiro-do-sul-virtual`}/p`;
  return {
    ciclo: course.ciclo,
    marca: course.marca ?? 12,
    tipoDoCurso: course.tipoFormacao,
    codigoDoCurso: course.codigoDoCursoLead,
    modalidade: "EAD",
    duracao: course.duracao ?? 4,
    unidade: course.leadUnidade || "16,18,22,60,71,75,80",
    account: "1",
    productId: course.leadProductId || course.productId,
    email: input.email,
    name: `${input.firstName} ${input.lastName}`,
    firstName: input.firstName,
    lastName: input.lastName,
    operadorComercial: "fabio.boas50@polo.cruzeirodosul.edu.br",
    operadorComercialLogado: "fabio.boas50@polo.cruzeirodosul.edu.br",
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
    iesNumber: course.iesNumber ?? 12,
    courseName: course.courseName,
    areaInteresse: course.areaInteresse,
    ies: "Cruzeiro do Sul Virtual",
    bindingForm: "Ficha de inscrição",
    bindingId: todayISO(),
    bindingUrl: pdp,
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
    campanhaSeqVest: "1",
    passoFicha: "2",
    marca: course.marca ?? 12,
    codigoDoCurso: course.codigoDoCurso,
    turno: "0",
    unidade: course.leadUnidade || course.unidade,
    iesNumber: course.iesNumber ?? 12,
    modalidade: course.modalidade,
    ciclo: course.ciclo,
    formaIngressoValue: course.tipoFormacao,
    formaIngresso: course.tipoFormacao,
    tipoDoCurso: course.tipoFormacao,
    tipoFormacao: course.tipoFormacao,
  };
}

function isEnem(forma) {
  return /^enem$/i.test(String(forma || ""));
}

function isSegundaGrad(forma) {
  return /segunda\s*gradua/i.test(String(forma || ""));
}

function isTransferencia(forma) {
  return /transfer/i.test(String(forma || ""));
}

function isPosDept(dept) {
  return /p[oó]s/i.test(String(dept || ""));
}

function applyPosFromSku(course, sku) {
  const codCurs = String(sku.codCurs || course.codigoDoCurso || "");
  const codUnidade = String(sku.codUnidade || "41");
  course.pos = true;
  course.marca = 7;
  course.iesNumber = 7;
  course.codigoDoCurso = codCurs;
  course.codigoDoCursoLead = codCurs;
  course.codCursoSetprices = `${codUnidade}${codCurs}`;
  course.codVest = Number(sku.codVestibular) || 582;
  course.seqVest = 1;
  course.unidade = Number(codUnidade);
  course.leadUnidade = codUnidade;
  course.modalidade = 2;
  course.tipoDoCursoSku = 8;
  course.tipoFormacao = "Pós Graduação";
  course.duracao = 12;
  course.leadProductId = String(sku.skuId || course.skuId);
  course.productLabel = `${course.leadProductId} - ${course.courseName} online`;
  course.planoPagamento = Number(sku.parcelasPlano) || 18;
  if (sku.codRef) course.productRef = String(sku.codRef);
}

function pdpPath(slugGuess, department) {
  const prefix = isPosDept(department) ? "pos" : "grad";
  return `${prefix}-${slugGuess}-cruzeiro-do-sul-virtual`;
}

function buildLeadPatchIngresso(input, course, polo, orderFormId) {
  const patch = {
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
  if (isEnem(input.formaIngresso)) {
    patch.enemNumeroInscricao = input.enemNumeroInscricao ?? null;
    patch.enemAno = input.enemAno ?? null;
  }
  return patch;
}

function shippingPayload(step, input, ctx, polo) {
  const geo = input.geoCoordinates || [-46.67549133300781, -23.52617073059082];
  const addr = {
    addressType: "residential",
    receiverName: `${input.firstName} ${input.lastName}`,
    addressId: ctx.addressIdResidential,
    isDisposable: true,
    postalCode: input.postalCode,
    city: input.cidade,
    state: polo.estado || "SP",
    country: "BRA",
    street: input.street || "Avenida Francisco Matarazzo",
    number: input.semNumero ? "S/N" : "",
    neighborhood: input.neighborhood || "Água Branca",
    complement: input.complemento || "",
    reference: null,
    geoCoordinates: geo,
  };
  if (step === 1) {
    return {
      logisticsInfo: [{ addressId: null, itemIndex: 0, selectedDeliveryChannel: null, selectedSla: null }],
      clearAddressIfPostalCodeNotFound: false,
      selectedAddresses: [
        { ...addr, addressId: ctx.addressIdResidential, number: null, complement: null, isDisposable: null },
        { ...addr, addressId: ctx.addressIdSearch, addressType: "search", number: null, complement: null, isDisposable: null },
      ],
      expectedOrderFormSections: EXPECTED_SECTIONS,
    };
  }
  if (step === 3) {
    return { address: addr, availableAddresses: [addr], logisticsInfo: null, expectedOrderFormSections: EXPECTED_SECTIONS };
  }
  return {
    logisticsInfo: [{ addressId: ctx.addressIdResidential, itemIndex: 0, selectedDeliveryChannel: "delivery", selectedSla: "Entrega padrão" }],
    clearAddressIfPostalCodeNotFound: false,
    selectedAddresses: [
      { ...addr, addressId: ctx.addressIdSearch, addressType: "search", number: "S/N", complement: null, isDisposable: null },
      { ...addr },
    ],
    expectedOrderFormSections: EXPECTED_SECTIONS,
  };
}

async function runInscricao(overrides = {}) {
  const t0 = Date.now();
  const input = loadInput(overrides);
  const skipPostOrder = env("SKIP_POST_ORDER") === "1";

  let catalog;
  try {
    catalog = resolveCatalog({
      curso: input.curso,
      department: input.department,
      polo_prefixo: input.polo_prefixo,
      cidade: envIsSet("CIDADE") || overrides.cidade ? input.cidade : undefined,
      estado: envIsSet("ESTADO") || overrides.estado ? input.estado : undefined,
      courseDefaults: overrides.courseDefaults,
    });
  } catch (err) {
    const code = err instanceof CatalogError ? err.code : "CATALOG_ERROR";
    console.error(code + ":", err.message);
    throw err;
  }

  const { curso: resolvedCurso, polo: resolvedPolo, course, catalogLookupMs } = catalog;
  course.slugGuess = resolvedCurso.slugGuess;
  course.pdpSlug = pdpPath(resolvedCurso.slugGuess, resolvedCurso.department || input.department);
  const pos = isPosDept(resolvedCurso.department || input.department);
  if (pos) {
    if (!envIsSet("FORMA_INGRESSO") && !overrides.formaIngresso) {
      input.formaIngresso = "Pós Graduação";
    }
    course.pos = true;
    course.marca = 7;
    course.iesNumber = 7;
    course.codVest = 582;
    course.seqVest = 1;
    course.tipoFormacao = "Pós Graduação";
    course.duracao = 12;
    course.campanhaId = 2745;
    course.campanhaNome = "Aprovados Educação Continuada EAD [PDP VTEX]";
    course.matriculaValor = 99;
    course.leadProductId = String(course.skuId);
    course.productLabel = `${course.skuId} - ${course.courseName} online`;
    course.leadUnidade = "41";
    if (course.codigoDoCurso && !String(course.codCursoSetprices || "").startsWith("41")) {
      course.codCursoSetprices = `41${course.codigoDoCurso}`;
    }
  }
  const segunda = isSegundaGrad(input.formaIngresso);
  const transferencia = isTransferencia(input.formaIngresso);
  if (segunda) {
    course.seqVest = 3;
    course.seqVestSetprices = 1;
  }
  if (transferencia) {
    course.seqVest = 4;
    course.seqVestSetprices = 1;
  }
  if (!envIsSet("CIDADE") && !overrides.cidade && resolvedPolo.cidade) {
    input.cidade = resolvedPolo.cidade;
  }
  if (!envIsSet("POLO_NOME") && !overrides.poloNome) {
    input.poloNome = poloNomeFromCatalog(resolvedPolo, pos);
  }

  const pdp = `${BASE}/${course.pdpSlug}/p`;
  const jar = new CookieJar();
  const ctx = {
    orderFormId: null,
    leadId: null,
    addressIdResidential: genAddressId(),
    addressIdSearch: genAddressId(),
    vtexProfileLocked: false,
    savedAddressId: null,
  };

  let failedStep = null;

  async function request(stepName, method, url, body, extraHeaders = {}) {
    const headers = {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      Origin: BASE,
      Referer: pdp,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      ...extraHeaders,
    };
    const cookie = jar.header();
    if (cookie) headers.Cookie = cookie;
    const opts = { method, headers };
    if (body !== undefined && method !== "GET") {
      opts.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    console.log(`\n>>> STEP: ${stepName}`);
    console.log(`${method} ${url}`);

    const res = await fetch(url, opts);
    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : res.headers.get("set-cookie");
    jar.ingest(setCookie);
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }

    console.log(`STATUS: ${res.status}`);
    if (!res.ok) {
      failedStep = stepName;
      const err = new Error(`HTTP ${res.status} at ${stepName}: ${text.slice(0, 300)}`);
      err.status = res.status;
      err.response = json;
      throw err;
    }
    return { json, text };
  }

  console.log("=== API-ONLY INSCRIÇÃO ===");
  console.log("EMAIL:", input.email);
  console.log("CURSO:", input.curso);
  console.log("POLO:", input.polo_prefixo);

  await request("1_sessions", "POST", `${BASE}/api/sessions?${SESSIONS_QS}`, {});

  const consultaSiaa = await consultarInscricoesSIAA({
    email: input.email,
    cookie: jar.header(),
  });
  console.log("\n>>> CONSULTA SIAA (leadOrder / inscricaoSIAA)");
  console.log(JSON.stringify(consultaSiaa.comSiaa, null, 2));
  const mesmaForma = inscricoesDaForma(consultaSiaa, input.formaIngresso, course.ciclo);
  if (formaTemLimiteUmaInscricao(input.formaIngresso) && mesmaForma.length) {
    const hit = mesmaForma[0];
    const result = {
      ok: false,
      code: "JA_INSCRITO_FORMA",
      cpf: input.cpf,
      email: input.email,
      formaIngresso: input.formaIngresso,
      ciclo: course.ciclo,
      inscricaoSIAA: hit.inscricaoSIAA,
      orderId: hit.orderId,
      courseName: hit.courseName,
      existentes: consultaSiaa.comSiaa,
    };
    console.log("\n========================================");
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  const ofRes = await request(
    "2_orderForm",
    "POST",
    `${BASE}/_v/private/graphql/v1?${GQL_QS_ZERO}`,
    ORDER_FORM_GQL
  );
  ctx.orderFormId =
    JSON.stringify(ofRes.json).match(/"orderFormId"\s*:\s*"([a-f0-9]{32})"/i)?.[1] ||
    JSON.stringify(ofRes.json).match(/"id"\s*:\s*"([a-f0-9]{32})"/i)?.[1];
  if (!ctx.orderFormId) throw new Error("orderFormId ausente");

  if (pos) {
    const skuFields = "productId,skuId,codRef,ean,codVestibular,turno,unidade,parcelasPlano,descritivoPlano,formasIngresso,iniCurs,codTurno,codCurs,codUnidade";
    const skuRes = await request(
      "2b_skuData",
      "GET",
      `${BASE}/v1/skuData/?_productId=${course.productId}&_fields=${skuFields}`
    );
    const sku = Array.isArray(skuRes.json) ? skuRes.json[0] : skuRes.json;
    if (sku?.codCurs) applyPosFromSku(course, sku);
    console.log("pos sku", {
      codCurs: course.codigoDoCurso,
      codCursoSetprices: course.codCursoSetprices,
      codVest: course.codVest,
      skuId: course.skuId,
      productRef: course.productRef,
    });

    await request("2c_getprices", "POST", `${BASE}/_v/getprices/${course.productRef}`);
    const campRes = await request(
      "2d_campaigns",
      "POST",
      `${BASE}/_v/wrapper/api/campaigns/${course.codCursoSetprices}`,
      { codVest: course.codVest, isComercial: false }
    );
    const camp = Array.isArray(campRes.json) ? campRes.json[0] : campRes.json;
    if (camp?.codigo_campanha) {
      course.campanhaId = camp.codigo_campanha;
      course.campanhaNome = camp.descricao || course.campanhaNome;
      if (camp.matriculaValor != null) course.matriculaValor = camp.matriculaValor;
    }
  }

  const leadRes = await request(
    "3_lead_post",
    "POST",
    `${BASE}/v1/lead/`,
    buildLeadPost(input, course, resolvedPolo, ctx.orderFormId)
  );
  ctx.leadId =
    leadRes.json?.DocumentId ||
    String(leadRes.json?.Id || "").replace(/^OP-/, "");
  if (!ctx.leadId) throw new Error("leadId ausente");

  await request(
    "4_lead_patch_polo",
    "PATCH",
    `${BASE}/v1/lead/${ctx.leadId}`,
    buildLeadPatchPolo(input, course, resolvedPolo, ctx.orderFormId)
  );

  const profileInit = await request(
    "5_profile_initial",
    "POST",
    `${BASE}/api/checkout/pub/orderForm/${ctx.orderFormId}/attachments/clientProfileData`,
    { firstName: input.firstName, lastName: input.lastName, email: input.email, phone: input.phone, document: "" }
  );
  ctx.vtexProfileLocked = isExistingLockedProfile(profileInit.json, input);
  ctx.savedAddressId = pickSavedAddressId(profileInit.json);
  if (ctx.vtexProfileLocked) {
    console.log("perfil VTEX existente anexado (SmartCheckout, canEditData=false)");
    if (ctx.savedAddressId) {
      ctx.addressIdResidential = ctx.savedAddressId;
      console.log("reusando addressId salvo", ctx.savedAddressId);
    }
  }

  await request(
    "6_lead_patch_ingresso",
    "PATCH",
    `${BASE}/v1/lead/${ctx.leadId}`,
    buildLeadPatchIngresso(input, course, resolvedPolo, ctx.orderFormId)
  );

  await request(
    "7_addToCart",
    "POST",
    `${BASE}/_v/private/graphql/v1?${GQL_QS}`,
    buildAddToCartBody(ctx.leadId, course, resolvedPolo, input)
  );

  const spQs = new URLSearchParams({
    unidade: "Virtual",
    turno: "Online",
    orderFormId: ctx.orderFormId,
    itemIndex: "0",
    codCurso: course.codCursoSetprices,
    codVest: String(course.codVest),
    codPolo: String(resolvedPolo.poleId),
    poloTipo: String(resolvedPolo.poleType),
    seqVest: String(course.seqVestSetprices ?? course.seqVest),
  });
  const setpricesBody = {
    unidade: "Virtual",
    turno: "Online",
    orderFormId: ctx.orderFormId,
    itemIndex: "0",
    codCurso: course.codCursoSetprices,
    codVest: course.codVest,
    codPolo: pos ? String(resolvedPolo.poleId) : resolvedPolo.poleId,
    poloTipo: pos ? "0" : resolvedPolo.poleType,
    seqVest: String(course.seqVestSetprices ?? course.seqVest),
  };
  if (pos) {
    setpricesBody.isComercial = null;
  } else {
    spQs.set("inscricaoValor", "0.00");
    setpricesBody.inscricaoValor = "0.00";
    setpricesBody.priceAllCourseUnified = 0;
  }

  let setpricesOk = false;
  for (let attempt = 1; attempt <= 3 && !setpricesOk; attempt++) {
    try {
      await request(
        `8_setprices_try${attempt}`,
        "POST",
        `${BASE}/_v/setpricescodref/${course.productRef}?${spQs}`,
        setpricesBody
      );
      setpricesOk = true;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  if (pos) {
    const now = new Date();
    const bindingId = `${todayISO()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    await request("8b_clientupdate", "PATCH", `${BASE}/_v/clientupdate/`, {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      bindingForm: "Ficha de inscrição",
      homePhone: input.phone,
      fichaDeInscricao: true,
      isNewsletterOptIn: true,
      bindingId,
      bindingUrl: pdp,
      utmSource: "direct",
      utmMedium: "direct",
      utmCampaign: "",
      utmContent: "",
      utmTerm: "",
      utmGclid: "",
      ies: "Cruzeiro do Sul Virtual",
      iesNumber: 7,
      ciclo: course.ciclo,
      courseCode: String(course.codigoDoCurso),
      courseName: course.courseName,
      modalidade: "EAD",
      tipoDoCurso: "Pós Graduação",
      leadTriggeredIn: now.toISOString(),
      areaInteresse: course.areaInteresse,
    });
  }

  const birthRes = await request(
    "9_birthDate",
    "PUT",
    `${BASE}/api/checkout/pub/orderForm/${ctx.orderFormId}/customData/profile/birthDate`,
    { expectedOrderFormSections: EXPECTED_SECTIONS, value: input.birthDate },
    { Referer: `${BASE}/checkout/` }
  );
  if (!ctx.vtexProfileLocked) {
    ctx.vtexProfileLocked = isExistingLockedProfile(birthRes.json, input);
  }

  // Perfil completo já no carrinho: reenviar CPF como guest → 403 CHK003.
  // First-time (perfil novo) ainda envia o documento. Bloqueio de mesma
  // forma de ingresso não é este passo — é SIAA/lead depois.
  if (ctx.vtexProfileLocked) {
    console.log("pulando 10_profile_cpf — perfil VTEX existente já tem o CPF");
  } else {
    try {
      await request(
        "10_profile_cpf",
        "POST",
        `${BASE}/api/checkout/pub/orderForm/${ctx.orderFormId}/attachments/clientProfileData`,
        {
          firstEmail: input.email,
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          document: input.cpf,
          phone: input.phoneCheckout,
          documentType: "cpf",
          isCorporate: false,
          expectedOrderFormSections: EXPECTED_SECTIONS,
        },
        { Referer: `${BASE}/checkout/` }
      );
    } catch (e) {
      if (e.status !== 403) throw e;
      const ofRes = await request(
        "10b_orderForm_apos_chk003",
        "GET",
        `${BASE}/api/checkout/pub/orderForm/${ctx.orderFormId}`,
        undefined,
        { Referer: `${BASE}/checkout/` }
      );
      if (!isExistingLockedProfile(ofRes.json, input)) throw e;
      ctx.vtexProfileLocked = true;
      console.log("CHK003: perfil VTEX existente já anexado — seguindo");
    }
  }

  await request(
    "11_preferences",
    "POST",
    `${BASE}/api/checkout/pub/orderForm/${ctx.orderFormId}/attachments/clientPreferencesData`,
    { locale: "pt-BR", optinNewsLetter: false, expectedOrderFormSections: EXPECTED_SECTIONS },
    { Referer: `${BASE}/checkout/` }
  );

  await request(
    "12_postal",
    "GET",
    `${BASE}/api/checkout/pub/postal-code/BRA/${input.cepRaw}`,
    undefined,
    { Referer: `${BASE}/checkout/` }
  );

  const shippingUrl = `${BASE}/api/checkout/pub/orderForm/${ctx.orderFormId}/attachments/shippingData`;
  const shippingHeaders = { Referer: `${BASE}/checkout/`, "X-Requested-With": "XMLHttpRequest" };

  if (ctx.vtexProfileLocked && ctx.savedAddressId) {
    // Perfil completo: endereço novo exige login (CHK0087). Só seleciona o salvo.
    await request(
      "13_shipping_saved",
      "POST",
      shippingUrl,
      {
        clearAddressIfPostalCodeNotFound: false,
        selectedAddresses: [{ addressId: ctx.savedAddressId }],
        logisticsInfo: [{
          addressId: ctx.savedAddressId,
          itemIndex: 0,
          selectedDeliveryChannel: "delivery",
          selectedSla: "Entrega padrão",
        }],
        expectedOrderFormSections: EXPECTED_SECTIONS,
      },
      shippingHeaders
    );
  } else {
    await request("13_shipping_1", "POST", shippingUrl, shippingPayload(1, input, ctx, resolvedPolo), shippingHeaders);
    await request("14_shipping_2", "POST", shippingUrl, shippingPayload(3, input, ctx, resolvedPolo), shippingHeaders);
    await request("15_shipping_3", "POST", shippingUrl, shippingPayload(5, input, ctx, resolvedPolo), shippingHeaders);
  }

  await request(
    "16_leadUpdateAddress",
    "POST",
    `${BASE}/api/io/v1/leadUpdateAddress/${ctx.leadId}`,
    { orderFormId: ctx.orderFormId, birthDate: input.birthDate },
    { Referer: `${BASE}/checkout/` }
  );

  let payValue = 0;
  if (pos) {
    const ofPay = await request(
      "16b_orderForm_value",
      "GET",
      `${BASE}/api/checkout/pub/orderForm/${ctx.orderFormId}`
    );
    payValue = Number(ofPay.json?.value || 0);
    if (payValue > 0) {
      await request(
        "16c_paymentData",
        "POST",
        `${BASE}/api/checkout/pub/orderForm/${ctx.orderFormId}/attachments/paymentData`,
        {
          payments: [{
            paymentSystem: 17,
            paymentSystemName: "Promissory",
            group: "promissoryPaymentGroup",
            installments: 1,
            installmentsInterestRate: 0,
            installmentsValue: payValue,
            value: payValue,
            referenceValue: payValue,
          }],
          giftCards: [],
          expectedOrderFormSections: EXPECTED_SECTIONS,
        },
        { Referer: `${BASE}/checkout/` }
      );
    }
  }

  const txRes = await request(
    "17_transaction",
    "POST",
    `${BASE}/api/checkout/pub/orderForm/${ctx.orderFormId}/transaction`,
    {
      referenceId: ctx.orderFormId,
      savePersonalData: true,
      optinNewsLetter: false,
      value: pos ? payValue : 0,
      referenceValue: pos ? payValue : 0,
      interestValue: 0,
      expectedOrderFormSections: EXPECTED_SECTIONS,
    },
    { Referer: `${BASE}/checkout/`, "X-Requested-With": "XMLHttpRequest" }
  );

  const orderGroup =
    txRes.json?.orderGroup || txRes.text?.match(/"orderGroup"\s*:\s*"(\d+)"/)?.[1];
  if (!orderGroup) throw new Error("orderGroup ausente após transaction");

  if (pos) {
    try {
      await request(
        "17b_gatewayCallback",
        "POST",
        `${BASE}/api/checkout/pub/gatewayCallback/${orderGroup}`,
        undefined,
        { Referer: `${BASE}/checkout/` }
      );
    } catch (e) {
      // Promissory sem callCenter: CHK0223. Pedido já existe; o boleto sai no SIAA.
      console.log("gatewayCallback ignorado:", e.message.slice(0, 180));
    }
  }

  const checkoutMs = Date.now() - t0;
  let post = null;

  if (!skipPostOrder) {
    post = await runPostOrder({
      orderGroup,
      email: input.email,
      leadId: ctx.leadId,
      cookie: jar.header(),
      leadOrderPutExtras: {
        cpf: input.cpfDigits,
        dataNascimento: `${input.birthDate}T00:00:00`,
        formaIngresso: input.formaIngresso,
        userPostalCode: input.postalCode,
        userCity: input.cidade,
        userState: resolvedPolo.estado || "SP",
        userStreet: input.street || "Avenida Francisco Matarazzo",
        userAddressNumber: input.semNumero ? "S/N" : "",
        userNeighborhood: input.neighborhood || "Água Branca",
      },
      enemScores: isEnem(input.formaIngresso)
        ? {
            ano: input.enemAno || env("ENEM_ANO", "2022"),
            media: Number(input.enemNota ?? env("ENEM_NOTA", "400")),
          }
        : null,
      posPayment: pos,
      segundaGrad: segunda || transferencia,
    });
  }

  const tempoTotalInscricaoMs = Date.now() - t0;

  const result = {
    ok: true,
    catalogLookupMs,
    checkoutMs,
    tempoTotalInscricaoMs,
    orderGroup,
    orderId: `${orderGroup}-01`,
    email: input.email,
    cpf: input.cpf,
    catalog: {
      curso: resolvedCurso,
      polo: resolvedPolo,
      logs: catalog.logs,
    },
    course,
    ctx: { orderFormId: ctx.orderFormId, leadId: ctx.leadId },
    address: {
      postalCode: input.postalCode,
      city: input.cidade,
      state: resolvedPolo.estado || "SP",
      street: input.street || "Avenida Francisco Matarazzo",
      neighborhood: input.neighborhood || "Água Branca",
    },
    post,
  };

  console.log("\n========================================");
  console.log(JSON.stringify({
    ok: true,
    catalogLookupMs,
    tempoTotalInscricaoMs,
    orderGroup,
    orderId: result.orderId,
    cpf: input.cpf,
    polo: resolvedPolo.poloLabel,
    poleId: resolvedPolo.poleId,
    poloNome: input.poloNome,
    email: input.email,
    inscricaoSIAA: post?.inscricaoSIAA || null,
    enemMedia: post?.lead?.enemMedia || null,
    statusGraduacao: post?.lead?.statusGraduacao ?? null,
    provaLink: post?.provaLink || null,
    paymentLink: post?.paymentLink || null,
    documentsLink: post?.documentsLink || null,
    address: result.address,
  }, null, 2));

  return result;
}

if (require.main === module) {
  if (!env("CPF")) {
    console.error("Defina POC_CPF. Sem CPF o motor recusa (não reutiliza default).");
    process.exit(1);
  }
  runInscricao()
    .then((result) => {
      const outPath = path.join(__dirname, "inscricao-report.json");
      fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
      console.log(`Relatório: ${outPath}`);
      process.exit(0);
    })
    .catch((err) => {
      const code = err instanceof CatalogError ? err.code : "INSCRICAO_FAILED";
      console.error("\nFALHA:", code, err.message);
      process.exit(1);
    });
}

module.exports = { runInscricao, loadInput };
