/**
 * Detecção de nomes provavelmente duplicados numa lista de taxonomia.
 *
 * Existe porque as taxonomias podem ser criadas na hora, direto do combobox de
 * um formulário: quem está preenchendo uma oportunidade não vai conferir a
 * lista inteira antes de digitar, então "Power Automate", "Power-Automate" e
 * "power automate" acabam virando três registros. Esta função encontra esses
 * pares para a tela de Categorias poder oferecer a mesclagem.
 *
 * Função PURA — mesma convenção de scoring.ts/payback.ts/wave-schedule.ts.
 */

export type NamedRecord = { id: string; name: string };

export type SimilarPair<T extends NamedRecord> = {
  a: T;
  b: T;
  /** `identico` = mesmo nome após normalização; `parecido` = 1-2 edições de distância. */
  kind: "identico" | "parecido";
};

/**
 * Normaliza para comparação: minúsculas, sem acentos, sem nada que não seja
 * letra ou número. Assim "Power-Automate", "power automate" e "PowerAutomate"
 * colapsam no mesmo texto.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Distância de Levenshtein com corte: para de calcular assim que passa de
 * `max`. O corte importa porque a tela compara todos os pares da lista, e sem
 * ele nomes longos e completamente diferentes custariam a matriz inteira à toa.
 */
function levenshteinWithin(a: string, b: string, max: number): number | null {
  if (Math.abs(a.length - b.length) > max) return null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      curr.push(value);
      if (value < rowMin) rowMin = value;
    }
    // Toda a linha já passou do limite: nenhuma continuação pode voltar a caber.
    if (rowMin > max) return null;
    prev = curr;
  }
  const distance = prev[b.length];
  return distance <= max ? distance : null;
}

/**
 * Quantas edições ainda contam como "provavelmente a mesma coisa", conforme o
 * tamanho do nome. Nomes curtos precisam ser mais rígidos: em "SAP" e "SAC",
 * uma única letra já é outra ferramenta, enquanto em "Power Automate" e "Power
 * Automat" claramente é a mesma.
 */
function toleranceFor(length: number): number {
  if (length <= 4) return 0;
  if (length <= 8) return 1;
  return 2;
}

/**
 * Todos os pares suspeitos da lista, sem repetir (a,b)/(b,a). Ordena os
 * idênticos primeiro — são os casos em que a mesclagem é quase certa.
 */
export function findSimilarPairs<T extends NamedRecord>(records: T[]): SimilarPair<T>[] {
  const normalized = records.map((record) => ({
    record,
    key: normalizeName(record.name),
  }));

  const pairs: SimilarPair<T>[] = [];
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const left = normalized[i];
      const right = normalized[j];
      // Nome vazio após normalizar (só símbolos) não é comparável — dois deles
      // seriam "idênticos" entre si sem nenhuma relação real.
      if (!left.key || !right.key) continue;

      if (left.key === right.key) {
        pairs.push({ a: left.record, b: right.record, kind: "identico" });
        continue;
      }
      const max = toleranceFor(Math.min(left.key.length, right.key.length));
      if (max === 0) continue;
      if (levenshteinWithin(left.key, right.key, max) !== null) {
        pairs.push({ a: left.record, b: right.record, kind: "parecido" });
      }
    }
  }

  return pairs.sort((x, y) => (x.kind === y.kind ? 0 : x.kind === "identico" ? -1 : 1));
}
