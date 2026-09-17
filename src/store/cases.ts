/**
 * Fiches de décisions : index de recherche ET cache (spécification §4.1, §4.2, D5/D6).
 *
 * Politique de fraîcheur : PERMANENTE. Intitulé, citation, date et numéro de dossier
 * ne changent pas une fois la décision rendue. Le rafraîchissement est forcé par
 * l'argument `refresh` des outils, jamais par un TTL.
 */

import type { CaseListItem, CaseMetadata } from "../canlii/types";
import { flattenCaseId, fold, normalizeNeutral } from "../citation/normalize";
import { parseCitation } from "../citation/parse";
import { batchWrite } from "./databases";

export interface CaseRow {
  id?: number;
  database_id: string;
  case_id: string;
  lang: string | null;
  title: string;
  title_norm: string;
  citation: string | null;
  neutral_cite: string | null;
  docket_number: string | null;
  decision_date: string | null;
  keywords: string | null;
  url: string | null;
  concatenated_id: string | null;
  source: string;
  fetched_at: string;
}

/** Provenance d'une fiche, pour distinguer le cache d'un balayage (§4.1). */
export type Source = "lookup" | "sweep" | "backfill";

/**
 * Extrait la forme neutre d'une chaîne de citation et la normalise.
 * « 2005 QCCA 304 (CanLII) » -> « 2005 QCCA 304 ». Null si aucune forme neutre.
 */
export function extractNeutral(citation: string | null | undefined): string | null {
  if (!citation) return null;
  const p = parseCitation(citation);
  const f = p.primary.kind === "neutral" ? p.primary : p.parallel.find((x) => x.kind === "neutral");
  return f && f.kind === "neutral" ? normalizeNeutral(f.year, f.code, f.number) : null;
}

/** Convertit une fiche complète de l'API en ligne de la table `cases`. */
export function rowFromMetadata(
  meta: CaseMetadata,
  fallback: { databaseId: string; caseId: string },
  source: Source,
  now: Date = new Date(),
): CaseRow {
  const flat = flattenCaseId(meta.caseId);
  const title = (meta.title ?? "").trim() || "(intitulé absent)";
  return {
    // ⚠ La ligne est clée par ce QUE L'ON A DEMANDÉ, pas par ce que CanLII renvoie.
    //
    //   L'API rend `caseId` sous la clef de SA langue : une fiche demandée à
    //   `caseBrowse/fr/csc-scc/2008scc9/` revient avec `caseId: {"fr": "2008csc9"}`.
    //   Clée sur la valeur renvoyée, la fiche serait rangée sous « 2008csc9 » alors que
    //   toute résolution ultérieure la cherche sous « 2008scc9 » : le cache ne
    //   servirait JAMAIS, chaque vérification rappellerait l'API, et `refresh` n'aurait
    //   plus de sens. Défaut trouvé par test/verify.test.ts (« un second appel
    //   identique ne fait aucun appel sortant »).
    //
    //   La langue sous laquelle CanLII a clé la fiche reste conservée dans `lang`, et
    //   `concatenated_id` porte la forme canonique — rien n'est perdu.
    database_id: fallback.databaseId || meta.databaseId || "",
    case_id: fallback.caseId || flat?.caseId || "",
    lang: flat?.lang ?? meta.language ?? null,
    title,
    title_norm: fold(title),
    citation: meta.citation ?? null,
    neutral_cite: extractNeutral(meta.citation),
    docket_number: meta.docketNumber ?? null,
    decision_date: meta.decisionDate ?? null,
    keywords: meta.keywords ?? null,
    url: meta.url ?? null,
    concatenated_id: meta.concatenatedId ?? null,
    source,
    fetched_at: now.toISOString(),
  };
}

/**
 * Convertit un élément de LISTE (balayage) en ligne. Les listes ne portent que
 * quatre champs — surtout pas de date ni d'hyperlien : c'est pourquoi une fiche
 * moissonnée reste plus pauvre qu'une fiche obtenue par résolution directe.
 */
