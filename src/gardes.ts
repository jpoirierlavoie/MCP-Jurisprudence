/**
 * Les codes de mise en garde de CE connecteur.
 *
 * ⚠ LES TEXTES SONT IMPORTÉS, PAS RECOPIÉS, et c'est la propriété qui fait tenir ce
 *   fichier. Chaque `texte` ci-dessous EST la constante que `src/format/render.ts` sert
 *   déjà dans la prose — le même objet, pas une copie fidèle. La prose et la réserve
 *   structurée ne peuvent donc pas diverger : il n'y a rien à synchroniser.
 *
 *   Le dépôt jumeau `legislation` a recopié ses cinq textes et ne tient la parité que par
 *   un test de provenance. C'est une garde de plus à maintenir, et une divergence de plus
 *   à attendre. Ici la question ne se pose pas.
 *
 * ⚠ AUCUNE RÉSERVE N'EST RÉDIGÉE ICI. Toutes existaient, écrites par le praticien, et sont
 *   promues telles quelles. Rédiger une réserve NEUVE est une décision éditoriale, donc du
 *   ressort de l'avocat (invariant 16). Le seul code dont le libellé n'avait pas de
 *   correspondant au socle — `VERSION_NON_INSTRUMENT` — reprend lui aussi une prose
 *   existante mot pour mot.
 *
 * ⚠ LES CODES SUIVENT LES TEXTES, NON LA TAXONOMIE DU SOCLE. La §8.4 de
 *   `SPEC-SOCLE-COMMUN.md` range quatorze codes par TYPE de réserve ; plusieurs de nos
 *   textes en disent deux ou trois à la fois (`GARDE_VERIFICATION` dit à lui seul
 *   « métadonnées seulement », « aucun historique d'appel » et « aucun indicateur de
 *   traitement »). Découper un texte pour le faire entrer dans trois codes serait le
 *   réécrire. On garde donc un code par texte servi, et la correspondance avec la §8.4 est
 *   notée en commentaire sur chacun.
 *
 * LA MÉTHODE DES SÉVÉRITÉS, arrêtée le 2026-09-17 :
 *   · `avertissement` — le mode de panne est une FAUSSE ASSURANCE à conséquence
 *     déontologique ou procédurale : une citation servie comme confirmée sans l'être, une
 *     décision réputée inexistante alors qu'on n'a rien constaté, une signification à une
 *     adresse périmée. C'est le vocabulaire du cartouche de `render.ts` — « un vérificateur
 *     de citations qui promet plus qu'il ne tient est pire qu'aucun outil ».
 *   · `reserve` — la garde BORNE l'étendue de ce qui est établi, sans permettre une
 *     conclusion fausse : heuristique, résultat partiel, hypothèse non confirmée.
 *   · `information` — elle décrit la donnée ou sa provenance sans rien changer à ce que le
 *     résultat établit.
 *
 * TROIS ÉCARTS ARBITRÉS PAR L'AVOCAT le 2026-09-17, et consignés parce qu'ils divergent de
 * la §8.4 ou la précisent — voir chaque code.
 *
 * CE QUI N'EST PAS ENCORE ICI : `MARQUEUR_RECONCILIATION`. La constante ne porte que
 * « ⚠ RÉCONCILIATION REQUISE » ; le texte qui RÉSERVE quelque chose est resté en littéral
 * dans `listDatabases.ts`, il est conditionnel, et il interpole. Le promouvoir demande
 * d'abord de l'extraire — geste séparé, et sans lui ce code serait une réserve muette.
 */

import { declarerRegistre } from "@poirierlavoie/socle-juridique";

import {
  DIAGNOSTIC_SEULEMENT,
  ETRANGLEMENT_RESULTAT_PARTIEL,
  ETRANGLEMENT_SANS_PERTE,
  EXPLICATION_INDETERMINEE,
  EXPLICATIONS_INTROUVABLE,
  GARDE_CITATEUR,
  GARDE_DIFFUSION,
  GARDE_DOSSIER,
  GARDE_PALAIS,
  GARDE_RECHERCHE,
  GARDE_SANS_ADRESSE,
  GARDE_SORTS_PIED,
  GARDE_SORTS_TETE,
  GARDE_VERIFICATION,
  GARDE_VERSION_LEGISLATIVE,
  LEGISLATION_METADONNEES,
  LEGISLATION_METADONNEES_LISTE,
  LISTES_SANS_FICHE,
  SANS_PLUMITIF,
  TEXTE_NON_EXPOSE,
} from "./format/render";

