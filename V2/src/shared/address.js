const { EXPECTED_SECTIONS } = require("../core/vtex-client");

function genAddressId() {
  return String(Math.floor(Math.random() * 9e12) + 1e12);
}

function mapPostalCode(json, fallback = {}) {
  if (!json || typeof json !== "object") {
    return {
      postalCode: fallback.postalCode || "",
      city: fallback.city || "",
      state: fallback.state || "",
      country: fallback.country || "BRA",
      street: fallback.street || "",
      neighborhood: fallback.neighborhood || "",
      geoCoordinates: fallback.geoCoordinates || [],
    };
  }
  return {
    postalCode: json.postalCode || fallback.postalCode || "",
    city: json.city || fallback.city || "",
    state: json.state || fallback.state || "",
    country: json.country || "BRA",
    street: json.street || fallback.street || "",
    neighborhood: json.neighborhood || fallback.neighborhood || "",
    geoCoordinates: Array.isArray(json.geoCoordinates) ? json.geoCoordinates : [],
  };
}

function buildResidentialAddress(candidate, postal, ctx) {
  const number = candidate.semNumero
    ? "S/N"
    : String(candidate.number || "").trim() || "S/N";
  return {
    addressType: "residential",
    receiverName: `${candidate.firstName} ${candidate.lastName}`.trim(),
    addressId: ctx.addressIdResidential,
    isDisposable: true,
    postalCode: postal.postalCode || candidate.postalCode,
    city: postal.city,
    state: postal.state,
    country: postal.country || "BRA",
    street: candidate.street || postal.street || "",
    number,
    neighborhood: candidate.neighborhood || postal.neighborhood || "",
    complement: candidate.complemento || "",
    reference: null,
    geoCoordinates: postal.geoCoordinates || [],
  };
}

function shippingPayload(step, addr, ctx) {
  if (step === 1) {
    return {
      logisticsInfo: [
        { addressId: null, itemIndex: 0, selectedDeliveryChannel: null, selectedSla: null },
      ],
      clearAddressIfPostalCodeNotFound: false,
      selectedAddresses: [
        { ...addr, addressId: ctx.addressIdResidential, number: null, complement: null, isDisposable: null },
        { ...addr, addressId: ctx.addressIdSearch, addressType: "search", number: null, complement: null, isDisposable: null },
      ],
      expectedOrderFormSections: EXPECTED_SECTIONS,
    };
  }
  if (step === 3) {
    return {
      address: addr,
      availableAddresses: [addr],
      logisticsInfo: null,
      expectedOrderFormSections: EXPECTED_SECTIONS,
    };
  }
  return {
    logisticsInfo: [
      {
        addressId: ctx.addressIdResidential,
        itemIndex: 0,
        selectedDeliveryChannel: "delivery",
        selectedSla: "Entrega padrão",
      },
    ],
    clearAddressIfPostalCodeNotFound: false,
    selectedAddresses: [
      { ...addr, addressId: ctx.addressIdSearch, addressType: "search", number: "S/N", complement: null, isDisposable: null },
      { ...addr },
    ],
    expectedOrderFormSections: EXPECTED_SECTIONS,
  };
}

module.exports = {
  genAddressId,
  mapPostalCode,
  buildResidentialAddress,
  shippingPayload,
};