export function rowFromListItem(
  item: CaseListItem,
  databaseId: string,
  lang: string,
  source: Source,
  now: Date = new Date(),
): CaseRow | null {
  const flat = flattenCaseId(item.caseId, lang);
  if (!flat) return null;
  const title = (item.title ?? "").trim() || "(intitulé absent)";
  const neutral = extractNeutral(item.citation);
  return {
    database_id: item.databaseId || databaseId,
    case_id: flat.caseId,
    lang: flat.lang,
    title,
    title_norm: fold(title),
    citation: item.citation ?? null,
    neutral_cite: neutral,
    docket_number: null,
    // ⚠ PAS DE DATE, ET RIEN À EN DÉDUIRE ICI. La réponse de liste n'en porte pas
    //   (annexe B), et ce champ vaut donc `null` — ce qu'il a toujours valu.
    //
    //   Le commentaire qui vivait à cette place affirmait que la date était « déduite
    //   de l'année de la citation neutre […] jamais affichée comme une date de
    //   décision ». Les DEUX moitiés étaient fausses : rien n'était déduit ici, et
    //   c'est l'APPELANT — `findCase`, puis `backfill` — qui posait un 1er janvier,
    //   affiché comme une date et persisté comme telle. Un commentaire qui décrit une
    //   intention plutôt que le code fait croire la garantie tenue ailleurs, et c'est
    //   précisément ce qui a permis au défaut de vivre. Corrigé le 2026-09-17.
    decision_date: null,
    keywords: null,
    url: null,
    concatenated_id: null,
    source,
    fetched_at: now.toISOString(),
  };
}

/**
 * INSERT ... ON CONFLICT DO UPDATE — JAMAIS `INSERT OR REPLACE`.
 *
 * ⚠ INVARIANT. REPLACE supprime puis réinsère : le rowid change, et l'index FTS5 en
 *   « external content » (qui référence `cases.id` via `content_rowid`) diverge en
 *   silence. Vérifié contre du vrai SQLite : le déclencheur `cases_au` maintient
 *   l'index correctement sur ce chemin-ci, et sur celui-là seulement.
 *
 * COALESCE sur les champs riches : un BALAYAGE (liste, 4 champs) ne doit pas écraser
 * une fiche déjà obtenue par RÉSOLUTION DIRECTE (12 champs) en y remettant des NULL.
 * Le cas se produit dès qu'on vérifie une citation puis qu'on balaie son tribunal.
 *
 * ⚠ LE SENS INVERSE COMPTE AUTANT, et c'est pourquoi une ligne de balayage DOIT porter
 *   `decision_date = NULL`. COALESCE fait gagner `excluded` dès qu'il est NON NUL : une
 *   date fabriquée par l'appelant n'appauvrit pas la fiche, elle ÉCRASE la vraie — sans
 *   rétrograder `source` (la règle ci-dessous joue alors CONTRE nous), et laisse une
 *   ligne corrompue parfaitement éligible à servir une vérification depuis le cache.
 *   Défaut réel, 1 819 lignes en production, corrigé le 2026-09-17 ; la garantie vit
 *   dans l'APPELANT, jamais ici, et c'est ce que le test de `tools.test.ts` épingle.
 *
 * `source` enregistre la MEILLEURE provenance atteinte, pas la dernière : une fiche
 * « lookup » recroisée par un balayage garde son étiquette. La rétrograder en « sweep »
 * ne perdrait aucun champ (COALESCE ci-dessus) mais disqualifierait la ligne partout
 * où seul « lookup » sert (lookupCase, get_case) — et chaque balayage qui recroise une
 * fiche résolue rachèterait l'appel. Un suivi quotidien à fenêtres chevauchantes
 * recroise TOUTES ses fiches à chaque passage : le cache ne servirait jamais.
 */
