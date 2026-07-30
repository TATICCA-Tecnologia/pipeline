import fs from "node:fs";
import path from "node:path";
import PptxGenJS from "pptxgenjs";
import { formatDate } from "@/shared/utils";

/**
 * Tema, masters e primitivas de layout compartilhados pelos decks .pptx.
 *
 * Extraído de `build-diagnostic-deck.ts`: o deck de automações existentes e os
 * slides executivos precisam das mesmas cores, da mesma escala tipográfica e do
 * mesmo `addTitledSlide`, e um módulo de slides importando de outro módulo de
 * slides criava dependência circular. Aqui não há nenhuma regra de negócio nem
 * nenhum dado — só a identidade visual do material.
 */

// Paleta reutilizada pelos slides (hex sem "#", como o pptxgenjs espera).
// Navy + azul de acento: contraste alto sobre branco em qualquer projetor, e
// nenhuma cor decorativa competindo com os dados.
export const COLOR_PRIMARY = "0F172A"; // navy — títulos e texto principal
export const COLOR_ACCENT = "0369A1"; // azul — números-chave, régua de título, capa
export const COLOR_MUTED = "64748B"; // cinza — legendas, notas de rodapé
export const COLOR_HEADER_BG = "0F172A";
export const COLOR_HEADER_TEXT = "FFFFFF";
export const COLOR_TABLE_BORDER = "E2E8F0";
export const COLOR_ZEBRA = "F8FAFC"; // fundo das linhas pares da tabela
export const COLOR_SURFACE = "FFFFFF";
export const COLOR_SECONDARY = "334155"; // slate-700 — subtítulos e texto de apoio
export const COLOR_MUTED_SURFACE = "E8ECF1"; // fundo de linhas de total/destaque
// Pares para uso sobre o navy da capa: o acento e o cinza normais não têm
// contraste suficiente contra fundo escuro.
export const COLOR_ACCENT_ON_DARK = "7DD3FC"; // azul claro
export const COLOR_ON_DARK_MUTED = "94A3B8"; // cinza claro

/**
 * Tipografia do deck.
 *
 * Escolha deliberada de uma fonte que EXISTE na máquina de quem abre o arquivo:
 * um .pptx não embarca fontes, então uma Google Font (Lexend, Inter...) seria
 * substituída por qualquer coisa no PowerPoint do cliente e quebraria todo o
 * alinhamento. Segoe UI acompanha o Windows desde o 7 e o Office; Calibri é o
 * fallback declarado por vir junto com o Office também no macOS. Trocar o deck
 * inteiro de fonte = mudar estas duas constantes.
 */
export const FONT_HEADING = "Segoe UI";
export const FONT_BODY = "Segoe UI";

/**
 * Escala tipográfica (pt). Passos deliberadamente distantes entre si — a versão
 * antiga usava 22/16/14/11/10 e a diferença entre um título de seção e um
 * rótulo de tabela quase não se lia, que é o que fazia o deck parecer um dump
 * de dados em vez de um material de consultoria.
 */
export const TYPE = {
  coverTitle: 40,
  coverSubtitle: 20,
  sectionTitle: 30,
  slideTitle: 24,
  /** Título de slide que pode ocupar duas linhas (nome de processo). */
  slideTitleTall: 20,
  slideSubtitle: 13,
  metricValue: 28,
  bodyLarge: 13,
  body: 11,
  caption: 10,
  eyebrow: 10,
} as const;

/** Nome do master usado pelos slides de conteúdo (título + logo + rodapé). */
export const MASTER_CONTENT = "CONTENT";
/** Master sem chrome, para divisórias de seção. */
export const MASTER_FULL_BLEED = "FULL_BLEED";
/** Master da capa: fundo navy sólido com faixa branca no topo, sem rodapé. */
export const MASTER_COVER = "COVER";
/** Altura da faixa branca da capa, onde o logo é assentado. */
export const COVER_BAND_H = 2.35;

/** Margem esquerda/direita única do deck — tudo se alinha nela. */
export const MARGIN_X = 0.6;
/** Largura útil = 13.33 (LAYOUT_WIDE) - 2 margens. */
export const CONTENT_W = 13.33 - MARGIN_X * 2;

