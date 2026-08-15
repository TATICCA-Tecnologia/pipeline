import fs from "node:fs";
import PptxGenJS from "pptxgenjs";
import { defineDeckTheme } from "../src/server/deck/deck-theme";
import {
  addFichaTecnicaSlide,
  hasFichaTecnicaData,
  type ExistingAutomationProject,
} from "../src/server/deck/build-existing-automations-deck";

/**
 * Gera preview-ficha-tecnica-slide.pptx com dados fixos, sem tocar no banco.
 * Serve para conferir o slide de ficha de ambiente — os blocos, a omissão dos
 * vazios e o reflow de listas longas em sub-colunas — sem precisar subir o app
 * nem ter um banco populado. Rode: pnpm deck:preview-ficha
 *
 * Sem slide de capa de propósito (ao contrário de preview-executive-slides.ts):
 * o arquivo deve sair com exatamente 3 slides — `filled`, `partial` e `heavy` —
 * para o guard "vazio não gera slide" (caso 3, `empty`) ser conferível só pela
 * contagem de slides do arquivo, sem precisar abrir o PowerPoint.
 */

// Caso 1: tudo preenchido, incluindo 8 sistemas e 6 contas. Os 8 sistemas
// passam do COLUMN_SPLIT_THRESHOLD (6) e devem quebrar em duas sub-colunas em
// vez de perder linha; as 6 contas ficam numa coluna só, no limite da regra.
// 16 itens no total = tier "dense" (fonte 8pt).
const filled: ExistingAutomationProject = {
  title: "Conciliação bancária — Financeiro",
  currentApplicationHosting: "servidor-proprio",
  currentApplicationHostingCustom: null,
  currentApplicationAuthor: "TATICCA",
  currentApplicationOwner: "Ana Souza",
  currentApplicationAccessLocation: "cofre-senhas",
  currentApplicationAccessReference: "KeePass \\ TI \\ RPA \\ Financeiro",
  currentApplicationLiveSince: new Date(2024, 2, 15),
  currentApplicationAssetId: "SRV-RPA-01",
  currentApplicationOwnerRole: "Analista",
  robotSchedule: "Diário, às 6h",
  ownerArea: { name: "Financeiro" },
  peopleOfInterest: [
    { person: { name: "Carla Menezes", role: "Gerente Financeiro" } },
    { person: { name: "Diego Farias", role: "Auditoria Interna" } },
  ],
  currentApplicationDataInput: "sistema",
  currentApplicationDataInputDetails: "Extrato SAP FBL3N, gerado diariamente às 6h",
  currentApplicationDataOutput: "planilha",
  currentApplicationDataOutputDetails: "\\\\fs01\\financeiro\\conciliacao.xlsx",
  currentApplicationContingencyActions: ["reexecutar", "acionar-ti-interno"],
  currentApplicationContingencyDetails: "Reiniciar o serviço no SRV-RPA-01 e acionar a TI.",
  currentApplicationBackupOwner: "Carlos Lima",
  handlesSensitiveData: "sim",
  sensitiveDataCategories: ["bancarios-financeiros", "fiscais-contabeis"],
  sensitiveDataDetails: "Dados de contas bancárias da empresa.",
  targetSystems: Array.from({ length: 8 }, (_, i) => ({
    customName: i % 3 === 0 ? `Sistema legado ${i}` : null,
    accessPoint: `https://sistema-${i}.exemplo.com.br/acesso`,
    accessNotes: i % 2 === 0 ? "Abrir chamado para o time de infraestrutura" : null,
    targetSystem:
      i % 3 === 0
        ? null
        : { name: `Sistema ${i}`, category: { name: i % 2 === 0 ? "ERP" : "Portal" } },
  })),
  automationAccounts: Array.from({ length: 6 }, (_, i) => ({
    username: `rpa_conta_${i}@empresa.com.br`,
    accountType: i % 2 === 0 ? "servico" : "email",
    ownerName: i % 2 === 0 ? "TI" : "Financeiro",
    notes: null,
    projectTargetSystem: {
      customName: null,
      targetSystem: { name: `Sistema ${i}` },
    },
  })),
};

