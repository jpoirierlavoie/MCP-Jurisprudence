# Spécification — Connecteur MCP « MCP Jurisprudence »

*Renommé le 2026-09-16. Le connecteur s'intitulait « Jurisprudence canadienne et greffes du Québec » ; ce libellé reste sa DESCRIPTION — il n'en est plus le nom. L'identifiant de `serverInfo` a suivi : `jurisprudence-canlii` est devenu `mcp-jurisprudence` (§8).*

**Destinataire :** Claude Code
**Auteur de la spéc. :** (préparé pour Jason Poirier Lavoie)
**Cible :** nouveau dépôt autonome — Worker Cloudflare, D1, TypeScript
**Modèle de référence :** le Worker `legislation` / base D1 `qclaw` (connecteur « Législation du Québec »)
**Statut :** **livré et en production** sur `jurisprudence.poirierlavoie.ca` — treize outils, 497 tests, page publique bilingue. *Amendé le 2026-09-16 ; l'en-tête portait « prêt à implémenter », vrai jusqu'au premier déploiement du 2026-07-23 et faux depuis.* Lire **§1 (décisions arrêtées)** et **§2 (contrat de vérité)** avant toute ligne de code — et lire tout le reste comme le relevé de ce qui TOURNE : tout écart entre cette spécification et le dépôt est un défaut de l'une ou de l'autre, jamais un travail restant.

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
| D8 | **Nom d'hôte `jurisprudence.poirierlavoie.ca`**, Worker `jurisprudence`, base D1 `canlii`, préfixe d'outils `jurisprudence_` | **AMENDÉE le 2026-09-16.** Symétrie avec `legislation.poirierlavoie.ca` : ni le nom d'hôte ni le préfixe d'outil n'emploient plus la marque d'un tiers. *La rédaction en vigueur du 2026-07-15 au 2026-09-16 disait : « Le nom d'hôte évite d'employer la marque d'un tiers ; le préfixe d'outil la conserve, parce que la couverture et les verdicts dépendent de la collection de CanLII et que le modèle doit le savoir. » Elle est citée et non effacée, parce que sa prémisse était juste et que seule sa conclusion a changé.* Le modèle doit toujours savoir que la couverture et les verdicts dépendent de la collection de CanLII — mais **un préfixe ne sait pas porter une réserve** : il ne dit ni la couverture bornée, ni qu'une absence n'est pas une inexistence, ni que l'API ne rend que des métadonnées. Il en donnait l'illusion, et quatre descriptions sur dix s'en remettaient à lui au point de ne jamais écrire « CanLII » (six sur dix côté anglais). L'annonce a donc MIGRÉ vers des PHRASES — description de chaque outil, `INSTRUCTIONS`, page publique — que des tests épinglent dans les deux langues. Ce que le préfixe conserve, c'est la PARTITION en deux familles (§17.1), et elle reste vérifiée. |
| D9 | **Outils composites**, pas des enveloppes 1:1 d'endpoints | Un outil `jurisprudence_verify_citations` qui analyse, construit, appelle, compare et rend un verdict fait en un aller-retour ce qui en exigerait quatre. C'est aussi la seule façon d'imposer la mise en garde au bon endroit. |
| D10 | **Auto-correction du répertoire des tribunaux** | La correspondance code de citation → `databaseId` n'est documentée que pour `csc-scc`. Les identifiants fédéraux sont incertains. Le système apprend : sur échec, il essaie la variante linguistique et consigne celle qui a fonctionné (§6.4). |

---

## 2. Contrat de vérité (à lire avant d'écrire un seul outil)

Un vérificateur de citations qui promet plus qu'il ne tient est **pire qu'aucun outil** : il transforme une incertitude connue en fausse assurance, dans un contexte où la sanction est déontologique. Le code doit donc rendre ces limites structurellement inévitables.

**Ce que l'API établit :**

- l'**existence** d'une décision dans la collection de CanLII ;
- son **identité** : intitulé, citation, date, numéro de dossier de cour, mots-clés, hyperlien `canlii.ca` ;
- ses **rapports de citation** : ce qu'elle cite, ce qui la cite, les dispositions qu'elle cite ;
- pour un texte législatif : type, régime de dates, dates de début et de fin, indicateur d'abrogation.

**Ce que l'API n'établit pas, et qu'aucun outil ne doit laisser croire :**

- le **texte** de la décision — il n'existe aucun endpoint de plein texte ni de recherche par mots du texte ;
- l'**autorité actuelle** — aucun historique d'appel, aucun indicateur de traitement (suivi, distingué, infirmé), aucun pourvoi pendant, aucun refus de permission d'appeler ;
- le **dispositif** ou le motif pour lequel une décision est invoquée ;
- l'**exhaustivité** — la couverture a des bornes historiques, et la documentation reconnaît un délai de diffusion pour lequel elle recommande de prévoir un jeu de deux jours.

**Conséquences imposées au code :**

1. Toute sortie d'outil **heuristique** (`jurisprudence_find_case`, `jurisprudence_subsequent_history`) se termine par sa mise en garde, dans le corps de la réponse et non seulement dans la description de l'outil — c'est le motif retenu par `qclaw_find_relevant`.
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

*Relevée sur le dépôt au 2026-08-27. §17 (`src/qc/`) et §18 (`src/site.ts`) sont
arrivés après la rédaction initiale : ils figurent ici, à leur place.*

```
.
├── src/
│   ├── index.ts              # fetch + scheduled ; routage ; garde d'authentification
│   ├── config.ts             # lecture des vars, coupe-circuit
│   ├── env.d.ts              # les SECRETS, déclarés à la main (absents de wrangler.jsonc)
│   ├── mcp/
│   │   ├── rpc.ts            # enveloppe JSON-RPC, codes d'erreur, initialize/ping
│   │   ├── registry.ts       # les 13 descripteurs (nom, titre, description FR, schéma)
│   │   ├── validate.ts       # validateur JSON-Schema (sous-ensemble) — calqué sur mcp/tools.py
│   │   └── handlers/         # un fichier par outil, + un module partagé
│   │       ├── verifyCitations.ts · parseCitation.ts · findCase.ts
│   │       ├── getCase.ts · citator.ts · subsequentHistory.ts
│   │       ├── browseCases.ts · listDatabases.ts
│   │       ├── browseLegislation.ts · getLegislation.ts
│   │       ├── parseCourtFile.ts · palaisList.ts · palaisGet.ts   # §17
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
│   ├── qc/                   # §17 — tables du MJQ, PURES : constantes, aucun D1, aucune E/S
│   │   ├── palais.ts · greffes.ts · lieux.ts    # lieux.ts = relevé officiel 2026-07-22
│   │   ├── juridictions.ts · forums.ts
│   │   ├── dossier.ts        # analyseur de numéros — PORT d'Athéna, éprouvé par différentiel
│   │   └── lookup.ts         # consultation EN MÉMOIRE (à ne pas confondre avec store/lookup.ts)
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
│   ├── extraire-lieux-mjq.mjs # transcription du relevé MJQ (§17.6 : générée, non recopiée)
│   └── deployer.mjs          # §12 — migrations PUIS déploiement ; refuse un arbre sale
├── sources-officielles/      # la PREUVE, pas un résidu — voir ci-dessous
│   └── mjq-numeros-greffes-2026-07-22.html
├── test/                     # 497 tests en 15 fichiers, sans réseau ni clef
│   ├── citation.parse.test.ts · citation.compare.test.ts · verify.test.ts
│   ├── client.test.ts · rpc.test.ts · persist.test.ts · tools.test.ts
│   ├── qc.tables.test.ts · qc.outils.test.ts · qc.dossier.test.ts
│   ├── qc.dossier.differentiel.test.ts   # 127 entrées rejouées contre Athéna
│   ├── site.test.ts · garde.test.ts · backfill.test.ts
│   ├── doc.test.ts           # README contre REGISTRE (§13) — remplace la porte shell
│   └── fixtures/             # réponses JSON figées + dossier-athena.json
├── .github/workflows/        # §12
├── wrangler.jsonc · biome.json · tsconfig.json · vitest.config.ts
├── package.json · README.md · SECURITY.md · CLAUDE.md
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
    // Origines de navigateur admises EN PLUS de claude.ai et claude.com, séparées par
    // des virgules ; vide en temps normal. Toute origine de navigateur absente de la
    // liste est refusée par un 403 (§9.6).
    "ALLOWED_ORIGINS": ""
  },
  // Limitation de débit (§9.3) : DANS le Worker, jamais par une règle WAF de zone —
  // une expression WAF viserait un chemin qui CONTIENT le secret partagé.
  "ratelimits": [
    { "name": "RATE_LIMITER", "namespace_id": "1001", "simple": { "limit": 60, "period": 60 } }
  ]
}
```

