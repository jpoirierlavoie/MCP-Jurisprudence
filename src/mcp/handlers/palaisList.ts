/**
 * `palais_list` (spécification §17.3).
 *
 * AUCUN appel sortant, AUCUNE lecture D1 : table en mémoire, relevé du MJQ.
 */

import { nombreFr, pluriel } from "../../format/fr";
import { document, GARDE_PALAIS } from "../../format/render";
import { listerDistricts, listerPalais, type PalaisResolu } from "../../qc/lookup";
import type { TypeLieu } from "../../qc/palais";
import type { ToolContext } from "../registry";
import { err, ok, type ToolResult } from "../rpc";

/** Une ligne compacte par lieu — l'analogue de `ligneCandidat` pour les palais. */
function ligne(p: PalaisResolu): string {
  const lignes: string[] = [
    p.palais.location_type === "point_de_service"
      ? `${p.palais.name} — point de service de justice`
      : p.palais.name,
  ];
  lignes.push(`${p.palais.street}, ${p.palais.city} (Québec) ${p.palais.postal_code}`);

  if (p.greffes.length > 0) {
    const districts = [...new Set(p.greffes.map((g) => g.greffe.district_judiciaire))];
    lignes.push(
      `Greffe${p.greffes.length > 1 ? "s" : ""} ${p.greffes.map((g) => g.numero).join(", ")} · ` +
        `district${districts.length > 1 ? "s" : ""} de ${districts.join(", ")}`,
    );
  } else {
    // Kuujjuaq : publié par le MJQ, rattaché à aucun greffe. On le dit plutôt que
    // de deviner un rattachement.
    lignes.push("Aucun numéro de greffe ne désigne ce palais dans la table de référence.");
  }
  return lignes.join("\n");
}

export async function palaisListTool(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<ToolResult> {
  const district = (args.district as string | undefined)?.trim();
  const query = (args.query as string | undefined)?.trim();
  const type = args.type as TypeLieu | undefined;

  const resultats = listerPalais({ district, query, type });
  const filtres = [
    district ? `district=${district}` : null,
    query ? `recherche=${query}` : null,
    type ? `type=${type}` : null,
  ].filter((s): s is string => s !== null);

  if (resultats.length === 0) {
    // Une liste vide n'est pas un constat d'absence : c'est le pendant de la règle
    // INTROUVABLE. On rend les districts connus pour que la reprise soit possible.
    //
    // ⚠ Et ce n'est pas davantage un ÉCHEC : `ok`, donc `isError: false`. Cette
    //   branche rendait `err` jusqu'au 2026-09-16, là où `jurisprudence_browse_cases`
    //   rend `ok` dans exactement la même situation. Un client qui lit `isError`
    //   pour décider s'il réessaie voyait donc « aucun palais dans ce district »
    //   comme une panne du serveur, et « aucune décision dans cette base » comme une
    //   réponse — pour la même question posée à deux outils. La règle est en §7.
    return ok(
      [
        `Aucun lieu ne répond${filtres.length ? ` à ${filtres.join(", ")}` : ""}.`,
        "",
        "Une liste vide ne vaut pas constat d'absence : le filtre peut ne pas correspondre",
        "à l'orthographe du relevé. Les 36 districts judiciaires connus sont :",
        "",
        listerDistricts().join(" · "),
        "",
        GARDE_PALAIS,
      ].join("\n"),
    );
  }

  const entete =
    `${pluriel(resultats.length, "lieu", "lieux")} de justice` +
    `${filtres.length ? ` (${filtres.join(", ")})` : ""} :`;

  const pied = [
    filtres.length === 0
      ? `Relevé complet : ${nombreFr(43)} palais de justice et ${nombreFr(8)} points de service.`
      : null,
    "Pour la fiche complète d'un lieu — adresse postale, greffes, localités desservies —",
    "employer palais_get.",
    "",
    GARDE_PALAIS,
  ]
    .filter((s): s is string => s !== null)
    .join("\n");

  return ok(document(entete, resultats.map(ligne), pied));
}
