# Fluxo: Graduação — Múltipla Escolha

Somente conhecimento **deste funil**.  
Regras gerais → `AGENTS.md`.  
Etapa compartilhada de identificação → [`common/identificacao-candidato.md`](./common/identificacao-candidato.md).  
Localizadores → `locators.md`. Padrões → `lessons-learned.md`.

---

## Meta

Concluir inscrição de **Graduação** com forma de ingresso **Múltipla Escolha**.

**Critério de sucesso (gol):** obter o `href` de **Acessar prova**, **copiar e persistir** a URL (artefato da execução).  
**Proibido:** clicar em **Acessar prova** ou abrir/iniciar a prova no browser.

## Escopo de ambiente

| Item | Valor |
|------|--------|
| Base | `https://cruzeirodosul.myvtex.com` |
| Entrada típica | `/graduacao` |

---

## Pré-requisito (compartilhado)

**Antes da escolha do curso**, executar:

→ [`common/identificacao-candidato.md`](./common/identificacao-candidato.md) (**Entrar como cliente** + e-mail)

Não repetir aqui o procedimento nem os localizadores dessa etapa.

---

## Regras de negócio / ambiguidades (só Graduação)

- Na SERP, preferir o card de Graduação de **nome curto**; cards com “6 meses” tendem a não ser a Graduação canônica.
- Filtro `Graduação` ajuda quando a busca mistura modalidades.
- Na PDP, existem CTA **Inscreva-se**, formulário de **lead** e **Simular Investimento** — não tratar lead como matrícula completa.
- A etapa em que **Múltipla Escolha** aparece ainda **não foi observada**; não inventar o passo.

---

## Etapas

### 0. Identificação do candidato — OBRIGATÓRIA (compartilhada)

Ver [`common/identificacao-candidato.md`](./common/identificacao-candidato.md).  
Status de detalhamento fino: a preencher na próxima execução assistida.

### 1. Entrada / busca — CONCLUÍDA (parcial; ordem corrigida)

- Abrir base → estabiliza em `/graduacao`.
- **Somente após** a etapa 0: localizar busca (`locators.md` — Busca).
- Decisão: usar textbox + submit.

> Nota de correção documental: execuções anteriores avançaram busca/PDP sem formalizar a etapa 0. A ordem correta do funil passa a incluir identificação primeiro.

### 2. Busca do curso — CONCLUÍDA

- Exemplo validado: termo `administração`.
- URL exemplo: `/administração?_q=administração&map=ft`.
- Decisão: abrir card `Administração` (canônico Graduação).

### 3. PDP Graduação Administração — CONCLUÍDA (entrada)

- Slug: `/grad-administracao-cruzeiro-do-sul-virtual/p`
- Título contém `Graduação em Administração EAD`
- CTAs observados: Inscreva-se (link/botão), lead Nome/E-mail/Telefone, checkbox privacidade, Simular Investimento.
- **Gate anterior:** Inscreva-se — reavaliar após cumprir etapa 0 em nova execução.

### 4+ Pendentes

- [ ] Pós–Inscreva-se (formulário/funil)
- [ ] Seleção **Múltipla Escolha**
- [ ] Dados / documentos
- [ ] Confirmação / protocolo

---

## Exceções conhecidas

- Nenhuma bloqueante ainda (captcha presente no DOM, ainda não bloqueou).

## Checklist pós-etapa

```
Etapa / URL / decisão / erros classificados /
o que foi para common vs locators vs lessons vs este arquivo /
próximo gate
```
