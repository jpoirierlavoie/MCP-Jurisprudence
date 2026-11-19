# Spécification — Connecteur MCP « MCP Jurisprudence »

*Renommé le 2026-09-16. Le connecteur s'intitulait « Jurisprudence canadienne et greffes du Québec » ; ce libellé reste sa DESCRIPTION — il n'en est plus le nom. L'identifiant de `serverInfo` a suivi : `jurisprudence-canlii` est devenu `mcp-jurisprudence` (§8).*

**Destinataire :** Claude Code
**Auteur de la spéc. :** (préparé pour Jason Poirier Lavoie)
**Cible :** nouveau dépôt autonome — Worker Cloudflare, D1, TypeScript
**Modèle de référence :** le Worker `legislation` / base D1 `qclaw` (connecteur « Législation du Québec »)
**Statut :** **livré (`2.0.0`) et mis à niveau Phase 3 (`@poirierlavoie/mcp-socle` `0.8.2`)** sur `jurisprudence.poirierlavoie.ca` — dix outils sans préfixe (clé `juris` dans `droit-civil-quebecois` `v2.0.2`), identité partagée `DB_IDENTITE` (`mcp-identite`), double montage `/mcp` (`404` vide sans `WWW-Authenticate`) et `/mcp/oauth` (`401` RFC 9728 OAuth 2.1 PKCE S256 via `acces.poirierlavoie.ca`), garde stricte BYOK CanLII préalable au cache D1 (`ouvrirCoffre` / `lirePorteurEntete` `X-Clef-CanLII`), observabilité Cloudflare désactivée et zéro écriture dans `search_log` / `api_usage` *(voir `MCP-Socle/SPEC-SOCLE-COMMUN.md` pour l'amendement Phase 3 de D7, §8, §9, §10 et §18)*. Lire **§1 (décisions arrêtées)** et **§2 (contrat de vérité)** avant toute ligne de code — et lire tout le reste comme le relevé de ce qui TOURNE : tout écart entre cette spécification et le dépôt est un défaut de l'une ou de l'autre, jamais un travail restant.

---

## 0. Résumé exécutif

Construire un serveur MCP autonome, hébergé sur Cloudflare Workers, exposant la **REST API de CanLII** sous forme d'outils orientés *vérification de références* plutôt que de simples enveloppes d'endpoints.

L'API de CanLII est en **lecture seule** et ne renvoie que des **métadonnées** — jamais le texte d'une décision. La valeur professionnelle du connecteur tient donc à trois usages :

1. **Éprouver** une citation tirée de la doctrine, d'un moteur de recherche ou d'un texte produit par une IA — existence et identité, de façon déterministe ;
2. **Retrouver** une décision à partir des noms des parties lorsque la citation n'est pas constructible (recueils, identifiants SOQUIJ) ;
3. **Identifier** précisément une décision, puis en obtenir l'hyperlien `canlii.ca` afin d'en tirer le texte par un autre moyen.

L'architecture calque celle du Worker `legislation` : un Worker TypeScript sans cadriciel, une base D1 avec migrations Wrangler et une table FTS5 en *external content*, des sorties en **texte français compact** (et non en JSON), une table `search_log` pour la télémétrie des échecs, et des descriptions d'outils qui portent elles-mêmes leurs mises en garde.

Deux différences structurelles avec `legislation` : (a) la source de vérité est **distante** (l'API de CanLII), donc il faut un client sortant étranglé, réessayé et journalisé ; (b) la clef d'API est un **secret personnel à quota**, donc le point d'entrée doit être **authentifié**, contrairement au corpus législatif qui est public.

---

## 1. Décisions arrêtées (et pourquoi)

Ces décisions sont prises. Ne pas les rouvrir sans instruction contraire ; les points restés ouverts sont regroupés en **§16**.

| # | Décision | Motif |
|---|---|---|
| D1 | **TypeScript**, pas Python | Le moteur natif des Workers est `workerd` (JS/TS). Les *Python Workers* (Pyodide) restent en bêta, avec démarrages à froid et contraintes de paquets. Le Worker `legislation` est déjà en TS ; la symétrie l'emporte. Le code ici est de la plomberie HTTP + un analyseur de citations : lisible sans expertise TS. *Si Python devient impératif, la cible n'est pas Workers mais Cloud Run — dire non à Workers plutôt que faire du Python contraint.* |
| D2 | **Aucun cadriciel** (pas de Hono, pas d'`agents`, pas du SDK MCP officiel) | Un routeur `fetch` de trente lignes suffit. Zéro dépendance d'exécution = zéro surface Dependabot, cohérent avec la philosophie « zéro nouvelle dépendance » d'Athéna. |
| D3 | **Streamable HTTP, mode JSON sans état** | Un message JSON-RPC par `POST`. Pas de SSE, pas de `Mcp-Session-Id`. Identique à la phase I d'Athéna ; c'est le transport que `claude.ai` privilégie. Le dépôt `alhwyn/canlii-mcp` utilise SSE — **ne pas l'imiter sur ce point**. |
| D4 | **Sortie en texte français**, pas en JSON | Conforme à `qclaw` : `qclaw_resolve_reference` renvoie « RLRQ, c. CCQ-1991, art. 1 (à jour au 2026-04-01) … », non un objet. Plus lisible pour le modèle, moins verbeux, et le format porte la mise en garde. |
| D5 | **D1 sert à la fois d'index et de cache**, pas de KV | Le compte ne possède aucun *namespace* KV ; `qclaw` fonctionne sur D1 seul. Les métadonnées d'une décision sont quasi immuables : un cache permanent est correct. |
| D6 | **Le cache se remplit par l'usage** | Tout balayage effectué pour répondre à une requête est **persisté**. Le « miroir » n'est donc pas un téléchargement en masse, mais la sédimentation des appels déjà faits. Le moissonnage planifié (§11) reste facultatif et désactivé par défaut. |
| D7 | **Authentification par secret partagé** dans le chemin *ou* l'en-tête `Authorization` | Ce qui est protégé n'est pas du contenu confidentiel — les métadonnées sont publiques — mais **la clef d'API et son quota**. Un secret de 256 bits sur TLS est proportionné. Chemin d'évolution vers OAuth 2.1 documenté en §9.4. |
| D8 | **Nom d'hôte `jurisprudence.poirierlavoie.ca`**, Worker `jurisprudence`, base D1 `canlii`, outils sans préfixe sous la clé `juris` (`2.0.0`) | **AMENDÉE le 2026-09-16, le 2026-11-14 et en `2.0.0`.** Symétrie avec `legislation.poirierlavoie.ca` : ni le nom d'hôte ni les noms d'outils n'emploient plus la marque d'un tiers ni de préfixe redondant. *La rédaction du 2026-07-15 au 2026-09-16 conservait `canlii_` ; celle de `0.3.0` utilisait `jurisprudence_` pour distinguer deux familles (`jurisprudence_*` vs `greffe_*`/`palais_*`, §17.1).* Le modèle doit toujours savoir que la couverture et les verdicts dépendent de CanLII — mais **un préfixe ne sait pas porter une réserve** : l'annonce vit dans des PHRASES (description de chaque outil, `INSTRUCTIONS`, page publique) épinglées par des tests bilingues. Après le transfert des outils hors ligne vers `MCP-Outils` (`0.3.0`), le retrait final du préfixe `jurisprudence_` en `2.0.0` allège la budgétisation des clients MCP tout en maintenant les identifiants composés sous 64 caractères dans `droit-civil-quebecois`. |
| D9 | **Outils composites**, pas des enveloppes 1:1 d'endpoints | Un outil `verify_citations` qui analyse, construit, appelle, compare et rend un verdict fait en un aller-retour ce qui en exigerait quatre. C'est aussi la seule façon d'imposer la mise en garde au bon endroit. |
| D10 | **Auto-correction du répertoire des tribunaux** | La correspondance code de citation → `databaseId` n'est documentée que pour `csc-scc`. Les identifiants fédéraux sont incertains. Le système apprend : sur échec, il essaie la variante linguistique et consigne celle qui a fonctionné (§6.4). |

---

## 2. Contrat de vérité (à lire avant d'écrire un seul outil)

Un vérificateur de citations qui promet plus qu'il ne tient est **pire qu'aucun outil** : il transforme une incertitude connue en fausse assurance, dans un contexte où la sanction est déontologique. Le code doit donc rendre ces limites structurellement inévitables.

**Ce que l'API établit :**

- l'**existence** d'une décision dans la collection de CanLII ;
- son **identité** : intitulé, citation, date, numéro de dossier de cour, mots-clés, hyperlien `canlii.ca` ;
- ses **rapports de citation** : ce qu'elle cite, ce qui la cite, les dispositions qu'elle cite ;
- pour un texte législatif : type, indicateur d'abrogation, et les dates de la **VERSION CONSOLIDÉE** que CanLII sert — bornes de cette version, **jamais de l'instrument** : elles ne datent ni son entrée en vigueur, ni son abrogation. *Rédaction amendée le 2026-09-17 : la précédente disait « régime de dates, dates de début et de fin », ce qui est l'assertion RACINE dont §7.9 tirait son rendu — et par laquelle « le Code civil est entré en vigueur en 2026 » devenait lisible.*

**Ce que l'API n'établit pas, et qu'aucun outil ne doit laisser croire :**

- le **texte** de la décision — il n'existe aucun endpoint de plein texte ni de recherche par mots du texte ;
- l'**autorité actuelle** — aucun historique d'appel, aucun indicateur de traitement (suivi, distingué, infirmé), aucun pourvoi pendant, aucun refus de permission d'appeler ;
- le **dispositif** ou le motif pour lequel une décision est invoquée ;
- l'**exhaustivité** — la couverture a des bornes historiques, et la documentation reconnaît un délai de diffusion pour lequel elle recommande de prévoir un jeu de deux jours.

**Conséquences imposées au code :**

1. Toute sortie d'outil **heuristique** (`find_case`, `subsequent_history`) se termine par sa mise en garde, dans le corps de la réponse et non seulement dans la description de l'outil — c'est le motif retenu par `qclaw_find_relevant`.
2. Un verdict `INTROUVABLE` n'est **jamais** formulé comme « cette décision n'existe pas ». Il énumère les explications concurrentes (numéro erroné, hors collection, diffusion récente).
3. Un verdict `CONFIRMÉE` porte, dans la même sortie, la phrase indiquant qu'il n'établit ni l'autorité actuelle ni le dispositif.
4. Les valeurs brutes renvoyées par CanLII sont **toujours affichées** en cas d'écart — le praticien tranche, l'outil ne masque pas.

---

## 3. Architecture

### 3.1 Vue d'ensemble

```
claude.ai / Claude Code      (Athéna : client du 2026-08-27 au 2026-09-02, retiré — §19)
        │  POST /mcp/<secret>   (JSON-RPC 2.0, un message par requête)
        ▼
┌──────────────────────────────────────────────┐
│  Worker `jurisprudence`  (workerd, TS)       │
│                                              │
│  router → auth → JSON-RPC → registre d'outils│
│                    │                         │
│      ┌─────────────┴──────────────┐          │
│      ▼                            ▼          │
│  analyseur de citations     client CanLII    │
│  (pur, hors ligne)          (étranglé,       │
│                              réessayé)       │
│      │                            │          │
│      └────────────┬───────────────┘          │
│                   ▼                          │
│              D1 `canlii`                     │
│   databases · court_codes · cases · cases_fts│
│   citator_edges · sync_state · search_log    │
│   api_usage                                  │
└──────────────────────────────────────────────┘
                   │ HTTPS (api_key en paramètre de requête)
                   ▼
          https://api.canlii.org/v1/…
```

### 3.2 Arborescence du dépôt

*Relevée sur le dépôt (mise à jour du 2026-11-14 après le retrait de §17 vers « MCP-Outils »).*

```
.
├── src/
│   ├── index.ts              # fetch + scheduled ; routage ; garde d'authentification
│   ├── config.ts             # lecture des vars, coupe-circuit
│   ├── env.d.ts              # les SECRETS, déclarés à la main (absents de wrangler.jsonc)
│   ├── mcp/
│   │   ├── rpc.ts            # enveloppe JSON-RPC, codes d'erreur, initialize/ping
│   │   ├── registry.ts       # les 10 descripteurs (nom, titre, description FR, schéma)
│   │   ├── validate.ts       # validateur JSON-Schema (sous-ensemble) — calqué sur mcp/tools.py
│   │   └── handlers/         # un fichier par outil, + un module partagé
│   │       ├── verifyCitations.ts · parseCitation.ts · findCase.ts
│   │       ├── getCase.ts · citator.ts · subsequentHistory.ts
│   │       ├── browseCases.ts · listDatabases.ts
│   │       ├── browseLegislation.ts · getLegislation.ts
│   │       └── cible.ts      # résolution de cible, partagée
│   ├── canlii/
│   │   ├── client.ts         # fetch sortant : étranglement, réessais, délais, quota
│   │   ├── types.ts          # types des réponses de l'API
│   │   └── errors.ts         # CanliiError (statut, code, corps redacté)
│   ├── citation/
│   │   ├── parse.ts          # analyseur (§6)
│   │   ├── normalize.ts      # pliage d'accents, casse, ponctuation, tokenisation
│   │   └── compare.ts        # comparaison d'intitulés (§6.5)
│   ├── store/
│   │   ├── cases.ts          # upsert/lecture de `cases` + FTS
│   │   ├── databases.ts      # répertoire + court_codes (+ auto-correction)
│   │   ├── lookup.ts         # la boucle d'auto-correction de §6.4, en UN SEUL exemplaire
│   │   ├── citator.ts        # arêtes du citateur + TTL
│   │   └── telemetry.ts      # search_log, api_usage
│   ├── format/
│   │   ├── fr.ts             # dates, listes, troncature
│   │   └── render.ts         # gabarits de sortie (Annexe A) + mises en garde
│   ├── site.ts               # §18 — la page publique, DÉRIVÉE des données vives
│   ├── site.i18n.ts          # §18 — l'ANGLAIS seulement (traduction, jamais copie)
│   └── backfill.ts           # §11 — écrit, testé, INERTE
├── migrations/
│   ├── 0001_initial.sql
│   ├── 0002_seed_court_codes.sql
│   ├── 0003_reconcile_court_codes.sql   # §4.3, avec sa preuve d'observation
│   └── 0004_rename_tool_prefix.sql      # 2026-09-16 — rattrape la DONNÉE déjà écrite
│                                        #   sous `canlii_*` : search_log.tool et
│                                        #   court_codes.note. Aucun schéma touché.
├── scripts/
│   ├── mcp-client.mjs        # client de recette (§14) — ne divulgue jamais le secret
│   ├── refresh-databases.mjs # réconciliation du répertoire (§4.3)
│   └── deployer.mjs          # §12 — migrations PUIS déploiement ; refuse un arbre sale
├── test/                     # tests sans réseau ni clef
│   ├── citation.parse.test.ts · citation.compare.test.ts · verify.test.ts
│   ├── client.test.ts · rpc.test.ts · persist.test.ts · tools.test.ts
│   ├── site.test.ts · garde.test.ts · backfill.test.ts
│   ├── doc.test.ts           # README contre REGISTRE (§13) — remplace la porte shell
│   └── fixtures/             # réponses JSON figées de l'API CanLII (gitignoré ou tests)
├── assets/
│   └── logo.svg              # icône vectorielle du greffon Antigravity
├── .github/workflows/        # §12
├── wrangler.jsonc · biome.json · tsconfig.json · vitest.config.ts
├── plugin.json · mcp_config.json · gemini-extension.json     # §20 — Antigravity & Gemini CLI
├── package.json · README.md · SECURITY.md · CLAUDE.md · GEMINI.md
└── SPEC.md
```

### 3.3 `wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "jurisprudence",
  "main": "src/index.ts",
  "compatibility_date": "2026-07-01",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": false,
  "routes": [
    { "pattern": "jurisprudence.poirierlavoie.ca", "custom_domain": true }
  ],
  "observability": { "enabled": true },
  "limits": {
    "cpu_ms": 30000,
    "subrequests": 200        // garde-fou : bien en deçà du plafond payant
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "canlii",
      "database_id": "<uuid après création>",
      "migrations_dir": "migrations"
    }
  ],
  "triggers": { "crons": ["17 6 * * 1"] },   // hebdomadaire : rafraîchit le répertoire
  "vars": {
    "MCP_ENABLED": "true",
    "COMMIT": "inconnu",        // posé au déploiement par scripts/deployer.mjs (§12.1)
    "CANLII_MIN_INTERVAL_MS": "600",
    "CANLII_MAX_CALLS_PER_INVOCATION": "40",
    "CANLII_TIMEOUT_MS": "15000",
    "PERSIST_SWEEPS": "true",
    "BACKFILL_ENABLED": "false",
    "BACKFILL_DATABASES": "qcca,qccs,qccq,qctal",
    "DEFAULT_LANG": "fr",
    // Origines de navigateur admises EN PLUS de claude.ai, claude.com, gemini.google.com
    // et aistudio.google.com, séparées par des virgules ; vide en temps normal. Toute
    // origine de navigateur absente de la liste est refusée par un 403 (§9.6).
    "ALLOWED_ORIGINS": ""
  },
  // Limitation de débit (§9.3) : DANS le Worker, jamais par une règle WAF de zone —
  // une expression WAF viserait un chemin qui CONTIENT le secret partagé.
  "ratelimits": [
    { "name": "RATE_LIMITER", "namespace_id": "1001", "simple": { "limit": 60, "period": 60 } }
  ]
}
```

*Bloc relevé sur le `wrangler.jsonc` versionné le 2026-09-16 ; en cas d'écart, **le fichier fait foi** — c'est lui que Cloudflare lit.*

> **Création de la base :** `wrangler d1 create canlii --location enam` — `enam` (est de l'Amérique du Nord) est le repère de localisation le plus proche de Montréal. Aucune contrainte de résidence des données ne s'applique ici : rien de confidentiel n'y transite (§9.5).

**Dépendance au forfait.** Le forfait *Workers Free* plafonne à **50 sous-requêtes externes par invocation** et **10 ms de CPU** ; le forfait payant offre 10 000 sous-requêtes (jusqu'à 10 M) et 30 s de CPU par défaut. Les outils de balayage (`find_case` en mode vif, le moissonnage de §11) supposent le forfait **payant**. Sur le forfait gratuit, ramener `CANLII_MAX_CALLS_PER_INVOCATION` à `20` et désactiver §11. **Vérifier le forfait du compte avant d'implémenter §11.**

### 3.4 Secrets et variables

| Nom | Type | Rôle |
|---|---|---|
| `CANLII_API_KEY` | secret (`wrangler secret put`) | Clef d'API CanLII. **Jamais journalisée, jamais renvoyée, jamais dans une trace.** |
| `MCP_SHARED_SECRET` | secret | 32 octets aléatoires en hexadécimal (`openssl rand -hex 32`). |
| `MCP_SHARED_SECRET_ATHENA` | secret, **facultatif** | Second porteur du même point d'entrée, aux droits identiques. Distinct pour être **révocable seul** (§9.1). Absent ⇒ un seul porteur admis. **Sans porteur depuis le 2026-09-02** : il servait le clavardage de Pallas Athéna, retiré de son dépôt ce jour-là (§19). Conservé — il ne coûte rien et n'ouvre aucun droit de plus — mais plus aucun client réel ne signalerait qu'on a cassé la forme par en-tête. |
| `MCP_ENABLED` | var | Coupe-circuit : `"false"` ⇒ toute route MCP renvoie `404`. Calque `MCP_ENABLED` d'Athéna. |
| `COMMIT` | var | Commit dont la version en ligne est issue, annoncé par `/health` (§8). Défaut « inconnu » — un aveu, pas un remplissage ; la valeur réelle est posée à la volée par `scripts/deployer.mjs` (`--var COMMIT:<sha>`). |
| `CANLII_MIN_INTERVAL_MS` | var | Intervalle minimal entre deux appels sortants. |
| `CANLII_MAX_CALLS_PER_INVOCATION` | var | Plafond d'appels sortants par invocation d'outil. |
| `CANLII_TIMEOUT_MS` | var | Délai d'expiration par appel sortant. |
| `PERSIST_SWEEPS` | var | Persister en D1 les fiches moissonnées lors d'un balayage. |
| `BACKFILL_ENABLED` | var | Active le moissonnage planifié (§11). **`false` par défaut.** |

---

## 4. Schéma D1

### 4.1 `migrations/0001_initial.sql`

```sql
-- Répertoire des bases de données de CanLII (cours, tribunaux, corpus législatifs).
CREATE TABLE databases (
  id            TEXT PRIMARY KEY,          -- 'qcca', 'csc-scc', 'qcs'
  kind          TEXT NOT NULL,             -- 'case' | 'legislation'
  jurisdiction  TEXT NOT NULL,             -- 'qc', 'ca', 'on', ...
  type          TEXT,                      -- STATUTE | REGULATION | ANNUAL_STATUTE (législation)
  name_fr       TEXT,
  name_en       TEXT,
  name_norm     TEXT,                      -- plié (accents, casse) pour la recherche
  refreshed_at  TEXT NOT NULL
);
CREATE INDEX idx_db_kind ON databases(kind, jurisdiction);

-- Correspondance : code de citation neutre -> databaseId + fragment employé dans caseId.
-- Seule 'csc-scc' est documentée ; le reste est amorcé puis CORRIGÉ à l'usage (§6.4).
CREATE TABLE court_codes (
  code          TEXT PRIMARY KEY,          -- 'QCCA', 'CSC', 'SCC', 'CAF' (majuscules)
  database_id   TEXT NOT NULL,
  caseid_code   TEXT NOT NULL,             -- fragment DANS le caseId : 'qcca', 'scc'
  jurisdiction  TEXT NOT NULL,
  lang          TEXT,                      -- 'fr' | 'en' | NULL (langue-neutre)
  verified      INTEGER NOT NULL DEFAULT 0,-- 1 = confirmé par un appel réussi
  note          TEXT
);

-- Codes entre parenthèses des citations attribuées par CanLII : « (QC CQ) ».
CREATE TABLE paren_codes (
  juris_code    TEXT NOT NULL,             -- 'QC', 'CA', 'ON'
  court_code    TEXT NOT NULL,             -- 'CQ', 'CS', 'CA', 'SCC'
  database_id   TEXT NOT NULL,
  verified      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (juris_code, court_code)
);

-- Fiches de décisions : à la fois index de recherche et cache.
CREATE TABLE cases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  database_id     TEXT NOT NULL,
  case_id         TEXT NOT NULL,
  lang            TEXT,                    -- langue sous laquelle CanLII a clé le caseId
  title           TEXT NOT NULL,
  title_norm      TEXT NOT NULL,           -- plié : accents, casse, ponctuation
  citation        TEXT,
  neutral_cite    TEXT,                    -- extraite et normalisée : '2020 QCCA 495'
  docket_number   TEXT,
  decision_date   TEXT,                    -- 'YYYY-MM-DD'
  keywords        TEXT,
  url             TEXT,
  concatenated_id TEXT,
  source          TEXT NOT NULL,           -- 'lookup' | 'sweep' | 'backfill'
                                           -- ⚠ 'sweep'/'backfill' ⇒ decision_date EST NULL
  fetched_at      TEXT NOT NULL,
  UNIQUE (database_id, case_id)
);
CREATE INDEX idx_cases_date    ON cases(database_id, decision_date DESC);
CREATE INDEX idx_cases_neutral ON cases(neutral_cite);
CREATE INDEX idx_cases_docket  ON cases(docket_number);

