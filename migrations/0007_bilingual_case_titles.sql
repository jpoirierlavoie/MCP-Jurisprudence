-- Migration 0007 — colonnes bilingues (FR / EN) sur `cases` (D2).
--
-- ⚠ ADDITIVE UNIQUEMENT : aucune reconstruction de table (pas de DROP/CREATE/RENAME),
--   afin de préserver `cases.id` (rowid) et la cohérence de `cases_fts` en external content.
ALTER TABLE cases ADD COLUMN title_fr TEXT;
ALTER TABLE cases ADD COLUMN title_en TEXT;
ALTER TABLE cases ADD COLUMN url_fr TEXT;
ALTER TABLE cases ADD COLUMN url_en TEXT;
ALTER TABLE cases ADD COLUMN keywords_fr TEXT;
ALTER TABLE cases ADD COLUMN keywords_en TEXT;

UPDATE cases
   SET title_fr = title,
       url_fr = url,
       keywords_fr = keywords
 WHERE lang = 'fr';

UPDATE cases
   SET title_en = title,
       url_en = url,
       keywords_en = keywords
 WHERE lang = 'en';
