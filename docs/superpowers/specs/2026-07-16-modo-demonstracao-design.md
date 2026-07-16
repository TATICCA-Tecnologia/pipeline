# Modo Demonstração (Design)

## Contexto

O Pipeline armazena dados sensíveis de clientes reais (nome da empresa, CNPJ, contatos, nomes de pessoas, e uma quantidade grande de texto livre digitado pelo cliente — descrição do processo, narrativa do projeto, observações, detalhes de sistema existente etc., ver `Project` em `prisma/schema.prisma`). Não existe hoje nenhuma forma de mostrar a plataforma pra alguém de fora (prospect, apresentação interna, gravação de tela) sem expor esses dados.

A ideia é um "modo demonstração": um toggle global, tipo o botão de olho de apps bancários, que quando ativado esconde os campos sensíveis em toda a interface, substituindo por rótulos genéricos e sequenciais ("Empresa 1", "Cliente 1"...), mantendo o resto da plataforma navegável normalmente.

## Requisitos confirmados com o usuário

1. **Público**: qualquer usuário logado pode ativar o toggle (não é restrito a admin).
2. **O que é mascarado**: nome da empresa; contatos da empresa (email, telefone, CNPJ/documento, endereço, site); nomes de pessoas (cliente, desenvolvedor); campos de texto livre explicativos (descrição, narrativa, observações etc.).
3. **O que NÃO é mascarado**: valores financeiros e métricas (economia estimada em R$, horas mensais economizadas, taxa horária) — são parte do que a ferramenta vende, não identificam a empresa.
4. **Estilo de mascaramento**: rótulos genéricos sequenciais determinísticos ("Empresa 1", "Empresa 2", "Cliente 1", "Desenvolvedor 1"...) — o mesmo id real sempre vira o mesmo rótulo dentro da sessão, em qualquer tela. Texto livre vira um placeholder fixo (não numerado, já que não faz sentido identificar "qual texto é qual").
5. **Escopo de proteção**: só visual, client-side. Os dados reais continuam trafegando pro navegador normalmente (SSR/fetch inalterado) — o modo demo apenas troca o que é renderizado na tela. Não protege contra inspeção via DevTools/Network tab; protege contra o que aparece na tela durante uma apresentação/compartilhamento de tela/gravação.
6. **Persistência**: `localStorage`, por navegador/dispositivo. Sobrevive a reload de página, não sincroniza entre dispositivos, não precisa de mudança no backend/schema.
7. **Fora de escopo nesta fase**: exports em PDF/PPTX (deck de payback, slide executivo etc.), nomes de arquivo anexados, comentários, activity log. Esses continuam mostrando dado real mesmo com o modo demo ativo — ver seção "Fora de escopo".

## Arquitetura

### `DemoModeContext`

Novo contexto React client-side (`src/shared/context/demo-mode-context.tsx`, seguindo o padrão de `src/shared/context/auth-context.tsx`), que envolve o layout privado inteiro (`src/app/(private)/layout.tsx`, dentro do `ModalProvider` existente).

Estado exposto:
- `isDemoMode: boolean` — inicializado lendo `localStorage["pipeline:demoMode"]` (fallback `false` no SSR/primeira render, hidratado no `useEffect`), persistido a cada toggle.
- `toggleDemoMode(): void`
- `getSequentialLabel(kind: "empresa" | "cliente" | "desenvolvedor", id: string): string` — mantém um `Map<string, number>` por `kind` em `useRef` (estado interno do contexto, não persistido). Na primeira vez que um `id` aparece, atribui o próximo número da sequência daquele `kind` e retorna `"${Prefixo} ${n}"`. Chamadas repetidas com o mesmo `id` retornam sempre o mesmo rótulo. O mapa é reiniciado a cada reload de página (aceitável — é uma sessão de demonstração ao vivo, não precisa sobreviver a reload).

### Componentes de mascaramento

Em `src/shared/components/demo-mask/`:

