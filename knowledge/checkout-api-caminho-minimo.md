# Caminho mínimo até orderGroup (POST transaction)

**Fonte:** `cruzeirodosul.myvtex.com.har` (2026-08-25)  
**Escopo:** inscrição Graduação EAD com **valor R$ 0** → `transaction` retorna `id: "NO-PAYMENT"` e `orderGroup`.  
**Não cobre:** pagamento com valor &gt; 0, VTEX Payments, `attachments/paymentData`.  
**Objetivo do documento:** menor conjunto de chamadas para chegar à criação do `orderGroup`. Sem implementação.

---

## 1. Veredito

| Conclusão | Confiança |
|-----------|-----------|
| É possível chegar ao `orderGroup` sem renderizar PDP/Checkout UI, desde que se reproduzam as mutações de orderForm + APIs custom Cruzeiro | **Alto** |
| O menor conjunto **observado** neste HAR (caminho crítico) tem ~12–15 mutações úteis; parte é redundante (profile 3×, clientupdate 2×) | **Alto** |
| O menor conjunto **estritamente VTEX** (sem `/v1/lead`, `setpricescodref`, `clientupdate`, `leadUpdateAddress`) **pode** criar pedido, mas é **não validado** neste HAR e provavelmente quebra regras de negócio Cruzeiro | **Baixo** (não testado) |
| Cookies vieram stripped no HAR → nomes exatos são inferência padrão VTEX | **Médio** |

---

## 2. Menor conjunto proposto (até POST transaction)

Duas camadas:

### 2.1 Camada A — necessária para o Checkout VTEX aceitar `transaction` (hipótese técnica)

| # | Chamada | Papel |
|---|---------|--------|
| A1 | `POST /api/sessions` **ou** GQL `Session` / `session` | Bootstrap de segmento/sessão |
| A2 | GQL `orderForm` **ou** `POST /api/checkout/pub/orderForm` | Obter/criar `orderFormId` |
| A3 | GQL `addToCart` **ou** equivalente REST `…/items` + attachments de item | Colocar SKU no OF (sem item, transaction falha) |
| A4 | `POST …/attachments/clientProfileData` | `clientProfileData` mínimo |
| A5 | `POST …/attachments/shippingData` | Endereço + SLA (neste fluxo houve delivery) |
| A6 | `POST …/orderForm/{id}/transaction` | Cria `orderGroup` |

Auxiliares fortemente acoplados no HAR (antes do transaction):

| # | Chamada | Papel |
|---|---------|--------|
| A4b | `PUT …/customData/profile/birthDate` | Presente antes do profile final / shipping |
| A4c | `POST …/attachments/clientPreferencesData` | Presente imediatamente antes do shipping |
| A5b | `GET …/postal-code/BRA/{cep}` | Resolve campos do endereço (pode ser montado offline se já tiver o payload) |

**Confiança Camada A como “suficiente sozinha”:** **Baixo/Médio** — estrutura clássica VTEX, mas este HAR sempre executou também a Camada B.

### 2.2 Camada B — custom Cruzeiro observada no caminho crítico (até transaction)

| # | Chamada | Papel | Confiança de obrigatoriedade para *negócio* | Confiança de obrigatoriedade para *VTEX transaction* |
|---|---------|-------|-----------------------------------------------|------------------------------------------------------|
| B1 | `POST /v1/lead/` | Cria lead; devolve UUID | **Alto** | **Médio** (UUID vai no assembly do addToCart) |
| B2 | `PATCH /v1/lead/{uuid}` (×2 no HAR: polo + forma ingresso) | Completa ficha | **Alto** | **Baixo** (não toca OF diretamente) |
| B3 | `POST /_v/wrapper/api/campaigns/{codCurso}` + `/_v/getprices/{ref}` | Oferta/campanha/preço UI | **Médio** | **Baixo** (não alteram OF; dados reaparecem no addToCart) |
| B4 | Assemblies no `addToCart` (Polo, Campanha, Documento ID=lead UUID, Forma de Ingresso, etc.) | Metadados no item | **Alto** | **Médio/Alto** (attachment de item; pode ser validado server-side) |
| B5 | `POST /_v/setpricescodref/{ref}` | Ajusta preço inscrição no OF (`inscricaoValor: 0.00`) | **Alto** | **Médio** (garante `value:0` / totalizers) |
| B6 | `PATCH /_v/clientupdate/` | CL / binding / ficha | **Alto** (pós-venda/CRM) | **Baixo** |
| B7 | `POST /api/io/v1/leadUpdateAddress/{uuid}` | Sync lead ↔ OF antes do pedido | **Médio/Alto** | **Baixo** |

