# Experimento: Browser Transaction — etapa Lead (PDP)

**Status:** proposta técnica — **não implementado**.  
**Padrão do framework:** ver [`BROWSER-TRANSACTION-ARCHITECTURE.md`](./BROWSER-TRANSACTION-ARCHITECTURE.md) (runtime genérico + Stage Definition). Este arquivo descreve o **primeiro stage** (`lead-pdp`) e a motivação de performance.  
**Contexto:** `fillLeadForm()` mostrou que encapsular fills em helper **não** corta latência de forma relevante; o custo dominante é o número de round-trips Cursor → Gateway → Browser Tool → Chrome (~6–12 s cada).  
**Escopo deste doc:** só a etapa de **preencher lead + aceite + validar**. Não inclui clicar em **Inscreva-se**.

---

## 1. O que o `fillLeadForm()` executa hoje (caminho medido)

No teste registrado em `measure-fillLeadForm.json`, o path efetivo foi **`snapshot-fill-primary`** (~21,8 s). Chamadas ao navegador **dentro do helper** (excluindo `focus` / login / CTA do agente):

| # | Tipo | Comando OpenClaw | Papel | Round-trip? |
|---|------|------------------|-------|-------------|
| 1 | **snapshot** | `browser snapshot --efficient --limit 50` | Localizar refs semânticos (Nome / E-mail / Telefone / checkbox privacidade) via árvore acessível | Sim |
| 2 | **fill** | `browser fill --fields [...]` | Escrever os 3 campos de uma vez (refs do snapshot) | Sim |
| 3 | **click** | `browser click <ref>` | Marcar checkbox de aceite **somente se** o snapshot não trouxe `[checked]` | Condicional (0 ou 1) |
| 4 | **evaluate** | `browser evaluate --fn …` | **Validate:** reler DOM, conferir valores/aceite, montar `ok` / `errors` / `values` | Sim |

**Total típico no caminho feliz:** **3 round-trips** (snapshot + fill + evaluate).  
Com checkbox desmarcado: **4** (+ click).

### 1.1 Caminho alternativo `preferNative: true` (não usado no teste final)

Se ativado, o helper ainda pode emitir:

| # | Tipo | Papel |
|---|------|--------|
| 1 | **evaluate** | Localizar + setNative multi-candidato + marcar aceite + validar no purchase box |
| 2–4 | **snapshot + fill + evaluate** (e click opcional) | “Reforço” / fallback porque React `type=email` muitas vezes **não** aceita só setter DOM |

Nesse modo o pior caso chega a **~4–5 round-trips** — pior para performance.

### 1.2 O que **não** é chamada do helper (mas aparece no run)

| Tipo | Quem | Nota |
|------|------|------|
| focus / navigate / login telemarketing | Agente | Fora do contrato do lead helper |
| click **Inscreva-se** | Agente | Decisão de navegação — **proibido** na transaction |
| validate “apareceu polo?” | Agente | Validação de **fluxo**, não de campo |

### 1.3 Por que encapsular não acelerou

Cada linha da tabela acima paga o imposto Gateway/CDP (~6–12 s).  
Juntar fills em um `fill` de 3 campos economiza **pouco** frente a 3× overhead de protocolo.  
**Conclusão do experimento:** o ganho de performance exige **reduzir o número de chamadas**, não só o número de campos por chamada.

---

## 2. Proposta: uma Browser Transaction = **uma** chamada

### 2.1 Definição

**Browser Transaction (LeadFill):** um único `browser evaluate --fn <transaction>` (ou equivalente futuro tipo `browser act` batch, se existir) que, **dentro do processo do Chrome**, executa locate → fill → aceite → validate e devolve um JSON fechado.

