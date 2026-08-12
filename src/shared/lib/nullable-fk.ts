/**
 * Normaliza um id de chave estrangeira vindo de formulário.
 *
 * Os Selects das telas de edição são controlados por `useState<string>("")` —
 * quando nada foi escolhido eles guardam `""` e mandam esse `""` no payload do
 * `project.update` (a ficha e a aba Especificação sempre enviam o campo, não
 * `undefined`). Gravar `""` numa coluna FK estoura a constraint no Postgres,
 * que só dispensa a verificação para NULL: "Foreign key constraint violated on
 * the constraint: projects_currentApplicationOwnerAreaId_fkey".
 *
 * O caminho de criação nunca viu esse erro porque `build-project-payload.ts`
 * já converte `"" -> undefined` antes de enviar. Aqui a conversão fica do lado
 * do servidor, que é quem escreve no banco, valendo para qualquer chamador.
 *
 * `undefined` só chega aqui depois do gate `!== undefined` de cada campo no
 * router — "campo não enviado" continua significando "não mexe", e nunca passa
 * por esta função.
 */
export function toNullableFkId(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