### 2.3 Sequência mínima recomendada (prática, baseada no HAR)

Ordem com dependências:

```
sessions / Session
    → orderForm (obter orderFormId)
        → POST /v1/lead  (precisa orderFormId no body neste HAR)
            → PATCH /v1/lead (polo / campanha)
                → PATCH /v1/lead (forma ingresso, inscricaoValor 0)
                    → attachments/clientProfileData (email/nome/phone)
                        → GQL addToCart (SKU + assemblies; Documento ID = lead UUID)
                            → setpricescodref (orderFormId + itemIndex 0)
                                → [opcional para transaction] clientupdate
                                    → customData birthDate
                                        → clientProfileData (CPF completo)
                                            → clientPreferencesData
                                                → postal-code → shippingData
                                                    → leadUpdateAddress
                                                        → POST transaction  → orderGroup
```

**Pós-transaction (fora do escopo “criar orderGroup”, mas no HAR):** `GET orderPlaced`, `_v/leadOrderPut`, `_v/order14/{og}-01`.

---

## 3. Dependências obrigatórias entre chamadas

| Dependência | Tipo | Evidência no HAR | Confiança |
|-------------|------|------------------|-----------|
| `orderFormId` **antes** de lead POST | Obrigatória (neste app) | Body do `POST /v1/lead` já inclui `orderFormId` | **Alto** |
| Lead UUID **antes** de `addToCart` | Obrigatória (neste app) | Assembly `Documento ID` = UUID do lead | **Alto** |
| `clientProfileData` **antes** de `addToCart` | Observada; pode ser relaxável | Profile anexado ~1s antes do addToCart | **Médio** |
| `addToCart` **antes** de `setpricescodref` | Obrigatória | `itemIndex: "0"` no setprices | **Alto** |
| `setpricescodref` **antes** de `transaction` com value 0 | Provável | Garante preço inscrição; transaction usou `value:0` | **Médio** |
| `shippingData` **antes** de `transaction` | Obrigatória neste fluxo | Várias escritas de shipping imediatamente antes | **Alto** |
| Profile com `document` **antes** de `transaction` | Provável | Último profile (~181s) já tem CPF; transaction ~198s | **Médio** |
| `birthDate` customData **antes** de `transaction` | Observada | PUT birthDate ~180s | **Médio** |
| `leadUpdateAddress` **antes** de `transaction` | Observada; pode ser só sync | ~2s antes do transaction | **Baixo/Médio** |
| `marketingData` / `clientPreferencesData` **antes** de `transaction` | Fraca | Presentes, mas tipicamente não bloqueiam pedido free | **Baixo** |
| `GET /checkout/` HTML | Não obrigatória para API | Só carrega UI | **Alto** (é cosmética p/ orderGroup) |
| `simulation` (PDP shelf) | Não obrigatória | Não persiste OF | **Alto** |
| `paymentData` / Payments | Não usada | `NO-PAYMENT` | **Alto** (só neste funil R$0) |

### Grafo resumido

```
[Session] → [orderFormId]
               ↓
            [Lead POST/PATCH] → leadUUID
               ↓
            [clientProfileData]
               ↓
            [addToCart(SKU+assemblies)] → items[0]
               ↓
            [setpricescodref]
               ↓
            [birthDate + profile CPF + shippingData]
               ↓
            [transaction] → orderGroup
```

Laterais (negocio/CRM, fraca ligação ao orderGroup VTEX): `getprices`, `campaigns`, `clientupdate`, `leadUpdateAddress`.

---

## 4. Campos que mudam a cada execução

