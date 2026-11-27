UPDATE search_log
   SET tool = substr(tool, 15)
 WHERE tool GLOB 'jurisprudence_*';

UPDATE court_codes
   SET note = replace(note, 'jurisprudence_', '')
 WHERE note GLOB '*jurisprudence_*';

CREATE TRIGGER IF NOT EXISTS search_log_drop_legacy_prefix
AFTER INSERT ON search_log
WHEN new.tool GLOB 'jurisprudence_*'
BEGIN
  UPDATE search_log
     SET tool = substr(new.tool, 15)
   WHERE id = new.id;
END;