// Logo carregado uma única vez no module scope (não recarregado por slide).
// Se o arquivo não existir por algum motivo em produção, a capa é gerada sem
// logo — nunca falha o export inteiro por causa de um asset estático.
export const LOGO_ASPECT_RATIO = 2500 / 981; // largura/altura original do PNG
export const LOGO_DATA_URI: string | null = (() => {
  try {
    const buf = fs.readFileSync(
      path.join(process.cwd(), "public", "taticca-logo-horizontal.png")
    );
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
})();

export const TABLE_HEADER_OPTS = {
  bold: true,
  color: COLOR_HEADER_TEXT,
  fill: { color: COLOR_HEADER_BG },
  // Caixa alta espaçada no cabeçalho: distingue rótulo de dado sem precisar de
  // borda, e é o que faz a tabela ler como relatório em vez de planilha.
  fontSize: TYPE.caption,
  charSpacing: 0.8,
} as const;

export type Slide = ReturnType<PptxGenJS["addSlide"]>;
export type TableRow = Parameters<Slide["addTable"]>[0][number];

/**
 * Define a fonte-tema e os dois slide masters do deck.
 *
 * Por que masters em vez de desenhar o chrome slide a slide: o logo, a régua de
 * rodapé e o número de página passam a existir em TODOS os slides de conteúdo
 * automaticamente, inclusive nas páginas que o `autoPage` das tabelas cria
 * sozinho (que antes nasciam sem nenhuma identidade visual). Era essa a causa
 * de "o logo da TATICCA não aparece": ele só era desenhado na capa, e a partir
 * do segundo slide o material perdia qualquer marca.
 *
 * `pres.theme` define a fonte padrão do arquivo, então os ~40 `addText`
 * espalhados pelos slides herdam a tipografia sem precisar repetir `fontFace`
 * em cada chamada.
 */
export function defineDeckTheme(
  pres: PptxGenJS,
  companyName: string,
  deckLabel = "Diagnóstico de robotização"
): void {
  pres.theme = { headFontFace: FONT_HEADING, bodyFontFace: FONT_BODY };

  const logoW = 1.5;
  const logoH = logoW / LOGO_ASPECT_RATIO;

  pres.defineSlideMaster({
    title: MASTER_CONTENT,
    background: { color: COLOR_SURFACE },
    objects: [
      // Régua fina do rodapé — separa o conteúdo da assinatura sem pesar.
      {
        rect: {
          x: MARGIN_X,
          y: 6.92,
          w: CONTENT_W,
          h: 0.012,
          fill: { color: COLOR_TABLE_BORDER },
        },
      },
      {
        text: {
          text: `TATICCA · ${deckLabel} · ${companyName}`,
          options: {
            x: MARGIN_X,
            y: 7.0,
            w: CONTENT_W - 2.0,
            h: 0.3,
            fontSize: TYPE.caption,
            color: COLOR_MUTED,
            valign: "middle",
          },
        },
      },
      ...(LOGO_DATA_URI
        ? [
            {
              image: {
                data: LOGO_DATA_URI,
                x: 13.33 - MARGIN_X - logoW,
                y: 6.99,
                w: logoW,
                h: logoH,
              },
            },
          ]
        : []),
    ],
    slideNumber: {
      x: 13.33 - MARGIN_X - logoW - 0.55,
      y: 7.0,
      w: 0.45,
      h: 0.3,
      fontSize: TYPE.caption,
      color: COLOR_MUTED,
      align: "right",
      valign: "middle",
    },
  });

  pres.defineSlideMaster({
    title: MASTER_FULL_BLEED,
    background: { color: COLOR_SURFACE },
    objects: [
      // Faixa vertical de acento na borda esquerda: âncora visual das
      // divisórias, e o único elemento puramente gráfico do miolo.
      { rect: { x: 0, y: 0, w: 0.22, h: 7.5, fill: { color: COLOR_ACCENT } } },
    ],
  });

  pres.defineSlideMaster({
    title: MASTER_COVER,
    background: { color: COLOR_PRIMARY },
    objects: [
      // Faixa branca no topo: o PNG do logo tem tipografia escura e traço sem
      // versão negativa, então ele desaparece sobre o navy. Em vez de exigir um
      // segundo arquivo de logo (que a empresa pode não ter), a capa reserva
      // uma faixa clara para ele — solução que também é o padrão de capa
      // corporativa com marca no topo.
      { rect: { x: 0, y: 0, w: 13.33, h: COVER_BAND_H, fill: { color: COLOR_SURFACE } } },
      // Fio de acento fechando a faixa contra o navy.
      {
        rect: {
          x: 0,
          y: COVER_BAND_H,
          w: 13.33,
          h: 0.055,
          fill: { color: COLOR_ACCENT },
        },
      },
      // Faixa de acento no rodapé da capa, fechando a composição.
      { rect: { x: 0, y: 7.32, w: 13.33, h: 0.18, fill: { color: COLOR_ACCENT } } },
    ],
  });
}

export function addCoverSlide(
  pres: PptxGenJS,
  companyName: string,
  title = "Diagnóstico de robotização"
): void {
  // Capa em fundo navy sólido, não branco: é o único slide do deck que troca de
  // fundo, e é isso que dá o "peso" de abertura de material de consultoria —
  // o miolo continua branco para não pesar na leitura nem na impressão.
  const slide = pres.addSlide({ masterName: MASTER_COVER });

  if (LOGO_DATA_URI) {
    // Logo grande, centralizado dentro da faixa branca do master — na capa ele
    // é o elemento principal, não uma marca de canto.
    const width = 4.4;
    const height = width / LOGO_ASPECT_RATIO;
    slide.addImage({
      data: LOGO_DATA_URI,
      x: (13.33 - width) / 2,
      y: (COVER_BAND_H - height) / 2,
      w: width,
      h: height,
    });
  }

  slide.addText("RELATÓRIO DE DIAGNÓSTICO", {
    x: 0,
    y: 3.35,
    w: 13.33,
    h: 0.3,
    align: "center",
    fontSize: TYPE.eyebrow,
    bold: true,
    charSpacing: 3,
    color: COLOR_ACCENT_ON_DARK,
  });
  slide.addText(title, {
    x: 0,
    y: 3.8,
    w: 13.33,
    h: 0.95,
    align: "center",
    fontSize: TYPE.coverTitle,
    bold: true,
    color: COLOR_SURFACE,
  });
  // Régua centralizada entre o título e o nome da empresa.
  slide.addShape("rect", {
    x: (13.33 - 2.2) / 2,
    y: 4.92,
    w: 2.2,
    h: 0.035,
    fill: { color: COLOR_ACCENT_ON_DARK },
  });
  slide.addText(companyName, {
    x: 0,
    y: 5.2,
    w: 13.33,
    h: 0.55,
    align: "center",
    fontSize: TYPE.coverSubtitle,
    color: COLOR_SURFACE,
  });
  slide.addText(formatDate(new Date()), {
    x: 0,
    y: 5.85,
    w: 13.33,
    h: 0.4,
    align: "center",
    fontSize: TYPE.bodyLarge,
    color: COLOR_ON_DARK_MUTED,
  });
}

/**
 * Slide divisor de seção. Um deck de 9+ slides sem divisórias lê como um dump
 * de tabelas; as divisórias dão ao apresentador pontos naturais de respiro e
 * ao leitor um índice implícito.
 */
export function addSectionSlide(
  pres: PptxGenJS,
  kicker: string,
  title: string,
  description?: string
): void {
  const slide = pres.addSlide({ masterName: MASTER_FULL_BLEED });
  slide.addText(kicker.toUpperCase(), {
    x: MARGIN_X + 0.2,
    y: 2.85,
    w: CONTENT_W,
    h: 0.3,
    fontSize: TYPE.eyebrow,
    bold: true,
    charSpacing: 2,
    color: COLOR_ACCENT,
  });
  slide.addText(title, {
    x: MARGIN_X + 0.2,
    y: 3.25,
    w: CONTENT_W,
    h: 0.7,
    fontSize: TYPE.sectionTitle,
    bold: true,
    color: COLOR_PRIMARY,
  });
  if (description) {
    slide.addText(description, {
      x: MARGIN_X + 0.2,
      y: 4.1,
      w: CONTENT_W,
      h: 1.2,
      fontSize: TYPE.bodyLarge,
      color: COLOR_SECONDARY,
      align: "justify",
      lineSpacingMultiple: 1.35,
      valign: "top",
    });
  }
}

/**
 * Slide de conteúdo: título + régua de acento + texto explicativo opcional.
 *
 * A régua abaixo do título ancora visualmente a página. O texto explicativo
 * ("narrativa") é o parágrafo que o deck feito à mão sempre teve e o gerado
 * não tinha: diz em uma ou duas linhas o que o slide mostra e como lê-lo, para
 * o material se sustentar sozinho quando é enviado por e-mail sem ninguém
 * apresentando. Texto genérico de propósito — não descreve os números da
 * empresa, descreve o que a tabela/gráfico significa.
 */
export function addTitledSlide(
  pres: PptxGenJS,
  title: string,
  narrative?: string,
  /**
   * Rótulo curto alinhado à direita, na mesma linha do título (usado pela área
   * do processo). Fica aqui, e não como um texto solto no slide, porque a
   * largura do título precisa encolher para abrir espaço — senão um título
   * longo passa por baixo do rótulo.
   */
  tag?: string,
  /**
   * `true` reserva altura para um título de duas linhas e desce a régua de
   * acento. Necessário nos slides de processo, cujo título é o nome do processo
   * e frequentemente quebra — com a caixa de uma linha só, a segunda linha
   * passava por cima da régua. Nesse modo o título usa um corpo menor, para a
   * folga extra caber sem empurrar o conteúdo do slide.
   */
  tallTitle = false,
  /**
   * Fração da largura útil que o texto explicativo ocupa. Padrão 1 (linha
   * inteira). Só o slide de payback reduz, para abrir a coluna do bloco de
   * métrica à direita.
   */
  narrativeWidthRatio = 1
): Slide {
  const slide = pres.addSlide({ masterName: MASTER_CONTENT });
  const tagW = tag ? 3.2 : 0;
  const titleH = tallTitle ? 0.78 : 0.5;
  slide.addText(title, {
    x: MARGIN_X,
    y: 0.32,
    w: CONTENT_W - tagW,
    h: titleH,
    fontSize: tallTitle ? TYPE.slideTitleTall : TYPE.slideTitle,
    bold: true,
    color: COLOR_PRIMARY,
    valign: "top",
  });
  if (tag) {
    slide.addText(tag.toUpperCase(), {
      x: MARGIN_X + CONTENT_W - tagW,
      y: 0.32,
      w: tagW,
      h: 0.45,
      align: "right",
      valign: "middle",
      fontSize: TYPE.eyebrow,
      bold: true,
      charSpacing: 1.5,
      color: COLOR_MUTED,
    });
  }
  slide.addShape("rect", {
    x: MARGIN_X,
    y: tallTitle ? 1.14 : 0.92,
    w: 0.9,
    h: 0.035,
    fill: { color: COLOR_ACCENT },
  });
  if (narrative) {
    slide.addText(narrative, {
      x: MARGIN_X,
      y: 1.04,
      w: CONTENT_W * narrativeWidthRatio,
      h: 1.0,
      fontSize: TYPE.slideSubtitle,
      color: COLOR_SECONDARY,
      // Justificado e ocupando a linha inteira: alinhado só à esquerda e com
      // medida reduzida, o parágrafo parava perto da metade do slide e deixava
      // um vazio à direita que lia como erro de diagramação.
      align: "justify",
      lineSpacingMultiple: 1.3,
      valign: "top",
    });
  }
  return slide;
}

/**
 * Onde o conteúdo pode começar, conforme o slide tenha texto explicativo ou
 * não. O valor com texto dá uma folga generosa depois do parágrafo: colada nele
 * a tabela parecia continuação da frase, e o texto perdia a função de
 * introduzir o que vem abaixo.
 */
export const CONTENT_TOP_Y = 1.22;
export const CONTENT_TOP_Y_WITH_SUBTITLE = 2.25;
/** Topo de conteúdo quando o slide usa título de duas linhas (`tallTitle`). */
export const CONTENT_TOP_Y_TALL_TITLE = 1.42;

/**
 * Tabela padrão do deck.
 *
 * Mudança de estilo em relação à versão anterior, que desenhava uma borda sólida
 * em TODAS as células: grade fechada é a marca visual de planilha, não de
 * material de consultoria. Aqui só existem linhas horizontais finas, com zebra
 * alternada para o olho seguir a linha — o alinhamento das colunas já separa
 * verticalmente, sem precisar de traço.
 */
export function addSlideTable(
  slide: Slide,
  rows: TableRow[],
  colW: number[],
  options?: { y?: number }
): void {
  // Zebra aplicada aqui (e não em quem monta as linhas) para que a alternância
  // continue correta mesmo quando o chamador já definiu `fill` em alguma
  // célula — as opções da linha vencem as do nível da tabela.
  const striped = rows.map((row, index) =>
    index > 0 && index % 2 === 0
      ? row.map((cell) => ({
          ...cell,
          options: { fill: { color: COLOR_ZEBRA }, ...cell.options },
        }))
      : row
  );

  slide.addTable(striped, {
    x: MARGIN_X,
    y: options?.y ?? CONTENT_TOP_Y,
    w: CONTENT_W,
    colW,
    fontSize: TYPE.body,
    color: COLOR_PRIMARY,
    border: [
      { type: "none" },
      { type: "none" },
      { type: "solid", pt: 0.75, color: COLOR_TABLE_BORDER },
      { type: "none" },
    ],
    valign: "middle",
    // Respiro interno: a tabela antiga colava o texto na borda da célula, o que
    // é o detalhe que mais denuncia "gerado por script" num deck.
    margin: [0.06, 0.1, 0.06, 0.1],
    autoPage: true,
    autoPageRepeatHeader: true,
    autoPageSlideStartY: CONTENT_TOP_Y,
  });
}
