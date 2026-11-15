# GEMINI.md — MCP Jurisprudence

Règles d'espace de travail pour **Google Antigravity** et **Gemini CLI** lors du développement sur le connecteur `mcp-jurisprudence`.

> **Pourquoi ce fichier n'est pas une copie verbatim de [`CLAUDE.md`](CLAUDE.md)**
> 1. Antigravity tronque silencieusement tout fichier de règles au-delà de **24 000 octets** (per-file cap). [`CLAUDE.md`](CLAUDE.md) et [`SPEC.md`](SPEC.md) sont plus volumineux — une copie verbatim dépasserait la limite et tronquerait les invariants.
> 2. L'invariant 19 interdit les copies normatives manuelles susceptibles de dériver en silence.
> 3. La racine héberge le manifeste Gemini CLI [`gemini-extension.json`](gemini-extension.json), qui déclare `"contextFileName": []` afin de ne pas injecter ces consignes d'administration dans les sessions utilisateur normales.
>
> **Obligation préalable :** Lire [`CLAUDE.md`](CLAUDE.md) et [`SPEC.md`](SPEC.md) (§1 Décisions arrêtées, §2 Contrat de vérité, §18 Page publique) **avant toute modification**. Ce document reste sous **24 000 octets** (épinglé par `test/doc.test.ts`).

---

## 1. Rôle architectural et intégration dans le cadre global

`mcp-jurisprudence` est le serveur MCP sécurisé d'interrogation et de vérification des métadonnées de jurisprudence CanLII, déployé comme Cloudflare Worker sur `https://jurisprudence.poirierlavoie.ca/mcp`.

```
             ┌────────────────────────────────────────────────────────┐
             │       pratique-civile-quebecoise (Plugin Cadre)        │
             │   5 compétences : recherche-juridique, analyse-doc,     │
             │  calendrier-proc, redaction-juridique, déontologie     │
             └──────┬───────────────────────┬──────────────────┬──────┘
                    │                       │                  │
   (10 outils `legislation_*`)    (10 outils `jurisprudence_*`) (6 outils `calendrier_*`,
                    │                       │           `interets_*`, `greffe_*`, `palais_*`)
                    ▼                       ▼                  ▼
         ┌─────────────────────┐ ┌─────────────────────┐ ┌──────────────────────────┐
         │   MCP-Legislation   │ │  MCP-Jurisprudence  │ │  pratique-civile-outils  │
         │  (Worker Cloudflare │ │ (Worker Cloudflare  │ │    (Worker Cloudflare    │
         │  D1 + Vectorize +   │ │  D1 cache CanLII    │ │    public, sans état,    │
         │    Workers AI)      │ │  authentifié Bearer │ │    zéro secret, Zod)     │
         └──────────┬──────────┘ └──────────┬──────────┘ └──────────────────────────┘
                    │                       │
                    └───────────┬───────────┘
                                ▼ (dépendance de dev `#v0.6.2`, zéro runtime dep)
                 ┌─────────────────────────────┐
                 │    MCP-Socle-Juridique      │
                 │  Transport JSON-RPC 2.0     │
                 │  Streamable HTTP sans état  │
                 │  Auth SHA-256 temps constant│
                 │  Zéro concept juridique     │
                 └─────────────────────────────┘
