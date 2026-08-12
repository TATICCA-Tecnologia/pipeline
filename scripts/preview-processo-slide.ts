import fs from "node:fs";
import PptxGenJS from "pptxgenjs";
import { defineDeckTheme } from "../src/server/deck/deck-theme";
import { addProjectSlide, type ProjectDeckRow } from "../src/server/deck/build-diagnostic-deck";

/**
 * Gera preview-processo-slide.pptx com dados fixos, sem tocar no banco.
 * Serve para conferir o slide de processo depois da Task 14 (sistemas
 * envolvidos + dados sigilosos na coluna esquerda) — em especial se a coluna
 * esquerda vaza para fora do slide no pior caso de altura. Rode:
 * pnpm deck:preview-processo
 *
 * Três casos, cada um um slide:
 *   1. Pior caso "oficial" da Task 14: description + architectNotes longos +
 *      os dois blocos novos preenchidos (8 sistemas, dados sigilosos com
 *      todas as categorias) — SEM benefícios, no escopo exato pedido no plano.
 *   2. Os dois blocos novos vazios — tem que sair idêntico ao slide de hoje
 *      (sem os rótulos "Sistemas envolvidos"/"Dados sigilosos").
 *   3. Pior caso ABSOLUTO: caso 1 + benefícios (todas as 6 opções) também
 *      preenchido — os cinco blocos textuais da coluna esquerda ao mesmo
 *      tempo. Não pedido explicitamente pelo plano, mas gerado para medir se
 *      essa combinação (rara, porém possível via formulário) ainda cabe no
 *      slide — ver relatório da Task 14.
 */

const LONG_DESCRIPTION =
  "O time financeiro recebe diariamente dezenas de notas fiscais de fornecedores por e-mail, em formatos variados (PDF nativo, PDF escaneado, XML), e precisa extrair manualmente os dados de cada uma (CNPJ do emissor, valor, data de vencimento, itens da nota) para lançar no ERP e conciliar com o pedido de compra correspondente. O processo é sujeito a erros de digitação, atrasos no lançamento e retrabalho quando a nota não bate com o pedido, exigindo contato manual com o fornecedor ou com o setor de compras para resolver a divergência antes de liberar o pagamento.";

const LONG_ARCHITECT_NOTES =
  "Leitura automática do e-mail de notas fiscais, extração de dados via OCR/parser de XML, validação contra o pedido de compra no ERP, lançamento automático quando dentro da tolerância configurada e abertura de chamado para o time financeiro apenas nas divergências que exigem decisão humana.";

const EIGHT_TARGET_SYSTEMS: ProjectDeckRow["targetSystems"] = Array.from(
  { length: 8 },
  (_, i) => ({
    customName: i % 3 === 0 ? `Sistema legado ${i}` : null,
    targetSystem:
      i % 3 === 0
        ? null
        : { name: `Sistema ${i}`, category: { name: i % 2 === 0 ? "ERP" : "Portal" } },
  })
);

const ALL_SENSITIVE_CATEGORIES = [
  "pessoais-clientes",
  "pessoais-colaboradores",
  "folha-remuneracao",
  "bancarios-financeiros",
  "saude",
  "fiscais-contabeis",
  "contratos-juridico",
  "propriedade-intelectual",
  "credenciais-acessos",
];

const ALL_BENEFITS = [
  "reducao-trabalho-operacional",
  "melhor-relacionamento-cliente",
  "melhor-relacionamento-fornecedor-parceiro",
  "reducao-multas-infracoes",
  "melhoria-qualidade-trabalho",
  "outro",
];

const BASE: Omit<ProjectDeckRow, "targetSystems" | "handlesSensitiveData" | "sensitiveDataCategories" | "sensitiveDataDetails" | "benefits"> = {
  id: "preview-processo",
  title: "Conciliação de notas fiscais de fornecedores — Financeiro",
  description: LONG_DESCRIPTION,
  architectNotes: LONG_ARCHITECT_NOTES,
  processFrequency: "diario",
  robotSchedule: "06:00",
  peopleInvolved: 3,
  taskDurationHours: 2,
  currentAnnualHours: 500,
  monthlyHoursSaved: 40,
  ratingErrorReduction: 5,
  ratingProcessCriticality: 4,
  ratingInternalImpact: 4,
  ratingExternalImpact: 3,
  ratingCompliance: 5,
  area: { name: "Financeiro" },
};

// Caso 1: pior caso oficial do plano — description + architectNotes longos,
// os dois blocos novos preenchidos no máximo (8 sistemas, sigilo com todas as
// categorias), SEM benefícios.
const worstCaseOfficial: ProjectDeckRow = {
  ...BASE,
  benefits: [],
  targetSystems: EIGHT_TARGET_SYSTEMS,
  handlesSensitiveData: "sim",
  sensitiveDataCategories: ALL_SENSITIVE_CATEGORIES,
  sensitiveDataDetails: "Dados bancários de fornecedores e valores de pagamento.",
};

// Caso 2: os dois blocos novos vazios — tem que sair idêntico ao slide de
// hoje (sem "Sistemas envolvidos" nem "Dados sigilosos").
const emptyNewFields: ProjectDeckRow = {
  ...BASE,
  title: "Emissão de boletos — Comercial (sem campos novos)",
  benefits: [],
  targetSystems: [],
  handlesSensitiveData: null,
  sensitiveDataCategories: null,
  sensitiveDataDetails: null,
};

// Caso 3: pior caso ABSOLUTO — caso 1 + benefícios (todas as opções) também
// preenchido, para medir a combinação dos cinco blocos textuais ao mesmo
// tempo (não exigido pelo plano, gerado só para instrumentar o relatório).
const worstCaseWithBenefits: ProjectDeckRow = {
  ...BASE,
  title: "Conciliação de notas fiscais (+ benefícios) — Financeiro",
  benefits: ALL_BENEFITS,
  targetSystems: EIGHT_TARGET_SYSTEMS,
  handlesSensitiveData: "sim",
  sensitiveDataCategories: ALL_SENSITIVE_CATEGORIES,
  sensitiveDataDetails: "Dados bancários de fornecedores e valores de pagamento.",
};

const pres = new PptxGenJS();
pres.layout = "LAYOUT_WIDE";
// Só define os masters (usados por addTitledSlide) — sem addCoverSlide, mesmo
// motivo de preview-ficha-tecnica-slide.ts: o arquivo deve sair com
// exatamente 3 slides, um por caso, sem nada mais para atrapalhar a conferência.
defineDeckTheme(pres, "Empresa Exemplo", "Diagnóstico de robotização");

for (const project of [worstCaseOfficial, emptyNewFields, worstCaseWithBenefits]) {
  addProjectSlide(pres, project);
}

void pres.write({ outputType: "nodebuffer" }).then((buffer) => {
  fs.writeFileSync("preview-processo-slide.pptx", buffer as Buffer);
  console.log("Gerado: preview-processo-slide.pptx (3 slides: pior caso oficial, campos novos vazios, pior caso absoluto)");
});
