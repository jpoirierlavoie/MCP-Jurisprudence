/**
 * `jurisprudence_get_legislation` (spécification §7.9).
 *
 * Rend `repealed` en français EXPLICITE (« Abrogé : oui / non ») plutôt que la valeur
 * brute : un « false » anglais au milieu d'une fiche française se lit mal, et
 * l'abrogation est précisément le fait qu'on vient vérifier.
 *
 * ⚠ LA MÊME RÈGLE VAUT POUR LES DATES, et elle n'y était pas appliquée jusqu'au
 *   2026-09-17. La fiche rendait `dateScheme` BRUT sur une ligne, et `startDate` sur la
 *   suivante :
 *
 *       Régime de dates : ENTRY_INTO_FORCE
 *       Date de début : 2026-02-24
 *
 *   Sur le Code civil du Québec. Deux lignes vraies, qui se lisent ensemble comme
 *   « le Code civil est entré en vigueur en 2026 » — il l'est depuis 1994. La date
 *   borne la VERSION CONSOLIDÉE que CanLII sert, pas l'instrument.
 *
 *   Le même gabarit servait `DOWNLOAD_DATE`, qui n'est que le jour du téléchargement et
 *   n'a aucune portée juridique. Deux faits de nature différente, une seule forme.
 *
 *   D'où trois énoncés là où il y en avait deux : une FENÊTRE dont le sujet est la
 *   version, un RÉGIME glosé (jamais traduit au jugé), et une réserve explicite —
 *   placée SOUS les dates, parce qu'une réserve mise en pied ne corrige pas une
 *   affirmation déjà faite.
 */

import { describeError } from "../../canlii/client";
import type { Lang, LegislationMetadata } from "../../canlii/types";
import { dateFr, nombreFr, ou } from "../../format/fr";
import { GARDE_VERSION_LEGISLATIVE, lien } from "../../format/render";
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

/**
 * `dateScheme` est un ENUM de CanLII, documenté NULLE PART.
 *
 * ⚠ DEUX valeurs sont OBSERVÉES, et elles ne disent pas la même chose :
 *     · `ENTRY_INTO_FORCE` — l'entrée en vigueur de CETTE VERSION du texte ;
 *     · `DOWNLOAD_DATE`    — le seul jour où CanLII a téléchargé le texte.
 *   La seconde n'a aucune portée juridique, et elle était rendue dans la MÊME forme que
 *   la première, sous une ligne « Date de début » indiscernable.
 *
 * ⚠ On GLOSE la valeur, on ne la TRADUIT jamais au jugé, et on la rend TOUJOURS brute
 *   entre guillemets — même règle qu'`abroge()` ci-dessus. Une valeur non observée
 *   tombe dans `default` et s'annonce comme inconnue : inventer sa traduction serait
 *   exactement ce que le docblock de ce fichier refuse.
 */
function regimeDeDates(v: string | undefined): string {
  const brut = (v ?? "").trim();
  if (brut.length === 0) return "Régime de dates : non précisé par CanLII ; n'en rien inférer.";
  switch (brut.toUpperCase()) {
    case "ENTRY_INTO_FORCE":
      return `Régime de dates : « ${brut} » — entrée en vigueur de CETTE VERSION.`;
    case "DOWNLOAD_DATE":
      return `Régime de dates : « ${brut} » — jour où CanLII a téléchargé le texte ; aucune portée juridique.`;
    default:
      return `Régime de dates : « ${brut} » — régime inconnu de ce connecteur ; n'en rien inférer.`;
  }
}

/**
 * Le SUJET de la phrase est la VERSION : aucune lecture ne peut l'attacher au texte.
 *
 * Les deux dates vivaient sur deux lignes séparées — « Date de début », « Date de fin »
 * — et c'est cette coupure qui permettait de lire chaque date seule, puis de rapprocher
 * « Date de début » du régime pour en tirer une entrée en vigueur. Un seul énoncé, dont
 * le sujet est nommé, ne se démonte pas ainsi.
 */
function fenetreDeVersion(debut: string | undefined, fin: string | undefined): string {
  const d = debut?.trim() ? dateFr(debut) : null;
  const f = fin?.trim() ? dateFr(fin) : null;
  if (d && f) return `Version servie par CanLII : du ${d} au ${f}.`;
  if (d) return `Version servie par CanLII : depuis le ${d}, sans date de fin.`;
  if (f) return `Version servie par CanLII : jusqu'au ${f}, sans date de début.`;
  return "Version servie par CanLII : dates non précisées.";
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
    fenetreDeVersion(meta.startDate, meta.endDate),
    regimeDeDates(meta.dateScheme),
    GARDE_VERSION_LEGISLATIVE,
    parties > 0 ? `Découpage : ${nombreFr(parties)} partie(s).` : null,
    url,
    "",
    "Métadonnées seulement — l'API de CanLII ne rend pas le texte. Pour le TEXTE d'une",
    "loi ou d'un règlement du Québec, employer le connecteur « Législation du Québec »,",
    "qui rend le texte officiel verbatim.",
  ].filter((s): s is string => s !== null);

  return ok(lignes.join("\n"));
}
