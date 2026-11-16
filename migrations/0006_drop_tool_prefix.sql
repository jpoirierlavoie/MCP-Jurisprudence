-- Migration 0006 — RETRAIT du préfixe « jurisprudence_ » sur les dix outils adossés
-- à CanLII (v2.0.0, alignement sur le greffon `droit-civil-quebecois` v2.0.0 et la clé
-- de serveur `juris`). Elle ne touche PAS au schéma : elle rattrape la DONNÉE DÉJÀ
-- ÉCRITE sous les anciens noms, sans toucher aux migrations 0001..0005.
--
-- Les dix outils passent de `jurisprudence_<nom>` à `<nom>` :
--   verify_citations, find_case, get_case, citator, subsequent_history,
--   browse_cases, list_databases, browse_legislation, get_legislation, parse_citation.

-- ── 1. Télémétrie (§10) ──────────────────────────────────────────────────────
--
-- `search_log.tool` porte le nom exact de l'outil ayant écrit la ligne. Retirer le
-- préfixe de 14 caractères (`'jurisprudence_'`) garde la continuité de la série
-- historique avec 0004 (`canlii_` -> `jurisprudence_` -> nom court). GLOB est ancré
-- au début et n'interprète pas `_` comme joker (contrairement à LIKE).
UPDATE search_log
   SET tool = substr(tool, 15)
 WHERE tool GLOB 'jurisprudence_*';

-- ── 2. Donnée de référence (§4.3) ────────────────────────────────────────────
--
-- `court_codes.note` peut contenir un renvoi orientant le lecteur (p. ex. QCTAQ :
-- « Préférer jurisprudence_find_case. » écrit par 0003 puis mis à jour par 0004).
UPDATE court_codes
   SET note = replace(note, 'jurisprudence_', '')
 WHERE note GLOB '*jurisprudence_*';