-- Recherche plein texte sur l'INTITULÉ et les mots-clés — jamais sur le texte
-- de la décision, que l'API n'expose pas.
CREATE VIRTUAL TABLE cases_fts USING fts5(
  title, keywords,
  database_id UNINDEXED, case_id UNINDEXED,
  content='cases', content_rowid='id',
  tokenize="unicode61 remove_diacritics 2"
);
CREATE TRIGGER cases_ai AFTER INSERT ON cases BEGIN
  INSERT INTO cases_fts(rowid, title, keywords, database_id, case_id)
  VALUES (new.id, new.title, new.keywords, new.database_id, new.case_id);
END;
CREATE TRIGGER cases_ad AFTER DELETE ON cases BEGIN
  INSERT INTO cases_fts(cases_fts, rowid, title, keywords, database_id, case_id)
  VALUES ('delete', old.id, old.title, old.keywords, old.database_id, old.case_id);
END;
CREATE TRIGGER cases_au AFTER UPDATE ON cases BEGIN
  INSERT INTO cases_fts(cases_fts, rowid, title, keywords, database_id, case_id)
  VALUES ('delete', old.id, old.title, old.keywords, old.database_id, old.case_id);
  INSERT INTO cases_fts(rowid, title, keywords, database_id, case_id)
  VALUES (new.id, new.title, new.keywords, new.database_id, new.case_id);
END;

-- Arêtes du citateur.
CREATE TABLE citator_edges (
  from_database_id  TEXT NOT NULL,
  from_case_id      TEXT NOT NULL,
  rel               TEXT NOT NULL,         -- 'citing' | 'cited' | 'legislation'
  to_database_id    TEXT,
  to_case_id        TEXT,
  to_legislation_id TEXT,
  to_title          TEXT,
  to_citation       TEXT,
  fetched_at        TEXT NOT NULL
);
CREATE INDEX idx_edges_from ON citator_edges(from_database_id, from_case_id, rel);

-- État de moisson d'une arête : distingue « vide » de « jamais demandé ».
CREATE TABLE citator_state (
  database_id TEXT NOT NULL,
  case_id     TEXT NOT NULL,
  rel         TEXT NOT NULL,
  edge_count  INTEGER NOT NULL,
  fetched_at  TEXT NOT NULL,
  PRIMARY KEY (database_id, case_id, rel)
);

-- Curseurs du moissonnage planifié (§11).
CREATE TABLE sync_state (
  database_id   TEXT PRIMARY KEY,
  cursor_date   TEXT,
  cursor_offset INTEGER NOT NULL DEFAULT 0,
  last_run_at   TEXT,
  complete      INTEGER NOT NULL DEFAULT 0
);

-- Télémétrie : ce que l'on cherche et ne trouve pas est le signal le plus utile.
CREATE TABLE search_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT NOT NULL DEFAULT (datetime('now')),
  tool         TEXT NOT NULL,
  query        TEXT NOT NULL,
  database_id  TEXT,
  lang         TEXT,
  result_count INTEGER NOT NULL,
  verdict      TEXT,                       -- verify_citations
  fallback     TEXT
);
CREATE INDEX idx_search_log_misses ON search_log(tool, ts) WHERE result_count = 0;
```

**Le vocabulaire de `fallback`, et pourquoi il compte.** *Unifié le 2026-09-16.* Cette colonne
distingue un ÉCHEC d'une ABSENCE, et les confondre rend §10 muet sur la seule question qui
l'intéresse : le connecteur a-t-il conclu, ou n'a-t-il pas pu ?

| Valeur | Ce qu'elle dit |
|---|---|
| `null` | l'outil a conclu normalement |
| `not_found`, `not_found_<voie>` | une ABSENCE réellement constatée — un 404 de CanLII |
| `api_error` | aucun constat : 401, 429, 5xx, expiration, ou balayage interrompu |
| `budget` | aucun constat : le budget d'appels du tour était épuisé |
| `unknown_court` | tribunal absent du répertoire ⇒ INTROUVABLE sans appel (invariant 8) |
| `unreadable_items` | CanLII a répondu, mais des entrées n'ont pas pu être LUES |
| `stale_directory` | le rafraîchissement du répertoire a échoué ; le local a été servi |
| `lang_swap`, `split_db` | l'auto-correction de §6.4 a dû rattraper |
| `sweep` | balayage vif mené à son terme |

⚠ `get_case` écrivait `api_error` **y compris sur un 404**. Un dépouillement
comptait donc une absence constatée comme une panne, et réciproquement — les deux séries étaient
fausses, et leur somme juste. Défaut d'ANALYSE, pas d'exécution : rien ne plantait.

```sql

-- Consommation quotidienne : le quota de CanLII n'est pas publié (§16.2).
CREATE TABLE api_usage (
  day       TEXT PRIMARY KEY,              -- 'YYYY-MM-DD' UTC
  calls     INTEGER NOT NULL DEFAULT 0,
  errors    INTEGER NOT NULL DEFAULT 0,
  throttled INTEGER NOT NULL DEFAULT 0
);
```

⚠ *Relevé le 2026-09-17.* Le commentaire de `databases.type` n'énumère que `STATUTE | REGULATION | ANNUAL_STATUTE`. L'API en rend au moins **cinq** : `REVISED_STATUTE` et `CONSTITUTION` s'y ajoutent, observés en production sur le répertoire québécois et fédéral. **L'ensemble n'est pas clos**, et il n'est documenté nulle part par CanLII. La colonne reste donc un `TEXT` libre, et les trois gestionnaires qui rendent cette valeur la rendent **BRUTE** : la traduire supposerait une énumération qu'on n'a pas, et `ANNUAL_STATUTE` contre `REVISED_STATUTE` est une qualification **juridique** — « loi annuelle » contre « loi refondue » — qu'on ne devine pas. C'est la règle d'`abroge()` et de `regimeDeDates()` (§7.9), appliquée par abstention.

⚠ **La migration n'est PAS retouchée.** `migrations/0001_initial.sql` est appliquée en production, et son commentaire est daté de son écriture : le rééditer ne changerait rien à la base vivante et ferait diverger en silence une base neuve. C'est le raisonnement que `migrations/0004` a consigné pour les anciens noms d'outils, et il vaut ici mot pour mot. Le bloc reproduit ci-dessus suit la migration ; la correction vit dans cette note, datée.

### 4.2 Politique de fraîcheur

| Donnée | TTL | Motif |
|---|---|---|
| Fiche de décision (`cases`) | **permanent** | Intitulé, citation, date et numéro de dossier ne changent pas. Rafraîchissement forcé par l'argument `refresh`. |
| `citator_edges` où `rel='cited'` ou `'legislation'` | **permanent** | Ce qu'une décision cite est figé au jour de son prononcé. |
| `citator_edges` où `rel='citing'` | **30 jours** | Cette liste croît indéfiniment. |
| `databases` | **7 jours** (cron hebdomadaire) | Les tribunaux sont créés, fusionnés et renommés (Régie du logement → TAL ; CLP/CRT → TAT). |

### 4.3 `migrations/0002_seed_court_codes.sql`

Amorce **minimale** et honnête : uniquement ce qui est soit documenté, soit vérifiable de visu. Tout le reste sera découvert et corrigé à l'usage (§6.4). Les lignes `verified = 0` sont des hypothèses, **et le code doit les traiter comme telles**.

```sql
INSERT INTO court_codes (code, database_id, caseid_code, jurisdiction, lang, verified, note) VALUES
  -- Documenté par la documentation de l'API (exemple Dunsmuir).
  ('CSC',   'csc-scc', 'scc',   'ca', 'fr', 1, 'documenté : caseBrowse/fr/csc-scc/2008scc9'),
  ('SCC',   'csc-scc', 'scc',   'ca', 'en', 1, 'documenté'),
  -- Cours du Québec : le code neutre est langue-neutre et paraît identique au databaseId.
  ('QCCA',  'qcca',  'qcca',  'qc', NULL, 0, 'hypothèse : identité'),
  ('QCCS',  'qccs',  'qccs',  'qc', NULL, 0, 'hypothèse : identité'),
  ('QCCQ',  'qccq',  'qccq',  'qc', NULL, 0, 'hypothèse : identité'),
  ('QCCM',  'qccm',  'qccm',  'qc', NULL, 0, 'hypothèse : identité'),
  ('QCTAL', 'qctal', 'qctal', 'qc', NULL, 0, 'hypothèse : identité'),
  ('QCTAT', 'qctat', 'qctat', 'qc', NULL, 0, 'hypothèse : identité'),
  ('QCTAQ', 'qctaq', 'qctaq', 'qc', NULL, 0, 'hypothèse : identité'),
  ('QCTP',  'qctp',  'qctp',  'qc', NULL, 0, 'hypothèse : identité'),
  -- Fédéral : les databaseId composés NE SONT PAS documentés. À corriger à l'usage.
  ('CAF',   'caf-fca', 'fca', 'ca', 'fr', 0, 'À VÉRIFIER — motif csc-scc supposé'),
  ('FCA',   'caf-fca', 'fca', 'ca', 'en', 0, 'À VÉRIFIER'),
  ('CF',    'cf-fc',   'fc',  'ca', 'fr', 0, 'À VÉRIFIER'),
  ('FC',    'cf-fc',   'fc',  'ca', 'en', 0, 'À VÉRIFIER'),
  ('CCI',   'cci-tcc', 'tcc', 'ca', 'fr', 0, 'À VÉRIFIER'),
  ('TCC',   'cci-tcc', 'tcc', 'ca', 'en', 0, 'À VÉRIFIER');

INSERT INTO paren_codes (juris_code, court_code, database_id, verified) VALUES
  ('QC', 'CA',  'qcca', 0),
  ('QC', 'CS',  'qccs', 0),
  ('QC', 'CQ',  'qccq', 0),   -- documenté par l'exemple 2002 CanLII 32322 (QC CQ)
  ('QC', 'CM',  'qccm', 0),
  ('CA', 'SCC', 'csc-scc', 1),
  ('CA', 'CSC', 'csc-scc', 1);
```

> **Tâche d'amorçage — FAITE le 2026-07-23, conservée pour qui repart d'une base neuve.** Exécuter `scripts/refresh-databases.mjs --remote --sql` — extension `.mjs` et non `.ts` : le dépôt n'embarque aucun exécuteur TypeScript (D2), et la commande donnée jusqu'au 2026-09-16 ne s'exécutait donc pas. Ou l'outil `list_databases` avec `refresh: true`. Puis réconcilier `court_codes.database_id` contre les `databaseId` réellement renvoyés par `caseBrowse/fr/`. **Ne pas livrer les lignes fédérales `verified = 0` sans cette réconciliation** ; si un `databaseId` amorcé n'existe pas au répertoire, corriger la ligne et passer `verified = 1`.
>
> La réconciliation menée contre l'API vivante a démenti **cinq** hypothèses d'amorçage — `caf-fca` et `cf-fc` n'existent pas (les vraies bases sont `fca` et `fct`), le fragment français est `cci` et non `tcc`, et le TAL a gardé le `databaseId` de la Régie du logement (`qcrdl`). Elle est consignée AVEC sa preuve d'observation dans `migrations/0003_reconcile_court_codes.sql` et verrouillée par `test/persist.test.ts`, de sorte qu'une réapplication de 0002 seule sur une base neuve ne puisse pas ressusciter les hypothèses fausses. La refaire sans relire 0003, c'est risquer de réécrire par une hypothèse ce qu'une observation a tranché.

---

## 5. Client CanLII

### 5.1 Contrat

```ts
// src/canlii/client.ts
export interface CanliiClient {
  get<T>(path: string, params?: Record<string, string | number>): Promise<T>;
  callsMade(): number;
}
```

- Base : `https://api.canlii.org/v1`. **HTTPS uniquement** — le HTTP n'est plus pris en charge par l'API.
- `api_key` ajoutée systématiquement en paramètre de requête, **après** les autres paramètres.
- Le client est instancié **une fois par invocation d'outil** et porte son propre compteur, afin que `CANLII_MAX_CALLS_PER_INVOCATION` soit un plafond réel et non global.

### 5.2 Étranglement, réessais, délais

Le quota de CanLII n'est pas publié (§16.2). Le comportement par défaut est donc délibérément prudent :

