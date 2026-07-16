"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import { Button } from "@/src/shared/components/ui/button";
import { Badge } from "@/src/shared/components/ui/badge";
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from "@/src/shared/components/ui/empty";
import { Spinner } from "@/src/shared/components/ui/spinner";
import { formatDate } from "@/shared/utils";
import { trpc } from "@/shared/trpc/client";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { FileText, Mail, Building2, Calendar, CheckCircle, X } from "lucide-react";
import { toast } from "sonner";

export default function AdminSolicitacoesPage() {
  const { maskPersonName, maskContact, maskCompanyName, maskFreeText } = useDemoMode();
  const [acting, setActing] = useState<{ id: string; action: "approve" | "reject" } | null>(null);
  const { data: requests = [], isLoading } = trpc.request.list.useQuery();
  const utils = trpc.useUtils();
  const approveMutation = trpc.request.approve.useMutation({
    onSettled: () => setActing(null),
    onSuccess: () => {
      utils.request.list.invalidate();
      toast.success("Solicitação aprovada e projeto criado.");
    },
    onError: (err) => {
      toast.error(err.message ?? "Erro ao aprovar solicitação.");
    },
  });
  const rejectMutation = trpc.request.reject.useMutation({
    onSettled: () => setActing(null),
    onSuccess: () => {
      utils.request.list.invalidate();
      toast.success("Solicitação rejeitada.");
    },
    onError: (err) => {
      toast.error(err.message ?? "Erro ao rejeitar solicitação.");
    },
  });

  const handleApprove = (requestId: string) => {
    setActing({ id: requestId, action: "approve" });
    approveMutation.mutate({ requestId });
  };

  const handleReject = (requestId: string) => {
    setActing({ id: requestId, action: "reject" });
    rejectMutation.mutate({ requestId });
  };

  const isActing = (id: string) => acting?.id === id;
  const isApproving = (id: string) => acting?.id === id && acting?.action === "approve";
  const isRejecting = (id: string) => acting?.id === id && acting?.action === "reject";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Solicitações</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie as solicitações de novos projetos
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner className="h-8 w-8 text-muted-foreground" />
        </div>
      ) : requests.length === 0 ? (
        <Empty>
          <EmptyMedia variant="icon">
            <FileText className="h-10 w-10" />
          </EmptyMedia>
          <EmptyTitle>Nenhuma solicitação pendente</EmptyTitle>
          <EmptyDescription>
            Novas solicitações enviadas pela landing page aparecerão aqui.
          </EmptyDescription>
        </Empty>
      ) : (
        <div className="grid gap-4">
          {requests.map((request) => (
            <Card key={request.id} className="bg-card">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <CardTitle className="text-base sm:text-lg">
                      {maskPersonName(request.id, request.name, "cliente")}
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3 shrink-0" />
                        {maskContact(request.email, "email")}
                      </span>
                      {request.company && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3 shrink-0" />
                          {maskCompanyName(request.company, request.company)}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant="secondary" className="w-fit shrink-0">
                    {request.projectType}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4 sm:p-6 pt-0">
                <div>
                  <p className="text-sm font-medium mb-1">Descrição</p>
                  <p className="text-sm text-muted-foreground">
                    {maskFreeText(request.description)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {request.estimatedDeadline && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 shrink-0" />
                      Prazo: {request.estimatedDeadline}
                    </span>
                  )}
                  {request.estimatedBudget && (
                    <span>Orçamento: {request.estimatedBudget}</span>
                  )}
                  <span>Enviado em: {formatDate(request.createdAt)}</span>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    onClick={() => handleApprove(request.id)}
                    disabled={isActing(request.id)}
                  >
                    {isApproving(request.id) ? (
                      <Spinner className="h-4 w-4 mr-2" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Aprovar e Criar Projeto
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleReject(request.id)}
                    disabled={isActing(request.id)}
                  >
                    {isRejecting(request.id) ? (
                      <Spinner className="h-4 w-4 mr-2" />
                    ) : (
                      <X className="h-4 w-4 mr-2" />
                    )}
                    Rejeitar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
