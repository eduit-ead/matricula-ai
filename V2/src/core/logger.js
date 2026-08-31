function maskCpf(value) {
  const d = String(value || "").replace(/\D/g, "");
  if (d.length < 4) return "***";
  return `***${d.slice(-4)}`;
}

function redactValue(key, value) {
  const k = String(key || "").toLowerCase();
  if (k.includes("cpf") || k === "document") return maskCpf(value);
  return value;
}

function redact(obj) {
  if (obj == null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") out[k] = redact(v);
    else out[k] = redactValue(k, v);
  }
  return out;
}

function logEvent(fields) {
  const rec = {
    ts: new Date().toISOString(),
    executionId: fields.executionId || null,
    flowType: fields.flowType || null,
    step: fields.step || null,
    startedAt: fields.startedAt || null,
    finishedAt: fields.finishedAt || null,
    durationMs: fields.durationMs ?? null,
    status: fields.status || null,
    httpStatus: fields.httpStatus ?? null,
    errorCode: fields.errorCode || null,
  };
  if (fields.message) rec.message = fields.message;
  console.log(JSON.stringify(rec));
  return rec;
}

module.exports = { logEvent, redact, maskCpf };