| Campo | Onde | Natureza | Confiança |
|-------|------|----------|-----------|
| `orderFormId` | Cookie / GQL orderForm / URLs | Novo ou reusado por sessão browser | **Alto** |
| `lead` UUID | `POST /v1/lead` response | Novo por inscrição | **Alto** |
| `orderGroup` | Response de `transaction` | Novo por pedido | **Alto** |
| `email`, `firstName`, `lastName`, `phone`, `document` | profile / lead / clientupdate | Dados do candidato | **Alto** |
| `birthDate` | customData + clientupdate + leadUpdateAddress | Dados do candidato | **Alto** |
| Endereço / `postalCode` / `addressId` | shippingData | Dados do candidato; `addressId` gerado | **Alto** |
| `poleId`, `pole`, city/state | lead PATCH + assembly Polo | Escolha do usuário | **Alto** |
| `formaIngresso` / assemblies Campanha / `codVest` / `seqVest` | lead + addToCart + setprices | Oferta selecionada | **Alto** |
| `sku` / `id` do item (`1738` neste HAR) vs `productId` (`3667`) | addToCart | Por produto/oferta; **não usar productId como item id** | **Alto** |
| `productRefId` / path setprices (`0120000000370`) | setprices / getprices | Ref do SKU/curso | **Alto** |
| `campanhaId`, `codCurso` (`163700`), `marca`, `ciclo` | lead / campaigns / assemblies | Catálogo/campanha vigente | **Médio** (mudam com calendário comercial) |
| `value` / `referenceValue` no transaction | transaction body | Aqui `0`; mudaria se inscrição paga | **Alto** |
| `bindingId`, `bindingUrl`, UTMs | clientupdate | Sessão/origem | **Médio** |
| `impersonate` (GQL no início do HAR) | GraphQL | Operador/social selling — **pode não existir em fluxo aluno** | **Médio** |
| Timestamps / `subscriptionDate` / `bindingId` datetime | lead / clientupdate | Por execução | **Alto** |

---

## 5. Cookies necessários

**Limitação:** o HAR foi exportado **sem** `Cookie` / `Set-Cookie` (sanitizado). Nomes abaixo são o padrão VTEX Checkout + o que o fluxo implica.

| Cookie (esperado) | Função | Necessário p/ Node? | Confiança do nome |
|-------------------|--------|---------------------|-------------------|
| `CheckoutOrderForm` (ou equivalente `__ofid`) | Liga requests ao `orderFormId` | Sim, **ou** passar `orderFormId` só na URL (REST pub) | **Médio** |
| `vtex_session` | Sessão IO / segment | Provável após `POST /api/sessions` | **Médio** |
| `vtex_segment` | Canal, cultura, binding | Provável | **Médio** |
| `VTEXSC` | Sales channel | Comum em storefront | **Baixo/Médio** |
| `VtexIdclientAutCookie` | Usuário logado | **Não** neste HAR (guest) | **Alto** (ausência de auth headers) |
| Cookies de operador / impersonate | Social selling | Só se o fluxo for assistido | **Médio** |

**Para cliente Node:** o caminho mais estável é:

1. `POST /api/sessions` → capturar `Set-Cookie`
2. GQL/`orderForm` → capturar `orderFormId`
3. Reenviar o jar de cookies em todas as chamadas same-site `*.myvtex.com`

**Confiança geral desta seção:** **Médio** (padrão VTEX alto; binding exato ao HAR baixo).

---

## 6. Headers necessários

| Header | Valor típico | Obrigatório? | Confiança |
|--------|--------------|--------------|-----------|
| `Content-Type` | `application/json` (REST); GraphQL JSON | Sim nas mutações | **Alto** |
| `Accept` | `application/json` ou `*/*` | Recomendado | **Alto** |
| `Origin` | `https://cruzeirodosul.myvtex.com` | Provável (CORS browser); Node pode omitir se server-side permitir | **Médio** |
| `Referer` | PDP ou `/checkout/` | UI envia; server pode checar | **Baixo/Médio** |
| `Cookie` | jar da sessão | Sim no modelo browser | **Alto** |
| `x-vtex-api-appKey` / `appToken` | — | **Não** no HAR (API pública pub) | **Alto** |
| `Authorization` / header VTEX ID | — | **Não** (guest) | **Alto** |

GraphQL (`/_v/private/graphql/v1`): body com `operationName` + `extensions.persistedQuery` (sha256). Alternativa Node: usar REST Checkout em vez de persisted queries (mais portável).

---

## 7. Chamadas cosméticas (para chegar ao orderGroup)

