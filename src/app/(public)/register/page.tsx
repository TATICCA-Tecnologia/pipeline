"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import { FieldGroup, Field, FieldLabel } from "@/src/shared/components/ui/field";
import { useAuth } from "@/shared/context/auth-context";
import { trpc } from "@/shared/trpc/client";
import { Spinner } from "@/src/shared/components/ui/spinner";
import { AlertCircle, Building2, Phone, Camera, ChevronRight, ChevronLeft } from "lucide-react";

const STEPS = [
  { id: 1, label: "Dados básicos" },
  { id: 2, label: "Dados de contato" },
  { id: 3, label: "Verificação" },
] as const;

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState("");
  const { loginWithUser } = useAuth();
  const router = useRouter();
  const registerMutation = trpc.auth.register.useMutation({
    onError: (err) => setError(err.message ?? "Erro ao criar conta."),
  });

  function validateStep1() {
    if (!name.trim()) {
      setError("Informe seu nome completo.");
      return false;
    }
    if (name.trim().length < 2) {
      setError("Nome deve ter pelo menos 2 caracteres.");
      return false;
    }
    if (!email.trim()) {
      setError("Informe seu email.");
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Email inválido.");
      return false;
    }
    setError("");
    return true;
  }

  function validateStep3() {
    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return false;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return false;
    }
    if (!acceptTerms) {
      setError("Aceite os Termos de Uso e a Política de Privacidade para continuar.");
      return false;
    }
    setError("");
    return true;
  }

  function handleNext() {
    if (step === 1 && !validateStep1()) return;
    setError("");
    setStep((s) => Math.min(s + 1, 3));
  }

  function handleBack() {
    setError("");
    setStep((s) => Math.max(s - 1, 1));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step < 3) {
      handleNext();
      return;
    }
    if (!validateStep3()) return;
    setError("");
    try {
      const user = await registerMutation.mutateAsync({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        company: company.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      loginWithUser({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companies: user.companies,
        createdAt: user.createdAt instanceof Date ? user.createdAt : new Date(user.createdAt),
      });
      router.push("/cliente");
    } catch {
      // error set in onError
    }
  }

  const isLoading = registerMutation.isPending;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary shadow-sm">
              <span className="text-primary-foreground font-bold text-sm">T</span>
            </div>
            <span className="font-semibold text-lg">TATICCA Pipeline</span>
          </Link>
          <p className="text-sm text-muted-foreground">
            Já tem uma conta?{" "}
            <Link href="/login" className="text-primary font-medium hover:underline">
              Entrar
            </Link>
          </p>
        </header>

        <h1 className="text-xl font-bold sm:text-2xl text-center mb-2">Cadastre-se</h1>
        <div className="flex justify-center gap-2 sm:gap-4 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <button
                type="button"
                onClick={() => setStep(s.id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  step === s.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-current/20 text-[10px]">
                  {s.id}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 mx-0.5 sm:mx-1 shrink-0" />
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {step === 1 && (
            <section className="space-y-6">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Dados básicos
              </h2>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="name">Nome completo</FieldLabel>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Digite seu nome completo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                    className="h-10"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="h-10"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="company">Empresa (opcional)</FieldLabel>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="company"
                      type="text"
                      placeholder="Nome da empresa"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      autoComplete="organization"
                      className="h-10 pl-10"
                    />
                  </div>
                </Field>
                <div className="flex flex-col items-center gap-2 pt-2">
                  <button
                    type="button"
                    className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30 bg-muted/30 text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary transition-colors"
                    aria-label="Adicionar foto"
                  >
                    <Camera className="h-8 w-8" />
                  </button>
                  <span className="text-xs text-muted-foreground">Adicionar foto</span>
                </div>
              </FieldGroup>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-6">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Dados de contato
              </h2>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="phone">Telefone (opcional)</FieldLabel>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="(00) 00000-0000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                      className="h-10 pl-10"
                    />
                  </div>
                </Field>
              </FieldGroup>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-6">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Verificação
              </h2>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="password">Senha</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="h-10"
                    minLength={6}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirmPassword">Confirmar senha</FieldLabel>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Repita a senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="h-10"
                    minLength={6}
                  />
                </Field>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-1 rounded border-input"
                  />
                  <span className="text-sm text-muted-foreground">
                    Li e aceito os{" "}
                    <Link href="#" className="text-primary underline hover:no-underline">
                      Termos de Uso
                    </Link>{" "}
                    e a{" "}
                    <Link href="#" className="text-primary underline hover:no-underline">
                      Política de Privacidade
                    </Link>
                    .
                  </span>
                </label>
              </FieldGroup>
            </section>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
            {step > 1 ? (
              <Button type="button" variant="outline" onClick={handleBack} className="sm:min-w-[120px]">
                <ChevronLeft className="h-4 w-4 mr-1" />
                Voltar
              </Button>
            ) : (
              <div />
            )}
            <div className="flex-1 flex justify-end">
              {step < 3 ? (
                <Button type="button" onClick={handleNext} className="w-full sm:w-auto sm:min-w-[160px]">
                  Salvar e continuar
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button type="submit" disabled={isLoading} className="w-full sm:w-auto sm:min-w-[160px]">
                  {isLoading ? <Spinner className="h-4 w-4" /> : "Criar conta"}
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
