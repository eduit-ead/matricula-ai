# Arquitetura: Browser Transaction genérica (definição declarativa)

**Status:** proposta — **não implementado**.  
**Relação:** especializa e generaliza [`BROWSER-TRANSACTION-LEAD.md`](./BROWSER-TRANSACTION-LEAD.md).  
**Objetivo:** um **único runtime** de transaction; cada etapa do funil muda só a **definição declarativa**.

---

## 1. Diagnóstico da proposta Lead-only

A proposta atual de LeadFill está correta no eixo performance (1× `evaluate`) e no eixo híbrido (não decide navegação).  

O risco, se implementada “fechada” no Lead, é virar um segundo estilo de helper hard-coded (`if (campo === email)`), e depois duplicar a mesma lógica para polo, checkout profile, shipping, etc.

| Aspecto Lead-only | Problema para o framework |
|-------------------|---------------------------|
| Script in-page específico Nome/E-mail/Telefone | Não reutiliza em CEP / CPF / selects |
| `nextActionSuggested: click_inscreva_se` fixo | Sugestões deveriam vir da **definição** da etapa |
| Estratégia “perto do CTA Inscreva-se” embutida | Outras etapas têm âncoras diferentes |
| Validação ad hoc | Precisa de catálogo declarativo de regras |

**Direção:** Lead vira o **primeiro Stage Definition** consumido pelo **Transaction Runtime** genérico.

---

## 2. Princípios

1. **Um runtime, N definições** — código de locate/set/check/validate é compartilhado.  
2. **Definição = dados** — JSON/JS object versionado; sem `if` de fluxo de negócio no runtime.  
3. **Agente decide; transaction executa** — a transaction não clica CTA de avanço nem navega.  
4. **Sugestão ≠ ordem** — `nextActionSuggested` sai da definição + resultado; o agente interpreta.  
5. **1 round-trip por etapa de formulário** — meta de performance preservada.  
6. **Semântica > ID** — estratégias declarativas (label, placeholder, aria, role, texto, âncora, proximidade).  
7. **Knowledge separado** — textos/âncoras estáveis podem espelhar `locators.md`; a definição referencia intenções, não refs `e21`.

---

## 3. Visão em camadas

```text
┌─────────────────────────────────────────────────────────────┐
│  AGENTE (Cursor / OpenClaw Agent)                           │
│  - onde estou?  - chamar transaction X?  - clicar CTA?      │
│  - validar efeito de negócio (URL, polo, orderPlaced…)      │
└───────────────────────────┬─────────────────────────────────┘
                            │ runStageTransaction(stageId, values)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE REGISTRY (definições declarativas)                   │
│  lead-pdp.json | polo-oferta.json | checkout-profile.json … │
└───────────────────────────┬─────────────────────────────────┘
                            │ StageDefinition + Values
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  TRANSACTION RUNTIME (Node)                                 │
│  - carrega definição                                        │
│  - serializa definition+values em 1 evaluate                │
│  - 1 round-trip OpenClaw browser                            │
│  - parseia Result                                           │
└───────────────────────────┬─────────────────────────────────┘
                            │ CDP evaluate(engineFn, args)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  IN-PAGE ENGINE (mesmo bundle JS em todo stage)             │
│  locate → write → toggle → validate → build Result          │
└─────────────────────────────────────────────────────────────┘
```

Helpers atuais (`fillLeadForm`) ficam como **adaptadores finos** opcionais (`runStage('lead-pdp', values)`) ou são deprecados após o runtime existir.

---

## 4. Modelo da definição declarativa (`StageDefinition`)

Conceito (schema ilustrativo):

