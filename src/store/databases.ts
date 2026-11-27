import { type CanliiClient, createClient } from "../canlii/client";
import type { CaseDatabasesResponse, Lang, LegislationDatabasesResponse } from "../canlii/types";
import { fold } from "../citation/normalize";
import type { CourtCode, Directory, ParenCode } from "../citation/parse";

interface DatabaseRow {
  id: string;
  kind: "case" | "legislation";
  jurisdiction: string;
  type: string | null;
  name_fr: string | null;
  name_en: string | null;
  name_norm: string | null;
  refreshed_at: string;
}

const TTL_JOURS = 7;

export async function loadDirectory(db: D1Database): Promise<Directory> {
  const [courts, parens, bases] = await Promise.all([
    db.prepare("SELECT * FROM court_codes").all<CourtCode>(),
    db.prepare("SELECT * FROM paren_codes").all<ParenCode>(),
    db.prepare("SELECT id FROM databases").all<{ id: string }>(),
  ]);
  return {
    courtCodes: new Map((courts.results ?? []).map((r) => [r.code.toUpperCase(), r])),
    parenCodes: new Map(
      (parens.results ?? []).map((r) => [
        `${r.juris_code.toUpperCase()}/${r.court_code.toUpperCase()}`,
        r,
      ]),
    ),
    knownDatabases: new Set((bases.results ?? []).map((r) => r.id)),
  };
}

export async function listDatabases(
  db: D1Database,
  filtres: { kind?: string; jurisdiction?: string; query?: string } = {},
): Promise<DatabaseRow[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (filtres.kind) {
    where.push("kind = ?");
    binds.push(filtres.kind);
  }
  if (filtres.jurisdiction) {
    where.push("jurisdiction = ?");
    binds.push(filtres.jurisdiction.toLowerCase());
  }
  if (filtres.query) {
    where.push("(name_norm LIKE ? OR id LIKE ?)");
    const motif = `%${fold(filtres.query)}%`;
    binds.push(motif, `%${filtres.query.toLowerCase()}%`);
  }
  const sql = `SELECT * FROM databases ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY kind, jurisdiction, id`;
  const r = await db
    .prepare(sql)
    .bind(...binds)
    .all<DatabaseRow>();
  return r.results ?? [];
}

export async function directoryStale(db: D1Database, now: Date = new Date()): Promise<boolean> {
  const row = await db
    .prepare("SELECT MAX(refreshed_at) AS last, COUNT(*) AS n FROM databases")
    .first<{ last: string | null; n: number }>();
  if (!row || row.n === 0 || !row.last) return true;
  const age = now.getTime() - Date.parse(row.last);
  return !Number.isFinite(age) || age > TTL_JOURS * 86_400_000;
}

export async function refreshDatabases(
  db: D1Database,
  client: CanliiClient,
  lang: Lang = "fr",
  now: Date = new Date(),
): Promise<{ cases: number; legislation: number }> {
  const ts = now.toISOString();
  const [cas, lois] = [
    await client.get<CaseDatabasesResponse>(`caseBrowse/${lang}/`),
    await client.get<LegislationDatabasesResponse>(`legislationBrowse/${lang}/`),
  ];

  const stmt = db.prepare(
    `INSERT INTO databases (id, kind, jurisdiction, type, name_fr, name_en, name_norm, refreshed_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       kind = excluded.kind,
       jurisdiction = excluded.jurisdiction,
       type = excluded.type,
       -- Un rafraîchissement EN ne doit pas effacer le nom FR, ni l'inverse :
       -- COALESCE conserve l'existant quand la passe courante n'apporte rien.
       name_fr = COALESCE(excluded.name_fr, databases.name_fr),
       name_en = COALESCE(excluded.name_en, databases.name_en),
       name_norm = COALESCE(excluded.name_norm, databases.name_norm),
       refreshed_at = excluded.refreshed_at`,
  );

  const lignes: D1PreparedStatement[] = [];
  for (const d of cas.caseDatabases ?? []) {
    if (!d.databaseId) continue;
    lignes.push(
      stmt.bind(
        d.databaseId,
        "case",
        (d.jurisdiction ?? "").toLowerCase(),
        null,
        lang === "fr" ? (d.name ?? null) : null,
        lang === "en" ? (d.name ?? null) : null,
        d.name ? fold(d.name) : null,
        ts,
      ),
    );
  }
  for (const d of lois.legislationDatabases ?? []) {
    if (!d.databaseId) continue;
    lignes.push(
      stmt.bind(
        d.databaseId,
        "legislation",
        (d.jurisdiction ?? "").toLowerCase(),
        d.type ?? null,
        lang === "fr" ? (d.name ?? null) : null,
        lang === "en" ? (d.name ?? null) : null,
        d.name ? fold(d.name) : null,
        ts,
      ),
    );
  }
  await batchWrite(db, lignes);
  return {
    cases: cas.caseDatabases?.length ?? 0,
    legislation: lois.legislationDatabases?.length ?? 0,
  };
}

