# GEMINI.md — MCP Jurisprudence

Règles d'espace de travail pour **Google Antigravity** et **Gemini CLI** lors du développement de ce dépôt.

> **Pourquoi ce fichier n'est pas une copie verbatim de [`CLAUDE.md`](CLAUDE.md)**
> 1. Antigravity tronque silencieusement tout fichier de règles au-delà de **24 000 octets** (per-file cap), et [`CLAUDE.md`](CLAUDE.md) dépasse **40 Ko** — une copie identique amputerait la fin des invariants et les consignes de déploiement/secrets sans avertissement.
> 2. L'invariant 19 interdit les copies normatives susceptibles de dériver en silence.
> 3. La racine héberge aussi le manifeste Gemini CLI [`gemini-extension.json`](gemini-extension.json), qui déclare `"contextFileName": []` afin de ne pas injecter ces consignes de maintenance dans les sessions d'usage normal du connecteur.
>
> **Obligation préalable :** lire [`CLAUDE.md`](CLAUDE.md) et [`SPEC.md`](SPEC.md) (§1 Décisions arrêtées, §2 Contrat de vérité, §18 Page publique) **avant toute modification**. Ce document reste volontairement sous **24 000 octets** (épinglé par `test/doc.test.ts`).

---

## Règle de propagation — obligatoire, sans exception

Aucune modification n'est terminée tant que ses répercussions n'ont pas été évaluées et incluses dans le **même** changement sur les cinq surfaces :

1. **Outils MCP** (`src/mcp/registry.ts`, `src/mcp/handlers/`, partition `jurisprudence_*` vs `greffe_*`/`palais_*`, annotations `readOnlyHint`/`openWorldHint`).
2. **Descriptions et titres** (`registry.ts`, `INSTRUCTIONS`, `OUTILS_EN` dans `src/site.i18n.ts` — traduction véritable, jamais copie).
3. **Schémas d'entrée** (`src/mcp/validate.ts`, constantes de `src/mcp/defauts.ts` uniquement, `additionalProperties: false`, `description` sur chaque paramètre, règles inter-champs répétées sur chaque paramètre concerné).
4. **Documentation et manifestes** (`README.md`, `SPEC.md`, `CLAUDE.md`, `plugin.json`, `mcp_config.json`, `gemini-extension.json`, `/mcp/server-card`, `test/doc.test.ts`).
5. **Page publique** (`src/site.ts` + `src/site.i18n.ts`, §18) — le contenu **dérive** du registre et des tables, sans copie ni URL tierce non admise (`test/site.test.ts`).

Le coût en jetons de cette relecture est assumé. Penser aussi aux consommateurs hors dépôt (p. ex. compétence claude.ai de recherche juridique, plugin `pratique-civile-quebecoise`) lors d'un renommage d'outil.

---

## Contrat de vérité (§2) — non négociable

- C'est un **outil juridique** : un résultat faux rendu en silence est le pire défaut possible — **refuser vaut toujours mieux que deviner**.
- L'API CanLII est en **lecture seule** et ne renvoie que des **métadonnées**, jamais le texte ni l'autorité actuelle d'une décision.
- Ne **jamais** affaiblir `GARDE_*` (`src/format/render.ts`) ni `test/garde.test.ts` ni `test/site.test.ts` : si un test de garde échoue, rétablir la garantie dans le code.
- **Jamais** de `structuredContent` ni d'`outputSchema` (D4 / invariant 4) : les mises en garde doivent rester inséparables du corps textuel rendu au modèle.
- Formulations interdites hors négation/citatifs contrôlés : « n'existe pas », « n'a jamais existé », « a été infirmée », « toujours en vigueur », « fait autorité », « citation valide ».

---

## Les 22 invariants critiques (synthèse — détails dans `CLAUDE.md`)

