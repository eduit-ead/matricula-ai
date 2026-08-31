# Fluxo: Pós-graduação

Status: **não homologado** — tratado como fluxo **separado** de Graduação.

Pré-requisito compartilhado (herdado até contraexemplo):  
[`common/identificacao-candidato.md`](./common/identificacao-candidato.md)

ID interno: `pos`.

## Fatos de catálogo (Excel)

- `Department` = `Pós-Graduação` (867 produtos em `cursos.xlsx`)
- `Product reference code` sempre prefixo `007…` (Graduação usa `012…`)
- `deriveCodigoCurso` do Golden Path **não se aplica** (regex só `0120000000(\d+)`)

## Ainda não observado

- PDP / slug (não assumir `grad-…`)
- campanha, lead, assemblies, setprices, checkout, pós-pedido

Não reutilizar o pipeline de `graduacao_multipla` até evidência VTEX.
