#!/usr/bin/env node
const { config } = require("./src/core/config");
const { runPostOrder, mapTipoProva, resolveNumeroProva } = require("./src/shared/post-order");

const orderGroup = process.env.ORDER_GROUP;
const email = process.env.EMAIL;

if (require.main === module) {
  if (!orderGroup || !email) {
    console.error("Defina ORDER_GROUP e EMAIL (saída de api-only-poc.js)");
    process.exit(1);
  }

  runPostOrder({ baseUrl: config.vtexBaseUrl, orderGroup, email })
    .then((result) => {
      console.log("\n========================================");
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("\nFALHA:", err.message);
      process.exit(1);
    });
}

module.exports = {
  runPostOrder: (opts) => runPostOrder({ baseUrl: config.vtexBaseUrl, ...opts }),
  run: (opts) => runPostOrder({ baseUrl: config.vtexBaseUrl, ...opts }),
  mapTipoProva,
  resolveNumeroProva,
};
