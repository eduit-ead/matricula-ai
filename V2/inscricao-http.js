#!/usr/bin/env node
/**
 * Entrada HTTP mínima para o N8N / Kommo.
 * N8N só encaminha o webhook. Catálogo, VTEX e SIAA ficam no motor.
 *
 * POST /inscricao  — JSON limpo OU payload Kommo (busca o lead se houver token)
 * POST /webhook   — mesmo handler; URL para o Kommo (responde 200 na hora)
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
  kommoPoloLabel,
  resolvePoloInscricao,
  mapFormacaoTipo,
  cepDigits,
  requireCep,
  assertCepExiste,
  assertCpfValido,
  normalizePhone,
} = require("./kommo-map");
const { isPoloMaisProximo, resolvePoloMaisProximo } = require("./polo-proximo");
const { assertPoloPermitido } = require("./polos-bloqueados"); // TEMP: polos sem cota
const { writeInscricaoLog } = require("./inscricoes-log");
const { maybeSendMensagem } = require("./mensagem");
const { enemFromDocumento } = require("./enem-notas");
const { normalizeForma } = require("./post-order-fetch");

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

/** status/add = mudança de fase. update = campo/nota/tag (não pode reinscrever). */
function kommoWebhookKind(body) {
  const raw = body?.body || body || {};
  if (raw.leads?.status || raw["leads[status][0][id]"]) return "status";
  if (raw.leads?.add || raw["leads[add][0][id]"]) return "add";
  if (raw.leads?.update || raw["leads[update][0][id]"]) return "update";
  return "unknown";
}

