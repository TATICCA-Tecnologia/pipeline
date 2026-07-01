export const DEFAULT_PLATFORM_VALUE = "desktop";

export const PROJECT_AREAS = [
  { value: "contabilidade", label: "Contabilidade" },
  { value: "rpa", label: "RPA" },
  { value: "desenvolvimento", label: "Desenvolvimento" },
  { value: "consultoria", label: "Consultoria técnica" },
  { value: "outro", label: "Outro" },
] as const;

export const PROJECT_THEMES_BY_AREA: Record<
  string,
  { value: string; label: string }[]
> = {
  contabilidade: [
    { value: "contabil-fiscal", label: "Gestão fiscal" },
    { value: "contabil-folha", label: "Folha de pagamento" },
    { value: "contabil-balanco", label: "Balanço e DRE" },
    { value: "contabil-obrigacoes", label: "Obrigações acessórias" },
    { value: "contabil-consultoria", label: "Consultoria contábil" },
  ],
  rpa: [
    { value: "rpa-automacao", label: "Automação de processos" },
    { value: "rpa-integracao", label: "Integração de sistemas" },
    { value: "rpa-extracao", label: "Extração de dados" },
    { value: "rpa-relatorios", label: "Geração de relatórios" },
    { value: "rpa-validacao", label: "Validação e conferência" },
  ],
  desenvolvimento: [
    { value: "dev-sistema-web", label: "Sistema web / SaaS" },
    { value: "dev-app-mobile", label: "Aplicativo mobile" },
    { value: "dev-api", label: "API / backend" },
    { value: "dev-website", label: "Website / landing page" },
    { value: "dev-portal", label: "Portal / intranet" },
    { value: "dev-manutencao", label: "Manutenção / melhorias" },
    { value: "dev-integracao", label: "Integração de sistemas" },
  ],
  consultoria: [{ value: "consultoria-tecnica", label: "Consultoria técnica" }],
  outro: [{ value: "outro", label: "Outro / a definir" }],
};

export function buildClienteProjectTypeLabel(
  areaValue: string,
  themeValue: string
): string {
  const area = PROJECT_AREAS.find((a) => a.value === areaValue);
  const themes = PROJECT_THEMES_BY_AREA[areaValue] ?? [];
  const theme = themes.find((t) => t.value === themeValue);
  if (!area?.label) return theme?.label ?? "Outro";
  if (!theme?.label) return area.label;
  return `${area.label} - ${theme.label}`;
}

export const PLATFORMS = [
  { value: "desktop", label: "Desktop (Windows / macOS)" },
  { value: "web", label: "Web (desktop e celular)" },
  { value: "ios", label: "iOS (iPhone / iPad)" },
  { value: "android", label: "Android" },
  { value: "ambos-mobile", label: "iOS e Android" },
  { value: "todas", label: "Todas as plataformas" },
];

export const URGENCY_LEVELS = [
  { value: "baixa", label: "Baixa — sem pressa definida" },
  { value: "media", label: "Média — próximos 2 a 3 meses" },
  { value: "alta", label: "Alta — próximo mês" },
  { value: "urgente", label: "Urgente — o mais rápido possível" },
];

export const PROCESS_FREQUENCIES = [
  { value: "diario", label: "Diário" },
  { value: "duas-vezes-semana", label: "Duas vezes por semana" },
  { value: "tres-vezes-semana", label: "Três vezes por semana" },
  { value: "semanal", label: "Semanal" },
  { value: "mensal", label: "Mensal" },
  { value: "anual", label: "Anual" },
];

// Ocorrências por ano para cada periodicidade — usado para calcular
// currentAnnualHours = taskDurationHours * PROCESS_FREQUENCY_MULTIPLIERS[processFrequency]
export const PROCESS_FREQUENCY_MULTIPLIERS: Record<string, number> = {
  diario: 260,
  "duas-vezes-semana": 104,
  "tres-vezes-semana": 156,
  semanal: 52,
  mensal: 12,
  anual: 1,
};

export const COMPLEXITY_LEVELS = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
];

export const TARGET_AUDIENCES = [
  { value: "b2b", label: "Empresas (B2B)" },
  { value: "b2c", label: "Consumidores finais (B2C)" },
  { value: "cliente", label: "Clientes" },
  { value: "fornecedor", label: "Fornecedores" },
  { value: "funcionario", label: "Funcionários" },
  { value: "financeira", label: "Instituições financeiras" },
  { value: "transportadora", label: "Transportadoras" },
  { value: "governo", label: "Órgãos públicos" },
  { value: "interno", label: "Uso interno da empresa" },
  { value: "ambos", label: "Empresas e consumidores" },
  { value: "outro", label: "Outros" },
];

