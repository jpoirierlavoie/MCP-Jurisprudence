import { err, ok, type ToolResult } from "@poirierlavoie/mcp-socle";
import { describeError } from "../../canlii/client";
import { relancerSiInterruptionGouverne } from "../../canlii/errors";
import type { CaseListResponse, Lang } from "../../canlii/types";
import { persisterBalayages } from "../../config";
import { nombreFr, pluriel } from "../../format/fr";
import { document, GARDE_DIFFUSION, LISTES_SANS_FICHE, ligneCandidat } from "../../format/render";
import { type CaseRow, rowFromListItem, upsertCases } from "../../store/cases";
import { LIMITES } from "../defauts";
import type { ToolContext } from "../registry";

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
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(Date.UTC(y!, m! - 1, d!));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m! - 1 || dt.getUTCDate() !== d) {
      return err(`« ${arg} » n'est pas une date calendaire valide (reçu : « ${s} »).`);
    }
    params[param] = s;
    appliques.push(`${arg}=${s}`);
    if (arg.startsWith("published_")) filtreDiffusion = true;
  }

  let page: CaseListResponse;
  try {
    page = await ctx.client.get<CaseListResponse>(`caseBrowse/${lang}/${databaseId}/`, params);
  } catch (e) {
    relancerSiInterruptionGouverne(e);
    return err(describeError(e));
  }

  const items = page.cases ?? [];
  const lignes = items
    .map((it) => rowFromListItem(it, databaseId, lang, "sweep", now))
    .filter((r): r is CaseRow => r !== null);
  const ecartees = items.length - lignes.length;

  if (persisterBalayages(ctx.env)) await upsertCases(ctx.db, lignes);

  if (lignes.length === 0) {
    return ok(
      [
        ecartees > 0
          ? `Aucune décision LISIBLE pour ${databaseId}${appliques.length ? ` (${appliques.join(", ")})` : ""} — CanLII en a pourtant rendu ${nombreFr(ecartees)}.`
          : `Aucune décision pour ${databaseId}${appliques.length ? ` (${appliques.join(", ")})` : ""}.`,
        "",
        ecartees > 0
          ? "Ce n'est PAS un constat d'absence : la cause est dans la LECTURE de la réponse,\npas dans la collection de CanLII."
          : "Une liste vide n'établit pas l'absence de décisions : vérifier le database_id\n(list_databases) et les bornes de dates, qui sont INCLUSIVES.",
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
    LISTES_SANS_FICHE,
    filtreDiffusion ? `\n${GARDE_DIFFUSION}` : null,
  ]
    .filter((s): s is string => s !== null)
    .join("\n");

  return ok(document(entete, lignes.map(ligneCandidat), pied));
}