async function leadNaInscricao(lead) {
  if (!lead?.statusId) return false;
  const dest = await findKommoStatus("Inscrição", lead.pipelineId);
  return Boolean(dest && Number(lead.statusId) === Number(dest.status_id));
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

let _driveUrl = null;
async function kommoDriveBase() {
  if (_driveUrl) return _driveUrl;
  const acc = await kommoFetch("/api/v4/account?with=drive_url");
  const raw = acc.drive_url || "https://drive-c.kommo.com";
  _driveUrl = String(raw).replace(/\/$/, "");
  return _driveUrl;
}

/** Igual ao N8N: Bearer no Drive; no redirect para outro host, sem Authorization. */
async function downloadHref(href, token) {
  let url = href;
  let sendAuth = true;
  for (let i = 0; i < 6; i++) {
    const headers = { "User-Agent": "matricula-ai-inscricao-http" };
    if (sendAuth && token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      const next = new URL(loc, url).href;
      sendAuth = new URL(next).host === new URL(url).host;
      url = next;
      continue;
    }
    return res;
  }
  const err = new Error("Redirect do download do Resultado ENEM sem destino.");
  err.code = "ENEM_SEM_NOTA";
  throw err;
}

async function resolveEnemDownloadHref(file) {
  if (file?.downloadHref) return file.downloadHref;
  const uuid = file?.uuid || file;
  if (!uuid) return "";
  const token = process.env.KOMMO_ACCESS_TOKEN;
  const drive = await kommoDriveBase();
  const metaRes = await fetch(`${drive}/v1.0/files/${encodeURIComponent(uuid)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "matricula-ai-inscricao-http",
    },
  });
  if (!metaRes.ok) {
    const err = new Error(
      `Não li o Resultado ENEM no Drive do Kommo (${metaRes.status}). O token precisa da permissão de arquivos.`
    );
    err.code = "ENEM_SEM_NOTA";
    throw err;
  }
  const meta = await metaRes.json();
  return meta?._links?.download?.href || meta?._links?.download_version?.href || "";
}

async function downloadKommoFile(file) {
  const token = process.env.KOMMO_ACCESS_TOKEN;
  const href = await resolveEnemDownloadHref(file);
  if (!href) {
    const err = new Error("Drive do Kommo não devolveu o link de download do Resultado ENEM.");
    err.code = "ENEM_SEM_NOTA";
    throw err;
  }
  const res = await downloadHref(href, token);
  if (!res.ok) {
    const err = new Error(`Não baixei o arquivo do Resultado ENEM (${res.status}).`);
    err.code = "ENEM_SEM_NOTA";
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
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

function kommoEnum(field, ...labels) {
  const enums = field?.enums || [];
  const want = labels.map(norm).filter(Boolean);
  return (
    enums.find((e) => want.includes(norm(e.value))) ||
    enums.find((e) => want.some((w) => norm(e.value) === w || norm(e.value).includes(w))) ||
    null
  );
}

async function kommoWriteResult(lead, out) {
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

  const statusField = kommoFieldByNames(fields, ["status inscricao"]);
  const statusEnum = kommoEnum(statusField, out.ok ? "OK" : "ERRO");
  if (statusField && statusEnum) {
    values.push({ field_id: statusField.id, values: [{ enum_id: statusEnum.id }] });
  }

  if (out.ok && out.formaPedida && out.formaIngresso && out.formaPedida !== out.formaIngresso) {
    const tipoField = kommoFieldByNames(fields, ["tipo inscricao", "tipo_inscricao"]);
    const tipoEnum = kommoEnum(tipoField, out.formaIngresso);
    if (tipoField && tipoEnum) {
      values.push({ field_id: tipoField.id, values: [{ enum_id: tipoEnum.id }] });
    }
  }

  const fromMaisProximo = lead && (lead.poloKm != null || norm(lead.poloRaw) === "polo mais proximo");
  if (fromMaisProximo && lead.poleId) {
    const poloField = kommoFieldByNames(fields, [
      "polo inscicao",
      "polo inscricao",
      "polo_inscicao",
      "polo_inscricao",
    ]);
    const slug = kommoPoloLabel(lead.poleId);
    const poloEnum = kommoEnum(
      poloField,
      slug,
      lead.poloPrefixo,
      Number(lead.poleId) === 3135 ? "campinas" : "",
      Number(lead.poleId) === 3146 ? "taboao centro" : ""
    );
    if (poloField && poloEnum) {
      values.push({ field_id: poloField.id, values: [{ enum_id: poloEnum.id }] });
    }
  }

  if (!values.length) return;
  const res = await fetch(`${kommoBase()}/api/v4/leads`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.KOMMO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([{ id: Number(lead.leadId), custom_fields_values: values }]),
  });
  if (!res.ok) {
    throw new Error(`Kommo PATCH ${res.status}: ${(await res.text()).slice(0, 180)}`);
  }
}

async function kommoFindTag(tagName) {
  const q = encodeURIComponent(tagName);
  const data = await kommoFetch(`/api/v4/leads/tags?limit=50&query=${q}`);
  const tags = data._embedded?.tags || [];
  const want = norm(tagName);
  return tags.find((t) => norm(t.name) === want) || tags.find((t) => t.name === tagName) || null;
}

async function kommoAddTag(leadId, tagName) {
  const hit = await kommoFindTag(tagName);
  if (!hit) {
    console.error(`Kommo: tag "${tagName}" não existe, não criei outra.`);
    return;
  }
  const res = await fetch(`${kommoBase()}/api/v4/leads`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.KOMMO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      { id: Number(leadId), _embedded: { tags: [{ id: hit.id }] } },
    ]),
  });
  if (!res.ok) {
    throw new Error(`Kommo tag ${tagName} ${res.status}: ${(await res.text()).slice(0, 180)}`);
  }
}

async function loadKommoLead(leadId) {
  const lead = await kommoFetch(`/api/v4/leads/${leadId}?with=contacts`);
  let contacts = lead._embedded?.contacts || [];
  if (contacts[0]?.id && !(contacts[0].custom_fields_values || []).length) {
    contacts = [await kommoFetch(`/api/v4/contacts/${contacts[0].id}`)];
  }
  const contact = contacts[0] || {};
  const mapped = leadFromKommoFields(lead, contact);
  mapped.pipelineId = lead.pipeline_id || null;
  mapped.statusId = lead.status_id || null;
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
  const posLead = /p[oó]s|mba/i.test(
    `${lead.department || ""} ${lead.formaIngresso || ""} ${lead.tipoInscricao || ""}`
  );
  const o = {
    nome: lead.nome,
    cpf: lead.cpf,
    nascimento: lead.nascimento || "09/09/1999",
    curso: lead.curso,
    polo_prefixo: lead.poloPrefixo || lead.polo,
    department: posLead ? "Pós-Graduação" : lead.department,
    formaIngresso: posLead ? "Pós Graduação" : lead.formaIngresso || "Vestibular Múltipla Escolha",
  };
  if (lead.email) o.email = lead.email;
  if (lead.telefone) o.phone = lead.telefone;
  if (lead.cep) o.cepRaw = String(lead.cep).replace(/\D/g, "");
  if (lead.enemAno) o.enemAno = lead.enemAno;
  if (lead.enemNota) o.enemNota = lead.enemNota;
  if (lead.linguagens) o.enemLinguagens = lead.linguagens;
  if (lead.humanas) o.enemHumanas = lead.humanas;
  if (lead.natureza) o.enemNatureza = lead.natureza;
  if (lead.matematica) o.enemMatematica = lead.matematica;
  if (lead.redacao) o.enemRedacao = lead.redacao;
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
    enemNota: Number(post.lead?.statusGraduacao) === 1 ? post.lead.enemMedia || null : null,
    formaPedida: result.formaPedida || null,
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
  if (!out.ok && out.code === "JA_INSCRITO_CURSO") {
    out.mensagem = `Já existe pós neste curso neste ciclo. SIAA: ${out.inscricaoSIAA || "—"}.`;
    return out;
  }
  if (out.ok && !out.inscricaoSIAA) {
    out.ok = false;
    out.code = "SEM_SIAA";
    out.mensagem = `Pedido ${out.orderId || "—"} criado, mas sem inscrição SIAA (forma ${out.formaIngresso}).`;
    return out;
  }
  const bits = [];
  if (out.formaPedida && out.formaPedida !== out.formaIngresso) {
    bits.push(`Inscrição em ${out.formaIngresso}`);
    bits.push(`Já existia uma inscrição em ${out.formaPedida} neste ciclo.`);
  } else {
    bits.push("Inscrição ok.");
  }
  if (out.polo) {
    bits.push(out.poloKm != null ? `Polo: ${out.polo} (${out.poloKm} km)` : `Polo: ${out.polo}`);
  }
  if (out.provaLink) bits.push(`Prova: ${out.provaLink}`);
  if (out.paymentLink) bits.push(`Pagamento (informe o CPF ${out.cpf || "—"}): ${out.paymentLink}`);
  if (out.documentsLink) {
    bits.push(
      `Upload de documentos (CPF ${out.cpf || "—"} + nascimento ${out.nascimento}): ${out.documentsLink}`
    );
  }
  if (normalizeForma(out.formaIngresso) === "enem" && !(Number(out.enemNota) > 0)) {
    bits.push("Falta o boletim ENEM (Resultado ENEM) para iniciar a matrícula.");
  }
  for (const aviso of result.avisos || []) bits.push(aviso);
  out.mensagem = bits.join("\n");
  return out;
}

let _pipelines = null;
async function kommoPipelines() {
  if (_pipelines) return _pipelines;
  const data = await kommoFetch("/api/v4/leads/pipelines");
  _pipelines = data._embedded?.pipelines || [];
  return _pipelines;
}

async function findKommoStatus(statusName, preferPipelineId) {
  const want = norm(statusName);
  const pipes = await kommoPipelines();
  const match = (p) => (p._embedded?.statuses || []).find((s) => norm(s.name) === want);
  const preferred = preferPipelineId && pipes.find((p) => Number(p.id) === Number(preferPipelineId));
  const hitPref = preferred && match(preferred);
  if (hitPref) return { pipeline_id: preferred.id, status_id: hitPref.id };
  for (const p of pipes) {
    const hit = match(p);
    if (hit) return { pipeline_id: p.id, status_id: hit.id };
  }
  return null;
}

function routingAposInscricao(out) {
  if (!out.ok) return { stay: true, tags: ["ERRO_INSCRIÇÃO"] };
  const forma = normalizeForma(out.formaIngresso);
  if (forma === "pos") return { stay: true, tags: ["POS_OK"] };
  if (forma === "enem") {
    const completo = Number(out.enemNota) > 0;
    return { stay: true, tags: [completo ? "ENEM_OK" : "ADICIONAR_NOTAS"] };
  }
  if (forma === "segunda" || forma === "transferencia") {
    return { stay: false, statusName: "Em Processo" };
  }
  if (forma === "multipla" || forma === "redacao") {
    return { stay: false, statusName: "Processo Seletivo", tags: ["ENVIAR_PROVA"] };
  }
  if (forma === "merito" || forma === "vestibular") {
    return { stay: false, statusName: "Processo Seletivo" };
  }
  return { stay: true };
}

async function kommoMoveLead(lead, statusName) {
  const dest = await findKommoStatus(statusName, lead.pipelineId);
  if (!dest) {
    console.error(`Kommo: fase "${statusName}" não encontrada.`);
    return;
  }
  const res = await fetch(`${kommoBase()}/api/v4/leads`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.KOMMO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      { id: Number(lead.leadId), pipeline_id: dest.pipeline_id, status_id: dest.status_id },
    ]),
  });
  if (!res.ok) {
    throw new Error(`Kommo move ${res.status}: ${(await res.text()).slice(0, 180)}`);
  }
}

async function kommoAddNote(leadId, text) {
  if (!text) return;
  const res = await fetch(`${kommoBase()}/api/v4/leads/${leadId}/notes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KOMMO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([{ note_type: "common", params: { text } }]),
  });
  if (!res.ok) {
    throw new Error(`Kommo note ${res.status}: ${(await res.text()).slice(0, 180)}`);
  }
}

