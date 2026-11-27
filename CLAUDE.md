# mcp-jurisprudence — Vérification déterministe de jurisprudence canadienne (CanLII)

Directives de développement, contrat de vérité et invariants anti-dérive pour **`mcp-jurisprudence`** (`https://jurisprudence.poirierlavoie.ca/mcp` et `/mcp/oauth`), gouvernant à l'identique Claude et Google Antigravity / Gemini CLI (`CLAUDE.md` et `GEMINI.md` doivent rester identiques octet pour octet et sous **24 000 octets** UTF-8 LF sans BOM ; `gemini-extension.json` déclare `"contextFileName": []` afin de ne jamais injecter ces consignes dans les sessions des usagers finaux).

Propriétaire : Jason Poirier Lavoie (avocat, Québec). Ce document porte les invariants opérationnels et le contrat de vérité du dépôt. **C'est un outil juridique : un résultat faux rendu en silence est le pire défaut possible — refuser vaut toujours mieux que deviner.**

---

## ⚠ ÉVALUATION D'IMPACT ET RÈGLE DE PROPAGATION (obligatoire, sans exception)

**Aucune tâche touchant ce dépôt n'est terminée tant que ses répercussions n'ont pas été évaluées, incluses dans le MÊME changement et explicitement rapportées sur chacun des six axes ci-dessous** (« non touché » vérifié et affirmé, jamais omis — le coût en jetons n'est jamais un motif de l'abréger) :

