# Resumo por Área na Priorização Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma 4ª aba "Resumo por Área" em `/admin/empresas/[id]/priorizacao`, consolidando por área de negócio os números de projetos em pipeline (saving estimado) e automações já entregues (economia acumulada) da empresa, reaproveitando componentes já existentes.

**Architecture:** Zero mudança nos dois procedures de agregação já existentes (`project.getAreaSummary`, `project.getExistingAutomationsAreaSummary`) — ambos já aceitam `companyId` opcional. A nova aba só importa e empilha os dois componentes React que já os consomem (`AreaSummaryChart`, `ExistingAutomationsAreaSummaryChart`), passando o `companyId` da rota. Um novo procedure pequeno (`getAreaSummaryGaps`) conta quantos projetos da empresa não têm área definida (excluídos silenciosamente dos dois resumos acima), pra exibir uma nota de transparência.

**Tech Stack:** Next.js (App Router) + tRPC + Prisma (PostgreSQL) + shadcn/ui (Tabs) + Recharts. Sem framework de teste e sem banco local neste repo — validação é `pnpm exec tsc --noEmit` e `pnpm build`. Sem migration nova (nenhuma mudança de schema). Deploy é automático via push pra `main`.

---

## Task 1: Backend — procedure de contagem de projetos sem área

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts`

- [ ] **Step 1: Adicionar o procedure `getAreaSummaryGaps`**

Encontre o final do arquivo:
```typescript
        .filter((g) => g.areaId != null && areaById.has(g.areaId))
        .map((g) => {
          const area = areaById.get(g.areaId as string)!;
          return {
            areaId: area.id,
            areaName: area.name,
            projectCount: g._count,
            totalAccumulatedSavingBRL: g._sum.accumulatedSavingBRL ?? 0,
          };
        })
        .sort((a, b) => b.projectCount - a.projectCount);
    }),
});
```
Substitua por:
```typescript
        .filter((g) => g.areaId != null && areaById.has(g.areaId))
        .map((g) => {
          const area = areaById.get(g.areaId as string)!;
          return {
            areaId: area.id,
            areaName: area.name,
            projectCount: g._count,
            totalAccumulatedSavingBRL: g._sum.accumulatedSavingBRL ?? 0,
          };
        })
        .sort((a, b) => b.projectCount - a.projectCount);
    }),

  // Contagem de projetos de uma empresa sem área definida (areaId null),
  // separados em pipeline/entregues — usado pela aba "Resumo por Área" da
  // Priorização pra avisar que esses projetos ficam fora dos dois resumos
  // acima (que filtram areaId: { not: null }). Mesmos filtros exatos de
  // getPrioritizedRanking/getExistingAutomationsRanking, só invertendo a
  // condição de areaId.
  getAreaSummaryGaps: adminProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [pipelineWithoutArea, deliveredWithoutArea] = await Promise.all([
        ctx.db.project.count({
          where: {
            companyId: input.companyId,
            areaId: null,
            hasCurrentApplication: { not: "sim" },
            status: { notIn: ["DONE", "CANCELLED"] },
          },
        }),
        ctx.db.project.count({
          where: {
            companyId: input.companyId,
            areaId: null,
            OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
          },
        }),
      ]);
      return { pipelineWithoutArea, deliveredWithoutArea };
    }),
});
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `project.router.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: add getAreaSummaryGaps procedure for resumo por área tab"
```

---

## Task 2: Frontend — aba "Resumo por Área"

**Files:**
- Modify: `src/app/(private)/admin/empresas/[id]/priorizacao/page.tsx`

- [ ] **Step 1: Adicionar imports dos dois componentes de resumo por área**

Encontre:
```tsx
import { WaveTimeline } from "@/src/shared/components/wave-timeline";
import { PaybackChart } from "@/src/shared/components/payback-chart";
```
Substitua por:
```tsx
import { WaveTimeline } from "@/src/shared/components/wave-timeline";
import { PaybackChart } from "@/src/shared/components/payback-chart";
import { AreaSummaryChart } from "@/src/shared/components/area-summary-chart";
import { ExistingAutomationsAreaSummaryChart } from "@/src/shared/components/existing-automations-area-summary-chart";
```

