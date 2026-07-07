# Importação em lote de XMLs via .zip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir subir um `.zip` contendo vários arquivos `.xml` em `/cliente/solicitar`, processando cada um em sequência (reaproveitando `parseSolicitacaoXml` sem mudança) e mostrando um resumo do lote (sucessos/falhas) ao final, conforme `docs/superpowers/specs/2026-07-07-xml-batch-zip-import-design.md`.

**Architecture:** Novo arquivo `zip-import.ts` isola a descompactação (única parte que usa a nova dependência `jszip`). Em `page.tsx`, a lógica de "importar um XML e criar o projeto" é extraída da função antiga `createProjectFromXml` para uma nova função compartilhada `importXmlEntry`, usada tanto pelo fluxo de arquivo único quanto pelo loop do lote. A resolução de empresa ambígua (hoje um diálogo que já dispara a criação do projeto ao confirmar) vira um padrão de Promise armazenada num `useRef`, permitindo que o loop do lote pause e espere o usuário decidir antes de seguir pro próximo arquivo.

**Tech Stack:** Next.js 16 / TypeScript / React 19. Nova dependência de frontend: `jszip` (só leitura de `.zip` no navegador, sem binário nativo, sem mudança de backend). **Sem test runner configurado neste repo.** Verificação: `npx tsc --noEmit` + revisão estática (sem navegador disponível nesta sessão de execução).

---

## Mapa de arquivos

- `package.json` / `pnpm-lock.yaml`: adicionar `jszip`.
- Criar: `src/app/(private)/cliente/solicitar/utils/zip-import.ts`.
- Modificar: `src/app/(private)/cliente/solicitar/page.tsx` — estados, `handleImportXmlFile`, remoção de `createProjectFromXml`, novo `importXmlEntry` + `resolveCompanyAmbiguity`, diálogo de empresa ambígua (reaproveitado com contexto de lote), novo diálogo de resumo do lote, `accept` do input de arquivo.

---

### Task 1: Instalar `jszip` e criar `zip-import.ts`

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (via comando, não edição manual)
- Create: `src/app/(private)/cliente/solicitar/utils/zip-import.ts`

- [ ] **Step 1: Instalar a dependência**

Run: `cd "c:/Users/danie/Pipeline" && pnpm add jszip`
Expected: `jszip` aparece em `package.json` (`dependencies`) e `pnpm-lock.yaml` é atualizado. `jszip` já inclui seus próprios tipos TypeScript — não precisa de `@types/jszip`.

- [ ] **Step 2: Criar o arquivo `zip-import.ts`**

```ts
import JSZip from "jszip";

export interface ZipXmlEntry {
  fileName: string;
  xmlText: string;
}

/**
 * Extrai o texto de todos os arquivos .xml dentro de um .zip, ignorando
 * pastas e qualquer arquivo que não termine em .xml (ex.: __MACOSX/, .docx
 * soltos). Ordena por nome de arquivo para processamento determinístico.
 */
export async function extractXmlEntriesFromZip(file: File): Promise<ZipXmlEntry[]> {
  const zip = await JSZip.loadAsync(file);
  const xmlFileEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".xml"))
    .sort((a, b) => a.name.localeCompare(b.name));

  const entries: ZipXmlEntry[] = [];
  for (const entry of xmlFileEntries) {
    const xmlText = await entry.async("text");
    entries.push({ fileName: entry.name, xmlText });
  }
  return entries;
}
```

- [ ] **Step 3: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros relacionados a `zip-import.ts` (baseline pré-existente: erros em `clientes/page.tsx`, `chart.tsx`, `input-otp.tsx`, `sidebar.tsx`, `toaster.tsx` — não relacionados, ignore).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml "src/app/(private)/cliente/solicitar/utils/zip-import.ts"
git commit -m "feat: add jszip dependency and zip XML extraction helper"
```

---

### Task 2: Refatorar `page.tsx` — extrair `importXmlEntry` e o padrão de resolução de empresa

**Files:**
- Modify: `src/app/(private)/cliente/solicitar/page.tsx`

- [ ] **Step 1: Adicionar o import de `extractXmlEntriesFromZip` e do `useRef` (já importado)**

Old (linha 76, dentro do bloco de imports):

```tsx
import { parseSolicitacaoXml } from "./utils/xml-import";
```

New:

```tsx
import { parseSolicitacaoXml } from "./utils/xml-import";
import { extractXmlEntriesFromZip } from "./utils/zip-import";
```

- [ ] **Step 2: Ajustar o estado `pendingXmlImport` e adicionar `companyResolverRef` + `batchImportResults`**

Old:

```tsx
  const [xmlImportOutcome, setXmlImportOutcome] = useState<
    { ok: boolean; title: string; message: string } | null
  >(null);
  const [pendingXmlImport, setPendingXmlImport] = useState<{
    formData: SolicitarProjetoFormData;
    features: string[];
    benefits: string[];
    rawCompanyName: string;
    warnings: string[];
  } | null>(null);
  const [chosenCompanyId, setChosenCompanyId] = useState<string | undefined>();