⚠ **`sources-officielles/` n'est pas un résidu, et il ne doit pas être « nettoyé ».** Ce répertoire conserve la page du ministère de la Justice dont `scripts/extraire-lieux-mjq.mjs` tire `src/qc/lieux.ts` — la transcription est ENGENDRÉE, jamais recopiée (§17.6), et la source doit rester versionnée pour qu'elle demeure vérifiable. Elle est enregistrée à la main parce que `justice.gouv.qc.ca` répond **403** à une récupération automatique. Un fichier de 60 Ko dont personne n'explique la présence finit par disparaître au premier ménage : c'est pour cela que ce paragraphe existe. *(Ajouté le 2026-09-16 — le répertoire n'était nommé dans aucun document.)*

*Bloc relevé sur le `wrangler.jsonc` versionné le 2026-09-16 ; en cas d'écart, **le fichier fait foi** — c'est lui que Cloudflare lit.*

> **Création de la base :** `wrangler d1 create canlii --location enam` — `enam` (est de l'Amérique du Nord) est le repère de localisation le plus proche de Montréal. Aucune contrainte de résidence des données ne s'applique ici : rien de confidentiel n'y transite (§9.5).

**Dépendance au forfait.** Le forfait *Workers Free* plafonne à **50 sous-requêtes externes par invocation** et **10 ms de CPU** ; le forfait payant offre 10 000 sous-requêtes (jusqu'à 10 M) et 30 s de CPU par défaut. Les outils de balayage (`jurisprudence_find_case` en mode vif, le moissonnage de §11) supposent le forfait **payant**. Sur le forfait gratuit, ramener `CANLII_MAX_CALLS_PER_INVOCATION` à `20` et désactiver §11. **Vérifier le forfait du compte avant d'implémenter §11.**

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

⚠ `jurisprudence_get_case` écrivait `api_error` **y compris sur un 404**. Un dépouillement
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

> **Tâche d'amorçage — FAITE le 2026-07-23, conservée pour qui repart d'une base neuve.** Exécuter `scripts/refresh-databases.mjs --remote --sql` — extension `.mjs` et non `.ts` : le dépôt n'embarque aucun exécuteur TypeScript (D2), et la commande donnée jusqu'au 2026-09-16 ne s'exécutait donc pas. Ou l'outil `jurisprudence_list_databases` avec `refresh: true`. Puis réconcilier `court_codes.database_id` contre les `databaseId` réellement renvoyés par `caseBrowse/fr/`. **Ne pas livrer les lignes fédérales `verified = 0` sans cette réconciliation** ; si un `databaseId` amorcé n'existe pas au répertoire, corriger la ligne et passer `verified = 1`.
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
- **L'étranglement est DIT au modèle** quand il a eu lieu (§16.2) : `jurisprudence_verify_citations` et `jurisprudence_find_case` ajoutent une note nommant les `429` subis, en précisant que les résultats n'en sont **ni tronqués ni affaiblis**. Ce n'est PAS une mise en garde de §2 — elle ne borne pas ce que le résultat établit, elle explique un rythme — mais elle sert le même contrat : sans elle, un « aucun candidat » obtenu sous étranglement se lit comme une inexistence. Muette quand rien n'a été étranglé.
- **Pas de réessai** sur `400`, `401`, `403`, `404`.
- **Délai** : `AbortSignal.timeout(CANLII_TIMEOUT_MS)`.
- **Plafond dur** : au-delà de `CANLII_MAX_CALLS_PER_INVOCATION`, lever `CanliiBudgetError` ; le gestionnaire d'outil renvoie alors les résultats **partiels** obtenus, assortis d'une mention explicite (« budget d'appels épuisé — résultat partiel »), plutôt qu'une erreur sèche.
- **Charge utile** : l'API refuse les transferts supérieurs à 10 Mo et renvoie alors un objet portant `"error": "TOO_LONG"`. Le détecter et le traduire en français ; réduire `resultCount` de moitié et réessayer une fois. ⚠ Ce rattrapage exige un `resultCount` **fini** : un point d'accès qui ne pagine pas — `legislationBrowse/{lang}/{db}/`, qui rend la base entière — n'en bénéficie **jamais**.
- **Lecture du corps : ENTIÈRE, jamais tronquée.** *Ajouté le 2026-09-17, après un défaut.* Le corps d'une réponse **réussie** se lit et s'analyse en entier. Une troncature avant `JSON.parse` ne produit pas un résultat appauvri : elle produit un **échec**, et cet échec ressort alors sous le STATUT de la réponse — « CanLII a renvoyé une erreur 200 » sur une réponse parfaitement valide. Le connecteur a porté une telle coupe, à 100 000 caractères, **documentée nulle part**, depuis le premier commit du client : `jurisprudence_browse_legislation` était inutilisable sur toute base d'un peu d'ampleur, et le balayage vif de `jurisprudence_find_case` (`resultCount = 5 000`) échouait de même. Le corps d'une **erreur**, lui, reste borné à 512 caractères pour le diagnostic (§5.3) — c'est `CanliiError` qui le borne, et elle seule.
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
3. Si le `databaseId` déduit **n'existe pas** dans `databases`, ne pas appeler l'API : renvoyer `INTROUVABLE` en indiquant que le tribunal n'est pas au répertoire, et proposer `jurisprudence_list_databases`.
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

## 7. Les dix outils adossés à CanLII

*Le connecteur en compte **treize**. Les dix décrits ici portent le préfixe
`jurisprudence_` et interrogent la collection de CanLII ; les trois autres —
`greffe_*`, `palais_*` — lisent un relevé local et sont décrits en **§17**, séparément
et délibérément (§17.1 : le préfixe partitionne, la description nomme la source).*

*Préfixe renommé le 2026-09-16 : il s'écrivait `canlii_`. Les descriptions ci-dessous
sont reproduites verbatim du registre et ont été amendées dans le même changement —
chacune nomme désormais CanLII, ce que quatre d'entre elles ne faisaient pas tant que
leur nom le faisait pour elles.*

**Conventions communes** — appliquées sans exception :

- Nom d'outil en anglais, **description et sortie en français** (motif `qclaw`).
- `readOnlyHint: true` sur **les treize** : aucun n'écrit quoi que ce soit hors de son propre cache et de sa télémétrie.
- `openWorldHint` **n'est PAS uniforme**, et c'est le point : `true` pour les neuf qui appellent CanLII — leur réponse dépend d'un système tiers, faillible et hors de notre contrôle — et `false` pour les quatre qui ne font aucun appel (`jurisprudence_parse_citation`, `greffe_parse_court_file_number`, `palais_list`, `palais_get`), dont la réponse est une fonction pure de tables compilées dans le Worker. *Amendé le 2026-09-16 : les treize portaient `true`, ce qui annonçait un appel sortant là où il n'y en a jamais eu, et privait un client de la seule indication lisible par machine qui distingue les deux familles (§17.1). Un hôte qui limite les outils « monde ouvert » les refusait tous les treize sans motif.* `test/rpc.test.ts` épingle la scission outil par outil.
- Tout paramètre déclaré porte une `description`. *Ajouté le 2026-09-16 : vingt et un n'en avaient pas. Un paramètre nu se devine par son nom, et `offset` comme `limit` se devinent mal — `test/garde.test.ts` échoue désormais si l'un la perd.*
- `additionalProperties: false` sur tous les schémas.
- Tout paramètre `lang` : `enum ["fr","en"]`, défaut `"fr"`.
- Toute liste : `limit` avec défaut et maximum documentés ; troncature signalée en toutes lettres (« 50 premiers sur 214 »).
- Toute sortie d'outil heuristique se termine par sa mise en garde (§2).
- Erreur d'exécution ⇒ `{ content: [...], isError: true }` en français, **jamais** une erreur JSON-RPC (réservée aux fautes de protocole).
- **La FRONTIÈRE de `isError`.** *Écrite le 2026-09-16 ; elle ne l'était nulle part, et elle était enfreinte.* `isError: true` quand l'outil n'a **rien** à livrer — argument refusé, forme d'appel invalide, appel sortant échoué sans repli. `isError: false` dès qu'un résultat part, **même vide, même partiel, même dégradé** : une liste vide est une réponse, pas une panne, et la réserve de §2 voyage alors dans le corps. ⚠ C'est le SEUL signal lisible par machine que ce connecteur émette, et un client l'interroge pour décider s'il RÉESSAIE : il doit donc vouloir dire la même chose partout. `palais_list` rendait `true` sur une liste vide là où `browse_cases` rendait `false` dans exactement la même situation — pour la même question posée à deux outils, une panne d'un côté, une réponse de l'autre. Un garde-fou éprouve les DEUX bords : la liste vide n'est pas une erreur, **et** un appel mal formé en est une ; sans le second, on satisferait le premier en rendant `false` partout, ce qui priverait le client du seul signal qu'il possède.

### 7.1 `jurisprudence_verify_citations` — l'outil pivot

> **Description (verbatim) :** « Vérifie une ou plusieurs citations de jurisprudence contre la collection de CanLII. SIX verdicts, dont CINQ portent un constat : CONFIRMÉE, DISCORDANTE, INTROUVABLE, NON CONSTRUCTIBLE, ILLISIBLE. Le sixième, INDÉTERMINÉE, dit qu'AUCUN constat n'a pu être fait — CanLII injoignable, étranglé, ou budget d'appels épuisé — et ne vaut JAMAIS absence : ne pas le confondre avec INTROUVABLE. Un client qui n'attend que cinq valeurs prendra une panne pour une inexistence. Rend aussi la fiche officielle (intitulé, citation, date, n° de dossier, hyperlien) et, s'il y a lieu, l'écart avec l'intitulé attendu. Établit l'EXISTENCE et l'IDENTITÉ d'une décision ; n'établit NI son autorité actuelle (aucun historique d'appel, aucun indicateur de traitement), NI le contenu de son dispositif. Outil de choix pour éprouver des références tirées de la doctrine, d'un moteur de recherche ou d'un texte rédigé par une IA. Les citations de recueils (R.C.S., R.J.Q., C.A.) et les identifiants d'éditeurs (J.E., REJB, EYB, AZ) ne sont pas résolubles directement : enchaîner avec jurisprudence_find_case. Pour la seule FICHE d'une décision déjà tenue pour juste, jurisprudence_get_case suffit et coûte moins. »

*Amendée le 2026-09-16. La rédaction antérieure n'annonçait que **cinq** verdicts alors que le
gestionnaire en rendait six : INDÉTERMINÉE était produit par le code et absent du contrat. Un
client qui n'énumère que les cinq annoncés range le sixième dans son cas par défaut — et le cas
par défaut d'un vérificateur de citations est « pas trouvée ». Une panne de réseau devenait ainsi
une inexistence, en silence : §2, exactement. Le renvoi vers `jurisprudence_get_case` a été ajouté
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
4. **Toute issue qui n'est pas un constat ⇒ `INDÉTERMINÉE`**, et jamais `INTROUVABLE` : CanLII injoignable, `401`, `429`, expiration, budget d'appels du tour épuisé. Le corps le dit en toutes lettres — « Ce n'est PAS un constat d'absence ». C'est l'invariant 9.
5. `404` définitif ⇒ `INTROUVABLE`.
6. Comparer : intitulé (§6.5), année de `decisionDate` contre `expected_year`. Concordance ⇒ `CONFIRMÉE` ; écart ⇒ `DISCORDANTE`, les deux valeurs affichées.
7. Consigner dans `search_log` (`tool`, `query`, `verdict`).

Gabarit de sortie : **Annexe A.1**.

### 7.2 `jurisprudence_find_case`

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
2. **Balayage vif** si `live` (défaut : vrai lorsque l'index rend moins de trois candidats) : pour chaque année de la fenêtre, `GET caseBrowse/{lang}/{db}/?offset=0&resultCount=5000&decisionDateAfter=YYYY-01-01&decisionDateBefore=YYYY-12-31`, pagination par `offset` jusqu'à épuisement ou plafond de budget. `resultCount = 5000` et non le maximum de 10 000 : marge sous le plafond de 10 Mo.
3. Filtrer côté Worker sur `title_norm` (§6.5). **Persister toutes les fiches moissonnées** si `PERSIST_SWEEPS` — c'est ainsi que l'index se construit (D6). Écriture par lots `db.batch()` de 100 énoncés.
4. `database_id` absent : exiger une fenêtre de dates d'au plus 3 ans et balayer les bases québécoises usuelles (`qcca`, `qccs`, `qccq`) ; au-delà, refuser en demandant de préciser le tribunal.

Gabarit : **Annexe A.2**.

### 7.3 `jurisprudence_get_case`

> **Description :** « Fiche CanLII d'une décision : intitulé, citation, date, numéro de dossier de cour, mots-clés et hyperlien canlii.ca. Accepte soit une citation (« 2020 QCCA 495 »), soit le couple database_id + case_id. Ne renvoie PAS le texte de la décision : suivre l'hyperlien. N'ÉPROUVE PAS la citation : aucun verdict, aucune comparaison d'intitulé, aucun contrôle d'année — la fiche rendue est celle de la décision TROUVÉE, qui peut n'être pas celle que l'on croyait citer. Pour savoir si une référence rencontrée ailleurs est juste, employer jurisprudence_verify_citations. »

*Amendée le 2026-09-16. Les deux outils se ressemblent assez pour être confondus : tous deux
partent d'une citation et rendent une fiche. La différence est qu'ici la citation est tenue pour
JUSTE et sert d'adresse, tandis que §7.1 la met en doute et rend un verdict. Un modèle qui appelle
celui-ci pour « vérifier » une référence obtient une fiche d'allure officielle et en conclut que
la citation est bonne — alors que rien n'a été comparé. Les deux descriptions se renvoient
désormais l'une à l'autre, et `test/garde.test.ts` épingle ce renvoi croisé.*

Paramètres : `citation` **ou** (`database_id` + `case_id`) ; `lang` ; `refresh`. Valider qu'exactement l'une des deux formes est fournie.

### 7.4 `jurisprudence_citator`

> **Description :** « Citateur, sur la collection de CanLII : décisions citées PAR une décision (`cited`), décisions qui LA citent (`citing`), ou dispositions législatives qu'elle cite (`legislation`). Les listes sont brutes : elles n'indiquent aucun sens de traitement (suivi, distingué, infirmé), et leur exhaustivité est celle de la collection de CanLII. Pour les dispositions québécoises, enchaîner avec le connecteur « Législation du Québec » afin d'en lire le texte officiel. »

Paramètres : `database_id`, `case_id` (ou `citation`), `rel` (`enum ["cited","citing","legislation"]`), `limit` (défaut et maximum : `LIMITES.citator`, §8), `offset`, `refresh`.

> **Contrainte de l'API à coder en dur :** le chemin du citateur **n'accepte que `en`** comme segment de langue. Construire `caseCitator/en/{db}/{caseId}/{metadataType}` quel que soit le `lang` demandé, et rendre malgré tout la sortie en français. Ne pas exposer de paramètre `lang` sur cet outil.

Correspondance `rel` → `metadataType` : `cited` → `citedCases`, `citing` → `citingCases`, `legislation` → `citedLegislations`.

### 7.5 `jurisprudence_subsequent_history`

> **Description :** « Indice heuristique de sorts ultérieurs : parmi les décisions DE LA COLLECTION DE CANLII qui citent la décision de départ, retient celles qui émanent d'une juridiction supérieure et dont l'intitulé ressemble au sien. NE REMPLACE PAS un citateur professionnel : n'indique pas si la décision a été infirmée, confirmée ou distinguée, et ne détecte ni les pourvois pendants, ni les refus de permission d'appeler, ni les désistements. À vérifier systématiquement à la source. »

Algorithme : `citing` ⇒ filtrer sur (a) `database_id` de rang supérieur selon la table de hiérarchie ci-dessous, (b) similarité d'intitulé ≥ 0,5 (§6.5), (c) `decisionDate` postérieure. Trier par date croissante.

| Base de départ | Juridictions supérieures |
|---|---|
| `qccq`, `qctal`, `qctat`, `qctaq` | `qccs`, `qcca`, `csc-scc` |
| `qccs` | `qcca`, `csc-scc` |
| `qcca` | `csc-scc` |
| autres | `csc-scc` |

La sortie porte **en tête et en pied** la mise en garde. Aucune formulation affirmative (« a été infirmée ») n'est permise : uniquement « indice », « susceptible », « à vérifier ».

### 7.6 `jurisprudence_browse_cases`

> **Description :** « Liste les décisions d'un tribunal, les plus récemment diffusées en tête, avec filtres de date : date de la décision (`decision_date_*`), date de diffusion sur CanLII (`published_*`) ou date de dernière modification (`modified_*`, `changed_*`). Utile pour la veille et pour cerner la couverture de CanLII pour un tribunal donné. »

Paramètres : `database_id` (obligatoire), `lang`, `offset` (défaut 0), `limit` (défaut et maximum : `LIMITES.browse_cases`, §8 — **max 100** — bien en deçà du maximum de 10 000 de l'API : au-delà, la sortie est inexploitable par un modèle), plus les huit filtres de dates, tous au format `AAAA-MM-JJ` et **inclusifs**.

Rappeler dans la sortie, lorsqu'un filtre `published_*` est employé, le délai de diffusion et le jeu de deux jours recommandé.

### 7.7 `jurisprudence_list_databases`

> **Description :** « Répertoire des bases de CanLII : cours et tribunaux (`kind='case'`) ou corpus législatifs (`kind='legislation'`), avec leur databaseId et leur ressort. Point de départ de toute commande exigeant un database_id. »

Paramètres : `kind`, `jurisdiction`, `query` (recherche sur `name_norm`), `refresh`. Sert le répertoire local si `refreshed_at` a moins de 7 jours ; sinon `GET caseBrowse/{lang}/` et `GET legislationBrowse/{lang}/`, puis mise à jour (deux appels — le rafraîchissement est aussi ce que fait le cron).

### 7.8 `jurisprudence_browse_legislation`

> **Description :** « Liste les lois ou règlements d'une base législative DE CANLII (p. ex. « qcs » pour les lois du Québec), avec leur legislationId, leur citation et leur type. »

### 7.9 `jurisprudence_get_legislation`

> **Description :** « Fiche CanLII d'une loi ou d'un règlement : citation, type, régime de dates (entrée en vigueur), dates de début et de fin, indicateur d'abrogation et découpage en parties. Utile pour dater une disposition ou vérifier une abrogation. Pour le TEXTE d'une loi ou d'un règlement du Québec, utiliser le connecteur « Législation du Québec », qui rend le texte officiel verbatim. »

Rendre `repealed` en français explicite (« Abrogé : oui / non ») et afficher `dateScheme`, `startDate`, `endDate`.

### 7.10 `jurisprudence_parse_citation`

> **Description :** « Analyse une citation sans appeler CanLII : indique la forme reconnue (citation neutre, citation attribuée par CanLII, recueil, identifiant d'éditeur), et, si elle est constructible, le database_id et le case_id qui en découlent. Outil de diagnostic ; pour vérifier réellement l'existence d'une décision, utiliser jurisprudence_verify_citations. »

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
| `/mcp*` | `OPTIONS` | Pré-vol CORS, répondu **avant** l'authentification lorsque l'`Origin` est admise — un pré-vol ne porte aucun secret ; l'exiger casserait le connecteur sans rien protéger (§9.6) |
| `/mcp*` | toute méthode | `403` si l'en-tête `Origin` est présent et inconnu — ré-attachement DNS (§9.6). `Origin` absent (serveur à serveur) ⇒ admis |
| `/mcp*` | toute méthode | `429` + `Retry-After` au-delà de 60 requêtes/minute par IP : **après** le pré-vol, **avant** le contrôle de méthode et l'authentification (§9.3) |
| `/mcp*` | `GET`, `DELETE` | `405` — aucun flux SSE, aucune session |
| `/health` | `GET` | `200 {"status":"ok","commit":"<sha court>"}` — sans authentification. *Amendé le 2026-09-16 : disait « sans divulgation ». Le champ `commit` EN EST UNE, et elle est assumée — il annonce de quel commit la version en ligne est issue, donc si un correctif publié est déjà déployé. Le dépôt étant public, tout le code l'est déjà ; ce qui s'ajoute est un horodatage de fait. « inconnu » quand la version n'est pas passée par `npm run deploy` : un aveu, pas un remplissage (§12).* |
| tout le reste | — | `404` |

`MCP_ENABLED !== "true"` ⇒ **`404` sur toutes les routes MCP**, y compris `/health`. Coupe-circuit identique à celui d'Athéna.

**Méthodes JSON-RPC :** `initialize`, `notifications/initialized` (⇒ `202`, corps vide), `tools/list`, `tools/call`, `ping`. Toute autre méthode ⇒ `-32601`.

`initialize` : négocier `protocolVersion` (accepter `2025-06-18` et `2025-03-26` ; renvoyer la plus élevée commune) ; `serverInfo: { name: "mcp-jurisprudence", title: "MCP Jurisprudence", version }` *(identifiant et libellé renommés le 2026-09-16 ; l'identifiant s'écrivait `jurisprudence-canlii`)* ; `capabilities: { tools: {} }`.

⚠ **`version` est aujourd'hui un LITTÉRAL recopié de `package.json` dans `SERVER_INFO` (`src/mcp/registry.ts`) — constaté le 2026-09-16.** La rédaction antérieure prescrivait « `version: <package.json>` » : elle décrivait une intention que le code n'a jamais eue, le paquet du Worker n'important pas `package.json`. Les deux valeurs coïncident (`0.2.0`) et rien ne les tient ensemble ; le premier `npm version` les fera diverger **en silence**, et le client recevra une version qui n'est celle d'aucune livraison. Deux sorties acceptables, une seule à choisir : importer la valeur (`resolveJsonModule`), ou l'épingler par un test qui confronte `SERVER_INFO.version` au `package.json` lu en `?raw` — comme `test/doc.test.ts` confronte déjà le registre au README. Tant que ni l'une ni l'autre n'est faite, la présente ligne décrit un littéral, et surtout pas un emprunt.

**Enveloppe de résultat**, calquée sur `mcp/tools.py` d'Athéna :

```ts
{ content: [{ type: "text", text: <sortie française> }], isError: false }
```

Ne **pas** émettre `structuredContent` : `qclaw` ne le fait pas, la sortie est du texte destiné à être lu, et la symétrie prime.

**Validation des arguments** : porter `validate_args` de `athena/mcp/tools.py` en TypeScript — même sous-ensemble (`type`, `properties`, `required`, `enum`, `minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, `maxItems`, `items`, `additionalProperties: false`), mêmes messages, en français. *Amendé le 2026-09-16 : `items` était annoncé « sur un niveau » ici comme dans le cartouche du fichier. Il est RÉCURSIF sans borne — `validateValue` se rappelle sur chaque élément, et un élément objet fait valider ses propriétés. La mention SOUS-ESTIMAIT le validateur, et aurait pu faire renoncer à un schéma imbriqué parfaitement supporté ; c’est d’ailleurs lui qui valide champ par champ les vingt-cinq entrées de `jurisprudence_verify_citations`.* Échec ⇒ `isError: true`, jamais une erreur JSON-RPC.

**Ce que le sous-ensemble NE SAIT PAS imposer, et ce qu'on en fait.** *Arbitré le 2026-09-16.*
Le validateur ne connaît ni `pattern`, ni `oneOf`, ni aucune contrainte ENTRE champs :
`validateValue(schema, value, nom)` ne voit jamais le parent. Cinq outils imposent donc dans
leur GESTIONNAIRE une règle qu'un appel conforme au schéma peut enfreindre — le XOR
`citation` / (`database_id` + `case_id`) pour `get_case`, `citator` et `subsequent_history`,
le XOR `greffe_number` / `palais` pour `palais_get`, le format `AAAA-MM-JJ` des huit filtres
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

**Une seule réserve, à documenter dans le README** : `jurisprudence_find_case` prend des **noms de parties**. Si ce nom est celui d'une partie à un dossier en cours plutôt que celui d'une décision publiée, la requête révèle à CanLII un intérêt de recherche. Le risque est faible — CanLII est un organisme sans but lucratif canadien, et la recherche jurisprudentielle nominative est l'usage normal du site — mais il n'est pas nul, et il mérite d'être connu plutôt que découvert.

### 9.6 Contrôle d'origine — défense contre le ré-attachement DNS

*Ajoutée le 2026-09-16. Le contrôle existait dans `src/index.ts` depuis l'origine, six tests de `test/rpc.test.ts` le tiennent, et §18.2 y renvoyait déjà — vers un numéro qui n'avait jamais été écrit. Une règle vivante sans section est une règle qu'on retire « par simplification » sans trouver personne qui l'ait défendue.*

Sur `/mcp*`, un en-tête `Origin` **présent mais inconnu** est refusé d'emblée par un `403`, avant le pré-vol, avant la limitation de débit et avant l'authentification. Les origines admises sont `https://claude.ai` et `https://claude.com`, plus celles qu'ajoute la variable `ALLOWED_ORIGINS` (liste séparée par des virgules, vide en temps normal) : elles s'**ajoutent**, elles ne remplacent pas.

Une origine **absente** passe, et ce n'est pas un relâchement : un appel serveur à serveur n'est pas soumis à la politique de même origine et ne peut donc pas être détourné de cette façon. C'est le trajet de `scripts/mcp-client.mjs` — et c'était celui du clavardage retiré le 2026-09-02 (§19).

Trois corollaires, tous testés. Le **pré-vol** `OPTIONS` est répondu **sans** exiger de porteur : un navigateur n'en envoie jamais sur un pré-vol, et l'exiger casserait le connecteur sans rien protéger. Un `401` porte lui aussi les en-têtes CORS, faute de quoi le navigateur rapporte un échec de CORS au lieu du refus réel — un défaut indiscernable d'une panne. Et `Vary: Origin` accompagne toute réponse reflétée, sans quoi un cache intermédiaire resservirait à une origine la réponse calculée pour une autre. La page publique de §18 est **délibérément hors** de ce contrôle (§18.2, point 1).

---

## 10. Observabilité

- `observability: { enabled: true }` dans `wrangler.jsonc` ; consultation par `wrangler tail`.
- **Une ligne `search_log` par invocation d'outil qui TOUCHE D1**, succès compris : un succès non consigné rend les échecs inexploitables faute de dénominateur. Les échecs (`result_count = 0`) sont indexés séparément.

  **Quatre outils sur treize n'écrivent rien, par construction et non par omission** (constaté le 2026-09-16) : `greffe_parse_court_file_number`, `palais_list` et `palais_get` sont purs — aucune lecture D1, donc aucune écriture (§17.6) — et `jurisprudence_parse_citation` ne fait aucun appel sortant. Leur silence dans `search_log` ne se lit donc pas comme un défaut d'usage, et **on ne le corrige pas** : leur ouvrir D1 pour les compter échangerait une statistique contre la disponibilité qui est leur seule garantie.
- **`api_usage`** incrémentée à chaque appel sortant (`calls`), erreur (`errors`) et `429` (`throttled`). Requête d'exploitation :

```sql
SELECT day, calls, errors, throttled FROM api_usage ORDER BY day DESC LIMIT 30;
```

- **Aucun journal ne contient** la clef d'API, le secret partagé, ni une URL non redactée.
- Requête de diagnostic de l'analyseur — les citations que l'on ne sait pas résoudre :

```sql
SELECT query, COUNT(*) n FROM search_log
WHERE tool = 'jurisprudence_verify_citations' AND verdict IN ('ILLISIBLE','INTROUVABLE')
GROUP BY query ORDER BY n DESC LIMIT 50;
```

---

## 11. Moissonnage planifié — facultatif, désactivé par défaut

**§16.1 est TRANCHÉE (2026-07-23) : pas de moissonnage de masse. Ne pas basculer `BACKFILL_ENABLED`, même « pour essayer ».** *La rédaction du 2026-07-15 disait : « Ne pas activer sans la détermination de §16.1 » — elle décrivait une attente ; la réponse est venue, et elle est négative.* Ce n'est donc plus une condition suspendue mais une décision du praticien, tenue par deux verrous : le drapeau à `"false"` et l'absence de tout cron quotidien. Ce qui suit reste écrit, testé et **inerte**, parce qu'une conception documentée se relit tandis qu'un code supprimé se réinvente de travers.

Motif : un index local complet des cours du Québec rendrait `jurisprudence_find_case` instantané et fiable, au lieu de dépendre d'un balayage. La documentation de l'API paraît prévoir cet usage — les filtres `changedAfter` / `modifiedAfter` n'ont guère d'autre raison d'être que la tenue à jour d'une copie locale, et `resultCount` monte à 10 000. Cela reste une **lecture de la documentation, non une autorisation**.

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
| `.github/workflows/codeql.yml` | CodeQL, langage `javascript-typescript` |
| `.github/workflows/osv-scanner.yml` | OSV-Scanner sur `package-lock.json` |
| `.github/workflows/trivy.yml` | Trivy, mode système de fichiers |
| `.github/workflows/scorecard.yml` | OpenSSF Scorecard |
| `.github/workflows/verifier-deploiement.yml` | Contrôle de dérive quotidien (§12.1) : compare le `commit` de `/health` au dernier commit de `main`. Aucun secret, aucun jeton, `contents: read` — il regarde, il ne déploie rien |
| `.github/dependabot.yml` | npm + github-actions, hebdomadaire |

**LE DÉPLOIEMENT EST MANUEL, ET C'EST UNE DÉCISION — prise le 2026-09-16.** Il n'y a plus de workflow de déploiement : `.github/workflows/deploy.yml` a été **supprimé**.

*Ce que disait cette section jusqu'au 2026-09-16 : « `.github/workflows/deploy.yml` — Sur `push` vers `main` : `wrangler d1 migrations apply canlii --remote` **puis** `wrangler deploy` », et « Ordre impératif dans `deploy.yml` : les migrations d'abord, le déploiement ensuite ». La règle d'ordre reste vraie ; c'est son support qui a changé.*

**Pourquoi il est parti plutôt que réparé.** Dix-neuf exécutions du 2026-07-23 au 2026-09-16, dix-neuf échecs, **zéro version mise en ligne** — toutes l'ont été à la main. Il tombait toujours au même endroit, et pour une raison désormais **confirmée à la source** : le secret `CLOUDFLARE_API_TOKEN` n'atteignait pas le job. Le journal dit `CLOUDFLARE_API_TOKEN:` suivi de rien, puis « In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable for wrangler to work ». La variable était littéralement vide.

⚠ *Amendé le 2026-09-16 dans la même journée que sa rédaction.* Cette section a d'abord tenu que les journaux de la CI « exigent des droits d'administration, l'API rendant 403 ». C'est vrai de l'API **anonyme**, et faux pour le propriétaire : `gh run view <id> --log` les rend intégralement. La cause avait donc été établie par un détour — l'audit de sortie de `harden-runner`, lui public, ne montrant aucun appel à `api.cloudflare.com`, ce qui prouvait que `wrangler` renonçait avant tout réseau — là où la source directe était à portée d'une commande. Le détour a donné la bonne réponse ; il n'aurait pas dû être nécessaire. **Avant de conclure qu'une trace est inaccessible, essayer `gh`.**

Le réparer n'aurait tenu qu'à déposer le jeton dans les réglages du dépôt. Ce n'est pas un geste anodin : **c'est confier à un tiers un pouvoir d'écriture sur l'infrastructure** — appliquer des migrations, remplacer le Worker en production. Le praticien a préféré n'avoir aucun tel pouvoir stocké ailleurs que sur son poste, et une voie de déploiement unique plutôt que deux. Le connecteur jumeau, lui aussi un Worker en production, n'a jamais eu de workflow de déploiement : les deux dépôts sont désormais alignés.

**CE QUE LE RETRAIT NE CHANGE PAS : L'ORDRE.** Les migrations passent AVANT le déploiement ; le schéma inverse met en ligne du code qui lit des colonnes inexistantes. Cet ordre n'est plus écrit dans un fichier qui ne s'exécutait pas — il est tenu par **`npm run deploy`**, qui vaut `db:migrate:remote` PUIS `wrangler deploy` et s'arrête au premier échec.

⚠ Le script `deploy` de `package.json` valait jusqu'au 2026-09-16 `wrangler deploy` tout court : **le déploiement seul, sans les migrations, c'est-à-dire l'ordre interdit sous un nom rassurant.** C'était le seul endroit du dépôt où l'invariant pouvait être enfreint par la commande la plus naturelle. Le retrait du workflow a donc eu un effet net POSITIF sur l'invariant : il l'a déplacé d'un fichier inerte vers un script qui s'exécute.

**Si la question était rouverte**, ce qu'il faudrait peser n'est pas la commodité mais le dépôt du jeton, et le fait qu'un déploiement automatique sur `push` retire au praticien le dernier temps d'arrêt avant la mise en ligne d'un outil juridique.

### 12.1 Le coût du manuel, et comment il est payé

Le déploiement manuel a un coût, et il faut le payer plutôt que l'ignorer : **rien ne signale qu'un commit est poussé sans être en ligne.** L'écart se tient de mémoire, et un écart tenu de mémoire dure plus longtemps qu'on ne croit — les dix-neuf échecs de l'ancien workflow en sont la démonstration.

Deux pièces, posées le 2026-09-16, le rendent MESURABLE sans rouvrir ce qui a été refusé :

1. **Le Worker annonce son commit** sur `/health` (§8). La valeur est posée à la volée par `scripts/deployer.mjs`, en `--var COMMIT:<sha>` ; le défaut de `wrangler.jsonc` est « inconnu ».
2. **`.github/workflows/verifier-deploiement.yml`** compare cette valeur au dernier commit de `main`, **une fois par jour**. Il n'a AUCUN secret, aucun jeton, et `permissions: contents: read` : un `GET` sur un point d'entrée public et une comparaison de chaînes. **Surveiller sans rien pouvoir écrire** — le compromis inverse de celui qui a été écarté.

⚠ **Pas de déclenchement sur `push`, délibérément.** Juste après une poussée, la production est forcément en retard : le contrôle serait rouge à chaque commit, pour une raison normale. C'est exactement le mode de panne qui a fait vivre dix-neuf échecs sans que personne les regarde. Une fois par jour, un rouge veut dire quelque chose. **Et un rouge ici signifie « à déployer », jamais « cassé »** : la production sert toujours, elle sert une version antérieure.

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

**Transport (`rpc.test.ts`) :** `initialize` négocie la version ; `tools/list` rend **13** outils tous pourvus d'une description non vide, et la scission des préfixes de §17.1 est vérifiée dans les deux sens ; `tools/call` sur outil inconnu ⇒ `isError`; `GET /mcp/<secret>` ⇒ `405` ; secret erroné ⇒ `401` ; **`/mcp/<secret>/` et `/mcp/<secret>//` ⇒ `200`** (barre oblique finale tolérée) ; **`/mcp/` nu ⇒ `401` seul, `200` avec un en-tête valide** ; **`/mcp/x%FF` ⇒ `401`, jamais `500` ni une exception qui remonte** ; **un en-tête `Bearer` erroné ne masque pas un chemin correct, ni l'inverse, et les deux porteurs se croisent** ; **deux porteurs faux ⇒ `401`** (élargir n'est pas ouvrir) ; **un secret contenant ou terminé par `/` s'authentifie encore** ; `MCP_ENABLED = "false"` ⇒ `404` partout.

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

**Schéma des outils (`garde.test.ts`) — ajouté le 2026-09-16.** Quatre gardes portent sur ce que le modèle LIT, et non sur ce que le code fait : les **six** verdicts sont déclarés dans la description de §7.1 et INDÉTERMINÉE y est dite ne pas valoir absence ; `jurisprudence_get_case` et `jurisprudence_verify_citations` se renvoient l'un à l'autre ; **aucun paramètre n'est déclaré sans `description`** ; et les treize portent `readOnlyHint`. Leur mode de panne commun est le silence : une description qui prend du retard ne lève rien, elle continue d'affirmer.

**Citation réémise (`garde.test.ts`) — ajouté le 2026-09-16.** `citationSure` est éprouvée sur ses DEUX passages séparément, parce qu'ils se recouvrent sur `\n` et `\t` et que l'un pourrait donc disparaître sans qu'aucun test ne bouge : le repli des blancs seul atteint le séparateur de ligne U+2028, le retrait des caractères de contrôle seul atteint NUL et DEL. Un test de bout en bout vérifie qu'une citation portant « — CONFIRMÉE » suivi d'un saut de ligne ne produit qu'UNE ligne de verdict, la vraie. Les deux sabotages ont été joués : chacun fait tomber le test.

**Documentation (`doc.test.ts`) — le README contre le REGISTRE.** Ajouté le 2026-09-16, en remplacement de la confrontation `diff` de deux `grep` qui vivait dans `CLAUDE.md`. Cette commande FILTRAIT ses deux côtés par une liste de préfixes écrite à la main (`(canlii|greffe|palais)_`) : le jour du renommage, les deux côtés se sont réduits au même sous-ensemble de trois outils, sont restés égaux, et `diff` aurait rendu 0 — « aucune dérive » affirmé sans avoir regardé dix outils sur treize, et aussi longtemps que personne ne l'aurait relue. On ne répare pas cela en corrigeant la liste : on la corrigerait cette fois, et le prochain renommage rouvrirait le même trou au même endroit. Le test prend `TOOLS` **lui-même** pour l'un de ses deux côtés — non vide par construction, sa longueur (13) affirmée AVANT tout le reste — et le texte du README pour l'autre, lu en `?raw`, sans aucune liste de préfixes. Il éprouve aussi le compte écrit **en toutes lettres**, qui vieillit autrement sans bruit.

---

## 14. Mise en service — marche à suivre, et ce qu'elle est devenue

*Les onze étapes ont TOUTES été franchies ; le connecteur est en production depuis le 2026-07-23. La liste est conservée — datée et corrigée sur place le 2026-09-16 — parce qu'elle sert deux fois : à repartir d'une base neuve, et à savoir ce qui a été fait le jour où une étape se révèle fausse. Trois ont bougé : la 4 (son second porteur n'a plus de client, §19), la 6 (le déploiement est manuel, §12) et la 10 (la limitation de débit voyage désormais avec le Worker, §9.3).*

1. Demander la clef d'API par le formulaire de commentaires de CanLII, en décrivant l'usage : outil interne de vérification de références pour une pratique d'avocat au Québec. **Y poser les questions de §16.1 et §16.2 dans le même message.**
2. `wrangler d1 create canlii --location enam` ; reporter l'`database_id` dans `wrangler.jsonc`.
3. `wrangler d1 migrations apply canlii --remote`.
4. `wrangler secret put CANLII_API_KEY` ; `openssl rand -hex 32` puis `wrangler secret put MCP_SHARED_SECRET`. **Un second porteur, facultatif** (§19) : refaire l'opération pour `MCP_SHARED_SECRET_ATHENA`. ⚠ Le secret doit être transmis **octet pour octet** aux deux systèmes qui le portent : un saut de ligne final suffit à faire diverger les valeurs — donc un `401` permanent que rien n'explique. Sous Windows, `openssl` termine en CRLF et `tr -d '
'` n'enlève que la moitié du problème.
5. Créer l'enregistrement DNS `jurisprudence` sur la zone `poirierlavoie.ca` (domaine personnalisé du Worker — Cloudflare le gère).
6. **Déployer — À LA MAIN.** Il n'existe aucun déploiement automatique : le workflow qui s'en chargeait a été retiré le 2026-09-16 après dix-neuf échecs et zéro mise en ligne (§12). Le jeton d'API est présenté localement, par l'environnement, et jamais écrit dans un fichier versionné.

   ```powershell
   $env:CLOUDFLARE_API_TOKEN = (Get-Content cf.token -Raw).Trim()
   npm run deploy   # = migrations --remote PUIS wrangler deploy, arrêt au premier échec
   ```

   `cf.token` est **gitignoré**, au même titre que `.dev.vars` et `mcp.url`, et `.Trim()` n'est pas décoratif : un saut de ligne final dans un jeton produit un refus d'authentification que rien n'explique — le même piège qu'à l'étape 4. **L'ordre migrations → déploiement vaut ici autant qu'en CI** : passer à la main ne dispense pas de la règle, cela en retire seulement le garde-fou.
7. **Amorçage du répertoire** : appeler `jurisprudence_list_databases` avec `refresh: true`, puis réconcilier `court_codes` et `paren_codes` (§4.3) ; passer `verified = 1` sur les lignes confirmées.
8. **Recette manuelle** : vérifier `2008 CSC 9` (⇒ *Dunsmuir*), une décision de la Cour d'appel du Québec connue, une citation volontairement fausse (`2020 QCCA 999999` ⇒ `INTROUVABLE`), une citation de recueil (⇒ `NON CONSTRUCTIBLE` avec candidats).
9. Ajouter le connecteur dans `claude.ai` : URL `https://jurisprudence.poirierlavoie.ca/mcp/<secret>`, nom « MCP Jurisprudence ».
10. **Rien à activer : la limitation de débit voyage avec le Worker** (§9.3) — binding `ratelimits` déclaré dans `wrangler.jsonc`, donc posé par l'étape 6 et non au tableau de bord. *Cette étape disait, du 2026-07-15 au 2026-09-16 : « Activer la règle de limitation de débit (§9.3). » Elle visait une règle WAF de zone qui n'a jamais été créée.* Vérifier plutôt qu'elle mord : plus de 60 requêtes en une minute doivent rendre `429` avec `Retry-After`, et un pré-vol `OPTIONS` ne doit JAMAIS être limité.
11. Après une semaine d'usage : dépouiller `search_log` (§10) et corriger l'analyseur sur les formes réellement rencontrées.

---

## 15. Récapitulatif des livrables de code

1. `src/index.ts` — routage, garde d'authentification à temps constant, coupe-circuit, gestionnaire `scheduled`.
2. `src/mcp/` — enveloppe JSON-RPC, registre des **13** outils, validateur de schéma, 13 gestionnaires.
3. `src/citation/` — analyseur, normalisation, comparaison d'intitulés. **Aucune E/S.**
4. `src/canlii/` — client étranglé et réessayé, types, erreurs, `redactUrl`.
5. `src/store/` — accès D1 : fiches + FTS, répertoire + auto-correction, citateur avec TTL, télémétrie.
6. `src/format/` — gabarits de sortie (Annexe A), formatage français des dates et des listes.
7. `src/qc/` — §17 : tables du Québec (palais, greffes, lieux du MJQ, juridictions, forums), analyseur de numéros de dossier, consultation en mémoire. **Constantes, aucune E/S, aucun D1.**
8. `src/site.ts` + `src/site.i18n.ts` — §18 : la page publique bilingue, DÉRIVÉE des données vives.
9. `src/backfill.ts` — §11, écrit et testé, **inerte** (invariant : la question est tranchée, pas ouverte).
10. `migrations/0001_initial.sql`, `0002_seed_court_codes.sql`, `0003_reconcile_court_codes.sql`, `0004_rename_tool_prefix.sql` — la troisième consigne la réconciliation de §4.3 **avec sa preuve d'observation** ; la quatrième (2026-09-16, appliquée en production) rattrape la DONNÉE déjà écrite sous `canlii_*` (`search_log.tool`, `court_codes.note`) sans toucher au schéma : sans elle, la télémétrie de §10 serait coupée en deux séries à la date du renommage, dont aucune ne serait fausse et dont la somme ne serait faite nulle part.
11. `scripts/` — `mcp-client.mjs` (recette), `refresh-databases.mjs` (réconciliation §4.3), `extraire-lieux-mjq.mjs` (transcription du relevé MJQ ; §17.6 : générée, jamais recopiée), `deployer.mjs` (§12 : `db:migrate:remote` PUIS `wrangler deploy`, refus d'un arbre de travail sale, `--var COMMIT:<sha>`).
12. `test/` — matrice de l'analyseur, comparaison, vérification, client, transport, persistance, tables du Québec, différentiel du parseur de dossiers, page publique, garde du contrat de vérité.
13. `.github/workflows/` — 6 workflows + `dependabot.yml`, actions épinglées par SHA.
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
3. ~~**Forfait Cloudflare Workers.**~~ **TRANCHÉE : forfait PAYANT.** Sans objet pour §11, qui ne sera pas activé. Reste pertinent pour le **balayage vif** : le forfait gratuit plafonne à 50 sous-requêtes externes et 10 ms de CPU par invocation, et `jurisprudence_find_case` en consomme plusieurs. La confirmation vit dans `wrangler.jsonc`, au-dessus du bloc `limits`, et elle y est load-bearing : `limits` (30 s de CPU, 200 sous-requêtes) n'est honoré que sur le modèle d'usage Standard ; sur le forfait gratuit le bloc serait inopérant. Aucun symptôme de plafond observé à ce jour. Corollaire : **ne pas ramener `CANLII_MAX_CALLS_PER_INVOCATION` à 20 « par prudence »** — ce serait tronquer un balayage vivant pour parer un plafond qui ne s'applique pas.
4. ~~**Modèle d'authentification.**~~ **RÉPONDUE : secret partagé (D7) maintenu.** Étendu le 2026-08-27 à un **second porteur** aux droits identiques, révocable seul (§9.1, §19). OAuth 2.1 (§9.4) reste conçu et non implémenté — la valeur protégée ne le justifie toujours pas.
5. ~~**Bases à indexer** si §11 est activé.~~ **Sans objet** : voir 1.
6. **Langue de la spécification.** Rédigée en français, comme `claude_spec-elabore-theorie-de-la-cause.md`. Le code, les identifiants et les noms d'outils restent en anglais.

**Ce qui reste réellement à faire, tout § confondus** *(relevé du 2026-09-16)* : les **coordonnées** des palais (§17.7) ; le réglage de `CANLII_MIN_INTERVAL_MS` ci-dessus ; et **`SERVER_INFO.version`**, littéral recopié de `package.json` que rien n'épingle (§8) — il ne casse rien, il fait seulement croire qu'un client connaît la version qu'il interroge. *(La question du déploiement automatique, longtemps portée ici, est CLOSE depuis le 2026-09-16 : le workflow a été retiré et l'ordre migrations-puis-déploiement est passé dans `npm run deploy`. Voir §12.)*

---

## 17. Extension — greffes et palais du Québec (HORS CanLII)

*Ajoutée le 2026-07-30. Les §1 à §16 décrivent un connecteur adossé à la seule collection de CanLII ; la présente section étend le connecteur à des données d'une AUTRE provenance, et pose la frontière entre les deux.*

### 17.1 La frontière des sources : le préfixe partitionne, la description nomme

*Amendée le 2026-09-16, en même temps que D8. Cette section s'intitulait « La frontière des sources, et pourquoi elle est dans le NOM des outils », et elle tenait que le préfixe `canlii_` ANNONÇAIT la source. Elle est réécrite, non parce que la frontière a bougé — elle n'a pas bougé — mais parce que le porteur de l'annonce a changé. L'ancienne rédaction est citée au fil du texte.*

**Ce qui était écrit, et pourquoi c'était insuffisant.** « La décision D8 conserve le préfixe `canlii_` parce que la couverture et les verdicts DÉPENDENT de la collection de CanLII et que le modèle doit le savoir. » La prémisse reste vraie ; la conclusion ne tenait pas. **Un préfixe ne sait pas porter une réserve.** `canlii_get_case` ne dit ni que la couverture a des bornes historiques, ni qu'une absence n'est pas une inexistence, ni que l'API ne rend que des métadonnées — il donne seulement l'impression que quelque chose a été dit. Le prix de cette illusion s'est mesuré : **quatre descriptions sur dix ne nommaient CanLII nulle part** (citator, subsequent_history, browse_legislation, get_legislation), et **six sur dix côté anglais**. Le nom le disait pour elles, et le nom ne dit rien.

**Où vit l'annonce désormais.** Dans trois surfaces qui sont des PHRASES, et que des tests épinglent : la **description** de chacun des treize outils, les **`INSTRUCTIONS`** rendues à l'initialisation, et la **page publique** dans ses deux langues. Le test est formulé sur la PRÉSENCE d'une source et non sur une formulation — « CanLII » pour les dix, le Ministère ou le Québec pour les trois — parce que c'est l'absence, et elle seule, qui est silencieuse.

**Ce que le préfixe conserve, et qui reste load-bearing : la PARTITION.**

| Préfixe | Source | Appels sortants | Mode de panne redouté |
|---|---|---|---|
| `jurisprudence_` (10) | collection de CanLII | oui | l'absence prise pour une inexistence |
| `greffe_`, `palais_` (3) | relevé local du ministère de la Justice du Québec (MJQ) | **aucun** | la **péremption** prise pour une vérité |

Ranger un outil qui lit une table du MJQ parmi ceux qui interrogent CanLII resterait une attribution fausse. La partition est donc **vérifiée par `test/rpc.test.ts`** : aucun outil ne relève des deux familles ni n'échappe aux deux, et le compte de chacune est figé. Ajouter un outil oblige encore à choisir sa famille délibérément.

⚠ L'assertion « aucun outil local ne porte la chaîne `canlii` dans son nom » a été **retirée** du test, et non conservée : sous le nouveau préfixe, aucun nom nulle part ne contient plus cette chaîne, donc elle ne peut plus échouer. Une assertion qui ne peut plus échouer achète une confiance qu'elle ne finance pas.

### 17.2 `greffe_parse_court_file_number`

Analyse `NNN-NN-NNNNNN-NNN` : positions 1-3 le greffe (palais + district judiciaire), positions 5-6 la juridiction (tribunal + compétence + type de greffe). **Les positions 7 et suivantes ne sont PAS analysées** : il n'existe ni somme de contrôle ni règle d'année, et en inventer une rejetterait des numéros valides.

Un **préfixe alphabétique** (`TAL-`, `TAQ-`, `C.F.-`…) désigne un corps qui numérote ses dossiers lui-même : le préfixe EST la réponse à « quel tribunal ». Il se résout contre la table des forums, insensiblement aux points (`C.F.` ≡ `CF`). `is_administrative` n'est vrai que pour la catégorie *administratif* — **une cour fédérale n'est pas un tribunal administratif**. Un préfixe **inconnu** reste prudent (administratif, forum nul) et **n'est jamais une erreur** : aucun nom de tribunal n'est deviné.

Le code est un **port** de `parse_court_file_number` de Pallas Athéna, éprouvé par un **différentiel de 127 entrées** rejouées des deux côtés (`test/fixtures/dossier-athena.json`). Une divergence se répare dans le code, jamais dans la fixture.

### 17.3 `palais_list` · 17.4 `palais_get`

Répertoire des **43 palais de justice et 8 points de service** du MJQ, avec adresse municipale, greffes qui y siègent, district judiciaire et, pour les cours itinérantes, les localités desservies. `palais_get` accepte **exactement l'une** de deux formes (numéro de greffe OU nom), contrôlée dans le gestionnaire — le validateur de §8 ne sait pas exprimer `oneOf`.

### 17.5 Conséquences imposées au code (le contrat de vérité, transposé)

1. **La réserve de péremption, DATÉE, dans le corps de chaque réponse `palais_*`.** Le relevé est du **2026-07-15**. Sans sa date, le lecteur ne peut pas juger du risque qu'il prend ; les palais déménagent, et l'outil doit renvoyer à la liste officielle **avant toute signification ou tout dépôt**.
2. **Une adresse INCONNUE n'est jamais rendue comme INEXISTANTE.** Six greffes — **525, 614, 625, 640, 652, 715** — n'ont aucune adresse résolvable. C'est le pendant exact de la règle INTROUVABLE de §2 : on énumère les explications concurrentes.

   ⚠ **On ne sort de cette liste que par une SOURCE, jamais en assouplissant la formulation**, et la liste a bougé dans les deux sens le 2026-07-30 (§17.7) : **635 en est SORTI** — le relevé officiel du MJQ lui rattache Kuujjuaq — et **625 y est ENTRÉ**, parce qu'il manquait purement et simplement à la table. Un greffe absent ne se lit pas comme « sans adresse » : il se lit « greffe inconnu », ce qui est pire.
3. **Aucune coordonnée n'est portée**, et l'outil le DIT plutôt que de le laisser découvrir. Ni Athéna ni aucune donnée ouverte n'en fournit, et `justice.gouv.qc.ca` refuse toute requête automatisée. Le champ `contacts` existe, vide, **en tableau** : un palais publie plusieurs numéros, un par chambre — Montréal en publie au moins quatre.
4. **Des pièges se conservent, ne se corrigent pas.** `point_de_service` désigne les greffes de cour **itinérante** côté greffe et les points de service du **MJQ** côté palais : ils divergent par construction — et ni l'un ni l'autre n'est le drapeau `itinerant` de `lieux.ts`, qui qualifie un LIEU. Les **trois** notions divergent. Le **nom d'un palais n'est pas sa ville** (Chicoutimi est à Saguenay ; Havre-Aubert aux Îles-de-la-Madeleine) — d'où une jointure par `palais_key`, jamais par le nom.

   **Kuujjuaq : la réserve a été LEVÉE le 2026-07-30, par une source.** Cette section a longtemps porté « un palais publié qu'aucun greffe ne nomme : il reste non rattaché plutôt que deviné ». La prudence était juste — Athéna refusait de le rattacher faute de savoir à quel greffe, et deviner aurait été une faute. Mais la page officielle du MJQ (mise à jour du 2026-07-22) le dit : **Kuujjuaq est le siège FIXE du greffe 635**, qui dessert sept localités du Nunavik dont six en cour itinérante. Le rattachement n'est donc pas une déduction, c'est une lecture.

   La leçon, elle, se conserve, et c'est pour cela que le démenti reste écrit ici plutôt qu'effacé : **« itinérant » n'implique pas « sans adresse »** — la cour se déplace, le greffe siège quelque part — et une réserve ne se lève que contre une source, jamais par lassitude. Un lecteur qui trouverait l'ancienne formulation ailleurs doit savoir qu'elle est périmée : elle ferait « corriger » le code vers le défaut.

Ces conséquences sont verrouillées par `test/garde.test.ts`, au même titre que celles de §2, et les sorties du Québec entrent dans le balayage des **formulations interdites** — par leurs chemins d'ABSENCE, qui sont précisément ceux où la tentation existe.

### 17.6 Où vivent les données, et pourquoi pas en D1

**Constantes TypeScript** (`src/qc/`), et non une migration. La règle qui sépare les deux précédents du dépôt : `court_codes` vit en D1 parce que la boucle de §6.4 le **réécrit** ; ces tables-ci ne sont jamais réécrites, rien à l'exécution ne les contredit. Le gain décisif est que les trois outils restent **purs** — aucune lecture D1, donc aucun mode de panne, aucun quota, aucune dépendance au réseau. La transcription est **générée** depuis la source d'Athéna, non recopiée : 130 lignes recopiées à la main, c'est une adresse fausse qui ne se signale par aucune erreur.

### 17.7 Ce qui reste à faire

*Cette section annonçait UN travail à deux usages. Le second est fait ; le premier
reste entier.*

**FAIT — la réconciliation des numéros de greffe (2026-07-30).** Menée contre la page
officielle du MJQ « **Numéros des greffes des palais de justice et des points de service
de justice** » (mise à jour du 2026-07-22), enregistrée dans `sources-officielles/` et
transcrite par `scripts/extraire-lieux-mjq.mjs` en `src/qc/lieux.ts`. Deux corrections
réelles, du même ordre que celles de §4.3 et consignées avec leur preuve d'observation :

- le greffe **625 (Senneterre)** manquait à la table — « 625-… » rendait « greffe
  inconnu » sur un greffe qui existe ;
- **Kuujjuaq** relève du greffe **635** (§17.5, point 4), ce qu'aucune source
  antérieure ne permettait d'affirmer.

*Corrigé le 2026-09-16 : cette section nommait la page « Trouver un palais de justice ». C'est une AUTRE page du même ministère. Celle qui a servi — et qui est versionnée dans `sources-officielles/` — s'intitule « Numéros des greffes des palais de justice et des points de service de justice » ; son propre `<title>` et l'en-tête de `src/qc/lieux.ts` le disent tous deux. Les deux pages traitent des mêmes palais sous des angles différents, et se confondre sur la source d'un relevé DATÉ, c'est perdre la capacité de le vérifier — ce que §17 pose précisément comme sa seule sortie de liste (invariant 17 : « on sort de cette liste par une SOURCE »).*

La table passe de 56 à **57 greffes**. Le gain de conception est plus large que ces
deux lignes : `lieux.ts` sait dire qu'un greffe dessert **plusieurs** lieux, ce que
`palais_key` (1:1) ne pouvait pas exprimer. D'où `adresseDuGreffe`, qui essaie
`palais_key` **puis** le siège fixe du MJQ ; les gestionnaires passent par elle et ne
lisent jamais `palais_key` en direct, sous peine de faire diverger deux outils sur le
même greffe.

**RESTE — les coordonnées.** `contacts` est déclaré, typé **en tableau** (un palais
publie plusieurs numéros, un par chambre — Montréal en publie au moins quatre) et
**vide sur les 51 lieux**. Les outils le DISENT plutôt que de le laisser découvrir.
Ils s'ajouteront depuis la page officielle « Numéros des greffes des palais de justice
et des points de service de justice », enregistrée à la main puisque
`justice.gouv.qc.ca` refuse toute requête automatisée.

⚠ Quand ce sera fait, la réserve de péremption de §17.5 point 1 vaudra **davantage**,
non moins : un numéro de téléphone périme plus vite qu'une adresse municipale, et la
date du relevé devra suivre la donnée la plus fraîche — pas la plus ancienne.

---

## 18. Page publique (`GET /`)

*Ajoutée le 2026-07-30. Les §1 à §17 décrivent une surface exclusivement JSON, consommée par des clients MCP. Cette section ajoute la PREMIÈRE surface HTML, sur la même origine que `/mcp/<secret>` — d'où le soin.*

### 18.1 Ce que la page est, et ce qu'elle n'est pas

Une page **statique, publique, bilingue** décrivant le connecteur : ses treize outils, leurs schémas, la structure d'un numéro de dossier judiciaire québécois et ses issues, et le répertoire des greffes et palais. Elle sert deux publics — qui n'a pas accès au connecteur, et qui l'utilise et veut relire le contrat.

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

C'est la règle qui gouverne toute la section. Une page qui recopierait un titre d'outil, une borne de schéma ou une adresse de palais deviendrait fausse **sans qu'aucun test n'échoue**.

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
donnerait une fausse idée de ce que le connecteur annonce réellement. Le précédent est établi :
`GARDE_DOSSIER`, `GARDE_PALAIS` et `GARDE_SANS_ADRESSE`, les trois réserves les plus lourdes de
la page, sont déjà rendues en français aux deux publics. Ce qui manquait n'était pas la
traduction, c'était de DIRE qu'il n'y en a pas, et pourquoi : la page le dit maintenant.

⚠ **Formulation load-bearing du marqueur.** `openWorldHint: true` dit que la SOURCE DE VÉRITÉ est
distante — **pas** qu'un appel part à chaque invocation. `jurisprudence_get_case` sert sa fiche
depuis D1 sans aucun appel dès qu'une ligne fraîche existe, et `jurisprudence_list_databases` ne
rafraîchit qu'au bout de sept jours. Écrire « Appel sortant à CanLII » serait donc faux dans le
cas le plus courant, et faux avec l'aplomb d'une valeur dérivée. On annonce la SOURCE, pas le
trafic.
| Issues de l'analyse d'un numéro | `analyserNumeroDossier()` **exécutée au rendu** sur des exemples |
| Greffes, palais, districts, localités | les tables de `src/qc/` (§17) |
| Codes de juridiction | `JURIDICTIONS` |
| Réserves | les constantes `GARDE_*` **verbatim** |

Les exemples d'analyse sont **vivants** : la page appelle le vrai parseur et affiche ce qu'il rend. Cette documentation ne peut donc pas diverger du comportement — même raisonnement que le différentiel de §17.2.

### 18.4 Bilinguisme et thème

**Les deux langues sont émises**, une règle CSS en masque une (`html.l-fr [data-l=en]`). Le choix se fait dans le navigateur avant le premier rendu, depuis `localStorage` puis `navigator.language`. **Sans JavaScript, le français s'affiche et tout le contenu reste lisible.**

**Thème à trois états** : `auto → clair → sombre → auto`. « Auto » n'est pas une classe mais l'**absence** des deux autres — c'est ce qui rend la main à `prefers-color-scheme` — et il se persiste en *supprimant* la clef.

⚠ Langue et thème vivent sur le MÊME `<html>`. Écrire `className` en bloc dans l'un des deux gestionnaires effacerait l'autre classe **en silence** : les gestionnaires n'emploient que `classList`, et le script de tête les **compose**.

**L'anglais est du contenu NEUF.** Le dépôt est francophone et le français y est canonique — c'est lui que le modèle reçoit. `src/site.i18n.ts` ne porte donc **que** l'anglais, jamais une copie française. La parité est testée dans les **deux** sens, et aucune traduction ne peut être identique à son original.

### 18.5 Ce que la page doit dire, et qu'un site vitrine tairait

- Les **trois réserves imposées** (`GARDE_PALAIS` avec sa date, `GARDE_SANS_ADRESSE`, `GARDE_DOSSIER`), verbatim et dans le corps.
- **Aucune coordonnée n'est portée** — ni téléphone, ni courriel, ni heures — pour aucun palais, avec renvoi au ministère de la Justice. C'est une propriété de la donnée, énoncée plutôt que laissée à découvrir.
- Les **six greffes sans adresse publiée**, formulés comme « inconnue » et jamais « inexistante ».
- La **frontière des sources** : `jurisprudence_*` contre `greffe_*`/`palais_*`. La section des greffes ne mentionne pas CanLII, et un test le vérifie. Depuis le 2026-09-16 (D8 amendée), la prose de la page dit explicitement que la source est nommée dans la DESCRIPTION de chaque outil et non plus par son préfixe — dans les deux langues, et la version anglaise est éprouvée séparément.
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
périmètre : les treize outils lui répondent comme au premier porteur. Il n'existe que
pour la révocation séparée (§9.1). Une conséquence assumée : la limitation de débit de
§9.3 est **par IP**, donc les deux clients ne se gênent pas — mais ils partagent le même
quota d'API CanLII, et c'est bien ce quota que D7 protège.

---

## Annexe A — Gabarits de sortie (verbatim)

### A.1 `jurisprudence_verify_citations`

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
   → Fournir les noms des parties et l'année à jurisprudence_find_case.

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

### A.2 `jurisprudence_find_case`

```
3 candidat(s) pour « Hydro-Québec » (qcca, 2004→2006) :

1. Association provinciale des retraités d'Hydro-Québec c. Hydro-Québec
   2005 QCCA 304 (CanLII) · 2005-03-31 · qcca/2005qcca304
   https://canlii.ca/t/...
2. …

Provenance : index local (2 fiches) + balayage vif (1 appel, 1 843 fiches
parcourues, persistées).

Recherche sur l'intitulé et les mots-clés uniquement — l'API de CanLII n'expose
pas le texte des décisions.
```

### A.3 `jurisprudence_subsequent_history`

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
| `jurisprudence_list_databases` | `caseBrowse/{lang}/` · `legislationBrowse/{lang}/` | Deux appels ; rafraîchi hebdomadairement |
| `jurisprudence_browse_cases`, `jurisprudence_find_case` | `caseBrowse/{lang}/{db}/?offset=&resultCount=` + filtres de dates | `resultCount` ≤ 5 000 par page (marge sous 10 Mo) |
| `jurisprudence_get_case`, `jurisprudence_verify_citations` | `caseBrowse/{lang}/{db}/{caseId}/` | Le chemin de résolution déterministe |
| `jurisprudence_citator`, `jurisprudence_subsequent_history` | `caseCitator/en/{db}/{caseId}/{metadataType}` | **`en` obligatoire** dans le chemin |
| `jurisprudence_browse_legislation` | `legislationBrowse/{lang}/{db}/` | |
| `jurisprudence_get_legislation` | `legislationBrowse/{lang}/{db}/{legislationId}/` | |

Contraintes transversales : **HTTPS uniquement** ; charge utile plafonnée à **10 Mo** (erreur `TOO_LONG`) ; dates au format **AAAA-MM-JJ**, bornes **inclusives** ; `caseId` renvoyé dans les listes sous forme d'objet clé par langue (`{"en": "..."}` ou `{"fr": "..."}`) — **aplatir à la lecture**.
