-- Migration 0004 — RENOMMAGE des dix outils adossés à CanLII : « canlii_* » devient
-- « jurisprudence_* » (2026-09-16). Elle ne touche PAS au schéma : elle rattrape la
-- DONNÉE DÉJÀ ÉCRITE sous les anciens noms.
--
-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║ MOTIF (décision D8 AMENDÉE le 2026-09-16 ; spécification §1 et §17.1).        ║
-- ║                                                                              ║
-- ║ Le préfixe `canlii_` portait à lui seul l'annonce « la réponse vient de la    ║
-- ║ collection de CanLII ». Un préfixe ne peut pas porter une réserve : il ne dit ║
-- ║ ni la couverture bornée, ni qu'une absence n'est pas une inexistence, ni que  ║
-- ║ l'API ne rend que des métadonnées — il en donne seulement l'illusion.         ║
-- ║ L'annonce a MIGRÉ dans la description de chaque outil, dans `INSTRUCTIONS` et ║
-- ║ sur la page publique : trois surfaces qui sont des PHRASES, et que des tests  ║
-- ║ épinglent dans les deux langues. Le préfixe ne fait plus que partitionner.    ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
--
-- POURQUOI ICI, ET NON DANS 0002/0003. Une migration déjà appliquée est le RELEVÉ de
-- ce qui a été fait, pas un texte courant. La rééditer ne changerait rien à la base de
-- production — elle ne sera pas rejouée — et ferait diverger EN SILENCE une base neuve
-- de la base vivante. Les commentaires de 0001, 0002 et 0003 nomment donc encore
-- `canlii_list_databases`, `canlii_parse_citation` et `canlii_find_case` : c'est exact
-- POUR LA DATE QU'ILS PORTENT, et il faut les lire ainsi. Rien n'y est à corriger.

-- ── 1. Télémétrie (§10) ──────────────────────────────────────────────────────
--
-- `search_log.tool` porte le nom de l'outil qui a écrit la ligne. Laissée telle quelle,
-- la colonne couperait l'historique en deux à la date du renommage : deux séries pour
-- un même outil, dont aucune ne serait fausse, et dont la somme ne serait faite nulle
-- part. C'est un défaut d'ANALYSE et non d'exécution — rien ne planterait, on
-- conclurait simplement de travers sur les formes de citations que l'analyseur ne sait
-- pas résoudre, qui sont précisément l'objet du dépouillement de §10. C'est le genre de
-- silence que §2 proscrit, déplacé dans les données.
--
-- Le garde-fou `GLOB 'canlii_*'` n'est pas décoratif : `replace()` n'est pas ancré et
-- réécrirait toute valeur CONTENANT la chaîne, où qu'elle soit. Aucune ne le fait
-- aujourd'hui ; la clause fait dire à l'énoncé ce qu'il veut dire, et rend le nombre de
-- lignes touchées interprétable. GLOB et non LIKE : dans LIKE, « _ » est un joker d'un
-- caractère, si bien que 'canlii_%' apparierait aussi « canliiX… ».
--
-- L'index partiel `idx_search_log_misses ON search_log(tool, ts) WHERE result_count = 0`
-- est réécrit pour les lignes touchées : c'est attendu, et le volume — quelques semaines
-- d'usage d'un seul praticien — le rend sans conséquence.
UPDATE search_log
   SET tool = replace(tool, 'canlii_', 'jurisprudence_')
 WHERE tool GLOB 'canlii_*';

-- ── 2. Donnée de référence (§4.3) ────────────────────────────────────────────
--
-- La note de la ligne QCTAQ, écrite par 0003 le 2026-07-23, ORIENTE le lecteur vers un
-- outil : « Préférer canlii_find_case. » Un renvoi vers un nom mort envoie vers le vide,
-- ce qui est pire que pas de renvoi : la note existe précisément parce que l'écart,
-- laissé tacite, se lit comme une absence.
--
-- Ce que cette réécriture NE touche PAS, et c'est délibéré : la PREUVE consignée dans la
-- même note — le caseId « qctaq/2026canlii72460 » réellement observé. C'est une
-- observation datée, pas un renvoi ; elle ne contient d'ailleurs pas « canlii_ », et le
-- motif l'épargne par construction.
--
-- L'énoncé porte sur `note` en général, et non sur la seule ligne QCTAQ : la boucle
-- d'auto-correction de §6.4 écrit elle aussi dans cette colonne, et une note posée par un
-- déploiement antérieur pourrait porter un renvoi.
UPDATE court_codes
   SET note = replace(note, 'canlii_', 'jurisprudence_')
 WHERE note GLOB '*canlii_*';