export const HAS_EXISTING_SYSTEM_OPTIONS = [
  { value: "nao", label: "Não, projeto do zero" },
  { value: "sim-substituir", label: "Sim, quero substituir" },
  { value: "sim-integrar", label: "Sim, quero integrar/migrar dados" },
  { value: "sim-melhorar", label: "Sim, quero melhorar o existente" },
];

export const BENEFIT_OPTIONS = [
  {
    key: "reducao-trabalho-operacional",
    label: "Redução de trabalho operacional (tarefas manuais, planilhas, retrabalho)",
  },
  {
    key: "melhor-relacionamento-cliente",
    label: "Melhor relacionamento com o cliente (experiência, atendimento, rapidez)",
  },
  {
    key: "melhor-relacionamento-fornecedor-parceiro",
    label: "Melhor relacionamento com fornecedores ou parceiros",
  },
  {
    key: "reducao-multas-infracoes",
    label: "Redução de multas, riscos ou infrações (fiscais, regulatórias, contratuais)",
  },
  {
    key: "melhoria-qualidade-trabalho",
    label: "Melhoria da qualidade do trabalho (padronização, menos erros, mais visibilidade)",
  },
  { key: "outro", label: "Outro" },
];

export const FEATURE_SUGGESTION_GROUPS: { category: string; items: string[] }[] =
  [
    {
      category: "Contabilidade e fiscal",
      items: [
        "Emissão de notas fiscais",
        "Cálculo automático de impostos",
        "Conciliação bancária",
        "Contas a pagar e a receber",
        "Geração de guias (DARF, GPS, DAS)",
        "Balancete e DRE automatizados",
      ],
    },
    {
      category: "RPA e automação",
      items: [
        "Leitura de XMLs e NF-e",
        "Preenchimento automático em sistemas",
        "Extração de dados de PDFs",
        "Envio automático de e-mails",
        "Validação de cadastros",
        "Integração com ERP",
      ],
    },
    {
      category: "Desenvolvimento de software",
      items: [
        "Login e cadastro de usuários",
        "Dashboard / painel administrativo",
        "Relatórios e gráficos",
        "Notificações (e-mail / push)",
        "Upload de arquivos",
        "Integração com APIs externas",
        "Exportação de dados (PDF / Excel)",
        "Controle de permissões e usuários",
      ],
    },
  ];

export const LANDING_PROJECT_AREAS = [
  { value: "web-presenca", label: "Web e presença digital" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "mobile", label: "Aplicativos móveis" },
  { value: "sistemas", label: "Sistemas, APIs e integrações" },
  { value: "outro", label: "Outro" },
] as const;

export const LANDING_THEMES_BY_AREA: Record<
  string,
  { value: string; label: string }[]
> = {
  "web-presenca": [
    { value: "website-institucional", label: "Website institucional" },
    { value: "landing-page", label: "Landing page" },
    { value: "blog-portal", label: "Blog ou portal de conteúdo" },
  ],
  ecommerce: [
    { value: "loja-virtual", label: "Loja virtual" },
    { value: "marketplace", label: "Marketplace" },
    { value: "checkout-assinatura", label: "Checkout ou assinaturas" },
  ],
  mobile: [
    { value: "app-ios-android", label: "App iOS e Android" },
    { value: "app-ios", label: "App apenas iOS" },
    { value: "app-android", label: "App apenas Android" },
  ],
  sistemas: [
    { value: "sistema-web", label: "Sistema web / SaaS" },
    { value: "api-backend", label: "API / backend" },
    { value: "dashboard", label: "Dashboard interno" },
    { value: "integracao", label: "Integração entre sistemas" },
  ],
  outro: [{ value: "outro", label: "Outro / a definir" }],
};

export function buildLandingProjectTypeLabel(
  areaValue: string,
  themeValue: string
): string {
  const area = LANDING_PROJECT_AREAS.find((a) => a.value === areaValue);
  const themes = LANDING_THEMES_BY_AREA[areaValue] ?? [];
  const theme = themes.find((t) => t.value === themeValue);
  if (!area?.label) return theme?.label ?? "Outro";
  if (!theme?.label) return area.label;
  return `${area.label} - ${theme.label}`;
}
