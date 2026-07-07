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
  HAS_CURRENT_APPLICATION_OPTIONS,
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
        "Nome de uma das empresas disponíveis para você. Se você só tiver uma empresa, pode deixar vazio. Se o valor não corresponder a nenhuma empresa, a importação não falha — você escolhe manualmente a empresa correta antes de o processo ser criado.",
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
        'Onde o processo vai funcionar (não confundir com sistemas que ele integra, como ERPs). Use exatamente um dos valores aceitos, sem texto adicional. Se não corresponder a nenhuma opção conhecida, é tratado como "Outro". Se vazio, usa o padrão (Desktop).',
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
        'Se já existe um processo ou sistema atual. Use exatamente um dos valores aceitos, sem texto adicional — detalhes vão em "Detalhes do processo atual". Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".',
      acceptedValues: HAS_EXISTING_SYSTEM_OPTIONS.map((o) => o.label),
    },
    {
      tag: "detalhesProcessoAtual",
      required: false,
      description: "Como o processo funciona hoje e o que costuma dar errado.",
    },
    {
      tag: "aplicacaoExistenteHoje",
      required: false,
      description:
        'Se já existe uma aplicação (app/sistema) para esse processo hoje. Use exatamente "Sim" ou "Não", sem texto adicional — detalhes vão em "Detalhes da aplicação existente". Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".',
      acceptedValues: HAS_CURRENT_APPLICATION_OPTIONS.map((o) => o.label),
    },
    {
      tag: "detalhesAplicacaoExistente",
      required: false,
      description:
        "Detalhes da aplicação existente: plataforma usada, quem desenvolveu, desde quando está em uso, etc. Preencha só se aplicacaoExistenteHoje for Sim.",
    },
    {
      tag: "colaboradoresEnvolvidos",
      required: false,
      description:
        'Quantidade de colaboradores envolvidos na execução manual hoje (número inteiro — não coloque nomes aqui). Se vier um valor que não seja um número, ele é ignorado sem bloquear a importação e o texto original é movido para <detalhesColaboradores>.',
    },
    {
      tag: "detalhesColaboradores",
      required: false,
      description:
        "Nomes, cargos ou observações sobre quem está envolvido no processo (texto livre, separado de colaboradoresEnvolvidos que é só a contagem).",
    },
    {
      tag: "duracaoPorExecucao",
      required: false,
      description:
        "Duração total de cada execução em horas, somando o tempo de todos os envolvidos, não só de uma pessoa (número). Um valor inválido é ignorado (não bloqueia a importação) e fica registrado em Informações adicionais.",
    },
    {
      tag: "periodicidade",
      required: false,
      description:
        'Frequência com que o processo acontece. Use exatamente um dos valores aceitos, sem texto adicional (ex.: não escreva "Mensal (fechamento)"). Esse campo alimenta o cálculo automático de horas gastas por ano — contexto extra vai em "Informações adicionais". Se não corresponder a nenhuma opção conhecida, é tratado como "Outro" e o cálculo automático não é feito.',
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
        'Lista de benefícios esperados. Cada item vai em uma tag <beneficio> dentro dela. Se não corresponder a nenhuma opção conhecida, é tratado como "Outro" e o texto original é preservado em <detalhesBeneficios>.',
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
      description:
        "Estimativa de horas economizadas por mês (número). Um valor inválido é ignorado (não bloqueia a importação) e fica registrado em Informações adicionais.",
    },
    {
      tag: "avaliacaoReducaoErros",
      required: false,
      description:
        "Avaliação de 1 a 5 do quanto o processo reduz erros. Um valor fora de 1-5 é ignorado (não bloqueia a importação) e fica registrado em Informações adicionais.",
    },
    {
      tag: "avaliacaoCriticidadeProcesso",
      required: false,
      description:
        "Avaliação de 1 a 5 da criticidade do processo para a empresa. Um valor fora de 1-5 é ignorado (não bloqueia a importação) e fica registrado em Informações adicionais.",
    },
    {
      tag: "avaliacaoImpactoInterno",
      required: false,
      description:
        "Avaliação de 1 a 5 do impacto interno na própria área. Um valor fora de 1-5 é ignorado (não bloqueia a importação) e fica registrado em Informações adicionais.",
    },
    {
      tag: "avaliacaoImpactoExterno",
      required: false,
      description:
        "Avaliação de 1 a 5 do impacto externo (clientes/fornecedores). Um valor fora de 1-5 é ignorado (não bloqueia a importação) e fica registrado em Informações adicionais.",
    },
    {
      tag: "avaliacaoAtendimentoPoliticas",
      required: false,
      description:
        "Avaliação de 1 a 5 do atendimento a políticas e leis. Um valor fora de 1-5 é ignorado (não bloqueia a importação) e fica registrado em Informações adicionais.",
    },
    {
      tag: "urgencia",
      required: false,
      description:
        'Nível de urgência. Use exatamente um dos valores aceitos (incluindo o texto depois do travessão), sem texto adicional — o motivo da urgência vai em "Informações adicionais". Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".',
      acceptedValues: URGENCY_LEVELS.map((u) => u.label),
    },
    {
      tag: "prazoLimite",
      required: false,
      description:
        "Data limite desejada, no formato AAAA-MM-DD. Um valor em formato diferente é ignorado (não bloqueia a importação) e fica registrado em Informações adicionais.",
    },
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
