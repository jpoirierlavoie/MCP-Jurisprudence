/**
 * `jurisprudence_browse_legislation` (spécification §7.8).
 *
 * L'API ne pagine pas cet endpoint : elle rend la base entière. La pagination est
 * donc appliquée CÔTÉ WORKER, et la troncature est annoncée en toutes lettres.
 */

import { describeError } from "../../canlii/client";
import type { Lang, LegislationListResponse } from "../../canlii/types";
import { fold } from "../../citation/normalize";
import { nombreFr, pluriel, troncature } from "../../format/fr";
import { document, LEGISLATION_METADONNEES_LISTE } from "../../format/render";
import { flushUsage, logSearch } from "../../store/telemetry";
import { LIMITES } from "../defauts";
import type { ToolContext } from "../registry";
import { err, ok, type ToolResult } from "../rpc";

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
  const now = ctx.now ?? new Date();

  let payload: LegislationListResponse;
  try {
    payload = await ctx.client.get<LegislationListResponse>(
      `legislationBrowse/${lang}/${databaseId}/`,
    );
  } catch (e) {
    await logSearch(ctx.db, {
      tool: "jurisprudence_browse_legislation",
      query: query ?? "(sans filtre)",
      database_id: databaseId,
      lang,
      result_count: 0,
      fallback: "api_error",
    });
    return err(describeError(e));
  } finally {
    await flushUsage(ctx.db, ctx.client.usage(), now);
  }

  let items = payload.legislations ?? [];
  if (query) {
    const motif = fold(query);
    items = items.filter(
      (i) => fold(i.title ?? "").includes(motif) || fold(i.citation ?? "").includes(motif),
    );
  }

  await logSearch(ctx.db, {
    tool: "jurisprudence_browse_legislation",
    query: query ?? "(sans filtre)",
    database_id: databaseId,
    lang,
    result_count: items.length,
  });

  if (items.length === 0) {
    return ok(
      `Aucun texte pour ${databaseId}${query ? ` correspondant à « ${query} »` : ""}.\n` +
        "Vérifier le database_id avec jurisprudence_list_databases (kind='legislation').",
    );
  }

  const page = items.slice(offset, offset + limit);
  const blocs = page.map((i) => {
    const lignes = [i.title ?? "(titre absent)"];
    // `type` BRUT, pour le motif écrit en §4.1 et dans `getLegislation.ts` : cinq
    // valeurs observées, ensemble non clos, et la traduction serait une qualification
    // juridique au jugé.
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
