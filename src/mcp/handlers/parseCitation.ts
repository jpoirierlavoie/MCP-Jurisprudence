/**
 * `parse_citation` (spécification §7.10).
 *
 * AUCUN appel sortant, AUCUNE écriture. Outil de diagnostic : il sert à déboguer la
 * table `court_codes` et à expliquer un verdict NON CONSTRUCTIBLE.
 */

import { ok, type ToolResult } from "@poirierlavoie/mcp-socle";
import { formLabel, parseCitation, resolve } from "../../citation/parse";
import { DIAGNOSTIC_SEULEMENT } from "../../format/render";
import { loadDirectory } from "../../store/databases";
import type { ToolContext } from "../registry";

export async function parseCitationTool(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const citation = String(args.citation ?? "");
  const now = ctx.now ?? new Date();
  const dir = await loadDirectory(ctx.db);
  const parsed = parseCitation(citation, (code) => dir.courtCodes.has(code));
  const res = resolve(parsed.primary, dir);

  const lignes: string[] = [`Analyse de « ${citation} » — aucun appel à CanLII.`, ""];

  const FORMES: Record<string, string> = {
    neutral: "citation neutre",
    canlii: "citation attribuée par CanLII",
    reporter: "recueil",
    publisher: "identifiant d'éditeur",
    unparsed: "non reconnue",
  };
  lignes.push(`Forme reconnue : ${FORMES[parsed.primary.kind] ?? parsed.primary.kind}.`);
  if (parsed.inlineTitle) {
    lignes.push(`Intitulé relevé : « ${parsed.inlineTitle} ».`);
  }

  const ETIQUETTE: Record<string, string> = {
    oui: "oui (correspondance de répertoire confirmée)",
    probable: "probable (hypothèse de répertoire, non encore confirmée par un appel réussi)",
    non: "non",
  };
  lignes.push(`Constructible : ${ETIQUETTE[res.constructible]}.`);

  if (
    (parsed.primary.kind === "neutral" ||
      parsed.primary.kind === "canlii" ||
      parsed.primary.kind === "reporter") &&
    parsed.primary.year > now.getUTCFullYear() + 1
  ) {
    lignes.push(
      `⚠ Année future / invraisemblable (${parsed.primary.year}, année courante : ${now.getUTCFullYear()}).`,
    );
  }

  if (res.databaseId && res.caseId) {
    lignes.push(`database_id : ${res.databaseId}`);
    lignes.push(`case_id     : ${res.caseId}`);
    if (!res.databaseConnue && dir.knownDatabases.size > 0) {
      lignes.push(
        "⚠ Ce database_id ne figure PAS au répertoire local des bases de CanLII. " +
          "Consulter list_databases.",
      );
    }
  }

  lignes.push("", res.raison);

  if (parsed.parallel.length > 0) {
    lignes.push("", "Formes parallèles relevées dans la même chaîne :");
    for (const f of parsed.parallel) lignes.push(`  · ${formLabel(f)}`);
  }

  lignes.push("", DIAGNOSTIC_SEULEMENT);

  return ok(lignes.join("\n"));
}
