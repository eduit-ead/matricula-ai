#!/usr/bin/env node
/**
 * Entrada HTTP mínima para o N8N / Kommo.
 * N8N só encaminha o webhook. Catálogo, VTEX e SIAA ficam no motor.
 *
 * POST /inscricao  — JSON limpo OU payload Kommo (busca o lead se houver token)
 * GET  /health
 *
 * Env: INSCRICAO_HTTP_PORT (8787), INSCRICAO_HTTP_TOKEN,
 *      KOMMO_SUBDOMAIN ou KOMMO_BASE_URL, KOMMO_ACCESS_TOKEN
 */
const http = require("http");
const { runInscricao } = require("./api-only-poc");
const { CatalogError } = require("./catalog-resolver");
const {
  norm,
  leadFromKommoFields,
  resolvePoloInscricao,
  mapFormacaoTipo,
  cepDigits,
  requireCep,
  assertCepExiste,
  normalizePhone,
} = require("./kommo-map");
const { isPoloMaisProximo, resolvePoloMaisProximo } = require("./polo-proximo");
const { writeInscricaoLog } = require("./inscricoes-log");

const PORT = Number(process.env.PORT || process.env.INSCRICAO_HTTP_PORT || 8787);
const AUTH = process.env.INSCRICAO_HTTP_TOKEN || "";
const ONLY_LEAD_ID = String(process.env.INSCRICAO_ONLY_LEAD_ID || "").trim();

function pick(obj, keys) {
  if (!obj) return "";
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  }
  return "";
}


function contactEmailPhone(contact) {
  const fields = contact?.custom_fields_values || [];
  let email = "";
  let phone = "";
  for (const f of fields) {
    const code = String(f.field_code || "").toUpperCase();
    const val = f.values?.[0]?.value;
    if (!val) continue;
    if (code === "EMAIL" && !email) email = String(val);
    if (code === "PHONE" && !phone) phone = String(val);
  }
  return { email, phone };
}

function extractKommoLeadId(body) {
  if (!body || typeof body !== "object") return "";
  const flat =
    body["leads[status][0][id]"] ||
    body["leads[add][0][id]"] ||
    body["leads[update][0][id]"];
  if (flat) return String(flat);
  const bucket = body.leads?.status || body.leads?.add || body.leads?.update;
  if (Array.isArray(bucket) && bucket[0]?.id) return String(bucket[0].id);
  if (bucket && typeof bucket === "object") {
    const first = bucket[0] || bucket["0"] || Object.values(bucket)[0];
    if (first?.id) return String(first.id);
  }
  return String(body.leadId || body.lead_id || "");
}

function kommoBase() {
  if (process.env.KOMMO_BASE_URL) return process.env.KOMMO_BASE_URL.replace(/\/$/, "");
  const sub = process.env.KOMMO_SUBDOMAIN || "admamoeduitcombr";
  return `https://${sub}.kommo.com`;
}

async function kommoFetch(pathname) {
  const token = process.env.KOMMO_ACCESS_TOKEN;
  const base = kommoBase();
  if (!token || !base) {
    throw new Error("Kommo: defina KOMMO_ACCESS_TOKEN e KOMMO_SUBDOMAIN (ou KOMMO_BASE_URL)");
  }
  const res = await fetch(`${base}${pathname}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Kommo ${res.status} ${pathname}: ${text.slice(0, 240)}`);
  return text ? JSON.parse(text) : {};
}

let _leadFields = null;
async function kommoLeadFields() {
  if (_leadFields) return _leadFields;
  const data = await kommoFetch("/api/v4/leads/custom_fields?limit=250");
  _leadFields = data._embedded?.custom_fields || [];
  return _leadFields;
}

function kommoFieldByNames(fields, names) {
  const want = new Set(names.map(norm));
  return fields.find((f) => want.has(norm(f.name))) || null;
}