```
Agente                         Gateway / Browser Tool              Página (Chrome)
  |                                    |                                |
  |  evaluate(LeadFillTransaction)     |                                |
  |----------------------------------->|  CDP Runtime.evaluate          |
  |                                    |------------------------------->|
  |                                    |     locate + set + check +     |
  |                                    |     validate (tudo in-page)     |
  |                                    |<-------------------------------|
  |  { success, errors, valuesFound,   |                                |
  |    nextActionSuggested }           |                                |
  |<-----------------------------------|                                |
```

**Uma** seta Cursor→Gateway→Chrome para a etapa lead.

### 2.2 Contrato de entrada (payload)

```json
{
  "nome": "Gabo Loko Teste Helper",
  "email": "gaboloko@gmail.com",
  "telefone": "11987124916"
}
```

Normalizações permitidas **dentro** da transaction (execução, não navegação):

- Title Case no nome  
- e-mail lower-case  
- telefone só dígitos na comparação  

### 2.3 Contrato de saída (obrigatório)

```json
{
  "success": true,
  "errors": [],
  "valuesFound": {
    "nome": "Gabo Loko Teste Helper",
    "email": "gaboloko@gmail.com",
    "telefone": "(11) 98712-4916",
    "aceite": true
  },
  "nextActionSuggested": "click_inscreva_se"
}
```

| Campo | Quem interpreta | Significado |
|-------|-----------------|-------------|
| `success` | Agente | Campos + aceite ok no **purchase box** (perto do CTA) |
| `errors[]` | Agente | `{ field, code, message, value? }` — sem sucesso parcial silencioso |
| `valuesFound` | Agente | O que o DOM do lead realmente contém após a tentativa |
| `nextActionSuggested` | Agente | **Sugestão**, não ordem. Ex.: `click_inscreva_se` \| `retry_lead_fill` \| `ask_human_data` \| `abort_lead_not_on_page` |

A transaction **nunca**:

- clica em **Inscreva-se** / links `processo-seletivo`  
- navega / muda URL  
- escolhe curso, polo ou ingresso  
- abre abas  

### 2.4 Semântica de localização (in-page, sem IDs rígidos)

Ordem sugerida (espelha o que já aprendemos no helper):

1. Âncora: `button` visível com texto **Inscreva-se** (purchase box), **não** `<a href*="processo-seletivo">`.  
2. Candidatos `input` visíveis; score por aria-label / label / placeholder / `type` (`email`, `tel`) / texto “Nome”, “E-mail”, “Telefone”.  
3. Desempate: **menor distância** ao CTA (purchase box > popup WhatsApp).  
4. Aceite: checkbox cujo label/texto contenha privacidade / autorizo / LGPD; senão, checkbox mais próximo do CTA.  
5. Escrita: native value setter + `input`/`change`/`blur`; se `type=email` do purchase box continuar vazio, tentar o segundo candidato **ainda próximo do CTA** (não o popup).  
6. Validação: reler **apenas** os inputs amarrados ao purchase box (`name`/`proximidade`); comparar com payload.

Tudo isso ocorre **sem** novo snapshot CDP e **sem** `fill`/`click` separados — um único script no page context.

### 2.5 Pseudocódigo da transaction

```text
function LeadFillTransaction({ nome, email, telefone }):
  normalize(payload)
  if page does not look like PDP lead (no Inscreva-se button nearby):
    return { success:false, errors:[{code:NOT_ON_LEAD_FORM}], valuesFound:null,
             nextActionSuggested: "abort_lead_not_on_page" }

  cta ← findInscrevaSeButton()
  nomeEl, emailEl, phoneEl ← pickFieldsNear(cta)
  privacyEl ← pickPrivacyNear(cta)

  if any field missing:
    return { success:false, errors:[NOT_FOUND...], nextActionSuggested: "abort_lead_not_on_page" }

  setField(nomeEl, nome); setField(emailEl, email); setField(phoneEl, telefone)
  ensureChecked(privacyEl)

  valuesFound ← read(nomeEl, emailEl, phoneEl, privacyEl)
  errors ← diff(valuesFound, payload)

  if errors empty:
    return { success:true, errors:[], valuesFound, nextActionSuggested: "click_inscreva_se" }
  else:
    return { success:false, errors, valuesFound, nextActionSuggested: "retry_lead_fill" | "ask_human_data" }
```

