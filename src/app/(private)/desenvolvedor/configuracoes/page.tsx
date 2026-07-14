"use client";

import { useState } from "react";
import { useAuth } from "@/shared/context/auth-context";
import { trpc } from "@/shared/trpc/client";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import { Badge } from "@/src/shared/components/ui/badge";
import { Switch } from "@/src/shared/components/ui/switch";
import { Separator } from "@/src/shared/components/ui/separator";
import { Textarea } from "@/src/shared/components/ui/textarea";
import { useToast } from "@/src/shared/hooks/use-toast";
import {
  SettingsLayout,
  type SettingsSection,
} from "@/shared/components";
import {
  User,
  Mail,
  Phone,
  Code,
  Shield,
  Bell,
  Clock,
  Check,
  X,
} from "lucide-react";

const SKILLS = [
  "React", "Next.js", "TypeScript", "Node.js", "Python",
  "PHP", "Laravel", "Vue.js", "Angular", "PostgreSQL",
  "MongoDB", "AWS", "Docker", "Kubernetes", "GraphQL",
];

export default function DesenvolvedorConfiguracoesPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [profile, setProfile] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: "",
    bio: "Desenvolvedor Full Stack com experiência em React, Node.js e TypeScript.",
    hourlyRate: "150",
    availability: "full-time",
    skills: ["React", "Next.js", "TypeScript", "Node.js"],
  });

  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    projectUpdates: true,
    deadlineReminders: true,
    newProjectAlerts: true,
    darkMode: true,
    compactView: false,
  });

  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: "",
  });

  const [isLoading, setIsLoading] = useState(false);

  const changePasswordMutation = trpc.user.changePassword.useMutation();

  function handleProfileChange(field: string, value: string) {
    setProfile((prev) => ({ ...prev, [field]: value }));
  }

  function toggleSkill(skill: string) {
    setProfile((prev) => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter((s) => s !== skill)
        : [...prev.skills, skill],
    }));
  }

  async function handleSaveProfile() {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoading(false);
    toast({
      title: "Perfil atualizado",
      description: "Suas informações foram salvas com sucesso.",
    });
  }

  async function handleChangePassword() {
    if (passwords.new !== passwords.confirm) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem.",
        variant: "destructive",
      });
      return;
    }
    if (passwords.new.length < 6) {
      toast({
        title: "Erro",
        description: "A nova senha deve ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    try {
      await changePasswordMutation.mutateAsync({
        currentPassword: passwords.current,
        newPassword: passwords.new,
      });
      setPasswords({ current: "", new: "", confirm: "" });
      toast({
        title: "Senha alterada",
        description: "Sua senha foi alterada com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao alterar senha",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSavePreferences() {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsLoading(false);
    toast({
      title: "Preferências salvas",
      description: "Suas preferências foram atualizadas.",
    });
  }

  const sections: SettingsSection[] = [
    {
      id: "perfil",
      label: "Perfil",
      description: "Atualize suas informações pessoais e profissionais",
      icon: User,
      content: (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome Completo</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={profile.name}
                  onChange={(e) => handleProfileChange("name", e.target.value)}
                  className="pl-10"
                  placeholder="Seu nome"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={profile.email}
                  onChange={(e) => handleProfileChange("email", e.target.value)}
                  className="pl-10"
                  placeholder="seu@email.com"
                  type="email"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Telefone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={profile.phone}
                  onChange={(e) => handleProfileChange("phone", e.target.value)}
                  className="pl-10"
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Valor Hora (R$)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  R$
                </span>
                <Input
                  value={profile.hourlyRate}
                  onChange={(e) =>
                    handleProfileChange("hourlyRate", e.target.value)
                  }
                  className="pl-10"
                  placeholder="150"
                  type="number"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Bio / Descrição</label>
            <Textarea
              value={profile.bio}
              onChange={(e) => handleProfileChange("bio", e.target.value)}
              placeholder="Fale um pouco sobre você e sua experiência..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Disponibilidade</label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "full-time", label: "Tempo Integral" },
                { value: "part-time", label: "Meio Período" },
                { value: "freelance", label: "Freelancer" },
              ].map((option) => (
                <Button
                  key={option.value}
                  variant={
                    profile.availability === option.value ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() =>
                    handleProfileChange("availability", option.value)
                  }
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Code className="h-4 w-4" />
              Habilidades Técnicas
            </label>
            <div className="flex flex-wrap gap-2">
              {SKILLS.map((skill) => (
                <Badge
                  key={skill}
                  variant={
                    profile.skills.includes(skill) ? "default" : "outline"
                  }
                  className="cursor-pointer transition-colors"
                  onClick={() => toggleSkill(skill)}
                >
                  {profile.skills.includes(skill) ? (
                    <Check className="mr-1 h-3 w-3" />
                  ) : (
                    <X className="mr-1 h-3 w-3" />
                  )}
                  {skill}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveProfile} disabled={isLoading}>
              {isLoading ? "Salvando..." : "Salvar Perfil"}
            </Button>
          </div>
        </div>
      ),
    },
    {
      id: "notificacoes",
      label: "Notificações",
      description: "Configure como deseja receber notificações",
      icon: Bell,
      content: (
        <div className="space-y-4">
          {[
            {
              key: "emailNotifications" as const,
              label: "Notificações por Email",
              desc: "Receber atualizações no email",
            },
            {
              key: "projectUpdates" as const,
              label: "Atualizações de Projeto",
              desc: "Novos comentários e mudanças",
            },
            {
              key: "deadlineReminders" as const,
              label: "Lembretes de Prazo",
              desc: "Alertas de deadlines próximos",
            },
            {
              key: "newProjectAlerts" as const,
              label: "Novos Projetos",
              desc: "Alertas de projetos atribuídos",
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
                  checked={preferences[item.key]}
                  onCheckedChange={(checked) =>
                    setPreferences((prev) => ({ ...prev, [item.key]: checked }))
                  }
                />
              </div>
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Button onClick={handleSavePreferences} variant="outline">
              Salvar Preferências
            </Button>
          </div>
        </div>
      ),
    },
    {
      id: "seguranca",
      label: "Segurança",
      description: "Altere sua senha de acesso",
      icon: Shield,
      content: (
        <div className="space-y-4 max-w-md">
          <div className="space-y-2">
            <label className="text-sm font-medium">Senha Atual</label>
            <Input
              type="password"
              value={passwords.current}
              onChange={(e) =>
                setPasswords((prev) => ({ ...prev, current: e.target.value }))
              }
              placeholder="Digite sua senha atual"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Nova Senha</label>
            <Input
              type="password"
              value={passwords.new}
              onChange={(e) =>
                setPasswords((prev) => ({ ...prev, new: e.target.value }))
              }
              placeholder="Digite a nova senha"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Confirmar Nova Senha</label>
            <Input
              type="password"
              value={passwords.confirm}
              onChange={(e) =>
                setPasswords((prev) => ({ ...prev, confirm: e.target.value }))
              }
              placeholder="Confirme a nova senha"
            />
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={handleChangePassword} variant="outline">
              Alterar Senha
            </Button>
          </div>
        </div>
      ),
    },
    {
      id: "conta",
      label: "Conta",
      description: "Informações da sua conta",
      icon: Clock,
      content: (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">Membro desde</p>
            <p className="text-sm font-medium">Janeiro 2024</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">Projetos Concluídos</p>
            <p className="text-sm font-medium">12 projetos</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">Último Acesso</p>
            <p className="text-sm font-medium">Agora</p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <SettingsLayout
      title="Configurações"
      description="Gerencie seu perfil e preferências"
      sections={sections}
    />
  );
}
