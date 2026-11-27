INSERT INTO court_codes (code, database_id, caseid_code, jurisdiction, lang, verified, note) VALUES
  ('ONCA', 'onca', 'onca', 'on', NULL, 0, 'hypothèse : identité (Court of Appeal for Ontario, observé dans qccs-mtl-commercial : 2008 ONCA 587)')
ON CONFLICT(code) DO UPDATE SET
  database_id = excluded.database_id,
  caseid_code = excluded.caseid_code,
  jurisdiction = excluded.jurisdiction,
  lang = excluded.lang,
  verified = excluded.verified,
  note = excluded.note;