- **Séquentiel.** Aucune concurrence sortante. Un utilisateur unique n'a rien à y gagner et un pic peut coûter la clef.
- **Intervalle minimal** de `CANLII_MIN_INTERVAL_MS` (**600 ms**, ≈ 1,7 appel/s) entre deux appels de la même invocation. *Relevé de 250 ms le 2026-08-27 : à 4 appels/s, la production était étranglée sur 12 à 18 % des appels des journées chargées (§16.2).*
- **Intervalle ADAPTATIF.** À chaque `429`, l'intervalle de l'invocation en cours **double**, plafonné à 4 s. Le quota n'étant pas publié, le refus est la seule mesure dont on dispose : un petit lot qui ne touche jamais la limite reste rapide, un gros lot qui la touche cesse de s'y cogner. L'adaptation **meurt avec l'invocation** — le client ne vit que le temps d'un appel d'outil, et un état partagé entre invocations exigerait un objet durable que la valeur ne justifie pas.
- **Réessais** sur `429`, `500`, `502`, `503`, `504` : trois tentatives, temporisation exponentielle plus gigue de 0–200 ms ; si un en-tête `Retry-After` est présent, il **prime**. La BASE dépend de la cause — **2 s pour un `429`**, 500 ms pour un `5xx` : un `5xx` est un incident, un `429` est une consigne, et 500 ms n'est pas ralentir. Incrémenter `api_usage.throttled` à chaque `429`.
- **L'étranglement est DIT au modèle** quand il a eu lieu (§16.2) : `verify_citations` et `find_case` ajoutent une note nommant les `429` subis, en précisant que les résultats n'en sont **ni tronqués ni affaiblis**. Ce n'est PAS une mise en garde de §2 — elle ne borne pas ce que le résultat établit, elle explique un rythme — mais elle sert le même contrat : sans elle, un « aucun candidat » obtenu sous étranglement se lit comme une inexistence. Muette quand rien n'a été étranglé.
  ⚠ **La phrase de réassurance est CONDITIONNELLE** (*2026-09-17*). Elle n'est vraie que si les appels étranglés ont tous été rejoués AVEC SUCCÈS. Sous un balayage **interrompu** ou un budget **épuisé**, le résultat EST tronqué, et la note doit le dire — elle paraissait jusqu'ici deux lignes sous « Balayage interrompu », affirmant le contraire de la ligne précédente. La **première ligne** de la note reste identique dans les deux modes : la cause demeure nommée (invariant 9(a)).
- **Pas de réessai** sur `400`, `401`, `403`, `404`.
- **Délai** : `AbortSignal.timeout(CANLII_TIMEOUT_MS)`.
- **Plafond dur** : au-delà de `CANLII_MAX_CALLS_PER_INVOCATION`, lever `CanliiBudgetError` ; le gestionnaire d'outil renvoie alors les résultats **partiels** obtenus, assortis d'une mention explicite (« budget d'appels épuisé — résultat partiel »), plutôt qu'une erreur sèche.
- **Charge utile** : l'API refuse les transferts supérieurs à 10 Mo et renvoie alors un objet portant `"error": "TOO_LONG"`. Le détecter et le traduire en français ; réduire `resultCount` de moitié et réessayer une fois. ⚠ Ce rattrapage exige un `resultCount` **fini** : un point d'accès qui ne pagine pas — `legislationBrowse/{lang}/{db}/`, qui rend la base entière — n'en bénéficie **jamais**.
- **Lecture du corps : ENTIÈRE, jamais tronquée.** *Ajouté le 2026-09-17, après un défaut.* Le corps d'une réponse **réussie** se lit et s'analyse en entier. Une troncature avant `JSON.parse` ne produit pas un résultat appauvri : elle produit un **échec**, et cet échec ressort alors sous le STATUT de la réponse — « CanLII a renvoyé une erreur 200 » sur une réponse parfaitement valide. Le connecteur a porté une telle coupe, à 100 000 caractères, **documentée nulle part**, depuis le premier commit du client : `browse_legislation` était inutilisable sur toute base d'un peu d'ampleur, et le balayage vif de `find_case` (`resultCount = 5 000`) échouait de même. Le corps d'une **erreur**, lui, reste borné à 512 caractères pour le diagnostic (§5.3) — c'est `CanliiError` qui le borne, et elle seule.
- **Plafond défensif de lecture** : 12 Mo, soit **au-dessus** des 10 Mo de l'API. Il **REFUSE** la réponse en entier, il ne la coupe pas. Son objet n'est pas d'économiser la mémoire mais qu'un dépassement produise une **phrase française** plutôt qu'un isolat tué à 128 Mo, que le client MCP reçoit comme une panne de transport **sans aucune cause nommée** — le pire résultat possible au regard de l'invariant 9. Il est délibérément **plus haut** que celui du fournisseur : un plafond interne plus bas rouvrirait le même défaut sous un autre nom. Il ne se lit **pas** dans `vars` : un plafond qu'une variable peut abaisser en silence recréerait le défaut sous forme de configuration.

### 5.3 Journalisation et rédaction

**La clef d'API ne doit jamais quitter le processus.** Toute journalisation d'URL passe par :

```ts
export function redactUrl(u: string): string {
  const url = new URL(u);
  if (url.searchParams.has("api_key")) url.searchParams.set("api_key", "***");
  return url.toString();
}
```

Le corps d'une réponse d'erreur est journalisé tronqué à 512 caractères, après passage par `redactUrl`. Aucune sortie d'outil ne contient d'URL `api.canlii.org` — uniquement des hyperliens `canlii.ca`.

---

## 6. L'analyseur de citations

C'est le cœur du connecteur. Il est **pur** (aucune E/S), donc entièrement testable hors ligne.

### 6.1 Formes reconnues

| Forme | Exemple | Constructible | Sortie de l'analyseur |
|---|---|---|---|
| Neutre | `2020 QCCA 495` | oui | `{kind:'neutral', year:2020, code:'QCCA', number:495}` |
| Neutre, SCC français | `2008 CSC 9` | oui | code `CSC` → `caseid_code` `scc` |
| Attribuée par CanLII | `2002 CanLII 32322 (QC CQ)` | oui | `{kind:'canlii', year, number, juris:'QC', court:'CQ'}` |
| Neutre enchâssée | `Dunsmuir c. Nouveau-Brunswick, [2008] 1 RCS 190, 2008 CSC 9 (CanLII)` | oui | l'analyseur **balaie** la chaîne et retient la forme neutre |
| Recueil | `[1996] 3 R.C.S. 211` · `[1985] C.A. 105` · `[1998] R.J.Q. 1234` | non | `{kind:'reporter', reporter:'R.C.S.', year, page}` |
| Identifiant d'éditeur | `J.E. 94-1234` · `REJB 1998-09876` · `EYB 2005-12345` · `AZ-51234567` · `D.T.E. 2004T-123` | non | `{kind:'publisher', scheme:'SOQUIJ'\|'Yvon Blais'}` |
| Non reconnue | `voir l'arrêt de la Cour d'appel` | non | `{kind:'unparsed'}` |

**Le balayage prime sur l'appariement total.** Une citation doctrinale complète contient presque toujours la forme neutre au milieu d'autres éléments ; l'analyseur doit l'y trouver. Ordre de recherche : (1) forme attribuée par CanLII, (2) forme neutre, (3) recueils, (4) identifiants d'éditeurs. Si plusieurs formes coexistent, retenir la constructible et **mentionner les autres** dans le champ `parallel`.

### 6.2 Expressions régulières de référence

```ts
// Citation neutre : année + identifiant de tribunal (lettres majuscules) + numéro d'ordre.
const NEUTRAL = /\b(1[89]\d{2}|20\d{2})\s+([A-Z]{2,8})\s+(\d{1,6})\b/g;

// Citation attribuée par CanLII, avec son couple de codes entre parenthèses.
const CANLII  = /\b(1[89]\d{2}|20\d{2})\s+CanLII\s+(\d{1,7})\s*\(\s*([A-Z]{2})\s+([A-Z]{1,6})\s*\)/gi;

// Recueils : [année] volume? sigle page.
const REPORTER = /\[(1[89]\d{2}|20\d{2})\]\s*(\d+)?\s*((?:[A-Z]\.){2,4}|R\.?C\.?S\.?|RCS|SCR|R\.?J\.?Q\.?|C\.?A\.?|C\.?S\.?|C\.?Q\.?)\s*(\d+)/g;

// Identifiants d'éditeurs.
const PUBLISHER = /\b(J\.?E\.?\s*\d{2,4}-\d+|REJB\s*\d{4}-\d+|EYB\s*\d{4}-\d+|AZ-\d{6,10}|D\.?T\.?E\.?\s*\d{4}T?-\d+)\b/gi;
```

Écarter les faux positifs de `NEUTRAL` : un code de deux lettres suivi d'un numéro peut apparaître fortuitement. Exiger que le code figure dans `court_codes` **ou** corresponde au motif d'un identifiant de tribunal canadien (2 à 8 majuscules, commençant par un code de ressort connu : `QC`, `ON`, `BC`, `AB`, `SK`, `MB`, `NS`, `NB`, `PE`, `NL`, `YK`, `NT`, `NU`, ou un code fédéral). Un code inconnu mais bien formé produit `constructible: 'probable'` — on tente l'appel et on consigne le résultat.

### 6.3 Construction du `caseId`

```
caseId = `${year}${caseid_code}${number}`      // formes neutres, minuscules, sans rembourrage
caseId = `${year}canlii${number}`              // formes attribuées par CanLII
```

`databaseId` provient de `court_codes.database_id` (formes neutres) ou de `paren_codes.database_id` (formes CanLII).

**Contrôle croisé disponible.** L'API expose un champ `concatenatedId` de la forme `${year}${databaseId}${number}` (« 2008csc-scc9 »). Il n'existe aucun endpoint qui l'accepte en entrée, mais il permet de **valider** qu'un `databaseId` déduit est le bon lorsqu'une fiche est obtenue par un autre chemin. L'utiliser dans la boucle d'auto-correction.

### 6.4 Auto-correction du répertoire

Lorsqu'une résolution directe échoue par `404` alors que la forme est bien constructible :

1. Si `court_codes.lang` n'est pas nul, **réessayer avec le code de la langue opposée** dans le `caseId` (`2008csc9` ↔ `2008scc9`). Réussite ⇒ mettre à jour `court_codes.caseid_code`, passer `verified = 1`, consigner dans `note`.
2. Si le `databaseId` est composé (`a-b`) et que l'échec persiste, **réessayer avec chaque moitié** comme `databaseId`. Réussite ⇒ corriger `court_codes.database_id`.
3. Si le `databaseId` déduit **n'existe pas** dans `databases`, ne pas appeler l'API : renvoyer `INTROUVABLE` en indiquant que le tribunal n'est pas au répertoire, et proposer `list_databases`.
4. Chaque échec définitif est consigné dans `search_log` avec `fallback = 'unknown_court'`.

Le coût de cette boucle est plafonné : **au plus deux tentatives supplémentaires par citation**, comptées dans le budget d'appels.

### 6.5 Comparaison d'intitulés

Normaliser (`src/citation/normalize.ts`) : minuscules, pliage des diacritiques (`NFD` + suppression des marques combinantes), suppression de la ponctuation, réduction des espaces, et retrait des jetons vides de sens — `c`, `v`, `et`, `al`, `inc`, `ltee`, `ltd`, `corp`, `cie`, `la`, `le`, `les`, `de`, `du`, `des`.

Verdict d'appariement, sur les jetons restants :

- **appariement** si tous les jetons significatifs du plus court sont présents dans le plus long ;
- **appariement partiel** si l'indice de Jaccard ≥ 0,5 ;
- **discordance** sinon.

Un **appariement partiel** produit le verdict `DISCORDANTE`, jamais `CONFIRMÉE` : mieux vaut un faux signalement qu'une fausse assurance. Les deux intitulés sont affichés verbatim, côte à côte.

> **Piège à couvrir en test :** les intitulés anonymisés du droit de la famille et de la protection de la jeunesse (« Droit de la famille — 20495 », « Protection de la jeunesse — 231234 ») ne contiennent aucun nom de partie. La comparaison doit fonctionner sur le numéro et ne pas produire de discordance pour absence de patronyme.

---

## 7. Les dix outils (`juris`)

*Le connecteur en compte **dix**, exposés sans préfixe en `2.0.0` sous la clé `juris`. Neuf interrogent la collection de CanLII ; `parse_citation` n'appelle rien.* *(Note — 2026-11-14, `0.3.0` : les trois outils hors ligne `greffe_*` et `palais_*` anciennement décrits en §17 ont été déplacés vers « MCP-Outils ».)*

*Historique de nommage : `canlii_*` (initial) → `jurisprudence_*` (2026-09-16) → sans préfixe (`2.0.0`). Les descriptions ci-dessous
sont reproduites verbatim du registre — chacune nomme désormais CanLII.*

**Conventions communes** — appliquées sans exception :

- Nom d'outil en anglais, **description et sortie en français** (motif `qclaw`).
- `readOnlyHint: true` sur **les dix** : aucun n'écrit quoi que ce soit hors de son propre cache et de sa télémétrie.
- `openWorldHint` **n'est PAS uniforme**, et c'est le point : `true` pour les neuf qui appellent CanLII — leur réponse dépend d'un système tiers, faillible et hors de notre contrôle — et `false` pour `parse_citation`, qui ne fait aucun appel sortant. *Amendé le 2026-09-16 : les outils portaient tous `true`, ce qui annonçait un appel sortant là où il n'y en a jamais eu.* `test/rpc.test.ts` épingle la scission outil par outil.
- Tout paramètre déclaré porte une `description`. *Ajouté le 2026-09-16 : vingt et un n'en avaient pas. Un paramètre nu se devine par son nom, et `offset` comme `limit` se devinent mal — `test/garde.test.ts` échoue désormais si l'un la perd.*
- `additionalProperties: false` sur tous les schémas.
- Tout paramètre `lang` : `enum ["fr","en"]`, défaut `"fr"`.
- Toute liste : `limit` avec défaut et maximum documentés ; troncature signalée en toutes lettres (« 50 premiers sur 214 »).
- Toute sortie d'outil heuristique se termine par sa mise en garde (§2).
- Erreur d'exécution ⇒ `{ content: [...], isError: true }` en français, **jamais** une erreur JSON-RPC (réservée aux fautes de protocole).
- **La FRONTIÈRE de `isError`.** *Écrite le 2026-09-16 ; elle ne l'était nulle part, et elle était enfreinte.* `isError: true` quand l'outil n'a **rien** à livrer — argument refusé, forme d'appel invalide, appel sortant échoué sans repli. `isError: false` dès qu'un résultat part, **même vide, même partiel, même dégradé** : une liste vide est une réponse, pas une panne, et la réserve de §2 voyage alors dans le corps. ⚠ C'est le SEUL signal lisible par machine que ce connecteur émette, et un client l'interroge pour décider s'il RÉESSAIE : il doit donc vouloir dire la même chose partout. Un garde-fou éprouve les DEUX bords : la liste vide n'est pas une erreur, **et** un appel mal formé en est une ; sans le second, on satisferait le premier en rendant `false` partout, ce qui priverait le client du seul signal qu'il possède.

### 7.1 `verify_citations` — l'outil pivot

> **Description (verbatim) :** « Vérifie une ou plusieurs citations de jurisprudence contre la collection de CanLII. SIX verdicts, dont CINQ portent un constat : CONFIRMÉE, DISCORDANTE, INTROUVABLE, NON CONSTRUCTIBLE, ILLISIBLE. Le sixième, INDÉTERMINÉE, dit qu'AUCUN constat n'a pu être fait — CanLII injoignable, étranglé, réponse inexploitable, ou budget d'appels épuisé — et ne vaut JAMAIS absence : ne pas le confondre avec INTROUVABLE. Un client qui n'attend que cinq valeurs prendra une panne pour une inexistence. Rend aussi la fiche officielle (intitulé, citation, date, n° de dossier, hyperlien) et, s'il y a lieu, l'écart avec l'intitulé attendu. Établit l'EXISTENCE et l'IDENTITÉ d'une décision ; n'établit NI son autorité actuelle (aucun historique d'appel, aucun indicateur de traitement), NI le contenu de son dispositif. Outil de choix pour éprouver des références tirées de la doctrine, d'un moteur de recherche ou d'un texte rédigé par une IA. Les citations de recueils (R.C.S., R.J.Q., C.A.) et les identifiants d'éditeurs (J.E., REJB, EYB, AZ) ne sont pas résolubles directement : enchaîner avec find_case. Pour la seule FICHE d'une décision déjà tenue pour juste, get_case suffit et coûte moins. »

*Amendée le 2026-09-16. La rédaction antérieure n'annonçait que **cinq** verdicts alors que le
gestionnaire en rendait six : INDÉTERMINÉE était produit par le code et absent du contrat. Un
client qui n'énumère que les cinq annoncés range le sixième dans son cas par défaut — et le cas
par défaut d'un vérificateur de citations est « pas trouvée ». Une panne de réseau devenait ainsi
une inexistence, en silence : §2, exactement. Le renvoi vers `get_case` a été ajouté
au même moment, dans les deux sens (§7.3).*

```jsonc
{
  "type": "object",
  "properties": {
    "citations": {
      "type": "array", "minItems": 1, "maxItems": 25,
      "description": "Les citations à éprouver, au plus 25 par appel.",
      "items": {
        "type": "object",
        "properties": {
          "citation":       { "type": "string", "maxLength": 400, "description": "…" },
          "expected_title": { "type": "string", "maxLength": 300, "description": "…" },
          "expected_year":  { "type": "integer", "minimum": 1800, "maximum": 2100, "description": "…" }
        },
        "required": ["citation"],
        "additionalProperties": false
      }
    },
    "lang":    { "type": "string", "enum": ["fr", "en"], "description": "…" },
    "refresh": { "type": "boolean", "description": "…" }
  },
  "required": ["citations"],
  "additionalProperties": false
}
```

*Les `description` sont abrégées ici et font foi dans `src/mcp/registry.ts` : les recopier
verbatim créerait une seconde source de vérité, qui dériverait. **Depuis le 2026-09-16, TOUT
paramètre déclaré porte une description**, et `test/garde.test.ts` échoue si l'un la perd.*

⚠ **`citation` n'a délibérément PAS de `minLength`.** Le validateur refuse l'appel ENTIER, jamais
un seul élément : une chaîne vide dans un lot de vingt-cinq ferait échouer les vingt-quatre autres.
Rendue au travers de l'outil, elle vaut ILLISIBLE — un constat, porté par la bonne citation. C'est
le seul paramètre du connecteur où la permissivité du schéma est le bon choix, et c'est pourquoi
elle est écrite ici.

**Algorithme, par citation :**

