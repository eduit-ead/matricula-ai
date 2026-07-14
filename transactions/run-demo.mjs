/**
 * Sprint Demo — harness de execução (NÃO altera Runtime / Stages / Write Engine).
 *
 * Melhorias de experiência:
 * 1. Captura link da prova sem abrir
 * 2. Logout do candidato + fecha browser controlado
 * 3. Busca curso + valida PDP por H1/nome (nunca por slug/URL)
 * 4. Relatório amigável no terminal
 * 5. JSON estruturado para n8n → demo-result.json
 *
 * Uso:
 *   node transactions/run-demo.mjs
 *   node transactions/run-demo.mjs path/to/demo-input.json
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runStageTransaction } from "./runtime.mjs";
import { buildN8nPayload, printFriendlyReport } from "./demo/buildReport.mjs";
import { ensureCandidateAuthenticated } from "./demo/ensureCandidateAuthenticated.mjs";
import { runCheckout } from "./demo/checkoutRunner.mjs";
import { runPostOrder } from "./demo/postOrderRunner.mjs";
import { runCapture } from "./demo/captureRunner.mjs";
import {
  runOkAsContract,
  runStageAsContract,
} from "./demo/runnerContract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const mjs = path.join(
  process.env.APPDATA,
  "npm",
  "node_modules",
  "openclaw",
  "openclaw.mjs"
);

const DEFAULT_DATA = {
  email: "gaboluku@gmail.com",
  curso: "Gestão de Recursos Humanos",
  modalidade: "Graduação: Virtual",
  nome: "Gabriel Lkonte",
  telefone: "11987121122",
  cep: "05001200",
  estado: "São Paulo",
  cidade: "São Paulo",
  poloPrefix: "São Paulo - perdizes",
  first: "Gabriel",
  last: "Lkonte",
  cpf: "06223434081",
  birth: "1999-09-09",
  formaIngresso: "Vestibular Múltipla Escolha",
  necessidade: "Não necessito de condições especiais",
};

function loadData() {
  const arg = process.argv[2];
  if (!arg) return { ...DEFAULT_DATA };
  const file = path.isAbsolute(arg) ? arg : path.join(root, arg);
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const nome = raw.nome_completo || raw.nome || DEFAULT_DATA.nome;
  const parts = String(nome).trim().split(/\s+/);
  return {
    ...DEFAULT_DATA,
    email: raw.email_aluno || raw.email || DEFAULT_DATA.email,
    curso: raw.curso || DEFAULT_DATA.curso,
    modalidade: raw.modalidade || DEFAULT_DATA.modalidade,
    nome,
    telefone: String(raw.telefone || DEFAULT_DATA.telefone).replace(/\D/g, ""),
    cep: String(raw.cep || DEFAULT_DATA.cep).replace(/\D/g, ""),
    estado: raw.estado || DEFAULT_DATA.estado,
    cidade: raw.cidade || DEFAULT_DATA.cidade,
    poloPrefix: raw.polo_prefixo || raw.poloPrefix || DEFAULT_DATA.poloPrefix,
    first: raw.primeiro_nome || parts[0] || DEFAULT_DATA.first,
    last:
      raw.ultimo_nome ||
      (parts.length > 1 ? parts.slice(1).join(" ") : DEFAULT_DATA.last),
    cpf: String(raw.cpf || DEFAULT_DATA.cpf).replace(/\D/g, ""),
    birth: normalizeBirth(raw.nascimento || raw.birth || DEFAULT_DATA.birth),
    formaIngresso:
      raw.forma_ingresso || raw.formaIngresso || DEFAULT_DATA.formaIngresso,
    necessidade:
      raw.necessidade_especial ||
      raw.necessidade ||
      DEFAULT_DATA.necessidade,
  };
}

function normalizeBirth(v) {
  const s = String(v || "").trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return s;
}

const DATA = loadData();

function loadObserveContinuarProcesso() {
  const fromEnv = process.env.DEMO_OBSERVE_CONTINUAR_PROCESSO;
  if (fromEnv === "1" || /^true$/i.test(fromEnv || "")) return true;
  if (fromEnv === "0" || /^false$/i.test(fromEnv || "")) return false;
  const arg = process.argv[2];
  if (arg) {
    try {
      const file = path.isAbsolute(arg) ? arg : path.join(root, arg);
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (typeof raw.observeContinuarProcesso === "boolean") {
        return raw.observeContinuarProcesso;
      }
    } catch {}
  }
  return false;
}

const OBSERVE_CONTINUAR_PROCESSO = loadObserveContinuarProcesso();
console.log(
  `[demo] observeContinuarProcesso=${OBSERVE_CONTINUAR_PROCESSO}`
);

/** Configuração de segurança do browser (Demo). Default: NÃO encerrar ao final. */
function loadBrowserCloseOnFinish() {
  const fromEnv = process.env.DEMO_BROWSER_CLOSE_ON_FINISH;
  if (fromEnv === "1" || /^true$/i.test(fromEnv || "")) return true;
  if (fromEnv === "0" || /^false$/i.test(fromEnv || "")) return false;
  const arg = process.argv[2];
  if (arg) {
    try {
      const file = path.isAbsolute(arg) ? arg : path.join(root, arg);
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (raw?.browser && typeof raw.browser.closeOnFinish === "boolean") {
        return raw.browser.closeOnFinish;
      }
      if (typeof raw.closeOnFinish === "boolean") return raw.closeOnFinish;
    } catch {}
  }
  return false; // seguro por padrão — nunca encerra browser do usuário sem opt-in
}

const DEMO_BROWSER = {
  closeOnFinish: loadBrowserCloseOnFinish(),
};

function loadAuthConfig() {
  const defaults = {
    maxAttempts: 3,
    gateTimeoutMs: 30000,
    pollMs: 2000,
  };
  const arg = process.argv[2];
  let fromFile = {};
  if (arg) {
    try {
      const file = path.isAbsolute(arg) ? arg : path.join(root, arg);
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      fromFile = raw?.auth || raw?.gateAuth || {};
    } catch {}
  }
  const maxAttempts = Number(
    process.env.DEMO_AUTH_MAX_ATTEMPTS || fromFile.maxAttempts || defaults.maxAttempts
  );
  const gateTimeoutMs = Number(
    process.env.DEMO_AUTH_GATE_MS || fromFile.gateTimeoutMs || defaults.gateTimeoutMs
  );
  const pollMs = Number(
    process.env.DEMO_AUTH_POLL_MS || fromFile.pollMs || defaults.pollMs
  );
  return {
    maxAttempts: Math.max(1, maxAttempts || defaults.maxAttempts),
    gateTimeoutMs: Math.max(5000, gateTimeoutMs || defaults.gateTimeoutMs),
    pollMs: Math.max(500, pollMs || defaults.pollMs),
  };
}

const DEMO_AUTH = loadAuthConfig();

console.log(
  `[demo] browser.closeOnFinish=${DEMO_BROWSER.closeOnFinish} (default false; set via input JSON or DEMO_BROWSER_CLOSE_ON_FINISH)`
);
console.log(
  `[demo] auth.maxAttempts=${DEMO_AUTH.maxAttempts} gateTimeoutMs=${DEMO_AUTH.gateTimeoutMs} pollMs=${DEMO_AUTH.pollMs}`
);

const CALL_TIMEOUT_MS = 45000;
const PHASE_MAX_MS = {
  start: 60000,
  login: 90000,
  gate_auth: 45000,
  search_pdp: 90000,
  wait_lead: 90000,
  lead: 90000,
  offer: 180000,
  post_offer: 60000,
  continuar_telemetry: 45000,
  gate_cart: 60000,
  checkout: 180000,
  post_order: 90000,
  capture: 120000,
  logout: 60000,
  close: 30000,
};
const TOTAL_MAX_MS = 12 * 60 * 1000;

const t0 = Date.now();
const log = [];
let browserToolCalls = 0;
let stageBrowserCalls = 0;
let humanInterventions = 0;
let aborted = null;
let phaseStarted = Date.now();
let currentPhase = "init";
/** Métricas por Runner (só medir — sem otimizar). */
const runnerMetrics = [];