async function kommoWriteResult(leadId, out) {
  const fields = await kommoLeadFields();
  const values = [];
  const nro = kommoFieldByNames(fields, [
    "nro da inscricao",
    "nro. da inscricao",
    "numero da inscricao",
    "nº da inscricao",
  ]);
  if (nro && out.inscricaoSIAA) {
    values.push({ field_id: nro.id, values: [{ value: String(out.inscricaoSIAA) }] });
  }
  const link = out.provaLink || out.paymentLink || out.documentsLink;
  const linkField = kommoFieldByNames(fields, [
    "link da prova",
    "link inscricao",
    "link da inscricao",
    "link documentos",
  ]);
  if (linkField && link) {
    values.push({ field_id: linkField.id, values: [{ value: link }] });
  }
  if (!values.length) return;
  const res = await fetch(`${kommoBase()}/api/v4/leads`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.KOMMO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([{ id: Number(leadId), custom_fields_values: values }]),
  });
  if (!res.ok) {
    throw new Error(`Kommo PATCH ${res.status}: ${(await res.text()).slice(0, 180)}`);
  }
}

async function kommoAddTag(leadId, tagName) {
  await fetch(`${kommoBase()}/api/v4/leads/${leadId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.KOMMO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: Number(leadId),
      _embedded: { tags: [{ name: tagName }] },
    }),
  });
}

async function loadKommoLead(leadId) {
  const lead = await kommoFetch(`/api/v4/leads/${leadId}?with=contacts`);
  let contacts = lead._embedded?.contacts || [];
  if (contacts[0]?.id && !(contacts[0].custom_fields_values || []).length) {
    contacts = [await kommoFetch(`/api/v4/contacts/${contacts[0].id}`)];
  }
  const contact = contacts[0] || {};
  const mapped = leadFromKommoFields(lead, contact);
  const mailPhone = contactEmailPhone(contact);
  if (!mapped.email && mailPhone.email) mapped.email = mailPhone.email;
  if (!mapped.telefone && mailPhone.phone) mapped.telefone = normalizePhone(mailPhone.phone);
  return mapped;
}

function fromPlainBody(body) {
  const { department, formaIngresso } = mapFormacaoTipo(
    pick(body, ["formacao", "Formação", "department"]),
    pick(body, ["tipoInscricao", "Tipo_Inscrição", "formaIngresso", "forma"])
  );
  return {
    leadId: String(pick(body, ["leadId", "lead_id"]) || ""),
    nome: pick(body, ["nome", "Nome", "name"]),
    cpf: pick(body, ["cpf", "CPF"]),
    email: pick(body, ["email", "E-mail"]),
    telefone: normalizePhone(pick(body, ["telefone", "Telefone Inscricao", "phone"])),
    nascimento: pick(body, ["nascimento", "Data de Nascimento"]),
    curso: pick(body, ["curso", "Curso Inscrição", "Curso Inscricao"]),
    poloRaw: pick(body, ["poloRaw", "Polo_Inscicao", "polo_inscicao", "polo"]),
    department,
    formaIngresso,
    cep: cepDigits(pick(body, ["cep", "CEP"])),
  };
}

function hasLeadFields(lead) {
  return Boolean(lead.cpf && lead.curso && lead.poloRaw);
}

function toOverrides(lead) {
  const o = {
    nome: lead.nome,
    cpf: lead.cpf,
    nascimento: lead.nascimento || "09/09/1999",
    curso: lead.curso,
    polo_prefixo: lead.poloPrefixo || lead.polo,
    department: lead.department,
    formaIngresso: lead.formaIngresso || "Vestibular Múltipla Escolha",
  };
  if (lead.email) o.email = lead.email;
  if (lead.telefone) o.phone = lead.telefone;
  if (lead.cep) o.cepRaw = String(lead.cep).replace(/\D/g, "");
  if (lead.enemAno) o.enemAno = lead.enemAno;
  if (lead.enemNota) o.enemNota = lead.enemNota;
  return o;
}

function publicResult(lead, result, err) {
  if (err) {
    const code = err instanceof CatalogError ? err.code : err.code || "INSCRICAO_FAILED";
    return {
      ok: false,
      code,
      error: err.message,
      leadId: lead.leadId || null,
      cpf: lead.cpf || null,
      email: lead.email || null,
      curso: lead.curso || null,
      formacao: lead.formacao || null,
      tipoInscricao: lead.tipoInscricao || null,
      formaIngresso: lead.formaIngresso || null,
      mensagem: `Falha na inscrição: ${code} — ${err.message}`,
    };
  }

  const post = result.post || {};
  const out = {
    ok: result.ok !== false,
    code: result.code || null,
    leadId: lead.leadId || null,
    cpf: result.cpf || lead.cpf,
    email: result.email || lead.email,
    nascimento: lead.nascimento || "09/09/1999",
    curso: result.catalog?.curso?.courseName || lead.curso,
    polo: result.catalog?.polo?.poloLabel || lead.polo,
    poloKm: lead.poloKm != null ? Number(lead.poloKm.toFixed(2)) : null,
    formacao: lead.formacao || null,
    tipoInscricao: lead.tipoInscricao || null,
    formaIngresso: result.formaIngresso || lead.formaIngresso,
    department: lead.department,
    orderId: result.orderId || null,
    inscricaoSIAA: result.inscricaoSIAA || post.inscricaoSIAA || null,
    provaLink: post.provaLink || result.provaLink || null,
    paymentLink: post.paymentLink || result.paymentLink || null,
    documentsLink: post.documentsLink || result.documentsLink || null,
  };

  if (!out.ok && out.code === "JA_INSCRITO_FORMA") {
    out.mensagem = `Já existe inscrição nessa forma neste ciclo. SIAA: ${out.inscricaoSIAA || "—"}.`;
    return out;
  }
  if (out.ok && !out.inscricaoSIAA) {
    out.ok = false;
    out.code = "SEM_SIAA";
    out.mensagem = `Pedido ${out.orderId || "—"} criado, mas sem inscrição SIAA (forma ${out.formaIngresso}).`;
    return out;
  }
  const bits = [`Inscrição ok. SIAA: ${out.inscricaoSIAA}. Pedido: ${out.orderId || "—"}.`];
  if (out.poloKm != null) bits.push(`Polo mais próximo: ${out.polo} (${out.poloKm} km).`);
  if (out.provaLink) bits.push(`Prova: ${out.provaLink}`);
  if (out.paymentLink) bits.push(`Pagamento (informe o CPF): ${out.paymentLink}`);
  if (out.documentsLink) bits.push(`Upload de documentos (CPF + nascimento ${out.nascimento}): ${out.documentsLink}`);
  out.mensagem = bits.join(" ");
  return out;
}

async function afterKommo(leadId, out) {
  if (!leadId || !process.env.KOMMO_ACCESS_TOKEN || !kommoBase()) return;
  try {
    await fetch(`${kommoBase()}/api/v4/leads/${leadId}/notes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.KOMMO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ note_type: "common", params: { text: out.mensagem } }]),
    });
    if (out.inscricaoSIAA) {
      await kommoWriteResult(leadId, out);
    }
    if (!out.ok) {
      await kommoAddTag(leadId, "ERRO_INSCRIÇÃO");
    }
  } catch (e) {
    console.error("Kommo pós-inscrição:", e.message);
  }
}

