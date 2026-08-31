# Fluxo: Graduação — Vestibular Redação

Status: **não homologado** — descoberta incompleta.

Pré-requisito compartilhado: [`common/identificacao-candidato.md`](./common/identificacao-candidato.md)

Não inventar `codVest`, `seqVest`, campanha, lead ou assemblies.

## O que já existe no repositório (não é funil completo)

- Em `post-order` / Golden Path há mapa `tipoProva`: `"Vestibular Redação"` → `VESTIBULAR_REDACAO`.
- Isso indica que `GET /v1/getProvaUrl` **conhece** esse tipo; **não** confirma payload de lead, campanha nem addToCart.

## Ainda não observado

- Forma de ingresso exata no assembly `"Forma de Ingresso"`
- `codVest` / `seqVest` / `campanhaId` / `campanhaNome` desta modalidade
- Campos extras no lead
- Critério de sucesso (provavelmente `provaLink` de redação — a confirmar)

## Descoberta read-only (2026-08-27)

`POST /_v/wrapper/api/campaigns/164250` sem body → HTTP 400, validação Joi: **`codVest` is required**.

Sem `codVest` conhecido não há como listar formas de ingresso por esse endpoint. O valor 581 pertence só ao Golden Path (Múltipla Escolha) e **não** será reutilizado aqui.

`GET /_v/getprices/{ref}` → HTTP 405 Method Not Allowed (método ainda não confirmado).

Não promover este fluxo até haver evidência de campanha/ingresso específica de Redação.