export async function directoryMismatches(
  db: D1Database,
): Promise<{ courts: CourtCode[]; parens: ParenCode[] }> {
  const bases = await db.prepare("SELECT COUNT(*) AS n FROM databases").first<{ n: number }>();
  if (!bases || bases.n === 0) return { courts: [], parens: [] };
  const [c, p] = await Promise.all([
    db
      .prepare(
        "SELECT * FROM court_codes WHERE database_id NOT IN (SELECT id FROM databases) ORDER BY code",
      )
      .all<CourtCode>(),
    db
      .prepare(
        "SELECT * FROM paren_codes WHERE database_id NOT IN (SELECT id FROM databases) ORDER BY juris_code, court_code",
      )
      .all<ParenCode>(),
  ]);
  return { courts: c.results ?? [], parens: p.results ?? [] };
}

export async function confirmCourtCode(
  db: D1Database,
  code: string,
  databaseId: string,
  caseidCode: string,
  concatenatedId: string | null,
  note: string,
): Promise<{ verified: boolean; note: string }> {
  const attendu = concatenatedId ? concatenatedId.toLowerCase() : null;
  const concorde = attendu === null || attendu.includes(databaseId.toLowerCase());
  const finalNote = concorde
    ? note
    : `${note} — ⚠ concatenatedId « ${concatenatedId} » ne contient pas « ${databaseId} » : correspondance NON confirmée`;
  try {
    await db
      .prepare(
        "UPDATE court_codes SET database_id = ?, caseid_code = ?, verified = ?, note = ? WHERE code = ?",
      )
      .bind(databaseId, caseidCode, concorde ? 1 : 0, finalNote, code.toUpperCase())
      .run();
  } catch {}
  return { verified: concorde, note: finalNote };
}

export async function confirmParenCode(
  db: D1Database,
  juris: string,
  court: string,
  databaseId: string,
): Promise<void> {
  try {
    await db
      .prepare(
        "UPDATE paren_codes SET database_id = ?, verified = 1 WHERE juris_code = ? AND court_code = ?",
      )
      .bind(databaseId, juris.toUpperCase(), court.toUpperCase())
      .run();
  } catch {}
}

export async function batchWrite(
  db: D1Database,
  statements: D1PreparedStatement[],
  taille = 100,
): Promise<void> {
  for (let i = 0; i < statements.length; i += taille) {
    await db.batch(statements.slice(i, i + taille));
  }
}

export async function runScheduled(
  env: Env,
  now: Date = new Date(),
  clientInjecte?: CanliiClient,
): Promise<void> {
  const client = clientInjecte ?? createClient(env);
  try {
    if (await directoryStale(env.DB, now)) {
      await refreshDatabases(env.DB, client, (env.DEFAULT_LANG as Lang) ?? "fr", now);
    }
  } catch (e) {
    console.error("rafraîchissement du répertoire en échec", {
      error: e instanceof Error ? e.name : "inconnu",
    });
  }
}