let queue = Promise.resolve();
const inflight = new Set();

function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        const params = new URLSearchParams(raw);
        const obj = {};
        for (const [k, v] of params) obj[k] = v;
        resolve(obj);
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function authorized(req) {
  if (!AUTH) return true;
  const hdr = req.headers.authorization || "";
  const q = new URL(req.url, "http://localhost").searchParams.get("token");
  return hdr === `Bearer ${AUTH}` || q === AUTH;
}

async function failLog(lead, err, t0) {
  const out = publicResult(lead || {}, null, err);
  out.durationMs = Date.now() - t0;
  if (lead?.leadId) await afterKommo(lead.leadId, out);
  await writeInscricaoLog(lead || {}, out);
  return out;
}

async function handleInscricao(body) {
  const t0 = Date.now();
  let lead = fromPlainBody(body.body || body);
  if (!hasLeadFields(lead)) {
    const leadId = extractKommoLeadId(body.body || body);
    if (!leadId) {
      const err = new Error("Informe cpf+curso+polo no JSON, ou um webhook Kommo com lead id + token Kommo");
      err.code = "INPUT_INVALID";
      return failLog(lead, err, t0);
    }
    lead = { ...lead, ...(await loadKommoLead(leadId)), leadId };
  }
  if (ONLY_LEAD_ID && String(lead.leadId || "") !== ONLY_LEAD_ID) {
    const err = new Error(`Teste: só o lead ${ONLY_LEAD_ID} pode inscrever (recebido: ${lead.leadId || "sem id"})`);
    err.code = "LEAD_NAO_PERMITIDO";
    return failLog(lead, err, t0);
  }

  if (!lead.cpf) {
    const err = new Error("CPF ausente no lead");
    err.code = "INPUT_INVALID";
    return failLog(lead, err, t0);
  }
  if (!lead.curso || !lead.poloRaw) {
    const err = new Error("Curso Inscrição ou Polo_Inscicao ausente no lead");
    err.code = "INPUT_INVALID";
    return failLog(lead, err, t0);
  }

  const lockKey = `${String(lead.cpf).replace(/\D/g, "")}:${lead.formaIngresso}`;
  if (inflight.has(lockKey)) {
    const err = new Error("Inscrição deste CPF/forma já está em andamento");
    err.code = "IN_FLIGHT";
    return failLog(lead, err, t0);
  }

  inflight.add(lockKey);
  try {
    lead.cep = requireCep(lead.cep);
    const vtexPostal = await assertCepExiste(lead.cep);
    const resolvedPolo = isPoloMaisProximo(lead.poloRaw)
      ? await resolvePoloMaisProximo(lead.cep, vtexPostal)
      : resolvePoloInscricao(lead.poloRaw);
    lead.poloPrefixo = resolvedPolo.prefixo;
    lead.poleId = resolvedPolo.poleId;
    lead.polo = resolvedPolo.prefixo;
    if (resolvedPolo.km != null) lead.poloKm = resolvedPolo.km;
    const result = await runInscricao(toOverrides(lead));
    const out = publicResult(lead, result, null);
    out.durationMs = Date.now() - t0;
    await afterKommo(lead.leadId, out);
    await writeInscricaoLog(lead, out);
    return out;
  } catch (err) {
    const out = publicResult(lead, null, err);
    out.durationMs = Date.now() - t0;
    await afterKommo(lead.leadId, out);
    await writeInscricaoLog(lead, out);
    return out;
  } finally {
    inflight.delete(lockKey);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, { ok: true, kommo: Boolean(process.env.KOMMO_ACCESS_TOKEN && kommoBase()) });
  }
  if (req.method !== "POST" || url.pathname !== "/inscricao") {
    return send(res, 404, { ok: false, error: "Use POST /inscricao" });
  }
  if (!authorized(req)) {
    return send(res, 401, { ok: false, error: "Unauthorized" });
  }

  try {
    const body = await readBody(req);
    const out = await enqueue(() => handleInscricao(body));
    send(res, out.ok ? 200 : 409, out);
  } catch (err) {
    const out = publicResult({}, null, err);
    await writeInscricaoLog({}, out);
    send(res, 400, out);
  }
});

server.timeout = 180000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Inscrição HTTP em http://127.0.0.1:${PORT}/inscricao`);
});
