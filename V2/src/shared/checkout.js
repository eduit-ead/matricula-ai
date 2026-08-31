const { EXPECTED_SECTIONS, gqlQs, sessionsQs, ORDER_FORM_GQL, extractOrderFormId } = require("../core/vtex-client");
const { shippingPayload } = require("./address");

async function createSession(client) {
  await client.request(
    "session_created",
    "POST",
    `${client.baseUrl}/api/sessions?${sessionsQs(client.bindingId)}`,
    {}
  );
}

async function createOrderForm(client) {
  const ofRes = await client.request(
    "orderform_created",
    "POST",
    `${client.baseUrl}/_v/private/graphql/v1?${gqlQs(client.bindingId, "zero")}`,
    ORDER_FORM_GQL
  );
  const orderFormId = extractOrderFormId(ofRes.json) || extractOrderFormId(ofRes.text);
  if (!orderFormId) {
    const err = new Error("orderFormId ausente");
    err.code = "ORDER_FORM_MISSING";
    err.step = "orderform_created";
    err.vtexResponse =
      typeof ofRes.json === "object" ? ofRes.json : String(ofRes.text || "").slice(0, 500);
    throw err;
  }
  return orderFormId;
}

async function attachProfileInitial(client, orderFormId, candidate) {
  await client.request(
    "profile_initial",
    "POST",
    `${client.baseUrl}/api/checkout/pub/orderForm/${orderFormId}/attachments/clientProfileData`,
    {
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      phone: candidate.phone,
      document: "",
    }
  );
}

async function attachBirthDate(client, orderFormId, birthDate) {
  await client.request(
    "birthdate",
    "PUT",
    `${client.baseUrl}/api/checkout/pub/orderForm/${orderFormId}/customData/profile/birthDate`,
    { expectedOrderFormSections: EXPECTED_SECTIONS, value: birthDate },
    { Referer: `${client.baseUrl}/checkout/` }
  );
}

async function attachProfileCpf(client, orderFormId, candidate) {
  await client.request(
    "profile_cpf",
    "POST",
    `${client.baseUrl}/api/checkout/pub/orderForm/${orderFormId}/attachments/clientProfileData`,
    {
      firstEmail: candidate.email,
      email: candidate.email,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      document: candidate.cpf,
      phone: candidate.phoneCheckout,
      documentType: "cpf",
      isCorporate: false,
      expectedOrderFormSections: EXPECTED_SECTIONS,
    },
    { Referer: `${client.baseUrl}/checkout/` }
  );
}

async function attachPreferences(client, orderFormId) {
  await client.request(
    "preferences",
    "POST",
    `${client.baseUrl}/api/checkout/pub/orderForm/${orderFormId}/attachments/clientPreferencesData`,
    { locale: "pt-BR", optinNewsLetter: false, expectedOrderFormSections: EXPECTED_SECTIONS },
    { Referer: `${client.baseUrl}/checkout/` }
  );
}

async function fetchPostalCode(client, cepRaw) {
  const res = await client.request(
    "postal_code",
    "GET",
    `${client.baseUrl}/api/checkout/pub/postal-code/BRA/${cepRaw}`,
    undefined,
    { Referer: `${client.baseUrl}/checkout/` }
  );
  return res.json;
}

async function attachShipping(client, orderFormId, addr, ctx) {
  const headers = {
    Referer: `${client.baseUrl}/checkout/`,
    "X-Requested-With": "XMLHttpRequest",
  };
  await client.request(
    "shipping_1",
    "POST",
    `${client.baseUrl}/api/checkout/pub/orderForm/${orderFormId}/attachments/shippingData`,
    shippingPayload(1, addr, ctx),
    headers
  );
  await client.request(
    "shipping_2",
    "POST",
    `${client.baseUrl}/api/checkout/pub/orderForm/${orderFormId}/attachments/shippingData`,
    shippingPayload(3, addr, ctx),
    headers
  );
  await client.request(
    "shipping_3",
    "POST",
    `${client.baseUrl}/api/checkout/pub/orderForm/${orderFormId}/attachments/shippingData`,
    shippingPayload(5, addr, ctx),
    headers
  );
}

async function leadUpdateAddress(client, leadId, orderFormId, birthDate) {
  await client.request(
    "lead_update_address",
    "POST",
    `${client.baseUrl}/api/io/v1/leadUpdateAddress/${leadId}`,
    { orderFormId, birthDate },
    { Referer: `${client.baseUrl}/checkout/` }
  );
}

async function placeTransaction(client, orderFormId) {
  const txRes = await client.request(
    "checkout_completed",
    "POST",
    `${client.baseUrl}/api/checkout/pub/orderForm/${orderFormId}/transaction`,
    {
      referenceId: orderFormId,
      savePersonalData: true,
      optinNewsLetter: false,
      value: 0,
      referenceValue: 0,
      interestValue: 0,
      expectedOrderFormSections: EXPECTED_SECTIONS,
    },
    { Referer: `${client.baseUrl}/checkout/`, "X-Requested-With": "XMLHttpRequest" }
  );
  const orderGroup =
    txRes.json?.orderGroup ||
    String(txRes.text || "").match(/"orderGroup"\s*:\s*"(\d+)"/)?.[1] ||
    null;
  if (!orderGroup) {
    const err = new Error("orderGroup ausente após transaction");
    err.code = "ORDER_GROUP_MISSING";
    throw err;
  }
  return orderGroup;
}

async function addToCartGql(client, body) {
  await client.request(
    "cart_created",
    "POST",
    `${client.baseUrl}/_v/private/graphql/v1?${gqlQs(client.bindingId, "long")}`,
    body
  );
}

module.exports = {
  createSession,
  createOrderForm,
  attachProfileInitial,
  attachBirthDate,
  attachProfileCpf,
  attachPreferences,
  fetchPostalCode,
  attachShipping,
  leadUpdateAddress,
  placeTransaction,
  addToCartGql,
};
