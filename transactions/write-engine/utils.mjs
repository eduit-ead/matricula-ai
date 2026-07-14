/**
 * Shared helpers for Write Engine backends (no registry — avoids circular imports).
 */

export function normalizeHostValue(v, list) {
  let out = v;
  for (const n of list || []) {
    if (n === "trim") out = String(out ?? "").trim();
    else if (n === "lowerCase") out = String(out ?? "").trim().toLowerCase();
    else if (n === "titleCase")
      out = String(out ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    else if (n === "digitsOnly") out = String(out ?? "").replace(/\D/g, "");
  }
  return out;
}

export function parseJsonFromCli(text) {
  const raw = (text || "").trim();
  const i = raw.search(/[\{\[]/);
  if (i < 0) return null;
  try {
    return JSON.parse(raw.slice(i));
  } catch {
    return null;
  }
}

export function findSnapshotRef(text, predicates) {
  const lines = String(text || "").split(/\n/);
  for (const pred of predicates) {
    for (const line of lines) {
      if (pred(line)) {
        const m = line.match(/\[ref=(e\d+)\]/);
        if (m) return { ref: m[1], line: line.trim() };
      }
    }
  }
  return null;
}

/** Find option label in accessibility snapshot whose text contains needle (case-insensitive). */
export function findOptionLabel(text, needle) {
  const n = String(needle || "").trim().toLowerCase();
  if (!n) return null;
  for (const line of String(text || "").split(/\n/)) {
    if (!/option \"/.test(line)) continue;
    const m = line.match(/option \"([^\"]+)/);
    if (!m) continue;
    if (m[1].toLowerCase().includes(n)) return m[1];
  }
  return null;
}