| Chamada / grupo | Motivo | Confiança |
|-----------------|--------|-----------|
| Dezenas de `POST …/orderForms/simulation` na PDP | Não persistem OF | **Alto** |
| `GET /graduacao`, assets, GraphQL de vitrine | Navegação/UI | **Alto** |
| `GET /checkout/` + checkout-ui JS/CSS | Envelope visual | **Alto** |
| `gift-cards/providers`, `messages/clear` | UI checkout | **Alto** |
| `POST …/orderForm` só com `expectedOrderFormSections` (refresh) | Releitura | **Alto** |
| activity-flow, sp.vtex, rc.vtex, facebook-capi, checkout-pixel | Analytics | **Alto** |
| `dataentities/CM` (tags), segment graphql repetido | UI/merchandising | **Alto** |
| `GET orderPlaced` HTML | **Depois** do orderGroup | **Alto** |
| `_v/leadOrderPut`, `_v/order14`, OMS orders | Pós-pedido | **Alto** (fora do escopo transaction) |
| GQL `subscribeNewsletter`, parte de `Session` duplicada | Ruído de storefront | **Médio** |
| `marketingData` (`vtexSocialSelling`) | Tag de marketing | **Médio** (cosmético p/ OF free; pode importar p/ atribuição) |
| `getprices` / `campaigns` repetidos | Podem ser calculados offline se assemblies já tiverem os valores | **Médio** |

---

## 8. Reprodutibilidade em cliente Node.js (sem browser)

| Chamada | Node sem browser? | Notas | Confiança |
|---------|-------------------|-------|-----------|
| `POST /api/sessions` | **Sim** | Manter cookie jar | **Alto** |
| Checkout REST (`orderForm`, attachments, postal-code, transaction) | **Sim** | API `pub` bem documentada | **Alto** |
| GQL persisted `orderForm` / `addToCart` | **Sim, com ressalva** | Precisa dos sha256 + variables base64; melhor espelhar com REST `items` | **Médio** |
| `POST/PATCH /v1/lead` | **Sim** | Custom; auth aparentemente pública no HAR | **Alto** |
| `setpricescodref`, `clientupdate`, `leadUpdateAddress` | **Sim** | Custom no account; sem browser | **Alto** |
| `getprices` / `campaigns` | **Sim** | | **Alto** |
| Render PDP / Checkout UI / KO templates | **Não necessário** | | **Alto** |
| reCAPTCHA / challenge visual | **Não observado** neste HAR | Outro ambiente pode ter | **Médio** |
| Fluxo com `impersonate` (operador) | **Depende** | Exige credencial/sessão de operador | **Médio** |

**Conclusão:** o caminho até `orderGroup` é **reproduzível em Node** com `fetch`/`axios` + cookie jar, preferindo REST Checkout no lugar de persisted GraphQL.  
**Confiança:** **Alto** para factibilidade técnica; **Médio** para paridade total com regras server-side Cruzeiro.

---

## 9. Riscos: anti-bot, sessão, validação server-side

| Risco | Descrição | Severidade | Mitigação | Confiança |
|-------|-----------|------------|-----------|-----------|
| Cookie / sessão inválida | OF órfão ou 401/403 se jar incompleto | Alta | Sempre `sessions` + reuso do mesmo jar | **Alto** |
| orderFormId de outra sessão | Profile/items em OF errado | Alta | Criar OF fresco por inscrição | **Alto** |
| Validação de assemblies no item | Backend pode exigir Polo/Campanha/Lead UUID | Alta | Replicar assemblies do addToCart | **Médio** |
| `setpricescodref` ausente | `value` ≠ 0 ou preço inconsistente → outro ramo (pagamento) | Alta | Chamar setprices ou garantir totalizers 0 | **Médio** |
| CPF/email já usados / lead duplicado | `GET /v1/lead?_where=…` no HAR sugere dedupe | Média | Tratar PATCH vs POST | **Médio** |
| Impersonate / social selling | HAR começa com GQL `impersonate` — fluxo pode ser de operador | Média | Validar se aluno direto dispensa | **Médio** |
| WAF / bot score / rate limit | Não visível no HAR; comum em VTEX IO | Média | Headers realistas, backoff, IP estável | **Baixo** (não evidenciado) |
| CORS vs server-side | Browser precisa Origin; Node server-side costuma OK | Baixa | Chamar de backend, não do browser de terceiros | **Alto** |
| Referer/binding checks | `clientupdate` manda `bindingUrl` da PDP | Baixa/Média | Enviar binding coerente | **Baixo** |
| Captcha | Não apareceu | — | Reavaliar se passar a falhar | **Médio** |
| Mudança de persistedQuery hash | GraphQL IO quebra se app atualizar | Média | Preferir REST | **Alto** |
| Funil pago | Este documento **não** cobre payment | Crítica se valor&gt;0 | Novo HAR | **Alto** |

---

## 10. Matriz de risco — remover etapas do checkout visual

