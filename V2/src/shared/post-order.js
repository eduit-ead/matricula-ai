const TIPO_PROVA_MAP = {
  VESTIBULAR_REDACAO: "VESTIBULAR_REDACAO",
  "Vestibular Redação": "VESTIBULAR_REDACAO",
  VESTIBULAR_MULTIPLA_ESCOLHA: "VESTIBULAR_MULTIPLA_ESCOLHA",
  "Vestibular Múltipla Escolha": "VESTIBULAR_MULTIPLA_ESCOLHA",
  VESTIBULAR_MERITO: "VESTIBULAR_MERITO",
  "Vestibular Mérito": "VESTIBULAR_MERITO",
};

function mapTipoProva(formaIngresso) {
  return TIPO_PROVA_MAP[formaIngresso] || formaIngresso || "VESTIBULAR_MULTIPLA_ESCOLHA";
}

function resolveNumeroProva(lead, order) {
  if (lead?.inscricaoSIAA) return lead.inscricaoSIAA;
  if (order?.sequence) return String(order.sequence);
  return String(order.orderId).replace(/-01$/, "");
}

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, {
    headers: { Accept: "application/json", ...opts.headers },
    ...opts,
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status} ${url}: ${text.slice(0, 300)}`);
    err.status = r.status;
    err.body = text;
    throw err;
  }
  return json ?? text;
}

async function getOrder14(baseUrl, orderGroup) {
  const orderId = `${orderGroup}-01`;
  return fetchJson(`${baseUrl}/_v/order14/${orderId}`);
}

async function getLeadOrder(baseUrl, email) {
  const data = await fetchJson(`${baseUrl}/_v/leadOrder/${encodeURI(email)}`);
  return data?.data || [];
}

async function putLeadOrder(baseUrl, lead, orderId, extras = {}) {
  const body = {
    ...lead,
    ...extras,
    orderId,
    status: "finished",
    statusGraduacao: extras.statusGraduacao ?? "0",
    passoFicha: extras.passoFicha ?? "4",
    formaPagamento: lead.formaPagamento || extras.formaPagamento || "Isento",
    situacaoPagamento: lead.situacaoPagamento || extras.situacaoPagamento || "Isento",
    identifyer: (lead.identifyer || "")
      .replace(/\s-\s(pending|finished)(?:\s-\s[\d-]+)?$/i, "")
      .concat(` - finished - ${orderId}`),
  };
  return fetchJson(`${baseUrl}/_v/leadOrderPut/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function pollInscricaoSIAA(baseUrl, email, orderId, { maxMs = 30000, intervalMs = 3000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const leads = await getLeadOrder(baseUrl, email);
    const lead = leads.find((x) => x.orderId === orderId) || leads[0];
    if (lead?.inscricaoSIAA) return lead;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

async function getProvaUrl(baseUrl, lead, order, tipoProva) {
  const codigoIes = lead.codigoIes || lead.marca || lead.iesNumber || "12";
  const params = new URLSearchParams({
    codigoIes: String(codigoIes),
    email: lead.email,
    nomeCompleto: lead.name || `${lead.firstName} ${lead.lastName}`.trim(),
    numeroInscricao: resolveNumeroProva(lead, order),
    tipoProva: tipoProva || mapTipoProva(lead.formaIngresso),
  });

  for (let attempt = 0; attempt < 5; attempt++) {
    const data = await fetchJson(`${baseUrl}/v1/getProvaUrl?${params}`);
    if (data?.success && data?.provaUrl) return data.provaUrl;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("getProvaUrl não retornou provaUrl");
}

/**
 * @param {{ fetchProva?: boolean, tipoProva?: string }} options
 */
async function runPostOrder({
  baseUrl,
  orderGroup,
  email,
  leadOrderPutExtras = {},
  fetchProva = true,
  tipoProva,
  silent = false,
}) {
  const log = silent ? () => {} : console.log.bind(console);
  const orderId = `${orderGroup}-01`;

  log("\n>>> GET /_v/order14/{orderGroup}-01");
  const order = await getOrder14(baseUrl, orderGroup);
  const numeroInscricao = order.orderId;
  log("numeroInscricao:", numeroInscricao);

  log("\n>>> GET /_v/leadOrder/{email}");
  let leads = await getLeadOrder(baseUrl, email);
  log("inscrições:", leads.length);

  let lead = leads.find((x) => x.orderId === orderId);
  if (!lead && leads.length === 1) lead = leads[0];

  const putExtras = { ...leadOrderPutExtras, orderId };

  if (!lead) {
    log("\n>>> PUT /_v/leadOrderPut/ (sync pós-pedido)");
    const pending = leads.find((x) => x.status === "pending" || !x.orderId) || leads[0];
    if (!pending) throw new Error(`Nenhum lead encontrado para ${email}`);
    await putLeadOrder(baseUrl, pending, orderId, putExtras);
    leads = await getLeadOrder(baseUrl, email);
    lead = leads.find((x) => x.orderId === orderId) || leads[0];
  } else {
    log("\n>>> PUT /_v/leadOrderPut/ (fechamento ficha)");
    await putLeadOrder(baseUrl, lead, orderId, putExtras);
    leads = await getLeadOrder(baseUrl, email);
    lead = leads.find((x) => x.orderId === orderId) || leads[0];
  }

  if (!lead?.orderId) {
    await putLeadOrder(baseUrl, lead, orderId, putExtras);
    leads = await getLeadOrder(baseUrl, email);
    lead = leads.find((x) => x.orderId === orderId) || leads[0];
  }

  if (!lead?.inscricaoSIAA) {
    log("\n>>> polling inscricaoSIAA (até 30s)…");
    lead = (await pollInscricaoSIAA(baseUrl, email, orderId)) || lead;
  }

  log("lead orderId:", lead?.orderId);
  log("inscricaoSIAA:", lead?.inscricaoSIAA || "(usa sequence do pedido)");
  log("numeroProva:", resolveNumeroProva(lead, order));

  let provaLink = null;
  if (fetchProva) {
    log("\n>>> GET /v1/getProvaUrl");
    provaLink = await getProvaUrl(baseUrl, lead, order, tipoProva);
    log("provaLink:", String(provaLink).slice(0, 80) + "…");
  }

  return {
    orderGroup,
    orderId,
    numeroInscricao,
    inscricaoSIAA: lead?.inscricaoSIAA || null,
    numeroProvaUsado: resolveNumeroProva(lead, order),
    sequence: order?.sequence || null,
    provaLink,
    lead: lead
      ? {
          id: lead.id,
          status: lead.status,
          orderId: lead.orderId,
          courseName: lead.courseName,
          formaIngresso: lead.formaIngresso,
          pole: lead.pole,
          inscricaoSIAA: lead.inscricaoSIAA,
        }
      : null,
  };
}

module.exports = {
  TIPO_PROVA_MAP,
  mapTipoProva,
  resolveNumeroProva,
  runPostOrder,
  getOrder14,
  getLeadOrder,
  getProvaUrl,
};
