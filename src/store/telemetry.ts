/**
 * Télémétrie locale retirée à l'exécution en Phase 3 (`SPEC-SOCLE-COMMUN.md` §7, S13, S14, G9).
 *
 * Aucune écriture dans `search_log` ni `api_usage` n'a plus lieu à l'exécution : seuls
 * `compteur_jour` et `evenement_technique` (strictement sans contenu de requête) sont
 * enregistrés dans `DB_IDENTITE` via `ctx.waitUntil`. Les tables historiques demeurent
 * dans `migrations/` uniquement pour la reproductibilité des migrations D1 existantes.
 */

/** Jour UTC au format `YYYY-MM-DD`. */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
