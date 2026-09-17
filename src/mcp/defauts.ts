/**
 * LES BORNES DE PAGINATION, EN UN SEUL EXEMPLAIRE.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ Ce fichier existe parce que la même valeur vivait à DEUX endroits : le       ║
 * ║ `?? 50` du gestionnaire, et le « défaut 25 » écrit dans la description que   ║
 * ║ le modèle lit. Les deux ont divergé sur TROIS outils sur cinq — et le        ║
 * ║ défaut n'a rien cassé : il a seulement fait annoncer au modèle une valeur    ║
 * ║ qui n'est pas celle qu'il obtient. Un outil qui déclare rendre 25 lignes et  ║
 * ║ en rend 50 fait budgéter de travers ; l'inverse fait croire à une            ║
 * ║ troncature qui n'a pas eu lieu.                                              ║
 * ║                                                                              ║
 * ║ La divergence a été INTRODUITE le 2026-09-16, en ajoutant les descriptions   ║
 * ║ manquantes : « défaut 25 » a été écrit partout, par analogie, sans lire le   ║
 * ║ gestionnaire. C'est le mode de panne exact que §2 décrit, appliqué à une     ║
 * ║ description au lieu d'un résultat — et il n'existait aucun test pour le      ║
 * ║ voir, puisque les deux surfaces ne se rencontraient nulle part.              ║
 * ║                                                                              ║
 * ║ Désormais elles se rencontrent ICI. La description est ENGENDRÉE depuis ces  ║
 * ║ constantes, le gestionnaire les LIT, et `test/garde.test.ts` confronte le    ║
 * ║ nombre écrit dans chaque description à la constante.                         ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠ Ces valeurs ne sont PAS uniformes, et ne doivent pas être « harmonisées » :
 *   `find_case` rend peu parce que chaque fiche est longue et qu'un balayage vif
 *   coûte des appels ; `citator` rend beaucoup parce que ses lignes sont brèves et
 *   qu'une liste tronquée de renvois est peu utile ; `subsequent_history` EXAMINE
 *   20 décisions citantes, ce qui n'est pas un nombre de résultats mais un budget
 *   de travail. Chaque écart a un motif.
 */

/** Bornes d'un paramètre `limit` : valeur par défaut et maximum accepté. */
export interface BornesListe {
  readonly defaut: number;
  readonly max: number;
}

export const LIMITES = {
  find_case: { defaut: 10, max: 25 },
  citator: { defaut: 50, max: 100 },
  subsequent_history: { defaut: 20, max: 50 },
  browse_cases: { defaut: 25, max: 100 },
  browse_legislation: { defaut: 50, max: 100 },
} as const satisfies Record<string, BornesListe>;

/** `offset` vaut 0 partout, et son maximum est commun. */
export const OFFSET_DEFAUT = 0;
export const OFFSET_MAX = 100000;
