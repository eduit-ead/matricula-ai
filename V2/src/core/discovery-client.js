/**
 * Descoberta read-only: campaigns / getprices.
 * Não muta orderForm nem cria lead.
 */
const { config } = require("./config");

async function tryJson(url, opts = {}) {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "Content-Type": "application/json", ...opts.headers },
      ...opts,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text.slice(0, 500);
    }
    return { ok: res.ok, httpStatus: res.status, data: json };
  } catch (err) {
    return { ok: false, httpStatus: null, error: err.message };
  }
}

async function discoverOffer({ codigoCurso, productRef }) {
  const base = config.vtexBaseUrl;
  const result = { campaigns: null, prices: null };
  if (codigoCurso) {
    result.campaigns = await tryJson(`${base}/_v/wrapper/api/campaigns/${codigoCurso}`, {
      method: "POST",
      body: "{}",
    });
  }
  if (productRef) {
    result.prices = await tryJson(`${base}/_v/getprices/${productRef}`, { method: "GET" });
  }
  return result;
}

module.exports = { discoverOffer };
