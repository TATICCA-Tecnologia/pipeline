"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

// Página de tamanho fixo (16:9, mesma proporção de um slide de verdade) — o conteúdo
// NUNCA muda o tamanho da página; em vez disso, encolhe (useFitToSlide abaixo) até caber.
export const SLIDE_WIDTH = 1100;
export const SLIDE_HEIGHT = Math.round((SLIDE_WIDTH * 9) / 16);

/** Piso da página executiva, cujo conteúdo tem teto conhecido. */
export const DEFAULT_MIN_SLIDE_SCALE = 0.5;

// O conteúdo é medido SEMPRE na largura fixa SLIDE_WIDTH (nunca varia) — isso evita um
// problema real de uma versão anterior desta função, que recalculava a largura junto com
// a escala (pra não sobrar espaço lateral) e podia oscilar sem nunca convergir num valor
// que realmente coubesse, resultando em conteúdo cortado silenciosamente pelo
// overflow:hidden da página. Aqui a conta é direta e sempre garantida: mede a altura
// natural (scrollHeight, que ignora o transform) numa largura fixa, e a escala final é
// sempre >= à necessária pra essa altura caber em SLIDE_HEIGHT — nunca corta conteúdo.
// Um ResizeObserver reage a mudanças tardias de altura (fonte/imagem carregando depois).
//
// A garantia "nunca corta" só vale enquanto a escala necessária for >= minScale: abaixo
// disso o overflow:hidden volta a cortar em silêncio. Por isso o piso é parâmetro, e não
// constante — a página técnica, cujas listas não têm teto, usa um piso menor.
function useFitToSlide(
  contentRef: React.RefObject<HTMLDivElement | null>,
  resetKey: string,
  minScale: number
): number {
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    setScale(1);
  }, [resetKey]);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const measure = () => {
      const naturalHeight = el.scrollHeight;
      const next =
        naturalHeight > SLIDE_HEIGHT ? Math.max(minScale, SLIDE_HEIGHT / naturalHeight) : 1;
      setScale((current) => (Math.abs(next - current) > 0.002 ? next : current));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [contentRef, resetKey, minScale]);

  return scale;
}

/**
 * Uma página do slide: moldura 16:9 fixa, as duas tarjas diagonais da marca e o
 * auto-shrink do conteúdo. Não sabe nada sobre o que está dentro.
 */
export function SlidePage({
  resetKey,
  minScale = DEFAULT_MIN_SLIDE_SCALE,
  children,
}: {
  resetKey: string;
  minScale?: number;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const scale = useFitToSlide(contentRef, resetKey, minScale);

  return (
    <div
      className="executive-slide-print-root relative mx-auto overflow-hidden bg-white shadow-md"
      style={{ width: SLIDE_WIDTH, height: SLIDE_HEIGHT }}
    >
      <div
        ref={contentRef}
        className="relative text-[#1a1a2e]"
        style={{
          width: SLIDE_WIDTH,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          // transform não muda a posição de layout do elemento, só o visual — centraliza
          // manualmente o espaço que sobra na largura quando scale < 1 (encolheu).
          marginLeft: (SLIDE_WIDTH * (1 - scale)) / 2,
        }}
      >
        <div
          className="absolute inset-y-0 left-0 w-16"
          style={{ background: "#1a2b4a", clipPath: "polygon(0 0, 100% 0, 40% 100%, 0 100%)" }}
        />
        <div
          className="absolute inset-y-0 left-[18px] w-[46px]"
          style={{ background: "#14b8a6", clipPath: "polygon(0 0, 100% 0, 40% 100%, 0 100%)" }}
        />
        {children}
      </div>
    </div>
  );
}
