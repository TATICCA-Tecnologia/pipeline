/**
 * Extrai cada bloco <solicitacaoDeProjeto>...</solicitacaoDeProjeto> de um
 * texto bruto de resposta de IA (que também contém markdown ao redor:
 * cabeçalhos "### Oportunidade N", cercas \`\`\`xml, "## Observações gerais"
 * etc. — ver formato de saída em xml-generation-prompt.ts). Cada bloco
 * encontrado vira um XML standalone, pronto para parseSolicitacaoXml
 * (mesma função usada pelo import manual de .xml/.zip).
 */
export function extractXmlEntriesFromAiResponse(rawText: string): string[] {
  const matches = rawText.match(/<solicitacaoDeProjeto>[\s\S]*?<\/solicitacaoDeProjeto>/g);
  if (!matches) return [];
  return matches.map((block) => `<?xml version="1.0" encoding="UTF-8"?>\n${block}`);
}
