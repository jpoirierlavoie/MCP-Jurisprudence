CREATE TABLE databases (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,
  jurisdiction  TEXT NOT NULL,
  type          TEXT,
  name_fr       TEXT,
  name_en       TEXT,
  name_norm     TEXT,
  refreshed_at  TEXT NOT NULL
);
CREATE INDEX idx_db_kind ON databases(kind, jurisdiction);

CREATE TABLE court_codes (
  code          TEXT PRIMARY KEY,
  database_id   TEXT NOT NULL,
  caseid_code   TEXT NOT NULL,
  jurisdiction  TEXT NOT NULL,
  lang          TEXT,
  verified      INTEGER NOT NULL DEFAULT 0,
  note          TEXT
);

CREATE TABLE paren_codes (
  juris_code    TEXT NOT NULL,
  court_code    TEXT NOT NULL,
  database_id   TEXT NOT NULL,
  verified      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (juris_code, court_code)
);

CREATE TABLE cases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  database_id     TEXT NOT NULL,
  case_id         TEXT NOT NULL,
  lang            TEXT,
  title           TEXT NOT NULL,
  title_norm      TEXT NOT NULL,
  citation        TEXT,
  neutral_cite    TEXT,
  docket_number   TEXT,
  decision_date   TEXT,
  keywords        TEXT,
  url             TEXT,
  concatenated_id TEXT,
  source          TEXT NOT NULL,
  fetched_at      TEXT NOT NULL,
  UNIQUE (database_id, case_id)
);
CREATE INDEX idx_cases_date    ON cases(database_id, decision_date DESC);
CREATE INDEX idx_cases_neutral ON cases(neutral_cite);
CREATE INDEX idx_cases_docket  ON cases(docket_number);

CREATE VIRTUAL TABLE cases_fts USING fts5(
  title, keywords,
  database_id UNINDEXED, case_id UNINDEXED,
  content='cases', content_rowid='id',
  tokenize="unicode61 remove_diacritics 2"
);
CREATE TRIGGER cases_ai AFTER INSERT ON cases BEGIN
  INSERT INTO cases_fts(rowid, title, keywords, database_id, case_id)
  VALUES (new.id, new.title, new.keywords, new.database_id, new.case_id);
END;
CREATE TRIGGER cases_ad AFTER DELETE ON cases BEGIN
  INSERT INTO cases_fts(cases_fts, rowid, title, keywords, database_id, case_id)
  VALUES ('delete', old.id, old.title, old.keywords, old.database_id, old.case_id);
END;
CREATE TRIGGER cases_au AFTER UPDATE ON cases BEGIN
  INSERT INTO cases_fts(cases_fts, rowid, title, keywords, database_id, case_id)
  VALUES ('delete', old.id, old.title, old.keywords, old.database_id, old.case_id);
  INSERT INTO cases_fts(rowid, title, keywords, database_id, case_id)
  VALUES (new.id, new.title, new.keywords, new.database_id, new.case_id);
END;

CREATE TABLE citator_edges (
  from_database_id  TEXT NOT NULL,
  from_case_id      TEXT NOT NULL,
  rel               TEXT NOT NULL,
  to_database_id    TEXT,
  to_case_id        TEXT,
  to_legislation_id TEXT,
  to_title          TEXT,
  to_citation       TEXT,
  fetched_at        TEXT NOT NULL
);
CREATE INDEX idx_edges_from ON citator_edges(from_database_id, from_case_id, rel);

CREATE TABLE citator_state (
  database_id TEXT NOT NULL,
  case_id     TEXT NOT NULL,
  rel         TEXT NOT NULL,
  edge_count  INTEGER NOT NULL,
  fetched_at  TEXT NOT NULL,
  PRIMARY KEY (database_id, case_id, rel)
);

CREATE TABLE sync_state (
  database_id   TEXT PRIMARY KEY,
  cursor_date   TEXT,
  cursor_offset INTEGER NOT NULL DEFAULT 0,
  last_run_at   TEXT,
  complete      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE search_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT NOT NULL DEFAULT (datetime('now')),
  tool         TEXT NOT NULL,
  query        TEXT NOT NULL,
  database_id  TEXT,
  lang         TEXT,
  result_count INTEGER NOT NULL,
  verdict      TEXT,
  fallback     TEXT
);
CREATE INDEX idx_search_log_misses ON search_log(tool, ts) WHERE result_count = 0;

CREATE TABLE api_usage (
  day       TEXT PRIMARY KEY,
  calls     INTEGER NOT NULL DEFAULT 0,
  errors    INTEGER NOT NULL DEFAULT 0,
  throttled INTEGER NOT NULL DEFAULT 0
);
