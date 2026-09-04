const SUPABASE_URL = (process.env.SUPABASE_URL || "https://vtlbndvcgajcoajhcnnx.supabase.co").replace(/\/$/, "");

const ERRO_LABEL = {
  ENEM_SEM_NOTA: "ENEM sem nota — anexe o boletim em Resultado ENEM",
  ENEM_NOTA_ILEGIVEL: "Não consegui ler as 5 notas do boletim ENEM",
  CEP_AUSENTE: "Lead sem CEP",
  CEP_INVALIDO: "CEP com dígitos errados ou não encontrado na VTEX",
  CEP_GEO_GOOGLE: "Google Geocode não achou o CEP",
  CEP_SEM_COORDENADA: "CEP sem latitude/longitude",
  COURSE_DEPT_MISMATCH: "Curso de graduação usado com forma de pós (ou o inverso)",
  COURSE_NOT_FOUND: "Curso não existe no catálogo",
  COURSE_AMBIGUOUS: "Nome do curso bate em mais de um card",
  SEM_SIAA: "Pedido VTEX criado, SIAA não gerou número",
  JA_INSCRITO_FORMA: "Já existe inscrição dessa forma no ciclo (vestibular, ENEM, segunda ou transferência)",
  JA_INSCRITO_CURSO: "Já existe pós neste mesmo curso no ciclo",
  POLO_VAZIO: "Polo_Inscicao vazio",
  POLO_DESCONHECIDO: "Polo_Inscicao fora do mapa",
  POLO_LOC_SEM_CHAVE: "Falta SUPABASE_ANON_KEY",
  POLO_LOC_ERRO: "Falha ao ler polo_loc",
  POLO_LOC_VAZIO: "polo_loc sem linhas",
  POLO_LOC_SEM_MAPA: "polo_loc não mapeia para o Excel",
  INPUT_INVALID: "CPF, curso ou polo ausente",
  LEAD_NAO_PERMITIDO: "Lead fora do allowlist de teste",
  IN_FLIGHT: "Mesmo CPF/forma já em execução",
  EMAIL_JA_CADASTRADO: "E-mail já tem cadastro na loja com outro CPF",
  INSCRICAO_FAILED: "Falha no checkout VTEX/SIAA",
  CATALOG_ERROR: "Erro de catálogo",
};

function supabaseKey() {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_KEY ||
    ""
  );
}

async function writeInscricaoLog(lead, out) {
  const key = supabaseKey();
  if (!key) return;
  const code = out.code || null;
  const row = {
    duration_ms: out.durationMs ?? null,
    ok: Boolean(out.ok),
    forma_ingresso: out.formaIngresso || lead.formaIngresso || null,
    department: out.department || lead.department || null,
    error_code: out.ok ? null : code,
    error_message: out.ok
      ? null
      : ERRO_LABEL[code] || out.error || out.mensagem || code,
    lead_id: out.leadId || lead.leadId || null,
    cpf: out.cpf || lead.cpf || null,
    email: out.email || lead.email || null,
    curso: out.curso || lead.curso || null,
    polo: out.polo || lead.polo || null,
    polo_km: out.poloKm != null ? out.poloKm : lead.poloKm ?? null,
    order_id: out.orderId || null,
    inscricao_siaa: out.inscricaoSIAA || null,
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/inscricoes_logs`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      "User-Agent": "matricula-ai-inscricao-http",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    console.error("inscricoes_logs:", res.status, (await res.text()).slice(0, 200));
  }
}

module.exports = { writeInscricaoLog, ERRO_LABEL };
