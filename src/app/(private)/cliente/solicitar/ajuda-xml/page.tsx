"use client";

import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/src/shared/components/ui/button";
import {
  PLATFORMS,
  TARGET_AUDIENCES,
  PROCESS_FREQUENCIES,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  CURRENT_APPLICATION_HOSTING_OPTIONS,
  CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
  CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH,
  CURRENT_APPLICATION_DATA_ENDPOINT_OPTIONS,
  CURRENT_APPLICATION_CONTINGENCY_OPTIONS,
  AUTOMATION_ACCOUNT_TYPE_OPTIONS,
  AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH,
  SENSITIVE_DATA_ANSWER_OPTIONS,
  SENSITIVE_DATA_CATEGORY_OPTIONS,
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
  const { areas, themesByArea, urgencyLevels } = useTaxonomy();

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
        "Observações livres sobre a aplicação existente: limitações conhecidas, o que costuma quebrar, integrações. Preencha só se aplicacaoExistenteHoje for Sim. Os dados estruturados da automação (onde roda, quem fez, acessos) têm tags próprias, abaixo.",
    },
    {
      tag: "hospedagemAplicacaoExistente",
      required: false,
      description:
        'Onde a automação roda hoje. Preencha só se aplicacaoExistenteHoje for Sim. Se não corresponder a nenhuma opção conhecida, é tratado como "Outro" e o texto original é preservado.',
      acceptedValues: CURRENT_APPLICATION_HOSTING_OPTIONS.map((o) => o.label),
    },
    {
      tag: "hospedagemCustomAplicacaoExistente",
      required: false,
      description:
        'Descrição livre de onde a automação roda. Use só quando hospedagemAplicacaoExistente for "Outro".',
    },
    {
      tag: "autorAplicacaoExistente",
      required: false,
      description:
        "Quem desenvolveu a automação que já existe: pessoa, equipe interna ou fornecedor. Não confunda com colaboradoresEnvolvidos, que é quem executa o processo.",
    },
    {
      tag: "responsavelAplicacaoExistente",
      required: false,
      description:
        "Quem cuida da automação hoje — quem é chamado quando ela para. Pode ser diferente de quem desenvolveu.",
    },
    {
      tag: "localAcessosAplicacaoExistente",
      required: false,
      description:
        'Onde ficam guardadas as credenciais que a automação usa. Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".',
      acceptedValues: CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS.map((o) => o.label),
    },
    {
      tag: "referenciaAcessosAplicacaoExistente",
      required: false,
      description: `Referência curta de onde encontrar o acesso — nome do cofre, caminho da pasta, com quem está. Máximo de ${CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH} caracteres; acima disso o texto é cortado e você recebe um aviso. Nunca escreva senhas, tokens ou chaves aqui.`,
    },
    {
      tag: "producaoDesdeAplicacaoExistente",
      required: false,
      description:
        "Data em que a automação entrou em produção, no formato AAAA-MM-DD. Fora desse formato, o valor é ignorado e você recebe um aviso.",
    },
    {
      tag: "ativoAplicacaoExistente",
      required: false,
      description:
        "Identificador técnico da máquina onde a automação roda hoje: hostname, IP ou número de patrimônio (ex.: SRV-RPA-01). Todos os campos abaixo são opcionais — preencha só o que você tiver certeza; deixar em branco é sempre melhor do que inventar um valor.",
    },
    {
      tag: "cargoResponsavelAplicacaoExistente",
      required: false,
      description: "Cargo de quem responde pela automação hoje (texto livre, ex.: Analista de TI Pleno).",
    },
    {
      tag: "setorResponsavelAplicacaoExistente",
      required: false,
      description:
        'Setor de quem responde pela automação. Precisa bater com uma área já cadastrada (mesma lista de "area", acima) para ser reconhecido — se não bater, a tag é ignorada na importação, sem bloquear o resto do arquivo e sem criar uma área nova.',
      acceptedValues: areas.map((a) => a.label),
    },
    {
      tag: "responsavelSubstitutoAplicacaoExistente",
      required: false,
      description: "Quem assume a automação se o responsável sair ou ficar indisponível (texto livre).",
    },
    {
      tag: "acoesContingencia",
      required: false,
      description:
        'O que fazer se a automação parar. Lista — cada item vai em uma tag <acao> dentro dela. Cada <acao> precisa corresponder exatamente a um dos valores aceitos; um item que não corresponder é descartado da lista, sem bloquear a importação. Contexto livre sobre o plano de contingência vai em "detalhesContingencia".',
      acceptedValues: CURRENT_APPLICATION_CONTINGENCY_OPTIONS.map((o) => o.label),
    },
    {
      tag: "detalhesContingencia",
      required: false,
      description: "Contexto livre sobre o que fazer se a automação parar — complementa acoesContingencia.",
    },
    {
      tag: "origemDadosEntrada",
      required: false,
      description:
        'De onde vêm os dados que a automação usa. Use exatamente um dos valores aceitos, sem texto adicional — detalhes vão em "Detalhes dos dados de entrada". Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".',
      acceptedValues: CURRENT_APPLICATION_DATA_ENDPOINT_OPTIONS.map((o) => o.label),
    },
    {
      tag: "detalhesDadosEntrada",
      required: false,
      description: "Detalhes livres sobre a origem dos dados de entrada.",
    },
    {
      tag: "destinoDadosSaida",
      required: false,
      description:
        'Para onde vão os dados que a automação produz. Mesmos valores aceitos de origemDadosEntrada, sem texto adicional — detalhes vão em "Detalhes dos dados de saída". Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".',
      acceptedValues: CURRENT_APPLICATION_DATA_ENDPOINT_OPTIONS.map((o) => o.label),
    },
    {
      tag: "detalhesDadosSaida",
      required: false,
      description: "Detalhes livres sobre o destino dos dados de saída.",
    },
    {
      tag: "dadosSigilosos",
      required: false,
      description:
        'Se a automação lida com dados sigilosos. Use exatamente um dos valores aceitos, sem texto adicional. Diferente da maioria dos campos restritos deste guia, não tem fallback "Outro": um valor que não corresponder é ignorado (fica em branco) e você recebe um aviso. Preencha categoriasDadosSigilosos e detalhesDadosSigilosos só se a resposta for Sim.',
      acceptedValues: SENSITIVE_DATA_ANSWER_OPTIONS.map((o) => o.label),
    },
    {
      tag: "categoriasDadosSigilosos",
      required: false,
      description:
        'Que tipo de dado sigiloso a automação lida. Preencha só se dadosSigilosos for Sim. Lista — cada item vai em uma tag <categoria> dentro dela. Cada <categoria> precisa corresponder exatamente a um dos valores aceitos; um item que não corresponder é descartado da lista, sem bloquear a importação, e o texto original é preservado em "detalhesDadosSigilosos".',
      acceptedValues: SENSITIVE_DATA_CATEGORY_OPTIONS.map((o) => o.label),
    },
    {
      tag: "detalhesDadosSigilosos",
      required: false,
      description: "Contexto livre sobre os dados sigilosos que a automação manipula.",
    },
    {
      tag: "sistemas",
      required: false,
      description:
        `Sistemas sobre os quais a automação atua (ex.: SAP, portal da Receita, CRM interno). Cada item vai em uma tag <sistema> dentro dela, com três sub-tags: <nome> (obrigatório — uma linha sem nome é descartada), <pontoAcesso> (endereço, servidor ou URL) e <comoAcessar>. <comoAcessar> é só o PONTEIRO de onde encontrar o acesso — nome do cofre, caminho da pasta, com quem está — e nunca deve conter a senha, token ou chave em si, mesmo que você tenha essa informação em mãos. Máximo de ${CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH} caracteres em <comoAcessar>; acima disso o texto é cortado e você recebe um aviso. Não invente um sistema que a automação não usa — deixe a lista vazia se não tiver certeza.`,
    },
    {
      tag: "contas",
      required: false,
      description:
        `Contas/usuários que a automação usa para acessar os sistemas listados acima. Cada item vai em uma tag <conta> dentro dela, com: <usuario> (obrigatório — uma linha sem usuário é descartada; é só o login, NUNCA a senha, token ou chave — máximo de ${AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH} caracteres), <tipo> (campo restrito, sem texto adicional — valores aceitos: ${AUTOMATION_ACCOUNT_TYPE_OPTIONS.map((o) => o.label).join(", ")}), <sistema> (precisa repetir, caractere por caractere, um <nome> já usado em <sistemas> acima; se não bater, a conta entra sem sistema vinculado, sem bloquear a importação), <responsavel> e <observacoes> (texto livre). Não invente uma conta que a automação não usa.`,
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
      acceptedValues: urgencyLevels.map((u) => u.label),
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
