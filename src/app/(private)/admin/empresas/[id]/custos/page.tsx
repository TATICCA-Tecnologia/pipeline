"use client";

import { use } from "react";
import Link from "next/link";
import { trpc } from "@/shared/trpc/client";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { Button } from "@/src/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import { CompanyCostItemsCard } from "@/src/shared/components/company-cost-items-card";
import { ArrowLeft, Wallet } from "lucide-react";
import { formatCurrency } from "@/shared/utils";

interface Props {
  params: Promise<{ id: string }>;
}

export default function CustosEstruturaPage({ params }: Props) {
  const { id: companyId } = use(params);

  const { data: companies = [] } = trpc.company.listAll.useQuery();
  const company = companies.find((c) => c.id === companyId);
  const { maskCompanyName } = useDemoMode();

  const { data: summary } = trpc.company.getCostSummary.useQuery({ companyId });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/empresas">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Custos e Estrutura</h1>
          <p className="text-muted-foreground">
            {maskCompanyName(companyId, company?.name) ?? "Carregando..."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Custo recorrente mensal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(summary?.totalMonthlyRecurring ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Custo pontual acumulado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(summary?.totalOneTime ?? 0)}</p>
          </CardContent>
        </Card>
      </div>

      <CompanyCostItemsCard companyId={companyId} />
    </div>
  );
}
