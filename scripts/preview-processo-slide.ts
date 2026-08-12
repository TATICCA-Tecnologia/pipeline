import fs from "node:fs";
import PptxGenJS from "pptxgenjs";
import { defineDeckTheme } from "../src/server/deck/deck-theme";
import { addProjectSlide, type ProjectDeckRow } from "../src/server/deck/build-diagnostic-deck";

/**
 * Gera preview-processo-slide.pptx com dados fixos, sem tocar no banco.
 * Serve para conferir o slide de processo depois da Task 14 (sistemas
 * envolvidos + dados sigilosos na coluna esquerda) e da correção pós-revisão
 * (reordenação + guarda de estouro `fitsInColumn`) — em especial se algum
 * bloco desenha fora do slide, e o que a guarda pula quando não cabe tudo.
 * Rode: pnpm deck:preview-processo
 *
 * Quatro casos, cada um um slide:
 *   1. Pior caso "oficial" do plano da Task 14: description + architectNotes
 *      longos + os dois blocos novos preenchidos no máximo (8 sistemas,
 *      sigilo com todas as categorias) — SEM benefícios.
 *   2. Os dois blocos novos vazios — tem que sair idêntico ao slide de antes
 *      da Task 14 (sem os rótulos "Sistemas envolvidos"/"Dados sigilosos").
 *   3. Os CINCO blocos textuais preenchidos ao mesmo tempo (description,
 *      architectNotes, benefícios, sistemas, dados sigilosos) — o pedido
 *      explícito da correção pós-revisão. Mede quanto sobra/falta e o que a
 *      guarda decide pular.
 *   4. Description + architectNotes + benefícios, SEM nenhum campo novo da
 *      Task 14 — isola se a guarda `fitsInColumn` já pulava "Benefícios
 *      esperados" antes mesmo de qualquer campo novo entrar em cena (ver
 *      relatório: essa é a checagem que importa para saber se o efeito da
 *      guarda é raro ou comum).
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

// Uma só (não as 6) de propósito: "melhor caso realista" de benefícios — o
// caso 4 testa se mesmo um projeto modesto (1 benefício curto) já perde o
// bloco quando description+architectNotes também estão presentes, que é a
// pergunta que decide se o efeito da guarda é raro ou comum.
const ONE_BENEFIT = ["reducao-trabalho-operacional"];
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

// Caso 1: pior caso "oficial" do plano — description + architectNotes
// longos, os dois blocos novos preenchidos no máximo (8 sistemas, sigilo com
// todas as categorias), SEM benefícios.
const worstCaseOfficial: ProjectDeckRow = {
  ...BASE,
  benefits: [],
  targetSystems: EIGHT_TARGET_SYSTEMS,
  handlesSensitiveData: "sim",
  sensitiveDataCategories: ALL_SENSITIVE_CATEGORIES,
  sensitiveDataDetails: "Dados bancários de fornecedores e valores de pagamento.",
};

// Caso 2: os dois blocos novos vazios — tem que sair idêntico ao slide de
// antes da Task 14 (sem "Sistemas envolvidos" nem "Dados sigilosos").
const emptyNewFields: ProjectDeckRow = {
  ...BASE,
  title: "Emissão de boletos — Comercial (sem campos novos)",
  benefits: [],
  targetSystems: [],
  handlesSensitiveData: null,
  sensitiveDataCategories: null,
  sensitiveDataDetails: null,
};

// Caso 3: os cinco blocos textuais preenchidos ao mesmo tempo — o cenário
// pedido explicitamente na correção pós-revisão.
const fiveBlocksFilled: ProjectDeckRow = {
  ...BASE,
  title: "Conciliação de notas fiscais (5 blocos) — Financeiro",
  benefits: ALL_BENEFITS,
  targetSystems: EIGHT_TARGET_SYSTEMS,
  handlesSensitiveData: "sim",
  sensitiveDataCategories: ALL_SENSITIVE_CATEGORIES,
  sensitiveDataDetails: "Dados bancários de fornecedores e valores de pagamento.",
};

// Caso 4: description + architectNotes + benefícios (só 1, texto curto),
// SEM nenhum campo novo da Task 14 — isola se a guarda já afeta o trio de
// campos antigos por conta própria.
const oldTrioOnly: ProjectDeckRow = {
  ...BASE,
  title: "Cadastro de fornecedores (sem campos novos) — Suprimentos",
  benefits: ONE_BENEFIT,
  targetSystems: [],
  handlesSensitiveData: null,
  sensitiveDataCategories: null,
  sensitiveDataDetails: null,
};

const pres = new PptxGenJS();
pres.layout = "LAYOUT_WIDE";
// Só define os masters (usados por addTitledSlide) — sem addCoverSlide, mesmo
// motivo de preview-ficha-tecnica-slide.ts: o arquivo deve sair com
// exatamente 4 slides, um por caso, sem nada mais para atrapalhar a conferência.
defineDeckTheme(pres, "Empresa Exemplo", "Diagnóstico de robotização");

for (const project of [worstCaseOfficial, emptyNewFields, fiveBlocksFilled, oldTrioOnly]) {
  addProjectSlide(pres, project);
}

void pres.write({ outputType: "nodebuffer" }).then((buffer) => {
  fs.writeFileSync("preview-processo-slide.pptx", buffer as Buffer);
  console.log(
    "Gerado: preview-processo-slide.pptx (4 slides: pior caso oficial, campos novos vazios, cinco blocos preenchidos, trio antigo sem campos novos)"
  );
});
