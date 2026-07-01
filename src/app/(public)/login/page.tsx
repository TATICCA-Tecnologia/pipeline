"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import { FieldGroup, Field, FieldLabel } from "@/src/shared/components/ui/field";
import { Checkbox } from "@/src/shared/components/ui/checkbox";
import { useAuth } from "@/shared/context/auth-context";
import { trpc } from "@/shared/trpc/client";
import { Spinner } from "@/src/shared/components/ui/spinner";
import { AlertCircle, Mail, Lock, Eye, EyeOff, Shield, BadgeCheck } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const { loginWithUser } = useAuth();
  const router = useRouter();
  const loginMutation = trpc.auth.login.useMutation({
    onError: (err) => setError(err.message ?? "Email ou senha inválidos."),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const user = await loginMutation.mutateAsync({ email: email.trim(), password });
      const normalizedUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companies: user.companies,
        createdAt: user.createdAt instanceof Date ? user.createdAt : new Date(user.createdAt),
      };
      loginWithUser(normalizedUser);
      if (normalizedUser.role === "admin" || normalizedUser.role === "super_admin") {
        router.push("/admin");
      } else if (normalizedUser.role === "developer") {
        router.push("/desenvolvedor");
      } else {
        router.push("/cliente");
      }
    } catch {
      // erro já tratado em onError
    }
  }

  const isLoading = loginMutation.isPending;

  return (
    <div className="min-h-screen flex">
      {/* Coluna esquerda - Branding e informações */}
      <aside className="hidden lg:flex lg:w-[45%] xl:w-[50%] flex-col justify-between bg-primary p-8 xl:p-12 text-primary-foreground">
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/20">
              <span className="text-sm font-bold text-primary-foreground">co</span>
            </div>
            <span className="font-semibold text-lg">TATICCA Pipeline</span>
          </Link>
          
          <div className="mt-16 max-w-sm">
            <h2 className="text-2xl xl:text-3xl font-bold leading-tight">
              Acesso à plataforma
            </h2>
            <p className="mt-4 text-sm text-primary-foreground/90 leading-relaxed">
              Gerencie seus projetos, acompanhe o progresso e mantenha contato com sua equipe com segurança e praticidade.
            </p>
          </div>
          <div className="mt-12 space-y-6">
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/20">
                <Shield className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <p className="font-medium">Conexão segura</p>
                <p className="text-xs text-primary-foreground/80 mt-0.5">Certificação SSL e dados criptografados</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/20">
                <BadgeCheck className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <p className="font-medium">Plataforma confiável</p>
                <p className="text-xs text-primary-foreground/80 mt-0.5">Gestão de projetos profissional</p>
              </div>
            </div>
          </div>
        </div>
        <p className="text-xs text-primary-foreground/70">
          Suporte disponível para ajudar você no que precisar.
        </p>
      </aside>

      {/* Coluna direita - Formulário */}
      <main className="flex-1 flex flex-col justify-center p-6 sm:p-8 lg:p-12 bg-background">
        <div className="w-full max-w-[400px] mx-auto">
          <h1 className="text-xl font-bold text-foreground">Faça o login</h1>
          <p className="text-sm text-muted-foreground mt-1">para acessar a sua conta</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="h-11 pl-10"
                  />
                </div>
              </Field>

              <Field>
                <FieldLabel htmlFor="password">Senha</FieldLabel>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Sua senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="h-11 pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
            </FieldGroup>

            <div className="flex items-center justify-between gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={rememberMe}
                  onCheckedChange={(v) => setRememberMe(v === true)}
                  aria-label="Lembrar meus dados"
                />
                <span className="text-sm text-muted-foreground">Lembrar meus dados</span>
              </label>
              <Link href="#" className="text-sm text-primary hover:underline">
                Recuperar senha
              </Link>
            </div>

            <Button type="submit" className="w-full h-11 bg-primary hover:bg-primary/90" disabled={isLoading}>
              {isLoading ? <Spinner className="h-4 w-4" /> : "Acessar conta"}
            </Button>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-3 text-xs font-medium text-muted-foreground uppercase">Ou</span>
              </div>
            </div>

            <Button type="button" variant="outline" className="w-full h-11" asChild>
              <Link href="/register">Criar nova conta</Link>
            </Button>
          </form>

          <p className="mt-8 text-xs text-muted-foreground">
            Ao continuar, estou de acordo com a{" "}
            <Link href="#" className="underline hover:text-foreground">Política de privacidade</Link>
            {" "}e{" "}
            <Link href="#" className="underline hover:text-foreground">Termos de uso</Link>.
          </p>

          <details className="mt-6 group">
            <summary className="text-xs text-muted-foreground cursor-pointer list-none hover:text-foreground">
              Contas de demonstração
            </summary>
            <div className="mt-3 space-y-2 text-xs rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Cliente</span>
                <code className="font-mono">cliente@email.com</code>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Desenvolvedor</span>
                <code className="font-mono">dev@email.com</code>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Admin</span>
                <code className="font-mono">admin@email.com</code>
              </div>
            </div>
          </details>
        </div>
      </main>
    </div>
  );
}
