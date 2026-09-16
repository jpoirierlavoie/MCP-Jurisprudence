/**
 * Comparaison d'intitulés (spécification §6.5). Module PUR.
 *
 * Règle cardinale : un APPARIEMENT PARTIEL produit le verdict DISCORDANTE, jamais
 * CONFIRMÉE. Mieux vaut un faux signalement qu'une fausse assurance — c'est le
 * contrat de vérité de §2 traduit en arithmétique.
 */

import { tokenSet, tokens } from "./normalize";

export type Appariement = "appariement" | "partiel" | "discordance";

export interface CompareResult {
  verdict: Appariement;
  /** Indice de Jaccard sur les jetons significatifs, arrondi au centième. */
  jaccard: number;
  /** Jetons du plus court absents du plus long (motif de la discordance). */
  manquants: string[];
}

/**
 * Un intitulé anonymisé (« Droit de la famille — 20495 », « Protection de la
 * jeunesse — 231234 ») ne contient AUCUN nom de partie : son seul discriminant est
 * le numéro de série.
 *
 * ⚠ Piège imposé au test par §6.5. Sans ce traitement, deux décisions anonymisées
 *   distinctes de la même série (« Droit de la famille — 20495 » et « … — 21830 »)
 *   partagent tous leurs jetons alphabétiques et s'apparient à tort ; à l'inverse,
 *   la même décision citée avec et sans son numéro se signalerait en discordance
 *   pour « absence de patronyme ». On compare donc les NUMÉROS d'abord.
 */
const ANONYMISE = /^(droit de la famille|protection de la jeunesse|adoption|dpj)\b/i;

function numeros(s: string): string[] {
  return tokens(s).filter((t) => /^\d+$/.test(t));
}

function estAnonymise(s: string): boolean {
  return ANONYMISE.test(s.trim());
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : Math.round((inter / union) * 100) / 100;
}

/**
 * Compare un intitulé attendu à l'intitulé obtenu de CanLII.
 *
 * Verdict, sur les jetons significatifs (§6.5) :
 *   - « appariement » si tous les jetons du plus court sont présents dans le plus long
 *     — ce qui rend l'INVERSION DES PARTIES sans effet, comme voulu ;
 *   - « partiel » si l'indice de Jaccard >= 0,5 ;
 *   - « discordance » sinon.
 */
export function compareTitles(attendu: string, obtenu: string): CompareResult {
  const a = tokenSet(attendu);
  const b = tokenSet(obtenu);
  const j = jaccard(a, b);

  // Intitulés anonymisés : le numéro tranche, dans un sens comme dans l'autre.
  if (estAnonymise(attendu) || estAnonymise(obtenu)) {
    const na = numeros(attendu);
    const nb = numeros(obtenu);
    if (na.length > 0 && nb.length > 0) {
      const commun = na.some((n) => nb.includes(n));
      return {
        verdict: commun ? "appariement" : "discordance",
        jaccard: j,
        manquants: commun ? [] : na.filter((n) => !nb.includes(n)),
      };
    }
    // Un seul des deux porte un numéro : on ne peut pas trancher par le numéro, on
    // retombe sur la comparaison de jetons ci-dessous plutôt que d'inventer un verdict.
  }

  const [court, long] = a.size <= b.size ? [a, b] : [b, a];
  const manquants = [...court].filter((t) => !long.has(t));

  if (court.size > 0 && manquants.length === 0) {
    return { verdict: "appariement", jaccard: j, manquants: [] };
  }
  if (j >= 0.5) {
    return { verdict: "partiel", jaccard: j, manquants };
  }
  return { verdict: "discordance", jaccard: j, manquants };
}

/**
 * Similarité d'intitulé sur [0, 1], employée par `jurisprudence_subsequent_history` pour
 * filtrer les décisions citantes (seuil §7.5 : >= 0,5).
 */
export function titleSimilarity(a: string, b: string): number {
  return jaccard(tokenSet(a), tokenSet(b));
}
