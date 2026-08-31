const { AppError } = require("./errors");
const { logEvent } = require("./logger");
const { config } = require("./config");

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

function gqlQs(bindingId, maxAge = "long") {
  return `workspace=master&maxAge=${maxAge}&appsEtag=remove&domain=store&locale=pt-BR&__bindingId=${bindingId}`;
}

function sessionsQs(bindingId) {
  return (
    "items=account.id,account.accountName,store.channel,store.countryCode,store.cultureInfo,store.currencyCode,store.currencySymbol,store.admin_cultureInfo,creditControl.creditAccounts,creditControl.deadlines,creditControl.minimumInstallmentValue,authentication.storeUserId,authentication.storeUserEmail,profile.firstName,profile.document,profile.email,profile.id,profile.isAuthenticated,profile.lastName,profile.phone,public.favoritePickup,public.utm_source,public.utm_medium,public.utm_campaign,public.utmi_cp,public.utmi_pc&__bindingId=" +
    bindingId
  );
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

class VtexClient {
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl || config.vtexBaseUrl;
    this.bindingId = opts.bindingId || config.vtexBindingId;
    this.referer = opts.referer || this.baseUrl;
    this.jar = new CookieJar();
    this.steps = [];
    this.executionId = opts.executionId || null;
    this.flowType = opts.flowType || null;
    this.fetchImpl = opts.fetchImpl || fetch;
    this.muted = opts.muted === true;
  }

  setReferer(url) {
    this.referer = url;
  }

  async request(stepName, method, url, body, extraHeaders = {}, reqOpts = {}) {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    const headers = {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      Origin: this.baseUrl,
      Referer: this.referer,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      ...extraHeaders,
    };
    const cookie = this.jar.header();
    if (cookie) headers.Cookie = cookie;

    const opts = { method, headers };
    if (reqOpts.redirect) opts.redirect = reqOpts.redirect;
    if (body !== undefined && method !== "GET") {
      opts.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    if (!this.muted) {
      console.log(`\n>>> STEP: ${stepName}`);
      console.log(`${method} ${url}`);
    }

    const res = await this.fetchImpl(url, opts);
    const setCookie = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : res.headers.get("set-cookie");
    this.jar.ingest(setCookie);
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }

    const durationMs = Date.now() - t0;
    const finishedAt = new Date().toISOString();
    const allowed = Array.isArray(reqOpts.okStatuses) ? reqOpts.okStatuses : [];
    const ok = res.ok || allowed.includes(res.status);
    const rec = {
      step: stepName,
      startedAt,
      finishedAt,
      durationMs,
      status: ok ? "ok" : "error",
      httpStatus: res.status,
      errorCode: ok ? null : `HTTP_${res.status}`,
    };
    this.steps.push(rec);
    logEvent({
      executionId: this.executionId,
      flowType: this.flowType,
      ...rec,
    });

    if (!this.muted) console.log(`STATUS: ${res.status}`);

    if (!ok) {
      throw new AppError(
        "VTEX_HTTP_ERROR",
        `HTTP ${res.status} at ${stepName}: ${String(text).slice(0, 300)}`,
        {
          statusCode: 502,
          httpStatus: res.status,
          step: stepName,
          vtexResponse: typeof json === "object" ? json : String(text).slice(0, 500),
          steps: this.steps,
        }
      );
    }
    const location = typeof res.headers.get === "function" ? res.headers.get("location") : null;
    return { json, text, status: res.status, url: res.url || url, location };
  }
}

function extractOrderFormId(payload) {
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
  return (
    raw.match(/"orderFormId"\s*:\s*"([a-f0-9]{32})"/i)?.[1] ||
    raw.match(/"id"\s*:\s*"([a-f0-9]{32})"/i)?.[1] ||
    null
  );
}

function extractLeadId(json) {
  if (!json || typeof json !== "object") return null;
  if (json.DocumentId) return json.DocumentId;
  if (json.Id) return String(json.Id).replace(/^OP-/, "");
  return null;
}

module.exports = {
  VtexClient,
  CookieJar,
  EXPECTED_SECTIONS,
  ORDER_FORM_GQL,
  gqlQs,
  sessionsQs,
  extractOrderFormId,
  extractLeadId,
};
