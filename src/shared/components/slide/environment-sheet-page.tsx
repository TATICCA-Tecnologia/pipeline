"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import type { Project } from "@/shared/types";
import {
  buildEnvironmentSheet,
  densityTierFor,
  splitIntoColumns,
  type DensityTier,
  type EnvironmentSystem,
  type SheetAccount,
  type SheetLine,
} from "@/shared/lib/existing-automation";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { SlidePage } from "./slide-page";
import { projectToEnvironmentSource } from "./project-to-environment-source";

/**
 * Segunda página do slide executivo, só para automações que já rodam: o que
 * existe no ambiente hoje, para um TI focado em segurança. Ver
 * docs/superpowers/specs/2026-08-14-slide-ambiente-automacoes-existentes-design.md
 *
 * Devolve `null` quando a ficha não tem nenhum dado — automação existente cuja
 * ficha nunca foi preenchida continua com uma página só.
 */

/**
 * Piso de shrink desta página. Menor que o da página executiva porque as listas
 * de sistemas e contas não têm teto no banco: com o piso padrão de 0.5 o
 * overflow:hidden da página voltaria a cortar em silêncio numa automação com
 * dezenas de itens.
 */
const ENVIRONMENT_MIN_SLIDE_SCALE = 0.35;

/** Fonte e altura de linha por tier — descem juntas, nunca isoladas. */
const TIER_STYLE: Record<DensityTier, { text: string; row: string }> = {
  comfortable: { text: "text-[13px]", row: "py-1.5" },
  dense: { text: "text-[11px]", row: "py-1" },
  compact: { text: "text-[9.5px]", row: "py-0.5" },
};

function BlockLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 inline-block border-b-2 border-teal-500 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground">
      {children}
    </div>
  );
}

function LineList({ lines, tier }: { lines: SheetLine[]; tier: DensityTier }) {
  if (lines.length === 0) return null;
  return (
    <div className="space-y-1">
      {lines.map((line) => (
        <p key={line.label} className={`${TIER_STYLE[tier].text} leading-snug text-foreground/90`}>
          <span className="font-medium">{line.label}:</span> {line.value}
        </p>
      ))}
    </div>
  );
}