| # | Axe | Éléments à inspecter et synchroniser |
|---|---|---|
| 1 | **Outils MCP (`juris`)** | `src/mcp/registry.ts` (12 outils sans préfixe : `verify_citations`, `find_case`, `get_case`, `citator`, `subsequent_history`, `browse_cases`, `list_databases`, `browse_legislation`, `get_legislation`, `parse_citation`, `list_exempt_cases`, `check_exempt_cases`), `src/mcp/handlers/*.ts`, `test/garde.test.ts`, `test/rpc.test.ts`, `test/doc.test.ts` (`NOMS.length === 12`, `EN_LETTRES`) |
| 2 | **Descriptions et titres** | `src/mcp/registry.ts` (`title`, `description`, `INSTRUCTIONS`, `PUBLIC_DESCRIPTION`), `OUTILS_EN` dans `src/site.i18n.ts` (parité dans les deux sens, mention de `CanLII` en FR et EN), `GARDE_*` dans `src/format/render.ts` et chaîne de couplage `"base(s) au répertoire de CanLII"` dans `listDatabases.ts` (`scripts/refresh-databases.mjs`) |
| 3 | **Schémas d'entrée** | `inputSchema` dans `src/mcp/registry.ts` (`additionalProperties: false`, zéro `x-mcp-header`, valeurs issues de `src/mcp/defauts.ts`, contraintes XOR/format/bornes croisées répétées sur chaque paramètre) |
| 4 | **`README.md`, sécurité, licence & manifestes** | `README.md` (`## Les douze outils`), `SECURITY.md`, `LICENSE` (`Apache-2.0`), `NOTICE` (sources officielles et conditions CanLII BYOK), `package.json`, `plugin.json`, `mcp_config.json`, `gemini-extension.json`, `/mcp/server-card`, `CLAUDE.md`, `GEMINI.md` |
| 5 | **Page publique HTML (`GET /`)** | `src/site.ts` + `src/site.i18n.ts` (`test/site.test.ts` : CSP, absence de CORS, `/mcp/<secret>`, liste blanche stricte d'URLs `https://` : écrire `acces.poirierlavoie.ca` sans schéma dans la prose de la page, parité `data-l="fr"` = `data-l="en"`, style jumeau `system-ui`) |
| 6 | **Inter-dépôts (`Cross-repository`)** | `droit-civil-quebecois` (`v3.4.0`, manifestes, `skills/`, `verifier.py`, `verifier_tout.py`), `MCP-Socle` (`v0.8.8`), `MCP-Acces` (`mcp-identite`), `MCP-Legislation` (jumeau HTML/CSS), `MCP-Outils` |

---

## 1. Architecture et cadre global (`droit-civil-quebecois`)

```
          ┌──────────────────────────────────────────────────────────────┐
          │         droit-civil-quebecois (Plugin Cadre v3.4.0)          │
          │ 10 compétences · 60 feuilles · 6 personas · 4 scripts stdlib │
          └─────────┬───────────────────────┬──────────────────┬─────────┘
                    │                       │                  │
        (serveur `lois`, 10 outils)  (serveur `juris`, 12)  (serveur `outils`, 15)
                    │                       │                  │
                    ▼                       ▼                  ▼
         ┌─────────────────────┐ ┌─────────────────────┐ ┌──────────────────────────┐
         │   MCP-Legislation   │ │  MCP-Jurisprudence  │ │        MCP-Outils        │
         │  D1 `legislation` + │ │  D1 `canlii` + BYOK │ │   4 D1 RO + `DB_IDENTITE` │
         │  `DB_IDENTITE` + AI │ │   `DB_IDENTITE`     │ │  (sans clé API CanLII)   │
         └──────────┬──────────┘ └──────────┬──────────┘ └────────────┬─────────────┘
                    └───────────────────────┴─────────────────────────┘
                                ▼ (`@poirierlavoie/mcp-socle` v0.8.8, zéro runtime dep)
                 ┌──────────────────────────────────────────┐
                 │  MCP-Socle + MCP-Acces (`mcp-identite`)  │
                 │  Jetons individuels, coffre AES-256-GCM  │
                 │  OAuth 2.1 PKCE S256, quotas UTC         │
                 └──────────────────────────────────────────┘
```

### Découpage interne (`src/`, zéro dépendance d'exécution)
- `src/index.ts` — Double montage `/mcp` et `/mcp/oauth`, chaîne intergicielle en 12 étapes, garde BYOK `ouvrirCoffre` préalable au cache, quotas `local`/`sortant`, `carteServeur()`, `scheduled`.
- `src/config.ts` — Lecture typée des `vars` (`mcpActif`, `persisterBalayages`, `entier`).
- `src/mcp/` — `defauts.ts` (`LIMITES`, `OFFSET_*`), `registry.ts` (12 descripteurs, annotations `readOnlyHint: true, destructiveHint: false, idempotentHint: true`, `openWorldHint: false` sur `parse_citation` et `list_exempt_cases`), `handlers/` (+ `cible.ts`).
- `src/authorities/` & `src/data/` — Normalisation/appariement des 27 listes d'autorités dispensées (`data/autorites-dispensees.md` + `data/autorites-enrichies.json` compilés dans `src/data/exemptAuthorities.{json,ts}`).
- `src/citation/` — Analyseur pur hors ligne (`parse.ts`, `normalize.ts`, `compare.ts`).
- `src/canlii/` — Client REST séquentiel étranglé (`600 ms`, doublement sur `429` jusqu'à `4 s`, plafond `40` appels/invocation, `12 Mo` max, `redactUrl()`).
- `src/store/` — D1 `canlii` (`cases.ts` + FTS5 + colonnes bilingues FR/EN `0007_bilingual_case_titles.sql`, `databases.ts` incluant `runScheduled`, `citator.ts`, `lookup.ts`).
- `src/format/` — Rendu texte français (`fr.ts`, `render.ts` — zéro `structuredContent`, zéro `outputSchema`, D4, étiquetage `Mots-clés (index CanLII, non vérifiés)`).
- **Amorce documentée (ne pas supprimer par erreur) :** `idx_cases_docket` dans `migrations/0001_initial.sql`.

---

## 2. Contrôle d'accès Phase 3, BYOK CanLII, CORS/CSP et confidentialité

1. **Double montage (`/mcp` et `/mcp/oauth`) et coupe-circuit (`MCP_ENABLED`) :**
   - `MCP_ENABLED !== "true"` coupe `/mcp*`, `/.well-known/oauth-protected-resource/mcp/oauth` et `/health` en `404`, tout en laissant `GET /` accessible (`200`, `G22`).
   - `/mcp` (`PORTE`, `segmentBorne: false`) accepte en parallèle les jetons individuels `DB_IDENTITE` (`portee` `'tous'`, `'jurisprudence'` ou `'les_deux'` héritée, état `actif`, `surveille` ou `limite`) et le secret partagé transitoire (`MCP_SHARED_SECRET`), sous `Authorization: Bearer <jeton>`, `?key=<jeton>` ou `/mcp/<secret>` (barre finale et barres internes tolérées). Tout refus sur `/mcp` renvoie **uniformément `404` à corps vide sans `WWW-Authenticate`** (`S8`, `G7`, `G21`, `G23`). `/mcp/server-card` (`/.well-known/mcp/server-card.json`) et `/mcp/oauth` sont interceptés avant `/mcp/<secret>`.
   - `/mcp/oauth` (`PORTE_OAUTH`, `autoriserChemin: false`) accepte **exclusivement** `Authorization: Bearer <jeton>` (aucun `?key=`, aucun segment `/mcp/oauth/<x>`, aucun secret partagé de Worker) et répond `401` RFC 9728 pointant vers `GET /.well-known/oauth-protected-resource/mcp/oauth` (`https://acces.poirierlavoie.ca`), tandis que la racine `GET /.well-known/oauth-protected-resource` reste en `404`.
   - Le contrôle de méthode `POST` (`405`) est exécuté **après** l'authentification sur `/mcp` comme sur `/mcp/oauth` (`G23`).
2. **CORS sur `/mcp*` et en-têtes CSP sur `GET /` :**
   - Sur `/mcp*`, un en-tête `Origin` **présent mais inconnu** est refusé d'emblée par `403` avant pré-vol, limitation de débit et auth ; `Origin` **absent** passe (appels serveur à serveur). Le pré-vol `OPTIONS` sans jeton autorise `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`, `Mcp-Session-Id`, `X-Clef-CanLII`, `Content-Type`, `Authorization`, `Accept` et `Last-Event-ID`, sans jamais être limité en débit (`G6`). `Vary: Origin` accompagne toute réponse reflétée, et `401` (`/mcp/oauth`) porte les en-têtes CORS.
   - Sur `GET /` uniquement : `Content-Security-Policy` (`default-src 'none'`, `frame-ancestors 'none'`, `base-uri 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cache-Control` court sans `s-maxage`, et **aucun en-tête CORS** sur `/`, `/health` et `/mcp/server-card`.
3. **Garde stricte BYOK CanLII préalable au cache partagé (`S10`–`S12`, `S17`, `G8`, `G10`, `G38`) :**
   - Pour tout `titulaire` sur les 10 outils pouvant interroger CanLII (`!SANS_APPEL.has(nom)` sauf `check_exempt_cases` lorsque `resolve_canlii === false`, qui compte en `local`), la clé est résolue via `ouvrirCoffre` (`X-Clef-CanLII` → `DB_IDENTITE.coffre_clef` `usage='canlii'`, secrets maîtres `COFFRE_MAITRE_V1`/`V2`) **avant** toute lecture de `cases`, `cases_fts` ou `citator_*`, avec **zéro retombée** sur `env.CANLII_API_KEY` (`G8`). Sans clé valide, l'outil renvoie HTTP `200` `isError: true` `[CLEF_ABSENTE]` ou `[CLEF_REFUSEE]` sans lire le cache.
   - Si un appel sortant CanLII échoue en `401`/`403` avec la clé du coffre (`provenance === "coffre"`, et non sur une surcharge `X-Clef-CanLII`), `coffre_clef.etat` passe à `'refusee'` dans `ctx.waitUntil` et l'outil renvoie `[CLEF_REFUSEE]` vers `https://acces.poirierlavoie.ca/moi`.
   - Aucun horodatage exact `fetched_at` n'est exposé dans la prose rendue (`G38`).
4. **Débit à deux niveaux, quotas exacts `local`/`sortant` et zéro journal de contenu (`G9`, `G32`, `G34`, `G37`) :**
   - Liaisons `ratelimits` distinctes (`1021..1025`) : `RL_PRE_AUTH_IP` (600/min), `RL_ECHEC_IP` (20/min), `RL_ECHECS_GLOBAL` (300/min) + `QuarantaineIpEchecs` contournée par tout jeton valide déjà reconnu (`G32`), puis `RL_TITULAIRE` (180/min) et `RL_TITULAIRE_LIMITE` (20/min).
   - Quotas journaliers UTC vérifiés sur le nom d'outil du corps JSON-RPC : un appel servi à 100 % depuis le cache D1 ou hors ligne (`parse_citation`) compte en `local` (`callsMade() === 0`) ; tout appel émettant >= 1 requête CanLII compte en `sortant` (`callsMade() > 0`), et toute tentative d'appel sortant lorsque le quota `sortant` est épuisé est bloquée avant le réseau en renvoyant `[QUOTA_EPUISE]` tout en laissant réussir les purs succès de cache sous quota `local`.
   - Aucune écriture d'exécution dans `search_log` ni `api_usage` ; `"observability": { "enabled": false, "logs": { "enabled": false, "invocation_logs": false } }` dans `wrangler.jsonc` (`G37`) ; seuls `compteur_jour` et `evenement_technique` (distinguant `"introuvable"` sur `404` de `"erreur_amont"` sur `429`/panne, purgés à 90 j) sont écrits via `ctx.waitUntil` dans `DB_IDENTITE`.

---

## 3. Règles D1, client CanLII et contrat des outils

- **TTLs D1 et immutabilité des migrations :** `cases` = **permanent** (rafraîchissement forcé par `refresh: true`) ; `citator_edges` (`rel='cited'|'legislation'`) = **permanent**, (`rel='citing'`) = **30 jours** ; `databases` = **7 jours** (cron hebdomadaire `17 6 * * 1` via `runScheduled`). Les fichiers `migrations/*.sql` déjà appliqués en production ne sont **jamais** modifiés rétroactivement (tout changement exige une nouvelle migration numérotée).
- **Client CanLII (réessais, lecture entière, `TOO_LONG`, `caseId`) :**
  - Réessais sur `429`, `500`, `502`, `503`, `504` : 3 tentatives, temporisation exponentielle + gigue `0–200 ms`, base **2 s** sur `429` / **500 ms** sur `5xx`, `Retry-After` prioritaire ; **zéro réessai** sur `400`, `401`, `403`, `404`.
  - Lecture du corps **entière** avant `JSON.parse` (jamais de troncature préalable) ; plafond défensif de **12 Mo** (au-dessus de 10 Mo CanLII) refusant toute la réponse en français plutôt que d'atteindre 128 Mo d'isolat ; corps d'erreur borné à **512** car. après `redactUrl()`.
  - `TOO_LONG` (ou > 12 Mo) : diviser `resultCount` par deux et réessayer une fois (uniquement sur points d'accès paginés à `resultCount` fini, **jamais** sur `legislationBrowse/{lang}/{db}/`).
  - Aplatir `caseId` retourné par les listes CanLII sous forme d'objet par langue (`{"en": "..."}` ou `{"fr": "..."}`).
- **Frontière `isError`, `dateScheme`, `databases.type`, `citationSure` et hiérarchie :**
  - `isError: true` (HTTP `200`, jamais erreur JSON-RPC) **uniquement** quand l'outil n'a rien à livrer (argument refusé, forme invalide, panne sortante sans repli) ; `isError: false` dès qu'un résultat part, même vide, partiel ou dégradé (avec réserve dans le corps).
  - `dateScheme` (`ENTRY_INTO_FORCE` = version consolidée, `DOWNLOAD_DATE` = jour de téléchargement) et `databases.type` (`ANNUAL_STATUTE`, `REVISED_STATUTE`, `CONSTITUTION`, etc.) sont des énumérations CanLII non closes : rendre `dateScheme` brut entre guillemets + glose prudente (« régime inconnu de ce connecteur » sinon) ; ne jamais traduire `databases.type` ni déduire l'entrée en vigueur ou l'abrogation d'un texte depuis `startDate`/`endDate` (`GARDE_VERSION_LEGISLATIVE`).
  - `citationSure` (`verify_citations`, `check_exempt_cases`) replie les blancs (incl. `\u2028`/`\u2029`) sur espace simple, retire les caractères de contrôle (NUL..DEL) et borne à 200 car. pour empêcher toute ligne de verdict forgée.
  - Hiérarchie des tribunaux (`subsequent_history`) : `qccq`/`qctal`/`qctat`/`qctaq` → `qccs`, `qcca`, `csc-scc` ; `qccs` → `qcca`, `csc-scc` ; `qcca` → `csc-scc` ; autres → `csc-scc` (similarité d'intitulé `>= 0.5` FR/EN + `decisionDate` postérieure).
- **Forfait Workers Paid :** `wrangler.jsonc` `limits` (`cpu_ms: 30000`, `subrequests: 200`) suppose le forfait Workers Paid (Workers Free plafonne à `10 ms` CPU / `50` sous-requêtes).

---

## 4. Les 22 invariants critiques

1. **`INSERT ... ON CONFLICT DO UPDATE`, jamais `INSERT OR REPLACE`** sur `cases` (préserve le `rowid` de `cases_fts` en *external content* et préserve `title_fr`/`url_fr`/`keywords_fr` vs `*_en` par `COALESCE` ; `lookupCase` exige la colonne de la langue demandée avant de servir le cache).
2. **Clé de cache = identifiant DEMANDÉ** (et non le `caseId` localisé retourné par CanLII).
3. **`source` distingue `'lookup'` de `'sweep'` et ne se rétrograde jamais :** seule une ligne `'lookup'` sert une fiche ou une vérification ; un balayage ne persiste que 4 champs et ne fabrique **jamais** de date `${annee}-01-01` (`anneeInferee` sert uniquement au tri/filtre).
4. **Mises en garde dans le CORPS des réponses (`GARDE_*`)**, zéro `structuredContent`, zéro `outputSchema` (`test/garde.test.ts` ne s'affaiblit jamais).
5. **Ne jamais journaliser `request.url` ni exposer `api.canlii.org` / `api_key`** (`redactUrl()`).
6. **Boucle unique d'auto-correction dans `src/store/lookup.ts`**.
7. **Regex `NEUTRAL` et `NEUTRAL_CONCAT` insensibles à la casse (`/i`)** (y compris `2008csc64`, `2020qcca495`, `1997canlii335`), double parade contre `"CanLII"`, extraction prudente d'intitulé de tête (`inlineTitle`, D1) et garde d'année future (`> anneeCourante + 1`, D21).
8. **Tribunal absent du répertoire ⇒ `INTROUVABLE` sans appel sortant** (`find_case` sans `database_id` impose `<= 3` ans avant l'index local et inclut `csc-scc` dans `BASES_QC_USUELLES`, D9).
9. **Une panne réseau (`401`, `429`, timeout, budget, corps illisible) n'est JAMAIS une absence :** rend `INDÉTERMINÉE` (`EXPLICATION_INDETERMINEE`, en-tête `Recherche INTERROMPUE`), tandis que `EXPLICATIONS_INTROUVABLE` est réservée au seul constat `404`.
10. **Appariement d'intitulé partiel ⇒ `DISCORDANTE`**, jamais `CONFIRMÉE` ; comparaison sur `expected_title` ET `inlineTitle`, contre toutes les versions FR/EN connues avec 1 repli vers l'autre langue avant `DISCORDANTE` (D1, D2).
11. **Intitulés anonymisés comparés par leur numéro** (*« Droit de la famille — 20495 »*).
12. **Citateur CanLII sur `caseCitator/en` avec localisation par cache (D22) :** `citator` et `subsequent_history` acceptent `lang` (`'fr'`|`'en'`, défaut `'fr'`), substituent `title_fr`/`title_en` depuis `cases` si disponibles, comparent les intitulés FR/EN et divulguent `caseCitator/en` lorsque des intitulés restent en anglais.
13. **La télémétrie n'échoue jamais l'outil qu'elle observe** (`catch` silencieux dans `ctx.waitUntil`).
14. **Fins de ligne LF partout** (`.gitattributes`).
15. **Aucun moissonnage de masse :** seul un cron hebdomadaire (`17 6 * * 1`) rafraîchit le répertoire des tribunaux via `runScheduled`.
16. **12 outils sans préfixe sous clé `juris`**, chacun nommant `CanLII` en FR et EN (`openWorldHint: false` sur `parse_citation` et `list_exempt_cases`) et renvoyant aux connecteurs `« lois »` et `« outils »` (D14).
17. *(Retiré en v0.3.0 — transféré vers `MCP-Outils` : `palais_*`.)*
18. *(Retiré en v0.3.0 — transféré vers `MCP-Outils` : `lieux.ts`.)*
19. **La page publique (`GET /`) dérive de `listToolDescriptors()`**, hors du bloc `/mcp`, sans CORS, et survit à `MCP_ENABLED=false`.
20. *(Retiré en v0.3.0 — transféré vers `MCP-Outils` : `dossier.ts`.)*
21. **Identité visuelle jumelle avec `MCP-Legislation`** (`system-ui`, variables CSS clair/sombre identiques, zéro couleur en dur hors des deux jeux).
22. **Refus `/mcp` uniforme en `404` vide sans `WWW-Authenticate` (Phase 3)** et OAuth 2.1 confiné sur `/mcp/oauth` (`401` RFC 9728) ; tolérance de tous les porteurs sur `/mcp` sans rognage destructif (`segmentBorne: false`, `%FF` géré sans `500`).

---

## 5. Secrets et commandes sûres

- **Interdiction absolue** de lire, afficher, copier ou commiter : `cf.token`, `*.token`, `mcp.url`, `.dev.vars`, `.env*`, `~/.gemini/config/*`, `CANLII_API_KEY`, `MCP_SHARED_SECRET`, `COFFRE_MAITRE_V*`.
- **Note Windows (`\r\n`) :** `openssl` et certains éditeurs Windows émettent `\r\n` (`tr -d '\n'` laisse `\r` causant des `401`/`403` silencieux) — toujours rogner les secrets/jetons avec `tr -d '\r\n'` ou `(Get-Content cf.token -Raw).Trim()`.
- **Interdiction absolue** d'exécuter `wrangler d1 delete` ou `wrangler deploy` seul (toujours `npm run deploy` / `scripts/deployer.mjs`, qui applique les migrations avant `wrangler deploy --var COMMIT:<sha>`).
- **Gouvernance Git (`main-pr-and-ci`) :** Le contournement administrateur du ruleset `main-pr-and-ci` est restreint à `pull_request` — **ne jamais pousser directement sur `main`** ; travailler sur une branche dédiée, ouvrir une Pull Request, attendre le passage des contrôles requis (`CI`, `CodeQL`, `OSV-Scanner`, `Trivy`), puis fusionner par *squash* (`gh pr merge --squash --delete-branch`).

```powershell
npx.cmd wrangler types
npx.cmd tsc --noEmit
npx.cmd biome check .
npm.cmd run audit
npx.cmd vitest run
npx.cmd wrangler deploy --dry-run
```
