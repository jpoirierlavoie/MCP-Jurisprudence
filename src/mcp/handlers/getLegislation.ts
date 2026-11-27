import { err, ok, type ToolResult } from "@poirierlavoie/mcp-socle";
import { describeError } from "../../canlii/client";
import { relancerSiInterruptionGouverne } from "../../canlii/errors";
import type { Lang, LegislationMetadata } from "../../canlii/types";
import { dateFr, nombreFr, ou } from "../../format/fr";
import { GARDE_VERSION_LEGISLATIVE, LEGISLATION_METADONNEES, lien } from "../../format/render";
import type { ToolContext } from "../registry";

function abroge(v: string | boolean | undefined): string {
  if (v === undefined || v === null) return "non précisé";
  if (typeof v === "boolean") return v ? "oui" : "non";
  const s = v.trim().toLowerCase();
  if (["true", "yes", "oui", "1"].includes(s)) return "oui";
  if (["false", "no", "non", "0"].includes(s)) return "non";
  return `valeur brute de CanLII : « ${v} »`;
}

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

  let meta: LegislationMetadata;
  try {
    meta = await ctx.client.get<LegislationMetadata>(
      `legislationBrowse/${lang}/${databaseId}/${legislationId}/`,
    );
  } catch (e) {
    relancerSiInterruptionGouverne(e);
    return err(describeError(e));
  }

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
    LEGISLATION_METADONNEES,
  ].filter((s): s is string => s !== null);

  return ok(lignes.join("\n"));
}
