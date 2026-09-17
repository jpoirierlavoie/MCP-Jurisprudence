-- Migration 0005 — RETRAIT des dates de décision FABRIQUÉES par le balayage vif
-- (2026-09-17). Comme 0004, elle ne touche PAS au schéma : elle rattrape la DONNÉE
-- DÉJÀ ÉCRITE.
--
-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║ LE DÉFAUT (invariant 3 ; spécification §2 et §7.2).                          ║
-- ║                                                                              ║
-- ║ Une réponse de LISTE de CanLII ne porte pas de date (annexe B), et           ║
-- ║ `rowFromListItem` écrivait donc `decision_date = NULL`. Le gestionnaire de   ║
-- ║ `jurisprudence_find_case` posait ensuite, sur chaque ligne moissonnée,       ║
-- ║ `decision_date ?? '<année du balayage>-01-01'`. L'ANNÉE était vraie ; le     ║
-- ║ JOUR et le MOIS étaient inventés, puis PERSISTÉS, puis rendus comme une      ║
-- ║ date de décision. Godbout c. Longueuil (Ville) ressortait au 1er janvier     ║
-- ║ 1997 ; l'arrêt a été rendu le 31 octobre.                                    ║
-- ║                                                                              ║
-- ║ Et le COALESCE de l'UPSERT fait gagner la valeur NON NULLE : un balayage     ║
-- ║ recroisant une fiche obtenue par get_case ÉCRASAIT sa vraie date, sans       ║
-- ║ rétrograder `source` — la ligne restait donc pleinement éligible à servir    ║
-- ║ une vérification depuis le cache, corrompue.                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
--
-- POURQUOI DEUX ÉNONCÉS, ET PAS LE MÊME TRAITEMENT DES DEUX CÔTÉS. Le premier remet la
-- ligne de balayage dans son état honnête ; elle garde sa valeur d'INDEX (intitulé,
-- citation), qui est toute sa raison d'être (D6). Le second SUPPRIME, et ne met pas à
-- NULL : une fiche « lookup » est servie au cache par `lookupCase`, et le contrôle
-- d'ANNÉE de `verifyCitations` ne s'exécute QUE si `decision_date` existe. Mise à NULL,
-- la ligne ferait donc SAUTER ce contrôle EN SILENCE — une citation d'année fausse
-- ressortirait CONFIRMÉE sans avoir été comparée. Supprimée, elle est simplement
-- rachetée au prochain appel : c'est un cache.
--
-- ⚠ AUCUNE RECONSTRUCTION DE TABLE, JAMAIS. Le seul moyen d'ajouter un
--   `CHECK (source = 'lookup' OR decision_date IS NULL)` serait le motif SQLite
--   habituel — nouvelle table, copie, drop, rename. Il réassigne TOUS les `rowid`, et
--   `cases_fts` est en « external content » avec `content_rowid = 'id'` : l'index
--   pointerait sur les mauvaises lignes EN SILENCE. C'est l'invariant 1 qui rentre par
--   une autre porte. `UPDATE` et `DELETE`, eux, sont couverts par les déclencheurs
--   `cases_au` et `cases_ad` de 0001, et ce chemin est éprouvé par `test/persist.test.ts`
--   contre du vrai SQLite. L'invariant reste donc tenu par le CODE et par les TESTS.
--   Vérifié avant application (2026-09-17) : `cases` = 3 564, `cases_fts` = 3 564.
--
-- ⚠ ORDRE DE DÉPLOIEMENT. `npm run deploy` passe les migrations AVANT le Worker. Pour
--   une migration de SCHÉMA c'est le sens sûr, et c'est ce que dit `deployer.mjs` en cas
--   d'échec. Pour une migration de DONNÉE il s'inverse : pendant les quelques secondes
--   qui séparent les deux étapes, la base nettoyée tourne sous le code qui fabrique
--   encore. Rien d'automatisé n'écrit dans `cases` — le cron ne rafraîchit que le
--   répertoire, et `BACKFILL_ENABLED` vaut « false » — donc la fenêtre est à garder
--   fermée à la main : NE PAS appeler `jurisprudence_find_case` entre les deux.

-- ── 1. Les lignes de balayage : la date est fabriquée PAR CONSTRUCTION ───────
--
-- Le prédicat est EXACT, et non heuristique. Le seul écrivain d'une date est
-- `rowFromMetadata` (source = 'lookup'), et l'UPSERT ne rétrograde jamais `source` :
-- une ligne qui n'est pas 'lookup' ne peut donc pas tenir sa date de CanLII.
--
-- Relevé en production avant application, le 2026-09-17 :
--   · 934 lignes 'lookup'  — 0 sans date,   0 au 1er janvier, 934 à un autre jour ;
--   · 2 630 lignes 'sweep' — 811 sans date, 1 819 au 1er janvier, 0 à un autre jour.
-- AUCUNE ligne de balayage ne portait une date d'un autre jour : 2 630 − 811 − 1 819 = 0.
-- Les 1 819 sont toutes dans une seule base.
UPDATE cases
   SET decision_date = NULL
 WHERE source <> 'lookup'
   AND decision_date IS NOT NULL;

-- ── 2. Les fiches ÉCRASÉES : aucune au relevé, et c'est la FENÊTRE qu'on ferme ─
--
-- Une fiche 'lookup' dont un balayage aurait écrasé la date porte un 1er janvier et rien
-- d'autre ne la trahit : ni `source`, ni `url`, ni `docket_number`, que le COALESCE
-- préserve. Le prédicat est donc HEURISTIQUE ici, et il a de vrais faux positifs — les
-- tribunaux ne siègent pas le 1er janvier, mais CanLII emploie cette date comme date
-- IMPRÉCISE sur du matériel ancien. Le coût d'un faux positif est d'UN appel, qui
-- réécrira la même valeur : on préfère payer cet appel que garder une date dont on ne
-- peut pas dire si elle est vraie.
--
-- Au relevé du 2026-09-17 : ZÉRO ligne. L'énoncé est conservé parce que la FENÊTRE
-- existe — entre ce relevé et la mise en ligne du correctif, tout appel à
-- `jurisprudence_find_case` sur un tribunal déjà vérifié pouvait en créer une.
--
-- GLOB et non LIKE, pour le motif consigné en 0004 : dans LIKE, « _ » est un joker d'un
-- caractère. '????-01-01' apparie exactement dix caractères.
DELETE FROM cases
 WHERE source = 'lookup'
   AND decision_date GLOB '????-01-01';