1. **`INSERT ... ON CONFLICT DO UPDATE`**, jamais `INSERT OR REPLACE` sur `cases` (préserve `rowid` et l'index FTS5).
2. **Clé sur `caseId` demandé**, pas sur la langue retournée par CanLII (`2008scc9` vs `2008csc9`).
3. **`source` ne rétrograde jamais** : seule `source = 'lookup'` sert de fiche/vérification ; un balayage ne fabrique ni n'écrit jamais de `decision_date` (une année inférée reste en `anneeInferee`).
4. **Mises en garde de §2 dans le corps** des réponses, zéro `structuredContent` / `outputSchema`.
5. **Ne jamais journaliser `request.url`** (secret dans `/mcp/<secret>` ou `?key=`) ni émettre d'URL `api.canlii.org` (`redactUrl()`).
6. **Boucle d'auto-correction (§6.4)** en un seul exemplaire dans `src/store/lookup.ts`.
7. **`NEUTRAL` avec `/i`**, masquage CanLII + rejet du code `CANLII` cumulés.
8. **Tribunal absent du répertoire** ⇒ `INTROUVABLE` sans appel sortant.
9. **Panne réseau (`401`/`429`/timeout) ⇒ `INDÉTERMINÉE`**, jamais `INTROUVABLE` ; explications d'absence sur `404` uniquement ; balayage interrompu annoncé en **en-tête** sans troncature ni mention rassurante trompeuse.
10. **Appariement d'intitulé partiel ⇒ `DISCORDANTE`**, jamais `CONFIRMÉE`.
11. **Intitulés anonymisés** comparés par leur numéro (`Droit de la famille — NNNNN`).
12. **`jurisprudence_citator`** utilise `en` uniquement dans le chemin (annexe B) — aucun paramètre `lang`.
13. **Télémétrie (`search_log`, `api_usage`)** n'échoue jamais l'outil observé.
14. **Fins de ligne LF (`\n`)** obligatoires (`.gitattributes`), sinon Biome Windows et Linux CI divergent.
15. **§11 (`BACKFILL_ENABLED="false"`)** reste inerte par décision du praticien (2026-07-23) ; ne pas basculer le drapeau.
16. **Préfixes partitionnent (`jurisprudence_*` vs `greffe_*`/`palais_*`), descriptions nomment la source** ; `openWorldHint` vaut `false` sur les 4 outils sans appel sortant et `true` sur les 9 autres.
17. **Tables `src/qc/` = relevé daté** (`GARDE_PALAIS` avec dates `RELEVE_LE` et `MJQ_MAJ`) ; ne pas confondre `point_de_service`, `location_type` et `lieux.itinerant` ; adresse absente = **inconnue**.
18. **`src/qc/lieux.ts`** fait autorité sur le rattachement (extrait de `sources-officielles/`) ; passer par `adresseDuGreffe()`. Ne jamais supprimer `sources-officielles/`.
19. **Page publique (`/`) et `/mcp/server-card` DÉRIVENT** des données vives (`listToolDescriptors()`, `SERVER_INFO`, `VERSIONS`, `src/qc/`, `GARDE_*`) ; zéro copie manuelle. Route `/` = égalité stricte, hors garde `/mcp*`, zéro en-tête CORS, survit au coupe-circuit (`MCP_ENABLED=false`).
20. **`src/qc/dossier.ts` = port vérifié par différentiel** (`test/fixtures/dossier-athena.json`, 127 cas) : ni somme de contrôle ni règle d'année inventée.
21. **Style de page identique au connecteur jumeau** (« Législation du Québec ») : aucune couleur en dur hors jeux clair/sombre, mêmes variables CSS des deux côtés.
22. **Refus `/mcp` (`401`) déclenche la découverte OAuth des clients** : conserver les porteurs sans préséance (chemin `/mcp/<secret>`, `Authorization: Bearer`, `?key=`), tolérance élargissante seulement (barres finales, `decodeURIComponent` sans lever 500), aucun rognage de secret. Exception nommée `/mcp/server-card` (SEP-2127) : publique sans secret, respecte `MCP_ENABLED`.

---

## Secrets & éléments à ne pas « nettoyer »

- **Interdiction absolue** de lire, afficher ou copier : `.dev.vars`, `mcp.url`, `cf.token` / `*.token`, `~/.gemini/config/mcp_config.json`, `CANLII_API_KEY`, `MCP_SHARED_SECRET`.
- **Ne pas supprimer comme « code mort »** : `src/backfill.ts`, `listCases()` (`src/store/cases.ts`), `idx_cases_docket` (`migrations/0001_initial.sql`), `sources-officielles/`.
- **Ne pas fusionner** `src/store/lookup.ts` (boucle D1/CanLII avec E/S) et `src/qc/lookup.ts` (tables en mémoire sans E/S).

---

## Procédure sûre & commandes (Windows PowerShell)

Dans PowerShell Windows avec `ExecutionPolicy Restricted`, préférer `npm.cmd` et `npx.cmd`. Tous les tests tournent dans `workerd` sans réseau ni clef d'API :

```powershell
npx.cmd wrangler types
npx.cmd tsc --noEmit
npx.cmd biome check .
npx.cmd vitest run
npx.cmd wrangler deploy --dry-run
```

**Déploiement continu sur `main` et repli local (§12) :** un `push` sur `main` déclenche `.github/workflows/deploy.yml` (`environment: production`), qui exécute `npm run deploy` (`scripts/deployer.mjs` : migrations D1 **avant** le déploiement avec `--var COMMIT:<sha>`). Ne **jamais** exécuter `npx wrangler deploy` seul, et ne jamais lancer de déploiement local en production sans instruction explicite du praticien.
