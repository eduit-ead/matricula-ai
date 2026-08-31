const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { listFlows, getFlow } = require("../src/flows");

describe("flow registry", () => {
  test("stable ids", () => {
    const ids = listFlows().map((f) => f.id);
    assert.deepEqual(ids, [
      "graduacao_multipla",
      "graduacao_redacao",
      "graduacao_enem",
      "graduacao_transferencia",
      "graduacao_segunda",
      "pos",
    ]);
  });

  test("múltipla and ENEM are homologated", () => {
    assert.equal(getFlow("graduacao_multipla").homologated, true);
    assert.equal(getFlow("graduacao_enem").homologated, true);
    assert.equal(typeof getFlow("graduacao_enem").buildPayloads, "function");
    for (const id of [
      "graduacao_redacao",
      "graduacao_transferencia",
      "graduacao_segunda",
      "pos",
    ]) {
      assert.equal(getFlow(id).homologated, false);
      assert.equal(typeof getFlow(id).buildPayloads, "undefined");
    }
  });

  test("pos uses Pós-Graduação department", () => {
    assert.equal(getFlow("pos").department, "Pós-Graduação");
    assert.equal(getFlow("graduacao_multipla").department, "Graduação");
  });
});