function emptyPerf() {
  return {
    browserMs: 0,
    snapshotMs: 0,
    evaluateMs: 0,
    clickMs: 0,
    navigateMs: 0,
    otherBrowserMs: 0,
    pollMs: 0,
    waitConditionMs: 0,
    snapshots: 0,
    evaluates: 0,
    clicks: 0,
    navigates: 0,
    waits: 0,
  };
}

function mergePerf(into, from) {
  if (!from) return into;
  for (const k of Object.keys(into)) {
    into[k] = (into[k] || 0) + (from[k] || 0);
  }
  return into;
}

function secOf(ms) {
  return Math.round((ms || 0) / 1000);
}

let metricMark = {
  name: null,
  t0: Date.now(),
  calls0: 0,
  perf: emptyPerf(),
};

const PHASE_METRIC_LABEL = {
  login: "Auth",
  gate_auth: "Auth",
  search_pdp: "Search/PDP",
  wait_lead: "Search/PDP",
  lead: "Lead",
  offer: "Offer",
  post_offer: "Offer",
  continuar_telemetry: "Continuar(PDP)",
  gate_cart: "Cart Gate",
  checkout: "Checkout",
  post_order: "PostOrder",
  capture: "Capture",
  logout: "Logout",
  close: "Close",
};

function flushPhaseMetric() {
  if (!metricMark.name) return;
  const label = PHASE_METRIC_LABEL[metricMark.name] || metricMark.name;
  const ms = Date.now() - metricMark.t0;
  const calls = Math.max(0, browserToolCalls - metricMark.calls0);
  const perf = metricMark.perf || emptyPerf();
  const accounted =
    (perf.browserMs || 0) + (perf.pollMs || 0);
  const nodeMs = Math.max(0, ms - accounted);
  const row = {
    runner: label,
    ms,
    sec: secOf(ms),
    browserCalls: calls,
    browserMs: perf.browserMs,
    snapshotMs: perf.snapshotMs,
    evaluateMs: perf.evaluateMs,
    clickMs: perf.clickMs,
    navigateMs: perf.navigateMs,
    otherBrowserMs: perf.otherBrowserMs,
    pollMs: perf.pollMs,
    waitConditionMs: perf.waitConditionMs,
    nodeMs,
    snapshots: perf.snapshots,
    evaluates: perf.evaluates,
    clicks: perf.clicks,
    navigates: perf.navigates,
    waits: perf.waits,
  };
  const prev = runnerMetrics[runnerMetrics.length - 1];
  if (prev && prev.runner === label) {
    prev.ms += row.ms;
    prev.sec = secOf(prev.ms);
    prev.browserCalls += row.browserCalls;
    prev.browserMs += row.browserMs;
    prev.snapshotMs += row.snapshotMs;
    prev.evaluateMs += row.evaluateMs;
    prev.clickMs += row.clickMs;
    prev.navigateMs += row.navigateMs;
    prev.otherBrowserMs += row.otherBrowserMs;
    prev.pollMs += row.pollMs;
    prev.waitConditionMs += row.waitConditionMs;
    prev.nodeMs += row.nodeMs;
    prev.snapshots += row.snapshots;
    prev.evaluates += row.evaluates;
    prev.clicks += row.clicks;
    prev.navigates += row.navigates;
    prev.waits += row.waits;
  } else {
    runnerMetrics.push(row);
  }
}

function recordWaitCondition(ms) {
  if (!metricMark?.perf) return;
  metricMark.perf.waitConditionMs += Math.max(0, Number(ms) || 0);
}

function classifyBrowserArgs(args) {
  const op = String(args?.[1] || "");
  if (op === "snapshot") return "snapshot";
  if (op === "evaluate") return "evaluate";
  if (op === "click") return "click";
  if (op === "navigate") return "navigate";
  return "other";
}

function addBrowserPerf(kind, ms) {
  if (!metricMark?.perf) return;
  const n = Math.max(0, Number(ms) || 0);
  metricMark.perf.browserMs += n;
  if (kind === "snapshot") {
    metricMark.perf.snapshotMs += n;
    metricMark.perf.snapshots += 1;
  } else if (kind === "evaluate") {
    metricMark.perf.evaluateMs += n;
    metricMark.perf.evaluates += 1;
  } else if (kind === "click") {
    metricMark.perf.clickMs += n;
    metricMark.perf.clicks += 1;
  } else if (kind === "navigate") {
    metricMark.perf.navigateMs += n;
    metricMark.perf.navigates += 1;
  } else {
    metricMark.perf.otherBrowserMs += n;
  }
}
let s;
let st;
let logoutStatus = "nao_executado";
let logoutDetail = null;
let browserStatus = "aberto";
let browserDetail = null;
let leadResult = null;
let offerResult = null;
let orderOk = false;
let provaLink = null;
let numeroInscricao = null;
let finalizeDone = false;
/** Último resultado dos runners pós–Gate Cart (relatório de homologação). */
let lastCheckoutResult = null;
let lastPostOrderResult = null;
let lastCaptureResult = null;
let homologEnd = null;
let gateCartReason = null;
let gateAuthReason = null;
let authAttemptsUsed = 0;
let authReport = {
  attempts: 0,
  elapsedMs: 0,
  criterion: null,
  authenticatedEmail: null,
  alreadyAuthenticated: false,
  code: null,
};

const mark = (step, extra = {}) => {
  const e = { t: Math.round((Date.now() - t0) / 1000), step, ...extra };
  log.push(e);
  console.log(`[${e.t}s] ${step}`, extra.msg || extra.href || extra.reason || "");
};

function beginPhase(name) {
  flushPhaseMetric();
  // Estado transient da fase anterior NÃO pode contaminar a próxima.
  // PHASE_TIMEOUT / CALL_TIMEOUT são locais à fase; TOTAL_TIMEOUT permanece.
  if (
    aborted &&
    (aborted.reason === "PHASE_TIMEOUT" || aborted.reason === "CALL_TIMEOUT")
  ) {
    mark("PHASE_ABORT_CLEARED", {
      msg: JSON.stringify({
        cleared: aborted,
        nextPhase: name,
      }),
    });
    aborted = null;
  }
  currentPhase = name;
  phaseStarted = Date.now();
  metricMark = {
    name,
    t0: Date.now(),
    calls0: browserToolCalls,
    perf: emptyPerf(),
  };
  mark("PHASE", { msg: name });
}

function checkBudgets() {
  const total = Date.now() - t0;
  if (total > TOTAL_MAX_MS) {
    aborted = { reason: "TOTAL_TIMEOUT", phase: currentPhase, totalMs: total };
    return false;
  }
  const maxPhase = PHASE_MAX_MS[currentPhase];
  if (maxPhase && Date.now() - phaseStarted > maxPhase) {
    aborted = {
      reason: "PHASE_TIMEOUT",
      phase: currentPhase,
      phaseMs: Date.now() - phaseStarted,
    };
    return false;
  }
  return true;
}

function run(args) {
  if (!checkBudgets()) {
    return Promise.resolve({
      code: -1,
      out: "",
      err: JSON.stringify(aborted),
      ms: 0,
      timedOut: true,
    });
  }
  browserToolCalls += 1;
  const kind = classifyBrowserArgs(args);
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [mjs, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      cwd: root,
    });
    let out = "";
    let err = "";
    let settled = false;
    const finish = (payload) => {
      addBrowserPerf(kind, payload.ms || Date.now() - started);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGTERM");
      } catch {}
      aborted = {
        reason: "CALL_TIMEOUT",
        phase: currentPhase,
        args: args.slice(0, 3),
        ms: Date.now() - started,
      };
      mark("ABORT_CALL", { msg: JSON.stringify(aborted) });
      finish({
        code: -1,
        out,
        err: "CALL_TIMEOUT",
        ms: Date.now() - started,
        timedOut: true,
      });
    }, CALL_TIMEOUT_MS);

    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      finish({ code, out, err, ms: Date.now() - started });
    });
  });
}

/** Run without budget abort (logout/close must still attempt). */
function runForce(args, timeoutMs = CALL_TIMEOUT_MS) {
  browserToolCalls += 1;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [mjs, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      cwd: root,
    });
    let out = "";
    let err = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGTERM");
      } catch {}
      resolve({ code: -1, out, err: "CALL_TIMEOUT", timedOut: true });
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, out, err, timedOut: false });
    });
  });
}