```

### Intégration avec les compétences du plugin (`pratique-civile-quebecoise`)
- **`skills/recherche-juridique`** : Consommateur principal des 10 outils `jurisprudence_*` pour vérifier les citations (`jurisprudence_verify_citations`), rechercher des jugements par intitulé et année (`jurisprudence_find_case`), explorer le citateur (`jurisprudence_citator`), et retracer l'historique d'appel (`jurisprudence_subsequent_history`). L'outil rappelle que CanLII ne livre que des métadonnées (jamais le texte intégral d'un jugement). Nomme également les 10 outils `legislation_*`, `greffe_parse_court_file_number`, `palais_list`, `palais_get` et `interets_compute_1619` (notamment dans `references/methode-sources.md`, `livrables.md`, `preliminaires.md`, `sources-doctrinales.md`), et mobilise les besoins d'aptitude `TEXTE`, `CALCUL`, `GREFFE`, `INSCRIPTION`.
- **`skills/redaction-juridique`** : Consomme `legislation_get_article` (dont `lang="en"`), `legislation_search_text`, `calendrier_compute_deadlines` et `interets_compute_1619` (besoins `CALCUL`, `GREFFE`).
- **`skills/calendrier-procedural`** : Consomme `calendrier_compute_deadlines` et `calendrier_list_holidays` (avec repli local `scripts/calcul_delai.py`, besoins `CALCUL`, `INSCRIPTION`, `TEXTE`). N'appelle aucun outil `jurisprudence_*` ni `legislation_*` directement.
- **`skills/analyse-documentaire`** : Ne nomme AUCUN outil MCP directement. Exprime des besoins d'aptitude abstraits `GREFFE`, `TEXTE` et `INSCRIPTION`, en déléguant la recherche juridique et la vérification de citations à `recherche-juridique` et les délais à `calendrier-procedural`.
- **`skills/deontologie-professionnelle`** : Ne nomme AUCUN outil MCP directement ; délègue le droit substantiel et procédural hors déontologie à `recherche-juridique` et les délais à `calendrier-procedural`.
- **Configuration** : Connecté dans `.mcp.json` et `gemini-extension.json` via l'URL `https://jurisprudence.poirierlavoie.ca/mcp` avec `Authorization: Bearer ${MCP_JURISPRUDENCE_SECRET}`.

### Dépendances croisées inter-dépôts
- **`MCP-Socle-Juridique`** : Intègre `@poirierlavoie/socle-juridique#v0.6.2` en `devDependencies` pour le transport MCP Streamable HTTP révision `2026-07-28`, l'enveloppe JSON-RPC 2.0, l'authentification SHA-256 à temps constant (`timingSafeEqual`) et la fiche SEP-2127 (`/mcp/server-card`). Zéro dépendance d'exécution (`dependencies: {}`).
- **`MCP-Legislation`** : Connecteur jumeau partageant la même identité typographique (Georgia) et les mêmes variables CSS sur sa page d'accueil `GET /`.
- **Transfert historique du 2026-11-14 vers `pratique-civile-outils`** : Les 3 outils québécois hors ligne (`greffe_parse_court_file_number`, `palais_list`, `palais_get`), les tables statiques du MJQ (`src/qc/`), `lieux.ts`, `sources-officielles/` et le parseur de dossier ont été transférés à `pratique-civile-outils`. Ce dépôt se consacre désormais exclusivement à CanLII et à l'analyseur de citations.

---

## 2. Contrat de vérité (§2) et Invariant D4 — Non négociables

- **Outil juridique** : Un résultat faux rendu en silence est le pire défaut possible — **refuser vaut toujours mieux que deviner**.
- **Invariant D4 : Sortie textuelle pure Markdown (`content[0].text`), ZÉRO `structuredContent`, ZÉRO `outputSchema`**. Les mises en garde statutaires, statuts d'appariement et réserves (`GARDE_*` dans `src/format/render.ts`) doivent obligatoirement rester inséparables du corps textuel rendu au modèle pour éviter qu'un schéma JSON ne permette au LLM d'ignorer les avertissements.
- **Lecture seule** : L'API CanLII est en lecture seule et ne renvoie que des métadonnées, jamais le texte intégral ni l'autorité actuelle d'une décision.
- **Refus HTTP 401** : Tout appel non authentifié est rejeté avec `401 Unauthorized` et l'en-tête `WWW-Authenticate: Bearer` (déclenche la découverte OAuth des clients).
- **Formulations interdites** hors négation/citatifs contrôlés : « n'existe pas », « n'a jamais existé », « a été infirmée », « toujours en vigueur », « fait autorité », « citation valide » (gardé par `test/garde.test.ts`).
- **Verdicts stricts** : Panne réseau (`401`/`429`/timeout) renvoie `INDÉTERMINÉE` (jamais `INTROUVABLE` ; seul un 404 CanLII donne `INTROUVABLE`). Appariement d'intitulé partiel renvoie `DISCORDANTE` (jamais `CONFIRMÉE`).