const UPSERT = `
INSERT INTO cases (database_id, case_id, lang, title, title_norm, citation, neutral_cite,
                   docket_number, decision_date, keywords, url, concatenated_id, source, fetched_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(database_id, case_id) DO UPDATE SET
  lang            = COALESCE(excluded.lang, cases.lang),
  title           = excluded.title,
  title_norm      = excluded.title_norm,
  citation        = COALESCE(excluded.citation, cases.citation),
  neutral_cite    = COALESCE(excluded.neutral_cite, cases.neutral_cite),
  docket_number   = COALESCE(excluded.docket_number, cases.docket_number),
  decision_date   = COALESCE(excluded.decision_date, cases.decision_date),
  keywords        = COALESCE(excluded.keywords, cases.keywords),
  url             = COALESCE(excluded.url, cases.url),
  concatenated_id = COALESCE(excluded.concatenated_id, cases.concatenated_id),
  source          = CASE WHEN cases.source = 'lookup' THEN 'lookup' ELSE excluded.source END,
  fetched_at      = excluded.fetched_at`;

function bindRow(stmt: D1PreparedStatement, r: CaseRow): D1PreparedStatement {
  return stmt.bind(
    r.database_id,
    r.case_id,
    r.lang,
    r.title,
    r.title_norm,
    r.citation,
    r.neutral_cite,
    r.docket_number,
    r.decision_date,
    r.keywords,
    r.url,
    r.concatenated_id,
    r.source,
    r.fetched_at,
  );
}

export async function upsertCase(db: D1Database, row: CaseRow): Promise<void> {
  try {
    await bindRow(db.prepare(UPSERT), row).run();
  } catch {
    // La persistance du cache ne doit jamais faire échouer une vérification : le
    // verdict est déjà établi, il serait absurde de le perdre sur une écriture.
  }
}

/** Persiste un lot de fiches moissonnées (§7.2 : lots de 100). */
export async function upsertCases(db: D1Database, rows: CaseRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  try {
    const stmt = db.prepare(UPSERT);
    await batchWrite(
      db,
      rows.map((r) => bindRow(stmt, r)),
    );
    return rows.length;
  } catch {
    return 0;
  }
}

export async function getCachedCase(
  db: D1Database,
  databaseId: string,
  caseId: string,
): Promise<CaseRow | null> {
  const r = await db
    .prepare("SELECT * FROM cases WHERE database_id = ? AND case_id = ?")
    .bind(databaseId, caseId)
    .first<CaseRow>();
  return r ?? null;
}

/**
 * Cherche la PREMIÈRE fiche en cache parmi plusieurs couples (database_id, case_id).
 *
 * Nécessaire parce que CanLII classe ses fiches sous un caseId propre à la langue
 * (« 2008csc9 ») qui n'est pas toujours celui que l'analyseur construit
 * (« 2008scc9 ») : n'interroger que l'identifiant construit ferait manquer le cache
 * indéfiniment. Voir `lookupCase` (src/store/lookup.ts).
 */
export async function getCachedAny(
  db: D1Database,
  couples: ReadonlyArray<readonly [string, string]>,
): Promise<CaseRow | null> {
  if (couples.length === 0) return null;
  const clauses = couples.map(() => "(database_id = ? AND case_id = ?)").join(" OR ");
  const binds = couples.flat();
  const r = await db
    .prepare(`SELECT * FROM cases WHERE ${clauses} LIMIT 1`)
    .bind(...binds)
    .first<CaseRow>();
  return r ?? null;
}

/**
 * Construit une requête FTS5 sûre à partir d'un texte libre.
 *
 * ⚠ Les entrées d'usager NE SONT JAMAIS passées telles quelles à `MATCH` : la syntaxe
 *   FTS5 réserve `"`, `*`, `^`, `-`, `NOT`, `AND`, `OR`, `NEAR`, et un intitulé de
 *   partie comme « Untel c. X-Y » lèverait une erreur de syntaxe. On plie, on découpe,
 *   et on cite chaque jeton — ce qui donne une conjonction de termes exacts.
 */
