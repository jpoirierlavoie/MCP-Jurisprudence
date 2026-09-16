/**
 * `jurisprudence_get_legislation` (spécification §7.9).
 *
 * Rend `repealed` en français EXPLICITE (« Abrogé : oui / non ») plutôt que la valeur
 * brute : un « false » anglais au milieu d'une fiche française se lit mal, et
 * l'abrogation est précisément le fait qu'on vient vérifier.
 */

import { describeError } from "../../canlii/client";
import type { Lang, LegislationMetadata } from "../../canlii/types";
import { dateFr, nombreFr, ou } from "../../format/fr";
import { lien } from "../../format/render";
import { flushUsage, logSearch } from "../../store/telemetry";
import type { ToolContext } from "../registry";
import { err, ok, type ToolResult } from "../rpc";

/** `repealed` arrive tantôt en booléen, tantôt en chaîne selon les corpus. */
function abroge(v: string | boolean | undefined): string {
  if (v === undefined || v === null) return "non précisé";
  if (typeof v === "boolean") return v ? "oui" : "non";
  const s = v.trim().toLowerCase();
  if (["true", "yes", "oui", "1"].includes(s)) return "oui";
  if (["false", "no", "non", "0"].includes(s)) return "non";
  return `valeur brute de CanLII : « ${v} »`;
}

export async function getLegislation(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const databaseId = String(args.database_id ?? "").trim();
  const legislationId = String(args.legislation_id ?? "").trim();
  const lang = (args.lang as Lang) ?? "fr";
  const now = ctx.now ?? new Date();

  let meta: LegislationMetadata;
  try {
    meta = await ctx.client.get<LegislationMetadata>(
      `legislationBrowse/${lang}/${databaseId}/${legislationId}/`,
    );
  } catch (e) {
    await logSearch(ctx.db, {
      tool: "jurisprudence_get_legislation",
      query: `${databaseId}/${legislationId}`,
      database_id: databaseId,
      lang,
      result_count: 0,
      fallback: "api_error",
    });
    return err(describeError(e));
  } finally {
    await flushUsage(ctx.db, ctx.client.usage(), now);
  }

  await logSearch(ctx.db, {
    tool: "jurisprudence_get_legislation",
    query: `${databaseId}/${legislationId}`,
    database_id: databaseId,
    lang,
    result_count: 1,
  });

  const parties = Array.isArray(meta.content) ? meta.content.length : 0;
  const url = lien({ url: meta.url ?? null });

  const lignes = [
    ou(meta.title, "(titre absent)"),
    [ou(meta.citation), ou(meta.type), `${databaseId} / ${ou(meta.legislationId, legislationId)}`]
      .filter(Boolean)
      .join(" · "),
    "",
    `Abrogé : ${abroge(meta.repealed)}`,
    `Régime de dates : ${ou(meta.dateScheme)}`,
    `Date de début : ${dateFr(meta.startDate)}`,
    `Date de fin   : ${dateFr(meta.endDate)}`,
    parties > 0 ? `Découpage : ${nombreFr(parties)} partie(s).` : null,
    url,
    "",
    "Métadonnées seulement — l'API de CanLII ne rend pas le texte. Pour le TEXTE d'une",
    "loi ou d'un règlement du Québec, employer le connecteur « Législation du Québec »,",
    "qui rend le texte officiel verbatim.",
  ].filter((s): s is string => s !== null);

  return ok(lignes.join("\n"));
}
