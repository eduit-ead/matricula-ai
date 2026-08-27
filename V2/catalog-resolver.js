/**
 * Resolução de curso/polo via planilhas locais (fonte oficial).
 * Sem importador, banco ou sync — leitura direta do Excel a cada processo.
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const CATALOG_DIR = path.join(__dirname, "catalog");

let _cache = null;

class CatalogError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "CatalogError";
  }
}

function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findCatalogFile(baseName) {
  if (!fs.existsSync(CATALOG_DIR)) {
    throw new Error(`Pasta catalog/ não encontrada em ${CATALOG_DIR}`);
  }
  const hit = fs.readdirSync(CATALOG_DIR).find((f) => norm(f) === norm(baseName));
  if (!hit) {
    throw new Error(
      `Planilha não encontrada: catalog/${baseName} (esperado cursos.xlsx ou polos.xlsx)`
    );
  }
  return path.join(CATALOG_DIR, hit);
}

function readSheet(baseName) {
  const filePath = findCatalogFile(baseName);
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
  return { filePath, sheetName, rows };
}

function loadCatalog() {
  if (_cache) return _cache;

  const cursosFile = readSheet("cursos.xlsx");
  const polosFile = readSheet("polos.xlsx");

  _cache = {
    cursos: cursosFile.rows,
    polos: polosFile.rows,
    meta: {
      cursosPath: cursosFile.filePath,
      polosPath: polosFile.filePath,
      cursosSheet: cursosFile.sheetName,
      polosSheet: polosFile.sheetName,
    },
  };
  return _cache;
}

/** Product reference 0120000000425 → codigoCurso 164250, lead 4250 */
function deriveCodigoCurso(productRef) {
  const m = String(productRef || "").match(/^0120000000(\d+)$/);
  if (!m) return { codigoCurso: null, codigoCursoLead: null };
  const core = m[1];
  const codigoCursoLead = core.length === 3 ? `${core}0` : core;
  return {
    codigoCurso: `16${codigoCursoLead}`,
    codigoCursoLead,
  };
}

/**
 * @param {{ nome: string, department?: string }} opts
 */
function resolveCurso({ nome, department = "Graduação" }) {
  const { cursos } = loadCatalog();
  const q = norm(nome);
  if (!q) {
    throw new CatalogError("COURSE_NOT_FOUND", "[CATALOG] Nome do curso não informado.");
  }

  const deptNorm = department ? norm(department) : null;

  let matches = cursos.filter((r) => norm(r["Product Name"]) === q);
  if (deptNorm) {
    const byDept = matches.filter((r) => norm(r.Department) === deptNorm);
    if (byDept.length) matches = byDept;
  }

  if (matches.length === 0) {
    matches = cursos.filter((r) => {
      const n = norm(r["Product Name"]);
      if (!n.includes(q) && !q.includes(n)) return false;
      if (deptNorm && norm(r.Department) !== deptNorm) return false;
      return true;
    });
  }

  if (matches.length === 0) {
    throw new CatalogError(
      "COURSE_NOT_FOUND",
      `[CATALOG] Curso não encontrado em cursos.xlsx: "${nome}"` +
        (department ? ` (departamento: ${department})` : "")
    );
  }

  if (matches.length > 1) {
    const names = matches.map((r) => r["Product Name"]).join(" | ");
    throw new CatalogError(
      "COURSE_AMBIGUOUS",
      `[CATALOG] Curso ambíguo em cursos.xlsx para "${nome}": ${names}. Seja mais específico.`
    );
  }

  const row = matches[0];
  const productId = String(row["Product ID"]);
  const skuId = Number(row["SKU ID"]);
  const productRef = String(row["Product reference code"] || "").trim();
  const courseName = String(row["Product Name"]);
  const departmentResolved = String(row.Department || "");
  const derived = deriveCodigoCurso(productRef);

  const resolved = {
    fonte: "Excel",
    productId,
    skuId,
    productRef,
    courseName,
    department: departmentResolved,
    codigoCurso: derived.codigoCurso,
    codigoCursoLead: derived.codigoCursoLead,
    productLabel: `${productId} - ${courseName} online`,
    slugGuess: courseName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
  };

  return resolved;
}

/**
 * @param {{ prefixo: string, cidade?: string, estado?: string }} opts
 */
