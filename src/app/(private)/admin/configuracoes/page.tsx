"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { trpc } from "@/shared/trpc/client";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import { Switch } from "@/src/shared/components/ui/switch";
import { Separator } from "@/src/shared/components/ui/separator";
import { Textarea } from "@/src/shared/components/ui/textarea";
import { useToast } from "@/src/shared/hooks/use-toast";
import {
  SettingsLayout,
  type SettingsSection,
} from "@/shared/components";
import {
  Building,
  Bell,
  Shield,
  Database,
  Globe,
  Tag,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";

// Pesos de priorização (motor de scoring) — agrupados para a UI.
const QUAL_WEIGHT_FIELDS = [
  { key: "qualWeightErrorReduction", label: "Redução de erros" },
  { key: "qualWeightProcessCriticality", label: "Criticidade do processo" },
  { key: "qualWeightInternalImpact", label: "Impacto interno" },
  { key: "qualWeightExternalImpact", label: "Impacto externo" },
  { key: "qualWeightCompliance", label: "Políticas / leis" },
] as const;

const SCORE_WEIGHT_FIELDS = [
  { key: "scoreWeightEconomia", label: "Economia financeira" },
  { key: "scoreWeightQualitativo", label: "Qualitativo" },
  { key: "scoreWeightComplexidade", label: "Complexidade técnica" },
] as const;

type WeightKey =
  | (typeof QUAL_WEIGHT_FIELDS)[number]["key"]
  | (typeof SCORE_WEIGHT_FIELDS)[number]["key"];

const WEIGHT_SUM_TOLERANCE = 0.01;

function sumWeights(weights: Record<string, string>, keys: readonly string[]) {
  return keys.reduce((total, key) => total + (Number(weights[key]) || 0), 0);
}

export default function AdminConfiguracoesPage() {
  const { toast } = useToast();

  const [companySettings, setCompanySettings] = useState({
    name: "Tech Projects",
    email: "contato@techprojects.com",
    phone: "(11) 99999-9999",
    address: "Av. Paulista, 1000 - São Paulo, SP",
    website: "https://techprojects.com",
    description: "Empresa especializada em desenvolvimento de software sob demanda.",
  });

  const [systemSettings, setSystemSettings] = useState({
    maintenanceMode: false,
    registrationEnabled: true,
    maxProjectsPerClient: 10,
    maxFileSize: 10,
    allowedFileTypes: ".pdf,.doc,.docx,.png,.jpg,.zip",
    defaultProjectStatus: "backlog",
  });

  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    slackIntegration: false,
    webhookUrl: "",
    notifyOnNewProject: true,
    notifyOnStatusChange: true,
    notifyOnDeadline: true,
    dailyDigest: false,
  });

  const [securitySettings, setSecuritySettings] = useState({
    twoFactorAuth: false,
    sessionTimeout: 30,
    passwordMinLength: 8,
    requireSpecialChars: true,
    maxLoginAttempts: 5,
    ipWhitelist: "",
  });

  const [isLoading, setIsLoading] = useState(false);

  // ── Pesos de priorização (dados reais) ────────────────────────────────
  const settingsQuery = trpc.settings.getSettings.useQuery();
  const utils = trpc.useUtils();
  const updateWeights = trpc.settings.updateScoringWeights.useMutation({
    onSuccess: async () => {
      await utils.settings.getSettings.invalidate();
      toast({
        title: "Pesos atualizados",
        description: "Os pesos de priorização foram salvos.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const [weights, setWeights] = useState<Record<WeightKey, string>>({
    qualWeightErrorReduction: "",
    qualWeightProcessCriticality: "",
    qualWeightInternalImpact: "",
    qualWeightExternalImpact: "",
    qualWeightCompliance: "",
    scoreWeightEconomia: "",
    scoreWeightQualitativo: "",
    scoreWeightComplexidade: "",
  });

  // Premissas de implementação (taxa diária do desenvolvedor, data de início da onda 1).
  const [developerDailyRateBRL, setDeveloperDailyRateBRL] = useState<string>("");
  const [wave1StartDate, setWave1StartDate] = useState<string>("");

  // Semeia os inputs a partir dos valores reais quando a query resolve.
  useEffect(() => {
    if (!settingsQuery.data) return;
    const s = settingsQuery.data;
    setWeights({
      qualWeightErrorReduction: String(s.qualWeightErrorReduction),
      qualWeightProcessCriticality: String(s.qualWeightProcessCriticality),
      qualWeightInternalImpact: String(s.qualWeightInternalImpact),
      qualWeightExternalImpact: String(s.qualWeightExternalImpact),
      qualWeightCompliance: String(s.qualWeightCompliance),
      scoreWeightEconomia: String(s.scoreWeightEconomia),
      scoreWeightQualitativo: String(s.scoreWeightQualitativo),
      scoreWeightComplexidade: String(s.scoreWeightComplexidade),
    });
    setDeveloperDailyRateBRL(
      s.developerDailyRateBRL != null ? String(s.developerDailyRateBRL) : ""
    );
    setWave1StartDate(
      s.wave1StartDate ? new Date(s.wave1StartDate).toISOString().slice(0, 10) : ""
    );
  }, [settingsQuery.data]);

  const qualSum = sumWeights(
    weights,
    QUAL_WEIGHT_FIELDS.map((f) => f.key)
  );
  const scoreSum = sumWeights(
    weights,
    SCORE_WEIGHT_FIELDS.map((f) => f.key)
  );
  const qualSumValid = Math.abs(qualSum - 1) <= WEIGHT_SUM_TOLERANCE;
  const scoreSumValid = Math.abs(scoreSum - 1) <= WEIGHT_SUM_TOLERANCE;
  const weightsValid = qualSumValid && scoreSumValid;

  function handleSaveWeights() {
    if (!weightsValid) return;
    const parsedRate = Number(developerDailyRateBRL);
    updateWeights.mutate({
      qualWeightErrorReduction: Number(weights.qualWeightErrorReduction),
      qualWeightProcessCriticality: Number(weights.qualWeightProcessCriticality),
      qualWeightInternalImpact: Number(weights.qualWeightInternalImpact),
      qualWeightExternalImpact: Number(weights.qualWeightExternalImpact),
      qualWeightCompliance: Number(weights.qualWeightCompliance),
      scoreWeightEconomia: Number(weights.scoreWeightEconomia),
      scoreWeightQualitativo: Number(weights.scoreWeightQualitativo),
      scoreWeightComplexidade: Number(weights.scoreWeightComplexidade),
      developerDailyRateBRL:
        developerDailyRateBRL.trim() !== "" && !Number.isNaN(parsedRate) && parsedRate >= 0
          ? parsedRate
          : null,
      wave1StartDate: wave1StartDate ? new Date(wave1StartDate) : null,
    });
  }

  async function handleSaveCompany() {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoading(false);
    toast({
      title: "Configurações salvas",
      description: "As informações da empresa foram atualizadas.",
    });
  }

  async function handleSaveSystem() {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoading(false);
    toast({
      title: "Sistema atualizado",
      description: "As configurações do sistema foram salvas.",
    });
  }

  async function handleSaveNotifications() {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoading(false);
    toast({
      title: "Notificações atualizadas",
      description: "As preferências de notificação foram salvas.",
    });
  }

  async function handleSaveSecurity() {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoading(false);
    toast({
      title: "Segurança atualizada",
      description: "As configurações de segurança foram salvas.",
    });
  }

  const sections: SettingsSection[] = [
    {
      id: "empresa",
      label: "Empresa",
      description: "Configure os dados da sua empresa",
      icon: Building,
      content: (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome da Empresa</label>
              <Input
                value={companySettings.name}
                onChange={(e) =>
                  setCompanySettings((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                placeholder="Nome da empresa"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email de Contato</label>
              <Input
                value={companySettings.email}
                onChange={(e) =>
                  setCompanySettings((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }))
                }
                placeholder="email@empresa.com"
                type="email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Telefone</label>
              <Input
                value={companySettings.phone}
                onChange={(e) =>
                  setCompanySettings((prev) => ({
                    ...prev,
                    phone: e.target.value,
                  }))
                }
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Website</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={companySettings.website}
                  onChange={(e) =>
                    setCompanySettings((prev) => ({
                      ...prev,
                      website: e.target.value,
                    }))
                  }
                  className="pl-10"
                  placeholder="https://seusite.com"
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Endereço</label>
            <Input
              value={companySettings.address}
              onChange={(e) =>
                setCompanySettings((prev) => ({
                  ...prev,
                  address: e.target.value,
                }))
              }
              placeholder="Endereço completo"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Descrição</label>
            <Textarea
              value={companySettings.description}
              onChange={(e) =>
                setCompanySettings((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Descrição da empresa..."
              rows={3}
            />
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={handleSaveCompany} disabled={isLoading}>
              {isLoading ? "Salvando..." : "Salvar Informações"}
            </Button>
          </div>
        </div>
      ),
    },
    {
      id: "sistema",
      label: "Sistema",
      description: "Defina os parâmetros gerais do sistema",
      icon: Database,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Modo de Manutenção</p>
              <p className="text-xs text-muted-foreground">
                Desativa o acesso ao sistema temporariamente
              </p>
            </div>
            <Switch
              checked={systemSettings.maintenanceMode}
              onCheckedChange={(checked) =>
                setSystemSettings((prev) => ({
                  ...prev,
                  maintenanceMode: checked,
                }))
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Registro de Novos Usuários</p>
              <p className="text-xs text-muted-foreground">
                Permite cadastro de novos clientes
              </p>
            </div>
            <Switch
              checked={systemSettings.registrationEnabled}
              onCheckedChange={(checked) =>
                setSystemSettings((prev) => ({
                  ...prev,
                  registrationEnabled: checked,
                }))
              }
            />
          </div>
          <Separator />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Projetos por Cliente (máx)
              </label>
              <Input
                type="number"
                value={systemSettings.maxProjectsPerClient}
                onChange={(e) =>
                  setSystemSettings((prev) => ({
                    ...prev,
                    maxProjectsPerClient: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Tamanho Máximo de Arquivo (MB)
              </label>
              <Input
                type="number"
                value={systemSettings.maxFileSize}
                onChange={(e) =>
                  setSystemSettings((prev) => ({
                    ...prev,
                    maxFileSize: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Tipos de Arquivo Permitidos
            </label>
            <Input
              value={systemSettings.allowedFileTypes}
              onChange={(e) =>
                setSystemSettings((prev) => ({
                  ...prev,
                  allowedFileTypes: e.target.value,
                }))
              }
              placeholder=".pdf,.doc,.docx,.png,.jpg"
            />
            <p className="text-xs text-muted-foreground">Separados por vírgula</p>
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={handleSaveSystem} disabled={isLoading}>
              Salvar Configurações
            </Button>
          </div>
        </div>
      ),
    },
    {
      id: "notificacoes",
      label: "Notificações",
      description: "Configure alertas e integrações",
      icon: Bell,
      content: (
        <div className="space-y-4">
          {[
            {
              key: "emailNotifications" as const,
              label: "Notificações por Email",
              desc: "Enviar emails automáticos",
            },
            {
              key: "notifyOnNewProject" as const,
              label: "Novos Projetos",
              desc: "Alertar sobre novas solicitações",
            },
            {
              key: "notifyOnStatusChange" as const,
              label: "Mudança de Status",
              desc: "Alertar sobre mudanças em projetos",
            },
            {
              key: "notifyOnDeadline" as const,
              label: "Deadlines",
              desc: "Alertar sobre prazos próximos",
            },
            {
              key: "dailyDigest" as const,
              label: "Resumo Diário",
              desc: "Email com resumo do dia",
            },
          ].map((item, i) => (
            <div key={item.key}>
              {i > 0 && <Separator className="my-4" />}
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch
                  checked={
                    notificationSettings[
                      item.key as keyof typeof notificationSettings
                    ] as boolean
                  }
                  onCheckedChange={(checked) =>
                    setNotificationSettings((prev) => ({
                      ...prev,
                      [item.key]: checked,
                    }))
                  }
                />
              </div>
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Button onClick={handleSaveNotifications} variant="outline">
              Salvar Notificações
            </Button>
          </div>
        </div>
      ),
    },
    {
      id: "seguranca",
      label: "Segurança",
      description: "Configure políticas de segurança",
      icon: Shield,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Autenticação 2 Fatores</p>
              <p className="text-xs text-muted-foreground">
                Exigir 2FA para todos usuários
              </p>
            </div>
            <Switch
              checked={securitySettings.twoFactorAuth}
              onCheckedChange={(checked) =>
                setSecuritySettings((prev) => ({
                  ...prev,
                  twoFactorAuth: checked,
                }))
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Caracteres Especiais</p>
              <p className="text-xs text-muted-foreground">Exigir na senha</p>
            </div>
            <Switch
              checked={securitySettings.requireSpecialChars}
              onCheckedChange={(checked) =>
                setSecuritySettings((prev) => ({
                  ...prev,
                  requireSpecialChars: checked,
                }))
              }
            />
          </div>
          <Separator />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Timeout da Sessão (min)
              </label>
              <Input
                type="number"
                value={securitySettings.sessionTimeout}
                onChange={(e) =>
                  setSecuritySettings((prev) => ({
                    ...prev,
                    sessionTimeout: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Tentativas de Login (máx)
              </label>
              <Input
                type="number"
                value={securitySettings.maxLoginAttempts}
                onChange={(e) =>
                  setSecuritySettings((prev) => ({
                    ...prev,
                    maxLoginAttempts: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Tamanho Mínimo da Senha
            </label>
            <Input
              type="number"
              value={securitySettings.passwordMinLength}
              onChange={(e) =>
                setSecuritySettings((prev) => ({
                  ...prev,
                  passwordMinLength: parseInt(e.target.value) || 0,
                }))
              }
            />
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={handleSaveSecurity} variant="outline">
              Salvar Segurança
            </Button>
          </div>
        </div>
      ),
    },
    {
      id: "priorizacao",
      label: "Premissas de priorização",
      description:
        "Ajuste os pesos do motor de scoring e as premissas de implementação (taxa diária, início da onda 1)",
      icon: SlidersHorizontal,
      content: (
        <div className="space-y-6">
          {settingsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <>
              {/* Bloco 1: pesos qualitativos */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-semibold">Pesos qualitativos</p>
                  <span
                    className={`text-xs font-medium ${
                      qualSumValid ? "text-muted-foreground" : "text-destructive"
                    }`}
                  >
                    Soma: {qualSum.toFixed(2)}
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {QUAL_WEIGHT_FIELDS.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <label className="text-sm font-medium">{field.label}</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={weights[field.key]}
                        onChange={(e) =>
                          setWeights((prev) => ({
                            ...prev,
                            [field.key]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
                {!qualSumValid && (
                  <p className="text-xs text-destructive">
                    Os pesos qualitativos devem somar 1.00.
                  </p>
                )}
              </div>

              <Separator />

              {/* Bloco 2: pesos do score combinado */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-semibold">
                    Pesos do score combinado
                  </p>
                  <span
                    className={`text-xs font-medium ${
                      scoreSumValid
                        ? "text-muted-foreground"
                        : "text-destructive"
                    }`}
                  >
                    Soma: {scoreSum.toFixed(2)}
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {SCORE_WEIGHT_FIELDS.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <label className="text-sm font-medium">{field.label}</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={weights[field.key]}
                        onChange={(e) =>
                          setWeights((prev) => ({
                            ...prev,
                            [field.key]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
                {!scoreSumValid && (
                  <p className="text-xs text-destructive">
                    Os pesos do score combinado devem somar 1.00.
                  </p>
                )}
              </div>

              <Separator />

              {/* Bloco 3: premissas de implementação (taxa diária, início da onda 1) */}
              <div className="space-y-3">
                <p className="text-sm font-semibold">Premissas de implementação</p>
                <p className="text-xs text-muted-foreground">
                  Usadas para calcular a timeline e o payback de implementação dos
                  robôs (ondas de priorização).
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Taxa diária do desenvolvedor (R$)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={developerDailyRateBRL}
                      onChange={(e) => setDeveloperDailyRateBRL(e.target.value)}
                      placeholder="Ex.: 800"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Data de início da onda 1
                    </label>
                    <Input
                      type="date"
                      value={wave1StartDate}
                      onChange={(e) => setWave1StartDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleSaveWeights}
                  disabled={!weightsValid || updateWeights.isPending}
                >
                  {updateWeights.isPending ? "Salvando..." : "Salvar Pesos"}
                </Button>
              </div>
            </>
          )}
        </div>
      ),
    },
    {
      id: "categorias",
      label: "Categorias",
      description: "Configure áreas, subtipos e funcionalidades sugeridas",
      icon: Tag,
      content: (
        <Link href="/admin/configuracoes/categorias" className="block group">
          <div className="flex items-center gap-4 rounded-lg border border-primary/20 bg-linear-to-br from-primary/5 via-background to-background p-4 sm:p-5 transition-colors hover:border-primary/40">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
              <Tag className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold sm:text-base">
                Categorias, temas e sugestões
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                Configure áreas, subtipos e funcionalidades sugeridas no
                formulário de solicitação de projetos.
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
        </Link>
      ),
    },
  ];

  return (
    <SettingsLayout
      title="Configurações do Sistema"
      description="Gerencie as configurações gerais da plataforma"
      sections={sections}
    />
  );
}
