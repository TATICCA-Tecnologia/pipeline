import JSZip from "jszip";

export interface ZipXmlEntry {
  fileName: string;
  xmlText: string;
}

/**
 * Extrai o texto de todos os arquivos .xml dentro de um .zip, ignorando
 * pastas e qualquer arquivo que não termine em .xml (ex.: __MACOSX/, .docx
 * soltos). Ordena por nome de arquivo para processamento determinístico.
 */
export async function extractXmlEntriesFromZip(file: File): Promise<ZipXmlEntry[]> {
  const zip = await JSZip.loadAsync(file);
  const xmlFileEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".xml"))
    .sort((a, b) => a.name.localeCompare(b.name));

  const entries: ZipXmlEntry[] = [];
  for (const entry of xmlFileEntries) {
    const xmlText = await entry.async("text");
    entries.push({ fileName: entry.name, xmlText });
  }
  return entries;
}
