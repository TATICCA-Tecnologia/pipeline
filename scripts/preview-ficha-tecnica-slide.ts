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
 * Serve para conferir o slide de ficha técnica (Passo 13) — os cinco blocos,
 * o corte de listas longas e o guard "sem slide quando vazio" — sem precisar
 * subir o app nem ter um banco populado. Rode: pnpm deck:preview-ficha
 *
 * Sem slide de capa de propósito (ao contrário de preview-executive-slides.ts):
 * o arquivo deve sair com exatamente 2 slides — um por caso preenchido — para
 * o guard "vazio não gera slide" (caso 3) ser conferível só pela contagem de
 * slides do arquivo, sem precisar abrir o PowerPoint.
 */

// Caso 1: tudo preenchido, incluindo 8 sistemas e 6 contas — testa o corte
// (FICHA_MAX_SYSTEMS_SHOWN=6 / FICHA_MAX_ACCOUNTS_SHOWN=5, ver
// build-existing-automations-deck.ts) e o aviso de "+N adicionais".
const filled: ExistingAutomationProject = {
  title: "Conciliação bancária — Financeiro",
  currentApplicationHosting: "servidor-proprio",
  currentApplicationHostingCustom: null,
  currentApplicationAuthor: "TATICCA",
  currentApplicationOwner: "Ana Souza",
  currentApplicationAccessLocation: "cofre-senhas",
  currentApplicationLiveSince: new Date(2024, 2, 15),
  currentApplicationAssetId: "SRV-RPA-01",
  currentApplicationOwnerRole: "Analista",
  ownerArea: { name: "Financeiro" },
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
    targetSystem:
      i % 3 === 0
        ? null
        : { name: `Sistema ${i}`, category: { name: i % 2 === 0 ? "ERP" : "Portal" } },
  })),
  automationAccounts: Array.from({ length: 6 }, (_, i) => ({
    username: `rpa_conta_${i}@empresa.com.br`,
    accountType: i % 2 === 0 ? "servico" : "email",
    projectTargetSystem: {
      customName: null,
      targetSystem: { name: `Sistema ${i}` },
    },
  })),
};

// Caso 2: metade dos campos — lista curta de sistemas, nenhuma conta, vários
// campos novos ausentes (devem sair como "Não informado" no slide).
const partial: ExistingAutomationProject = {
  title: "Emissão de boletos — Comercial",
  currentApplicationHosting: null,
  currentApplicationHostingCustom: null,
  currentApplicationAuthor: null,
  currentApplicationOwner: "Beatriz Nunes",
  currentApplicationAccessLocation: null,
  currentApplicationLiveSince: null,
  currentApplicationAssetId: null,
  currentApplicationOwnerRole: null,
  ownerArea: { name: "Comercial" },
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
  currentApplicationLiveSince: new Date(2023, 6, 1),
  currentApplicationAssetId: null,
  currentApplicationOwnerRole: null,
  ownerArea: null,
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

const pres = new PptxGenJS();
pres.layout = "LAYOUT_WIDE";
// Só define os masters (usados por addTitledSlide) — sem addCoverSlide, ver
// comentário acima sobre por que o arquivo deve sair com exatamente 2 slides.
defineDeckTheme(pres, "Empresa Exemplo", "Automações existentes");

let fichaSlideCount = 0;
for (const project of [filled, partial, empty]) {
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
