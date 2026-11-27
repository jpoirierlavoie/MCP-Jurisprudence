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
