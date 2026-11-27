import { err, ok, type ToolResult } from "@poirierlavoie/mcp-socle";
import { describeError } from "../../canlii/client";
import { relancerSiInterruptionGouverne } from "../../canlii/errors";
import type { Lang, LegislationListResponse } from "../../canlii/types";
import { fold } from "../../citation/normalize";
import { nombreFr, pluriel, troncature } from "../../format/fr";
import { document, LEGISLATION_METADONNEES_LISTE } from "../../format/render";
import { LIMITES } from "../defauts";
import type { ToolContext } from "../registry";

export async function browseLegislation(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const databaseId = String(args.database_id ?? "").trim();
  const lang = (args.lang as Lang) ?? "fr";
  const query = (args.query as string | undefined)?.trim();
  const bornes = LIMITES.browse_legislation;
  const limit = Math.min(Math.max((args.limit as number) ?? bornes.defaut, 1), bornes.max);
  const offset = Math.max((args.offset as number) ?? 0, 0);

  let payload: LegislationListResponse;
  try {
    payload = await ctx.client.get<LegislationListResponse>(
      `legislationBrowse/${lang}/${databaseId}/`,
    );
  } catch (e) {
    relancerSiInterruptionGouverne(e);
    return err(describeError(e));
  }

  let items = payload.legislations ?? [];
  if (query) {
    const motif = fold(query);
    items = items.filter(
      (i) => fold(i.title ?? "").includes(motif) || fold(i.citation ?? "").includes(motif),
    );
  }

  if (items.length === 0) {
    return ok(
      `Aucun texte pour ${databaseId}${query ? ` correspondant à « ${query} »` : ""}.\n` +
        "Vérifier le database_id avec list_databases (kind='legislation').",
    );
  }

  const page = items.slice(offset, offset + limit);
  const blocs = page.map((i) => {
    const lignes = [i.title ?? "(titre absent)"];
    lignes.push(
      [i.citation, i.type, `${i.databaseId ?? databaseId} / ${i.legislationId ?? "—"}`]
        .filter(Boolean)
        .join(" · "),
    );
    return lignes.join("\n");
  });

  const tronque = troncature(offset + page.length, items.length);
  const entete =
    `${pluriel(items.length, "texte", "textes")} dans ${databaseId}` +
    `${query ? ` correspondant à « ${query} »` : ""} :`;
  const pied = [
    tronque ? `Troncature : ${tronque} (rappeler avec offset=${nombreFr(offset + limit)}).` : null,
    LEGISLATION_METADONNEES_LISTE,
  ]
    .filter((s): s is string => s !== null)
    .join("\n");

  return ok(document(entete, blocs, pied));
}