async function afterKommo(lead, out) {
  const leadId = lead?.leadId || out.leadId;
  if (!leadId || !process.env.KOMMO_ACCESS_TOKEN || !kommoBase()) return;
  try {
    await kommoWriteResult(lead || { leadId }, out);
    await kommoAddNote(leadId, out.mensagem);
    const route = routingAposInscricao(out);
    if (!route.stay && route.statusName) {
      await kommoMoveLead({ ...lead, leadId }, route.statusName);
    }
    for (const tag of route.tags || []) await kommoAddTag(leadId, tag);
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
  if (lead?.leadId) await afterKommo(lead, out);
  await writeInscricaoLog(lead || {}, out);
  await maybeSendMensagem(lead, out);
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
    const kind = kommoWebhookKind(body.body || body);
    if (kind === "update") {
      console.log(`webhook ignorado: update do lead ${leadId}`);
      return { ok: true, skipped: true, reason: "KOMMO_UPDATE" };
    }
    if (kind !== "unknown" && !(await leadNaInscricao(lead))) {
      console.log(`webhook ignorado: lead ${leadId} fora de Inscrição`);
      return { ok: true, skipped: true, reason: "FORA_INSCRICAO" };
    }
  }
  if (ONLY_LEAD_ID && String(lead.leadId || "") !== ONLY_LEAD_ID) {
    const err = new Error(`Teste: só o lead ${ONLY_LEAD_ID} pode inscrever (recebido: ${lead.leadId || "sem id"})`);
    err.code = "LEAD_NAO_PERMITIDO";
    const out = publicResult(lead || {}, null, err);
    out.durationMs = Date.now() - t0;
    await writeInscricaoLog(lead || {}, out);
    return out;
  }

  if (!lead.cpf) {
    const err = new Error("CPF ausente no lead");
    err.code = "INPUT_INVALID";
    return failLog(lead, err, t0);
  }
  try {
    assertCpfValido(lead.cpf);
  } catch (err) {
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
    if (/^enem$/i.test(lead.formaIngresso) && !lead.enemNota && lead.enemFile?.uuid) {
      try {
        const buf = await downloadKommoFile(lead.enemFile);
        Object.assign(lead, await enemFromDocumento(buf, lead.enemFile.name));
      } catch (e) {
        console.error("ENEM boletim:", e.message);
      }
    }
    lead.cep = requireCep(lead.cep);
    if (isPoloMaisProximo(lead.poloRaw) && normalizeForma(lead.formaIngresso) === "pos") {
      const err = new Error(
        "Pós Graduação não usa polo mais próximo. Escolha o polo no campo Polo_Inscicao."
      );
      err.code = "POLO_POS_PROXIMO";
      throw err;
    }
    const vtexPostal = await assertCepExiste(lead.cep);
    const resolvedPolo = isPoloMaisProximo(lead.poloRaw)
      ? await resolvePoloMaisProximo(lead.cep, vtexPostal)
      : resolvePoloInscricao(lead.poloRaw);
    assertPoloPermitido(resolvedPolo.poleId); // TEMP: polos sem cota
    lead.poloPrefixo = resolvedPolo.prefixo;
    lead.poleId = resolvedPolo.poleId;
    lead.polo = resolvedPolo.prefixo;
    if (resolvedPolo.km != null) lead.poloKm = resolvedPolo.km;
    const result = await runInscricao(toOverrides(lead));
    const out = publicResult(lead, result, null);
    out.durationMs = Date.now() - t0;
    await afterKommo(lead, out);
    await writeInscricaoLog(lead, out);
    await maybeSendMensagem(lead, out);
    return out;
  } catch (err) {
    const out = publicResult(lead, null, err);
    out.durationMs = Date.now() - t0;
    await afterKommo(lead, out);
    await writeInscricaoLog(lead, out);
    await maybeSendMensagem(lead, out);
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
  if (req.method !== "POST" || (url.pathname !== "/inscricao" && url.pathname !== "/webhook")) {
    return send(res, 404, { ok: false, error: "Use POST /inscricao ou POST /webhook" });
  }

  try {
    const body = await readBody(req);
    if (!authorized(req) && !extractKommoLeadId(body.body || body)) {
      return send(res, 401, { ok: false, error: "Unauthorized" });
    }
    send(res, 200, { ok: true, accepted: true });
    if (kommoWebhookKind(body.body || body) === "update") {
      console.log("webhook ignorado: update de campo");
      return;
    }
    enqueue(() => handleInscricao(body)).catch((err) => {
      console.error("Inscrição em background:", err.message);
    });
  } catch (err) {
    const out = publicResult({}, null, err);
    await writeInscricaoLog({}, out);
    if (!res.headersSent) send(res, 400, out);
  }
});

server.timeout = 180000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Inscrição HTTP em http://127.0.0.1:${PORT}/inscricao`);
});