- [ ] **Step 2: Buscar a contagem de projetos sem área**

Encontre:
```tsx
  const { data: ranking = [], isLoading } = trpc.project.getPrioritizedRanking.useQuery({
    companyId,
    sortBy,
  });
```
Substitua por:
```tsx
  const { data: ranking = [], isLoading } = trpc.project.getPrioritizedRanking.useQuery({
    companyId,
    sortBy,
  });

  const { data: areaSummaryGaps } = trpc.project.getAreaSummaryGaps.useQuery({ companyId });
```

- [ ] **Step 3: Adicionar a nova aba na TabsList**

Encontre:
```tsx
        <TabsList>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
          <TabsTrigger value="payback">Payback</TabsTrigger>
        </TabsList>
```
Substitua por:
```tsx
        <TabsList>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
          <TabsTrigger value="payback">Payback</TabsTrigger>
          <TabsTrigger value="resumo-area">Resumo por Área</TabsTrigger>
        </TabsList>
```

- [ ] **Step 4: Adicionar o conteúdo da aba**

Encontre o final da aba Payback, logo antes do fechamento de `<Tabs>`:
```tsx
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```
Substitua por:
```tsx
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resumo-area" className="space-y-6 mt-4">
          <AreaSummaryChart companyId={companyId} />
          <ExistingAutomationsAreaSummaryChart companyId={companyId} />
          {areaSummaryGaps &&
            (areaSummaryGaps.pipelineWithoutArea > 0 || areaSummaryGaps.deliveredWithoutArea > 0) && (
              <p className="text-xs text-muted-foreground">
                {areaSummaryGaps.pipelineWithoutArea > 0 &&
                  `${areaSummaryGaps.pipelineWithoutArea} projeto${areaSummaryGaps.pipelineWithoutArea !== 1 ? "s" : ""} em andamento`}
                {areaSummaryGaps.pipelineWithoutArea > 0 && areaSummaryGaps.deliveredWithoutArea > 0 && " e "}
                {areaSummaryGaps.deliveredWithoutArea > 0 &&
                  `${areaSummaryGaps.deliveredWithoutArea} automaç${areaSummaryGaps.deliveredWithoutArea !== 1 ? "ões" : "ão"} entregue${areaSummaryGaps.deliveredWithoutArea !== 1 ? "s" : ""}`}
                {" "}desta empresa não {areaSummaryGaps.pipelineWithoutArea + areaSummaryGaps.deliveredWithoutArea !== 1 ? "têm" : "tem"} área definida e não {areaSummaryGaps.pipelineWithoutArea + areaSummaryGaps.deliveredWithoutArea !== 1 ? "aparecem" : "aparece"} nos resumos acima.
              </p>
            )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `priorizacao/page.tsx`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(private)/admin/empresas/[id]/priorizacao/page.tsx"
git commit -m "feat: add resumo por área tab to priorização page"
```

---

## Task 3: Validação final

**Files:** nenhum (só validação)

- [ ] **Step 1: Type-check completo**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros novos (os erros pré-existentes em `chart.tsx`/`input-otp.tsx`/`sidebar.tsx`/`toaster.tsx` continuam, não são deste plano).

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Revisão manual**

Confirme que `AreaSummaryChart`/`ExistingAutomationsAreaSummaryChart` recebem `companyId` corretamente tipado (string, não `string | undefined`, já que na página de priorização `companyId` sempre vem do parâmetro de rota, nunca é opcional ali — diferente do uso no dashboard admin global onde é omitido). Confirme que `getAreaSummaryGaps` usa exatamente os mesmos filtros de `getPrioritizedRanking`/`getExistingAutomationsRanking` (só invertendo a condição de `areaId`), pra garantir que a nota de "sem área" reflita fielmente o que está sendo excluído dos dois resumos.

- [ ] **Step 4: Não fazer push automaticamente**

Reporte os resultados — o controlador decide quando dar push pra `main`.