Interpretação: “remover” = não carregar a UI da etapa; a lógica pode ainda ser chamada via API.

| Etapa visual removida | O que se perde na prática | Risco para chegar ao `orderGroup` | Risco para negócio Cruzeiro (lead/prova/CRM) | Risco residual | Confiança |
|-----------------------|---------------------------|-----------------------------------|----------------------------------------------|----------------|-----------|
| **Remover PDP** | Vitrine, simulations, UX de escolha de curso | **Baixo**, se SKU/ref/campanha/polo já forem conhecidos e injetados no addToCart/setprices | **Médio** — campanha/preço errados se não houver fonte alternativa de oferta | X = **Baixo–Médio** | **Alto** |
| **Remover Lead (UI)** | Formulário passo a passo na PDP | **Alto**, se também omitir `POST/PATCH /v1/lead` (UUID some do assembly) | **Crítico** — ficha/CRM/prova dependem do lead | Y = **Alto / Crítico** sem API lead; **Baixo** se Lead API for mantida | **Alto** |
| **Remover Offer (UI)** | Tela de campanha/preço/condições | **Alto**, se omitir `addToCart` + `setpricescodref` + assemblies | **Alto** — item/preço/campanha incorretos | Z = **Alto** sem Offer API; **Baixo–Médio** se Offer for só UI e APIs forem feitas no backend | **Alto** |
| **Remover Checkout (UI)** | `/checkout/` + checkout-ui | **Baixo** para orderGroup **se** profile, birthDate, shipping e `transaction` forem feitos via REST | **Médio** — validação visual/LGPD/endereço; `leadUpdateAddress`/`clientupdate` ainda recomendados | W = **Baixo–Médio** | **Alto** |
| **Remover orderPlaced (UI)** | Thank-you page | **Nulo** para criar orderGroup (já criado) | **Baixo–Médio** — perde `_v/leadOrderPut` se também omitido | Fora do escopo transaction; risco **Baixo** p/ orderGroup, **Médio** p/ OP entity | **Alto** |

### Forma compacta (pedido do exemplo)

| Remoção | Risco (síntese) |
|---------|-----------------|
| Remover **PDP** | **X = Baixo–Médio** — OK se catálogo/SKU/campanha vierem de outra fonte; perde só discovery UI |
| Remover **Lead** | **Y = Alto/Crítico** — sem `/v1/lead` o funil observado quebra (UUID no carrinho + CRM); remover só a UI e manter API → risco baixo |
| Remover **Offer** | **Z = Alto** — sem `addToCart` (+ setprices/assemblies) não há item/preço coerente para `transaction` |
| Remover **Checkout** | **W = Baixo–Médio** — UI dispensável; REST de profile/shipping/transaction continua obrigatório |

---

## 11. Checklist do menor conjunto (pragmático)

**Incluir (até orderGroup):**

1. Session + obter `orderFormId`
2. Lead `POST` + `PATCH` (até forma ingresso / valor inscrição)
3. `clientProfileData` (mínimo; depois completo com CPF)
4. `addToCart` com assemblies (ou REST equivalente)
5. `setpricescodref`
6. `customData/birthDate`
7. `shippingData` (após CEP)
8. `POST transaction` (`value` alinhado aos totalizers; aqui 0)

**Fortemente recomendado (negócio; fraca prova de bloqueio VTEX):**  
`clientupdate`, `leadUpdateAddress`, `campaigns`/`getprices` (se assemblies não forem montados offline).

**Excluir com segurança para orderGroup:**  
PDP HTML, simulations de prateleira, checkout-ui, pixels, gift-cards, orderPlaced HTML, leadOrderPut (pós).

---

## 12. Limitações deste estudo

1. Um único HAR, um único produto (Administração EAD), inscrição **grátis**.
2. Cookies sanitizados.
3. Possível contexto de **operador** (`impersonate` / `vtexSocialSelling`) — fluxo aluno puro pode diferir.
4. Nenhuma chamada foi removida experimentalmente (análise observacional → confiança “Baixo” onde marcado como hipótese).
5. APIs custom (`/v1`, `/_v`) podem ter validação não visível no status HTTP 200.

---

## 13. Próximo passo sugerido (não executado)

Teste controlado server-side: replay do checklist §11 em ambiente QA, eliminando uma chamada por vez e registrando se `transaction` ainda retorna `orderGroup`. Isso elevaria para **Alto** as conclusões hoje em **Médio/Baixo**.
