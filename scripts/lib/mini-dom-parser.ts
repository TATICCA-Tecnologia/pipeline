/**
 * Polyfill mínimo de `DOMParser` para rodar parsers de XML escritos para o
 * browser (que usam `new DOMParser().parseFromString(...)`) dentro de um
 * script `tsx` puro em Node — sem precisar de jsdom nem de um `DATABASE_URL`.
 * Node não tem `DOMParser` global (é uma Web API só de browser/DOM).
 *
 * Compartilhado por `scripts/verify-xml-roundtrip.ts` (round-trip do XML de
 * projeto completo, `<projetoCompleto>`) e `scripts/verify-solicitacao-xml.ts`
 * (parse do XML de solicitação, `<solicitacaoDeProjeto>`) — os dois cenários
 * de origem em que este polyfill nasceu, um por script, até este arquivo
 * existir. Cobre só o subconjunto do DOM que os parsers deste projeto usam
 * (tagName, children, textContent, querySelector), suficiente para os XMLs
 * bem-formados e sem namespace/CDATA/comentário que este projeto gera.
 *
 * ATENÇÃO — limite desta abordagem: o `MiniDOMParser` abaixo é um parser XML
 * escrito à mão para estes scripts, e ele NÃO é o `DOMParser` que roda em
 * produção (o do browser, chamado de dentro de `project-xml-import-export.tsx`
 * e de `xml-import.ts`). Ele cobre escape de entidades, espaço em branco e tag
 * vazia da forma que PARECE correta, mas não foi validado contra a
 * implementação real de nenhum motor de browser — se o `MiniDOMParser` for
 * mais tolerante que o `DOMParser` de verdade (por exemplo, aceitando algo que
 * o browser rejeitaria como XML malformado, ou tratando um caso de
 * escape/espaço em branco de um jeito sutilmente diferente), um script que o
 * usa pode passar verde num caso em que a importação real, no navegador,
 * falha. "Round-trip/parse passou" aqui é evidência forte de que
 * build/parse/consumidor estão consistentes ENTRE SI — não é prova de que a
 * importação funciona no browser. Isso só se confirma testando de verdade num
 * browser.
 */

class MiniElement {
  tagName: string;
  children: MiniElement[] = [];
  private textChunks: string[] = [];

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  addText(text: string): void {
    if (text.length > 0) this.textChunks.push(text);
  }

  get textContent(): string {
    const own = this.textChunks.join("");
    const nested = this.children.map((c) => c.textContent).join("");
    return own + nested;
  }
}

class MiniDocument {
  documentElement: MiniElement | null = null;
  // Nunca usado pelos cenários dos scripts que consomem este polyfill (todos
  // os XMLs de entrada são bem-formados) — presente só para satisfazer a
  // chamada `doc.querySelector("parsererror")` que os parsers reais fazem.
  querySelector(_selector: string): MiniElement | null {
    return null;
  }
}

function unescapeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

class MiniDOMParser {
  parseFromString(xmlText: string): MiniDocument {
    const doc = new MiniDocument();
    const s = xmlText.replace(/^﻿/, "").replace(/<\?xml[^>]*\?>/, "");
    let i = 0;

    function skipWhitespace(): void {
      while (i < s.length && /\s/.test(s[i])) i++;
    }

    function parseElement(): MiniElement {
      // Assume s[i] === '<' ao entrar.
      i++; // skip '<'
      const tagStart = i;
      while (i < s.length && s[i] !== ">") i++;
      let rawTag = s.slice(tagStart, i);
      i++; // skip '>'
      const selfClosing = rawTag.endsWith("/");
      if (selfClosing) rawTag = rawTag.slice(0, -1).trimEnd();
      const el = new MiniElement(rawTag);
      if (selfClosing) return el;

      while (true) {
        if (i >= s.length) {
          throw new Error(`XML malformado: tag <${rawTag}> nunca foi fechada.`);
        }
        if (s[i] === "<") {
          if (s[i + 1] === "/") {
            const closeStart = i + 2;
            let j = closeStart;
            while (j < s.length && s[j] !== ">") j++;
            const closeName = s.slice(closeStart, j);
            i = j + 1;
            if (closeName !== rawTag) {
              throw new Error(
                `XML malformado: esperava fechar <${rawTag}>, encontrou </${closeName}>.`
              );
            }
            break;
          }
          el.children.push(parseElement());
        } else {
          const textStart = i;
          while (i < s.length && s[i] !== "<") i++;
          el.addText(unescapeXmlEntities(s.slice(textStart, i)));
        }
      }
      return el;
    }

    skipWhitespace();
    if (s[i] === "<") {
      doc.documentElement = parseElement();
    }
    return doc;
  }
}

/**
 * Registra o `MiniDOMParser` como `globalThis.DOMParser`. Idempotente — pode
 * ser chamada mais de uma vez sem efeito colateral (útil se, no futuro, mais
 * de um script `main()` acabar rodando no mesmo processo).
 */
export function installMiniDomParserPolyfill(): void {
  (globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser =
    MiniDOMParser as unknown as typeof DOMParser;
}