1. **Assainir la citation reçue** (`citationSure`) : elle est RÉÉMISE en tête du bloc de sortie, sous la forme « <citation> — <VERDICT> ». Les blancs sont repliés sur une espace simple, les caractères de contrôle retirés, la longueur bornée à 200. Sans cela, un saut de ligne dans l'entrée insérerait une SECONDE ligne de cette même forme — un verdict forgé par le texte que l'outil sert précisément à mettre en doute. On replie plutôt qu'on refuse : une citation collée depuis un PDF porte souvent un retour à la ligne parasite, et la refuser transformerait une maladresse banale en échec.
2. Analyser (§6). `unparsed` ⇒ `ILLISIBLE`. `reporter`/`publisher` ⇒ `NON CONSTRUCTIBLE` — et si `expected_title` est fourni, **enchaîner automatiquement** un `find_case` borné (± 1 an) et proposer les candidats.
3. Cache `cases` (sauf `refresh`). Sinon `GET caseBrowse/{lang}/{db}/{caseId}/`, avec la boucle d'auto-correction (§6.4). Persister la fiche obtenue.
4. **Toute issue qui n'est pas un constat ⇒ `INDÉTERMINÉE`**, et jamais `INTROUVABLE` : CanLII injoignable, `401`, `429`, expiration, budget d'appels du tour épuisé, et — *ajouté le 2026-09-17* — **réponse INEXPLOITABLE** : un `2xx` dont le corps n'est pas analysable, ou dont la lecture a été interrompue. Cette dernière est celle qu'on oublie, parce qu'elle arrive sous un statut de SUCCÈS : le connecteur a rendu « CanLII a renvoyé une erreur 200 » pendant tout le temps où elle n'avait pas de cause à elle. Le corps le dit en toutes lettres — « Ce n'est PAS un constat d'absence ». C'est l'invariant 9.
5. `404` définitif ⇒ `INTROUVABLE`.
6. Comparer : intitulé (§6.5), année de `decisionDate` contre `expected_year`. Concordance ⇒ `CONFIRMÉE` ; écart ⇒ `DISCORDANTE`, les deux valeurs affichées.
   ⚠ **Un contrôle qui ne s'EXÉCUTE pas se DIT** (*2026-09-17*). Si `expected_year` est fourni et que la fiche ne porte AUCUNE date, la comparaison n'a pas lieu : elle doit alors produire un écart explicite — « l'année n'a PAS été vérifiée » — et donc `DISCORDANTE`. La condition portait jusqu'ici `expected_year && decision_date`, si bien que le contrôle **disparaissait sans un mot** et qu'une citation d'année fausse pouvait ressortir `CONFIRMÉE` sans avoir été comparée. C'est le mode de panne de §2 dans sa forme littérale : une incertitude connue transformée en assurance. Le verdict `DISCORDANTE` est délibéré (invariant 10) — mieux vaut un faux signalement qu'une fausse assurance.
7. Consigner dans `search_log` (`tool`, `query`, `verdict`).

Gabarit de sortie : **Annexe A.1**.

### 7.2 `find_case`

> **Description :** « Recherche une décision par les noms des parties ou un fragment d'intitulé, avec tribunal et bornes de date facultatifs. Sert de rattrapage lorsque la citation n'est pas constructible (recueils, SOQUIJ) ou lorsqu'on ne connaît que les parties et l'année. Interroge d'abord l'index local, puis balaie la base de CanLII sur la fenêtre demandée. La recherche porte sur l'INTITULÉ et les mots-clés uniquement — l'API de CanLII n'expose pas le texte des décisions et ne permet aucune recherche par mots du texte. »

```jsonc
{
  "type": "object",
  "properties": {
    "title":       { "type": "string", "minLength": 2, "maxLength": 200 },
    "database_id": { "type": "string", "maxLength": 20 },
    "year_from":   { "type": "integer", "minimum": 1800, "maximum": 2100 },
    "year_to":     { "type": "integer", "minimum": 1800, "maximum": 2100 },
    "lang":        { "type": "string", "enum": ["fr", "en"] },
    "limit":       { "type": "integer", "minimum": 1, "maximum": 25 },
    "live":        { "type": "boolean" }
  },
  "required": ["title"],
  "additionalProperties": false
}
```

**Algorithme :**

1. **Index local d'abord** : `cases_fts MATCH ?` filtré par `database_id` et par la fenêtre de dates. Résultats suffisants ⇒ renvoyer, en indiquant la provenance.
   ⚠ **La fenêtre s'applique à `decision_date` quand elle existe, et sinon à l'ANNÉE lue dans le préfixe du `caseId`** (*2026-09-17*). Une ligne moissonnée n'a pas de date ; le repli portait auparavant sur `neutral_cite`, qui n'existe pas avant 2000 — 1 634 des 1 819 lignes concernées en production n'en avaient aucune, et sortaient donc de **toute** recherche locale bornée par année. Le trou ne se voyait pas : une date fabriquée tenait le filtre en sous-main. L'année du préfixe est vraie, et elle est **éprouvée par différentiel** — 934 fiches sur 934 concordent avec la date rendue par CanLII, zéro divergence. Elle sert au filtrage et au classement (`anneeInferee`), **jamais au rendu** : une année n'est pas une date.
