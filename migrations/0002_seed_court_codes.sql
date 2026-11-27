INSERT INTO court_codes (code, database_id, caseid_code, jurisdiction, lang, verified, note) VALUES

  ('CSC',   'csc-scc', 'scc',   'ca', 'fr', 1, 'documenté : caseBrowse/fr/csc-scc/2008scc9'),
  ('SCC',   'csc-scc', 'scc',   'ca', 'en', 1, 'documenté'),

  ('QCCA',  'qcca',  'qcca',  'qc', NULL, 0, 'hypothèse : identité'),
  ('QCCS',  'qccs',  'qccs',  'qc', NULL, 0, 'hypothèse : identité'),
  ('QCCQ',  'qccq',  'qccq',  'qc', NULL, 0, 'hypothèse : identité'),
  ('QCCM',  'qccm',  'qccm',  'qc', NULL, 0, 'hypothèse : identité'),
  ('QCTAL', 'qctal', 'qctal', 'qc', NULL, 0, 'hypothèse : identité'),
  ('QCTAT', 'qctat', 'qctat', 'qc', NULL, 0, 'hypothèse : identité'),
  ('QCTAQ', 'qctaq', 'qctaq', 'qc', NULL, 0, 'hypothèse : identité'),
  ('QCTP',  'qctp',  'qctp',  'qc', NULL, 0, 'hypothèse : identité'),

  ('CAF',   'caf-fca', 'fca', 'ca', 'fr', 0, 'À VÉRIFIER — motif csc-scc supposé'),
  ('FCA',   'caf-fca', 'fca', 'ca', 'en', 0, 'À VÉRIFIER'),
  ('CF',    'cf-fc',   'fc',  'ca', 'fr', 0, 'À VÉRIFIER'),
  ('FC',    'cf-fc',   'fc',  'ca', 'en', 0, 'À VÉRIFIER'),
  ('CCI',   'cci-tcc', 'tcc', 'ca', 'fr', 0, 'À VÉRIFIER'),
  ('TCC',   'cci-tcc', 'tcc', 'ca', 'en', 0, 'À VÉRIFIER');

INSERT INTO paren_codes (juris_code, court_code, database_id, verified) VALUES
  ('QC', 'CA',  'qcca', 0),
  ('QC', 'CS',  'qccs', 0),
  ('QC', 'CQ',  'qccq', 0),
  ('QC', 'CM',  'qccm', 0),
  ('CA', 'SCC', 'csc-scc', 1),
  ('CA', 'CSC', 'csc-scc', 1);
