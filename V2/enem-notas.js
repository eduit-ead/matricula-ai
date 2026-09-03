/**
 * Lê o boletim ENEM (texto de OCR ou PDF) e devolve as 5 notas + média.
 * Não inventa nota: ou extrai as 5 áreas ou falha.
 */
function brNum(raw) {
  const s = String(raw || "").trim().replace(/\s/g, "");
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickNota(text, ...needles) {
  const ntxt = String(text || "");
  for (const needle of needles) {
    const re = new RegExp(
      `${needle}[\\s\\S]{0,120}?(?:nota\\s*)?(\\d{2,3}(?:[.,]\\d+)?)`,
      "i"
    );
    const m = ntxt.match(re);
    if (m) {
      const n = brNum(m[1]);
      if (n != null && n <= 1000) return n;
    }
  }
  return null;
}

function parseEnemBoletim(text) {
  const linguagens = pickNota(text, "linguagens");
  const humanas = pickNota(text, "ciencias humanas", "ciências humanas", "humanas");
  const natureza = pickNota(text, "ciencias da natureza", "ciências da natureza", "natureza");
  const matematica = pickNota(text, "matematica", "matemática");
  const redacao = pickNota(text, "redacao", "redação");
  const scores = { linguagens, humanas, natureza, matematica, redacao };
  const vals = Object.values(scores).filter((n) => n != null);
  if (vals.length < 5) {
    const err = new Error(
      `Não li as 5 notas do boletim ENEM (achei ${vals.length}). Anexe a imagem/PDF do resultado.`
    );
    err.code = "ENEM_NOTA_ILEGIVEL";
    throw err;
  }
  const media = vals.reduce((a, b) => a + b, 0) / vals.length;
  const anoM = String(text || "").match(/\b(20\d{2})\b/);
  return {
    ...scores,
    enemNota: Number(media.toFixed(1)),
    enemAno: anoM ? anoM[1] : "",
  };
}

async function ocrBuffer(buf, mimeHint = "") {
  const { createWorker } = require("tesseract.js");
  const worker = await createWorker("por");
  try {
    const { data } = await worker.recognize(buf);
    return data?.text || "";
  } finally {
    await worker.terminate();
  }
}

function looksPdf(buf) {
  return buf && buf.length > 4 && buf.slice(0, 4).toString("utf8") === "%PDF";
}

async function enemFromDocumento(buf, mimeHint = "") {
  let text = "";
  if (looksPdf(buf) || /pdf/i.test(mimeHint)) {
    text = buf.toString("latin1");
    try {
      return parseEnemBoletim(text);
    } catch {
      text = await ocrBuffer(buf, mimeHint);
    }
  } else {
    text = await ocrBuffer(buf, mimeHint);
  }
  return parseEnemBoletim(text);
}

function requireEnemNotas(lead) {
  const n = Number(lead?.enemNota);
  if (!Number.isFinite(n) || n <= 0) {
    const err = new Error("ENEM sem nota. Anexe o boletim no campo Resultado ENEM.");
    err.code = "ENEM_SEM_NOTA";
    throw err;
  }
  return n;
}

module.exports = { parseEnemBoletim, enemFromDocumento, requireEnemNotas };
