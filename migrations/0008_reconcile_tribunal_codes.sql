-- Migration 0008 — réconciliation des codes de tribunaux et parenthèses CanLII
-- observés lors de la compilation des listes d'autorités dispensées (2026-11-24).
--
-- Chaque ligne verified = 1 repose sur une fiche effectivement servie par CanLII.

INSERT INTO court_codes (code, database_id, caseid_code, jurisdiction, lang, verified, note) VALUES
  ('QCCLP',   'qcclp',   'qcclp',   'qc', NULL, 1, 'observé 2026-11-24 : qcclp/2011qcclp2775 (Boies et CSSS Québec-Nord)'),
  ('QCCRT',   'qccrt',   'qccrt',   'qc', NULL, 1, 'observé 2026-11-24 : qccrt/2006qccrt419 (Bangia c. Nadler Danino)'),
  ('QCTDP',   'qctdp',   'qctdp',   'qc', NULL, 1, 'observé 2026-11-24 : qctdp/2008qctdp24 (CDPDJ c. Gaz métropolitain)'),
  ('QCBDRVM', 'qcbdrvm', 'qcbdrvm', 'qc', NULL, 1, 'observé 2026-11-24 : qcbdrvm/2006qcbdrvm17 (AMF c. Demers)'),
  ('QCBDR',   'qcbdrvm', 'qcbdr',   'qc', NULL, 1, 'observé 2026-11-24 : qcbdrvm/2010qcbdr104 — le TMF conserve le databaseId qcbdrvm'),
  ('QCTMF',   'qcbdrvm', 'qctmf',   'qc', NULL, 1, 'observé 2026-11-24 : qcbdrvm/2024qctmf1 — le TMF conserve le databaseId qcbdrvm'),
  ('FCT',     'fct',     'fct',     'ca', 'en', 1, 'observé 2026-11-24 : fct/2003fct81 (Dragosin c. Canada)'),
  ('CFPI',    'fct',     'cfpi',    'ca', 'fr', 1, 'observé 2026-11-24 : fct/2003cfpi116 (Lubana c. Canada)'),
  ('BCCA',    'bcca',    'bcca',    'bc', NULL, 1, 'observé 2026-11-24 : bcca/1999bcca470 (Halfway River First Nation)'),
  ('YKCA',    'ykca',    'ykca',    'yk', NULL, 1, 'observé 2026-11-24 : ykca/2008ykca13 (Little Salmon/Carmacks)')
ON CONFLICT(code) DO UPDATE SET
  database_id = excluded.database_id,
  caseid_code = excluded.caseid_code,
  jurisdiction = excluded.jurisdiction,
  lang = excluded.lang,
  verified = excluded.verified,
  note = excluded.note;

INSERT INTO paren_codes (juris_code, court_code, database_id, verified) VALUES
  ('QC', 'CA',    'qcca',  1), -- observé 2026-11-24 : qcca/1992canlii3299 (Béliveau c. Barreau)
  ('QC', 'TDP',   'qctdp', 1), -- observé 2026-11-24 : qctdp/2004canlii46172 (Potvin c. Comm. scol. des Phares)
  ('BC', 'CA',    'bcca',  1), -- observé 2026-11-24 : bcca/1951canlii252 (Faryna v. Chorny)
  ('CA', 'FCA',   'fca',   1), -- observé 2026-11-24 : fca/1996canlii4086 (Li c. Canada)
  ('CA', 'CAF',   'fca',   0), -- variante française de FCA, à confirmer à l'usage
  ('CA', 'FCTAD', 'fca',   1), -- observé 2026-11-24 : fca/1994canlii3534 (Miss Universe c. Bohna)
  ('CA', 'FCT',   'fct',   1), -- observé 2026-11-24 : fct/2000canlii17157 (Air Canada)
  ('CA', 'FCTTD', 'fct',   1), -- observé 2026-11-24 : fct/2000canlii17157 (Air Canada)
  ('CA', 'CF',    'fct',   0), -- variante française de FC/FCT, à confirmer à l'usage
  ('CA', 'CFPI',  'fct',   0), -- variante française de FCTD, à confirmer à l'usage
  ('UK', 'JCPC',  'ukpc',  1)  -- observé 2026-11-24 : ukpc/1902canlii241 (Ontario Mining c. Seybold)
ON CONFLICT(juris_code, court_code) DO UPDATE SET
  database_id = excluded.database_id,
  verified = excluded.verified;
