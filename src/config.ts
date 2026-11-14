/**
 * Lecture des variables de configuration du Worker.
 *
 * ⚠ POURQUOI CE MODULE EXISTE. `wrangler types` type les `vars` comme des LITTÉRAUX
 *   ("true", "false", "250"…) plutôt que comme des `string`. Écrit naïvement,
 *   `env.BACKFILL_ENABLED === "true"` ne compile alors PAS — TypeScript objecte que
 *   les types `"false"` et `"true"` ne se recoupent pas — et, pire, un coupe-circuit
 *   comme `env.MCP_ENABLED === "true"` se réduit à une constante aux yeux du lecteur
 *   comme du compilateur, alors que la valeur réelle vient du déploiement.
 *
 *   `wrangler types --strict-vars=false` élargit ces types, mais le fichier généré
 *   est gitignoré et régénéré par n'importe quelle commande wrangler : s'en remettre
 *   au drapeau, c'est s'en remettre à ce que personne ne lance jamais la commande
 *   sans lui. Le passage par `String()` ci-dessous efface le type littéral et rend le
 *   code correct dans les deux cas.
 */

import { drapeau } from "@poirierlavoie/socle-juridique";

/** Lit un drapeau booléen. Absent ou illisible => la valeur par défaut. */
export function flag(value: string | undefined, defaut = false): boolean {
  return drapeau(value, defaut);
}

/** Lit un entier positif. Absent ou illisible => la valeur par défaut. */
export function entier(value: string | undefined, defaut: number): number {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : defaut;
}

/** Lit une liste séparée par des virgules, vidée de ses entrées vides. */
export function liste(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Coupe-circuit (§8) : toute route MCP renvoie 404 quand il est baissé. */
export function mcpActif(env: Env): boolean {
  return flag(env.MCP_ENABLED, false);
}

/** Persister en D1 les fiches moissonnées lors d'un balayage (D6). */
export function persisterBalayages(env: Env): boolean {
  return flag(env.PERSIST_SWEEPS, true);
}

/**
 * Moissonnage planifié (§11). FAUX par défaut, et à ne pas basculer avant la
 * détermination de §16.1 auprès de CanLII.
 */
export function moissonnageActif(env: Env): boolean {
  return flag(env.BACKFILL_ENABLED, false);
}
