/**
 * Consultation des tables du Québec — PUR : aucune E/S, aucun appel, aucune lecture D1.
 *
 * C'est ce qui distingue ces outils des dix outils `jurisprudence_*` : ils ne peuvent pas
 * échouer, pas consommer de quota, pas dépendre du réseau. Le prix est que leur
 * fraîcheur est celle du dépôt, d'où la réserve de péremption imposée à toute sortie.
 *
 * Les tables ne sont JAMAIS réécrites : rien ici ne ressemble à la boucle
 * d'auto-correction de §6.4, qui apprend du répertoire de CanLII.
 */

import { fold } from "../citation/normalize";
import { FORUMS, type Forum } from "./forums";
import { GREFFES, type Greffe } from "./greffes";
import { JURIDICTIONS, type Juridiction } from "./juridictions";
import { LIEUX_PAR_GREFFE, type LieuMjq } from "./lieux";
import { PALAIS, type Palais, type TypeLieu } from "./palais";

export function getGreffe(numero: string): Greffe | null {
  return GREFFES[numero] ?? null;
}

export function getJuridiction(numero: string): Juridiction | null {
  return JURIDICTIONS[numero] ?? null;
}

export function getPalais(clef: string): Palais | null {
  return PALAIS[clef] ?? null;
}

export function getForum(clef: string): Forum | null {
  return FORUMS[clef] ?? null;
}

/**
 * Lieux desservis par un greffe, d'après le relevé OFFICIEL du MJQ (2026-07-22).
 *
 * Un greffe en dessert souvent plusieurs — ce que `palais_key`, 1:1, ne peut pas dire.
 */
export function lieuxDuGreffe(numero: string): readonly LieuMjq[] {
  return LIEUX_PAR_GREFFE[numero] ?? [];
}

/**
 * Localités desservies EN COUR ITINÉRANTE par un greffe ; vide pour les autres.
 *
 * Source : la page officielle du MJQ, et non plus la seule liste d'Athéna — laquelle
 * ne couvrait que quatre greffes et ignorait Vaudreuil-Dorion (760) et Senneterre
 * (625). On retire le chef-lieu du greffe, qui n'est pas une localité « desservie »
 * mais le greffe lui-même.
 */
export function localitesItinerantes(numero: string): string[] {
  const chef = GREFFES[numero]?.palais_de_justice;
  return lieuxDuGreffe(numero)
    .filter((l) => l.itinerant && l.nom !== chef)
    .map((l) => l.nom);
}

/**
 * Siège FIXE d'un greffe d'après le MJQ — le lieu non itinérant, s'il en existe un
 * et qu'une adresse lui est connue.
 *
 * Sert à résoudre le cas que `palais_key` ne pouvait pas exprimer : le greffe 635
 * (Nunavik) n'avait aucune adresse alors que le Ministère lui rattache **Kuujjuaq**,
 * qui n'y est PAS itinérant. Athéna avait laissé Kuujjuaq orphelin faute de savoir à
 * quel greffe le rattacher, et refusait de le deviner ; la page officielle le dit.
 */
export function siegeFixe(numero: string): { clef: string; palais: Palais } | null {
  for (const lieu of lieuxDuGreffe(numero)) {
    if (lieu.itinerant) continue;
    for (const [clef, palais] of Object.entries(PALAIS)) {
      if (palais.name === lieu.nom) return { clef, palais };
    }
  }
  return null;
}

/**
 * Adresse d'un greffe, résolue par `palais_key`.
 *
 * ⚠ `null` signifie « adresse INCONNUE », jamais « il n'existe pas d'adresse ». Les
 *   appelants DOIVENT le formuler ainsi (§2) : six greffes sont concernés, dont quatre
 *   cours itinérantes qui siègent là où la cour se déplace.
 */
export function adresseDuGreffe(numero: string): Palais | null {
  const g = GREFFES[numero];
  if (!g) return null;
  if (g.palais_key) return PALAIS[g.palais_key] ?? null;
  // Rattrapage par le relevé du MJQ : `palais_key` ne nomme qu'UN bâtiment, alors
  // qu'un greffe en dessert plusieurs. C'est ce qui donne enfin une adresse au
  // greffe 635, dont le siège fixe est Kuujjuaq.
  return siegeFixe(numero)?.palais ?? null;
}

