# Etapa compartilhada: Identificação do candidato

**Classificação:** etapa **comum** aos fluxos de inscrição assistida na VTEX Cruzeiro — não é exclusiva de Graduação.

**Por quê comum (e não só Graduação):**

- O CTA **Entrar como cliente** aparece no chrome do site (header), não dentro de um funil específico.
- A regra de negócio é **antes da escolha do curso**: identifica o candidato (e-mail) para a sessão de atendimento/matrícula.
- Até haver contraexemplo documentado, ENEM, Transferência, Segunda Graduação e Pós **herdam** esta etapa.

**Dono canônico deste passo:** este arquivo.  
Localizadores semânticos → `knowledge/locators.md` (seção Identificação).  
Não duplicar o procedimento nos `knowledge/<fluxo>.md` — apenas referenciar.

---

## Objetivo

Identificar o candidato via **Entrar como cliente** com o **e-mail** dele, **antes** de buscar/selecionar curso.

## Pré-condições

- Sessão no storefront (`cruzeirodosul.myvtex.com` ou equivalente).
- E-mail do candidato fornecido pelo operador (dado de entrada).

## Procedimento (alto nível)

1. Observar header / chrome: localizar **Entrar como cliente**.
2. Abrir a ação.
3. Informar o **e-mail do candidato**.
4. Validar que a identificação foi aceita (UI de cliente/atendente atualizada — detalhes a registrar após primeira execução assistida completa).
5. Só então seguir para o fluxo específico (busca de curso, etc.).

## Campos / dados

| Dado | Origem | Notas |
|------|--------|-------|
| E-mail do candidato | Operador | Obrigatório; erro de dados se ausente/inválido |

## Detalhes observados (execução)

- Componente: telemarketing VTEX (`cruzeirodosul-telemarketing-2-x-*`).
- Abrir: clique em `.cruzeirodosul-telemarketing-2-x-loginButton` (texto “Entrar como cliente”).
- Campo: `input` com placeholder **`Ex: example@mail.com`** (visível após abrir).
- Header pode já mostrar `Atendente: …@polo…` sem o cliente estar identificado.

## Ainda a detalhar

- [ ] Botão de confirmar/submit após digitar e-mail
- [ ] Sinais de sucesso (cliente identificado vs só atendente)
- [ ] Erros típicos (e-mail não encontrado, captcha, timeout)
- [ ] Se a etapa é obrigatória também em navegação anônima sem polo

## Fluxos consumidores

| Fluxo | Como referencia |
|-------|-----------------|
| Graduação / Múltipla Escolha | Pré-requisito antes da busca de curso |
| ENEM | Stub — herda quando explorado |
| Transferência | Stub — herda quando explorado |
| Segunda Graduação | Stub — herda quando explorado |
| Pós | Stub — herda quando explorado |

## Classificação documental

| Fato | Onde |
|------|------|
| Obrigatória antes do curso; chrome do site | **este arquivo** |
| Textos/roles do botão e campo e-mail | `locators.md` |
| Padrão “identificar antes de escolher oferta” | `lessons-learned.md` |
| Detalhes só da Graduação após ID | `graduacao-multipla.md` (só referência + o que for exclusivo) |
