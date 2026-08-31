# Índice do framework

Agentes especialistas para a VTEX Cruzeiro (OpenClaw).

## Contrato geral

- [AGENTS.md](./AGENTS.md) — regras gerais (comportamento, browser, erros, governança)

## Knowledge — etapas compartilhadas (`common/`)

- [knowledge/common/identificacao-candidato.md](./knowledge/common/identificacao-candidato.md) — Entrar como cliente (e-mail), antes da escolha do curso

## Knowledge — fluxos

- [knowledge/graduacao-multipla.md](./knowledge/graduacao-multipla.md) — Graduação / Múltipla Escolha *(caso ativo; Golden Path API)*
- [knowledge/graduacao-redacao.md](./knowledge/graduacao-redacao.md) — Graduação / Redação
- [knowledge/enem.md](./knowledge/enem.md) — ENEM
- [knowledge/transferencia.md](./knowledge/transferencia.md) — Transferência
- [knowledge/segunda-graduacao.md](./knowledge/segunda-graduacao.md) — Segunda Graduação
- [knowledge/pos.md](./knowledge/pos.md) — Pós-graduação

## Knowledge — transversais

- [knowledge/locators.md](./knowledge/locators.md) — catálogo de localizadores semânticos
- [knowledge/lessons-learned.md](./knowledge/lessons-learned.md) — lições reutilizáveis

## Helpers / Transactions (execução híbrida)

- [transactions/README.md](./transactions/README.md) — **API do agente:** `runStageTransaction(stageId, payload)`
- [transactions/write-engine/README.md](./transactions/write-engine/README.md) — backends plugáveis (produção: accessibilityFill)
- [transactions/stages/lead-pdp.json](./transactions/stages/lead-pdp.json) — Stage lead
- [transactions/stages/offer-selection.json](./transactions/stages/offer-selection.json) — Stage oferta/polo (Sprint 4)
- [helpers/fillLeadForm.mjs](./helpers/fillLeadForm.mjs) — adapter temporário de migração (sem lógica)

## Estrutura reservada

- `skills/` — skills do framework (a definir)
- `prompts/` — prompts curtos e versionados (a definir)
- `tests/` — roteiros / checks de regressão (a definir)

Não duplique conteúdo aqui.

---

## Decisões

### 2026-08-28 - ENEM: SIAA é job assíncrono, não passo faltante

**Decisão:** O funil API (checkout + notas) está completo. `inscricaoSIAA` nulo no lead logo após o pedido não significa falha. O SIAA indexa com atraso; busca por CPF. **Iniciar matrícula** é passo posterior (abrir matrícula), não cria o vestibular. Poll de 30s no lead não é critério de sucesso do ENEM.

**Contexto:** Em 2026-08-27 os leads API ficaram `inscricaoSIAA=null`. Em 2026-08-28 o operador achou no SIAA. GET `matricula-unificada` cedo demais caiu em `alerta.xhtml?codigoProcedimento=0`.

**Alternativas descartadas:** (1) tratar o GET SIAA como criação obrigatória da inscrição; (2) falhar a execução se o poll de 30s não devolver número.

**Impacto:** `knowledge/enem.md` (critério de sucesso). Engine pode manter o GET como tentativa opcional; não bloquear inscrição se o SIAA ainda não indexou.

### 2026-08-27 - ENEM inicia matrícula no SIAA após notas aprovadas

**Decisão:** Depois do `PATCH` OP com `statusGraduacao=1`, o engine replica o botão **Iniciar matrícula**: `GET` `matricula-unificada.jsf?inicio=1&codigoEmpresa={marca}&cpfCandidato={cpf}`. O `nrInscricao` sai do 302 (Location). Reprovado (`statusGraduacao=2`) não chama o SIAA.

**Contexto:** Inscrições API paravam nas notas (`inscricaoSIAA` null). O fluxo manual (`96423032050`) gerou `265953605` ao clicar no botão. HAR Luan mostra o mesmo GET e o 302 com `nrInscricao`.

**Alternativas descartadas:** (1) esperar sync assíncrono VTEX→SIAA; (2) inventar POST JSF; (3) chamar `dados.jsf` (HAR da API com `codigoEmpresa=NaN` caiu em aviso).