---

## 3. Évaluation d'impact obligatoire — Cinq surfaces locales (`README.md`, Page publique HTML) et inter-dépôts

Aucune modification n'est terminée tant que ses répercussions n'ont pas été **évaluées, incluses dans le même changement et explicitement rapportées** sur les six axes ci-dessous (« non touché » doit être vérifié et énoncé, jamais passé sous silence) :

| # | Axe d'impact | Où | Ce qu'il faut évaluer et maintenir synchronisé |
|---|---|---|---|
| 1 | **Outils MCP** | `src/mcp/registry.ts`, `src/mcp/handlers/` | préfixe `jurisprudence_*`, annotations `readOnlyHint`/`openWorldHint`, verdicts et gardes |
| 2 | **Descriptions et titres** | `registry.ts`, `INSTRUCTIONS`, `OUTILS_EN` (`src/site.i18n.ts`) | la page HTML rend les descriptions verbatim ; `OUTILS_EN` doit rester une traduction réelle |
| 3 | **Schémas d'entrée** | `validateArgs` (`@poirierlavoie/socle-juridique`), `src/mcp/defauts.ts` | `additionalProperties: false`, descriptions sur chaque paramètre, contraintes croisées répétées |
| 4 | **`README.md`, gouvernance et manifestes** | `README.md`, [`SPEC.md`](SPEC.md), `SECURITY.md`, `LICENSE` (`CC-BY-NC-SA-4.0`), `package.json`, `plugin.json`, `mcp_config.json`, `gemini-extension.json`, `/mcp/server-card`, `CLAUDE.md`, `GEMINI.md`, `test/doc.test.ts` | ce que le dépôt annonce, ses recettes de connexion, sa licence et sa politique sécurité/confidentialité |
| 5 | **Page publique HTML (`GET /`)** | `src/site.ts`, `src/site.i18n.ts`, §18 de `SPEC.md`, `test/site.test.ts` | le contenu **dérive** du registre et des tables vives ; liste blanche d'URLs stricte, zéro fuite de secret/CanLII API, section `#acces` et pied de page |
| 6 | **Inter-dépôts (`Cross-repository`)** | **`pratique-civile-quebecoise`** (`.mcp.json`, `mcp_config.json`, `gemini-extension.json`, `.claude-plugin/*`, `plugin.json`, `skills/` dont `skills/recherche-juridique`, `regenerer_cache_mcp.py --apply`, `synchroniser_plugin_gemini.py --apply`, `verifier.py`, `verifier_tout.py`), **`MCP-Socle-Juridique`** (`#v0.6.2`), **`MCP-Legislation`** (jumeau HTML/CSS), **`pratique-civile-outils`** | répercussions sur les compétences qui nomment `jurisprudence_*` à la main, cohérence transport/auth et identité visuelle HTML/CSS partagée |

---

## 4. Synthèse des 22 invariants critiques (détails dans `CLAUDE.md`)

