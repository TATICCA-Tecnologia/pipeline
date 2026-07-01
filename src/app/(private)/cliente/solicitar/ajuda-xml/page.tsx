"use client";

import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/src/shared/components/ui/button";
import {
  PLATFORMS,
  TARGET_AUDIENCES,
  URGENCY_LEVELS,
  PROCESS_FREQUENCIES,
  HAS_EXISTING_SYSTEM_OPTIONS,
  BENEFIT_OPTIONS,
} from "../utils/solicitar.utils";
import { useTaxonomy } from "../utils/use-taxonomy";

type TagHelp = {
  tag: string;
  required: boolean;
  description: string;
  acceptedValues?: string[];
};

export default function AjudaXmlPage() {
  const { areas, themesByArea } = useTaxonomy();

  const allThemeLabels = Object.values(themesByArea).flatMap((themes) =>
    themes.map((t) => t.label)
  );

  const tags: TagHelp[] = [
    {
      tag: "empresa",
      required: false,
      description:
        "Nome de uma das empresas vinculadas a você. Se você só tiver uma empresa, pode deixar vazio.",
    },
    { tag: "titulo", required: true, description: "Nome do processo." },
    {
      tag: "area",
      required: true,
      description:
        'Área do processo. Se o valor não corresponder a nenhuma opção conhecida, é tratado automaticamente como "Outro".',
      acceptedValues: areas.map((a) => a.label),
    },
    {
      tag: "tema",
      required: true,
      description:
        'Tema dentro da área escolhida. Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".',
      acceptedValues: allThemeLabels,
    },
    {
      tag: "plataforma",
      required: false,
      description:
        "Onde o processo vai funcionar. Um valor não reconhecido gera erro (não existe opção Outro para este campo). Se vazio, usa o padrão (Desktop).",
      acceptedValues: PLATFORMS.map((p) => p.label),
    },
    { tag: "descricao", required: true, description: "Objetivo principal e problema que o processo resolve." },
    {
      tag: "publicoAlvo",
      required: false,
      description: 'Setor envolvido. Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".',
      acceptedValues: TARGET_AUDIENCES.map((t) => t.label),
    },
    {
      tag: "numeroUsuarios",
      required: false,
      description: 'Estimativa de quantas pessoas vão usar (texto livre, ex.: "10 funcionários").',
    },
    {
      tag: "processoExistente",
      required: false,
      description:
        "Se já existe um processo ou sistema atual. Um valor não reconhecido gera erro (não existe opção Outro para este campo).",
      acceptedValues: HAS_EXISTING_SYSTEM_OPTIONS.map((o) => o.label),
    },
    {
      tag: "detalhesProcessoAtual",
      required: false,
      description: "Como o processo funciona hoje e o que costuma dar errado.",
    },
    {
      tag: "colaboradoresEnvolvidos",
      required: false,
      description: "Número de colaboradores envolvidos na execução manual hoje (número inteiro).",
    },
    {
      tag: "duracaoPorExecucao",
      required: false,
      description:
        "Duração total de cada execução em horas, somando o tempo de todos os envolvidos, não só de uma pessoa (número).",
    },
    {
      tag: "periodicidade",
      required: false,
      description:
        "Frequência com que o processo acontece. Um valor não reconhecido gera erro (não existe opção Outro para este campo).",
      acceptedValues: PROCESS_FREQUENCIES.map((p) => p.label),
    },
    {
      tag: "narrativaDoProcesso",
      required: false,
      description: "Descrição livre de como o processo deveria funcionar, fluxos e cenários de uso.",
    },
    {
      tag: "funcionalidades",
      required: false,
      description:
        "Lista de funcionalidades desejadas. Cada item vai em uma tag <funcionalidade> dentro dela.",
    },
    {
      tag: "beneficios",
      required: false,
      description:
        "Lista de benefícios esperados. Cada item vai em uma tag <beneficio> dentro dela, e cada um deve corresponder a uma das opções abaixo.",
      acceptedValues: BENEFIT_OPTIONS.map((b) => b.label),
    },
    {
      tag: "detalhesBeneficios",
      required: false,
      description: "Descrição livre das economias e benefícios principais esperados.",
    },
    {
      tag: "horasEconomizadasPorMes",
      required: false,
      description: "Estimativa de horas economizadas por mês (número).",
    },
    {
      tag: "avaliacaoReducaoErros",
      required: false,
      description: "Avaliação de 1 a 5 do quanto o processo reduz erros.",
    },
    {
      tag: "avaliacaoCriticidadeProcesso",
      required: false,
      description: "Avaliação de 1 a 5 da criticidade do processo para a empresa.",
    },
    {
      tag: "avaliacaoImpactoInterno",
      required: false,
      description: "Avaliação de 1 a 5 do impacto interno na própria área.",
    },
    {
      tag: "avaliacaoImpactoExterno",
      required: false,
      description: "Avaliação de 1 a 5 do impacto externo (clientes/fornecedores).",
    },
    {
      tag: "avaliacaoAtendimentoPoliticas",
      required: false,
      description: "Avaliação de 1 a 5 do atendimento a políticas e leis.",
    },
    {
      tag: "urgencia",
      required: false,
      description:
        "Nível de urgência. Um valor não reconhecido gera erro (não existe opção Outro para este campo).",
      acceptedValues: URGENCY_LEVELS.map((u) => u.label),
    },
    { tag: "prazoLimite", required: false, description: "Data limite desejada, no formato AAAA-MM-DD." },
    {
      tag: "informacoesAdicionais",
      required: false,
      description: "Restrições técnicas, integrações, segurança, dados da empresa, etc.",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-10">
      <header className="flex items-center gap-3">
        <Link href="/cliente/solicitar">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ajuda: importação por XML</h1>
          <p className="text-sm text-muted-foreground">
            O que cada tag do arquivo de importação significa e quais valores são aceitos.
          </p>
        </div>
      </header>

      <a href="/modelo-solicitacao-projeto.xml" download>
        <Button variant="secondary">
          <Download className="mr-2 h-4 w-4" />
          Baixar modelo em branco
        </Button>
      </a>

      <div className="space-y-4">
        {tags.map((t) => (
          <div key={t.tag} className="rounded-md border border-border p-4 space-y-1">
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono text-primary">&lt;{t.tag}&gt;</code>
              {t.required && <span className="text-xs text-destructive">obrigatório</span>}
            </div>
            <p className="text-sm text-muted-foreground">{t.description}</p>
            {t.acceptedValues && t.acceptedValues.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Valores aceitos: {t.acceptedValues.join(", ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