**Impacto:** `V2/src/flows/graduacao-enem.js` (`afterOrder`), `VtexClient.request` (redirect 3xx), `knowledge/enem.md`, testes `V2/tests/enem.test.js`.

### 2026-08-27 - ENEM preenche notas após o pedido

**Decisão:** `graduacao_enem` reutiliza o pipeline de Graduação R$0 da Múltipla, com `formaIngresso: "ENEM"` e `seqVest: 1`. Notas em `additionalData`; após o checkout, `PATCH` OP com média e `statusGraduacao: media >= 300 ? 1 : 2` (regra do storefront `my-account-custom`). `1` = aprovado, `2` = reprovado. Sem `getProvaUrl`.

**Contexto:** HAR confirmou o mesmo checkout da Múltipla; o delta é ingresso + notas depois do `orderPlaced`.

**Alternativas descartadas:** (1) inventar `codVest` distinto; (2) enviar notas no addToCart; (3) exigir `enemNumeroInscricao`.

**Impacto:** `V2/src/flows/graduacao-enem.js`, engine (`afterOrder`, merge de `additionalData`), UI de campos extras, testes `V2/tests/enem.test.js`.

### 2026-08-27 - App web multi-fluxo (V2 API-only)

**Decisão:** Extrair o POC API-only para um engine `runEnrollment({ type, candidate, course, pole })` em `V2/src/`, com Express + UI estática + Docker na raiz. Infra compartilhada (VTEX client, catálogo Excel, CEP, checkout) separada de estratégias por fluxo. Só `graduacao_multipla` homologado. Demais tipos existem no registry com `homologated: false` e não inventam payloads. `ALLOW_REAL_ENROLLMENTS` default `false` (dry-run para antes de `POST /v1/lead`). Catálogo devolve só fatos da planilha; campanha/codVest/seqVest ficam no fluxo. Endereço sai da API de CEP da VTEX, não de Barra Funda hardcoded.

**Contexto:** Homologação atual é Graduação Vestibular Múltipla Escolha. Excel tem `Graduação` (012…) e `Pós-Graduação` (007…).

**Alternativas descartadas:** (1) if/else em `api-only-poc.js`; (2) copiar campaign defaults de Graduação para os outros fluxos; (3) React neste momento.

**Impacto:** `V2/src/**`, `V2/public/**`, `Dockerfile`, adapter `V2/api-only-poc.js`. Browser/`transactions/` intocado.

### 2026-07-14 - Sprint Final Homologação: PostOrder (aba por conteúdo) + Capture fail-stop + perf harness

**Decisão:** Homologar apenas PostOrder → Capture → Logout. Checkout permanece homologado (intocado).

**PostOrder:** após Continuar Processo, selecionar aba somente se (1) tipo=page, (2) domínio Cruzeiro, (3) URL account, (4) **conteúdo** confirma "Minhas Inscrições". Nunca só URL; nunca só ordem da lista. Preferência por abas novas no diff, mas cada candidata é focada e validada por conteúdo. Sem navigate fallback. Timeout → `POST_ORDER_CORRECT_TAB_TIMEOUT`.

**Capture:** fail-stop sem contorno: confirmar Minhas → poll 15–30s inscrição/orderId → Acompanhar → estabilizar → capturar href "Acessar prova" (nunca clicar). Códigos: `CAPTURE_NOT_ON_MINHAS`, `CAPTURE_INSCRICAO_NOT_FOUND`, `CAPTURE_ACOMPANHAR_NOT_FOUND`, `CAPTURE_STABILIZE_TIMEOUT`, `CAPTURE_PROVA_LINK_NOT_FOUND`.

**Performance:** instrumentação só no harness (`run`/`sleep` + `recordWaitCondition`): browser/snapshot/evaluate/click/navigate/poll/waitCondition/node + counts. Sem otimizar. Runtime / Stages / Write Engine / Lead / Offer / Checkout intactos.

**Contexto:** Observação mostrou que Continuar Processo abre `account#/minhas-inscricoes` sem auto-focus, junto com abas GTM/recaptcha/tracker.

**Alternativas descartadas:** (A) patch mínimo com fallbacks; (C) métricas só em PostOrder/Capture.

**Impacto:** `postOrderRunner.mjs`, `captureRunner.mjs`, instrumentação em `run-demo.mjs`. Polo da corrida: `São Paulo - São Miguel Paulista` (input only).

