/**
 * Télémétrie : `search_log` et `api_usage` (spécification §10).
 *
 * RÈGLE ABSOLUE : la télémétrie n'échoue JAMAIS l'outil qu'elle observe. Une table
 * absente (migration non appliquée), une écriture refusée, une base saturée : tout
 * est avalé. C'est le motif de `logSearch` du Worker `legislation` — un connecteur
 * juridique qui refuserait de répondre parce qu'il n'a pas pu écrire sa statistique
 * serait absurde.
 */

import type { CanliiUsage } from "../canlii/client";

export interface SearchLogEntry {
  tool: string;
  query: string;
  database_id?: string | null;
  lang?: string | null;
  result_count: number;
  /** Verdict de `jurisprudence_verify_citations` : CONFIRMÉE, INTROUVABLE, … */
  verdict?: string | null;
  /** Chemin de repli emprunté : 'lang_swap', 'split_db', 'unknown_court', 'sweep'… */
  fallback?: string | null;
}

/**
 * Consigne une invocation d'outil. UNE LIGNE PAR INVOCATION, y compris en cas de
 * succès : c'est la matière première du réglage de l'analyseur (§10). Les échecs
 * (`result_count = 0`) sont indexés séparément.
 */
export async function logSearch(db: D1Database, e: SearchLogEntry): Promise<void> {
  try {
    await db
      .prepare(
        "INSERT INTO search_log (tool, query, database_id, lang, result_count, verdict, fallback) VALUES (?,?,?,?,?,?,?)",
      )
      .bind(
        e.tool,
        e.query.slice(0, 400),
        e.database_id ?? null,
        e.lang ?? null,
        e.result_count,
        e.verdict ?? null,
        e.fallback ?? null,
      )
      .run();
  } catch {
    // Table absente ou écriture refusée : on n'échoue jamais.
  }
}

/** Consigne plusieurs entrées en un seul aller-retour (verify_citations, N citations). */
export async function logSearchBatch(db: D1Database, entries: SearchLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    const stmt = db.prepare(
      "INSERT INTO search_log (tool, query, database_id, lang, result_count, verdict, fallback) VALUES (?,?,?,?,?,?,?)",
    );
    await db.batch(
      entries.map((e) =>
        stmt.bind(
          e.tool,
          e.query.slice(0, 400),
          e.database_id ?? null,
          e.lang ?? null,
          e.result_count,
          e.verdict ?? null,
          e.fallback ?? null,
        ),
      ),
    );
  } catch {
    // idem
  }
}

/** Jour UTC au format `YYYY-MM-DD`, clef primaire d'`api_usage`. */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Verse les compteurs du client dans `api_usage`, UNE FOIS en fin d'invocation.
 *
 * ⚠ Écart assumé à la lettre de §10 (« incrémentée à chaque appel sortant »), commenté
 *   au commit : incrémenter par appel coûterait jusqu'à 40 écritures D1 par balayage
 *   pour une sémantique identique. Le client accumule, on verse une fois.
 */
export async function flushUsage(
  db: D1Database,
  usage: CanliiUsage,
  now: Date = new Date(),
): Promise<void> {
  if (usage.calls === 0 && usage.errors === 0 && usage.throttled === 0) return;
  try {
    await db
      .prepare(
        `INSERT INTO api_usage (day, calls, errors, throttled) VALUES (?,?,?,?)
         ON CONFLICT(day) DO UPDATE SET
           calls     = api_usage.calls     + excluded.calls,
           errors    = api_usage.errors    + excluded.errors,
           throttled = api_usage.throttled + excluded.throttled`,
      )
      .bind(utcDay(now), usage.calls, usage.errors, usage.throttled)
      .run();
  } catch {
    // idem
  }
}
