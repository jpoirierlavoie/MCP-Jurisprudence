UPDATE court_codes SET database_id = 'fca', caseid_code = 'caf', verified = 1,
  note = 'réconcilié 2026-07-23 : observé fca/2026caf129 (Pindi c. Canada, 2026 CAF 129)'
  WHERE code = 'CAF';
UPDATE court_codes SET database_id = 'fca', caseid_code = 'fca', verified = 1,
  note = 'réconcilié 2026-07-23 : observé fca/2026fca128 (Turner v. Canada, 2026 FCA 128)'
  WHERE code = 'FCA';

UPDATE court_codes SET database_id = 'fct', caseid_code = 'cf', verified = 1,
  note = 'réconcilié 2026-07-23 : observé fct/2026cf981 — databaseId « fct », pas « fc »'
  WHERE code = 'CF';
UPDATE court_codes SET database_id = 'fct', caseid_code = 'fc', verified = 1,
  note = 'réconcilié 2026-07-23 : observé fct/2026fc987 (Roghangar v. Canada, 2026 FC 987)'
  WHERE code = 'FC';

UPDATE court_codes SET database_id = 'cci-tcc', caseid_code = 'cci', verified = 1,
  note = 'réconcilié 2026-07-23 : observé cci-tcc/2026cci122 — fragment français « cci », non « tcc »'
  WHERE code = 'CCI';
UPDATE court_codes SET database_id = 'cci-tcc', caseid_code = 'tcc', verified = 1,
  note = 'réconcilié 2026-07-23 : observé cci-tcc/2026tcc127 (Chobham Corp. v. The King)'
  WHERE code = 'TCC';

UPDATE court_codes SET database_id = 'qcrdl', caseid_code = 'qctal', verified = 1,
  note = 'réconcilié 2026-07-23 : observé qcrdl/2026qctal23817 — le TAL conserve le databaseId « qcrdl » de la Régie du logement'
  WHERE code = 'QCTAL';

UPDATE court_codes SET verified = 1,
  note = 'confirmé 2026-07-23 : observé qcca/2026qcca1004' WHERE code = 'QCCA';
UPDATE court_codes SET verified = 1,
  note = 'confirmé 2026-07-23 : observé qccs/2026qccs2678' WHERE code = 'QCCS';
UPDATE court_codes SET verified = 1,
  note = 'confirmé 2026-07-23 : observé qccq/2026qccq3271' WHERE code = 'QCCQ';
UPDATE court_codes SET verified = 1,
  note = 'confirmé 2026-07-23 : observé qccm/2026qccm34' WHERE code = 'QCCM';
UPDATE court_codes SET verified = 1,
  note = 'confirmé 2026-07-23 : observé qctat/2026qctat2972' WHERE code = 'QCTAT';
UPDATE court_codes SET verified = 1,
  note = 'confirmé 2026-07-23 : observé qctp/2026qctp29' WHERE code = 'QCTP';

UPDATE court_codes SET verified = 1,
  note = 'confirmé 2026-07-23 mais PEU APPLICABLE : le TAQ numérote ses décisions via CanLII (qctaq/2026canlii72460) ; les citations neutres QCTAQ sont rares. Préférer canlii_find_case.'
  WHERE code = 'QCTAQ';