export function ftsQuery(texte: string): string | null {
  const jetons = fold(texte)
    .split(" ")
    .filter((t) => t.length > 1);
  if (jetons.length === 0) return null;
  return jetons.map((t) => `"${t.replace(/"/g, '""')}"`).join(" ");
}

export interface SearchOptions {
  databaseId?: string | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  limit?: number;
}

/**
 * Recherche dans l'index local, sur l'INTITULÉ et les mots-clés UNIQUEMENT.
 *
 * L'API de CanLII n'expose pas le texte des décisions : il n'existe aucun endpoint de
 * plein texte, et cet index ne peut donc rien contenir d'autre. Toute sortie d'outil
 * qui s'en sert doit le dire (§7.2).
 */
export async function searchLocal(
  db: D1Database,
  titre: string,
  opts: SearchOptions = {},
): Promise<CaseRow[]> {
  const q = ftsQuery(titre);
  if (!q) return [];
  const where: string[] = ["cases_fts MATCH ?"];
  const binds: unknown[] = [q];
  if (opts.databaseId) {
    where.push("c.database_id = ?");
    binds.push(opts.databaseId);
  }
  // La fenêtre de dates s'applique à `decision_date` quand elle existe, et sinon à
  // l'année lue dans la citation neutre — les fiches moissonnées n'ont pas de date.
  if (opts.yearFrom) {
    where.push("(c.decision_date >= ? OR (c.decision_date IS NULL AND c.neutral_cite >= ?))");
    binds.push(`${opts.yearFrom}-01-01`, `${opts.yearFrom}`);
  }
  if (opts.yearTo) {
    where.push("(c.decision_date <= ? OR (c.decision_date IS NULL AND c.neutral_cite <= ?))");
    binds.push(`${opts.yearTo}-12-31`, `${opts.yearTo}z`);
  }
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  try {
    const r = await db
      .prepare(
        `SELECT c.* FROM cases_fts f JOIN cases c ON c.id = f.rowid
         WHERE ${where.join(" AND ")}
         ORDER BY bm25(cases_fts), c.decision_date DESC
         LIMIT ?`,
      )
      .bind(...binds, limit)
      .all<CaseRow>();
    return r.results ?? [];
  } catch {
    // Une requête FTS malformée (jeton exotique) ne doit pas faire échouer l'outil :
    // on rend « rien trouvé localement » et le balayage vif prend le relais.
    return [];
  }
}

/**
 * Liste les fiches d'un tribunal, les plus récentes en tête.
 *
 * ⚠ AUCUN OUTIL NE S'EN SERT AUJOURD'HUI, et le commentaire d'origine disait le
 *   contraire — « §7.6, servi du cache ». `jurisprudence_browse_cases` appelle CanLII
 *   à chaque fois et ne lit jamais cette table : il n'existe aucun chemin où un
 *   balayage soit servi depuis le cache. Corrigé le 2026-09-16.
 *
 * Conservée pour le jour où §7.6 serait servi du cache, et tenue vivante par
 * `test/persist.test.ts` — qui est son SEUL appelant. Une fonction que seul son test
 * exerce n'est pas morte, mais elle n'est pas non plus en service : la distinction
 * doit se lire ici, pas se deviner.
 */
export async function listCases(
  db: D1Database,
  databaseId: string,
  limit: number,
  offset: number,
): Promise<CaseRow[]> {
  const r = await db
    .prepare(
      "SELECT * FROM cases WHERE database_id = ? ORDER BY decision_date DESC, case_id DESC LIMIT ? OFFSET ?",
    )
    .bind(databaseId, limit, offset)
    .all<CaseRow>();
  return r.results ?? [];
}
