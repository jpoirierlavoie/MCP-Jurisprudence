UPDATE cases
   SET decision_date = NULL
 WHERE source <> 'lookup'
   AND decision_date IS NOT NULL;

DELETE FROM cases
 WHERE source = 'lookup'
   AND decision_date GLOB '????-01-01';
