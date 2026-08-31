const STEP_LABELS = {
  catalog_resolved: "Catálogo resolvido",
  address_resolved: "Endereço (CEP) resolvido",
  session_created: "Sessão criada",
  orderform_created: "Sessão / orderForm",
  lead_created: "Lead criado",
  pole_configured: "Polo configurado",
  ingress_configured: "Forma de ingresso configurada",
  cart_created: "Carrinho criado",
  checkout_completed: "Checkout concluído",
  enem_notes: "Notas do ENEM enviadas",
  siaa_matricula: "Matrícula SIAA iniciada",
  enrollment_created: "Inscrição criada",
  dry_run: "Simulação (dry-run)",
};

const form = document.getElementById("form");
const typeEl = document.getElementById("type");
const typeNote = document.getElementById("type-note");
const coursesList = document.getElementById("courses");
const polesList = document.getElementById("poles");
const extra = document.getElementById("extra-fields");
const stepsEl = document.getElementById("steps");
const errorEl = document.getElementById("error");
const resultEl = document.getElementById("result");
const banner = document.getElementById("mode-banner");
const submitBtn = document.getElementById("submit");

let types = [];

async function loadStatus() {
  const r = await fetch("/api/status");
  const data = await r.json();
  banner.hidden = false;
  if (data.allowRealEnrollments) {
    banner.className = "mode real";
    banner.textContent = "Inscrições REAIS habilitadas";
  } else {
    banner.className = "mode dry";
    banner.textContent = "Modo teste — não cria inscrição real";
  }
}

async function loadTypes() {
  const r = await fetch("/api/enrollment-types");
  const data = await r.json();
  types = data.types || [];
  typeEl.innerHTML = types
    .map((t) => `<option value="${t.id}">${t.label}${t.homologated ? "" : " (não homologado)"}</option>`)
    .join("");
  onTypeChange();
}

async function loadCourses(department) {
  const q = new URLSearchParams({ department: department || "", limit: "80" });
  const r = await fetch(`/api/catalog/courses?${q}`);
  const data = await r.json();
  coursesList.innerHTML = (data.courses || [])
    .map((c) => `<option value="${c.name}"></option>`)
    .join("");
}

async function loadPoles() {
  const r = await fetch("/api/catalog/poles?limit=80");
  const data = await r.json();
  polesList.innerHTML = (data.poles || [])
    .map((p) => `<option value="${p.short}">${p.name}</option>`)
    .join("");
}

function onTypeChange() {
  const t = types.find((x) => x.id === typeEl.value);
  extra.innerHTML = "";
  if (!t) return;
  if (!t.homologated) {
    typeNote.hidden = false;
    typeNote.textContent = t.discoveryNotes || "Este fluxo ainda não foi homologado com evidência VTEX.";
  } else if (t.id === "graduacao_enem") {
    typeNote.hidden = false;
    typeNote.textContent = "Informe as notas do ENEM. A média é calculada automaticamente (aceite/termo enviados como true).";
  } else {
    typeNote.hidden = true;
  }
  for (const field of t.additionalFields || []) {
    const label = document.createElement("label");
    label.textContent = field.label || field.key;
    const input = document.createElement("input");
    input.name = field.key;
    input.id = `extra-${field.key}`;
    input.required = field.required !== false;
    if (field.type === "number") {
      input.type = "number";
      input.step = field.step || (field.key === "enemAno" ? "1" : "0.1");
      input.inputMode = "decimal";
    }
    label.appendChild(input);
    extra.appendChild(label);
  }
  loadCourses(t.department);
}

function renderSteps(steps) {
  stepsEl.innerHTML = "";
  for (const s of steps || []) {
    const li = document.createElement("li");
    const label = STEP_LABELS[s.step] || s.step;
    const mark = s.status === "ok" ? "✓" : s.status === "error" ? "✗" : "·";
    li.textContent = `${mark} ${label}`;
    li.className = s.status === "ok" ? "ok" : s.status === "error" ? "err" : "";
    stepsEl.appendChild(li);
  }
}

function renderResult(data) {
  resultEl.hidden = false;
  const rows = [
    ["Status", data.status],
    ["Inscrição concluída", data.enrollmentCompleted === false ? "não" : data.enrollmentCompleted ? "sim" : null],
    ["Lead ID", data.leadId],
    ["OrderForm ID", data.orderFormId],
    ["OrderGroup", data.orderGroup],
    ["Order ID", data.orderId],
    ["Nº inscrição", data.inscricaoSIAA],
    ["Link da prova", data.provaLink],
    ["Média ENEM", data.enemNotes?.enemMedia ?? data.payloadPreview?.enemNotes?.enemMedia],
    ["Próximo passo", data.nextAction],
  ];
  resultEl.innerHTML = rows
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join("");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  errorEl.hidden = true;
  resultEl.hidden = true;
  stepsEl.innerHTML = "<li>Executando…</li>";

  const t = types.find((x) => x.id === typeEl.value);
  const additionalData = {};
  for (const field of t?.additionalFields || []) {
    additionalData[field.key] = document.getElementById(`extra-${field.key}`)?.value;
  }

  const body = {
    type: typeEl.value,
    course: document.getElementById("course").value,
    pole: document.getElementById("pole").value,
    candidate: {
      nomeCompleto: document.getElementById("nomeCompleto").value,
      email: document.getElementById("email").value,
      telefone: document.getElementById("telefone").value,
      cpf: document.getElementById("cpf").value,
      nascimento: document.getElementById("nascimento").value,
      cep: document.getElementById("cep").value,
    },
    additionalData,
  };

  try {
    const r = await fetch("/api/enrollments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    renderSteps(data.steps);
    if (!data.success) {
      errorEl.hidden = false;
      const err = data.error || {};
      errorEl.style.background = "";
      errorEl.style.color = "";
      errorEl.textContent = [
        "Inscrição não realizada",
        err.step || data.errorStep ? `Etapa: ${err.step || data.errorStep}` : null,
        err.code || data.errorCode ? `Código: ${err.code || data.errorCode}` : null,
        err.message || data.message ? `Mensagem: ${err.message || data.message}` : null,
        err.httpStatus || data.httpStatus ? `HTTP VTEX: ${err.httpStatus || data.httpStatus}` : null,
        data.leadId ? `Lead parcial: ${data.leadId}` : null,
        data.orderFormId ? `OrderForm parcial: ${data.orderFormId}` : null,
        err.vtexResponse || data.vtexResponse
          ? `Resposta: ${JSON.stringify(err.vtexResponse || data.vtexResponse).slice(0, 800)}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
      if (data.leadId || data.orderFormId || data.orderGroup) {
        renderResult(data);
      }
    } else {
      renderResult(data);
      if (data.status === "dry_run") {
        errorEl.hidden = false;
        errorEl.style.background = "#eff6ff";
        errorEl.style.color = "#1e3a5f";
        errorEl.textContent = data.homologated === false
          ? "Dry-run: fluxo ainda não homologado. Nenhuma inscrição foi criada."
          : "Dry-run: catálogo e payloads validados. Nenhuma inscrição foi criada. Defina ALLOW_REAL_ENROLLMENTS=true para executar de verdade.";
      } else {
        errorEl.style.background = "";
        errorEl.style.color = "";
      }
    }
  } catch (err) {
    errorEl.hidden = false;
    errorEl.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
  }
});

typeEl.addEventListener("change", onTypeChange);

loadStatus().catch(() => {});
loadTypes().catch((err) => {
  typeNote.hidden = false;
  typeNote.textContent = `Falha ao carregar tipos: ${err.message}`;
});
loadPoles().catch(() => {});
