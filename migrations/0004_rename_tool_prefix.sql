UPDATE search_log
   SET tool = replace(tool, 'canlii_', 'jurisprudence_')
 WHERE tool GLOB 'canlii_*';

UPDATE court_codes
   SET note = replace(note, 'canlii_', 'jurisprudence_')
 WHERE note GLOB '*canlii_*';
