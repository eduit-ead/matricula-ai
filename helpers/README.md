# Helpers (execução híbrida)

Helpers executam **apenas** grupos de ações repetitivas no browser.

## Contrato

| Responsável | Faz | Não faz |
|-------------|-----|---------|
| **Agente** | Descobrir onde está, decidir próxima etapa, validar resultado de negócio/navegação | Preencher formulários campo a campo quando existir helper |
| **Helper** | Localizar controles semânticos, preencher, marcar aceite, retornar ok/erro detalhado | Decidir navegação, escolher fluxo, clicar CTA de avanço de funil |

## Helpers disponíveis

| Helper | Entrada | Efeito | Não faz |
|--------|---------|--------|---------|
| [`fillLeadForm`](./fillLeadForm.mjs) | `nome`, `email`, `telefone` | **Adapter temporário** → `runStageTransaction("lead-pdp", payload)` | Preferir Runtime direto |

Runtime: [`../transactions/`](../transactions/) — genérico; stage [`lead-pdp`](../transactions/stages/lead-pdp.json).

## Como o agente usa

1. Observar: confirmar que a tela é PDP com formulário de lead.
2. Chamar o helper / `runStageTransaction({ stageId: "lead-pdp", values })`.
3. Se `success: false` → tratar `errors` / `nextActionSuggested` sem inventar fluxo.
4. Se `success: true` → **decidir** o próximo passo (ex.: clicar Inscreva-se).
