# Browser Transaction Runtime

Pilha: `Agent → Runtime → Stage Definition → Write Engine`

## Agent API

```js
import { runStageTransaction } from "./runtime.mjs";

const result = await runStageTransaction("lead-pdp", {
  nome, email, telefone,
});
// { success, confidence, errors, valuesFound, nextActionSuggested, browserCalls, elapsedMs }
```

Only `stageId` + `payload`. OpenClaw runner and Write Engine are internal.

## Write Engine

See [`write-engine/README.md`](./write-engine/README.md).

| | Backend |
|--|---------|
| Produção | `accessibilityFill` |
| Target | low-RT trusted (CDP, …) via registry |

## Stages

| id | Arquivo |
|----|---------|
| `lead-pdp` | [`stages/lead-pdp.json`](./stages/lead-pdp.json) |
| `offer-selection` | [`stages/offer-selection.json`](./stages/offer-selection.json) |

```js
await runStageTransaction("offer-selection", {
  pais: "Brasil",
  cep,
  estado,
  cidade,
  poloPrefix,
  formaIngresso,
});
```

Validação lead: `node transactions/run-architecture-lead.mjs` → `measure-architecture-lead.json`  
Sprint 4 (lead + offer + funil): `node transactions/run-sprint4-offer.mjs` → `measure-sprint4-offer.json`

## Sprint Demo (experiência de execução)

Não altera Runtime / Stages / Write Engine.

```bash
node transactions/run-demo.mjs
node transactions/run-demo.mjs demo-input.example.json
```

- Captura o link da prova **sem abrir**
- Logout do candidato + **opcional** fechamento do browser OpenClaw (`browser.closeOnFinish`)
- Evita `/graduacao` quando a PDP já é conhecida
- **Gate de carrinho** após Continuar (sem navigate se `GATE_CART_NOT_READY`)
- **Runners determinísticos** (Sprint Final), fronteiras por objetivo de negócio:
  - `checkoutRunner` → pedido confirmado (`ORDER_ID` / `og`)
  - `postOrderRunner` → Continuar Processo → (aba) → Minhas Inscrições
  - `captureRunner` → Acompanhar → href da prova (nunca abre)
- **Contrato único (adapters):** `{ success, code, ms, browserCalls, output }` via `demo/runnerContract.mjs` — sem mudar comportamento interno
- Relatório amigável no terminal
- JSON para n8n → `demo-result.json` (campo `n8n`)

### Segurança do browser (obrigatório)

| Config | Default | Efeito |
|--------|---------|--------|
| `browser.closeOnFinish` | `false` | Se `false`, **não** encerra nenhum browser ao final |
| | `true` | Só chama `openclaw browser stop` se o perfil for **local-managed**; se external/attachOnly/incerto → **não fecha nada** |

Nunca usa `taskkill` / `Stop-Process` por nome. Env: `DEMO_BROWSER_CLOSE_ON_FINISH=true|false`.

### Gate Auth (antes do Lead)

Função reutilizável: `ensureCandidateAuthenticated(candidate)` em `transactions/demo/ensureCandidateAuthenticated.mjs`.

Login → poll 30s / 2s → se falhar, **repete só o login**. Após `auth.maxAttempts` → `GATE_AUTH_TIMEOUT`.

Relatório inclui: `attempts`, `tempoGastoMs`, `criterio`, `emailAutenticado`.

| Config | Default |
|--------|---------|
| `auth.maxAttempts` | `3` |
| `auth.gateTimeoutMs` | `30000` |
| `auth.pollMs` | `2000` |

Env: `DEMO_AUTH_MAX_ATTEMPTS`, `DEMO_AUTH_GATE_MS`, `DEMO_AUTH_POLL_MS`.