### 2026-07-14 - Fix: aborted de fase não contamina fase seguinte


**Decisão:** Em `run-demo.mjs`, `beginPhase` limpa `aborted` de `PHASE_TIMEOUT`/`CALL_TIMEOUT` da fase anterior. `snap()` só descarta texto se a chamada estourou ou se o abort é da **fase atual**. Runtime / Stages / Write Engine / Checkout Runner intactos.

**Contexto:** Timeout de `continuar_telemetry` deixava `aborted` setado; `snap()` devolvia `""` no checkout → todos os refs via DOM.

**Impacto:** Snapshots/refs voltam a funcionar após timeout controlado de fase anterior.

### 2026-07-13 - Sprint Homologação: contrato único via adapters (item 1)

**Decisão:** Introduzir camada fina `transactions/demo/runnerContract.mjs` (`adaptOkResult`, `adaptStageResult`, `runOkAsContract`, `runStageAsContract`) no harness Demo. Todo Auth/Stage/Runner passa a expor `{ success, code, ms, browserCalls, output }` **sem alterar** lógica interna. Shims (`ok`, `elapsedMs`, campos originais) preservam callers. Throws → `UNHANDLED` (não propagam). Timeline / métricas / Golden Path / Logout Runner **adiados**.

**Contexto:** Modo homologação — minimizar regressão; padronização completa na sprint seguinte.

**Alternativas descartadas:** (1) Reescrever runners para o contrato; (2) Implementar Timeline/métricas agora.

**Impacto:** Só harness Demo; Runtime / Stages / Write Engine / Gates intactos.

### 2026-07-13 - Sprint Final: PostOrder Runner + fronteiras por objetivo de negócio

**Decisão:** Separar o pós-pedido em três runners determinísticos no harness Demo:
1. **Checkout** (`checkoutRunner.mjs`) — cria pedido válido; termina com **ORDER_ID** (`og` / equivalente), não por URL fixa.
2. **PostOrder** (`postOrderRunner.mjs`) — estado `POST_ORDER`: Continuar Processo → mesma/nova aba → Minhas Inscrições.
3. **Capture** (`captureRunner.mjs`) — Acompanhar → capturar href da prova (nunca abrir).

Orquestração em `run-demo.mjs`: Gate Cart → Checkout → PostOrder → Capture → logout (harness). Runtime / Stages / Write Engine intactos. Facade `checkoutCaptureLogoutRunner.mjs` permanece só para compat.

**Contexto:** Análise histórica mostrou etapa explícita entre orderPlaced e Capture (Continuar Processo / possível nova aba).

**Alternativas descartadas:** (1) Helper interno sem estado POST_ORDER visível; (2) Fronteira Checkout = URL `orderPlaced` apenas; (3) Duplicar Continuar Processo sem cortar o monolito.

**Impacto:** Fronteiras por objetivo de negócio; Agent só na exceção de cada runner.

### 2026-07-13 - Demo estabilização: Runner determinístico pós–Gate Cart

**Decisão:** Após Gate Cart, o harness (`run-demo.mjs`) entrega o fluxo a `runCheckoutCaptureLogout` (`transactions/demo/checkoutCaptureLogoutRunner.mjs`). Passos fixos: profile → shipping → Continuar Inscrição → wait `orderPlaced` → minhas-inscrições / Acompanhar → captura href da prova (nunca abre) → logout. Sem decisões de LLM; waits por condição; aborts com códigos (`CHECKOUT_CART_EMPTY`, `ORDER_NOT_PLACED`, `CAPTURE_PROVA_NOT_FOUND`, …). Agent só registra `AGENT_EXCEPTION` se o runner falhar. Runtime / Stages / Write Engine intactos.

**Contexto:** Orquestração Agent-heavy após o carrinho regressou o caminho que chegava em `orderPlaced` (baseline `measure-gaboluku-rh.json`).

**Alternativas descartadas:** (1) Novo Stage de checkout; (2) Alterar Runtime/Write Engine; (3) Manter decisões Agent no checkout/captura.

**Impacto:** Fronteira clara Agent (até Gate Cart) → Runner (checkout→capture→logout); Demo mais reprodutível.

### 2026-07-13 - Sprint Demo Final: Gate Auth (Agent)

