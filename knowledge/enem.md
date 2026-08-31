# Fluxo: ENEM

ID interno: `graduacao_enem`. Department de catálogo: `Graduação`.

Pré-requisito compartilhado: [`common/identificacao-candidato.md`](./common/identificacao-candidato.md)

## Status

**Homologado no engine** (`graduacao_enem`, `homologated: true`).  
Descoberto via HAR (2026-08-27) — da escolha de ingresso até preenchimento das notas, **depois** do `orderPlaced`.

Campos extras entram em `additionalData`. `enemMedia` é a média das 5 notas (1 decimal). O storefront decide o resultado assim:

`statusGraduacao = enemMedia >= 300 ? 1 : 2`

| `statusGraduacao` | Significado (my-account-custom) |
|-------------------|----------------------------------|
| `0` | Inscrito — aguardando processo / notas |
| `1` | **Aprovado** — realizar matrícula |
| `2` | **Reprovado** — fazer nova inscrição |

`enemTermo` / `enemAceite` vão `true`. Não há prova (`fetchProva: false`).

Fonte: HAR storefront `cruzeirodosul.myvtex.com`, curso Segurança no Trabalho (`productId` 3540, ref `0120000000445`, `codigoDoCurso` 184450), polo id 50.

## O que o funil faz (confirmado)

O checkout até `transaction` é o **mesmo pipeline de Graduação EAD R$0**. Delta está em `formaIngresso` + notas **após** o pedido.

```
campaigns(codCurso) → PATCH lead (formaIngresso ENEM)
  → addToCart (assembly "ENEM") → setpricescodref
  → checkout (profile, CEP, shipping, transaction)
  → orderPlaced / leadOrderPut
  → tela de notas ENEM
  → PATCH Master Data OP (notas + statusGraduacao=2)
```

**Não há** `getProvaUrl`. `provaData` / `provaLocal` / `provaHora` ficaram `null`.

### 1. Campanha (read)

`POST /_v/wrapper/api/campaigns/184450`

Body observado:

```json
{ "codVest": 581, "codPolo": 50, "seqVest": 1, "turno": "Online", "cupom": "", "isComercial": false }
```

Resposta: `codigo_campanha` 2708, `cod_vest` 581, `seqVest` 1.

Mesma campanha do Golden Path Múltipla (`2708` / `codVest` 581). Neste HAR o `seqVest` da campanha foi **1** (no POC Múltipla o ingresso usava 5).

### 2. Lead — forma de ingresso

String **exata**: `"ENEM"` (não “Ingresso via Enem”).

`PATCH /v1/lead/{uuid}` (passo ficha 3), campos relevantes:

- `formaIngresso` / `formaIngressoValue`: `"ENEM"`
- `treineiro`: `"Não"`, `treineiroAno`: `""`
- `campanhaId`: 2708, `campanhaNome`: `Aprovados - Grad EAD [PDP VTEX]`, `campanhaSeqVest`: 1
- `inscricaoValor`: `"0.00"`
- `enemNumeroInscricao`, `enemAno`: **null neste momento** (notas ainda não existem)

Antes do PATCH, o lead pending ainda tinha `formaIngresso: "Graduação"` e `passoFicha: "2"`.

### 3. Carrinho

`addToCart` SKU 1738, assemblies iguais ao pipeline de Graduação, com:

- `"Forma de Ingresso": "ENEM"`, `"Valor da Inscricao": 0`
- Campanha: `Id` 2708, `codVest` 581, `seqVest` 1, `codCurso` `"184450"`

### 4. setprices

`POST /_v/setpricescodref/0120000000445?...&codCurso=184450&codVest=581&codPolo=50&seqVest=1&inscricaoValor=0.00`

### 5. Pedido

`POST .../transaction` → `orderGroup` criado. Checkout de perfil/CEP/shipping igual ao caminho R$0.

Pós-pedido: `GET /_v/order14/{og}-01`, `GET /_v/leadOrder/{email}`, `PUT /_v/leadOrderPut/` com `formaIngresso: "ENEM"` e `statusGraduacao: "0"`.

### 6. Notas ENEM (depois do orderPlaced)

Tela em Minhas Inscrições / acompanhamento. Persistência:

`PATCH /api/dataentities/OP/documents/{leadId}?an=cruzeirodosul`

```json
{
  "enemAno": "2023",
  "enemCHumanas": 568,
  "enemCNatureza": 586,
  "enemLinguagens": 970,
  "enemMatematica": 566,
  "enemRedacao": 703.5,
  "enemTermo": true,
  "enemAceite": true,
  "enemMedia": 678.7,
  "statusGraduacao": 1
}
```

HAR de **reprovação** (média 209.8) enviou o mesmo PATCH com `statusGraduacao: 2`. Isso não é “notas gravadas”; é o resultado do corte `média >= 300`.

Neste HAR aprovado `enemNumeroInscricao` permaneceu `null`.

Após o PATCH aprovado, `statusGraduacao` passa de `"0"` para `"1"`.

`enemMedia` observada = média das 5 notas (4 áreas + redação).

### 7. Sync SIAA (assíncrono) vs Iniciar matrícula

O checkout + notas **já criam** a inscrição. O SIAA indexa **depois** (minutos a horas). Consulta no dia seguinte (2026-08-28) achou no SIAA candidatos cujo lead VTEX ainda tinha `inscricaoSIAA: null`.

O botão **Iniciar matrícula** **não** é o que cria o vestibular. É o passo seguinte (abrir matrícula no SIAA), e só funciona se o candidato **já** estiver lá:

```
GET https://siaa.cruzeirodosul.edu.br/vestibular-inscricao/resultado/matricula-unificada.jsf?inicio=1&codigoEmpresa=12&cpfCandidato={cpfDigits}
```

Cedo demais (mesmo após ~2,5 min e 3 GETs) → `alerta.xhtml?codigoProcedimento=0`. Com cookies da VTEX → HTTP 403. `codigoEmpresa=NaN` → `aviso.jsf`.

Poll de 30s em `lead.inscricaoSIAA` **não** é critério de sucesso do ENEM: o número pode não voltar para o lead mesmo com o registro já no SIAA. Buscar no SIAA por CPF.

## Critério de sucesso

Não é `provaLink` nem `inscricaoSIAA` imediato no lead.

1. Pedido: `orderGroup` + ficha `formaIngresso=ENEM`
2. Notas: documento OP com `enemAceite=true` e `statusGraduacao=1` (média ≥ 300)
3. SIAA: candidato localizável por CPF (atraso possível; o lead VTEX pode continuar `inscricaoSIAA=null`)

## Campos extras (UI)

| Campo | API | Obrigatório neste HAR |
|-------|-----|------------------------|
| Ano ENEM | `enemAno` | sim (enviado) |
| Ciências Humanas | `enemCHumanas` | sim |
| Ciências da Natureza | `enemCNatureza` | sim |
| Linguagens | `enemLinguagens` | sim |
| Matemática | `enemMatematica` | sim |
| Redação | `enemRedacao` | sim |
| Aceite/termo | `enemAceite`, `enemTermo` | sim (true) |
| Nº inscrição ENEM | `enemNumeroInscricao` | não preenchido |
| Média | `enemMedia` | calculada no cliente |

## Ainda a confirmar

- Se `seqVest=1` é regra do ENEM ou só desta campanha/oferta
- Se `Tipo do Curso` / `Unidade` do SKU (ex.: Pedagogia Semipresencial `unidade: 18`) devem variar por produto
- Se o GET SIAA exige cookie de sessão VTEX em alguns casos (HAR Luan gerou no 302 sem auth extra)