```jsonc
{
  "id": "lead-pdp",
  "version": 1,
  "description": "Lead da PDP Graduação — preencher e validar; não avançar funil",

  "preconditions": {
    "requireVisibleTextAny": ["Inscreva-se"],
    "forbidUrlIncludes": ["checkout/#/profile"]
  },

  "anchor": {
    "strategy": "buttonText",
    "match": { "equalsIgnoreCase": "Inscreva-se" },
    "exclude": { "tag": "a", "hrefIncludes": "processo-seletivo" },
    "role": "prefer_near_fields"
  },

  "fields": [
    {
      "key": "nome",
      "control": "text",
      "locate": {
        "strategies": [
          { "type": "labelText", "includesAny": ["nome completo", "nome"] },
          { "type": "placeholder", "includesAny": ["nome"] },
          { "type": "ariaLabel", "includesAny": ["nome"] },
          { "type": "attrName", "equalsAny": ["completeName"] }
        ],
        "preferNearAnchor": true,
        "penalize": { "placeholderIncludes": ["example@mail.com"] }
      },
      "write": { "mode": "reactSafeSet", "normalize": ["titleCase", "trim"] },
      "validate": [
        { "rule": "nonEmpty" },
        { "rule": "minWords", "count": 2 },
        { "rule": "valueContainsNormalizedFirstWord" }
      ]
    },
    {
      "key": "email",
      "control": "text",
      "locate": {
        "strategies": [
          { "type": "labelText", "includesAny": ["e-mail", "email"] },
          { "type": "inputType", "equals": "email" },
          { "type": "placeholder", "includesAny": ["e-mail", "email"] }
        ],
        "preferNearAnchor": true,
        "penalize": { "placeholderIncludes": ["example@mail.com"] }
      },
      "write": { "mode": "reactSafeSet", "normalize": ["trim", "lowerCase"] },
      "validate": [
        { "rule": "nonEmpty" },
        { "rule": "emailFormat" },
        { "rule": "equalsNormalized" }
      ]
    },
    {
      "key": "telefone",
      "control": "text",
      "locate": {
        "strategies": [
          { "type": "labelText", "includesAny": ["telefone", "celular"] },
          { "type": "inputType", "equals": "tel" },
          { "type": "placeholder", "includesAny": ["telefone"] }
        ],
        "preferNearAnchor": true
      },
      "write": { "mode": "reactSafeSet", "normalize": ["digitsOnly"] },
      "validate": [
        { "rule": "minDigits", "count": 10 },
        { "rule": "endsWithLastDigits", "count": 8 }
      ]
    }
  ],

  "checkboxes": [
    {
      "key": "aceite",
      "locate": {
        "strategies": [
          { "type": "labelText", "includesAny": ["política de privacidade", "autorizo", "lgpd"] }
        ],
        "preferNearAnchor": true,
        "fallback": "closestCheckboxToAnchor"
      },
      "write": { "mode": "ensureChecked" },
      "validate": [{ "rule": "isChecked" }]
    }
  ],

  "selects": [],

  "success": {
    "allFieldsValid": true,
    "allCheckboxesValid": true
  },

  "onSuccessSuggest": "click_inscreva_se",
  "onFailureSuggest": {
    "NOT_ON_STAGE": "abort_wrong_screen",
    "NOT_FOUND": "abort_lead_not_on_page",
    "NOT_ACCEPTED": "retry_stage_or_ask_human",
    "INVALID_INPUT": "ask_human_data",
    "default": "retry_stage_or_ask_human"
  },

  "forbiddenActions": ["navigate", "clickAdvanceCta"]
}
```

### 4.1 Blocos obrigatórios

| Bloco | Função |
|-------|--------|
| `id` / `version` | Identidade e evolução sem quebrar o agente |
| `preconditions` | Gate leve in-page (“estou na tela certa?”) — ainda **não** é decisão de fluxo, só fail-fast |
| `anchor` | Ponto de referência espacial/semântico (CTA, heading, form landmark) |
| `fields[]` | Controles de texto/tel/email/date… |
| `checkboxes[]` | Aceites |
| `selects[]` | Combos (polo, ingresso…) — mesmo runtime, outro `control` |
| `success` | Critérios booleanos compostos |
| `onSuccessSuggest` / `onFailureSuggest` | Hints para o agente |
| `forbiddenActions` | Documenta o que o runtime **recusa** executar mesmo se alguém pedir |

### 4.2 Estratégias de localização (catálogo do runtime)

O runtime implementa um **enum fechado** de strategies; a definição só as **compõe**:

- `labelText`, `placeholder`, `ariaLabel`, `roleName`, `inputType`, `attrName`  
- `visibleTextNear` (texto vizinho)  
- `preferNearAnchor` / `penalize`  
- `fallback: closestCheckboxToAnchor`  

Novas strategies = mudança de **framework** (aprovada); novos stages = só JSON.

### 4.3 Writes e validates (catálogo)

**write.mode (exemplos):** `reactSafeSet`, `ensureChecked`, `selectByOptionText`, `selectByOptionRegex`.

**validate.rule (exemplos):** `nonEmpty`, `minWords`, `emailFormat`, `minDigits`, `equalsNormalized`, `endsWithLastDigits`, `isChecked`, `optionSelected`, `matchesRegex`.

O Lead não inventa regras novas no script; só escolhe do catálogo.

---

## 5. Contrato de execução e resultado (genérico)

### Entrada do runtime

```ts
runStageTransaction({
  stageId: "lead-pdp",
  values: { nome, email, telefone }
})
```

### Saída (mesmo shape para todos os stages)

```json
{
  "success": true,
  "stageId": "lead-pdp",
  "version": 1,
  "errors": [],
  "valuesFound": {
    "nome": "...",
    "email": "...",
    "telefone": "...",
    "aceite": true
  },
  "nextActionSuggested": "click_inscreva_se",
  "diagnostics": {
    "anchorFound": true,
    "strategiesUsed": { "nome": ["labelText"], "email": ["inputType", "preferNearAnchor"] },
    "elapsedMsInPage": 42
  }
}
```

`diagnostics` é opcional para telemetria; o agente pode ignorar.

---

## 6. In-page engine (algoritmo único)

