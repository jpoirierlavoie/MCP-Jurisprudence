import type { CaseListItem, CaseMetadata, Lang } from "../canlii/types";
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
  title_fr: string | null;
  title_en: string | null;
  citation: string | null;
  neutral_cite: string | null;
  docket_number: string | null;
  decision_date: string | null;
  keywords: string | null;
  keywords_fr: string | null;
  keywords_en: string | null;
  url: string | null;
  url_fr: string | null;
  url_en: string | null;
  concatenated_id: string | null;
  source: string;
  fetched_at: string;
}

type Source = "lookup" | "sweep";

export function extractNeutral(citation: string | null | undefined): string | null {
  if (!citation) return null;
  const p = parseCitation(citation);
  const f = p.primary.kind === "neutral" ? p.primary : p.parallel.find((x) => x.kind === "neutral");
  return f && f.kind === "neutral" ? normalizeNeutral(f.year, f.code, f.number) : null;
}

export function rowFromMetadata(
  meta: CaseMetadata,
  fallback: { databaseId: string; caseId: string },
  source: Source,
  now: Date = new Date(),
  requestedLang?: Lang,
): CaseRow {
  const flat = flattenCaseId(meta.caseId);
  const title = (meta.title ?? "").trim() || "(intitulé absent)";
  const langDetectee = flat?.lang ?? meta.language ?? null;
  const effectiveLang: Lang | null =
    requestedLang ?? (langDetectee === "en" ? "en" : langDetectee === "fr" ? "fr" : null);
  const keywords = meta.keywords ?? null;
  const url = meta.url ?? null;
  return {
    database_id: fallback.databaseId || meta.databaseId || "",
    case_id: fallback.caseId || flat?.caseId || "",
    lang: langDetectee ?? effectiveLang,
    title,
    title_norm: fold(title),
    title_fr: effectiveLang === "fr" ? title : null,
    title_en: effectiveLang === "en" ? title : null,
    citation: meta.citation ?? null,
    neutral_cite: extractNeutral(meta.citation),
    docket_number: meta.docketNumber ?? null,
    decision_date: meta.decisionDate ?? null,
    keywords,
    keywords_fr: effectiveLang === "fr" ? keywords : null,
    keywords_en: effectiveLang === "en" ? keywords : null,
    url,
    url_fr: effectiveLang === "fr" ? url : null,
    url_en: effectiveLang === "en" ? url : null,
    concatenated_id: meta.concatenatedId ?? null,
    source,
    fetched_at: now.toISOString(),
  };
}

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
    title_fr: null,
    title_en: null,
    citation: item.citation ?? null,
    neutral_cite: neutral,
    docket_number: null,
    decision_date: null,
    keywords: null,
    keywords_fr: null,
    keywords_en: null,
    url: null,
    url_fr: null,
    url_en: null,
    concatenated_id: null,
    source,
    fetched_at: now.toISOString(),
  };
}

export function hasLangCached(row: CaseRow, lang: Lang): boolean {
  return (lang === "en" ? row.title_en : row.title_fr) != null;
}

export function projectCaseForLang(row: CaseRow, lang: Lang): CaseRow {
  if (lang === "en") {
    const hasEn = row.title_en != null;
    const title = hasEn ? row.title_en! : row.title;
    return {
      ...row,
      title,
      title_norm: fold(title),
      url: hasEn ? (row.url_en ?? row.url) : row.url,
      keywords: hasEn ? (row.keywords_en ?? null) : row.keywords,
    };
  }
  const hasFr = row.title_fr != null;
  const title = hasFr ? row.title_fr! : row.title;
  return {
    ...row,
    title,
    title_norm: fold(title),
    url: hasFr ? (row.url_fr ?? row.url) : row.url,
    keywords: hasFr ? (row.keywords_fr ?? null) : row.keywords,
  };
}

export function titleForLang(row: CaseRow, lang: Lang): string | null {
  if (lang === "en") {
    return row.title_en ?? (row.lang === "en" ? row.title : null);
  }
  return row.title_fr ?? (row.lang === "fr" ? row.title : null);
}

export function collectCaseTitles(row: Pick<CaseRow, "title" | "title_fr" | "title_en">): string[] {
  const vus = new Set<string>();
  for (const t of [row.title, row.title_fr, row.title_en]) {
    if (typeof t === "string" && t.trim().length > 0) vus.add(t);
  }
  return [...vus];
}

