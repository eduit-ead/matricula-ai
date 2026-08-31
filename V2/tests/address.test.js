const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mapPostalCode, buildResidentialAddress, genAddressId } = require("../src/shared/address");

test("shipping uses VTEX postal-code, not a hardcoded street", () => {
  const postal = mapPostalCode({
    postalCode: "01310-100",
    city: "São Paulo",
    state: "SP",
    country: "BRA",
    street: "Avenida Paulista",
    neighborhood: "Bela Vista",
    geoCoordinates: [-46.65, -23.56],
  });
  const ctx = { addressIdResidential: genAddressId(), addressIdSearch: genAddressId() };
  const addr = buildResidentialAddress(
    { firstName: "Ana", lastName: "Silva", semNumero: true, complemento: "", street: "", neighborhood: "" },
    postal,
    ctx
  );
  assert.equal(addr.street, "Avenida Paulista");
  assert.equal(addr.neighborhood, "Bela Vista");
  assert.notEqual(addr.street, "Avenida Francisco Matarazzo");
  assert.deepEqual(addr.geoCoordinates, [-46.65, -23.56]);
});