function SystemsTable({ systems, tier }: { systems: EnvironmentSystem[]; tier: DensityTier }) {
  const columns = splitIntoColumns(systems);
  return (
    <div className="flex gap-3">
      {columns.map((column, index) => (
        <table key={index} className={`flex-1 border-collapse ${TIER_STYLE[tier].text}`}>
          <tbody>
            {/*
              Chave por índice de propósito. Nem `username` nem nome de sistema
              têm unique no banco (duas linhas para o mesmo login em sistemas
              diferentes é o caso NORMAL), e no modo demonstração a máscara
              devolve a mesma string para todos — qualquer chave derivada do
              conteúdo colide com certeza ali. A lista é derivada, nunca
              reordenada e nunca sofre inserção no meio, que é exatamente
              quando índice é a chave correta.
            */}
            {column.map((system, rowIndex) => (
              <tr key={rowIndex} className="border-b border-slate-100">
                <td className={`${TIER_STYLE[tier].row} pr-2 align-top font-medium`}>
                  {system.name}
                  {system.category && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      · {system.category}
                    </span>
                  )}
                </td>
                <td className={`${TIER_STYLE[tier].row} align-top text-foreground/80`}>
                  {system.accessPoint}
                  {system.accessNotes && (
                    <span className="block text-muted-foreground">{system.accessNotes}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

function AccountsTable({ accounts, tier }: { accounts: SheetAccount[]; tier: DensityTier }) {
  const columns = splitIntoColumns(accounts);
  return (
    <div className="flex gap-3">
      {columns.map((column, index) => (
        <table key={index} className={`flex-1 border-collapse ${TIER_STYLE[tier].text}`}>
          <tbody>
            {/* Chave por índice — mesma razão de SystemsTable acima. */}
            {column.map((account, rowIndex) => (
              <tr key={rowIndex} className="border-b border-slate-100">
                <td className={`${TIER_STYLE[tier].row} pr-2 align-top font-medium`}>
                  {account.username}
                </td>
                <td className={`${TIER_STYLE[tier].row} align-top text-foreground/80`}>
                  {[account.typeLabel, account.system, account.owner].filter(Boolean).join(" · ")}
                  {account.notes && (
                    <span className="block text-muted-foreground">{account.notes}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

export function EnvironmentSheetPage({ project }: { project: Project }) {
  const { maskFreeText, maskCompanyName } = useDemoMode();
  const sheet = buildEnvironmentSheet(projectToEnvironmentSource(project, maskFreeText));
  if (!sheet) return null;

  const tier = densityTierFor(sheet.itemCount);
  // O predicado inline dá narrowing de verdade (inferred type predicates, TS 5.5+;
  // o repo está no 5.7.3) — `flowBoxes` é FlowBox[], não (FlowBox | undefined)[].
  const flowBoxes = [sheet.flow.input, sheet.flow.runtime, sheet.flow.output].filter(
    (box) => box !== undefined
  );
  const hasLeftColumn =
    sheet.people.length > 0 || sheet.peopleOfInterest.length > 0 || sheet.access.length > 0;
  const hasRightColumn =
    sheet.systems.length > 0 || sheet.accounts.length > 0 || sheet.sensitive.length > 0;

  return (
    <SlidePage resetKey={`${project.id}-ambiente`} minScale={ENVIRONMENT_MIN_SLIDE_SCALE}>
      <div className="relative flex flex-col p-10 pl-[100px]">
        <div className="mb-4 flex items-start justify-between">
          <div>
            {project.companyName && (
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {maskCompanyName(project.companyId, project.companyName)}
              </div>
            )}
            <h1 className="max-w-[85%] text-2xl font-extrabold leading-tight tracking-tight">
              {maskFreeText(project.title)}
            </h1>
            <p className="mt-1 text-sm font-semibold text-teal-600">
              Ficha de ambiente — o que existe hoje
            </p>
          </div>
          <Image
            src="/taticca-logo-horizontal.png"
            alt="TATICCA"
            width={163}
            height={64}
            className="h-12 w-auto flex-shrink-0 object-contain"
          />
        </div>

        {flowBoxes.length > 0 && (
          <div className="mb-5 flex items-stretch gap-2">
            {flowBoxes.map((box, index) => (
              <div key={box.title} className="flex flex-1 items-stretch gap-2">
                <div className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-teal-600">
                    {box.title}
                  </div>
                  {box.lines.map((line, lineIndex) => (
                    <p
                      key={line}
                      className={
                        lineIndex === 0
                          ? "text-[12px] font-semibold leading-snug text-foreground"
                          : "text-[11px] leading-snug text-muted-foreground"
                      }
                    >
                      {line}
                    </p>
                  ))}
                </div>
                {index < flowBoxes.length - 1 && (
                  <div className="flex items-center text-lg text-teal-500">→</div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-8">
          {/*
            Coluna inteira vazia não é desenhada. Sem esta guarda, uma ficha só
            com sistemas reservaria ~42% da largura em branco mais o gap —
            "bloco vazio deixando buraco", que é justamente o que a regra de
            omissão proíbe.
          */}
          {hasLeftColumn && (
            <div className="flex flex-1 flex-col gap-4">
              {(sheet.people.length > 0 || sheet.peopleOfInterest.length > 0) && (
                <div>
                  <BlockLabel>Pessoas</BlockLabel>
                  <LineList lines={sheet.people} tier={tier} />
                  {sheet.peopleOfInterest.length > 0 && (
                    <p className={`mt-1 ${TIER_STYLE[tier].text} leading-snug text-foreground/90`}>
                      <span className="font-medium">Pessoas de interesse:</span>{" "}
                      {sheet.peopleOfInterest
                        .map((p) => (p.role ? `${p.name} (${p.role})` : p.name))
                        .join(", ")}
                    </p>
                  )}
                </div>
              )}
              {sheet.access.length > 0 && (
                <div>
                  <BlockLabel>Acessos e contingência</BlockLabel>
                  <LineList lines={sheet.access} tier={tier} />
                </div>
              )}
            </div>
          )}

          {hasRightColumn && (
            <div className="flex flex-[1.4] flex-col gap-4">
              {sheet.systems.length > 0 && (
                <div>
                  <BlockLabel>Sistemas em que atua</BlockLabel>
                  <SystemsTable systems={sheet.systems} tier={tier} />
                </div>
              )}
              {sheet.accounts.length > 0 && (
                <div>
                  <BlockLabel>Contas utilizadas</BlockLabel>
                  <AccountsTable accounts={sheet.accounts} tier={tier} />
                </div>
              )}
              {sheet.sensitive.length > 0 && (
                <div>
                  <BlockLabel>Dados sigilosos</BlockLabel>
                  <LineList lines={sheet.sensitive} tier={tier} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </SlidePage>
  );
}