### 2.6 Papel do agente (inalterado no híbrido)

| Agente faz | Transaction faz |
|------------|-----------------|
| Descobrir que a tela é PDP com lead | — |
| Decidir **quando** chamar `LeadFillTransaction` | Executar locate/fill/aceite/validate |
| Ler `success` / `errors` | — |
| Decidir se clica **Inscreva-se** | No máximo sugere `click_inscreva_se` |
| Validar resultado de negócio (ex.: apareceu polo) | — |
| Decidir próximo passo do funil | — |

---

## 3. Como encaixar no OpenClaw (opções de implementação futura)

| Opção | Mecanismo | Prós | Contras |
|-------|-----------|------|---------|
| **A — `evaluate` monolítico** (recomendada p/ experimento) | Um `--fn` com todo o pseudocódigo | Já existe; 1 RT; sem mudar Gateway | Precisa robustez React in-page; PowerShell/escaping no Windows |
| **B — extensão Browser Tool `transaction`** | Novo verb no plugin que roda script versionado no browser | API limpa; versionamento | Exige mudança OpenClaw |
| **C — CDP `Runtime.callFunctionOn` batch** | Mesmo que A, via API HTTP do gateway | Útil se CLI for o gargalo de spawn | Ainda 1 evaluate sob o capô |

**Recomendação para o experimento:** Opção **A**, exposta como `transactions/leadFill.mjs` (ou renomear o helper atual), **substituindo** a sequência snapshot→fill→click→evaluate por **um** evaluate.

Meta de latência da etapa: **~1× overhead CLI** (ordem de **6–12 s**) em vez de **~3×** (18–35 s).

---

## 4. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| React controlado ignora setter | Já observado; multi-candidato **perto do CTA**; se falhar, `success:false` + `ask_human_data` / retry — **sem** segundo round-trip automático no v1 da transaction (manter 1 call; agente decide retry) |
| Popup WhatsApp “rouba” campos | Âncora obrigatória no botão Inscreva-se do purchase box |
| Agente trata `nextActionSuggested` como ordem | Documentar no contrato: **hint only** |
| Script enorme no `--fn` | Manter arquivo fonte no repo; runner Node passa string (evitar PowerShell) |
| Misturar click Inscreva-se “para medir mais rápido” | **Proibido** — quebra o híbrido e o gol de teste isolado |

---

## 5. Critério de sucesso do experimento (quando for implementar)

1. **Exatamente 1** chamada browser tool para a etapa lead (além do que o agente já fez para chegar na PDP).  
2. Payload de retorno no schema da §2.3.  
3. Em caminho feliz: `success:true` e `nextActionSuggested: "click_inscreva_se"`.  
4. Agente clica CTA em chamada **separada** e valida polo.  
5. Comparar:  
   - `lead_transaction_ms` (1 RT) vs  
   - `fillLeadForm` atual (~3 RT, ~22 s) vs  
   - baseline pré-helper (~13 s fill+snap, mas com retries no CTA).

---

## 6. Fora de escopo (agora)

- Implementar a transaction  
- Novos helpers (`selectPolo`, checkout, etc.)  
- Mudar o VTEX Agent / modelo LLM  
- Clicar Inscreva-se dentro da transaction  

---

## 7. Resumo executivo

O helper atual ainda faz **snapshot + fill (+ click) + evaluate** = vários impostos de Gateway.  
A Browser Transaction proposta move locate/fill/aceite/validate para **um único `evaluate` in-page**, devolve `{ success, errors, valuesFound, nextActionSuggested }`, e deixa o agente decidir o clique e o fluxo.  
É o próximo experimento de performance coerente com a arquitetura híbrida — **sem** implementar ainda.
