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
 */

const fs = require("fs");
const path = require("path");
const { resolveCatalog, CatalogError } = require("./catalog-resolver");
const { runPostOrder } = require("./post-order-fetch");

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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function genAddressId() {
  return String(Math.floor(Math.random() * 9e12) + 1e12);
}

function loadInput(overrides = {}) {
  const nomeCompleto = env("NOME_COMPLETO", env("NOME", "Gabriel Lkonne"));
  const { firstName, lastName } = splitName(nomeCompleto);
  const phone = formatPhone(env("TELEFONE", "13997121322"));
  const cpf = env("CPF", "342.043.830-33");
  const nascimento = env("NASCIMENTO", "09/09/1999");
  const cidade = env("CIDADE", "São Paulo");
  const estado = env("ESTADO", "São Paulo");
  const poloResolved = env("POLO_PREFIXO", env("POLO", "Barra Funda"));

  const base = {
    curso: env("CURSO", "Gestão Financeira"),
    department: env("DEPARTMENT", "Graduação"),
    polo_prefixo: poloResolved,
    poloNome:
      env("POLO_NOME") ||
      `${cidade} - ${poloResolved} - SP - UNIVERSIDADE CIDADE DE SÃO PAULO`,
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
    necessidadeEspecial: env(
      "NECESSIDADE_ESPECIAL",
      "0 - Não necessito de condições especiais"
    ),
    semNumero: env("SEM_NUMERO", "sim") !== "nao",
    complemento: env("COMPLEMENTO", ""),
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
            link: `grad-${course.slugGuess || "curso"}-cruzeiro-do-sul-virtual`,
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

function buildLeadPost(input, course, polo, orderFormId) {
  const pdp = `${BASE}/grad-${course.slugGuess || "curso"}-cruzeiro-do-sul-virtual/p`;
  return {
    ciclo: course.ciclo,
    marca: 12,
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
    iesNumber: 12,
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
    marca: 12,
    codigoDoCurso: course.codigoDoCurso,
    turno: "0",
    unidade: course.unidade,
    iesNumber: 12,
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

function shippingPayload(step, input, ctx, polo) {
  const geo = [-46.67549133300781, -23.52617073059082];
  const addr = {
    addressType: "residential",
    receiverName: `${input.firstName} ${input.lastName}`,
    addressId: ctx.addressIdResidential,
    isDisposable: true,
    postalCode: input.postalCode,
    city: input.cidade,
    state: polo.estado || "SP",
    country: "BRA",
    street: "Avenida Francisco Matarazzo",
    number: input.semNumero ? "S/N" : "",
    neighborhood: "Água Branca",
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
      cidade: input.cidade,
      estado: input.estado,
    });
  } catch (err) {
    const code = err instanceof CatalogError ? err.code : "CATALOG_ERROR";
    console.error(code + ":", err.message);
    throw err;
  }

  const { curso: resolvedCurso, polo: resolvedPolo, course, catalogLookupMs } = catalog;
  course.slugGuess = resolvedCurso.slugGuess;

  const pdp = `${BASE}/grad-${resolvedCurso.slugGuess}-cruzeiro-do-sul-virtual/p`;
  const jar = new CookieJar();
  const ctx = {
    orderFormId: null,
    leadId: null,
    addressIdResidential: genAddressId(),
    addressIdSearch: genAddressId(),
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

  await request(
    "5_profile_initial",
    "POST",
    `${BASE}/api/checkout/pub/orderForm/${ctx.orderFormId}/attachments/clientProfileData`,
    { firstName: input.firstName, lastName: input.lastName, email: input.email, phone: input.phone, document: "" }
  );

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
    seqVest: String(course.seqVest),
    inscricaoValor: "0.00",
  });
  const setpricesBody = {
    unidade: "Virtual",
    turno: "Online",
    orderFormId: ctx.orderFormId,
    itemIndex: "0",
    codCurso: course.codCursoSetprices,
    codVest: course.codVest,
    codPolo: resolvedPolo.poleId,
    poloTipo: resolvedPolo.poleType,
    seqVest: String(course.seqVest),
    inscricaoValor: "0.00",
    priceAllCourseUnified: 0,
  };

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

  await request(
    "9_birthDate",
    "PUT",
    `${BASE}/api/checkout/pub/orderForm/${ctx.orderFormId}/customData/profile/birthDate`,
    { expectedOrderFormSections: EXPECTED_SECTIONS, value: input.birthDate },
    { Referer: `${BASE}/checkout/` }
  );

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

  await request(
    "13_shipping_1",
    "POST",
    `${BASE}/api/checkout/pub/orderForm/${ctx.orderFormId}/attachments/shippingData`,
    shippingPayload(1, input, ctx, resolvedPolo),
    { Referer: `${BASE}/checkout/`, "X-Requested-With": "XMLHttpRequest" }
  );
  await request(
    "14_shipping_2",
    "POST",
    `${BASE}/api/checkout/pub/orderForm/${ctx.orderFormId}/attachments/shippingData`,
    shippingPayload(3, input, ctx, resolvedPolo),
    { Referer: `${BASE}/checkout/`, "X-Requested-With": "XMLHttpRequest" }
  );
  await request(
    "15_shipping_3",
    "POST",
    `${BASE}/api/checkout/pub/orderForm/${ctx.orderFormId}/attachments/shippingData`,
    shippingPayload(5, input, ctx, resolvedPolo),
    { Referer: `${BASE}/checkout/`, "X-Requested-With": "XMLHttpRequest" }
  );

  await request(
    "16_leadUpdateAddress",
    "POST",
    `${BASE}/api/io/v1/leadUpdateAddress/${ctx.leadId}`,
    { orderFormId: ctx.orderFormId, birthDate: input.birthDate },
    { Referer: `${BASE}/checkout/` }
  );

  const txRes = await request(
    "17_transaction",
    "POST",
    `${BASE}/api/checkout/pub/orderForm/${ctx.orderFormId}/transaction`,
    {
      referenceId: ctx.orderFormId,
      savePersonalData: true,
      optinNewsLetter: false,
      value: 0,
      referenceValue: 0,
      interestValue: 0,
      expectedOrderFormSections: EXPECTED_SECTIONS,
    },
    { Referer: `${BASE}/checkout/`, "X-Requested-With": "XMLHttpRequest" }
  );

  const orderGroup =
    txRes.json?.orderGroup || txRes.text?.match(/"orderGroup"\s*:\s*"(\d+)"/)?.[1];
  if (!orderGroup) throw new Error("orderGroup ausente após transaction");

  const checkoutMs = Date.now() - t0;
  let post = null;

  if (!skipPostOrder) {
    post = await runPostOrder({
      orderGroup,
      email: input.email,
      leadOrderPutExtras: {
        cpf: input.cpfDigits,
        dataNascimento: `${input.birthDate}T00:00:00`,
        userPostalCode: input.postalCode,
        userCity: input.cidade,
        userState: resolvedPolo.estado || "SP",
        userStreet: "Avenida Francisco Matarazzo",
        userAddressNumber: input.semNumero ? "S/N" : "",
        userNeighborhood: "Água Branca",
      },
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
    catalog: {
      curso: resolvedCurso,
      polo: resolvedPolo,
      logs: catalog.logs,
    },
    course,
    ctx: { orderFormId: ctx.orderFormId, leadId: ctx.leadId },
    post,
  };

  console.log("\n========================================");
  console.log(JSON.stringify({
    ok: true,
    catalogLookupMs,
    tempoTotalInscricaoMs,
    orderGroup,
    orderId: result.orderId,
    inscricaoSIAA: post?.inscricaoSIAA || null,
    provaLink: post?.provaLink || null,
  }, null, 2));

  return result;
}

if (require.main === module) {
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