export type CodeGarde =
  | "VERIFICATION_SANS_AUTORITE"
  | "RECHERCHE_SUR_INTITULE"
  | "SORTS_HEURISTIQUES"
  | "SORTS_SANS_SENS"
  | "CITATEUR_BRUT"
  | "VERSION_NON_INSTRUMENT"
  | "DIFFUSION_DIFFEREE"
  | "EXPLICATIONS_INTROUVABLE"
  | "CONSTAT_INDETERMINE"
  | "ADRESSE_PERISSABLE"
  | "SANS_ADRESSE_PUBLIEE"
  | "NOMENCLATURE_SEULEMENT"
  | "SANS_PLUMITIF"
  | "ETRANGLEMENT_SANS_PERTE"
  | "ETRANGLEMENT_RESULTAT_PARTIEL"
  | "LISTES_SANS_FICHE"
  | "TEXTE_NON_EXPOSE"
  | "LEGISLATION_METADONNEES"
  | "LEGISLATION_METADONNEES_LISTE"
  | "DIAGNOSTIC_SEULEMENT";

export const GARDES = declarerRegistre<CodeGarde>({
  /**
   * §8.4 : `METADONNEES_SEULEMENT` + `AUCUN_HISTORIQUE_APPEL` + `AUCUN_INDICATEUR_TRAITEMENT`
   * — les trois dans un seul texte, ce qui est le motif du découpage par texte.
   */
  VERIFICATION_SANS_AUTORITE: {
    code: "VERIFICATION_SANS_AUTORITE",
    severite: "avertissement",
    texte: GARDE_VERIFICATION,
  },

  /** §8.4 : `METADONNEES_SEULEMENT`. */
  RECHERCHE_SUR_INTITULE: {
    code: "RECHERCHE_SUR_INTITULE",
    severite: "avertissement",
    texte: GARDE_RECHERCHE,
  },

  /**
   * §8.4 : `REPERAGE_HEURISTIQUE`, dont la colonne « Où » ne nommait que des outils de
   * `legislation`. Elle s'étend ici : le texte dit mot pour mot « INDICE HEURISTIQUE ».
   */
  SORTS_HEURISTIQUES: {
    code: "SORTS_HEURISTIQUES",
    severite: "reserve",
    texte: GARDE_SORTS_TETE,
  },

  /**
   * §8.4 : `AUCUN_HISTORIQUE_APPEL` + `AUCUN_INDICATEUR_TRAITEMENT`.
   *
   * ⚠ ÉCART ARBITRÉ (1/3). Plus sévère que la tête du même outil, qui reste `reserve`. Ce
   *   sont deux actes de langage distincts : la tête dit « ceci est un indice », le pied dit
   *   ce que le résultat N'ÉTABLIT PAS — « ce n'est pas un citateur professionnel ». Se fier
   *   à des sorts ultérieurs pour juger de l'autorité d'un arrêt est une fausse assurance à
   *   conséquence déontologique, pas un simple bornage.
   */
  SORTS_SANS_SENS: {
    code: "SORTS_SANS_SENS",
    severite: "avertissement",
    texte: GARDE_SORTS_PIED,
  },

  /** §8.4 : `AUCUN_INDICATEUR_TRAITEMENT`. */
  CITATEUR_BRUT: {
    code: "CITATEUR_BRUT",
    severite: "avertissement",
    texte: GARDE_CITATEUR,
  },

  /**
   * LE QUINZIÈME CODE — aucun des quatorze de la §8.4 ne le couvre, et le trou est réel.
   *
   * Ce n'est pas `TEXTE_A_VERIFIER` (aucun texte n'est servi ici) ni
   * `METADONNEES_SEULEMENT` (le problème n'est pas l'absence du texte). Le problème est que
   * la métadonnée DATE autre chose que ce que le lecteur croit : observé en production le
   * 2026-09-17, le Code civil du Québec servi avec `startDate = 2026-02-24` sous régime
   * « ENTRY_INTO_FORCE », alors qu'il est en vigueur depuis 1994. Les deux lignes étaient
   * individuellement vraies et se lisaient ensemble comme le contraire de la vérité.
   *
   * Libellé PROMU mot pour mot de `GARDE_VERSION_LEGISLATIVE` : aucune rédaction neuve.
   */
  VERSION_NON_INSTRUMENT: {
    code: "VERSION_NON_INSTRUMENT",
    severite: "avertissement",
    texte: GARDE_VERSION_LEGISLATIVE,
  },

  /** §8.4 : `COUVERTURE_CANLII`. Conditionnelle — seulement sous un filtre de diffusion. */
  DIFFUSION_DIFFEREE: {
    code: "DIFFUSION_DIFFEREE",
    severite: "reserve",
    texte: GARDE_DIFFUSION,
  },

  /** §8.4 : `ABSENCE_NON_PROBANTE`. */
  EXPLICATIONS_INTROUVABLE: {
    code: "EXPLICATIONS_INTROUVABLE",
    severite: "avertissement",
    texte: EXPLICATIONS_INTROUVABLE,
  },

  /**
   * §8.4 : `ABSENCE_NON_PROBANTE`, dans sa forme la plus forte — ici on n'a RIEN constaté,
   * ce qui est pire qu'un constat négatif et se confond facilement avec lui.
   */
  CONSTAT_INDETERMINE: {
    code: "CONSTAT_INDETERMINE",
    severite: "avertissement",
    texte: EXPLICATION_INDETERMINEE,
  },

  /** §8.4 : `ADRESSE_PERISSABLE` + `TABLE_LOCALE_DATEE` (la date est dans le texte). */
  ADRESSE_PERISSABLE: {
    code: "ADRESSE_PERISSABLE",
    severite: "avertissement",
    texte: GARDE_PALAIS,
  },

  /**
   * §8.4 : `SANS_ADRESSE_PUBLIEE`, classé `information` au socle.
   *
   * ⚠ ÉCART ARBITRÉ (2/3), et assumé. Le dommage nommé n'est pas une lacune de donnée :
   *   c'est qu'un praticien RENONCE à une démarche possible. Ce dépôt traite déjà
   *   « inconnu ≠ inexistant » comme le pendant exact de la règle INTROUVABLE (invariant 17,
   *   `src/qc/greffes.ts`), et les six greffes visés y sont nommés. La ligne brute
   *   « Aucune adresse publiée n'est rattachée au greffe N » reste, elle, une information :
   *   c'est la réserve qui la suit qui porte la charge.
   */
  SANS_ADRESSE_PUBLIEE: {
    code: "SANS_ADRESSE_PUBLIEE",
    severite: "avertissement",
    texte: GARDE_SANS_ADRESSE,
  },

  /** Sans correspondant direct à la §8.4 : la nomenclature n'y est pas prévue. */
  NOMENCLATURE_SEULEMENT: {
    code: "NOMENCLATURE_SEULEMENT",
    severite: "avertissement",
    texte: GARDE_DOSSIER,
  },

  /** Le pendant du précédent : aucun registre consulté, aucun plumitif. */
  SANS_PLUMITIF: {
    code: "SANS_PLUMITIF",
    severite: "avertissement",
    texte: SANS_PLUMITIF,
  },

  /**
   * ⚠ ÉCART ARBITRÉ (3/3) : DEUX codes pour une seule fonction, et c'est délibéré.
   *
   * `render.ts` le dit de lui-même — « CE N'EST PAS UNE MISE EN GARDE DE §2 […] Elle parle
   * de RYTHME ». Les appels étranglés ont été rejoués ; le résultat n'est ni tronqué ni
   * affaibli. `information`, donc.
   */
  ETRANGLEMENT_SANS_PERTE: {
    code: "ETRANGLEMENT_SANS_PERTE",
    severite: "information",
    texte: ETRANGLEMENT_SANS_PERTE,
  },

  /**
   * L'autre variante, et elle BORNE : « son étendue réelle n'est pas connue ». Les fondre
   * en un code unique reperdrait une distinction payée par un défaut réel du 2026-09-17 —
   * la phrase de réassurance servie sous un balayage interrompu affirmait d'un résultat
   * incomplet qu'il ne l'était pas. §8.4 : `RESULTAT_PARTIEL`.
   */
  ETRANGLEMENT_RESULTAT_PARTIEL: {
    code: "ETRANGLEMENT_RESULTAT_PARTIEL",
    severite: "reserve",
    texte: ETRANGLEMENT_RESULTAT_PARTIEL,
  },

  /** Décrit ce que la source ne porte pas ; n'infirme aucun résultat. */
  LISTES_SANS_FICHE: {
    code: "LISTES_SANS_FICHE",
    severite: "information",
    texte: LISTES_SANS_FICHE,
  },

  /** §8.4 : `METADONNEES_SEULEMENT`. */
  TEXTE_NON_EXPOSE: {
    code: "TEXTE_NON_EXPOSE",
    severite: "avertissement",
    texte: TEXTE_NON_EXPOSE,
  },

  /** §8.4 : `METADONNEES_SEULEMENT`, versant législatif. */
  LEGISLATION_METADONNEES: {
    code: "LEGISLATION_METADONNEES",
    severite: "avertissement",
    texte: LEGISLATION_METADONNEES,
  },

  /** Le texte VOISIN du précédent, et distinct : un code par texte servi. */
  LEGISLATION_METADONNEES_LISTE: {
    code: "LEGISLATION_METADONNEES_LISTE",
    severite: "avertissement",
    texte: LEGISLATION_METADONNEES_LISTE,
  },

  /** §8.4 : `ABSENCE_NON_PROBANTE` — l'outil n'établit RIEN sur l'existence. */
  DIAGNOSTIC_SEULEMENT: {
    code: "DIAGNOSTIC_SEULEMENT",
    severite: "avertissement",
    texte: DIAGNOSTIC_SEULEMENT,
  },
});