```text
function executeStage(definition, values):
  if not preconditions(definition):
     return fail(NOT_ON_STAGE, suggest=onFailureSuggest.NOT_ON_STAGE)

  anchor ← locateAnchor(definition.anchor)
  if definition.anchor.required and not anchor:
     return fail(ANCHOR_NOT_FOUND, ...)

  for field in definition.fields:
     el ← locateControl(field.locate, anchor)
     if not el: errors ← NOT_FOUND
     else: write(field.write, el, normalize(values[field.key]))
           valuesFound[field.key] ← read(el)
           errors += runValidations(field.validate, ...)

  for box in definition.checkboxes:
     … ensureChecked / isChecked …

  for sel in definition.selects:
     … selectByOptionText / validate …

  success ← evaluateSuccess(definition.success, errors)
  suggest ← success ? definition.onSuccessSuggest
                    : mapErrorsToSuggest(definition.onFailureSuggest, errors)
  return { success, errors, valuesFound, nextActionSuggested: suggest, ... }
```

**Proibido no engine:** `location.href =`, `click` em elementos listados como advance CTA da definição, abrir tabs.

Se no futuro uma definição precisar “clicar um micro-controle” (ex.: limpar campo), isso entra como `write.mode` explícito — nunca como “avançar funil”.

---

## 7. Como o Lead se encaixa (sem implementação dedicada)

| Antes (proposta Lead) | Depois (genérico) |
|-----------------------|-------------------|
| `LeadFillTransaction` hard-coded | `stages/lead-pdp.json` + `runStageTransaction('lead-pdp', values)` |
| Sugestão fixa no código | `onSuccessSuggest: "click_inscreva_se"` na definição |
| Âncora Inscreva-se no JS | `anchor` declarativo |
| Doc Lead descreve o experimento | Doc Lead vira **exemplo de stage** + aponta para esta arquitetura |

Outros stages futuros (mesmo runtime):

- `cliente-telemarketing-email` (só campo e-mail + hint `click_entrar`)  
- `polo-oferta` (selects país/UF/cidade/polo)  
- `ingresso-multipla` (selects ingresso + necessidade)  
- `checkout-profile` (nome, CPF, birth `type=date` ISO)  
- `checkout-shipping` (CEP + checkbox sem número)  

Cada um = novo JSON; **zero** cópia do engine.

---

## 8. Relação com o agente e com knowledge

```text
knowledge/locators.md     → intenções humanas / catálogo
stages/*.json             → machine-readable da mesma intenção
AGENTS.md / helpers/README → contrato híbrido (quem decide o quê)
Transaction Runtime       → execução 1-RT
```

O agente:

1. Observa tela (snapshot leve **só se precisar decidir** onde está — fora da transaction).  
2. Escolhe `stageId`.  
3. Chama `runStageTransaction`.  
4. Lê `success` / `nextActionSuggested`.  
5. Decide clique/navegação/pergunta humana.  
6. Valida efeito de negócio com **outra** observação (URL, “Ver condição”, etc.).

---

## 9. Evolução a partir do que já existe

| Artefato atual | Destino |
|----------------|---------|
| `fillLeadForm.mjs` | Adapter temporário → depois thin wrapper do stage `lead-pdp` |
| `BROWSER-TRANSACTION-LEAD.md` | Exemplo + requisitos do primeiro stage |
| **Este doc** | Contrato do framework |
| (futuro) `transactions/runtime.mjs` | Engine Node + bundle in-page |
| (futuro) `transactions/stages/lead-pdp.json` | Primeira definição |

Ordem sugerida de implementação (quando autorizar):

1. Runtime genérico + schema da definição (sem stages de produção).  
2. Stage `lead-pdp` migrado da proposta Lead.  
3. Medir 1 RT vs helper atual.  
4. Só então próximo stage (ex.: checkout-profile).

---

## 10. Riscos da genericidade

| Risco | Mitigação |
|-------|-----------|
| Schema inchado demais no v1 | Começar com `fields` + `checkboxes` + `anchor`; `selects` no v1.1 |
| Definições copiando bugs React | `write.mode: reactSafeSet` testado uma vez no runtime |
| Agente “programando” stages ad hoc | Stages versionados no repo; agente só escolhe `stageId` + values |
| Preconditions demais = navegação disfarçada | Preconditions só fail-fast de tela; sem branches de funil |

---

## 11. Resumo

- A Browser Transaction do Lead deve nascer como **instância** de um **Transaction Runtime genérico**.  
- O que muda entre etapas é só a **Stage Definition** declarativa (campos, locate, valores, validates, checkboxes, success, hints).  
- A implementação in-page e o transporte (1× evaluate) são **sempre os mesmos**.  
- O agente continua dono de **quando** rodar, **se** clicar Inscreva-se e **qual** o próximo passo.

**Não implementar ainda** — este documento fixa o padrão antes do primeiro código do runtime.