**Decisão:** Antes do Lead, o Agent usa `ensureCandidateAuthenticated(candidate)` (`transactions/demo/ensureCandidateAuthenticated.mjs`): se já autenticado para o **mesmo e-mail**, retorna; senão login → Gate Auth (poll 2s / 30s); falha → só retry login; `maxAttempts` → `GATE_AUTH_TIMEOUT`. Relatório: attempts, tempo, critério, e-mail autenticado. Runtime / Stages / Write Engine intactos.

**Contexto:** Login telemarketing nem sempre efetiva na 1ª tentativa; Lead sem sessão autenticada gera falhas a jusante.

**Alternativas descartadas:** (1) Alterar Stage Lead; (2) Retry do funil inteiro; (3) sleep fixo sem verificação.

**Impacto:** Login determinístico antes do Lead; config em `auth.*` / env `DEMO_AUTH_*`.

### 2026-07-12 - Sprint Demo Final: Gate de carrinho (Agent)

**Decisão:** Após "Continuar inscrição", o Agent (`run-demo.mjs`) aguarda Gate `gate_cart` antes de qualquer navigate para checkout/profile. Critérios: redirect natural para `/checkout` não vazio **ou** `orderForm.items.length > 0` **ou** confirmação visual de produto. Timeout → `GATE_CART_NOT_READY` e abort, sem abrir checkout vazio. Runtime / Write Engine / Stage `offer-selection` intactos.

**Contexto:** Causa raiz Demo REPROVADA — force-nav para `#/profile` com orderForm vazio → `#/cart` + CART_EMPTY.

**Alternativas descartadas:** (1) Alterar Stage Offer; (2) Novo Stage de carrinho; (3) Continuar sleep fixo + navigate.

**Impacto:** Elimina falso avanço para checkout vazio; falha fica explícita no log/relatório.

### 2026-07-12 - Sprint Demo (harness de execução)

**Decisão:** Preparar fluxo de demonstração só no harness (`transactions/run-demo.mjs` + `demo/buildReport.mjs`), sem alterar Runtime, Stages ou Write Engine. Pós-matrícula: capturar link da prova (nunca abrir), logout do candidato, fechar browser (`browser stop`), evitar nav redundante para PDP conhecida, relatório amigável + JSON `n8n` em `demo-result.json`.

**Contexto:** Demo para operadores/n8n; arquitetura de Stages permanece intacta.

**Alternativas descartadas:** (1) Mudar Runtime/Stages para reporting; (2) Abrir prova automaticamente; (3) Novo Stage de captura/logout.

**Impacto:** `node transactions/run-demo.mjs` [opcional `demo-input.json`]. Entrada exemplo: `demo-input.example.json`.

### 2026-07-12 - Sprint 4: Stage offer-selection

**Decisão:** Transformar o maior gargalo (polo/oferta pós-CTA) no Stage `offer-selection`, reutilizável via `runStageTransaction`. Escopo: País, CEP, Estado, Cidade, Polo (`poloPrefix`), Forma de ingresso. Click interno opcional em "Ver condição especial". Agent permanece responsável por necessidade especial, Continuar inscrição, checkout e captura.

**Contrato:** `{ pais?, cep, estado, cidade, poloPrefix, formaIngresso }` → `{ success, valuesFound, browserCalls, elapsedMs, nextActionSuggested: select_necessidade_then_continuar }`.

**Contexto:** Polo procedural ~138s / dezenas de RTs. Runtime e Agent API intactos. Write Engine: mesmo backend de produção `accessibilityFill` com `execution.mode: "cascade"` (steps dependentes + re-snapshot), sem novo backend nem mudança de registry API.

**Alternativas descartadas:** (1) Otimizar script procedural de polo; (2) Stage só até polo sem ingresso; (3) Incluir necessidade/Continuar/checkout no Stage; (4) Novo writeBackend só para selects.

**Impacto:** `transactions/stages/offer-selection.json`; cascade em `write-engine/backends/accessibilityCascade.mjs`. Medição: `measure-sprint4-offer.json`. KPI: ↓ tempo e Browser Tool calls vs polo procedural, mesma taxa de sucesso do funil.

### 2026-07-11 - Runtime API definitiva (lead em produção)

**Decisão:** Agente chama apenas `runStageTransaction(stageId, payload)`. Write Engine plugável com default `accessibilityFill`. `fillLeadForm` vira adapter temporário sem lógica.