async function ev(fn, force = false) {
  const r = force
    ? await runForce(["browser", "evaluate", "--fn", fn])
    : await run(["browser", "evaluate", "--fn", fn]);
  if (r.timedOut && !force) return { parsed: null, ms: r.ms, raw: "", aborted: true };
  const text = (r.out || "").trim();
  const i = text.search(/[\{\[]/);
  let parsed = null;
  if (i >= 0) {
    try {
      parsed = JSON.parse(text.slice(i));
    } catch {}
  }
  return { parsed, ms: r.ms, raw: text };
}

async function snap(limit = 40) {
  const r = await run([
    "browser",
    "snapshot",
    "--efficient",
    "--limit",
    String(limit),
  ]);
  // Vazio só se ESTA chamada estourou OU a fase ATUAL está abortada.
  // Nunca descartar por aborted residual de fase anterior.
  if (r.timedOut) return { text: "", ms: r.ms, aborted: true };
  if (
    aborted &&
    aborted.phase === currentPhase &&
    (aborted.reason === "PHASE_TIMEOUT" ||
      aborted.reason === "CALL_TIMEOUT" ||
      aborted.reason === "TOTAL_TIMEOUT")
  ) {
    return { text: "", ms: r.ms, aborted: true };
  }
  return { text: r.out || "", ms: r.ms };
}

function refOf(text, re) {
  for (const line of String(text || "").split(/\n/)) {
    if (re.test(line)) {
      const m = line.match(/\[ref=(e\d+)\]/);
      if (m) return m[1];
    }
  }
  return null;
}

function optionContaining(text, re) {
  for (const line of String(text || "").split(/\n/)) {
    if (/option \"/.test(line) && re.test(line)) {
      const m = line.match(/option \"([^\"]+)/);
      if (m) return m[1];
    }
  }
  return null;
}

const sleep = (ms) =>
  new Promise((r) => {
    const n = Math.max(0, Number(ms) || 0);
    if (metricMark?.perf) {
      metricMark.perf.pollMs += n;
      metricMark.perf.waits += 1;
    }
    setTimeout(r, n);
  });

async function focusContentTab(force = false) {
  const tabs = force
    ? await runForce(["browser", "tabs"])
    : await run(["browser", "tabs"]);
  const text = tabs.out || "";
  let pick = null;
  const blocks = text.split(/\n(?=\d+\.)/);
  for (const block of blocks) {
    if (!/cruzeirodosul\.myvtex\.com/i.test(block)) continue;
    if (/recaptcha|doubleclick|criteo|serviceWorker|service_worker|fls\.|webworker/i.test(block))
      continue;
    const m = block.match(/\[use:\s*(t\d+)/);
    if (m) {
      if (/\/graduacao|\/grad-|\/p(\?|$)|checkout|account/i.test(block)) {
        pick = m[1];
        break;
      }
      if (!pick) pick = m[1];
    }
  }
  if (!pick) pick = "t1";
  if (force) await runForce(["browser", "focus", pick]);
  else await run(["browser", "focus", pick]);
  mark("FOCUS", { msg: pick });
  return pick;
}

function buildResultado() {
  const ok = !!(
    leadResult?.success &&
    offerResult?.success &&
    (orderOk || provaLink)
  );
  return ok ? "Sucesso" : "Falha";
}

function printHomologReport() {
  flushPhaseMetric();
  const totalMs = Date.now() - t0;
  const homologada = !!(
    orderOk &&
    lastPostOrderResult?.success &&
    lastCaptureResult?.success &&
    provaLink
  );
  const endedRunner =
    homologEnd?.runner ||
    (homologada
      ? "Logout"
      : lastCaptureResult && !lastCaptureResult.success
        ? "Capture"
        : lastPostOrderResult && !lastPostOrderResult.success
          ? "PostOrder"
          : lastCheckoutResult && !lastCheckoutResult.success
            ? "Checkout"
            : aborted?.phase || currentPhase || "—");
  const rootCause =
    homologEnd?.rootCause ||
    (!homologada && lastCaptureResult && !lastCaptureResult.success
      ? lastCaptureResult.code
      : null) ||
    (!homologada && lastPostOrderResult && !lastPostOrderResult.success
      ? lastPostOrderResult.code
      : null) ||
    (!homologada && lastCheckoutResult && !lastCheckoutResult.success
      ? lastCheckoutResult.code
      : null) ||
    aborted?.reason ||
    (homologada ? "OK" : "UNKNOWN");

  console.log("\n════════════════════════════════════════════════════════");
  console.log("  RELATÓRIO FINAL — Sprint Homologação");
  console.log("════════════════════════════════════════════════════════");
  console.log(`  1. Resultado              ${homologada ? "HOMOLOGADA" : "NÃO HOMOLOGADA"}`);
  console.log(`  2. Runner onde terminou   ${endedRunner}`);
  console.log(
    `  3. Último estado válido   ${homologEnd?.lastValid || (orderOk ? "ORDER_ID / orderPlaced" : "—")}`
  );
  console.log(`  4. Próximo esperado       ${homologEnd?.nextExpected || (homologada ? "fim" : "—")}`);
  console.log(`  5. Causa raiz             ${rootCause}`);
  console.log(`  8. Tempo total            ${secOf(totalMs)} s`);
  console.log("────────────────────────────────────────────────────────");
  console.log("  6–7. Tempo / Browser Calls por Runner");
  console.log("────────────────────────────────────────────────────────");
  console.log(
    "  Runner".padEnd(18) +
      "Tempo".padStart(7) +
      "Calls".padStart(7) +
      " waitC".padStart(7) +
      " snap".padStart(6) +
      " eval".padStart(6) +
      " clk".padStart(5) +
      " nav".padStart(5) +
      " waits".padStart(7)
  );
  for (const row of runnerMetrics) {
    if (row.runner === "start" || row.runner === "Close") continue;
    console.log(
      `  ${String(row.runner).padEnd(16)}` +
        `${String(row.sec + "s").padStart(7)}` +
        `${String(row.browserCalls).padStart(7)}` +
        `${String(secOf(row.waitConditionMs) + "s").padStart(7)}` +
        `${String(row.snapshots).padStart(6)}` +
        `${String(row.evaluates).padStart(6)}` +
        `${String(row.clicks).padStart(5)}` +
        `${String(row.navigates).padStart(5)}` +
        `${String(row.waits).padStart(7)}`
    );
  }
  console.log("────────────────────────────────────────────────────────");
  console.log("  Detalhe ms (browser / snap / eval / click / nav / poll / node)");
  for (const row of runnerMetrics) {
    if (row.runner === "start" || row.runner === "Close") continue;
    console.log(
      `  ${row.runner}: browser=${row.browserMs}ms snap=${row.snapshotMs}ms eval=${row.evaluateMs}ms click=${row.clickMs}ms nav=${row.navigateMs}ms poll=${row.pollMs}ms waitCond=${row.waitConditionMs}ms node=${row.nodeMs}ms`
    );
  }
  console.log("════════════════════════════════════════════════════════\n");
}

function emitAndExit(code) {
  if (finalizeDone) {
    process.exit(code);
    return;
  }
  finalizeDone = true;
  const resultado = buildResultado();
  const n8n = buildN8nPayload({
    resultado,
    nome: DATA.nome,
    email: DATA.email,
    curso: DATA.curso,
    modalidade: DATA.modalidade,
    numeroInscricao,
    linkProva: provaLink,
    tempoTotalSec: Math.round((Date.now() - t0) / 1000),
    browserToolCalls,
    logoutStatus,
    logoutDetail,
    browserStatus,
    browserDetail,
    authAttempts: authReport.attempts,
    authElapsedMs: authReport.elapsedMs,
    authCriterion: authReport.criterion,
    authEmail: authReport.authenticatedEmail,
    authAlreadyAuthenticated: authReport.alreadyAuthenticated,
    authCode: authReport.code,
    capturedAt: new Date().toISOString(),
  });

  printFriendlyReport(n8n);
  printHomologReport();

  const outPath = path.join(root, "demo-result.json");
  const full = {
    n8n,
    ok: resultado === "Sucesso",
    homologada: !!(orderOk && lastPostOrderResult?.success && lastCaptureResult?.success && provaLink),
    homologEnd,
    runnerMetrics,
    aborted,
    lead: leadResult
      ? {
          success: leadResult.success,
          elapsedMs: leadResult.elapsedMs,
          browserCalls: leadResult.browserCalls,
          valuesFound: leadResult.valuesFound,
        }
      : null,
    offer: offerResult
      ? {
          success: offerResult.success,
          elapsedMs: offerResult.elapsedMs,
          browserCalls: offerResult.browserCalls,
          valuesFound: offerResult.valuesFound,
        }
      : null,
    funnel: {
      orderOk,
      linkProva: provaLink,
      numeroInscricao,
      polo: offerResult?.valuesFound?.polo || null,
      gateCart: gateCartReason,
      gateAuth: gateAuthReason,
      authAttemptsUsed,
      auth: authReport,
    },
    metrics: {
      totalElapsedSec: n8n.tempoTotalSec,
      totalBrowserToolCalls: browserToolCalls,
      stageBrowserCalls,
      humanInterventions,
    },
    log,
    data: DATA,
    browserConfig: DEMO_BROWSER,
    authConfig: DEMO_AUTH,
  };
  fs.writeFileSync(outPath, JSON.stringify(full, null, 2));
  console.log(`JSON n8n → ${outPath}`);
  console.log(JSON.stringify(n8n, null, 2));
  process.exit(code);
}

async function logoutCandidate() {
  beginPhase("logout");
  try {
    await focusContentTab(true);
    // Prefer account page for Sair
    await runForce([
      "browser",
      "navigate",
      "https://cruzeirodosul.myvtex.com/account",
    ]);
    await sleep(2000);

    const clicked = await ev(
      `() => {
        const candidates = [...document.querySelectorAll('a,button,[role="button"]')];
        const sair = candidates.find(el => /^\\s*Sair\\s*$/i.test((el.textContent||'').trim()));
        if (sair) { sair.click(); return { ok: true, via: 'Sair' }; }
        const tm = document.querySelector('.cruzeirodosul-telemarketing-2-x-loginButton')
          || [...document.querySelectorAll('button')].find(b => /sair|logout|trocar/i.test(b.textContent||''));
        if (tm) { tm.click(); return { ok: true, via: 'telemarketing' }; }
        return { ok: false };
      }`,
      true
    );
    await sleep(2000);

    // Best-effort: clear telemarketing local session markers if still present
    await ev(
      `() => {
        try {
          const keys = Object.keys(localStorage || {});
          for (const k of keys) {
            if (/telemarketing|vtexid|user|auth/i.test(k)) {
              /* do not wipe all — only click-based logout above */
            }
          }
        } catch {}
        const body = document.body.innerText || '';
        return {
          hasEntrar: /Entrar como cliente/i.test(body),
          hasOla: /Olá/i.test(body),
          hasEmail: /${DATA.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/i.test(body)
        };
      }`,
      true
    );

    const verify = await ev(
      `() => {
        const body = document.body.innerText || '';
        return {
          hasEntrar: /Entrar como cliente/i.test(body),
          hasOla: /Olá/i.test(body),
          href: location.href
        };
      }`,
      true
    );

    if (clicked.parsed?.ok && (verify.parsed?.hasEntrar || !verify.parsed?.hasOla)) {
      logoutStatus = "ok";
      logoutDetail = `logout via ${clicked.parsed.via}`;
    } else if (clicked.parsed?.ok) {
      logoutStatus = "parcial";
      logoutDetail = `clique ${clicked.parsed.via}; sessão pode persistir`;
    } else {
      logoutStatus = "falha";
      logoutDetail = "botão Sair não encontrado";
    }
    mark("LOGOUT", { msg: `${logoutStatus} — ${logoutDetail}` });
  } catch (e) {
    logoutStatus = "falha";
    logoutDetail = String(e?.message || e);
    mark("LOGOUT", { msg: logoutDetail });
  }
}

async function inspectOpenClawBrowserOwnership() {
  const status = await runForce(["browser", "status", "--json"], 15000);
  const profiles = await runForce(["browser", "profiles", "--json"], 15000);
  const text = `${status.out || ""}\n${profiles.out || ""}`;
  let parsedStatus = null;
  let parsedProfiles = null;
  try {
    const i = (status.out || "").search(/[\{\[]/);
    if (i >= 0) parsedStatus = JSON.parse((status.out || "").slice(i));
  } catch {}
  try {
    const i = (profiles.out || "").search(/[\{\[]/);
    if (i >= 0) parsedProfiles = JSON.parse((profiles.out || "").slice(i));
  } catch {}

  const blob = JSON.stringify({ parsedStatus, parsedProfiles, text }).toLowerCase();
  const attachOnly =
    /attachonly["']?\s*:\s*true/.test(blob) || /attach-only|attach only/.test(blob);
  const external =
    /external-browser|ownership["']?\s*:\s*["']external/.test(blob) || attachOnly;
  const managed =
    /local-managed|driver["']?\s*:\s*["']openclaw/.test(blob) && !external;
  // Heurística adicional no texto humano do status
  const textManaged =
    /profile:\s*openclaw|userDataDir:.*openclaw|managed/i.test(text) &&
    !/attachOnly:\s*true/i.test(text);

  return {
    rawText: text.slice(0, 2000),
    parsedStatus,
    parsedProfiles,
    isAttachOnly: attachOnly,
    isExternal: external,
    isLocalManaged: managed || (textManaged && !attachOnly),
    running: /running["']?\s*:\s*true|cdp ready|running/i.test(blob),
  };
}

/**
 * Encerra APENAS o browser gerenciado pelo OpenClaw.
 * Nunca taskkill/Stop-Process por nome.
 * Se não for possível identificar com segurança → não fecha nada.
 */
async function closeBrowser() {
  beginPhase("close");
  try {
    if (!DEMO_BROWSER.closeOnFinish) {
      browserStatus = "mantido_aberto";
      browserDetail =
        "closeOnFinish=false — nenhum browser encerrado (opt-in necessário)";
      mark("BROWSER_CLOSE_SKIP", { msg: browserDetail });
      return;
    }

    const ownership = await inspectOpenClawBrowserOwnership();
    mark("BROWSER_OWNERSHIP", {
      msg: JSON.stringify({
        isLocalManaged: ownership.isLocalManaged,
        isExternal: ownership.isExternal,
        isAttachOnly: ownership.isAttachOnly,
        running: ownership.running,
      }),
    });

    if (ownership.isExternal || ownership.isAttachOnly) {
      browserStatus = "mantido_aberto";
      browserDetail =
        "perfil external/attachOnly — NÃO chamar browser stop (protege navegador do usuário)";
      mark("BROWSER_CLOSE_SKIP", { msg: browserDetail });
      return;
    }

    if (!ownership.isLocalManaged) {
      browserStatus = "mantido_aberto";
      browserDetail =
        "ownership incerto — NÃO encerrar browser algum (fail-safe)";
      mark("BROWSER_CLOSE_SKIP", { msg: browserDetail });
      return;
    }

    // Somente API oficial OpenClaw para perfil local-managed
    const stop = await runForce(["browser", "stop"], 20000);
    await sleep(500);
    const statusAfter = await runForce(["browser", "status", "--json"], 15000);
    const afterText = (statusAfter.out || "") + (statusAfter.err || "");
    const stillRunning =
      /"running"\s*:\s*true/i.test(afterText) ||
      (/running/i.test(afterText) && !/not running|stopped|"running"\s*:\s*false/i.test(afterText));

    if (stop.code === 0 && !stillRunning) {
      browserStatus = "fechado";
      browserDetail = "openclaw browser stop (perfil local-managed confirmado)";
    } else if (stop.code === 0) {
      browserStatus = "parcial";
      browserDetail = "browser stop retornou ok; status ainda ambiguo";
    } else {
      browserStatus = "erro";
      browserDetail = `browser stop falhou code=${stop.code}`;
    }
    mark("BROWSER_STOP", { msg: `${browserStatus} — ${browserDetail}` });
  } catch (e) {
    browserStatus = "erro";
    browserDetail = String(e?.message || e);
    mark("BROWSER_CLOSE_SKIP", {
      msg: `exceção — nenhum kill global; ${browserDetail}`,
    });
  }
}

async function finalize(code) {
  if (!finalizeDone) {
    // Runner determinístico já faz logout; só executa se ainda não feito
    if (logoutStatus === "nao_executado") {
      await logoutCandidate();
    }
    await closeBrowser();
  }
  emitAndExit(code);
}

// --- start ---
beginPhase("start");
await run(["browser", "start"]);
await focusContentTab();
if (aborted) await finalize(2);

st = await ev(`() => ({
  href: location.href,
  hasEntrar: /Entrar como cliente/i.test(document.body.innerText||''),
  ola: /Olá/i.test(document.body.innerText||''),
  emailShown: new RegExp(${JSON.stringify(DATA.email.split("@")[0])}, 'i').test(document.body.innerText||'')
})`);
mark("WHERE", { href: st.parsed?.href, msg: JSON.stringify(st.parsed) });

// Entrada genérica (sem slug de curso)
if (!/cruzeirodosul\.myvtex\.com/i.test(st.parsed?.href || "")) {
  await run(["browser", "navigate", "https://cruzeirodosul.myvtex.com/graduacao"]);
  await sleep(3000);
  await focusContentTab();
} else if (!/myvtex\.com/i.test(st.parsed?.href || "")) {
  await run(["browser", "navigate", "https://cruzeirodosul.myvtex.com/graduacao"]);
  await sleep(3000);
  await focusContentTab();
} else if (/about:blank/i.test(st.parsed?.href || "")) {
  await run(["browser", "navigate", "https://cruzeirodosul.myvtex.com/graduacao"]);
  await sleep(3000);
  await focusContentTab();
}

const authResult = await runOkAsContract(
  () => browserToolCalls,
  () =>
    ensureCandidateAuthenticated(
      { email: DATA.email },
      {
        evaluate: ev,
        sleep,
        mark,
        beginPhase,
        checkBudgets,
        config: DEMO_AUTH,
      }
    )
);

authAttemptsUsed = authResult.attempts;
gateAuthReason = authResult.success
  ? authResult.criterion
  : authResult.code || "GATE_AUTH_TIMEOUT";
authReport = {
  attempts: authResult.attempts,
  elapsedMs: authResult.ms,
  criterion: authResult.criterion,
  authenticatedEmail: authResult.authenticatedEmail,
  alreadyAuthenticated: !!authResult.alreadyAuthenticated,
  code: authResult.code,
  browserCalls: authResult.browserCalls,
};
mark("AUTH_SUMMARY", {
  msg: JSON.stringify(authReport),
});

if (!authResult.success) {
  humanInterventions += 1;
  await finalize(2);
}
if (aborted) await finalize(2);

// Busca do curso + validação por conteúdo (nunca por slug/URL)
beginPhase("search_pdp");
const cursoJson = JSON.stringify(DATA.curso);

async function validatePdpByContent() {
  return ev(`() => {
    const curso = ${cursoJson};
    const norm = (s) => String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\\u0300-\\u036f]/g, '')
      .replace(/\\s+/g, ' ')
      .trim();
    const target = norm(curso);
    const words = target.split(' ').filter((w) => w.length > 2);
    const h1 = document.querySelector('h1');
    const h1Text = (h1 && h1.textContent) || '';
    const nameEl =
      document.querySelector('[class*="productName"]') ||
      document.querySelector('[class*="product-name"]') ||
      document.querySelector('.vtex-store-components-3-x-productNameContainer');
    const productText = (nameEl && nameEl.textContent) || '';
    const h1n = norm(h1Text);
    const pn = norm(productText);
    const matchText = (t) =>
      (t && t.includes(target)) ||
      (words.length > 0 && words.every((w) => t.includes(w)));
    const ok = matchText(h1n) || matchText(pn);
    return {
      ok,
      via: matchText(h1n) ? 'h1' : matchText(pn) ? 'productName' : null,
      h1: h1Text.trim().slice(0, 160),
      productName: productText.trim().slice(0, 160),
      href: location.href,
      curso
    };
  }`);
}

// Já na PDP correta por conteúdo? pula busca
let pdpCheck = await validatePdpByContent();
if (pdpCheck.parsed?.ok) {
  mark("PDP_CONTENT_OK", {
    msg: JSON.stringify(pdpCheck.parsed),
  });
} else {
  mark("SEARCH_COURSE", { msg: DATA.curso });
  // SERP genérica por termo (sem slug fixo)
  const q = encodeURIComponent(DATA.curso);
  await run([
    "browser",
    "navigate",
    `https://cruzeirodosul.myvtex.com/${q}?_q=${q}&map=ft`,
  ]);
  await sleep(4000);
  await focusContentTab();

  const opened = await ev(`() => {
    const curso = ${cursoJson};
    const norm = (s) => String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\\u0300-\\u036f]/g, '')
      .replace(/\\s+/g, ' ')
      .trim();
    const target = norm(curso);
    const words = target.split(' ').filter((w) => w.length > 2);
    const score = (text, href) => {
      const t = norm(text);
      let s = 0;
      if (t.includes(target)) s += 100;
      for (const w of words) if (t.includes(w)) s += 20;
      if (/\\/p(\\/|$|\\?)/i.test(href)) s += 10;
      if (/pos-|pos_|livre|medicina/i.test(href + t) && !/gestao|grad/i.test(target)) s -= 5;
      // preferir graduação quando o termo não indica pós
      if (/grad-/i.test(href) || /graduacao|bacharel|tecnologo|tecnológico/i.test(t)) s += 15;
      if (/pos-grad|pós-grad|especializa/i.test(t) && !/pos/i.test(target)) s -= 30;
      return s;
    };
    const candidates = [...document.querySelectorAll('a[href]')]
      .map((a) => ({
        el: a,
        href: a.href || '',
        text: (a.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 160)
      }))
      .filter((a) => /cruzeirodosul\\.myvtex\\.com/i.test(a.href) && /\\/p(\\/|$|\\?)/i.test(a.href))
      .map((a) => ({ ...a, s: score(a.text, a.href) }))
      .filter((a) => a.s >= 40)
      .sort((a, b) => b.s - a.s);

    if (!candidates.length) {
      // fallback: primeiro card /p cujo texto contenha alguma palavra do curso
      const loose = [...document.querySelectorAll('a[href]')]
        .filter((a) => /\\/p(\\/|$|\\?)/i.test(a.href || ''))
        .find((a) => {
          const t = norm(a.textContent || '');
          return words.some((w) => t.includes(w));
        });
      if (loose) {
        const href = loose.href;
        const text = (loose.textContent || '').trim().slice(0, 160);
        loose.click();
        return { ok: true, href, text, mode: 'loose' };
      }
      return { ok: false, href: location.href, candidates: 0 };
    }
    const best = candidates[0];
    best.el.click();
    return {
      ok: true,
      href: best.href,
      text: best.text,
      score: best.s,
      mode: 'scored',
      top: candidates.slice(0, 3).map((c) => ({ text: c.text, score: c.s, href: c.href }))
    };
  }`);
  mark("OPEN_COURSE_RESULT", { msg: JSON.stringify(opened.parsed) });
  await sleep(4500);
  await focusContentTab();

  pdpCheck = await validatePdpByContent();
  mark("PDP_CONTENT", { msg: JSON.stringify(pdpCheck.parsed) });
  if (!pdpCheck.parsed?.ok) {
    humanInterventions += 1;
    mark("PDP_CONTENT_FAIL", {
      msg: JSON.stringify({
        curso: DATA.curso,
        page: pdpCheck.parsed,
      }),
    });
    await finalize(2);
  }
  mark("PDP_CONTENT_OK", { msg: JSON.stringify(pdpCheck.parsed) });
}

beginPhase("wait_lead");
let leadReady = false;
for (let i = 0; i < 8; i++) {
  if (!checkBudgets()) break;
  const ready = await ev(`() => {
    const btn = [...document.querySelectorAll('button')].find(b =>
      b.offsetParent && /^\\s*Inscreva-se\\s*$/i.test((b.textContent||'').trim())
    );
    const names = [...document.querySelectorAll('input')].filter(i => i.offsetParent).map(i => i.name||'');
    const hasLead = ['completeName','email','cellphone'].every(n => names.includes(n));
    const text = ((btn && btn.textContent) || '').trim();
    return { ready: hasLead && /^Inscreva-se$/i.test(text), hasLead, btnText: text || null };
  }`);
  mark("WAIT_LEAD", { msg: JSON.stringify(ready.parsed) });
  if (ready.parsed?.ready) {
    leadReady = true;
    break;
  }
  await sleep(1500);
}
if (!leadReady) {
  humanInterventions += 1;
  await finalize(2);
}

beginPhase("lead");
leadResult = await runStageAsContract(
  () => browserToolCalls,
  () =>
    runStageTransaction("lead-pdp", {
      nome: DATA.nome,
      email: DATA.email,
      telefone: DATA.telefone,
    })
);
stageBrowserCalls += leadResult.browserCalls || 0;
browserToolCalls += leadResult.browserCalls || 0;
mark("STAGE_LEAD_DONE", {
  msg: JSON.stringify({
    success: leadResult.success,
    code: leadResult.code,
    ms: leadResult.ms,
    calls: leadResult.browserCalls,
  }),
});
if (!leadResult.success || aborted) await finalize(2);

s = await snap(30);
const cta = refOf(s.text, /button \"Inscreva-se\"/);
if (cta) await run(["browser", "click", cta]);
else {
  await ev(`() => {
    const btn = document.querySelector('button.cruzeirodosul-product-purchase-box-0-x-cta_p1')
      || [...document.querySelectorAll('button')].find(b => /^\\s*Inscreva-se\\s*$/i.test((b.textContent||'').trim()));
    if (btn) btn.click();
    return { ok: !!btn };
  }`);
}
mark("AGENT_CTA");
await sleep(3000);

let after = await ev(`() => ({
  hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||'')
})`);
if (!after.parsed?.hasPolo) {
  await sleep(1200);
  s = await snap(30);
  const cta2 = refOf(s.text, /button \"Inscreva-se\"/);
  if (cta2) await run(["browser", "click", cta2]);
  await sleep(2500);
  after = await ev(`() => ({
    hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(document.body.innerText||'')
  })`);
}
if (!after.parsed?.hasPolo) {
  humanInterventions += 1;
  await finalize(2);
}

beginPhase("offer");
offerResult = await runStageAsContract(
  () => browserToolCalls,
  () =>
    runStageTransaction("offer-selection", {
      pais: "Brasil",
      cep: DATA.cep,
      estado: DATA.estado,
      cidade: DATA.cidade,
      poloPrefix: DATA.poloPrefix,
      formaIngresso: DATA.formaIngresso,
    })
);
stageBrowserCalls += offerResult.browserCalls || 0;
browserToolCalls += offerResult.browserCalls || 0;
mark("STAGE_OFFER_DONE", {
  msg: JSON.stringify({
    success: offerResult.success,
    code: offerResult.code,
    ms: offerResult.ms,
    calls: offerResult.browserCalls,
    polo: offerResult.valuesFound?.polo,
  }),
});
if (!offerResult.success || aborted) await finalize(2);

beginPhase("post_offer");
s = await snap(50);
let nec = refOf(s.text, /combobox \"Possui alguma necessidade/);
if (nec) {
  const necLabel =
    optionContaining(s.text, /Não necessito/) || DATA.necessidade;
  await run(["browser", "select", nec, necLabel]);
}
s = await snap(25);
let cont = refOf(s.text, /button \"Continuar inscrição\"/);

// --- Telemetria só em torno do Continuar (não altera Gate/checkout) ---
beginPhase("continuar_telemetry");
mark("CONTINUAR_TELEMETRY_START");

// 1) Instala hooks ANTES do clique
await ev(`() => {
  const w = window;
  if (w.__continuarTelemetry) return { already: true };
  w.__continuarTelemetry = {
    installedAt: Date.now(),
    fetch: [],
    xhr: [],
    consoleErrors: [],
    urlTimeline: [{ t: 0, href: location.href }],
    errorsSeen: [],
    toasts: [],
    validations: [],
    buttonTimeline: [],
    orderFormTimeline: []
  };
  const T = w.__continuarTelemetry;
  const t0 = Date.now();
  const stamp = () => Date.now() - t0;

  const origFetch = w.fetch && w.fetch.bind(w);
  if (origFetch) {
    w.fetch = async function (...args) {
      const input = args[0];
      const url = typeof input === 'string' ? input : (input && input.url) || String(input);
      const method = (args[1] && args[1].method) || (input && input.method) || 'GET';
      const entry = { t: stamp(), type: 'fetch', method, url: String(url).slice(0, 500) };
      T.fetch.push(entry);
      try {
        const res = await origFetch(...args);
        entry.status = res.status;
        entry.ok = res.ok;
        return res;
      } catch (e) {
        entry.error = String(e && e.message || e);
        throw e;
      }
    };
  }

  const XO = w.XMLHttpRequest;
  if (XO) {
    const open = XO.prototype.open;
    const send = XO.prototype.send;
    XO.prototype.open = function (method, url, ...rest) {
      this.__ctMeta = { method, url: String(url).slice(0, 500) };
      return open.call(this, method, url, ...rest);
    };
    XO.prototype.send = function (...rest) {
      const meta = this.__ctMeta || {};
      const entry = { t: stamp(), type: 'xhr', method: meta.method, url: meta.url };
      T.xhr.push(entry);
      this.addEventListener('loadend', () => {
        entry.status = this.status;
        entry.responseURL = (this.responseURL || '').slice(0, 500);
      });
      return send.apply(this, rest);
    };
  }

  const origErr = console.error;
  console.error = function (...args) {
    try {
      T.consoleErrors.push({
        t: stamp(),
        msg: args.map(a => {
          try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); }
        }).join(' ').slice(0, 800)
      });
    } catch {}
    return origErr.apply(console, args);
  };

  let lastHref = location.href;
  T.__urlTimer = setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      T.urlTimeline.push({ t: stamp(), href: lastHref });
    }
  }, 400);

  return { installed: true };
}`);

// 2) Estado do botão ANTES do clique
const beforeContinuar = await ev(`() => {
  const b = [...document.querySelectorAll('button')].find(btn =>
    /Continuar inscrição/i.test((btn.textContent || '').trim())
  );
  if (!b) return { found: false };
  const cs = getComputedStyle(b);
  const text = (b.textContent || '').trim();
  const cls = String(b.className || '');
  const disabledAttr = b.disabled === true;
  const ariaDisabled = b.getAttribute('aria-disabled');
  const loading =
    /loading|spinner|carregando|pointer-events-none/i.test(cls + ' ' + text) ||
    !!b.querySelector('[class*="spinner"],[class*="loading"],svg[class*="spin"]') ||
    /carregando/i.test(text);
  const enabled = !disabledAttr && ariaDisabled !== 'true' && cs.pointerEvents !== 'none';
  return {
    found: true,
    before: {
      text,
      enabled,
      disabled: disabledAttr,
      ariaDisabled,
      classes: cls.slice(0, 400),
      loading,
      pointerEvents: cs.pointerEvents,
      opacity: cs.opacity,
      type: b.type || null
    }
  };
}`);
mark("CONTINUAR_BEFORE", { msg: JSON.stringify(beforeContinuar.parsed) });

// 3) Clique
if (cont) await run(["browser", "click", cont]);
else {
  await ev(`() => {
    const b = [...document.querySelectorAll('button')].find(x =>
      /Continuar inscrição/i.test((x.textContent||'').trim()));
    if (b) b.click();
    return { ok: !!b };
  }`);
}
mark("AGENT_CONTINUAR");

// 4) Monitora até 30s
const TELEMETRY_MS = 30000;
const TELEMETRY_POLL_MS = 1500;
const telStarted = Date.now();
const telemetrySamples = [];
while (Date.now() - telStarted < TELEMETRY_MS) {
  if (!checkBudgets()) break;
  const sample = await ev(`() => {
    const T = window.__continuarTelemetry || null;
    const href = location.href;
    const body = document.body.innerText || '';
    const btn = [...document.querySelectorAll('button')].find(b =>
      /Continuar inscrição/i.test((b.textContent || '').trim())
    );
    let itemCount = 0;
    let orderFormId = null;
    try {
      const of = window.vtexjs && window.vtexjs.checkout && window.vtexjs.checkout.orderForm;
      if (of) {
        orderFormId = of.orderFormId || null;
        itemCount = Array.isArray(of.items) ? of.items.length : 0;
      }
    } catch {}

    const errorMsgs = [];
    for (const el of [...document.querySelectorAll('[class*="error"],[class*="Error"],[role="alert"],.c-danger')].slice(0, 12)) {
      const t = (el.textContent || '').trim().replace(/\\s+/g, ' ');
      if (t && t.length < 240) errorMsgs.push(t);
    }
    const toasts = [...document.querySelectorAll('[class*="toast"],[class*="Toast"],[class*="snackbar"],[class*="notification"]')]
      .map(el => (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 200))
      .filter(Boolean)
      .slice(0, 8);

    const validationHints = [];
    if (/obrigat|preencha|inválid|selecione|necessário/i.test(body)) {
      const m = body.match(/.{0,40}(obrigat\\w*|preencha\\w*|inválid\\w*|selecione\\w*|necessário\\w*).{0,60}/gi);
      if (m) validationHints.push(...m.slice(0, 8));
    }

    let buttonNow = null;
    if (btn) {
      buttonNow = {
        text: (btn.textContent || '').trim().slice(0, 80),
        disabled: btn.disabled === true,
        ariaDisabled: btn.getAttribute('aria-disabled'),
        classes: String(btn.className || '').slice(0, 300),
        loading: /loading|carregando|spinner/i.test(String(btn.className || '') + (btn.textContent || ''))
      };
    }

    if (T) {
      const t = Date.now() - (T.installedAt || Date.now());
      T.buttonTimeline.push({ t, buttonNow });
      T.orderFormTimeline.push({ t, itemCount, orderFormId });
      T.errorsSeen = [...new Set([...(T.errorsSeen || []), ...errorMsgs])].slice(0, 20);
      T.toasts = [...new Set([...(T.toasts || []), ...toasts])].slice(0, 12);
      T.validations = [...new Set([...(T.validations || []), ...validationHints])].slice(0, 12);
    }

    return {
      href,
      onCheckout: /\\/checkout/i.test(href),
      itemCount,
      orderFormId,
      buttonNow,
      errorMsgs: errorMsgs.slice(0, 8),
      toasts: toasts.slice(0, 6),
      validationHints: validationHints.slice(0, 6),
      fetchCount: T ? T.fetch.length : 0,
      xhrCount: T ? T.xhr.length : 0,
      consoleErrorCount: T ? T.consoleErrors.length : 0,
      urlTimeline: T ? T.urlTimeline.slice(-6) : [],
      recentFetch: T ? T.fetch.slice(-8) : [],
      recentXhr: T ? T.xhr.slice(-8) : [],
      recentConsoleErrors: T ? T.consoleErrors.slice(-6) : []
    };
  }`);
  if (sample.parsed) {
    sample.parsed.elapsedMs = Date.now() - telStarted;
    telemetrySamples.push(sample.parsed);
    mark("CONTINUAR_TELEMETRY_TICK", {
      msg: JSON.stringify({
        elapsedMs: sample.parsed.elapsedMs,
        href: sample.parsed.href,
        itemCount: sample.parsed.itemCount,
        fetchCount: sample.parsed.fetchCount,
        xhrCount: sample.parsed.xhrCount,
        errors: sample.parsed.errorMsgs,
        toasts: sample.parsed.toasts,
        button: sample.parsed.buttonNow,
      }),
    });
  }
  await sleep(TELEMETRY_POLL_MS);
}

const telemetryFinal = await ev(`() => {
  const T = window.__continuarTelemetry || {};
  if (T.__urlTimer) try { clearInterval(T.__urlTimer); } catch {}
  let itemCount = 0;
  let orderFormId = null;
  try {
    const of = window.vtexjs && window.vtexjs.checkout && window.vtexjs.checkout.orderForm;
    if (of) {
      orderFormId = of.orderFormId || null;
      itemCount = Array.isArray(of.items) ? of.items.length : 0;
    }
  } catch {}
  return {
    href: location.href,
    itemCount,
    orderFormId,
    fetch: T.fetch || [],
    xhr: T.xhr || [],
    consoleErrors: T.consoleErrors || [],
    urlTimeline: T.urlTimeline || [],
    errorsSeen: T.errorsSeen || [],
    toasts: T.toasts || [],
    validations: T.validations || [],
    buttonTimeline: (T.buttonTimeline || []).slice(-15),
    orderFormTimeline: (T.orderFormTimeline || []).slice(-15),
    bodySnippet: (document.body.innerText || '').slice(0, 1200)
  };
}`);

const continuarTelemetry = {
  capturedAt: new Date().toISOString(),
  before: beforeContinuar.parsed || null,
  clickRef: cont || null,
  monitorMs: TELEMETRY_MS,
  samples: telemetrySamples,
  final: telemetryFinal.parsed || null,
};
fs.writeFileSync(
  path.join(root, "continuar-telemetry.json"),
  JSON.stringify(continuarTelemetry, null, 2)
);
mark("CONTINUAR_TELEMETRY_DONE", {
  msg: JSON.stringify({
    file: "continuar-telemetry.json",
    href: telemetryFinal.parsed?.href,
    itemCount: telemetryFinal.parsed?.itemCount,
    fetch: telemetryFinal.parsed?.fetch?.length || 0,
    xhr: telemetryFinal.parsed?.xhr?.length || 0,
    errors: telemetryFinal.parsed?.errorsSeen || [],
    validations: telemetryFinal.parsed?.validations || [],
  }),
});

// --- Gate Agent: confirmar carrinho ANTES de ir ao profile ---
beginPhase("gate_cart");
const GATE_CART_MAX_MS = PHASE_MAX_MS.gate_cart;
const GATE_CART_POLL_MS = 2000;
const gateStarted = Date.now();
let cartReady = false;
let gateProbe = null;

while (Date.now() - gateStarted < GATE_CART_MAX_MS) {
  if (!checkBudgets()) break;
  gateProbe = await ev(`() => {
    const href = location.href || '';
    const body = document.body.innerText || '';
    const emptyCart = /carrinho está vazio/i.test(body);
    const onCheckout = /\\/checkout/i.test(href);
    let itemCount = 0;
    try {
      const of =
        (window.vtexjs && window.vtexjs.checkout && window.vtexjs.checkout.orderForm) ||
        null;
      if (of && Array.isArray(of.items)) itemCount = of.items.length;
    } catch {}
    const hasProfileField = !!document.getElementById('client-first-name');
    const visualProduct =
      onCheckout &&
      !emptyCart &&
      (/Ir para o Endereço/i.test(body) ||
        /Resumo|Meu Carrinho|Gestão de Recursos Humanos|Graduação/i.test(body));
    const viaRedirect = onCheckout && !emptyCart && (itemCount > 0 || visualProduct || hasProfileField);
    const viaOrderForm = itemCount > 0;
    const ready = viaOrderForm || viaRedirect;
    return {
      ready,
      viaRedirect,
      viaOrderForm,
      href,
      emptyCart,
      onCheckout,
      itemCount,
      hasProfileField,
      visualProduct
    };
  }`);
  mark("GATE_CART_PROBE", { msg: JSON.stringify(gateProbe.parsed) });
  if (gateProbe.parsed?.ready) {
    cartReady = true;
    gateCartReason = gateProbe.parsed.viaOrderForm
      ? "orderForm.items"
      : gateProbe.parsed.viaRedirect
        ? "checkout_redirect_non_empty"
        : "cart_ready";
    mark("GATE_CART_READY", { msg: gateCartReason, href: gateProbe.parsed.href });
    break;
  }
  // Still on PDP with validation errors — keep polling until timeout
  await sleep(GATE_CART_POLL_MS);
}

if (!cartReady) {
  gateCartReason = "GATE_CART_NOT_READY";
  mark("GATE_CART_NOT_READY", {
    msg: JSON.stringify({
      elapsedMs: Date.now() - gateStarted,
      last: gateProbe?.parsed || null,
      note: "abort — sem navigate para checkout vazio",
    }),
  });
  humanInterventions += 1;
  await finalize(2);
}

// A partir daqui: Runners determinísticos (sem decisões de Agent/LLM)
// Fronteiras por objetivo de negócio: Checkout(ORDER_ID) → PostOrder → Capture
const runnerCtx = {
  evaluate: ev,
  run,
  snap,
  sleep,
  mark,
  beginPhase,
  checkBudgets,
  refOf,
  focusContentTab,
  recordWaitCondition,
};

mark("RUNNER_HANDOFF", {
  msg: "Gate Cart OK → Checkout → PostOrder → Capture",
});

const checkoutResult = await runOkAsContract(
  () => browserToolCalls,
  () =>
    runCheckout(
      {
        first: DATA.first,
        last: DATA.last,
        cpf: DATA.cpf,
        telefone: DATA.telefone,
        birth: DATA.birth,
        cep: DATA.cep,
        curso: DATA.curso,
        semNumero: true,
        timeouts: {
          profileReadyMs: 30000,
          orderConfirmMs: 60000,
          pollMs: 2000,
        },
      },
      runnerCtx
    )
);

lastCheckoutResult = checkoutResult;
orderOk = !!checkoutResult.orderOk;
mark("CHECKOUT_DONE", {
  msg: JSON.stringify({
    success: checkoutResult.success,
    code: checkoutResult.code,
    ms: checkoutResult.ms,
    browserCalls: checkoutResult.browserCalls,
    orderId: checkoutResult.orderId,
    via: checkoutResult.confirmationVia,
    href: checkoutResult.orderHref,
  }),
});

if (!checkoutResult.success) {
  humanInterventions += 1;
  homologEnd = {
    runner: "Checkout",
    lastValid: "Gate Cart",
    nextExpected: "ORDER_ID / orderPlaced",
    rootCause: checkoutResult.code,
  };
  mark("AGENT_EXCEPTION", {
    msg: JSON.stringify({
      from: "checkoutRunner",
      code: checkoutResult.code,
      detail: checkoutResult.detail || null,
    }),
  });
  await finalize(2);
}

const postOrderResult = await runOkAsContract(
  () => browserToolCalls,
  () =>
    runPostOrder(
      {
        orderId: checkoutResult.orderId,
        observeContinuarProcesso: OBSERVE_CONTINUAR_PROCESSO,
        runnerMetrics,
        timeouts: {
          minhasInscricoesMs: 45000,
          pollMs: 2000,
          obsPollMs: 1000,
          obsStabilizeMs: 45000,
        },
      },
      runnerCtx
    )
);

lastPostOrderResult = postOrderResult;

mark("POST_ORDER_DONE", {
  msg: JSON.stringify({
    success: postOrderResult.success,
    code: postOrderResult.code,
    ms: postOrderResult.ms,
    browserCalls: postOrderResult.browserCalls,
    openedNewTab: postOrderResult.openedNewTab,
    tabId: postOrderResult.tabId,
    href: postOrderResult.href,
  }),
});

if (postOrderResult.code === "POST_ORDER_CONTINUAR_PROCESSO_OBS") {
  flushPhaseMetric();
  const cp = postOrderResult.detail?.report?.continuarProcesso || {};
  console.log("\n────────────────────────────────────────────────────────");
  console.log("  OBSERVAÇÃO — Continuar Processo");
  console.log("────────────────────────────────────────────────────────");
  console.log(`  Nova aba criada?           ${cp.novaAbaCriada ? "sim" : "não"}`);
  console.log(`  Id da nova aba             ${cp.idNovaAba || "—"}`);
  console.log(`  URL inicial                ${cp.urlInicial || "—"}`);
  console.log(`  URL final                  ${cp.urlFinal || "—"}`);
  console.log(
    `  Tempo para abrir            ${cp.tempoParaAbrirMs != null ? cp.tempoParaAbrirMs + " ms" : "—"}`
  );
  console.log(
    `  Tempo para estabilizar      ${cp.tempoParaEstabilizarMs != null ? cp.tempoParaEstabilizarMs + " ms" : "—"}`
  );
  console.log(
    `  Tempo até Minhas Inscrições ${cp.tempoAteMinhasInscricoesMs != null ? cp.tempoAteMinhasInscricoesMs + " ms" : "—"}`
  );
  console.log(`  Foco automático?           ${cp.focoAutomatico ? "sim" : "não"}`);
  console.log(
    `  Aba antiga permaneceu?      ${cp.abaAntigaPermaneceuAberta ? "sim" : "não"}`
  );
  console.log(`  Relatório JSON              ${postOrderResult.detail?.reportPath || "—"}`);
  console.log("────────────────────────────────────────────────────────\n");
  homologEnd = {
    runner: "PostOrder",
    lastValid: "Continuar Processo observado",
    nextExpected: "Capture (desligado em modo obs)",
    rootCause: "POST_ORDER_CONTINUAR_PROCESSO_OBS",
  };
  await finalize(0);
}

if (!postOrderResult.success) {
  humanInterventions += 1;
  homologEnd = {
    runner: "PostOrder",
    lastValid: `ORDER_ID ${checkoutResult.orderId || ""}`.trim(),
    nextExpected: "Minhas Inscrições (aba correta focada)",
    rootCause: postOrderResult.code,
  };
  mark("AGENT_EXCEPTION", {
    msg: JSON.stringify({
      from: "postOrderRunner",
      code: postOrderResult.code,
      detail: postOrderResult.detail || null,
    }),
  });
  await finalize(2);
}

const captureResult = await runOkAsContract(
  () => browserToolCalls,
  () =>
    runCapture(
      {
        orderId: checkoutResult.orderId,
        timeouts: {
          enrollmentPollMs: 30000,
          stabilizeMs: 20000,
          provaMs: 30000,
          pollMs: 2000,
        },
      },
      runnerCtx
    )
);

lastCaptureResult = captureResult;

provaLink = captureResult.provaLink || null;
numeroInscricao = captureResult.numeroInscricao || null;

mark("CAPTURE_DONE", {
  msg: JSON.stringify({
    success: captureResult.success,
    code: captureResult.code,
    ms: captureResult.ms,
    browserCalls: captureResult.browserCalls,
    provaLink: !!captureResult.provaLink,
    inscr: captureResult.numeroInscricao,
    opened: false,
  }),
});

if (!captureResult.success) {
  humanInterventions += 1;
  const stepMap = {
    CAPTURE_NOT_ON_MINHAS: {
      lastValid: "PostOrder / foco Minhas Inscrições",
      nextExpected: "Confirmar Minhas Inscrições",
    },
    CAPTURE_INSCRICAO_NOT_FOUND: {
      lastValid: "Minhas Inscrições",
      nextExpected: "Inscrição / orderId visível",
    },
    CAPTURE_ACOMPANHAR_NOT_FOUND: {
      lastValid: "Inscrição localizada",
      nextExpected: "Click Acompanhar Inscrição",
    },
    CAPTURE_STABILIZE_TIMEOUT: {
      lastValid: "Acompanhar clicado",
      nextExpected: "Página de acompanhamento estável",
    },
    CAPTURE_PROVA_LINK_NOT_FOUND: {
      lastValid: "Acompanhar Inscrição",
      nextExpected: "href de Acessar prova",
    },
  };
  const mapped = stepMap[captureResult.code] || {
    lastValid: "Minhas Inscrições",
    nextExpected: "Capture completa",
  };
  homologEnd = {
    runner: "Capture",
    lastValid: mapped.lastValid,
    nextExpected: mapped.nextExpected,
    rootCause: captureResult.code,
  };
  mark("AGENT_EXCEPTION", {
    msg: JSON.stringify({
      from: "captureRunner",
      code: captureResult.code,
      detail: captureResult.detail || null,
    }),
  });
  await finalize(2);
}

homologEnd = {
  runner: "Logout",
  lastValid: "provaLink capturado (não aberto)",
  nextExpected: "fim",
  rootCause: "OK",
};

const ok = buildResultado() === "Sucesso";
await finalize(ok ? 0 : 2);