1. **`INSERT ... ON CONFLICT DO UPDATE`**, jamais `INSERT OR REPLACE` sur `cases` (préserve `rowid` et l'index FTS5).
2. **Clé sur `caseId` demandé**, pas sur la langue retournée par CanLII (`2008scc9` vs `2008csc9`).
3. **`source` ne rétrograde jamais** : seule `source = 'lookup'` sert de fiche/vérification ; un balayage ne fabrique ni n'écrit jamais de `decision_date` (une année inférée reste en `anneeInferee`).
4. **Mises en garde de §2 dans le corps des réponses**, zéro `structuredContent` / `outputSchema` (Invariant D4).
5. **Ne jamais journaliser `request.url`** (secret dans `/mcp/<secret>` ou `?key=`) ni émettre d'URL `api.canlii.org` (`redactUrl()`).
6. **Boucle d'auto-correction (§6.4)** en un seul exemplaire dans `src/store/lookup.ts`.
7. **`NEUTRAL` avec `/i`**, masquage CanLII + rejet du code `CANLII` cumulés.
8. **Tribunal absent du répertoire** ⇒ `INTROUVABLE` sans appel sortant.
9. **Panne réseau (`401`/`429`/timeout) ⇒ `INDÉTERMINÉE`**, jamais `INTROUVABLE` ; explications d'absence sur `404` uniquement ; balayage interrompu annoncé en en-tête sans troncature.
10. **Appariement d'intitulé partiel ⇒ `DISCORDANTE`**, jamais `CONFIRMÉE`.
11. **Intitulés anonymisés** comparés par leur numéro (`Droit de la famille — NNNNN`).
12. **`jurisprudence_citator`** utilise `en` uniquement dans le chemin (annexe B) — aucun paramètre `lang`.
13. **Télémétrie (`search_log`, `api_usage`)** n'échoue jamais l'outil observé.
14. **Fins de ligne LF (`\n`)** obligatoires (`.gitattributes`).
15. **§11 (`BACKFILL_ENABLED="false"`)** reste inerte par décision du praticien ; ne pas basculer le drapeau.
16. **Préfixe `jurisprudence_*`, description nomme CanLII** ; `openWorldHint` vaut `false` sur `jurisprudence_parse_citation` (analyseur local sans réseau) et `true` sur les 9 autres.
17. *(Déplacé le 2026-11-14)* Les tables `src/qc/` et les outils `greffe_*`/`palais_*` vivent dans `pratique-civile-outils`.
18. *(Déplacé le 2026-11-14)* `lieux.ts` et `sources-officielles/` vivent dans `pratique-civile-outils`.
19. **Page publique (`/`) et `/mcp/server-card` DÉRIVENT** des données vives (`listToolDescriptors()`, `SERVER_INFO`, `VERSIONS`, `GARDE_*`) ; zéro copie manuelle. Route `/` = égalité stricte, survit au coupe-circuit (`MCP_ENABLED=false`).
20. *(Déplacé le 2026-11-14)* Le parseur de dossiers de cour vit dans `pratique-civile-outils`.
21. **Style de page identique au connecteur jumeau** (`MCP-Legislation`) : mêmes variables CSS.
22. **Refus `/mcp` (`401`) déclenche la découverte OAuth des clients** : conserver les porteurs sans préséance (chemin `/mcp/<secret>`, `Authorization: Bearer`, `?key=`), aucun rognage de secret. Exception nommée `/mcp/server-card` (SEP-2127) : publique sans secret.

---

## 5. Secrets et éléments protégés

- **Interdiction absolue** de lire, afficher ou copier : `.dev.vars`, `mcp.url`, `cf.token` / `*.token`, `~/.gemini/config/mcp_config.json`, `CANLII_API_KEY`, `MCP_SHARED_SECRET`.
- **Ne pas supprimer comme « code mort »** : `src/backfill.ts`, `listCases()` (`src/store/cases.ts`), `idx_cases_docket` (`migrations/0001_initial.sql`).

---

## 6. Commandes sûres (PowerShell Windows)

Employer `npm.cmd` et `npx.cmd`. Tous les tests tournent dans `workerd` sans réseau ni clef d'API :

```powershell
npx.cmd wrangler types
npx.cmd tsc --noEmit
npx.cmd biome check .
npx.cmd vitest run        # 344 tests passants
npx.cmd wrangler deploy --dry-run
```

**Déploiement continu sur `main` :** Déclenché par `.github/workflows/deploy.yml` (`scripts/deployer.mjs` : migrations D1 **avant** le déploiement). Ne jamais déployer manuellement en production sans ordre direct du praticien.
