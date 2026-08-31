function envBool(key, defaultValue = false) {
  const v = process.env[key];
  if (v == null || v === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

const config = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || "0.0.0.0",
  allowRealEnrollments: envBool("ALLOW_REAL_ENROLLMENTS", false),
  skipPostOrder: process.env.SKIP_POST_ORDER === "1",
  vtexBaseUrl: process.env.VTEX_BASE_URL || "https://cruzeirodosul.myvtex.com",
  vtexBindingId: process.env.VTEX_BINDING_ID || "b609c118-0b5f-4ae9-b099-d94f79af4a58",
  vtexOperatorEmail:
    process.env.VTEX_OPERATOR_EMAIL || "fabio.boas50@polo.cruzeirodosul.edu.br",
};

module.exports = { config, envBool };