// Caso 2: metade dos campos — lista curta de sistemas, nenhuma conta, nenhuma
// pessoa de interesse, sem saída de dados. Os blocos correspondentes NÃO devem
// ser desenhados (nem "Não informado", nem traço, nem buraco): os seguintes
// sobem no lugar deles.
const partial: ExistingAutomationProject = {
  title: "Emissão de boletos — Comercial",
  currentApplicationHosting: null,
  currentApplicationHostingCustom: null,
  currentApplicationAuthor: null,
  currentApplicationOwner: "Beatriz Nunes",
  currentApplicationAccessLocation: null,
  currentApplicationAccessReference: null,
  currentApplicationLiveSince: null,
  currentApplicationAssetId: null,
  currentApplicationOwnerRole: null,
  robotSchedule: null,
  ownerArea: { name: "Comercial" },
  peopleOfInterest: [],
  currentApplicationDataInput: "planilha",
  currentApplicationDataInputDetails: null,
  currentApplicationDataOutput: null,
  currentApplicationDataOutputDetails: null,
  currentApplicationContingencyActions: [],
  currentApplicationContingencyDetails: null,
  currentApplicationBackupOwner: null,
  handlesSensitiveData: "nao-sei",
  sensitiveDataCategories: [],
  sensitiveDataDetails: null,
  targetSystems: [
    {
      customName: null,
      accessPoint: "srv-boletos.interno",
      accessNotes: null,
      targetSystem: { name: "Sistema de boletos", category: { name: "Financeiro" } },
    },
  ],
  automationAccounts: [],
};

// Caso 3: nada preenchido nos campos NOVOS da ficha técnica (só tem os campos
// antigos de sustentação, que já aparecem no slide de processo) — não deve
// gerar slide. `hasFichaTecnicaData` é a MESMA função usada pelo deck real
// dentro do loop de `buildExistingAutomationsDeck`, então este script testa a
// regra de verdade, não uma cópia dela.
const empty: ExistingAutomationProject = {
  title: "Cadastro de fornecedores — Suprimentos",
  currentApplicationHosting: "nuvem",
  currentApplicationHostingCustom: null,
  currentApplicationAuthor: "Fornecedor externo",
  currentApplicationOwner: "Diego Farias",
  currentApplicationAccessLocation: "com-pessoa",
  currentApplicationAccessReference: null,
  currentApplicationLiveSince: new Date(2023, 6, 1),
  currentApplicationAssetId: null,
  currentApplicationOwnerRole: null,
  robotSchedule: null,
  ownerArea: null,
  peopleOfInterest: [],
  currentApplicationDataInput: null,
  currentApplicationDataInputDetails: null,
  currentApplicationDataOutput: null,
  currentApplicationDataOutputDetails: null,
  currentApplicationContingencyActions: null,
  currentApplicationContingencyDetails: null,
  currentApplicationBackupOwner: null,
  handlesSensitiveData: null,
  sensitiveDataCategories: null,
  sensitiveDataDetails: null,
  targetSystems: [],
  automationAccounts: [],
};

// Caso 4: volume grande (20 sistemas + 12 contas = tier "compact") — confirma
// que a lista quebra em colunas, a fonte desce para 7pt e NADA é descartado.
// É o caso que a versão anterior resolvia cortando linhas e escrevendo
// "+N adicionais".
const heavy: ExistingAutomationProject = {
  ...filled,
  title: "Integração fiscal multi-sistema — Contabilidade",
  targetSystems: Array.from({ length: 20 }, (_, i) => ({
    customName: null,
    accessPoint: `https://sistema-${i}.exemplo.com.br`,
    accessNotes: null,
    targetSystem: { name: `Sistema ${i}`, category: { name: "ERP" } },
  })),
  automationAccounts: Array.from({ length: 12 }, (_, i) => ({
    username: `rpa_${i}@empresa.com.br`,
    accountType: "servico",
    ownerName: "TI",
    notes: null,
    projectTargetSystem: { customName: null, targetSystem: { name: `Sistema ${i}` } },
  })),
};

const pres = new PptxGenJS();
pres.layout = "LAYOUT_WIDE";
// Só define os masters (usados por addTitledSlide) — sem addCoverSlide, ver
// comentário acima sobre por que o arquivo deve sair com exatamente 3 slides.
defineDeckTheme(pres, "Empresa Exemplo", "Automações existentes");

let fichaSlideCount = 0;
for (const project of [filled, partial, empty, heavy]) {
  // Mesmo guard usado dentro de buildExistingAutomationsDeck — o caso `empty`
  // deve ser pulado aqui exatamente como seria no deck real.
  if (hasFichaTecnicaData(project)) {
    addFichaTecnicaSlide(pres, project);
    fichaSlideCount += 1;
  }
}

void pres.write({ outputType: "nodebuffer" }).then((buffer) => {
  fs.writeFileSync("preview-ficha-tecnica-slide.pptx", buffer as Buffer);
  console.log(`Gerado: preview-ficha-tecnica-slide.pptx (${fichaSlideCount} slides de ficha técnica)`);
});
