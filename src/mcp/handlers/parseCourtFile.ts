/**
 * `greffe_parse_court_file_number` (spécification §17.2).
 *
 * AUCUN appel sortant, AUCUNE lecture D1, AUCUNE écriture : tables en mémoire.
 *
 * ⚠ PRÉFIXE `greffe_` ET NON `jurisprudence_` : la réponse ne vient PAS de CanLII mais
 *   d'un relevé local du ministère de la Justice du Québec. Le préfixe ne NOMME plus la
 *   source depuis le 2026-09-16 (D8 amendée) — c'est la description qui s'en charge —
 *   mais il partitionne toujours, et cette partition reste load-bearing : ranger cet
 *   outil du côté de CanLII attribuerait au tiers une donnée dont il n'est pas la
 *   source.
 *
 * ⚠ AUCUNE TÉLÉMÉTRIE, DÉLIBÉRÉMENT. Les outils `jurisprudence_*` consignent leur requête dans
 *   `search_log` pour affiner l'analyseur ; celui-ci ne le fait pas. Un numéro de
 *   dossier désigne un DOSSIER EN COURS bien plus directement qu'une citation de
 *   jurisprudence — c'est la réserve de §9.5 appliquée à la lettre. Le gain de réglage
 *   ne vaut pas la conservation. Verrouillé par `test/garde.test.ts`.
 */

import { joindre } from "../../format/fr";
import { GARDE_DOSSIER, GARDE_SANS_ADRESSE, SANS_PLUMITIF } from "../../format/render";
import { analyserNumeroDossier } from "../../qc/dossier";
import { LIBELLE_CATEGORIE } from "../../qc/forums";
import { LIBELLE_TYPE_GREFFE } from "../../qc/juridictions";
import { adresseDuGreffe, localitesItinerantes } from "../../qc/lookup";
import type { ToolContext } from "../registry";
import { ok, type ToolResult } from "../rpc";

export async function parseCourtFileTool(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<ToolResult> {
  const brut = String(args.court_file_number ?? "");
  const r = analyserNumeroDossier(brut);

  const lignes: string[] = [`Analyse de « ${brut.trim()} » — aucun appel, table locale.`, ""];

  // ── Forum non judiciaire : le préfixe EST la réponse ────────────────────────
  if (r.forum) {
    lignes.push(
      `Forum : ${r.forum.name} (${r.forum.abbr})`,
      `Catégorie : ${LIBELLE_CATEGORIE[r.forum.category]}`,
      "",
      "Ce corps numérote ses dossiers lui-même : il n'y a ni greffe ni juridiction à",
      "résoudre, et le numéro se conserve tel quel.",
    );
    if (r.forum.category === "federal") {
      lignes.push(
        "",
        "Une cour fédérale n'est PAS un tribunal administratif. Pour vérifier une de ses",
        "décisions, employer jurisprudence_verify_citations.",
      );
    }
    return ok([...lignes, "", GARDE_DOSSIER].join("\n"));
  }

  // ── Préfixe alphabétique non répertorié ─────────────────────────────────────
  if (r.is_administrative && !r.greffe_number && !r.parse_error) {
    lignes.push(
      "Préfixe alphabétique NON répertorié.",
      "",
      "Ce numéro n'est pas de forme judiciaire québécoise : il émane vraisemblablement",
      "d'un tribunal ou d'un organisme qui numérote ses dossiers lui-même. Le connecteur",
      "ne devine PAS de quel corps il s'agit — un nom deviné vaudrait moins que rien.",
    );
    return ok([...lignes, "", GARDE_DOSSIER].join("\n"));
  }

  // ── Forme refusée ───────────────────────────────────────────────────────────
  if (!r.greffe_number) {
    lignes.push(
      r.parse_error ?? "Numéro non analysable.",
      "",
      "Forme attendue : NNN-NN-NNNNNN-NNN (ex. : 500-05-123456-241) — trois chiffres de",
      "greffe, deux de juridiction. Les tribunaux administratifs et les cours fédérales",
      "emploient plutôt un préfixe alphabétique (TAL-…, C.F.-…).",
    );
    return ok([...lignes, "", GARDE_DOSSIER].join("\n"));
  }

  // ── Numéro judiciaire ───────────────────────────────────────────────────────
  if (r.greffe) {
    lignes.push(
      `Greffe ${r.greffe_number}      ${joindre([
        r.greffe.palais_de_justice,
        `district judiciaire de ${r.greffe.district_judiciaire}`,
      ])}`,
    );
  } else {
    lignes.push(`Greffe ${r.greffe_number}      INCONNU de la table de référence.`);
  }

  if (r.juridiction) {
    lignes.push(
      `Juridiction ${r.juridiction_number} ${joindre([
        r.juridiction.tribunal,
        r.juridiction.competence,
        LIBELLE_TYPE_GREFFE[r.juridiction.greffe_type],
      ])}`,
    );
  } else {
    lignes.push(`Juridiction ${r.juridiction_number} INCONNUE de la table de référence.`);
  }

  // Adresse — servie ici parce que c'est ce qu'on veut savoir juste après.
  if (r.greffe) {
    const adresse = adresseDuGreffe(r.greffe_number);
    if (adresse) {
      lignes.push("", `Palais : ${adresse.name}`, `  ${adresse.street}`);
      if (adresse.unit) lignes.push(`  ${adresse.unit}`);
      lignes.push(`  ${adresse.city} (Québec) ${adresse.postal_code}`);
    } else {
      // ⚠ INCONNU n'est pas INEXISTANT (§2).
      lignes.push("", `Aucune adresse publiée n'est rattachée au greffe ${r.greffe_number}.`);
      const localites = localitesItinerantes(r.greffe_number);
      if (localites.length > 0) {
        lignes.push(`Cour itinérante desservant : ${localites.join(", ")}.`);
      }
      lignes.push(GARDE_SANS_ADRESSE);
    }
  }

  if (r.parse_error) lignes.push("", `⚠ ${r.parse_error}`);

  lignes.push("", "Pour la fiche complète du palais, employer palais_get.", SANS_PLUMITIF);

  return ok([...lignes, "", GARDE_DOSSIER].join("\n"));
}