2. **Balayage vif** si `live` (défaut : vrai lorsque l'index rend moins de trois candidats) : pour chaque année de la fenêtre, `GET caseBrowse/{lang}/{db}/?offset=0&resultCount=5000&decisionDateAfter=YYYY-01-01&decisionDateBefore=YYYY-12-31`, pagination par `offset` jusqu'à épuisement ou plafond de budget. `resultCount = 5000` et non le maximum de 10 000 : marge sous le plafond de 10 Mo.
3. Filtrer côté Worker sur `title_norm` (§6.5). **Persister toutes les fiches moissonnées** si `PERSIST_SWEEPS` — c'est ainsi que l'index se construit (D6) — **les QUATRE champs que porte une liste, et pas un de plus**. Écriture par lots `db.batch()` de 100 énoncés.
   ⚠ **Aucune date n'est écrite, et aucune n'est rendue** (*2026-09-17*). La liste n'en porte pas (annexe B), et en déduire une de la fenêtre d'année inventerait le JOUR et le MOIS — l'année, elle, est vraie. Le gestionnaire l'a fait pendant des mois : Godbout c. Longueuil (Ville) ressortait au 1er janvier 1997 quand l'arrêt est du 31 octobre. Et la ligne étant persistée ainsi, le `COALESCE` de l'UPSERT faisait gagner la valeur non nulle : la date fabriquée **écrasait** la vraie date d'une fiche déjà résolue, sans rétrograder `source`. Ce qui se déduit d'une fenêtre, c'est une **année**, et une année n'est pas une date : voir `anneeInferee`, pour le filtrage et le classement, jamais pour le rendu.
4. `database_id` absent : exiger une fenêtre de dates d'au plus 3 ans et balayer les bases québécoises usuelles (`qcca`, `qccs`, `qccq`) ; au-delà, refuser en demandant de préciser le tribunal.

5. **Un balayage INTERROMPU s'annonce DANS L'EN-TÊTE**, que la liste rendue soit vide ou non. Il ne suffit pas d'une note en pied : une réserve placée sous « N candidats » corrige une affirmation déjà faite, ce que l'invariant 9(c) interdit. La ligne de troncature disparaît alors, et la note d'étranglement cesse d'affirmer que le résultat n'est « ni tronqué ni affaibli ». *La branche non vide ne le faisait pas avant le 2026-09-17.*

Gabarit : **Annexe A.2**.

### 7.3 `get_case`

> **Description :** « Fiche CanLII d'une décision : intitulé, citation, date, numéro de dossier de cour, mots-clés et hyperlien canlii.ca. Accepte soit une citation (« 2020 QCCA 495 »), soit le couple database_id + case_id. Ne renvoie PAS le texte de la décision : suivre l'hyperlien. N'ÉPROUVE PAS la citation : aucun verdict, aucune comparaison d'intitulé, aucun contrôle d'année — la fiche rendue est celle de la décision TROUVÉE, qui peut n'être pas celle que l'on croyait citer. Pour savoir si une référence rencontrée ailleurs est juste, employer verify_citations. »

*Amendée le 2026-09-16. Les deux outils se ressemblent assez pour être confondus : tous deux
partent d'une citation et rendent une fiche. La différence est qu'ici la citation est tenue pour
JUSTE et sert d'adresse, tandis que §7.1 la met en doute et rend un verdict. Un modèle qui appelle
celui-ci pour « vérifier » une référence obtient une fiche d'allure officielle et en conclut que
la citation est bonne — alors que rien n'a été comparé. Les deux descriptions se renvoient
désormais l'une à l'autre, et `test/garde.test.ts` épingle ce renvoi croisé.*

Paramètres : `citation` **ou** (`database_id` + `case_id`) ; `lang` ; `refresh`. Valider qu'exactement l'une des deux formes est fournie.

### 7.4 `citator`

> **Description :** « Citateur, sur la collection de CanLII : décisions citées PAR une décision (`cited`), décisions qui LA citent (`citing`), ou dispositions législatives qu'elle cite (`legislation`). Les listes sont brutes : elles n'indiquent aucun sens de traitement (suivi, distingué, infirmé), et leur exhaustivité est celle de la collection de CanLII. Pour les dispositions québécoises, enchaîner avec le connecteur « Législation du Québec » afin d'en lire le texte officiel. »

Paramètres : `database_id`, `case_id` (ou `citation`), `rel` (`enum ["cited","citing","legislation"]`), `limit` (défaut et maximum : `LIMITES.citator`, §8), `offset`, `refresh`.

> **Contrainte de l'API à coder en dur :** le chemin du citateur **n'accepte que `en`** comme segment de langue. Construire `caseCitator/en/{db}/{caseId}/{metadataType}` quel que soit le `lang` demandé, et rendre malgré tout la sortie en français. Ne pas exposer de paramètre `lang` sur cet outil.

Correspondance `rel` → `metadataType` : `cited` → `citedCases`, `citing` → `citingCases`, `legislation` → `citedLegislations`.

### 7.5 `subsequent_history`

> **Description :** « Indice heuristique de sorts ultérieurs : parmi les décisions DE LA COLLECTION DE CANLII qui citent la décision de départ, retient celles qui émanent d'une juridiction supérieure et dont l'intitulé ressemble au sien. NE REMPLACE PAS un citateur professionnel : n'indique pas si la décision a été infirmée, confirmée ou distinguée, et ne détecte ni les pourvois pendants, ni les refus de permission d'appeler, ni les désistements. À vérifier systématiquement à la source. »

Algorithme : `citing` ⇒ filtrer sur (a) `database_id` de rang supérieur selon la table de hiérarchie ci-dessous, (b) similarité d'intitulé ≥ 0,5 (§6.5), (c) `decisionDate` postérieure. Trier par date croissante.

| Base de départ | Juridictions supérieures |
|---|---|
| `qccq`, `qctal`, `qctat`, `qctaq` | `qccs`, `qcca`, `csc-scc` |
| `qccs` | `qcca`, `csc-scc` |
| `qcca` | `csc-scc` |
| autres | `csc-scc` |

La sortie porte **en tête et en pied** la mise en garde. Aucune formulation affirmative (« a été infirmée ») n'est permise : uniquement « indice », « susceptible », « à vérifier ».

### 7.6 `browse_cases`

> **Description :** « Liste les décisions d'un tribunal, les plus récemment diffusées en tête, avec filtres de date : date de la décision (`decision_date_*`), date de diffusion sur CanLII (`published_*`) ou date de dernière modification (`modified_*`, `changed_*`). Utile pour la veille et pour cerner la couverture de CanLII pour un tribunal donné. »

Paramètres : `database_id` (obligatoire), `lang`, `offset` (défaut 0), `limit` (défaut et maximum : `LIMITES.browse_cases`, §8 — **max 100** — bien en deçà du maximum de 10 000 de l'API : au-delà, la sortie est inexploitable par un modèle), plus les huit filtres de dates, tous au format `AAAA-MM-JJ` et **inclusifs**.

Rappeler dans la sortie, lorsqu'un filtre `published_*` est employé, le délai de diffusion et le jeu de deux jours recommandé.

### 7.7 `list_databases`

> **Description :** « Répertoire des bases de CanLII : cours et tribunaux (`kind='case'`) ou corpus législatifs (`kind='legislation'`), avec leur databaseId et leur ressort. Point de départ de toute commande exigeant un database_id. DEUX COMPTES paraissent dans la sortie et ne mesurent PAS le même ensemble : la note de rafraîchissement annonce le répertoire ENTIER de CanLII, tandis que l'en-tête de la liste ne compte que les bases retenues par les filtres, qu'il nomme. »

Paramètres : `kind`, `jurisdiction`, `query` (recherche sur `name_norm`), `refresh`. Sert le répertoire local si `refreshed_at` a moins de 7 jours ; sinon `GET caseBrowse/{lang}/` et `GET legislationBrowse/{lang}/`, puis mise à jour (deux appels — le rafraîchissement est aussi ce que fait le cron).

**Deux comptes paraissent dans la sortie, et ils ne mesurent pas le même ensemble.** La note de rafraîchissement porte sur le répertoire **ENTIER** rendu par CanLII — ce sont les longueurs des deux charges utiles — tandis que l'en-tête de la liste porte sur les seules lignes **LOCALES** retenues par `kind`, `jurisdiction` et `query`. **Chaque phrase nomme son ensemble, et l'en-tête nomme le filtre.** Les deux ont longtemps été vraies et illisibles ensemble : « 409 base(s) de jurisprudence, 50 base(s) législative(s) » suivi de « 4 base(s) au répertoire de CanLII », sans qu'aucune ne dise qu'un filtre était en jeu. La construction des filtres ne servait qu'à la branche VIDE (« Aucune base pour kind=… ») ; elle est désormais hissée et partagée, faute de quoi les deux chemins nommeraient le filtre différemment. *Constaté et corrigé le 2026-09-17.*

⚠ **`base(s) au répertoire de CanLII` est une CHAÎNE DE COUPLAGE.** `scripts/refresh-databases.mjs` la cherche telle quelle (`includes`) dans la sortie entière et sort en **code 2** — refus de statuer — si elle disparaît. Ce qui la précède et ce qui la suit est libre ; ces trente et un caractères ne le sont pas. Même statut pour la puce `· ` et la flèche ` -> ` des lignes d'écart, que le script repère par la FORME `/^·\s+.+\s+->\s+\S+/`. Les deux sont désormais épinglés par un test qui lit les littéraux **dans** le script — jamais une copie, qui vivrait des deux côtés d'une frontière TypeScript/JavaScript qu'aucun compilateur ne vérifie.

### 7.8 `browse_legislation`

> **Description :** « Liste les lois ou règlements d'une base législative DE CANLII (p. ex. « qcs » pour les lois du Québec), avec leur legislationId, leur citation et leur type. »

### 7.9 `get_legislation`

> **Description :** « Fiche CanLII d'une loi ou d'un règlement : citation, type, indicateur d'abrogation, découpage en parties, et les dates de la VERSION CONSOLIDÉE que CanLII sert. Ces dates bornent cette version, JAMAIS l'instrument : elles ne datent ni son entrée en vigueur ni son abrogation, et un texte en vigueur depuis des décennies peut porter une date de début toute récente. Le régime de dates de CanLII est rendu BRUT puis glosé, parce que ses valeurs ne disent pas la même chose : « ENTRY_INTO_FORCE » vise l'entrée en vigueur de la VERSION, « DOWNLOAD_DATE » le seul jour où CanLII a téléchargé le texte. Utile pour vérifier une abrogation, PAS pour dater une disposition. Pour le TEXTE d'une loi ou d'un règlement du Québec, utiliser le connecteur « Législation du Québec », qui rend le texte officiel verbatim. »

Rendre `repealed` en français explicite (« Abrogé : oui / non »). **Ne JAMAIS rendre `dateScheme` brut et seul** : c'est un enum de CanLII documenté NULLE PART, dont deux valeurs sont observées — `ENTRY_INTO_FORCE` et `DOWNLOAD_DATE` — et elles ne disent pas la même chose. Le rendre BRUT entre guillemets **et** glosé d'une phrase par valeur connue ; pour toute autre valeur, « régime inconnu de ce connecteur ; n'en rien inférer » — c'est la règle d'`abroge()`, étendue. `startDate` et `endDate` se rendent en **UNE** fenêtre dont le SUJET est la version (« Version servie par CanLII : du … au … »), immédiatement suivie de `GARDE_VERSION_LEGISLATIVE`.

⚠ *Amendé le 2026-09-17. La rédaction antérieure — « et afficher `dateScheme`, `startDate`, `endDate` » — était la SOURCE du défaut : elle mandatait l'affichage brut d'un enum, et la description le glosait par « (entrée en vigueur) ». Observé en production le même jour : `qcs / cqlr-c-ccq-1991` rendait « Régime de dates : ENTRY_INTO_FORCE » sous « Date de début : 2026-02-24 », ce qui se lit « le Code civil est entré en vigueur en 2026 » — il l'est depuis 1994, et la date borne la version consolidée servie. `qcr / cqlr-c-c-25.01-r-0.2.1` rendait `DOWNLOAD_DATE` dans la MÊME forme, où la date n'est que le jour du téléchargement et n'a aucune portée juridique. La PREUVE que la fenêtre borne une version est dans `qch / lrq-c-c-24`, abrogé : 1986-12-18 → 1987-12-01 — aucun instrument ne vit onze mois et demi. La phrase « Utile pour dater une disposition » a été retirée de la description : elle instruisait le modèle de faire avec ces dates exactement ce qu'il ne faut pas.*

### 7.10 `parse_citation`

> **Description :** « Analyse une citation sans appeler CanLII : indique la forme reconnue (citation neutre, citation attribuée par CanLII, recueil, identifiant d'éditeur), et, si elle est constructible, le database_id et le case_id qui en découlent. Outil de diagnostic ; pour vérifier réellement l'existence d'une décision, utiliser verify_citations. »

Aucun appel sortant, aucune écriture. Utile au débogage de la table `court_codes` et pour expliquer un `NON CONSTRUCTIBLE`.

---

## 8. Transport MCP et routage

*Tableau amendé le 2026-09-16 : il ne connaissait ni `/mcp/<secret>/` ni le chemin mal encodé. La première forme rendait `401` sur une URL correcte, la seconde faisait sortir le Worker en `500` — deux refus qu'il ne décrivait pas parce qu'il ignorait qu'ils existaient. Voir §9.1.*

| Route | Méthode | Réponse |
|---|---|---|
| `/mcp/<secret>` | `POST` | Point d'entrée MCP (Streamable HTTP, mode JSON sans état) |
| `/mcp/<secret>/` | `POST` | **Identique** — la barre oblique finale est tolérée (§9.1) |
| `/mcp/<secret>/<suite>` | `POST` | **Identique si le secret contient `/`** — la profondeur est conservée, on ne borne pas à un segment (§9.1) |
| `/mcp` · `/mcp/` | `POST` | `401` + `WWW-Authenticate: Bearer` — **sauf** si l'en-tête `Authorization` porte un secret admis |
| `/mcp/<chemin mal encodé>` | `POST` | `401` — **jamais `500`** (§9.1) |
| `/mcp/server-card` | `GET`, `HEAD`, `OPTIONS` | `200` (`application/mcp-server-card+json; charset=utf-8`) · `204` sur `OPTIONS` (`Access-Control-Allow-Origin: *`) · `405` sur toute autre méthode. Exception **nommée** avant la garde `/mcp*` : métadonnées publiques SEP-2127 sans secret (§20), soumises au coupe-circuit (`404` si `MCP_ENABLED !== "true"`) |
| `/mcp*` | `OPTIONS` | Pré-vol CORS, répondu **avant** l'authentification lorsque l'`Origin` est admise — un pré-vol ne porte aucun secret ; l'exiger casserait le connecteur sans rien protéger (§9.6) |
| `/mcp*` | toute méthode | `403` si l'en-tête `Origin` est présent et inconnu — ré-attachement DNS (§9.6). `Origin` absent (serveur à serveur) ⇒ admis |
| `/mcp*` | toute méthode | `429` + `Retry-After` au-delà de 60 requêtes/minute par IP : **après** le pré-vol, **avant** le contrôle de méthode et l'authentification (§9.3) |
| `/mcp*` | `GET`, `DELETE` | `405` — aucun flux SSE, aucune session |
| `/health` | `GET` | `200 {"status":"ok","commit":"<sha court>"}` — sans authentification. *Amendé le 2026-09-16 : disait « sans divulgation ». Le champ `commit` EN EST UNE, et elle est assumée — il annonce de quel commit la version en ligne est issue, donc si un correctif publié est déjà déployé. Le dépôt étant public, tout le code l'est déjà ; ce qui s'ajoute est un horodatage de fait. « inconnu » quand la version n'est pas passée par `npm run deploy` : un aveu, pas un remplissage (§12).* |
| tout le reste | — | `404` |

`MCP_ENABLED !== "true"` ⇒ **`404` sur toutes les routes MCP**, y compris `/health` et `/mcp/server-card`. Coupe-circuit identique à celui d'Athéna.

**Méthodes JSON-RPC :** `server/discover` (obligatoire sous `2026-07-28`), `initialize`, `notifications/initialized` (⇒ `202`, corps vide), `tools/list`, `tools/call`, `ping`. Toute autre méthode ⇒ `-32601`.

`initialize` : négocier `protocolVersion` (versions servies : `2026-07-28`, `2025-11-25`, `2025-06-18`, `2025-03-26` ; pour `initialize`, la plus élevée des versions **héritées**, §8 / `rpc.test.ts`) ; `serverInfo: { name: "mcp-jurisprudence", title: "MCP Jurisprudence", version }` *(identifiant et libellé renommés le 2026-09-16 ; l'identifiant s'écrivait `jurisprudence-canlii`)* ; `capabilities: { tools: { listChanged: false } }`.

⚠ **`version` est un littéral dans `SERVER_INFO` (`src/mcp/registry.ts`), désormais ÉPINGLÉ PAR TEST *(2026-11-13)*.** Le `2026-09-16`, `SERVER_INFO.version` et `package.json` pouvaient diverger en silence après un `npm version`. Depuis le 2026-11-13, `test/doc.test.ts` confronte ensemble `package.json`, `SERVER_INFO.version`, `plugin.json`, `gemini-extension.json` et `carteServeur().version` (`/mcp/server-card`), ce qui ferme la dérive silencieuse entre le paquet, le serveur et les manifestes clients.

**Enveloppe de résultat**, calquée sur `mcp/tools.py` d'Athéna :

```ts
{ content: [{ type: "text", text: <sortie française> }], isError: false }
```

Ne **pas** émettre `structuredContent` : `qclaw` ne le fait pas, la sortie est du texte destiné à être lu, et la symétrie prime.

**Validation des arguments** : porter `validate_args` de `athena/mcp/tools.py` en TypeScript — même sous-ensemble (`type`, `properties`, `required`, `enum`, `minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, `maxItems`, `items`, `additionalProperties: false`), mêmes messages, en français. *Amendé le 2026-09-16 : `items` était annoncé « sur un niveau » ici comme dans le cartouche du fichier. Il est RÉCURSIF sans borne — `validateValue` se rappelle sur chaque élément, et un élément objet fait valider ses propriétés. La mention SOUS-ESTIMAIT le validateur, et aurait pu faire renoncer à un schéma imbriqué parfaitement supporté ; c’est d’ailleurs lui qui valide champ par champ les vingt-cinq entrées de `verify_citations`.* Échec ⇒ `isError: true`, jamais une erreur JSON-RPC.

**Ce que le sous-ensemble NE SAIT PAS imposer, et ce qu'on en fait.** *Arbitré le 2026-09-16.*
Le validateur ne connaît ni `pattern`, ni `oneOf`, ni aucune contrainte ENTRE champs :
`validateValue(schema, value, nom)` ne voit jamais le parent. Plusieurs outils imposent donc dans
leur GESTIONNAIRE une règle qu'un appel conforme au schéma peut enfreindre — le XOR
`citation` / (`database_id` + `case_id`) pour `get_case`, `citator` et `subsequent_history`
(ainsi que l'ex-outil `palais_get`, transféré en v0.3.0 vers `MCP-Outils`), le format `AAAA-MM-JJ` des huit filtres
de dates, et les bornes d'année de `find_case`. Le modèle composait un appel valide et
recevait un refus, sans avoir eu le moyen de le prévoir.

**On N'ÉTEND PAS le validateur, et le motif n'est pas la paresse.** `oneOf` n'exprime même
pas la règle voulue : `oneOf: [{required:["citation"]}, {required:["database_id","case_id"]}]`
**accepte** `{citation, database_id}` — une seule branche satisfaite — alors qu'aucun des
trois outils ne l'accepte. On déplacerait l'écart au lieu de le fermer, en ayant écrit du code
de validation neuf sur le chemin que TOUT appel traverse. La règle va donc là où le modèle la
lit : dans la `description` du paramètre, et elle y est **répétée** sur chacun des deux
membres plutôt que renvoyée de l'un à l'autre — rien ne garantit qu'un modèle lise les
paramètres dans l'ordre, ni qu'il en lise deux.

⚠ Un garde-fou éprouve les DEUX moitiés : la règle est écrite dans la description, **et** le
gestionnaire refuse réellement. Sans la seconde, on décrirait une contrainte qui n'existe plus
— le défaut inverse, tout aussi muet.

**Les valeurs par défaut vivent dans `src/mcp/defauts.ts`, en un seul exemplaire.** Elles
vivaient à deux endroits — le `?? 50` du gestionnaire et le « défaut 25 » de la description —
et avaient divergé sur **trois outils sur cinq**. La divergence a été introduite le
2026-09-16 même, en ajoutant les descriptions manquantes : « défaut 25 » écrit partout par
analogie, sans lire le gestionnaire. Rien ne cassait ; le modèle budgétait simplement de
travers. Les descriptions sont désormais ENGENDRÉES depuis ces constantes et les
gestionnaires les LISENT.

---

## 9. Sécurité

### 9.1 Authentification

*Amendée le 2026-09-16. Cette section énonçait deux formes SANS dire leur préséance — et elle avait raison de n'en énoncer aucune : il n'en faut pas. Le CODE, lui, en avait inventé une (retour anticipé sur l'en-tête), si bien que la spécification décrivait depuis l'origine un comportement qui n'existait pas. Le correctif ne change donc pas la règle : il rend la spécification vraie. L'ancienne rédaction — « Le secret est accepté sous deux formes, afin de couvrir tous les clients », muette sur la précédence — reste citée ici plutôt qu'effacée : qui la retrouverait ailleurs doit savoir qu'elle décrivait une intention, pas le code.*

Le secret est accepté sous deux formes, afin de couvrir tous les clients, et **sans aucune préséance entre elles** :

1. dernier segment du chemin : `POST /mcp/<secret>` ;
2. en-tête : `Authorization: Bearer <secret>` (nom de schéma insensible à la casse, RFC 7235 §2.1).

**Tous les porteurs présents sont essayés ; aucun n'en masque un autre.** Le défaut corrigé était concret : un `Authorization` résiduel — périmé, collé d'un autre connecteur, posé par un mandataire — rendait inopérante une URL parfaitement correcte, et son refus était indiscernable d'un mauvais secret.

**Les graphies du chemin tolérées**, la tolérance étant strictement **ÉLARGISSANTE** — on ajoute des candidats, on n'en transforme aucun :

| Forme reçue | Traitement | Défaut fermé |
|---|---|---|
| `/mcp/<secret>` | candidat tel quel **et** décodé | le cas normal |
| `/mcp/<secret>/` · `//` | candidat de plus, barres finales ôtées | `401` sur une URL correcte |
| `/mcp/x%FF` | `decodeURIComponent` lève ; l'exception est avalée **sans trace**, le candidat brut reste essayé | `500` au lieu d'un refus |
| `/mcp/a/b` | **conservé entier** — aucune borne à un segment | un secret contenant `/` cesserait d'ouvrir |
| `/mcp/` nu | aucun candidat par le chemin ; l'en-tête décide seul | se comporte comme `/mcp` |

⚠ **Pourquoi AJOUTER plutôt que ROGNER.** Le secret de production n'est connu ni du code ni de qui le modifie. Il peut se terminer par `/` — l'alphabet base64 **standard** en produit — ou porter un `%`. Un rognage « évident » casserait alors une authentification qui fonctionne, en production, sans qu'aucun test ne le dise. Le pire cas d'un candidat surnuméraire est une empreinte SHA-256 calculée pour rien ; le pire cas d'un rognage est un connecteur mort. **On ne resserre pas l'analyse d'un porteur contre une valeur qu'on s'interdit de lire.** Corollaire sur la profondeur : le connecteur jumeau borne à un seul segment parce qu'il DOIT remonter la requête sur son chemin de montage ; ici le chemin n'est qu'un porteur, rien n'est remonté, et borner serait un rétrécissement sans contrepartie.

⚠ **L'élargissement n'admet aucun PRÉFIXE du secret.** Seules des barres obliques *finales* sont ôtées, et seulement pour produire un candidat de plus. Toute valeur ainsi admise est une valeur dont la connaissance implique déjà celle du secret. Épinglé par un test (« élargir n'est pas ouvrir »).

⚠ **Pourquoi le refus reste `401` + `WWW-Authenticate: Bearer`**, et non `404` comme chez le jumeau. C'est le refus qui pousse claude.ai vers la découverte OAuth — `.well-known/*` (404), `POST /register` (404), puis « Impossible de s'inscrire auprès du service de connexion » — et il est tentant d'en conclure qu'il faut changer de statut. **Le statut n'est pas le déclencheur** : le jumeau refuse en `404` et a reçu le MÊME message. Et un `404` ici rendrait indiscernables le coupe-circuit de §8 (`MCP_ENABLED=false`, qui rend déjà `404` sur tout `/mcp`) et le secret refusé — ambiguïté que le jumeau assume et que ce connecteur n'a pas. Ce qui devait être corrigé, c'est le refus INJUSTIFIÉ.

**Deux secrets sont admis**, aux droits strictement identiques : `MCP_SHARED_SECRET`
(connecteur claude.ai) et `MCP_SHARED_SECRET_ATHENA` (clavardage de Pallas Athéna,
§19). Le second est facultatif ; absent, un seul porteur est admis et le comportement
est celui d'avant. Ils ne délimitent aucun périmètre — ce que protège D7 reste la clef
d'API et son quota — et n'existent séparément que pour la **révocation** : faire
tourner le secret de claude.ai ne devait pas éteindre le clavardage du cabinet, ni
l'inverse. *Amendé le 2026-09-16 : ce clavardage a été retiré le 2026-09-02 (§19) et
`MCP_SHARED_SECRET_ATHENA` n'a plus de porteur. La règle ne bouge pas — le second secret
reste admis, et elle vaudra pour le prochain client — mais son témoin vivant a disparu :
depuis cette date, la forme par en-tête n'est couverte que par `test/rpc.test.ts` et par
un `curl` à la main, à refaire explicitement après toute retouche de la garde d'entrée.* Corollaires : le Worker reste **fermé par défaut** (aucun secret configuré ⇒
tout est refusé), les deux échecs rendent le **même** `401`, et aucune réponse ni aucune
trace ne dit lequel a servi.

Comparaison **à temps constant**, sur les empreintes plutôt que sur les chaînes (ce qui neutralise aussi l'écart de longueur) :

```ts
async function secretOk(given: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}
```

**Coût de la garde, et pourquoi il est acceptable.** La comparaison porte sur le produit `candidats × secrets` : au pire **5 × 2 = 10 paires, soit 20 empreintes SHA-256** en une seule vague `Promise.all` — quelques dizaines de microsecondes, sur une requête qui en passera 100 à 600 **milli**secondes en D1 et chez CanLII. Le dédoublonnage des candidats ramène le cas normal (secret hexadécimal, sans barre finale, un seul secret configuré) à **deux** empreintes, c'est-à-dire exactement ce que la garde coûtait avant. On ne mémorise délibérément **pas** l'empreinte des attendus : `secretOk` ci-dessus est la primitive publiée et relue comme telle, et le défaut corrigé le 2026-09-16 était un défaut d'analyse du CHEMIN, non de comparaison.

⚠ **Aucun court-circuit observable.** `Promise.all` résout TOUT le produit avant que `some` ne lise des booléens déjà calculés : ni le porteur ni le secret qui a servi n'est déductible du temps de réponse (§9.2). Le dédoublonnage, lui, n'oppose que des valeurs *présentées* entre elles. Et le défaut fermé joue désormais des deux côtés du produit — aucun secret configuré **ou** aucun porteur présenté ⇒ produit vide ⇒ refus, par la même ligne.

### 9.2 Journalisation

L'URL complète d'une requête entrante contient le secret. **Ne jamais journaliser `request.url` tel quel** : journaliser la méthode, le nom de l'outil et le statut. Le secret est remplacé par `/mcp/***` dans toute trace. Cette contrainte est le prix de la simplicité du modèle D7 et doit figurer en commentaire dans `src/index.ts`.

### 9.3 Étranglement au bord

*Amendée le 2026-09-16, sur constat du code livré. La rédaction du 2026-07-15 disait : « Ajouter dans le tableau de bord Cloudflare une règle de limitation de débit sur `jurisprudence.poirierlavoie.ca` : 60 requêtes/minute par IP, action “bloquer”. » Elle est citée et non effacée : la MESURE est inchangée, seul son lieu a changé — et personne n'a jamais créé cette règle de zone.*

La limitation vit **dans le Worker**, par le binding `ratelimits` de `wrangler.jsonc` (`RATE_LIMITER`, 60 requêtes / 60 s), et non par une règle WAF. Trois motifs, dans l'ordre croissant : la règle est versionnée, relue en revue et éprouvée par des tests ; le binding ne dépend pas du forfait de la ZONE ; et surtout une expression WAF viserait `/mcp` **par un motif de chemin**, or ce chemin porte le secret partagé (D7) et une expression WAF se lit au tableau de bord comme dans les journaux d'audit — la défense en profondeur aurait publié ce qu'elle protège.

Ordre d'application, délibéré des deux côtés : **après** le pré-vol CORS — un `429` sur un pré-vol ne parvient au navigateur que sous la forme d'un échec CORS, illisible — et **avant** le contrôle de méthode et l'authentification, pour qu'une rafale mal authentifiée cesse de coûter, ce qui est l'objet même de la mesure. Deux limites énoncées plutôt que découvertes : le compteur est **local à chaque emplacement** Cloudflare (60/min par point de présence : protection contre l'emballement et le coût, non contre un attaquant réparti) et le compte n'est qu'éventuellement cohérent. Binding absent ou en panne ⇒ **la requête passe** : un connecteur juridique devenu muet est un défaut plus grave qu'une rafale non comptée, et l'authentification, elle, reste fermée par défaut. Défense en profondeur si le secret fuit.

### 9.4 Chemin d'évolution vers OAuth 2.1

Si le connecteur est un jour partagé, ou si un audit l'exige, remplacer §9.1 par `@cloudflare/workers-oauth-provider` : émission des jetons dans KV, `/.well-known/oauth-protected-resource` (RFC 9728) et `/.well-known/oauth-authorization-server` (RFC 8414), enregistrement dynamique de client (RFC 7591) restreint aux URI de rappel de Claude. C'est exactement ce qui existe déjà dans la phase I d'Athéna — le flux est connu. **Ne pas l'implémenter maintenant** : la complexité n'est pas justifiée par la valeur protégée.

### 9.5 Secret professionnel

Ce connecteur est, sur ce plan, exceptionnellement propre : ce qui sort de l'infrastructure, ce sont des **citations, des identifiants de tribunaux et des dates**. Aucun nom de client, aucun fait de dossier, aucun document.

**Une seule réserve, à documenter dans le README** : `find_case` prend des **noms de parties**. Si ce nom est celui d'une partie à un dossier en cours plutôt que celui d'une décision publiée, la requête révèle à CanLII un intérêt de recherche. Le risque est faible — CanLII est un organisme sans but lucratif canadien, et la recherche jurisprudentielle nominative est l'usage normal du site — mais il n'est pas nul, et il mérite d'être connu plutôt que découvert.

### 9.6 Contrôle d'origine — défense contre le ré-attachement DNS

*Ajoutée le 2026-09-16. Le contrôle existait dans `src/index.ts` depuis l'origine, six tests de `test/rpc.test.ts` le tiennent, et §18.2 y renvoyait déjà — vers un numéro qui n'avait jamais été écrit. Une règle vivante sans section est une règle qu'on retire « par simplification » sans trouver personne qui l'ait défendue.*

Sur `/mcp*`, un en-tête `Origin` **présent mais inconnu** est refusé d'emblée par un `403`, avant le pré-vol, avant la limitation de débit et avant l'authentification. Les origines admises sont `https://claude.ai`, `https://claude.com`, `https://gemini.google.com` et `https://aistudio.google.com` *(clients web Gemini ajoutés le 2026-11-13)*, plus celles qu'ajoute la variable `ALLOWED_ORIGINS` (liste séparée par des virgules, vide en temps normal) : elles s'**ajoutent**, elles ne remplacent pas.

Une origine **absente** passe, et ce n'est pas un relâchement : un appel serveur à serveur — comme `scripts/mcp-client.mjs`, le gestionnaire d'extensions Gemini CLI, le serveur de langage Antigravity ou l'ancien clavardage retiré le 2026-09-02 (§19) — n'est pas soumis à la politique de même origine et ne peut donc pas être détourné de cette façon.

Quatre corollaires, tous testés. Le **pré-vol** `OPTIONS` est répondu **sans** exiger de porteur et autorise les en-têtes MCP `2026-07-28` (`MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`, `Mcp-Session-Id`) en plus de `Content-Type`, `Authorization`, `Accept` et `Last-Event-ID`. Un `401` porte lui aussi les en-têtes CORS, faute de quoi le navigateur rapporte un échec de CORS au lieu du refus réel — un défaut indiscernable d'une panne. `Vary: Origin` accompagne toute réponse reflétée, sans quoi un cache intermédiaire resservirait à une origine la réponse calculée pour une autre. Enfin, la page publique de §18 et la fiche de découverte SEP-2127 (`/mcp/server-card`, §20) sont **délibérément hors** de ce contrôle (§18.2, point 1).

---

## 10. Observabilité

- `observability: { enabled: true }` dans `wrangler.jsonc` ; consultation par `wrangler tail`.
- **Une ligne `search_log` par invocation d'outil qui TOUCHE D1**, succès compris : un succès non consigné rend les échecs inexploitables faute de dénominateur. Les échecs (`result_count = 0`) sont indexés séparément.

  **Un outil sur dix n'écrit rien, par construction et non par omission** (constaté le 2026-09-16 pour les quatre outils d'alors, mis à jour le 2026-11-14 en v0.3.0) : `parse_citation` ne fait aucun appel sortant ni aucune lecture D1 (les trois ex-outils hors ligne `greffe_parse_court_file_number`, `palais_list` et `palais_get` ayant été transférés en v0.3.0 vers `MCP-Outils`). Son silence dans `search_log` ne se lit donc pas comme un défaut d'usage, et **on ne le corrige pas** : lui ouvrir D1 pour le compter échangerait une statistique contre la disponibilité qui est sa seule garantie.
- **`api_usage`** incrémentée à chaque appel sortant (`calls`), erreur (`errors`) et `429` (`throttled`). Requête d'exploitation :

```sql
SELECT day, calls, errors, throttled FROM api_usage ORDER BY day DESC LIMIT 30;
```

- **Aucun journal ne contient** la clef d'API, le secret partagé, ni une URL non redactée.
- Requête de diagnostic de l'analyseur — les citations que l'on ne sait pas résoudre :

```sql
SELECT query, COUNT(*) n FROM search_log
WHERE tool = 'verify_citations' AND verdict IN ('ILLISIBLE','INTROUVABLE')
GROUP BY query ORDER BY n DESC LIMIT 50;
```

---

## 11. Moissonnage planifié — facultatif, désactivé par défaut

**§16.1 est TRANCHÉE (2026-07-23) : pas de moissonnage de masse. Ne pas basculer `BACKFILL_ENABLED`, même « pour essayer ».** *La rédaction du 2026-07-15 disait : « Ne pas activer sans la détermination de §16.1 » — elle décrivait une attente ; la réponse est venue, et elle est négative.* Ce n'est donc plus une condition suspendue mais une décision du praticien, tenue par deux verrous : le drapeau à `"false"` et l'absence de tout cron quotidien. Ce qui suit reste écrit, testé et **inerte**, parce qu'une conception documentée se relit tandis qu'un code supprimé se réinvente de travers.

Motif : un index local complet des cours du Québec rendrait `find_case` instantané et fiable, au lieu de dépendre d'un balayage. La documentation de l'API paraît prévoir cet usage — les filtres `changedAfter` / `modifiedAfter` n'ont guère d'autre raison d'être que la tenue à jour d'une copie locale, et `resultCount` monte à 10 000. Cela reste une **lecture de la documentation, non une autorisation**.

Conception, si activé (`BACKFILL_ENABLED = "true"`) :

- Déclencheur `cron` quotidien ; **plafond de 15 minutes** de durée pour une exécution planifiée, et 30 s de CPU pour un intervalle inférieur à l'heure — l'exécution doit donc être **reprenable**.
- Bases visées : liste dans une variable `BACKFILL_DATABASES` (p. ex. `qcca,qccs,qccq,qctal`).
- Par base, deux phases : (a) **rattrapage** en remontant le temps par fenêtres annuelles depuis `sync_state.cursor_date` ; (b) **delta** quotidien par `changedAfter = dernière exécution − 2 jours` (le jeu recommandé par la documentation).
- Curseur persisté après **chaque page**, jamais seulement en fin d'exécution.
- Budget d'appels sortants distinct et plus généreux que celui des outils, mais borné ; abandon propre à l'approche du plafond de durée.
- Ordre de grandeur : environ 300 octets par fiche ; quelques centaines de milliers de décisions québécoises tiennent largement sous le plafond de taille d'une base D1 — **le vérifier à l'implémentation contre la page des limites de D1**, et prévoir le partage par base si nécessaire.

---

## 12. CI/CD

Dépôt GitHub distinct, calqué sur les protections d'Athéna : **actions épinglées par SHA**, permissions minimales, jetons à portée réduite.

| Fichier | Contenu |
|---|---|
| `.github/workflows/ci.yml` | `tsc --noEmit` · Biome (lint + format) · Vitest avec `@cloudflare/vitest-pool-workers` · `wrangler deploy --dry-run` |
| `.github/workflows/deploy.yml` | Déploiement continu sur `push` vers `main` (+ `workflow_dispatch`), `environment: production` : 4 contrôles préalables en lecture seule du jeton Cloudflare et de la D1 `canlii`, porte complète (`wrangler types`, `tsc`, Biome, Vitest, `--dry-run`), `npm run deploy` (`scripts/deployer.mjs` : migrations D1 puis Worker avec `COMMIT`), puis vérification vivante de `/health` et `/mcp/server-card` |
| `.github/workflows/codeql.yml` | CodeQL, langage `javascript-typescript` |
| `.github/workflows/osv-scanner.yml` | OSV-Scanner sur `package-lock.json` |
| `.github/workflows/trivy.yml` | Trivy, mode système de fichiers |
| `.github/workflows/scorecard.yml` | OpenSSF Scorecard |
| `.github/workflows/verifier-deploiement.yml` | Contrôle de dérive quotidien (§12.1) : compare le `commit` de `/health` au dernier commit de `main`. Aucun secret, aucun jeton, `contents: read` — il regarde, il ne déploie rien |
| `.github/dependabot.yml` | npm + github-actions, hebdomadaire |

**LE DÉPLOIEMENT CONTINU EST RÉTABLI *(2026-11-14)* VIA L'ENVIRONNEMENT `production`.** Après l'interlude manuel entamé le 2026-09-16 (historique conservé ci-dessous), `.github/workflows/deploy.yml` a été rétabli de manière sécurisée : `permissions: contents: read`, actions épinglées par SHA, `harden-runner`, concurrence sérialisée (`cancel-in-progress: false`), isolation du jeton dans l'environnement GitHub `production` (`CLOUDFLARE_API_TOKEN`), quatre contrôles préalables avant installation, porte complète de tests et exécution de **`npm run deploy`** (`scripts/deployer.mjs`) suivie d'une vérification vivante de `/health` et `/mcp/server-card`. La règle d'ordre demeure inchangée : les migrations D1 passent **avant** le déploiement du Worker.

*Historique (2026-09-16) :* `.github/workflows/deploy.yml` avait été temporairement **supprimé** entre le 2026-09-16 et le 2026-11-14 après dix-neuf échecs dus à un `CLOUDFLARE_API_TOKEN` vide au niveau du dépôt, l'ordre migrations-puis-Worker ayant alors été déplacé dans `scripts/deployer.mjs` (`npm run deploy`), où il vit toujours et est désormais appelé à la fois par la CI et en repli local.

### 12.1 Le coût du manuel, et le filet indépendant de dérive

Un déploiement manuel — ou une exécution CD manquée — a un coût : **rien ne signale qu'un commit est poussé sans être en ligne.** L'écart se tient de mémoire, et un écart tenu de mémoire dure plus longtemps qu'on ne croit.

Deux pièces, posées le 2026-09-16 et conservées avec le rétablissement de `deploy.yml` *(2026-11-14)*, rendent tout écart MESURABLE indépendamment du workflow de déploiement :

1. **Le Worker annonce son commit** sur `/health` (§8). La valeur est posée à la volée par `scripts/deployer.mjs`, en `--var COMMIT:<sha>` ; le défaut de `wrangler.jsonc` est « inconnu ».
2. **`.github/workflows/verifier-deploiement.yml`** compare cette valeur au dernier commit de `main`, **une fois par jour**. Il n'a AUCUN secret, aucun jeton, et `permissions: contents: read` : un `GET` sur un point d'entrée public et une comparaison de chaînes. Il attrape tout échec silencieux de `deploy.yml` (jeton expiré, déploiement sauté).

⚠ **Pas de déclenchement sur `push`, délibérément.** Juste après une poussée, `deploy.yml` vérifie déjà `/health` ; une fois par jour, un rouge sur `verifier-deploiement.yml` veut dire quelque chose. **Et un rouge ici signifie « à déployer » (ou échec CD), jamais « cassé »** : la production sert toujours, elle sert une version antérieure.

⚠ **Trois issues distinctes, qui ne se confondent pas** : point d'entrée injoignable, coupe-circuit baissé (`404`), et commit « inconnu » ne sont PAS des dérives — ce sont des absences de mesure. Le contrôle refuse alors de conclure plutôt que de supposer la production à jour. C'est la règle d'INDÉTERMINÉE de §2, appliquée au déploiement.

**`scripts/deployer.mjs` refuse un arbre de travail sale**, et ce n'est pas du zèle : déployer un arbre modifié ferait ANNONCER sur `/health` un commit qui ne décrit pas le code en ligne. Un mensonge silencieux, et le mode de panne que ce dépôt combat partout ailleurs.

---

## 13. Plan de test

**Analyseur (`citation.parse.test.ts`) — matrice obligatoire.** Chaque ligne est un cas :

| Entrée | Attendu |
|---|---|
| `2020 QCCA 495` | `qcca` / `2020qcca495` |
| `2020 qcca 495` | idem (insensible à la casse) |
| `2008 CSC 9` | `csc-scc` / `2008scc9` |
| `2008 SCC 9` | `csc-scc` / `2008scc9` |
| `Dunsmuir c. Nouveau-Brunswick, [2008] 1 RCS 190, 2008 CSC 9 (CanLII)` | neutre extraite ; `[2008] 1 RCS 190` en `parallel` |
| `2002 CanLII 32322 (QC CQ)` | `qccq` / `2002canlii32322` |
| `2005 QCCA 304 (CanLII)` | `qcca` / `2005qcca304` |
| `[1996] 3 R.C.S. 211` | `reporter`, non constructible |
| `[1985] C.A. 105` | `reporter`, non constructible |
| `J.E. 94-1234` | `publisher` (SOQUIJ), non constructible |
| `REJB 1998-09876` · `EYB 2005-12345` · `AZ-51234567` | `publisher`, non constructible |
| `art. 1457 C.c.Q.` | `unparsed` (c'est une disposition, pas une décision) |
| `2023 QCTAL 12345` | `qctal` / `2023qctal12345` |
| `voir la décision de la Cour d'appel` | `unparsed` |
| `2020 XXQQ 12` | code inconnu ⇒ `constructible: 'probable'` |

**Comparaison d'intitulés :** accents (`Québec` ≡ `Quebec`), formes sociétaires (`9044-3422 Québec Inc.` ≡ `9044-3422 Quebec inc`), séparateurs (`c.` ≡ `v.`), intitulés anonymisés (`Droit de la famille — 20495`), inversion des parties ⇒ appariement, patronyme différent ⇒ discordance.

**Vérification (`verify.test.ts`, réponses figées) :** les cinq verdicts ; auto-correction `csc`↔`scc` avec mise à jour de `court_codes` ; `404` sur base inconnue **sans** appel sortant ; budget épuisé ⇒ résultat partiel annoncé.

**Client :** réessai sur `429` respectant `Retry-After` ; pas de réessai sur `400` ; expiration de délai ; `TOO_LONG` ⇒ `resultCount` halvé puis réessai unique ; **assertion que la clef n'apparaît dans aucune sortie de journal** (test de non-régression sur `redactUrl`). **Et, depuis le 2026-09-17 :** un corps valide de plus de 100 000 caractères s'analyse **queue comprise** ; une page de 5 000 fiches passe entière ; au-delà du plafond défensif le corps est **refusé**, jamais coupé, et tire le même rattrapage par moitié que `TOO_LONG` ; une lecture **interrompue** se distingue d'un corps vide ; et — le PENDANT, sans lequel on satisferait tout cela en retirant toute borne — le corps d'une **erreur** reste borné à 512.

⚠ **Ces assertions ne peuvent vivre que dans `test/client.test.ts`.** `test/helpers.ts` remplace la classe `CanliiClient` en entier et rend des objets **déjà analysés** : aucun test de gestionnaire ne construit de `Response`, ne lit de corps, n'appelle `JSON.parse`. Le seuil de 100 000 aurait pu valoir 10 sans qu'aucun d'eux ne bouge. Ce n'est pas un défaut du client factice — l'envelopper ferait dépendre quatre cents tests du transport — mais c'est un angle mort, et il est **écrit** en tête du fichier.

**Transport (`rpc.test.ts`) :** `initialize` négocie la version ; `tools/list` rend **10** outils sans préfixe tous pourvus d'une description non vide, et le rejet des ex-outils de §17 et des anciens noms `jurisprudence_*` (`Outil inconnu`) est vérifié ; `tools/call` sur outil inconnu ⇒ `isError`; `GET /mcp/<secret>` ⇒ `405` ; secret erroné ⇒ `401` ; **`/mcp/<secret>/` et `/mcp/<secret>//` ⇒ `200`** (barre oblique finale tolérée) ; **`/mcp/` nu ⇒ `401` seul, `200` avec un en-tête valide** ; **`/mcp/x%FF` ⇒ `401`, jamais `500` ni une exception qui remonte** ; **un en-tête `Bearer` erroné ne masque pas un chemin correct, ni l'inverse, et les deux porteurs se croisent** ; **deux porteurs faux ⇒ `401`** (élargir n'est pas ouvrir) ; **un secret contenant ou terminé par `/` s'authentifie encore** ; `MCP_ENABLED = "false"` ⇒ `404` partout.

**Invariant 9, balayage STRUCTUREL (`garde.test.ts`) — ajouté le 2026-09-16.** Six chemins qui
appelaient CanLII pouvaient présenter une panne comme une absence, et aucun ne levait d'erreur :
`get_case` (les DEUX formes), `citator`, `subsequent_history`, `find_case` et `browse_cases`. Sur
un 429, chacun rendait « Aucune fiche pour … » ou les explications d'ABSENCE (« numéro erroné ·
décision hors de la collection »). La racine était unique — `src/store/lookup.ts` rendait
`message: null` sur le statut « erreur », et chaque appelant retombait alors sur SON texte
d'absence par défaut. Le test éprouve les six chemins, exige que la sortie NOMME la cause (sans
quoi le message pourrait redevenir `null` sans qu'aucun test ne bouge), et porte son **pendant
positif** : sur un 404, les explications d'absence doivent être LÀ. Sans cette seconde moitié, on
satisferait la première en retirant la garantie de §2 partout.

**Persistance :** un balayage remplit `cases` **et** `cases_fts` (déclencheurs) ; un second appel identique ne fait aucun appel sortant ; `refresh: true` en refait un.

**Contrat de vérité (test de garde) :** pour chaque outil heuristique, assertion que la sortie **contient** sa mise en garde. Ce test empêche qu'une refonte du gabarit la fasse disparaître silencieusement.

**Schéma des outils (`garde.test.ts`) — ajouté le 2026-09-16.** Quatre gardes portent sur ce que le modèle LIT, et non sur ce que le code fait : les **six** verdicts sont déclarés dans la description de §7.1 et INDÉTERMINÉE y est dite ne pas valoir absence ; `get_case` et `verify_citations` se renvoient l'un à l'autre ; **aucun paramètre n'est déclaré sans `description`** ; et les dix portent `readOnlyHint`. Leur mode de panne commun est le silence : une description qui prend du retard ne lève rien, elle continue d'affirmer.

**Citation réémise (`garde.test.ts`) — ajouté le 2026-09-16.** `citationSure` est éprouvée sur ses DEUX passages séparément, parce qu'ils se recouvrent sur `\n` et `\t` et que l'un pourrait donc disparaître sans qu'aucun test ne bouge : le repli des blancs seul atteint le séparateur de ligne U+2028, le retrait des caractères de contrôle seul atteint NUL et DEL. Un test de bout en bout vérifie qu'une citation portant « — CONFIRMÉE » suivi d'un saut de ligne ne produit qu'UNE ligne de verdict, la vraie. Les deux sabotages ont été joués : chacun fait tomber le test.

**Documentation (`doc.test.ts`) — le README contre le REGISTRE.** Ajouté le 2026-09-16, en remplacement de la confrontation `diff` de deux `grep` qui vivait dans `CLAUDE.md`. Cette commande FILTRAIT ses deux côtés par une liste de préfixes écrite à la main (`(canlii|greffe|palais)_`) : le jour du renommage, les deux côtés se sont réduits au même sous-ensemble de trois outils, sont restés égaux, et `diff` aurait rendu 0 — « aucune dérive » affirmé sans avoir regardé dix outils sur treize, et aussi longtemps que personne ne l'aurait relue. On ne répare pas cela en corrigeant la liste : on la corrigerait cette fois, et le prochain renommage rouvrirait le même trou au même endroit. Le test prend `TOOLS` **lui-même** pour l'un de ses deux côtés — non vide par construction, sa longueur (10 ; 13 avant le retrait de §17 en v0.3.0) affirmée AVANT tout le reste — et le texte du README pour l'autre, lu en `?raw`, sans aucune liste de préfixes. Il éprouve aussi le compte écrit **en toutes lettres**, qui vieillit autrement sans bruit.

---

## 14. Mise en service — marche à suivre, et ce qu'elle est devenue

*Les onze étapes ont TOUTES été franchies ; le connecteur est en production depuis le 2026-07-23. La liste est conservée — datée et mise à jour sur place — parce qu'elle sert deux fois : à repartir d'une base neuve, et à savoir ce qui a été fait le jour où une étape se révèle fausse. Trois ont bougé : la 4 (son second porteur n'a plus de client, §19), la 6 (rétablissement du déploiement continu via `environment: production` le 2026-11-14 après l'interlude manuel du 2026-09-16, §12) et la 10 (la limitation de débit voyage désormais avec le Worker, §9.3).*

1. Demander la clef d'API par le formulaire de commentaires de CanLII, en décrivant l'usage : outil interne de vérification de références pour une pratique d'avocat au Québec. **Y poser les questions de §16.1 et §16.2 dans le même message.**
2. `wrangler d1 create canlii --location enam` ; reporter l'`database_id` dans `wrangler.jsonc`.
3. `wrangler d1 migrations apply canlii --remote`.
4. `wrangler secret put CANLII_API_KEY` ; `openssl rand -hex 32` puis `wrangler secret put MCP_SHARED_SECRET`. **Un second porteur, facultatif** (§19) : refaire l'opération pour `MCP_SHARED_SECRET_ATHENA`. ⚠ Le secret doit être transmis **octet pour octet** aux deux systèmes qui le portent : un saut de ligne final suffit à faire diverger les valeurs — donc un `401` permanent que rien n'explique. Sous Windows, `openssl` termine en CRLF et `tr -d '
'` n'enlève que la moitié du problème.
5. Créer l'enregistrement DNS `jurisprudence` sur la zone `poirierlavoie.ca` (domaine personnalisé du Worker — Cloudflare le gère).
6. **Déployer — automatiquement sur `main` via `.github/workflows/deploy.yml` (`environment: production`), ou en repli local.** Déposer `CLOUDFLARE_API_TOKEN` dans l'environnement GitHub `production` (`gh secret set CLOUDFLARE_API_TOKEN --env production`). En repli local, le jeton d'API est présenté par l'environnement, jamais écrit dans un fichier versionné :

   ```powershell
   $env:CLOUDFLARE_API_TOKEN = (Get-Content cf.token -Raw).Trim()
   npm run deploy   # = migrations --remote PUIS wrangler deploy, arrêt au premier échec
   ```

   `cf.token` est **gitignoré**, au même titre que `.dev.vars` et `mcp.url`, et `.Trim()` n'est pas décoratif : un saut de ligne final dans un jeton produit un refus d'authentification que rien n'explique — le même piège qu'à l'étape 4. **L'ordre migrations → déploiement vaut ici autant qu'en CI** : passer à la main ne dispense pas de la règle, cela en retire seulement le garde-fou.
7. **Amorçage du répertoire** : appeler `list_databases` avec `refresh: true`, puis réconcilier `court_codes` et `paren_codes` (§4.3) ; passer `verified = 1` sur les lignes confirmées.
8. **Recette manuelle** : vérifier `2008 CSC 9` (⇒ *Dunsmuir*), une décision de la Cour d'appel du Québec connue, une citation volontairement fausse (`2020 QCCA 999999` ⇒ `INTROUVABLE`), une citation de recueil (⇒ `NON CONSTRUCTIBLE` avec candidats).
9. Ajouter le connecteur dans `claude.ai` : URL `https://jurisprudence.poirierlavoie.ca/mcp/<secret>`, nom « MCP Jurisprudence ».
10. **Rien à activer : la limitation de débit voyage avec le Worker** (§9.3) — binding `ratelimits` déclaré dans `wrangler.jsonc`, donc posé par l'étape 6 et non au tableau de bord. *Cette étape disait, du 2026-07-15 au 2026-09-16 : « Activer la règle de limitation de débit (§9.3). » Elle visait une règle WAF de zone qui n'a jamais été créée.* Vérifier plutôt qu'elle mord : plus de 60 requêtes en une minute doivent rendre `429` avec `Retry-After`, et un pré-vol `OPTIONS` ne doit JAMAIS être limité.
11. Après une semaine d'usage : dépouiller `search_log` (§10) et corriger l'analyseur sur les formes réellement rencontrées.

---

## 15. Récapitulatif des livrables de code

1. `src/index.ts` — routage, garde d'authentification à temps constant, coupe-circuit, gestionnaire `scheduled`.
2. `src/mcp/` — enveloppe JSON-RPC, registre des **10** outils, validateur de schéma, 10 gestionnaires.
3. `src/citation/` — analyseur, normalisation, comparaison d'intitulés. **Aucune E/S.**
4. `src/canlii/` — client étranglé et réessayé, types, erreurs, `redactUrl`.
5. `src/store/` — accès D1 : fiches + FTS, répertoire + auto-correction, citateur avec TTL, télémétrie.
6. `src/format/` — gabarits de sortie (Annexe A), formatage français des dates et des listes.
7. *(Retiré en v0.3.0 — déplacé vers `MCP-Outils`)* `src/qc/` — ancien §17 : tables du Québec, analyseur de numéros de dossier et consultation en mémoire.
8. `src/site.ts` + `src/site.i18n.ts` — §18 : la page publique bilingue, DÉRIVÉE des données vives.
9. `src/backfill.ts` — §11, écrit et testé, **inerte** (invariant : la question est tranchée, pas ouverte).
10. `migrations/0001_initial.sql`, `0002_seed_court_codes.sql`, `0003_reconcile_court_codes.sql`, `0004_rename_tool_prefix.sql` — la troisième consigne la réconciliation de §4.3 **avec sa preuve d'observation** ; la quatrième (2026-09-16, appliquée en production) rattrape la DONNÉE déjà écrite sous `canlii_*` (`search_log.tool`, `court_codes.note`) sans toucher au schéma : sans elle, la télémétrie de §10 serait coupée en deux séries à la date du renommage, dont aucune ne serait fausse et dont la somme ne serait faite nulle part.
11. `scripts/` — `mcp-client.mjs` (recette), `refresh-databases.mjs` (réconciliation §4.3), `deployer.mjs` (§12 : `db:migrate:remote` PUIS `wrangler deploy`, refus d'un arbre de travail sale, `--var COMMIT:<sha>`) ; `extraire-lieux-mjq.mjs` a été déplacé vers `MCP-Outils` en v0.3.0.
12. `test/` — matrice de l'analyseur, comparaison, vérification, client, transport, persistance, documentation, page publique, garde du contrat de vérité (les tests QC ont été déplacés vers `MCP-Outils` en v0.3.0).
13. `.github/workflows/` — 7 workflows (`ci`, `deploy`, `verifier-deploiement`, `codeql`, `osv-scanner`, `trivy`, `scorecard`) + `dependabot.yml`, actions épinglées par SHA.
14. `README.md` — mise en service, réserve de §9.5, et **reproduction in extenso du contrat de vérité de §2**.

---

## 16. Questions ouvertes pour le praticien

*Relevé au 2026-08-27, recompté le 2026-09-16. **Cinq des six sont closes** — la 3
l'était depuis le 2026-07-23 sans que la section l'enregistre ; seul le CHIFFRE de la 2
reste ouvert, la conduite étant réglée. On garde la question ET sa réponse, parce qu'une
question effacée se repose.*

1. ~~**Conditions d'utilisation et copie locale.**~~ **TRANCHÉE le 2026-07-23 : pas de moissonnage de masse.** La sédimentation par l'usage (D6) reste ; le §11 reste **inerte**, et ce n'est plus une question ouverte mais une décision du praticien — ne pas basculer le drapeau, même « pour essayer ». Deux verrous : `BACKFILL_ENABLED="false"` et aucun cron quotidien déclaré.
2. **Quota et débit — la question reste ouverte, la CONDUITE est réglée (2026-08-27).** Rien n'est publié, et la télémétrie de §10 a montré des `429` **récurrents** : 8 le 2026-08-24 pour 64 appels, 7 le 2026-08-20 pour 38 appels — soit un appel sur huit refusé puis rejoué, donc deux fois le quota pour un seul résultat. Trois mesures en réponse, décrites en §5.2 : intervalle porté de 250 à **600 ms**, intervalle **adaptatif** qui double à chaque `429`, et temporisation propre au `429` (2 s au lieu de 500 ms).

   **Ce qui reste ouvert, c'est le CHIFFRE, pas la conduite.** Aucune constante ne peut être « la bonne » tant que CanLII ne publie rien ; c'est précisément pourquoi le client s'appuie sur le seul fait observable — le refus — plutôt que sur une valeur devinée. À demander malgré tout : le débit toléré et le quota quotidien. Contrôle de l'effet, à refaire après quelques journées chargées :

   ```sql
   SELECT day, calls, errors, throttled,
          ROUND(100.0 * throttled / NULLIF(calls,0), 1) AS pct
   FROM api_usage ORDER BY day DESC LIMIT 30;
   ```

   Le repère : `pct` était de 12 à 18 % les journées chargées d'août 2026. S'il ne descend pas nettement, relever encore `CANLII_MIN_INTERVAL_MS` — et si le connecteur devient lent sans être étranglé, c'est le signe inverse et l'on peut redescendre. **Ne jamais lire un `429` comme une erreur d'exactitude** : le client réessaie, §2 est préservé, et l'étranglement est désormais DIT au modèle plutôt que laissé à deviner.
3. ~~**Forfait Cloudflare Workers.**~~ **TRANCHÉE : forfait PAYANT.** Sans objet pour §11, qui ne sera pas activé. Reste pertinent pour le **balayage vif** : le forfait gratuit plafonne à 50 sous-requêtes externes et 10 ms de CPU par invocation, et `find_case` en consomme plusieurs. La confirmation vit dans `wrangler.jsonc`, au-dessus du bloc `limits`, et elle y est load-bearing : `limits` (30 s de CPU, 200 sous-requêtes) n'est honoré que sur le modèle d'usage Standard ; sur le forfait gratuit le bloc serait inopérant. Aucun symptôme de plafond observé à ce jour. Corollaire : **ne pas ramener `CANLII_MAX_CALLS_PER_INVOCATION` à 20 « par prudence »** — ce serait tronquer un balayage vivant pour parer un plafond qui ne s'applique pas.
4. ~~**Modèle d'authentification.**~~ **RÉPONDUE : secret partagé (D7) maintenu.** Étendu le 2026-08-27 à un **second porteur** aux droits identiques, révocable seul (§9.1, §19). OAuth 2.1 (§9.4) reste conçu et non implémenté — la valeur protégée ne le justifie toujours pas.
5. ~~**Bases à indexer** si §11 est activé.~~ **Sans objet** : voir 1.
6. **Langue de la spécification.** Rédigée en français, comme `claude_spec-elabore-theorie-de-la-cause.md`. Le code, les identifiants et les noms d'outils restent en anglais.

### 16.3 Relevé du 2026-09-17 — la coupe du corps à 100 000 caractères

*Consigné pour que personne n'ait à refaire la reproduction.* `browse_legislation` échouait sur la plupart des bases avec « CanLII a renvoyé une erreur 200 ». Cause : `#safeText` tronquait **tout** corps de réponse, y compris celui des réponses RÉUSSIES, avant `JSON.parse` (§5.2).

| base | textes | avant le correctif | après |
|---|---:|---|---|
| `cac` | 2 | passe | passe |
| `nus` | 278 | **erreur 200** | passe |
| `qch` | 298 | passe | passe |
| `qcs` | 636 | **erreur 200** | passe |
| `peh` | 721 | **erreur 200** | passe |
| `car` | 5 154 | **erreur 200** | passe |
| `qcr` | 6 778 | **erreur 200** | passe |

⚠ **Le nombre de textes n'est PAS le discriminant, et il ne faut pas s'en servir comme tel.** `nus` (278) échouait là où `qch` (298) passait : ce qui compte est la taille du corps en CARACTÈRES, que le nombre d'entrées n'approxime qu'en gros — les intitulés et les identifiants varient d'une base à l'autre. Le tableau est un RELEVÉ, pas une règle ; la seule règle est qu'on ne tronque pas un corps qu'on va analyser.

Le balayage vif de `find_case` tombait sous la même cause (`resultCount = 5 000` par page). Vérifié en production le même jour sur la reproduction du rapport de test — `{title: "Godbout Longueuil", database_id: "csc-scc", year_from: 1995, year_to: 1998}` : 4 appels, 433 fiches parcourues, un candidat rendu **sans date** et disant pourquoi.

**Ce qui reste réellement à faire, tout § confondus** *(relevé du 2026-09-16, mis à jour le 2026-11-14)* : le réglage de `CANLII_MIN_INTERVAL_MS` ci-dessus *(la parité de `SERVER_INFO.version` a été épinglée le 2026-11-13 dans `test/doc.test.ts`, le déploiement continu rétabli via `.github/workflows/deploy.yml` et `scripts/deployer.mjs` le 2026-11-14 — voir §12 — et l'extension des greffes et palais §17 déplacée vers « MCP-Outils » en `0.3.0`, retrait du préfixe en `2.0.0`)*.

---

## 17. Extension — greffes et palais du Québec *(Retirée le 2026-11-14, v0.3.0)*

*Retirée le 2026-11-14 (`0.3.0`) — déplacée vers le connecteur public hors ligne « MCP-Outils » (`0.2.0`).*

Les trois outils hors ligne `greffe_parse_court_file_number`, `palais_list` et `palais_get`, leurs tables TypeScript (`src/qc/`), le relevé MJQ (`sources-officielles/mjq-numeros-greffes-2026-07-22.html`), son script d'extraction (`scripts/extraire-lieux-mjq.mjs`) et les tests dédiés (`test/qc.*.test.ts`, `test/fixtures/dossier-athena.json`) ne nécessitent ni clef CanLII ni authentification par secret partagé ; ils vivent désormais dans `MCP-Outils` avec leurs réserves d'intégrité (`GARDE_PALAIS`, `GARDE_SANS_ADRESSE`, `GARDE_DOSSIER`, `SANS_PLUMITIF`).

Les numéros de sections §18, §19 et §20 ci-après restent inchangés afin de préserver les renvois internes du dépôt.

---

## 18. Page publique (`GET /`)

*Ajoutée le 2026-07-30. Les §1 à §16 décrivent une surface exclusivement JSON, consommée par des clients MCP. Cette section ajoute la PREMIÈRE surface HTML, sur la même origine que `/mcp/<secret>` — d'où le soin.*

### 18.1 Ce que la page est, et ce qu'elle n'est pas

Une page **statique, publique, bilingue** décrivant le connecteur : ses dix outils sans préfixe (`v2.0.0`), leurs schémas et l'accès. Elle sert deux publics — qui n'a pas accès au connecteur, et qui l'utilise et veut relire le contrat — tout en renvoyant vers « MCP-Outils » pour les utilitaires hors ligne de greffes et palais déplacés le 2026-11-14.

Elle n'est **pas** une console, n'accepte aucune saisie, n'appelle rien et n'écrit rien.

### 18.2 Route et sécurité

`GET` et `HEAD` sur **`/` exactement** ; toute autre méthode rend `405`. Le `404` final reste la réponse de tout autre chemin — l'égalité stricte est la garantie que la page n'est pas un fourre-tout.

Trois propriétés, toutes testées :

1. **Hors du bloc `/mcp`.** Le contrôle d'origine (**§9.6** — section écrite le 2026-09-16 : le renvoi pointait jusque-là vers un numéro inexistant, la section 9 s'arrêtant à §9.5), la limitation de débit (§9.3) et l'authentification (§9.1) y vivent tous. Une page publique doit répondre à n'importe quel navigateur : elle ne passe donc par aucun d'eux. **Corollaire impératif** : ne jamais remonter ces contrôles en portée globale « par cohérence », ce qui refuserait la page à tout visiteur arrivant d'un lien externe.
2. **Aucun en-tête CORS**, comme `/health`. Sans `Access-Control-Allow-Origin`, aucun script d'une autre origine ne peut LIRE la réponse : la page ne peut pas servir d'oracle.
3. **Le secret n'y paraît jamais.** La page documente la FORME `/mcp/<secret>`. Un test refuse toute chaîne de 32 caractères hexadécimaux ou plus, tout `Bearer`, et toute mention de `api.canlii.org` ou `api_key`.

**Exception au coupe-circuit (§8), délibérée.** `MCP_ENABLED=false` rend `404` sur `/health` et sur `/mcp` — au motif qu'un point d'entrée qui répondrait encore révélerait que le service existe. La page, elle, **reste servie** : elle existe pour être vue, ne porte ni secret ni donnée vivante, et c'est précisément quand le connecteur est coupé qu'on veut pouvoir lire pourquoi.

**En-têtes.** Servir du `text/html` fait de cette origine une origine de DOCUMENT, ce qu'elle n'était pas tant que tout était du JSON. D'où, sur `/` seulement : `Content-Security-Policy: default-src 'none'` avec `frame-ancestors 'none'` et `base-uri 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. `Cache-Control` court et **sans `s-maxage`** : le rendu ne coûte rien, et un cache d'arête durable ferait survivre la page à son propre déploiement.

### 18.3 Le contenu DÉRIVE des données, il ne les recopie pas

C'est la règle qui gouverne toute la section. Une page qui recopierait un titre d'outil ou une borne de schéma deviendrait fausse **sans qu'aucun test n'échoue**.

| Rendu | Source |
|---|---|
| Outils : nom, titre, description | `listToolDescriptors()` — la fonction même que sert `tools/list` |
| Schémas : types, bornes, `enum`, `required`, **et la `description` de chaque paramètre** | le `inputSchema` même que le validateur applique (§8) |
| **Le marqueur `openWorldHint` de chaque outil** | ses `annotations` MCP, lues par `listToolDescriptors()` |

*Deux lignes amendées le 2026-09-16, et pour le même motif.* La page annonçait les types et les
bornes d'un paramètre, jamais son SENS : le visiteur lisait « database_id · string · 1–20 car. »
et devait deviner, alors que les descriptions existent toutes. Et elle **affirmait** « ses
annotations MCP le déclarent » sans jamais lire `annotations` — l'interface `Descripteur` de
`src/site.ts` ne les déclarait pas, et le `as unknown as` les jetait. Basculer un outil de
DISTANT à LOCAL n'aurait pas changé un octet de la page : une prose recopiée là où l'invariant 19
exige une valeur dérivée, et qui prétendait justement le contraire.

⚠ **La colonne « Description » reste en FRANÇAIS dans la vue anglaise, délibérément.** Ces
phrases sont celles que le MODÈLE reçoit : elles sont le texte canonique, non son rendu. Les
traduire ferait deux copies d'une même vérité, qui divergeraient — et la version anglaise
donnerait une fausse idée de ce que le connecteur annonce réellement. Ce qui manquait n'était pas la
traduction, c'était de DIRE qu'il n'y en a pas, et pourquoi : la page le dit maintenant.

⚠ **Formulation load-bearing du marqueur.** `openWorldHint: true` dit que la SOURCE DE VÉRITÉ est
distante — **pas** qu'un appel part à chaque invocation. `get_case` sert sa fiche
depuis D1 sans aucun appel dès qu'une ligne fraîche existe, et `list_databases` ne
rafraîchit qu'au bout de sept jours. Écrire « Appel sortant à CanLII » serait donc faux dans le
cas le plus courant, et faux avec l'aplomb d'une valeur dérivée. On annonce la SOURCE, pas le
trafic.

### 18.4 Bilinguisme et thème

**Les deux langues sont émises**, une règle CSS en masque une (`html.l-fr [data-l=en]`). Le choix se fait dans le navigateur avant le premier rendu, depuis `localStorage` puis `navigator.language`. **Sans JavaScript, le français s'affiche et tout le contenu reste lisible.**

**Thème à trois états** : `auto → clair → sombre → auto`. « Auto » n'est pas une classe mais l'**absence** des deux autres — c'est ce qui rend la main à `prefers-color-scheme` — et il se persiste en *supprimant* la clef.

⚠ Langue et thème vivent sur le MÊME `<html>`. Écrire `className` en bloc dans l'un des deux gestionnaires effacerait l'autre classe **en silence** : les gestionnaires n'emploient que `classList`, et le script de tête les **compose**.

**L'anglais est du contenu NEUF.** Le dépôt est francophone et le français y est canonique — c'est lui que le modèle reçoit. `src/site.i18n.ts` ne porte donc **que** l'anglais, jamais une copie française. La parité est testée dans les **deux** sens, et aucune traduction ne peut être identique à son original.

### 18.5 Ce que la page doit dire, et qu'un site vitrine tairait

- Le **contrat de vérité** de §2 (métadonnées seulement, jamais le texte ni l'autorité actuelle ; une absence n'est jamais une preuve d'inexistence).
- L'**annonce explicite de la source** : depuis le 2026-09-16 (D8 amendée), la prose de la page dit explicitement que la source est nommée dans la DESCRIPTION de chaque outil et non par le seul préfixe — dans les deux langues, et la version anglaise est éprouvée séparément.
- Les **formulations interdites** de §2 sont refusées dans la prose propre à la page. Les fiches d'outils en sont exclues du balayage : elles rendent les descriptions de §7 **verbatim**, dont l'une contient « a été infirmée » à l'intérieur d'une négation.

### 18.6 Autonomie

Aucune dépendance, **aucune requête tierce** : ni police distante, ni CDN, ni image, ni analytique. CSS et JavaScript sont en ligne dans le même module. Un test refuse tout `<script src>`, toute feuille de style externe et tout `@import`.

Deux gardes de dérive : **aucune couleur en dur** hors des deux jeux de variables (une couleur écrite en dur ne bascule pas et devient invisible dans l'un des deux thèmes), et les deux jeux déclarent **exactement** les mêmes variables.

---

## 19. Second porteur — le clavardage de Pallas Athéna *(client retiré le 2026-09-02)*

*Section conservée, datée, plutôt qu'effacée. Le clavardage interne d'Athéna a consommé ce connecteur du 2026-08-27 au **2026-09-02**, date à laquelle il a été retiré de son dépôt (commit `ef854733` : « le clavardage interne est retiré — 87 fichiers, 22 592 lignes »), le cabinet étant passé à un compte Claude for Work couvert par une entente de traitement des données. **Il n'y a donc plus, aujourd'hui, qu'un seul client vivant : le connecteur claude.ai.** Ce que cette section démontre reste néanmoins vrai et vaudra pour le prochain client : un second consommateur n'a rien exigé du protocole. Deux corollaires pratiques, eux, ont changé et sont écrits ci-dessous.*

**Ce qui n'est plus.** `athena/chat/worker_tools.py` et son générateur `athena/scripts/sync_worker_tools.py` **n'existent plus** : il n'y a rien à réengendrer après un renommage d'outil, et il ne faut pas les chercher. La consigne inverse a survécu trois semaines à son objet, dans `CLAUDE.md` et ici — c'est précisément le mode de panne que §2 proscrit, déplacé dans la documentation.

**Ce qui reste.** `MCP_SHARED_SECRET_ATHENA` demeure admis (§9.1) et n'est pas à retirer : il ne coûte rien et n'ouvre aucun droit de plus. Mais **il n'a plus de porteur**, donc plus aucun client réel pour signaler qu'on a cassé la forme par en-tête. Depuis le 2026-09-02, ce trajet n'est couvert que par `test/rpc.test.ts` et par un `curl` à la main : le vérifier explicitement après toute retouche de la garde d'entrée.

Athéna, le gestionnaire de pratique du même praticien, avait un clavardage interne dont le
moteur de tour appelait Vertex AI directement (`:rawPredict` pour les modèles Anthropic,
`:generateContent` pour Gemini) et **exécutait lui-même les appels d'outil**. Il consommait
ce connecteur comme n'importe quel autre client MCP.

**Rien n'a été ajouté au protocole pour lui**, et c'est le point important :

- il présente son secret par `Authorization: Bearer` sur `POST /mcp` — la forme 2 de
  §9.1, prévue dès l'origine « afin de couvrir tous les clients » ;
- il n'émet aucun en-tête `Origin` (appel serveur à serveur), donc la défense contre le
  ré-attachement DNS le laisse passer, comme `scripts/mcp-client.mjs` ;
- le **mode JSON sans état** de D3 lui permet un simple POST par appel, sans poignée de
  main `initialize` et sans `Mcp-Session-Id` à porter.

**Aucune façade REST n'a été ajoutée**, et il ne faut pas en ajouter : elle dupliquerait
les gestionnaires, ferait diverger deux surfaces d'un même outil, et contredirait D3. Le
client MCP vit du côté d'Athéna.

**Pourquoi l'exécution reste chez Athéna** plutôt que d'être confiée à un mécanisme de
MCP distant du côté de Google : le moteur de tour est l'endroit où vivent la ligne
d'audit de chaque appel d'outil, le mécanisme d'autorisation, le déchargement des gros
blocs et le calcul du coût. Sortir les appels d'outil de ce registre reviendrait à
perdre la traçabilité, qui est précisément ce qu'un dossier privilégié exige.

**Ce que le second secret change, et ce qu'il ne change pas.** Il ne délimite aucun
périmètre : les dix outils (historiquement treize avant le transfert de §17 en v0.3.0) lui répondent comme au premier porteur. Il n'existe que
pour la révocation séparée (§9.1). Une conséquence assumée : la limitation de débit de
§9.3 est **par IP**, donc les deux clients ne se gênent pas — mais ils partagent le même
quota d'API CanLII, et c'est bien ce quota que D7 protège.

---

## 20. Manifestes clients et fiche de découverte (SEP-2127)

*Ajoutée le 2026-11-13.*

Le connecteur est empaqueté à la racine pour **Google Antigravity** (`plugin.json`, `mcp_config.json` clé `juris`, `assets/logo.svg`) et **Gemini CLI** (`gemini-extension.json` clé `juris`) sans dupliquer les compétences de `droit-civil-quebecois` ni injecter de prose de développement dans les sessions d'usage :

- **Transport et authentification :** les deux manifestes pointent sur `https://jurisprudence.poirierlavoie.ca/mcp` en Streamable HTTP avec l'en-tête `Authorization: Bearer ${MCP_JURISPRUDENCE_SECRET}` (`variables` sous Antigravity ; `settings` sensible dans `gemini-extension.json`). Sous Antigravity, les dix outils restent chargés à la demande (*lazy*, aucun `eager: true`).
- **Contexte minimal (« connector only ») :** `gemini-extension.json` fixe `"contextFileName": []` afin qu'une installation utilisateur n'importe pas le `GEMINI.md` racine dans ses conversations ordinaires ; les instructions canoniques demeurent portées par le serveur (`INSTRUCTIONS` sur `initialize` / `server/discover` et descriptions d'outils).
- **`GEMINI.md` d'espace de travail :** Antigravity tronque tout fichier de règles au-delà de 24 000 octets, alors que `CLAUDE.md` dépasse 40 Ko. `GEMINI.md` synthétise donc les invariants et renvoie vers `CLAUDE.md` et `SPEC.md`, en demeurant sous 24 000 octets (épinglé par `test/doc.test.ts`).
- **Fiche de découverte HTTP (`GET /mcp/server-card`, SEP-2127) :** exception exacte et nommée avant la garde `/mcp*`, servie en `application/mcp-server-card+json; charset=utf-8` avec `Access-Control-Allow-Origin: *`, dérivée uniquement de `SERVER_INFO`, `PUBLIC_DESCRIPTION` et `VERSIONS` (invariant 19), sans jamais lire ni exposer de secret, et coupée en `404` lorsque `MCP_ENABLED !== "true"`.

---

## Annexe A — Gabarits de sortie (verbatim)

### A.1 `verify_citations`

```
Vérification de 3 citation(s) — collection CanLII.

1. 2008 CSC 9 — CONFIRMÉE
   Dunsmuir c. Nouveau-Brunswick
   [2008] 1 RCS 190, 2008 CSC 9 (CanLII) · csc-scc · 2008-03-07
   N° de dossier : 31459
   Mots-clés : équité procédurale — raisonnabilité — arbitre — norme — contrôle judiciaire
   https://canlii.ca/t/1vxsn

2. [1985] C.A. 105 — NON CONSTRUCTIBLE
   Forme reconnue : recueil (Recueils de jurisprudence du Québec, Cour d'appel).
   L'API de CanLII ne résout pas les citations de recueils.
   → Fournir les noms des parties et l'année à find_case.

3. 2020 QCCA 999999 — INTROUVABLE
   Forme neutre bien formée (qcca / 2020qcca999999), mais aucune fiche.
   Explications possibles : numéro erroné · décision hors de la collection ·
   diffusion récente (prévoir un jeu de 2 jours).

Établit l'existence et l'identité, jamais l'autorité actuelle (aucun historique
d'appel, aucun indicateur de traitement) ni le contenu du dispositif.
```

Verdict `DISCORDANTE` — les deux valeurs, toujours :

```
2. 2005 QCCA 304 — DISCORDANTE
   Attendu  : « Syndicat des employés d'Hydro-Québec c. Hydro-Québec »
   Obtenu   : « Association provinciale des retraités d'Hydro-Québec c. Hydro-Québec »
   2005 QCCA 304 (CanLII) · qcca · 2005-03-31
   https://canlii.ca/t/...
   → La citation existe mais ne désigne pas la décision annoncée. Vérifier la source.
```

Verdict `INDÉTERMINÉE` — le seul des six qui ne porte AUCUN constat :

```
4. 2019 QCCS 4444 — INDÉTERMINÉE
   CanLII n'a pas pu être interrogé. Ce n'est PAS un constat d'absence : réessayer.
```

```
5. 2021 QCCA 77 — INDÉTERMINÉE
   Budget d'appels épuisé : cette citation n'a pas pu être vérifiée.
```

⚠ **Ces deux blocs sont la raison d'être du sixième verdict.** Un `401`, un `429`, une
expiration ou un budget épuisé ne disent rien sur l'existence de la décision. Les rendre
`INTROUVABLE` ferait passer une panne d'infrastructure pour une inexistence, avec le même
aplomb qu'un vrai constat — le mode de panne que §2 interdit, et l'invariant 9. Le corps le
dit en toutes lettres plutôt que de le laisser au verdict seul : un client qui n'affiche que
l'étiquette perdrait la réserve avec la prose.

### A.2 `find_case`

```
3 candidats pour « Hydro-Québec » (qcca, 2004→2006) :

1. Association provinciale des retraités d'Hydro-Québec c. Hydro-Québec
   2005 QCCA 304 (CanLII) · 2005-03-31 · qcca/2005qcca304
   https://canlii.ca/t/...
2. Untel c. Unetelle
   2005 QCCA 999 (CanLII) · — · qcca/2005qcca999

Provenance : index local (2 fiches) + balayage vif (1 appel, 1 843 fiches
parcourues, persistées).
Un candidat rendu « — » n'a pas de date : les listes de CanLII n'en portent
aucune. Pour la date exacte, employer get_case.

Recherche sur l'intitulé et les mots-clés uniquement — l'API de CanLII n'expose
pas le texte des décisions.
```

⚠ *Amendé le 2026-09-17.* Le gabarit ne montrait que des candidats DATÉS, ce qui se lisait comme « un candidat moissonné porte une date ». Il n'en porte pas : le candidat 1 vient de l'**index local** (une fiche résolue, qui a bien sa date), le candidat 2 d'un **balayage** (une ligne de liste, qui n'en a pas). La note de pied est **conditionnelle** — elle ne paraît que si au moins un candidat rendu est sans date, faute de quoi elle cesserait d'être lue et serait fausse quand tous viennent de fiches résolues.

**Variante — balayage INTERROMPU, index local non vide.** L'en-tête change ; il ne se contente pas d'une note en pied (invariant 9(c)).

```
Recherche INTERROMPUE pour « Hydro-Québec » (qcca, 2004→2006) — liste INCOMPLÈTE :
2 candidats obtenus avant l'interruption, l'étendue réelle n'est pas connue.

1. …

Provenance : index local (2 fiches) + balayage vif (1 appel, 0 fiche parcourue).
Balayage interrompu — CanLII a étranglé les appels (429). Réessayer plus tard.
CanLII a étranglé 3 appels pendant cet appel (HTTP 429).
Ils ont été rejoués, mais le résultat ci-dessus n'est PAS complet pour autant :
son étendue réelle n'est pas connue. Reprendre plus tard, ou sur un lot plus petit.
```

⚠ *Ajoutée le 2026-09-17.* Trois choses s'y lisent, et les trois sont des corrections. L'interruption est **dans l'en-tête**, et non sous « 2 candidats » — une réserve placée sous une affirmation déjà faite n'est pas une réserve. La ligne `Troncature : N premiers sur M` **disparaît** : sur un balayage interrompu, `M` est un total partiel, et l'afficher affirmerait un dénombrement qu'on n'a pas fait. Et la note d'étranglement cesse de dire « ni tronqués ni affaiblis » — elle le disait deux lignes sous celle qui annonçait l'interruption. La séparation `(qcca, 2004→2006)` est celle que ce gabarit montrait déjà ; le code, lui, rendait `(qcca2004→2006)`, sans séparateur et sans qu'aucun test ne regarde cet en-tête.

### A.3 `subsequent_history`

```
Sorts ultérieurs — INDICE HEURISTIQUE, à vérifier à la source.

Départ : 2018 QCCS 1234 — Untel c. Unetelle (2018-03-15)

1. Unetelle c. Untel — 2019 QCCA 456 (CanLII) · 2019-03-20 · qcca
   Similarité d'intitulé : 0,86 · juridiction supérieure
   https://canlii.ca/t/...

Ce résultat n'indique NI le sens du traitement (confirmée, infirmée, distinguée),
NI les pourvois pendants, NI les refus de permission d'appeler. Ce n'est pas un
citateur professionnel.
```

---

## Annexe B — Endpoints de l'API employés

| Outil | Endpoint | Notes |
|---|---|---|
| `list_databases` | `caseBrowse/{lang}/` · `legislationBrowse/{lang}/` | Deux appels ; rafraîchi hebdomadairement. Les LONGUEURS de ces deux charges utiles SONT les nombres de la note de rafraîchissement — répertoire entier, filtres exclus |
| `browse_cases`, `find_case` | `caseBrowse/{lang}/{db}/?offset=&resultCount=` + filtres de dates | `resultCount` ≤ 5 000 par page (marge sous 10 Mo) |
| `get_case`, `verify_citations` | `caseBrowse/{lang}/{db}/{caseId}/` | Le chemin de résolution déterministe |
| `citator`, `subsequent_history` | `caseCitator/en/{db}/{caseId}/{metadataType}` | **`en` obligatoire** dans le chemin |
| `browse_legislation` | `legislationBrowse/{lang}/{db}/` | |
| `get_legislation` | `legislationBrowse/{lang}/{db}/{legislationId}/` | `startDate`/`endDate` bornent la VERSION servie ; `dateScheme` en donne le régime — enum **non documenté**, `ENTRY_INTO_FORCE` et `DOWNLOAD_DATE` observés le 2026-09-17 |

Contraintes transversales : **HTTPS uniquement** ; charge utile plafonnée à **10 Mo** (erreur `TOO_LONG`) ; dates au format **AAAA-MM-JJ**, bornes **inclusives** ; `caseId` renvoyé dans les listes sous forme d'objet clé par langue (`{"en": "..."}` ou `{"fr": "..."}`) — **aplatir à la lecture**.
