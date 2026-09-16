/**
 * `palais_get` (spécification §17.4).
 *
 * AUCUN appel sortant, AUCUNE lecture D1 : table en mémoire, relevé du MJQ.
 *
 * Deux formes d'entrée, exactement l'une des deux — comme `jurisprudence_get_case`. Le
 * validateur de schéma ne sait pas exprimer « l'un ou l'autre » (pas de `oneOf`),
 * le contrôle est donc ici, sur le modèle de `handlers/cible.ts`.
 */

import { joindre, pluriel } from "../../format/fr";
import { GARDE_PALAIS, GARDE_SANS_ADRESSE } from "../../format/render";
import {
  adresseDuGreffe,
  getGreffe,
  greffesDuPalais,
  listerPalais,
  localitesItinerantes,
  resoudrePalais,
  siegeFixe,
} from "../../qc/lookup";
import { PAYS, PROVINCE } from "../../qc/palais";
import type { ToolContext } from "../registry";
import { err, ok, type ToolResult } from "../rpc";

export async function palaisGetTool(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<ToolResult> {
  const greffeNumber = (args.greffe_number as string | undefined)?.trim();
  const palaisClef = (args.palais as string | undefined)?.trim();

  if (Boolean(greffeNumber) === Boolean(palaisClef)) {
    return err(
      "Fournir EXACTEMENT l'une des deux formes : soit « greffe_number » (3 chiffres, " +
        "p. ex. 500), soit « palais » (nom ou clef, p. ex. « Montréal »).",
    );
  }

  // ── Par numéro de greffe ────────────────────────────────────────────────────
  if (greffeNumber) {
    const greffe = getGreffe(greffeNumber);
    if (!greffe) {
      return err(
        [
          `Le greffe « ${greffeNumber} » ne figure pas dans la table de référence.`,
          "",
          "Cette table est un relevé du ministère de la Justice, NON un registre exhaustif :",
          "un numéro absent du relevé peut désigner un greffe réel. Explications possibles :",
          "numéro erroné · greffe créé ou renuméroté depuis le relevé · absent du relevé.",
          "Consulter palais_list pour le répertoire connu.",
          "",
          GARDE_PALAIS,
        ].join("\n"),
      );
    }

    const lignes: string[] = [
      `Greffe ${greffeNumber} — ${greffe.palais_de_justice}`,
      `District judiciaire : ${greffe.district_judiciaire}`,
    ];

    if (greffe.point_de_service) {
      lignes.push("Cour ITINÉRANTE : elle siège là où la cour se déplace.");
      const localites = localitesItinerantes(greffeNumber);
      if (localites.length > 0) {
        lignes.push(
          `${pluriel(localites.length, "localité desservie", "localités desservies")} : ${localites.join(", ")}.`,
        );
      }
    }

    // Une seule voie de résolution, celle de `adresseDuGreffe` : elle essaie
    // `palais_key` PUIS le siège fixe nommé par le MJQ. Interroger `palais_key` ici
    // ferait diverger cet outil de greffe_parse_court_file_number, qui annoncerait
    // une adresse là où celui-ci dirait « aucune » — pour le même greffe.
    const adresse = adresseDuGreffe(greffeNumber);
    if (adresse) {
      const siege = greffe.palais_key ? null : siegeFixe(greffeNumber);
      if (siege) {
        lignes.push(
          "",
          `Siège fixe : ${siege.palais.name} — rattaché à ce greffe par le relevé du`,
          "ministère de la Justice, et non par déduction.",
        );
      }
      lignes.push("", ...blocAdresse(adresse));
    } else {
      // ⚠ INCONNU n'est pas INEXISTANT (§2).
      lignes.push("", `Aucune adresse publiée n'est rattachée au greffe ${greffeNumber}.`);
      lignes.push(GARDE_SANS_ADRESSE);
    }

    return ok([...lignes, "", GARDE_PALAIS].join("\n"));
  }

  // ── Par nom ou clef de palais ───────────────────────────────────────────────
  const direct = resoudrePalais(palaisClef!);
  const candidats = direct ? [direct] : listerPalais({ query: palaisClef });

  if (candidats.length === 0) {
    return err(
      [
        `Aucun lieu de justice ne correspond à « ${palaisClef} ».`,
        "",
        "L'orthographe du relevé peut différer de celle attendue : le palais de Chicoutimi",
        "est à Saguenay, celui de Havre-Aubert aux Îles-de-la-Madeleine. Employer",
        "palais_list pour parcourir le répertoire.",
        "",
        GARDE_PALAIS,
      ].join("\n"),
    );
  }

  if (candidats.length > 1) {
    return err(
      [
        `« ${palaisClef} » désigne ${candidats.length} lieux :`,
        "",
        ...candidats.map((c) => `  · ${c.palais.name} (${c.palais.city}) — clef « ${c.clef} »`),
        "",
        "Préciser la clef, ou employer palais_list.",
        "",
        GARDE_PALAIS,
      ].join("\n"),
    );
  }

  const trouve = candidats[0]!;
  const lignes = [
    trouve.palais.location_type === "point_de_service"
      ? `${trouve.palais.name} — point de service de justice`
      : `Palais de justice de ${trouve.palais.name}`,
    "",
    ...blocAdresse(trouve.palais),
  ];

  const greffes = greffesDuPalais(trouve.clef);
  if (greffes.length > 0) {
    lignes.push("", "Greffes qui y siègent :");
    for (const { numero, greffe } of greffes) {
      lignes.push(`  · ${numero} — district judiciaire de ${greffe.district_judiciaire}`);
    }
  } else {
    lignes.push(
      "",
      "Aucun numéro de greffe ne désigne ce palais dans la table de référence.",
      "Il n'est PAS rattaché d'office à un greffe voisin : une correspondance devinée",
      "vaudrait moins que son absence.",
    );
  }

  lignes.push(
    "",
    "Les chambres et compétences ne se rattachent PAS au bâtiment mais au numéro de",
    "dossier : employer greffe_parse_court_file_number pour les obtenir.",
  );

  return ok([...lignes, "", GARDE_PALAIS].join("\n"));
}

function blocAdresse(p: {
  street: string;
  unit: string;
  city: string;
  postal_code: string;
  mailing_address: string;
  contacts: readonly { service: string; tel?: string; courriel?: string }[];
}): string[] {
  const lignes = ["Adresse :", `  ${p.street}`];
  if (p.unit) lignes.push(`  ${p.unit}`);
  lignes.push(`  ${p.city} (${PROVINCE}) ${p.postal_code}`, `  ${PAYS}`);
  if (p.mailing_address) lignes.push("", `Adresse postale : ${p.mailing_address}`);

  if (p.contacts.length > 0) {
    lignes.push("", "Coordonnées :");
    for (const c of p.contacts) {
      lignes.push(`  · ${joindre([c.service, c.tel, c.courriel])}`);
    }
  } else {
    // Énoncé plutôt que laissé à découvrir : l'absence de coordonnées est une
    // propriété connue de ces données, pas un échec de la requête.
    lignes.push(
      "",
      "Coordonnées : ce connecteur n'en porte AUCUNE (ni téléphone, ni courriel, ni",
      "heures d'ouverture). Les obtenir auprès du ministère de la Justice du Québec.",
    );
  }
  return lignes;
}
