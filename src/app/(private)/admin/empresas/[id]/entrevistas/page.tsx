"use client";

import { use, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { trpc } from "@/shared/trpc/client";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { Card, CardContent } from "@/src/shared/components/ui/card";
import { Badge } from "@/src/shared/components/ui/badge";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import { Label } from "@/src/shared/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/shared/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/src/shared/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/shared/components/ui/alert-dialog";
import { ArrowLeft, Plus, Pencil, Trash2, Users } from "lucide-react";
import {
  MultiCreatableCombobox,
  type MultiCreatableComboboxOption,
} from "@/src/shared/components/ui/multi-creatable-combobox";

interface Props {
  params: Promise<{ id: string }>;
}

const AREA_NONE = "__none__";

type InterviewStatus = "realizado" | "agendado" | "cancelado";

const STATUS_OPTIONS: { value: InterviewStatus; label: string }[] = [
  { value: "realizado", label: "Realizado" },
  { value: "agendado", label: "Agendado" },
  { value: "cancelado", label: "Cancelado" },
];

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label])
);

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  realizado: "default",
  agendado: "secondary",
  cancelado: "outline",
};

// Usa os componentes de data locais (não toISOString/UTC) para que o valor do
// input "date" bata com a data exibida na tabela via toLocaleDateString("pt-BR")
// — no fuso do Brasil (UTC-3), toISOString() pode arredondar para o dia
// seguinte perto da meia-noite.
function toLocalDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// new Date("YYYY-MM-DD") interpreta a string como UTC meia-noite (spec do
// ISO 8601 para strings "date-only"), o que no fuso do Brasil (UTC-3) cai no
// dia anterior às 21h — por isso construímos a partir dos componentes
// locais em vez de deixar o Date parsear a string diretamente.
function parseLocalDateInputValue(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

const EMPTY_FORM: {
  personIds: string[];
  status: InterviewStatus;
  scheduledDate: string;
  areaId: string;
} = {
  personIds: [],
  status: "realizado",
  scheduledDate: toLocalDateInputValue(new Date()),
  areaId: AREA_NONE,
};

export default function EntrevistasPage({ params }: Props) {
  const { id: companyId } = use(params);
  const utils = trpc.useUtils();

  const { data: companies = [] } = trpc.company.listAll.useQuery();
  const company = companies.find((c) => c.id === companyId);
  const { isDemoMode, maskCompanyName, maskPersonName } = useDemoMode();

  const { data: areas = [] } = trpc.taxonomy.listAreas.useQuery();
  const { data: personOptions = [] } = trpc.person.list.useQuery({ companyId });

  const { data: interviews = [], isLoading } = trpc.interview.list.useQuery({ companyId });

  const createPersonMutation = trpc.person.create.useMutation({
    onSuccess: (person) => {
      utils.person.list.invalidate({ companyId });
      setForm((f) => ({ ...f, personIds: [...f.personIds, person.id] }));
    },
    onError: (error) => {
      toast.error("Erro ao criar pessoa", { description: error.message });
    },
  });

  const comboboxOptions: MultiCreatableComboboxOption[] = personOptions.map((p) => ({
    value: p.id,
    label: p.name,
    meta: { isUnlinkedUser: p.isUnlinkedUser },
  }));

  const [dialog, setDialog] = useState<{ open: boolean; editingId?: string }>({ open: false });
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    id?: string;
    label?: string;
  }>({ open: false });

  const createMutation = trpc.interview.create.useMutation({
    onSuccess: () => {
      utils.interview.list.invalidate({ companyId });
      setDialog({ open: false });
      toast.success("Entrevista registrada.");
    },
    onError: (error) => {
      toast.error("Erro ao registrar entrevista", { description: error.message });
    },
  });

  const updateMutation = trpc.interview.update.useMutation({
    onSuccess: () => {
      utils.interview.list.invalidate({ companyId });
      setDialog({ open: false });
      toast.success("Entrevista atualizada.");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar entrevista", { description: error.message });
    },
  });

  const deleteMutation = trpc.interview.delete.useMutation({
    onSuccess: () => {
      utils.interview.list.invalidate({ companyId });
      toast.success("Entrevista removida.");
    },
    onError: (error) => {
      toast.error("Erro ao remover entrevista", { description: error.message });
    },
  });

  function openNew() {
    setForm(EMPTY_FORM);
    setDialog({ open: true });
  }

  function openEdit(interview: (typeof interviews)[number]) {
    setForm({
      personIds: interview.participants.map((p) => p.personId),
      status: interview.status as InterviewStatus,
      scheduledDate: toLocalDateInputValue(new Date(interview.scheduledDate)),
      areaId: interview.areaId ?? AREA_NONE,
    });
    setDialog({ open: true, editingId: interview.id });
  }

  function submit() {
    const payload = {
      personIds: form.personIds,
      status: form.status,
      scheduledDate: parseLocalDateInputValue(form.scheduledDate),
      areaId: form.areaId === AREA_NONE ? null : form.areaId,
    };
    if (dialog.editingId) {
      updateMutation.mutate({ id: dialog.editingId, ...payload });
    } else {
      createMutation.mutate({ companyId, ...payload });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Link href="/admin/empresas">
          <Button variant="ghost" size="icon" className="shrink-0 -ml-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Entrevistas de levantamento
          </h1>
          <p className="text-muted-foreground">
            {maskCompanyName(companyId, company?.name) ?? "Carregando..."} — participantes,
            área, data e status das entrevistas realizadas
          </p>
        </div>
        <Button onClick={openNew} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Nova entrevista
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Participante</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    Carregando entrevistas...
                  </TableCell>
                </TableRow>
              ) : interviews.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    Nenhuma entrevista cadastrada para esta empresa.
                  </TableCell>
                </TableRow>
              ) : (
                interviews.map((interview) => (
                  <TableRow key={interview.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap gap-1">
                        {interview.participants.map((p) => (
                          <Badge key={p.personId} variant="secondary">
                            {maskPersonName(p.personId, p.person.name, "cliente")}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {interview.area?.name ?? "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(interview.scheduledDate).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[interview.status] ?? "outline"}>
                        {STATUS_LABEL[interview.status] ?? interview.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={isDemoMode}
                          title={isDemoMode ? "Edição desativada no modo demonstração" : undefined}
                          onClick={() => openEdit(interview)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() =>
                            setDeleteConfirm({
                              open: true,
                              id: interview.id,
                              label: interview.participants
                                .map(
                                  (p) =>
                                    maskPersonName(p.personId, p.person.name, "cliente") ??
                                    p.person.name
                                )
                                .join(", "),
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog.editingId ? "Editar entrevista" : "Nova entrevista"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Participantes</Label>
              <MultiCreatableCombobox
                options={comboboxOptions}
                value={form.personIds}
                onChange={(personIds) => setForm((f) => ({ ...f, personIds }))}
                onCreate={(name) => createPersonMutation.mutate({ companyId, name })}
                placeholder="Selecionar ou criar pessoa..."
                emptyText="Nenhuma pessoa encontrada."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Área</Label>
              <Select
                value={form.areaId}
                onValueChange={(value) => setForm((f) => ({ ...f, areaId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Área" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AREA_NONE}>Nenhuma</SelectItem>
                  {areas.map((area) => (
                    <SelectItem key={area.id} value={area.id}>
                      {area.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input
                type="date"
                value={form.scheduledDate}
                onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, status: value as InterviewStatus }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })}>
              Cancelar
            </Button>
            <Button
              onClick={submit}
              disabled={
                form.personIds.length === 0 ||
                !form.scheduledDate ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {dialog.editingId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a entrevista de{" "}
              <strong>{deleteConfirm.label}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirm.id) deleteMutation.mutate({ id: deleteConfirm.id });
                setDeleteConfirm({ open: false });
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