function resolvePolo({ prefixo, cidade, estado }) {
  const { polos } = loadCatalog();
  const q = norm(prefixo);
  if (!q) {
    throw new CatalogError("POLE_NOT_FOUND", "[CATALOG] Prefixo/nome do polo não informado.");
  }

  const cidadeQ = cidade ? norm(cidade) : null;
  const estadoQ = estado ? norm(estado).replace(/^sao paulo$/i, "sp") : null;

  const score = (row) => {
    const fields = [row.polo, row["Polo nome2"], row.Cidade, row.Estado].map(norm);
    const id = Number(row.id);
    let s = 0;
    for (const f of fields) {
      if (!f) continue;
      if (q === f) s += 100;
      else if (q.includes(f) || f.includes(q)) s += 50;
    }
    if (cidadeQ && norm(row.Cidade) === cidadeQ) s += 20;
    if (estadoQ) {
      const st = norm(row.Estado);
      if (st === estadoQ || (estadoQ === "sp" && st === "sp")) s += 10;
    }
    return { s, id };
  };

  const ranked = polos
    .map((row) => ({ row, ...score(row) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.id - b.id);

  if (ranked.length === 0) {
    throw new CatalogError(
      "POLE_NOT_FOUND",
      `[CATALOG] Polo não encontrado em polos.xlsx: "${prefixo}"` +
        (cidade ? ` (cidade: ${cidade})` : "") +
        (estado ? ` (estado: ${estado})` : "")
    );
  }

  if (ranked.length > 1 && ranked[0].s === ranked[1].s) {
    const names = ranked
      .slice(0, 3)
      .map((x) => `${x.row["Polo nome2"] || x.row.polo} (id ${x.row.id})`)
      .join(" | ");
    throw new CatalogError(
      "POLE_AMBIGUOUS",
      `[CATALOG] Polo ambíguo em polos.xlsx para "${prefixo}": ${names}. Seja mais específico.`
    );
  }

  const row = ranked[0].row;
  const poleId = Number(row.id);
  const poloLabel = String(row["Polo nome2"] || row.polo || prefixo);

  return {
    fonte: "Excel",
    poleId,
    poleType: 0,
    poloShort: String(row.polo),
    poloNome2: String(row["Polo nome2"] || ""),
    cidade: String(row.Cidade || cidade || ""),
    estado: String(row.Estado || "SP"),
    poloLabel,
  };
}

function logCatalog(resolvedCurso, resolvedPolo) {
  const lines = [
    `[CATALOG]`,
    `curso: ${resolvedCurso.courseName}`,
    `skuId: ${resolvedCurso.skuId}`,
    `productId: ${resolvedCurso.productId}`,
    `fonte: ${resolvedCurso.fonte}`,
    `[CATALOG]`,
    `polo: ${resolvedPolo.poloLabel}`,
    `poleId: ${resolvedPolo.poleId}`,
    `fonte: ${resolvedPolo.fonte}`,
  ];
  for (const line of lines) console.log(line);
  return lines;
}

/**
 * Resolve curso + polo a partir do catálogo Excel (sem fallback remoto).
 * @returns {{ curso, polo, course, catalogLookupMs, logs }}
 */
function resolveCatalog(input) {
  const t0 = Date.now();
  const curso = resolveCurso({
    nome: input.curso,
    department: input.department || "Graduação",
  });
  const polo = resolvePolo({
    prefixo: input.polo_prefixo,
    cidade: input.cidade,
    estado: input.estado,
  });
  const course = buildCourseConfig(curso, input.courseDefaults || {});
  const catalogLookupMs = Date.now() - t0;
  const logs = logCatalog(curso, polo);
  return { curso, polo, course, catalogLookupMs, logs };
}

function buildCourseConfig(resolvedCurso, defaults = {}) {
  return {
    productId: resolvedCurso.productId,
    skuId: resolvedCurso.skuId,
    courseName: resolvedCurso.courseName,
    productLabel: resolvedCurso.productLabel,
    codigoDoCurso: resolvedCurso.codigoCurso,
    codigoDoCursoLead: resolvedCurso.codigoCursoLead,
    codCursoSetprices: resolvedCurso.codigoCurso,
    productRef: resolvedCurso.productRef,
    codVest: defaults.codVest ?? 581,
    seqVest: defaults.seqVest ?? 5,
    campanhaId: defaults.campanhaId ?? 2708,
    campanhaNome: defaults.campanhaNome ?? "Aprovados - Grad EAD [PDP VTEX]",
    productValue: defaults.productValue ?? 5855.48,
    areaInteresse: defaults.areaInteresse ?? "Gestão e Negócios",
    tipoFormacao: defaults.tipoFormacao ?? "Graduação",
    modalidade: defaults.modalidade ?? 8,
    unidade: defaults.unidade ?? 16,
    ciclo: defaults.ciclo ?? "2026/2",
  };
}

function resetCache() {
  _cache = null;
}

module.exports = {
  CatalogError,
  resolveCurso,
  resolvePolo,
  resolveCatalog,
  logCatalog,
  buildCourseConfig,
  loadCatalog,
  resetCache,
  deriveCodigoCurso,
};
