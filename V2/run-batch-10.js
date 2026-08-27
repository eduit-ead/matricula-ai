#!/usr/bin/env node
/**
 * Batch robustness — 10 inscrições API-only consecutivas
 * Usa api-only-poc.js (catálogo Excel + pós-pedido integrado)
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RUNS = 10;
const CPF = "069.826.800-88";
const CURSO = process.env.POC_CURSO || process.env.CURSO || "Administração";
const POLO = process.env.POC_POLO || process.env.POLO_PREFIXO || "Barra Funda";
const DIR = __dirname;

const BATCH_ENV = {
  POC_CPF: CPF,
  POC_CURSO: CURSO,
  POC_POLO: POLO,
  POC_CIDADE: process.env.POC_CIDADE || "São Paulo",
  POC_ESTADO: process.env.POC_ESTADO || "São Paulo",
};

function runNode(script, env = {}) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(DIR, script)], {
    cwd: DIR,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    code: r.status ?? 1,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    elapsedMs: Date.now() - t0,
  };
}

function parsePoc(stdout) {
  const email = stdout.match(/^EMAIL:\s*(.+)$/m)?.[1]?.trim();
  const ogMatch = stdout.match(/"orderGroup"\s*:\s*"(\d+)"/);
  const orderGroup = ogMatch?.[1];
  const okJson = stdout.match(/"ok"\s*:\s*true/);
  const ok = !!orderGroup && (!!okJson || stdout.includes("API-ONLY CONFIRMADO"));
  const catalogLookupMs = Number(stdout.match(/"catalogLookupMs"\s*:\s*(\d+)/)?.[1]) || null;
  const tempoTotalInscricaoMs =
    Number(stdout.match(/"tempoTotalInscricaoMs"\s*:\s*(\d+)/)?.[1]) || null;
  const inscricaoSIAA = stdout.match(/"inscricaoSIAA"\s*:\s*"(\d+)"/)?.[1] || null;
  const provaLink = stdout.match(/"provaLink"\s*:\s*"([^"]+)"/)?.[1] || null;
  return { email, orderGroup, ok, catalogLookupMs, tempoTotalInscricaoMs, inscricaoSIAA, provaLink };
}

function p95(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.min(idx, sorted.length - 1)];
}

const runs = [];
const errors = [];

console.log(`=== BATCH ${RUNS} INSCRIÇÕES API-ONLY ===`);
console.log(`Curso: ${CURSO} | Polo: ${POLO} | CPF: ${CPF}\n`);

for (let i = 1; i <= RUNS; i++) {
  const runT0 = Date.now();
  const entry = {
    run: i,
    email: null,
    cpf: CPF,
    orderGroup: null,
    numeroInscricao: null,
    provaLink: null,
    tempoTotalMs: null,
    status: "FAIL",
    erro: null,
    pocMs: null,
    postMs: null,
  };

  console.log(`--- Run ${i}/${RUNS} ---`);

  const poc = runNode("api-only-poc.js", {
    ...BATCH_ENV,
    POC_EMAIL: `batch.${Date.now()}.${i}@mailinator.com`,
  });
  entry.pocMs = poc.elapsedMs;
  const pocParsed = parsePoc(poc.stdout + poc.stderr);

  if (!pocParsed.ok || poc.code !== 0) {
    entry.erro = `POC falhou (exit ${poc.code})`;
    entry.tempoTotalMs = Date.now() - runT0;
    errors.push({ run: i, fase: "poc", erro: entry.erro, stdout: poc.stdout.slice(-800) });
    runs.push(entry);
    console.log(`  status: FAIL — ${entry.erro}\n`);
    continue;
  }

  entry.email = pocParsed.email;
  entry.orderGroup = pocParsed.orderGroup;
  entry.catalogLookupMs = pocParsed.catalogLookupMs;
  entry.numeroInscricao = pocParsed.inscricaoSIAA;
  entry.provaLink = pocParsed.provaLink;
  entry.tempoTotalMs = pocParsed.tempoTotalInscricaoMs || Date.now() - runT0;

  if (pocParsed.provaLink || pocParsed.inscricaoSIAA) {
    entry.status = "OK";
    console.log(
      `  OK orderGroup=${entry.orderGroup} SIAA=${entry.numeroInscricao || "-"} ${entry.tempoTotalMs}ms`
    );
  } else {
    entry.erro = "fluxo completo sem inscricaoSIAA/provaLink";
    errors.push({ run: i, fase: "post-order", erro: entry.erro });
    console.log(`  status: FAIL — ${entry.erro}`);
  }
  console.log("");
  runs.push(entry);
}

const okRuns = runs.filter((r) => r.status === "OK");
const times = okRuns.map((r) => r.tempoTotalMs);
const report = {
  geradoEm: new Date().toISOString(),
  total: RUNS,
  sucesso: okRuns.length,
  falha: RUNS - okRuns.length,
  taxaSucesso: `${((okRuns.length / RUNS) * 100).toFixed(1)}%`,
  tempoMedioMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
  tempoMedioSec: times.length ? +(times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(1) : null,
  p95Ms: times.length ? p95(times) : null,
  p95Sec: times.length ? +(p95(times) / 1000).toFixed(1) : null,
  erros: errors,
  inscricoes: runs.map((r) => ({
    run: r.run,
    status: r.status,
    email: r.email,
    cpf: r.cpf,
    orderGroup: r.orderGroup,
    numeroInscricao: r.numeroInscricao,
    provaLink: r.provaLink,
    tempoTotalMs: r.tempoTotalMs,
    tempoTotalSec: r.tempoTotalMs ? +(r.tempoTotalMs / 1000).toFixed(1) : null,
    erro: r.erro,
  })),
};

const outPath = path.join(DIR, "batch-10-report.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("========================================");
console.log("RELATÓRIO FINAL");
console.log("========================================");
console.log(`Taxa de sucesso: ${report.taxaSucesso} (${report.sucesso}/${report.total})`);
console.log(`Tempo médio:     ${report.tempoMedioSec}s (${report.tempoMedioMs}ms)`);
console.log(`P95:             ${report.p95Sec}s (${report.p95Ms}ms)`);
console.log(`Erros:           ${errors.length}`);
if (errors.length) errors.forEach((e) => console.log(`  run ${e.run} [${e.fase}]: ${e.erro}`));
console.log("\nInscrições:");
report.inscricoes.forEach((r) => {
  console.log(
    `  #${r.run} ${r.status} ${r.email || "-"} cpf=${r.cpf} og=${r.orderGroup || "-"} ${r.tempoTotalSec ?? "-"}s`
  );
});
console.log(`\nRelatório: ${outPath}`);

process.exit(okRuns.length === RUNS ? 0 : 1);