```

New:

```tsx
  const [xmlImportOutcome, setXmlImportOutcome] = useState<
    { ok: boolean; title: string; message: string } | null
  >(null);
  const [pendingXmlImport, setPendingXmlImport] = useState<{
    rawCompanyName: string;
    batchContext?: { fileName: string; index: number; total: number };
  } | null>(null);
  const [chosenCompanyId, setChosenCompanyId] = useState<string | undefined>();
  const companyResolverRef = useRef<((companyId: string | null) => void) | null>(null);
  const [batchImportResults, setBatchImportResults] = useState<
    { fileName: string; ok: boolean; title?: string; error?: string; hasWarnings?: boolean }[] | null
  >(null);
```

Note: `SolicitarProjetoFormData` pode ficar sem uso neste arquivo depois desta mudança — **não remova o import** ainda; outros usos dele no arquivo (fora deste trecho) continuam existindo (ex.: no `useZodForm`). Se o `tsc`/lint reclamar de import não usado especificamente desse tipo em algum ponto, isso será resolvido no Task 3 quando `createProjectFromXml` for removida — confirme ao final do Task 3, não deste.

- [ ] **Step 3: Substituir `createProjectFromXml` por `importXmlEntry` + `resolveCompanyAmbiguity`**

Old (função inteira, ver `handleAttachFilesChange` logo acima dela para achar o ponto exato):

```tsx
  async function createProjectFromXml(
    parsed: {
      formData: SolicitarProjetoFormData;
      features: string[];
      benefits: string[];
      warnings?: string[];
    },
    companyId: string | undefined
  ) {
    if (!user?.id) return;
    setIsSubmitting(true);
    try {
      const payload = buildProjectPayload({
        data: parsed.formData,
        features: parsed.features,
        benefits: parsed.benefits,
        clientId: user.id,
        companyId,
        areas: PROJECT_AREAS,
        themesByArea: PROJECT_THEMES_BY_AREA,
        buildTypeLabel: buildClienteProjectTypeLabel,
      });
      await addProject(payload);

      const warningsNote =
        parsed.warnings && parsed.warnings.length > 0
          ? ` Alguns valores do XML não foram reconhecidos e foram registrados em "Informações adicionais" para revisão.`
          : "";
      setXmlImportOutcome({
        ok: true,
        title: "Solicitação enviada",
        message: `O processo "${parsed.formData.title}" foi criado e está no backlog.${warningsNote}`,
      });
    } catch (error) {
      console.error("Erro ao criar processo a partir do XML:", error);
      setXmlImportOutcome({
        ok: false,
        title: "Erro ao salvar",
        message: "Não foi possível criar o processo. Tente novamente.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleImportXmlFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!user?.id) {
      toast({
        title: "Erro",
        description: "Faça login para importar um XML.",
        variant: "destructive",
      });
      return;
    }

    if (companyOptionsLoading) {
      toast({
        title: "Aguarde",
        description: "A lista de empresas ainda está carregando. Tente novamente em instantes.",
        variant: "destructive",
      });
      return;
    }

    const xmlText = await file.text();
    const result = parseSolicitacaoXml(xmlText, {
      areas: PROJECT_AREAS,
      themesByArea: PROJECT_THEMES_BY_AREA,
      companies: companyOptions,
    });

    if (!result.ok) {
      setXmlImportOutcome({
        ok: false,
        title: "Erro ao importar XML",
        message: result.error,
      });
      return;
    }

    if (result.companyUnresolved) {
      if (companyOptions.length === 0) {
        setXmlImportOutcome({
          ok: false,
          title: "Erro ao importar XML",
          message: result.rawCompanyName
            ? `A tag <empresa> tem o valor '${result.rawCompanyName}', mas não há nenhuma empresa disponível para associar este processo.`
            : "Não há nenhuma empresa disponível para associar este processo.",
        });
        return;
      }
      setPendingXmlImport({
        formData: result.formData,
        features: result.features,
        benefits: result.benefits,
        rawCompanyName: result.rawCompanyName,
        warnings: result.warnings,
      });
      setChosenCompanyId(companyOptions.length === 1 ? companyOptions[0].id : undefined);
      return;
    }

    await createProjectFromXml(
      {
        formData: result.formData,
        features: result.features,
        benefits: result.benefits,
        warnings: result.warnings,
      },
      result.companyId
    );
  }
```

New:

```tsx
  function resolveCompanyAmbiguity(
    rawCompanyName: string,
    batchContext?: { fileName: string; index: number; total: number }
  ): Promise<string | null> {
    return new Promise((resolve) => {
      companyResolverRef.current = resolve;
      setPendingXmlImport({ rawCompanyName, batchContext });
      setChosenCompanyId(companyOptions.length === 1 ? companyOptions[0].id : undefined);
    });
  }

  async function importXmlEntry(
    xmlText: string,
    batchContext?: { fileName: string; index: number; total: number }
  ): Promise<{ ok: true; title: string; hasWarnings: boolean } | { ok: false; error: string }> {
    if (!user?.id) return { ok: false, error: "Faça login para importar um XML." };

    const result = parseSolicitacaoXml(xmlText, {
      areas: PROJECT_AREAS,
      themesByArea: PROJECT_THEMES_BY_AREA,
      companies: companyOptions,
    });

    if (!result.ok) return { ok: false, error: result.error };

    let companyId = result.companyId;
    if (result.companyUnresolved) {
      if (companyOptions.length === 0) {
        return {
          ok: false,
          error: result.rawCompanyName
            ? `A tag <empresa> tem o valor '${result.rawCompanyName}', mas não há nenhuma empresa disponível para associar este processo.`
            : "Não há nenhuma empresa disponível para associar este processo.",
        };
      }
      const chosen = await resolveCompanyAmbiguity(result.rawCompanyName, batchContext);
      if (!chosen) return { ok: false, error: "Empresa não resolvida (seleção cancelada)." };
      companyId = chosen;
    }

    try {
      const payload = buildProjectPayload({
        data: result.formData,
        features: result.features,
        benefits: result.benefits,
        clientId: user.id,
        companyId,
        areas: PROJECT_AREAS,
        themesByArea: PROJECT_THEMES_BY_AREA,
        buildTypeLabel: buildClienteProjectTypeLabel,
      });
      await addProject(payload);
      return { ok: true, title: result.formData.title, hasWarnings: result.warnings.length > 0 };
    } catch (error) {
      console.error("Erro ao criar processo a partir do XML:", error);
      return { ok: false, error: "Não foi possível criar o processo. Tente novamente." };
    }
  }

  async function handleImportXmlFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!user?.id) {
      toast({
        title: "Erro",
        description: "Faça login para importar um XML.",
        variant: "destructive",
      });
      return;
    }

    if (companyOptionsLoading) {
      toast({
        title: "Aguarde",
        description: "A lista de empresas ainda está carregando. Tente novamente em instantes.",
        variant: "destructive",
      });
      return;
    }

    const isZip = file.name.toLowerCase().endsWith(".zip");
    setIsSubmitting(true);
    try {
      if (isZip) {
        const entries = await extractXmlEntriesFromZip(file);
        if (entries.length === 0) {
          setXmlImportOutcome({
            ok: false,
            title: "Erro ao importar zip",
            message: "Nenhum arquivo .xml encontrado dentro do zip.",
          });
          return;
        }

        const results: { fileName: string; ok: boolean; title?: string; error?: string; hasWarnings?: boolean }[] =
          [];
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const outcome = await importXmlEntry(entry.xmlText, {
            fileName: entry.fileName,
            index: i + 1,
            total: entries.length,
          });
          results.push(
            outcome.ok
              ? { fileName: entry.fileName, ok: true, title: outcome.title, hasWarnings: outcome.hasWarnings }
              : { fileName: entry.fileName, ok: false, error: outcome.error }
          );
        }
        setBatchImportResults(results);
      } else {
        const xmlText = await file.text();
        const outcome = await importXmlEntry(xmlText);
        if (outcome.ok) {
          const warningsNote = outcome.hasWarnings
            ? ` Alguns valores do XML não foram reconhecidos e foram registrados em "Informações adicionais" para revisão.`
            : "";
          setXmlImportOutcome({
            ok: true,
            title: "Solicitação enviada",
            message: `O processo "${outcome.title}" foi criado e está no backlog.${warningsNote}`,
          });
        } else {
          setXmlImportOutcome({
            ok: false,
            title: "Erro ao importar XML",
            message: outcome.error,
          });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }
```

- [ ] **Step 4: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: pode aparecer um erro de "`SolicitarProjetoFormData` importado mas não usado" SE nenhum outro trecho do arquivo usar esse tipo — **antes de tratar isso como erro, confirme com grep se `SolicitarProjetoFormData` ainda é usado em outro lugar do arquivo** (ex.: `useZodForm<SolicitarProjetoFormData>`). Se ainda for usado em outro lugar, ignore — não é um erro novo introduzido por este passo. Fora isso, sem novos erros relacionados a `page.tsx` além do baseline conhecido (`clientes/page.tsx`, `chart.tsx`, `input-otp.tsx`, `sidebar.tsx`, `toaster.tsx`).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(private)/cliente/solicitar/page.tsx"
git commit -m "refactor: extract shared importXmlEntry helper for single and batch XML import"
```

---

### Task 3: Atualizar os diálogos (empresa ambígua com contexto de lote + novo resumo do lote) e o input de arquivo

**Files:**
- Modify: `src/app/(private)/cliente/solicitar/page.tsx`

- [ ] **Step 1: Atualizar o `accept` do input de arquivo**

Old:

```tsx
          <input
            ref={xmlInputRef}
            type="file"
            accept=".xml,text/xml"
            className="hidden"
            onChange={handleImportXmlFile}
          />
```

New:

```tsx
          <input
            ref={xmlInputRef}
            type="file"
            accept=".xml,.zip,text/xml,application/zip"
            className="hidden"
            onChange={handleImportXmlFile}
          />
```

- [ ] **Step 2: Atualizar o diálogo de empresa ambígua (`pendingXmlImport`) — mostrar contexto de lote e resolver a Promise em vez de chamar `createProjectFromXml` diretamente**

Old:

```tsx
      <Dialog
        open={pendingXmlImport !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingXmlImport(null);
            setChosenCompanyId(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selecione a empresa</DialogTitle>
            <DialogDescription>
              {pendingXmlImport?.rawCompanyName
                ? `O XML indica a empresa "${pendingXmlImport.rawCompanyName}", que não corresponde a nenhuma empresa disponível.`
                : "O XML não indica uma empresa."}{" "}
              Escolha para qual empresa este processo deve ser criado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Empresa</Label>
            <Select value={chosenCompanyId} onValueChange={setChosenCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {companyOptions.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPendingXmlImport(null);
                setChosenCompanyId(undefined);
              }}
            >
              Cancelar
            </Button>
            <Button
              disabled={!chosenCompanyId || isSubmitting}
              onClick={async () => {
                if (!pendingXmlImport || !chosenCompanyId) return;
                const parsed = pendingXmlImport;
                setPendingXmlImport(null);
                await createProjectFromXml(parsed, chosenCompanyId);
                setChosenCompanyId(undefined);
              }}
            >
              Confirmar e criar processo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

New:

```tsx
      <Dialog
        open={pendingXmlImport !== null}
        onOpenChange={(open) => {
          if (!open) {
            companyResolverRef.current?.(null);
            companyResolverRef.current = null;
            setPendingXmlImport(null);
            setChosenCompanyId(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selecione a empresa</DialogTitle>
            <DialogDescription>
              {pendingXmlImport?.batchContext && (
                <span className="mb-1 block font-medium text-foreground">
                  Arquivo {pendingXmlImport.batchContext.index} de {pendingXmlImport.batchContext.total}:{" "}
                  {pendingXmlImport.batchContext.fileName}
                </span>
              )}
              {pendingXmlImport?.rawCompanyName
                ? `O XML indica a empresa "${pendingXmlImport.rawCompanyName}", que não corresponde a nenhuma empresa disponível.`
                : "O XML não indica uma empresa."}{" "}
              Escolha para qual empresa este processo deve ser criado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Empresa</Label>
            <Select value={chosenCompanyId} onValueChange={setChosenCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {companyOptions.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                companyResolverRef.current?.(null);
                companyResolverRef.current = null;
                setPendingXmlImport(null);
                setChosenCompanyId(undefined);
              }}
            >
              Cancelar
            </Button>
            <Button
              disabled={!chosenCompanyId}
              onClick={() => {
                if (!chosenCompanyId) return;
                companyResolverRef.current?.(chosenCompanyId);
                companyResolverRef.current = null;
                setPendingXmlImport(null);
                setChosenCompanyId(undefined);
              }}
            >
              Confirmar e criar processo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

Note: o botão de confirmar não tem mais `|| isSubmitting` no `disabled` — isso é deliberado. Diferente do fluxo antigo (onde `isSubmitting` só ficava `true` depois que o diálogo já tinha fechado), agora `isSubmitting` fica `true` durante TODO o processamento do arquivo único ou do lote inteiro, incluindo enquanto este diálogo está aberto esperando a escolha do usuário — se `isSubmitting` continuasse desabilitando o botão, o diálogo ficaria travado sem forma de confirmar.

- [ ] **Step 3: Adicionar o novo diálogo de resumo do lote, logo após o diálogo `pendingXmlImport` (antes do `</TooltipProvider>` final)**

Old (fim do arquivo, para localizar o ponto de inserção):

```tsx
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
```

New:

```tsx
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={batchImportResults !== null}
        onOpenChange={(open) => {
          if (!open) setBatchImportResults(null);
        }}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Resultado da importação em lote</AlertDialogTitle>
            <AlertDialogDescription>
              {batchImportResults?.filter((r) => r.ok).length} de {batchImportResults?.length} arquivo(s)
              importado(s) com sucesso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {batchImportResults?.map((r) => (
              <div
                key={r.fileName}
                className={cn(
                  "rounded-md border px-3 py-2",
                  r.ok ? "border-emerald-200 bg-emerald-50" : "border-destructive/30 bg-destructive/5"
                )}
              >
                <div className="font-medium">{r.fileName}</div>
                {r.ok ? (
                  <div className="text-muted-foreground">
                    Processo &quot;{r.title}&quot; criado.
                    {r.hasWarnings
                      ? ' Alguns valores não foram reconhecidos — revise em "Informações adicionais".'
                      : ""}
                  </div>
                ) : (
                  <div className="text-destructive">{r.error}</div>
                )}
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                const hadAnySuccess = batchImportResults?.some((r) => r.ok);
                setBatchImportResults(null);
                if (hadAnySuccess) router.push("/cliente");
              }}
            >
              Ver meus processos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
```

- [ ] **Step 4: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros relacionados a `page.tsx` (baseline conhecido, ver Task 2 Step 4).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(private)/cliente/solicitar/page.tsx"
git commit -m "feat: accept .zip upload with batch import results dialog"
```

---

### Task 4: Verificação (sem navegador disponível nesta sessão)

**Files:** nenhum

- [ ] **Step 1: Revisão estática do arquivo final**

Reler `src/app/(private)/cliente/solicitar/page.tsx` inteiro (as partes tocadas) e confirmar:
- `createProjectFromXml` não existe mais no arquivo (procurar por esse nome — zero ocorrências).
- `importXmlEntry` é chamada tanto no branch de arquivo único quanto no loop do zip.
- O loop do zip usa `for (let i = 0; ...)` sequencial com `await` — não `Promise.all`/`.map` (isso quebraria a pausa para resolver empresa ambígua).
- O botão de confirmar do diálogo de empresa não depende de `isSubmitting` no `disabled`.
- `SolicitarProjetoFormData` ainda é importado e usado em pelo menos um outro lugar do arquivo (senão, é um import morto que precisa ser removido — ajustar se for o caso).

- [ ] **Step 2: Registrar como pendente para o usuário**

Ao reportar a conclusão, deixar explícito que a verificação visual/funcional real (montar um `.zip` de teste com 2-3 XMLs, um deles com empresa ambígua proposital, e confirmar que o lote processa em sequência, pausa corretamente, e mostra o resumo certo ao final) não foi feita por falta de navegador nesta sessão.

---

## Self-review

- **Cobertura da spec:** dependência `jszip` (Task 1), extração de XMLs do zip (Task 1), refatoração do fluxo de importação em uma função compartilhada (Task 2), suporte a `.zip` no input + diálogo de empresa com contexto de lote + resumo do lote (Task 3) — todos os requisitos confirmados na spec estão cobertos.
- **Sem placeholders:** todo bloco de código é o conteúdo final.
- **Consistência de tipos:** `importXmlEntry` retorna `{ ok: true; title: string; hasWarnings: boolean } | { ok: false; error: string }` — usado de forma consistente tanto no branch de arquivo único (Task 2) quanto no loop de lote (Task 2/3).
- **Risco conhecido:** verificação funcional real (montar e testar um `.zip`) não é possível nesta sessão sem navegador — fica como follow-up manual do usuário.
