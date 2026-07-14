# Lessons learned (reutilizáveis)

Aprendizados **transversais**. Não registrar diário de uma execução — apenas padrões, armadilhas e estratégias.

---

## Componentes / padrões VTEX observados

- Vitrine de cursos com busca + filtros (departamento, duração, tipo Graduação/Pós/Livre).
- PDP de curso em slug `/grad-.../p` para Graduação.
- SERP pode misturar Graduação com cursos curtos (“6 meses”) e outras modalidades sob o mesmo termo de busca.
- PDP frequentemente combina **CTA de inscrição** com **formulário de lead** e **simulação de investimento**.
- Identificação do candidato via **Entrar como cliente** (e-mail) no chrome do site — etapa compartilhada, antes da escolha do curso (`knowledge/common/identificacao-candidato.md`).

---

## Estratégias que funcionam melhor

- Loop observar → decidir → agir → validar → observar.
- Snapshot com refs de role (`efficient`) quando aria puro não traz refs acionáveis.
- Validar navegação por URL/título + elementos-chave, não só pelo “click ok”.
- Preferir produto de Graduação pelo **nome curto** + confirmação de PDP (`grad-` / título “Graduação em …”).
- Manter knowledge por fluxo + `common/` + catálogo de locators; evitar prompts enormes.
- Etapas comuns (ex.: identificação) em `knowledge/common/`; fluxos só referenciam.
- Lead da PDP: preferir helper `fillLeadForm` (um `evaluate`) em vez de vários fill/snapshot; agente só decide clicar **Inscreva-se** após `ok`.

---

## Armadilhas recorrentes

- Confundir parâmetro `type` (formato) com `kind` (ação) na Browser Tool.
- Usar screenshot com LLM text-only (não interpreta imagem).
- Refs stale após busca/navegação.
- Poluição de abas (tracking, recaptcha) — focar aba de conteúdo.
- Assumir que “Inscreva-se” na PDP = funil completo / forma de ingresso já selecionável.
- Encadear etapas sem gate na fase assistida.

---

## Boas práticas de documentação

Antes de escrever, perguntar: *AGENTS / common / fluxo / locators / lessons?*

- Regra de comportamento → `AGENTS.md`
- Etapa compartilhada entre fluxos → `knowledge/common/<etapa>.md`
- Etapa/negócio do funil → `knowledge/<fluxo>.md` (só referência se já estiver em `common/`)
- Seletor semântico estável → `locators.md`
- Padrão/armadilha → `lessons-learned.md`
- Status do projeto → relatório de sessão (chat), fora do agente

---

## Soluções permanentes propostas (aguardando aprovação)

| Aprendizado | Virar regra em | Status |
|-------------|----------------|--------|
| Preferir `kind` em act:type | AGENTS.md (já documentado) | documentado |
| Snapshot efficient quando aria sem refs | lessons + implícito AGENTS | documentado |
| Separar lead vs CTA inscrição | lessons + fluxos | documentado; comportamento runtime não alterado |

Nenhuma mudança automática de comportamento do agente.