- **`<DemoCompanyName company={{ id: string; name: string }} />`** — via `useDemoMode()`, se `isDemoMode` retorna `getSequentialLabel("empresa", company.id)`, senão `company.name`.
- **`<DemoPersonName user={{ id: string; name: string; role: "client" | "developer" }} />`** — mesmo padrão, prefixo "Cliente" ou "Desenvolvedor" conforme `role`.
- **`<DemoMaskedText fallback?: string>{children}</DemoMaskedText>`** — se `isDemoMode`, renderiza um `<span className="italic text-muted-foreground">` com o texto fixo "Oculto no modo demonstração" (ou `fallback` customizado quando o contexto pedir algo mais curto, ex. dentro de uma célula de tabela estreita); senão renderiza `children` normalmente. Não tenta preservar o tamanho/formato do texto original.
- **`maskContact(value, type: "email" | "phone" | "document" | "address" | "website"): string`** — função pura (não componente, pra usar dentro de `value` de inputs ou tabelas facilmente), retorna um valor fixo por tipo quando `isDemoMode` (`"contato@empresa.demo"`, `"(00) 0000-0000"`, `"00.000.000/0000-00"`, `"Endereço oculto"`, `"empresa.demo.com.br"`), senão o `value` original. Exposta via `useDemoMode()` como `maskContact` pra ter acesso ao `isDemoMode` sem prop drilling.

Todos consultam o mesmo `DemoModeContext` — não há estado duplicado.

### Botão e indicação visual

Novo componente `<DemoModeBar />` (`src/shared/components/demo-mode-bar.tsx`), renderizado no topo de `<main>` em `src/app/(private)/layout.tsx`, junto com `<ImpersonationBanner />` (acima do `<div className="p-6">`, visível em toda tela privada, sem depender de rota):

```tsx
<main className="ml-64">
  <DemoModeBar />
  <ImpersonationBanner />
  <div className="p-6">{children}</div>
</main>
```

Barra fina e sticky (`sticky top-0 z-30`), com um botão à direita usando `Eye`/`EyeOff` (lucide-react, já usado no projeto) e o texto "Modo demonstração". Quando `isDemoMode` é `true`, a barra inteira ganha destaque visual (fundo/borda âmbar, ex. `bg-amber-50 border-amber-200 dark:bg-amber-950/30`) como lembrete persistente de que o modo está ligado, já que o usuário pode navegar várias telas durante uma demo e esquecer o estado.

## Rollout (Fase 1 — aplicado nesta implementação)

Telas com maior exposição de dado sensível, cobrindo os três papéis:

- `admin/page.tsx` (dashboard) — nomes de empresa em rankings/gráficos
- `admin/projetos/page.tsx` e `admin/projetos/[id]/especificacao/page.tsx` — título/descrição do projeto, nome da empresa, nome de cliente/desenvolvedor, campos de texto livre
- `admin/empresas/page.tsx` e sub-telas (`priorizacao`, `custos`, `automacoes-existentes`, `entrevistas`) — nome/contato da empresa, textos livres dos projetos listados
- `admin/clientes/page.tsx` — nome/contato de clientes
- `admin/solicitacoes/page.tsx` — mesmos campos de projeto
- `cliente/page.tsx`, `cliente/robos/page.tsx`, `cliente/solicitar/page.tsx` — nome da própria empresa/projeto (mesmo sendo "a empresa do usuário logado", ainda vaza em apresentação pra terceiros)
- `desenvolvedor/page.tsx` e `desenvolvedor/projetos/[id]/especificacao/page.tsx` — nome de empresa/cliente, texto livre
- `projeto/[id]/page.tsx` — tela de detalhe de projeto compartilhada

Em cada uma, os pontos que hoje renderizam `company.name`, `user.name` (de cliente/desenvolvedor) e os campos de texto livre do `Project` (`title`, `description`, `targetAudience`, `additionalInfo`, `existingSystemDetails`, `projectNarrative`, `benefitsDetails`, `peopleInvolvedDetails`, `architectNotes`, `robotSchedule`) passam a usar os componentes de mascaramento acima no lugar do valor bruto. O plano de implementação vai fazer o levantamento exato de cada ocorrência por arquivo.

## Fora de escopo

- **Exports em PDF/PPTX** (deck de payback em `admin/empresas`, slide executivo) — são gerados via lógica separada de geração de arquivo; passar o modo demo pra dentro deles é trabalho adicional não coberto aqui. Fica pra um pedido futuro se for necessário apresentar um export também.
- **Nomes de arquivo anexado, comentários, activity log** — também são texto livre potencialmente sensível, mas ficam pra uma fase seguinte pra manter esta primeira entrega focada nas telas de maior exposição.
- **Mascaramento no servidor** — dado real continua sendo enviado ao navegador; não há mudança em nenhuma tRPC procedure ou resposta de API.
- **Sincronização entre dispositivos / persistência no banco** — o estado é só `localStorage`, por navegador.