const UPSERT = `
INSERT INTO cases (database_id, case_id, lang, title, title_norm, title_fr, title_en,
                   citation, neutral_cite, docket_number, decision_date,
                   keywords, keywords_fr, keywords_en, url, url_fr, url_en,
                   concatenated_id, source, fetched_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(database_id, case_id) DO UPDATE SET
  lang            = COALESCE(excluded.lang, cases.lang),
  title           = excluded.title,
  title_norm      = excluded.title_norm,
  title_fr        = COALESCE(excluded.title_fr, cases.title_fr),
  title_en        = COALESCE(excluded.title_en, cases.title_en),
  citation        = COALESCE(excluded.citation, cases.citation),
  neutral_cite    = COALESCE(excluded.neutral_cite, cases.neutral_cite),
  docket_number   = COALESCE(excluded.docket_number, cases.docket_number),
  decision_date   = COALESCE(excluded.decision_date, cases.decision_date),
  keywords        = COALESCE(excluded.keywords, cases.keywords),
  keywords_fr     = COALESCE(excluded.keywords_fr, cases.keywords_fr),
  keywords_en     = COALESCE(excluded.keywords_en, cases.keywords_en),
  url             = COALESCE(excluded.url, cases.url),
  url_fr          = COALESCE(excluded.url_fr, cases.url_fr),
  url_en          = COALESCE(excluded.url_en, cases.url_en),
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
    r.title_fr,
    r.title_en,
    r.citation,
    r.neutral_cite,
    r.docket_number,
    r.decision_date,
    r.keywords,
    r.keywords_fr,
    r.keywords_en,
    r.url,
    r.url_fr,
    r.url_en,
    r.concatenated_id,
    r.source,
    r.fetched_at,
  );
}

export async function upsertCase(db: D1Database, row: CaseRow): Promise<void> {
  try {
    await bindRow(db.prepare(UPSERT), row).run();
  } catch {}
}

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

export async function getCachedCandidates(
  db: D1Database,
  couples: ReadonlyArray<readonly [string, string]>,
): Promise<CaseRow[]> {
  if (couples.length === 0) return [];
  const clauses = couples.map(() => "(database_id = ? AND case_id = ?)").join(" OR ");
  const binds = couples.flat();
  const r = await db
    .prepare(`SELECT * FROM cases WHERE ${clauses}`)
    .bind(...binds)
    .all<CaseRow>();
  return r.results ?? [];
}

export async function getCachedBatch(
  db: D1Database,
  couples: ReadonlyArray<readonly [string, string]>,
): Promise<Map<string, CaseRow>> {
  const parClef = new Map<string, CaseRow>();
  if (couples.length === 0) return parClef;
  const uniques: Array<readonly [string, string]> = [];
  const vus = new Set<string>();
  for (const [dbId, cId] of couples) {
    const clef = `${dbId}/${cId}`;
    if (vus.has(clef)) continue;
    vus.add(clef);
    uniques.push([dbId, cId]);
  }
  const PAR_LOT = 40;
  for (let i = 0; i < uniques.length; i += PAR_LOT) {
    const lot = uniques.slice(i, i + PAR_LOT);
    const clauses = lot.map(() => "(database_id = ? AND case_id = ?)").join(" OR ");
    const r = await db
      .prepare(`SELECT * FROM cases WHERE ${clauses}`)
      .bind(...lot.flat())
      .all<CaseRow>();
    for (const row of r.results ?? []) {
      parClef.set(`${row.database_id}/${row.case_id}`, row);
    }
  }
  return parClef;
}

export function ftsQuery(texte: string): string | null {
  const jetons = fold(texte)
    .split(" ")
    .filter((t) => t.length > 1);
  if (jetons.length === 0) return null;
  return jetons.map((t) => `"${t.replace(/"/g, '""')}"`).join(" ");
}

export function anneeInferee(row: Pick<CaseRow, "decision_date" | "case_id">): number {
  const s = row.decision_date?.slice(0, 4) ?? row.case_id.slice(0, 4);
  return /^\d{4}$/.test(s) ? Number(s) : 0;
}

interface SearchOptions {
  databaseId?: string | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  limit?: number;
}

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
  const PREFIXE_ANNEE = "c.case_id GLOB '[0-9][0-9][0-9][0-9]*'";
  if (opts.yearFrom) {
    where.push(
      `(c.decision_date >= ? OR (c.decision_date IS NULL AND ${PREFIXE_ANNEE} AND substr(c.case_id,1,4) >= ?))`,
    );
    binds.push(`${opts.yearFrom}-01-01`, String(opts.yearFrom));
  }
  if (opts.yearTo) {
    where.push(
      `(c.decision_date <= ? OR (c.decision_date IS NULL AND ${PREFIXE_ANNEE} AND substr(c.case_id,1,4) <= ?))`,
    );
    binds.push(`${opts.yearTo}-12-31`, String(opts.yearTo));
  }
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  try {
    const r = await db
      .prepare(
        `SELECT c.* FROM cases_fts f JOIN cases c ON c.id = f.rowid
         WHERE ${where.join(" AND ")}
         -- SQLite trie NULL SOUS toute valeur : en DESC, les lignes sans date tombent
         -- donc naturellement en dernier, ce qui est l'ordre voulu. Pas de NULLS LAST —
         -- il ne changerait rien et laisserait croire que le défaut est risqué.
         ORDER BY bm25(cases_fts, 10.0, 1.0, 0.0, 0.0), c.decision_date DESC
         LIMIT ?`,
      )
      .bind(...binds, limit)
      .all<CaseRow>();
    return r.results ?? [];
  } catch {
    return [];
  }
}