/** Numéros de greffe, triés. */
export function listerGreffes(): string[] {
  return Object.keys(GREFFES).sort();
}

/** Les 36 districts judiciaires, dédoublonnés et triés selon l'usage français. */
export function listerDistricts(): string[] {
  const vus = new Set<string>();
  for (const g of Object.values(GREFFES)) vus.add(g.district_judiciaire);
  return [...vus].sort((a, b) => a.localeCompare(b, "fr"));
}

export interface FiltrePalais {
  /** District judiciaire ; apparié sur la forme pliée (« quebec » trouve « Québec »). */
  district?: string;
  /** Texte libre : nom du palais, ville ou district. */
  query?: string;
  type?: TypeLieu;
}

/** Un palais et les greffes qui y siègent — l'unité que rendent les outils. */
export interface PalaisResolu {
  readonly clef: string;
  readonly palais: Palais;
  readonly greffes: ReadonlyArray<{ numero: string; greffe: Greffe }>;
}

/**
 * Greffes siégeant dans un palais donné.
 *
 * ⚠ JOINTURE PAR `palais_key`, JAMAIS PAR LE NOM : le greffe 615 dit « Val d'Or » et
 *   le palais « Val-d'Or » ; le greffe 150 dit « Saguenay (Chicoutimi) » et le palais
 *   « Chicoutimi ». Apparier les noms perdrait ces deux-là en silence.
 */
export function greffesDuPalais(clef: string): Array<{ numero: string; greffe: Greffe }> {
  const nom = PALAIS[clef]?.name;
  return Object.entries(GREFFES)
    .filter(([numero, g]) => {
      if (g.palais_key === clef) return true;
      // Rattachement OFFICIEL : le MJQ nomme des lieux qu'aucune `palais_key` ne
      // désigne. C'est ainsi que Kuujjuaq cesse d'être orphelin (greffe 635).
      return nom !== undefined && lieuxDuGreffe(numero).some((l) => l.nom === nom);
    })
    .map(([numero, greffe]) => ({ numero, greffe }))
    .sort((a, b) => a.numero.localeCompare(b.numero));
}

export function resoudrePalais(clef: string): PalaisResolu | null {
  const palais = PALAIS[clef];
  if (!palais) return null;
  return { clef, palais, greffes: greffesDuPalais(clef) };
}

/**
 * Répertoire filtré. Le tri suit le nom du palais en français, et non la clef ASCII :
 * « Îles » et « Sept-Îles » se rangent là où un lecteur francophone les cherche.
 */
export function listerPalais(filtre: FiltrePalais = {}): PalaisResolu[] {
  const district = filtre.district ? fold(filtre.district) : null;
  const query = filtre.query ? fold(filtre.query) : null;

  const sortie: PalaisResolu[] = [];
  for (const [clef, palais] of Object.entries(PALAIS)) {
    if (filtre.type && palais.location_type !== filtre.type) continue;
    const greffes = greffesDuPalais(clef);

    if (district) {
      const appariable = greffes.some((g) => fold(g.greffe.district_judiciaire) === district);
      if (!appariable) continue;
    }
    if (query) {
      const champs = [
        palais.name,
        palais.city,
        ...greffes.map((g) => g.greffe.district_judiciaire),
        ...greffes.map((g) => g.numero),
      ];
      if (!champs.some((c) => fold(c).includes(query))) continue;
    }
    sortie.push({ clef, palais, greffes });
  }
  return sortie.sort((a, b) => a.palais.name.localeCompare(b.palais.name, "fr"));
}

/**
 * Palais publiés qu'aucun greffe ne dessert.
 *
 * ⚠ IL N'Y EN A PLUS AUCUN depuis la réconciliation du 2026-07-30. Kuujjuaq était le
 *   seul cas : Athéna le laissait délibérément orphelin, refusant de le rattacher au
 *   jugé à un greffe itinérant du Nunavik. La page officielle du MJQ tranche — il
 *   relève du greffe **635**, et n'y est pas itinérant. Le rattachement repose donc
 *   sur une SOURCE, non sur une conjecture, et la fonction reste : un relevé ultérieur
 *   peut très bien réintroduire un lieu que nul greffe ne nomme.
 */
export function palaisOrphelins(): string[] {
  return Object.keys(PALAIS)
    .filter((clef) => greffesDuPalais(clef).length === 0)
    .sort();
}
