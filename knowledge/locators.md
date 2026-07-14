# Catálogo de localizadores (semânticos)

Somente localizadores **reutilizáveis** entre telas/fluxos.  
Nunca coordenadas. Refs efêmeras (`e15` de uma sessão) **não** entram aqui — só padrões estáveis (texto, role, label…).

Confiabilidade: `alta` | `média` | `baixa`.

---

## Busca (vitrine / categoria)

| Intenção | Role / texto | Alternativas | Conf. | Notas |
|----------|--------------|--------------|-------|-------|
| Campo busca | `textbox "O que você procura? Buscar produtos"` | `combobox "O que você procura?"` | alta | Preferir textbox para digitar |
| Submeter busca | `button "Buscar produtos"` | submit no textbox | alta | Validar URL com `_q=` / map |

---

## Navegação / chrome do site

| Intenção | Role / texto | Alternativas | Conf. | Notas |
|----------|--------------|--------------|-------|-------|
| Entrar no funil Graduação | URL `/graduacao` + heading Graduação | link `Graduação` | alta | Home pode estabilizar em `/graduacao` |
| Ignorar ruído | — | — | alta | Não focar abas ads/recaptcha/SW |

---

## Identificação do candidato (comum)

Procedimento → `knowledge/common/identificacao-candidato.md`.

| Intenção | Role / texto | Alternativas | Conf. | Notas |
|----------|--------------|--------------|-------|-------|
| Abrir identificação | texto `Entrar como cliente` | classe `.cruzeirodosul-telemarketing-2-x-loginButton` | alta | No chrome; snapshot efficient às vezes **não** expõe ref — pode exigir clique no botão telemarketing |
| E-mail do candidato | `input` placeholder `Ex: example@mail.com` | — | alta | Aparece após abrir o login telemarketing; distinto do lead `E-mail` da PDP |
| Sessão atendente | texto `Atendente: …@polo…` | — | média | Header; indica sessão de polo, não necessariamente cliente já identificado |

---

## Resultado de busca (SERP)

| Intenção | Role / texto | Alternativas | Conf. | Notas |
|----------|--------------|--------------|-------|-------|
| Filtrar Graduação | `checkbox "Graduação"` | departamento / área | média | Usar se misturar pós/livres |
| Card curso canônico | `link` com nome curto do curso | breadcrumb + PDP slug `grad-.../p` | média | Evitar cards “6 meses” sem confirmação |

---

## PDP (página de produto curso)

| Intenção | Role / texto | Alternativas | Conf. | Notas |
|----------|--------------|--------------|-------|-------|
| CTA inscrição | `button "Inscreva-se"` | `link "Inscreva-se"` | alta* | *alta para achar CTA; validade se inicia funil real = a confirmar |
| Lead nome | textbox / label / placeholder com “Nome” ou “Nome completo” | proximidade do `button "Inscreva-se"` (purchase box) | alta | Preferir formulário do CTA; evitar popup WhatsApp |
| Lead e-mail | label/placeholder “E-mail” ou `type=email` | — | alta | Não usar placeholder `Ex: example@mail.com` (telemarketing) |
| Lead telefone | label/placeholder “Telefone” / `type=tel` | — | alta | |
| Consentimento | checkbox com texto Política de Privacidade / autorizo | checkbox mais próximo do CTA | alta | Helper `fillLeadForm` marca; agente decide clicar Inscreva-se |
| Simular preço | `button "Simular Investimento"` | — | alta | Fora do funil de inscrição |
| Como matricular | `link "Como se matricular"` | — | média | Conteúdo |

\* Registrar variantes por fluxo em `knowledge/<fluxo>.md` quando o CTA diferir.

---

## Forma de ingresso (pendente de validação)

| Intenção | Role / texto | Alternativas | Conf. | Notas |
|----------|--------------|--------------|-------|-------|
| Múltipla Escolha | *(ainda não observado)* | — | — | Preencher após primeira ocorrência real |

---

## Template para novos itens

```
Intenção:
Tela:
Role/texto:
aria-label:
placeholder:
label:
Alternativas:
Confiabilidade:
Fluxos que usam:
```
