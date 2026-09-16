/**
 * Arêtes du citateur (spécification §4.1, §4.2, §7.4).
 *
 * Politique de fraîcheur différenciée, et le motif est juridique, pas technique :
 *   - `cited` et `legislation` : PERMANENT. Ce qu'une décision cite est figé au jour
 *     de son prononcé et ne changera plus jamais.
 *   - `citing` : 30 JOURS. Cette liste croît indéfiniment — une décision de principe
 *     accumule des citations pendant des décennies.
 *
 * `citator_state` distingue « la liste est VIDE » de « on n'a JAMAIS demandé ». Sans
 * cette table, une décision que personne ne cite serait réinterrogée à chaque appel.
 */

import type { CanliiClient } from "../canlii/client";
import type { CaseListItem, LegislationListItem } from "../canlii/types";
import { type CitatorRel, type CitedLegislationsResponse, METADATA_TYPE } from "../canlii/types";
import { flattenCaseId } from "../citation/normalize";
import { batchWrite } from "./databases";

export interface EdgeRow {
  from_database_id: string;
  from_case_id: string;
  rel: CitatorRel;
  to_database_id: string | null;
  to_case_id: string | null;
  to_legislation_id: string | null;
  to_title: string | null;
  to_citation: string | null;
  fetched_at: string;
}

const TTL_CITING_MS = 30 * 86_400_000;

/** Une arête `citing` de plus de 30 jours est périmée ; les autres, jamais. */
export function edgeStale(rel: CitatorRel, fetchedAt: string, now: Date = new Date()): boolean {
  if (rel !== "citing") return false;
  const age = now.getTime() - Date.parse(fetchedAt);
  return !Number.isFinite(age) || age > TTL_CITING_MS;
}

export interface CachedEdges {
  edges: EdgeRow[];
  fetchedAt: string;
}

/**
 * Lit les arêtes en cache. Rend `null` si la relation n'a JAMAIS été demandée —
 * distinct d'un tableau vide, qui signifie « demandée, et il n'y en a aucune ».
 */
export async function getCachedEdges(
  db: D1Database,
  databaseId: string,
  caseId: string,
  rel: CitatorRel,
): Promise<CachedEdges | null> {
  const state = await db
    .prepare(
      "SELECT edge_count, fetched_at FROM citator_state WHERE database_id = ? AND case_id = ? AND rel = ?",
    )
    .bind(databaseId, caseId, rel)
    .first<{ edge_count: number; fetched_at: string }>();
  if (!state) return null;
  const r = await db
    .prepare(
      "SELECT * FROM citator_edges WHERE from_database_id = ? AND from_case_id = ? AND rel = ? ORDER BY rowid",
    )
    .bind(databaseId, caseId, rel)
    .all<EdgeRow>();
  return { edges: r.results ?? [], fetchedAt: state.fetched_at };
}

/** Remplace intégralement les arêtes d'une relation et note l'état de moisson. */
export async function replaceEdges(
  db: D1Database,
  databaseId: string,
  caseId: string,
  rel: CitatorRel,
  edges: EdgeRow[],
  now: Date = new Date(),
): Promise<void> {
  const ts = now.toISOString();
  try {
    await db
      .prepare(
        "DELETE FROM citator_edges WHERE from_database_id = ? AND from_case_id = ? AND rel = ?",
      )
      .bind(databaseId, caseId, rel)
      .run();

    if (edges.length > 0) {
      const stmt = db.prepare(
        `INSERT INTO citator_edges (from_database_id, from_case_id, rel, to_database_id,
           to_case_id, to_legislation_id, to_title, to_citation, fetched_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      );
      await batchWrite(
        db,
        edges.map((e) =>
          stmt.bind(
            e.from_database_id,
            e.from_case_id,
            e.rel,
            e.to_database_id,
            e.to_case_id,
            e.to_legislation_id,
            e.to_title,
            e.to_citation,
            ts,
          ),
        ),
      );
    }

    await db
      .prepare(
        `INSERT INTO citator_state (database_id, case_id, rel, edge_count, fetched_at)
         VALUES (?,?,?,?,?)
         ON CONFLICT(database_id, case_id, rel) DO UPDATE SET
           edge_count = excluded.edge_count, fetched_at = excluded.fetched_at`,
      )
      .bind(databaseId, caseId, rel, edges.length, ts)
      .run();
  } catch {
    // Le cache du citateur n'est pas la réponse : on rend les arêtes obtenues même si
    // on n'a pas su les persister.
  }
}

/**
 * Interroge le citateur.
 *
 * ⚠ CONTRAINTE DE L'API CODÉE EN DUR (annexe B) : le chemin du citateur n'accepte QUE
 *   `en` comme segment de langue. On construit donc `caseCitator/en/…` quelle que soit
 *   la langue demandée, et l'on rend malgré tout la sortie en français. C'est aussi
 *   pourquoi `jurisprudence_citator` n'expose aucun paramètre `lang` : il serait mensonger.
 */
export async function fetchEdges(
  client: CanliiClient,
  databaseId: string,
  caseId: string,
  rel: CitatorRel,
  now: Date = new Date(),
): Promise<EdgeRow[]> {
  const metadataType = METADATA_TYPE[rel];
  const payload = await client.get<Record<string, unknown>>(
    `caseCitator/en/${databaseId}/${caseId}/${metadataType}`,
  );
  const ts = now.toISOString();

  if (rel === "legislation") {
    const items = ((payload as CitedLegislationsResponse).citedLegislations ??
      []) as LegislationListItem[];
    return items.map((it) => ({
      from_database_id: databaseId,
      from_case_id: caseId,
      rel,
      to_database_id: it.databaseId ?? null,
      to_case_id: null,
      to_legislation_id: it.legislationId ?? null,
      to_title: it.title ?? null,
      to_citation: it.citation ?? null,
      fetched_at: ts,
    }));
  }

  const items = (payload[metadataType] ?? []) as CaseListItem[];
  return items.map((it) => {
    const flat = flattenCaseId(it.caseId);
    return {
      from_database_id: databaseId,
      from_case_id: caseId,
      rel,
      to_database_id: it.databaseId ?? null,
      to_case_id: flat?.caseId ?? null,
      to_legislation_id: null,
      to_title: it.title ?? null,
      to_citation: it.citation ?? null,
      fetched_at: ts,
    };
  });
}
