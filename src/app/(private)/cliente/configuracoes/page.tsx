"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/shared/context/auth-context";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import { FieldGroup, Field, FieldLabel } from "@/src/shared/components/ui/field";
import { Separator } from "@/src/shared/components/ui/separator";
import { useToast } from "@/src/shared/hooks/use-toast";
import { trpc } from "@/shared/trpc/client";
import {
  SettingsLayout,
  type SettingsSection,
} from "@/shared/components";
import { User, Building2, Lock, Bell, Shield } from "lucide-react";

export default function ClienteConfiguracoes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: profile, isLoading: profileLoading } = trpc.user.me.useQuery(
    undefined,
    { enabled: !!user?.id }
  );
  const utils = trpc.useUtils();
  const updateProfileMutation = trpc.user.updateProfile.useMutation({
    onSuccess: () => {
      utils.user.me.invalidate();
    },
  });

  const [profileData, setProfileData] = useState({
    name: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    if (profile) {
      setProfileData({
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
      });
    } else if (user) {
      setProfileData({
        name: user.name ?? "",
        email: user.email ?? "",
        phone: "",
      });
    }
  }, [profile, user]);

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [notifications, setNotifications] = useState({
    emailUpdates: true,
    projectUpdates: true,
    weeklyReport: false,
  });

  const [isLoading, setIsLoading] = useState(false);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      await updateProfileMutation.mutateAsync({
        name: profileData.name,
        phone: profileData.phone || undefined,
      });
      toast({
        title: "Perfil atualizado",
        description: "Suas informações foram salvas com sucesso.",
      });
    } catch {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível atualizar o perfil. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem.",
        variant: "destructive",
      });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast({
        title: "Erro",
        description: "A senha deve ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    toast({
      title: "Senha alterada",
      description: "Sua senha foi atualizada com sucesso.",
    });
    setPasswordData({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setIsLoading(false);
  }

  async function handleSaveNotifications() {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    toast({
      title: "Preferências salvas",
      description: "Suas preferências de notificação foram atualizadas.",
    });
    setIsLoading(false);
  }

  const sections: SettingsSection[] = [
    {
      id: "perfil",
      label: "Perfil",
      description: "Atualize suas informações pessoais e de contato",
      icon: User,
      content: (
        <form onSubmit={handleSaveProfile}>
          {profileLoading && !profile ? (
            <p className="text-sm text-muted-foreground py-4">
              Carregando perfil...
            </p>
          ) : (
            <FieldGroup>
              <Field>
                <FieldLabel>Nome completo</FieldLabel>
                <Input
                  value={profileData.name}
                  onChange={(e) =>
                    setProfileData({ ...profileData, name: e.target.value })
                  }
                  placeholder="Seu nome"
                />
              </Field>

              <Field>
                <FieldLabel>Email</FieldLabel>
                <Input
                  type="email"
                  value={profileData.email}
                  onChange={(e) =>
                    setProfileData({ ...profileData, email: e.target.value })
                  }
                  placeholder="seu@email.com"
                  disabled
                />
                <p className="text-xs text-muted-foreground mt-1">
                  O email não pode ser alterado
                </p>
              </Field>

              <Field>
                <FieldLabel>Empresas vinculadas</FieldLabel>
                <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  {profile && profile.companies.length > 0 ? (
                    <span>{profile.companies.map((c) => c.name).join(", ")}</span>
                  ) : (
                    <span className="text-muted-foreground">
                      Nenhuma empresa vinculada — fale com o administrador.
                    </span>
                  )}
                </div>
              </Field>

              <Field>
                <FieldLabel>Telefone</FieldLabel>
                <Input
                  type="tel"
                  value={profileData.phone}
                  onChange={(e) =>
                    setProfileData({ ...profileData, phone: e.target.value })
                  }
                  placeholder="(00) 00000-0000"
                />
              </Field>
            </FieldGroup>
          )}
          <div className="mt-6 flex justify-end">
            <Button
              type="submit"
              disabled={
                isLoading || updateProfileMutation.isPending || profileLoading
              }
              className="w-full sm:w-auto"
            >
              {isLoading || updateProfileMutation.isPending
                ? "Salvando..."
                : "Salvar alterações"}
            </Button>
          </div>
        </form>
      ),
    },
    {
      id: "senha",
      label: "Senha",
      description: "Mantenha sua conta segura atualizando sua senha regularmente",
      icon: Lock,
      content: (
        <form onSubmit={handleChangePassword}>
          <FieldGroup>
            <Field>
              <FieldLabel>Senha atual</FieldLabel>
              <Input
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) =>
                  setPasswordData({
                    ...passwordData,
                    currentPassword: e.target.value,
                  })
                }
                placeholder="Digite sua senha atual"
              />
            </Field>

            <Separator className="my-2" />

            <Field>
              <FieldLabel>Nova senha</FieldLabel>
              <Input
                type="password"
                value={passwordData.newPassword}
                onChange={(e) =>
                  setPasswordData({
                    ...passwordData,
                    newPassword: e.target.value,
                  })
                }
                placeholder="Digite a nova senha"
              />
            </Field>

            <Field>
              <FieldLabel>Confirmar nova senha</FieldLabel>
              <Input
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) =>
                  setPasswordData({
                    ...passwordData,
                    confirmPassword: e.target.value,
                  })
                }
                placeholder="Confirme a nova senha"
              />
            </Field>
          </FieldGroup>

          <div className="mt-6 flex justify-end">
            <Button
              type="submit"
              variant="secondary"
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              {isLoading ? "Alterando..." : "Alterar senha"}
            </Button>
          </div>
        </form>
      ),
    },
    {
      id: "notificacoes",
      label: "Notificações",
      description: "Configure como e quando deseja receber atualizações",
      icon: Bell,
      content: (
        <div className="space-y-4">
          {[
            {
              key: "emailUpdates" as const,
              label: "Atualizações por email",
              desc: "Receba notificações gerais por email",
            },
            {
              key: "projectUpdates" as const,
              label: "Atualizações de projetos",
              desc: "Seja notificado quando houver mudanças nos seus projetos",
            },
            {
              key: "weeklyReport" as const,
              label: "Relatório semanal",
              desc: "Receba um resumo semanal do progresso dos seus projetos",
            },
          ].map((item, i) => (
            <div key={item.key}>
              {i > 0 && <Separator className="my-4" />}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{item.label}</p>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
                <Button
                  variant={notifications[item.key] ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setNotifications({
                      ...notifications,
                      [item.key]: !notifications[item.key],
                    });
                    handleSaveNotifications();
                  }}
                >
                  {notifications[item.key] ? "Ativado" : "Desativado"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "conta",
      label: "Conta",
      description: "Informações sobre a segurança da sua conta",
      icon: Shield,
      content: (
        <div className="space-y-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium text-sm">Último acesso</p>
              <p className="text-sm text-muted-foreground">
                {new Date().toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium text-sm">Conta criada em</p>
              <p className="text-sm text-muted-foreground">
                {profile?.createdAt
                  ? new Date(profile.createdAt).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })
                  : user?.createdAt
                    ? new Date(user.createdAt).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })
                    : "N/A"}
              </p>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <SettingsLayout
      title="Configurações"
      description="Gerencie suas informações pessoais e preferências"
      sections={sections}
    />
  );
}
