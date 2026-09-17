/**
 * `jurisprudence_browse_cases` (spécification §7.6).
 *
 * Trois familles de filtres de dates, qui ne mesurent PAS la même chose :
 *   - `decision_date_*` : la date de la décision ;
 *   - `published_*`     : la date de diffusion sur CanLII ;
 *   - `modified_*` / `changed_*` : la date de dernière modification.
 * Toutes au format AAAA-MM-JJ, bornes INCLUSIVES (annexe B).
 */

import { describeError } from "../../canlii/client";
import type { CaseListResponse, Lang } from "../../canlii/types";
import { persisterBalayages } from "../../config";
import { nombreFr, pluriel } from "../../format/fr";
import { document, GARDE_DIFFUSION, ligneCandidat } from "../../format/render";
import { type CaseRow, rowFromListItem, upsertCases } from "../../store/cases";
import { flushUsage, logSearch } from "../../store/telemetry";
import { LIMITES } from "../defauts";
import type { ToolContext } from "../registry";
import { err, ok, type ToolResult } from "../rpc";

/** Correspondance argument -> paramètre de l'API (annexe B). */
const FILTRES: Array<[string, string]> = [
  ["decision_date_after", "decisionDateAfter"],
  ["decision_date_before", "decisionDateBefore"],
  ["published_after", "publishedAfter"],
  ["published_before", "publishedBefore"],
  ["modified_after", "modifiedAfter"],
  ["modified_before", "modifiedBefore"],
  ["changed_after", "changedAfter"],
  ["changed_before", "changedBefore"],
];

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function browseCases(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const databaseId = String(args.database_id ?? "").trim();
  const lang = (args.lang as Lang) ?? "fr";
  const bornes = LIMITES.browse_cases;
  const limit = Math.min(Math.max((args.limit as number) ?? bornes.defaut, 1), bornes.max);
  const offset = Math.max((args.offset as number) ?? 0, 0);
  const now = ctx.now ?? new Date();

  const params: Record<string, string | number> = { offset, resultCount: limit };
  let filtreDiffusion = false;
  const appliques: string[] = [];

  for (const [arg, param] of FILTRES) {
    const v = args[arg];
    if (v === undefined) continue;
    const s = String(v).trim();
    if (!DATE_ISO.test(s)) {
      return err(`« ${arg} » doit être une date au format AAAA-MM-JJ (reçu : « ${s} »).`);
    }
    params[param] = s;
    appliques.push(`${arg}=${s}`);
    if (arg.startsWith("published_")) filtreDiffusion = true;
  }

  let page: CaseListResponse;
  try {
    page = await ctx.client.get<CaseListResponse>(`caseBrowse/${lang}/${databaseId}/`, params);
  } catch (e) {
    await logSearch(ctx.db, {
      tool: "jurisprudence_browse_cases",
      query: appliques.join(", ") || "(sans filtre)",
      database_id: databaseId,
      lang,
      result_count: 0,
      fallback: "api_error",
    });
    return err(describeError(e));
  } finally {
    await flushUsage(ctx.db, ctx.client.usage(), now);
  }

  const items = page.cases ?? [];
  const lignes = items
    .map((it) => rowFromListItem(it, databaseId, lang, "sweep", now))
    .filter((r): r is CaseRow => r !== null);
  // Ce `.filter` écarte les entrées que `rowFromListItem` ne sait pas lire, et il le
  // faisait EN SILENCE. Si CanLII rend vingt décisions dont aucune n'est lisible, la
  // sortie annonçait « Aucune décision pour qcca » — une absence affirmée alors que la
  // collection en contient et que le défaut est dans NOTRE lecture. C'est l'invariant 9
  // sous un autre habit : l'écart se compte, et il se dit. 2026-09-16.
  const ecartees = items.length - lignes.length;

  // D6 : ce qui a été moissonné pour répondre est persisté.
  if (persisterBalayages(ctx.env)) await upsertCases(ctx.db, lignes);

  await logSearch(ctx.db, {
    tool: "jurisprudence_browse_cases",
    query: appliques.join(", ") || "(sans filtre)",
    database_id: databaseId,
    lang,
    result_count: lignes.length,
    fallback: ecartees > 0 ? "unreadable_items" : null,
  });

  if (lignes.length === 0) {
    return ok(
      [
        ecartees > 0
          ? `Aucune décision LISIBLE pour ${databaseId}${appliques.length ? ` (${appliques.join(", ")})` : ""} — CanLII en a pourtant rendu ${nombreFr(ecartees)}.`
          : `Aucune décision pour ${databaseId}${appliques.length ? ` (${appliques.join(", ")})` : ""}.`,
        "",
        ecartees > 0
          ? "Ce n'est PAS un constat d'absence : la cause est dans la LECTURE de la réponse,\npas dans la collection de CanLII."
          : "Une liste vide n'établit pas l'absence de décisions : vérifier le database_id\n(jurisprudence_list_databases) et les bornes de dates, qui sont INCLUSIVES.",
        filtreDiffusion ? `\n${GARDE_DIFFUSION}` : null,
      ]
        .filter((s): s is string => s !== null)
        .join("\n"),
    );
  }

  const entete =
    `${pluriel(lignes.length, "décision", "décisions")} — ${databaseId}` +
    `${appliques.length ? ` (${appliques.join(", ")})` : ""}, à partir du rang ${nombreFr(offset)} :`;

  const pied = [
    lignes.length === limit
      ? `Page pleine : il y a probablement d'autres résultats. Rappeler avec offset=${nombreFr(offset + limit)}.`
      : null,
    ecartees > 0
      ? `${nombreFr(ecartees)} entrée(s) rendue(s) par CanLII n'ont pas pu être lues et ne figurent pas ci-dessus.`
      : null,
    "Les listes de CanLII ne portent ni date de décision, ni numéro de dossier, ni",
    "hyperlien : pour la fiche complète d'une décision, employer jurisprudence_get_case.",
    filtreDiffusion ? `\n${GARDE_DIFFUSION}` : null,
  ]
    .filter((s): s is string => s !== null)
    .join("\n");

  return ok(document(entete, lignes.map(ligneCandidat), pied));
}
