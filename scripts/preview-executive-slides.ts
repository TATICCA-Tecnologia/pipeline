import fs from "node:fs";
import PptxGenJS from "pptxgenjs";
import { defineDeckTheme, addCoverSlide } from "../src/server/deck/deck-theme";
import {
  addExecutiveNumbersSlide,
  addExecutiveScopeSlide,
  buildExecutiveSummaryData,
  type PaybackSummary,
} from "../src/server/deck/executive-summary-slides";

/**
 * Gera preview-executive-slides.pptx com dados fixos, sem tocar no banco.
 * Serve para conferir os slides executivos (inclusive os cenários sem dado)
 * sem precisar subir o app. Rode: npm run deck:preview
 */

const full = buildExecutiveSummaryData({
  ranking: Array.from({ length: 24 }, (_, i) => ({
    id: `p${i}`,
    estimatedAnnualSavingBRL: 51_666,
  })),
  areaCount: 6,
  projects: Array.from({ length: 24 }, (_, i) => ({ id: `p${i}`, currentAnnualHours: 408 })),
  interviews: [
    { status: "realizado", area: { name: "Financeiro" }, participants: [{ personId: "a" }] },
    { status: "realizado", area: { name: "Fiscal" }, participants: [{ personId: "b" }] },
    { status: "agendado", area: { name: "TI" }, participants: [{ personId: "c" }] },
  ],
});

const empty = buildExecutiveSummaryData({
  ranking: [],
  areaCount: 0,
  projects: [],
  interviews: [],
});

const paybackOk: PaybackSummary = {
  curve: Array.from({ length: 40 }, (_, i) => ({
    date: new Date(2026, 8, 1 + i * 7),
    cumulativeCost: 120_000 + i * 9_000,
    cumulativeSaving: i * 26_000,
  })),
  paybackMonths: 9,
  scheduledCount: 17,
};

const paybackNone: PaybackSummary = {
  curve: [],
  paybackMonths: null,
  scheduledCount: 0,
};

const pres = new PptxGenJS();
pres.layout = "LAYOUT_WIDE";
defineDeckTheme(pres, "Empresa Exemplo");
addCoverSlide(pres, "Empresa Exemplo");
addExecutiveScopeSlide(pres, full);
addExecutiveScopeSlide(pres, empty);
addExecutiveNumbersSlide(pres, full, paybackOk);
addExecutiveNumbersSlide(pres, full, paybackNone);

void pres.write({ outputType: "nodebuffer" }).then((buffer) => {
  fs.writeFileSync("preview-executive-slides.pptx", buffer as Buffer);
  console.log("Gerado: preview-executive-slides.pptx");
});