**Contexto:** Validar arquitetura em produção no stage `lead-pdp` antes de Address/Checkout.

**Alternativas descartadas:** (1) Manter helper como implementação principal; (2) Agent passar `run`/backend; (3) Abrir novos Stages antes da API estável.

**Impacto:** Medição `measure-architecture-lead.json` — lead ~26s / 4 RTs / sucesso CTA→polo. KPI próximo: ↓ RTs por stage.

### 2026-07-11 - Write Engine (produção vs target)

**Decisão:** A Write Engine plugável é padrão do projeto, com separação explícita entre **Default de Produção Atual** e **Target Architecture**. Pilha canônica:

`Agent → Runtime → Stage Definition → Write Engine`

**Default de Produção Atual:** `accessibilityFill`  
Motivo: única estratégia comprovadamente confiável no fluxo VTEX atual (CTA aceita valores). Não é solução definitiva.

**Target Architecture:** reduzir drasticamente round-trips do Browser Tool. Backends trusted de baixo RT (ex.: CDP `insertText`, ou equivalente) devem poder ser plugados **sem alterar** Agent, Stage Definitions, regras de negócio nem fluxos. `accessibilityFill` permanece fallback de produção até um backend mais barato igualar a taxa de sucesso.

**Requisito arquitetural:** antes de novos Stages (Address, Checkout, etc.), validar que um backend novo (ex. CDP) entra só no registry da Write Engine — Runtime/Stages/Agent intactos.

**KPI da próxima Sprint:** ↓ Browser Tool calls **por Stage**, mantendo a mesma taxa de sucesso. Escopo da Write Engine = formulários React em geral; **sem** otimizações específicas VTEX.

**Contexto:** Runtime já validado; gargalo = mecanismo de escrita. Evidence: evaluate/nativeReact preenche DOM mas submit rejeita; accessibilityFill avança até polo.

**Alternativas descartadas:** (1) Tratar accessibilityFill como arquitetura final; (2) Default de produção = nativeReact/evaluate; (3) Abrir Address/Checkout antes de provar pluggability de backend; (4) Hacks VTEX no Runtime.

**Impacto:** Stage escolhe ou herda `writeBackend` via execução/config da Write Engine; troca de backend = config/registry. Registrar medição de RTs por stage em cada experimento de backend.

### 2026-07-11 - Browser Transaction Runtime (lead-pdp)

**Decisão:** Adotar `transactions/` como padrão para preenchimento de formulários: Runtime genérico + Stage Definition declarativa. Stage ativo: `lead-pdp`. `fillLeadForm` vira adapter fino.

**Contexto:** Validar a arquitetura híbrida. Meta ideal era 1× `evaluate`; em inputs React controlados (`type=email`) o setter/page-context não é aceito pelo submit — o CTA só avança após fill acessível (Playwright/OpenClaw).

**Alternativas descartadas:** (1) Manter só helper ad-hoc sem Stage Definition; (2) Forçar 1× evaluate mesmo com CTA quebrado; (3) Implementar Address/Checkout stages agora.

**Impacto:** `execution.writeBackend: accessibilityFill` no `lead-pdp` (snapshot+fill+validate). Runtime permanece VTEX-agnóstico. Medição em `measure-lead-transaction.json`. Próximo: outros stages só após estabilizar este padrão.

### 2026-07-11 - Helper fillLeadForm (híbrido)

**Decisão:** Introduzir pasta `helpers/` e o primeiro helper `fillLeadForm()` para preencher o lead da PDP em um único `evaluate`, sem clicar CTA nem decidir fluxo.

**Contexto:** Otimização de execução; arquitetura híbrida (agente decide/valida navegação; helpers só ações repetitivas). Lead era lento e frágil (vários CLI + setter React inconsistente).

**Alternativas descartadas:** (1) Agente continuar preenchendo campo a campo via snapshot/fill; (2) Playwright page objects no lugar do OpenClaw; (3) Pacote de vários helpers de uma vez.

**Impacto:** Agente chama `fillLeadForm` na PDP; se `ok`, decide clicar Inscreva-se. Localizadores semânticos documentados em `locators.md`. Medir tempo da etapa lead antes/depois nesta sessão. *(Superado em parte pela decisão Runtime acima — adapter mantido.)*

