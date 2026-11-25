# MCP Jurisprudence

*Vérification déterministe de jurisprudence canadienne (collection CanLII).*

Serveur MCP public en lecture seule exposant la **REST API de CanLII** et les **27 listes compilées d'autorités dispensées de reproduction** sous forme de douze outils orientés vers la **vérification de références**, le contrôle de dispense et la consultation de fiches officielles. Accès gratuit réservé aux membres actifs en règle du Barreau du Québec disposant de leur propre clé API CanLII (BYOK) via [`acces.poirierlavoie.ca`](https://acces.poirierlavoie.ca). Aucune requête ni citation cherchée n'est journalisée.

> **In English:** Read-only public-interest MCP server for checking Canadian case-law citations against CanLII's collection and retrieving official decision metadata records. Part of [`droit-civil-quebecois`](https://github.com/jpoirierlavoie/droit-civil-quebecois), open free of charge to active Barreau du Québec members with a personal CanLII API key (BYOK) via [`acces.poirierlavoie.ca`](https://acces.poirierlavoie.ca). Queries and citations are never logged.

- **Page publique** : <https://jurisprudence.poirierlavoie.ca/> (bilingue FR/EN, trois thèmes, outils et schémas détaillés)
- **Connexion OAuth 2.1 (par défaut via le greffon)** : `https://jurisprudence.poirierlavoie.ca/mcp/oauth`
- **Connexion directe par jeton (scripts et clients autonomes)** : `https://jurisprudence.poirierlavoie.ca/mcp`

L'API de CanLII est en **lecture seule** et ne renvoie que des **métadonnées** — jamais le texte d'une décision. Le connecteur sert donc trois usages :

1. **Vérifier** une citation tirée de la doctrine, d'un moteur de recherche ou d'un texte produit par une IA — existence et identité ;
2. **Retrouver** une décision à partir des noms des parties lorsque la citation n'est pas constructible (recueils, identifiants SOQUIJ) ;
3. **Identifier** précisément une décision et obtenir son hyperlien `canlii.ca` afin d'en consulter le texte officiel.

*(Note : les outils hors ligne sur les numéros de dossier de cour et les palais de justice du Québec — `greffe_parse_number`, `palais_list`, `palais_get` — relèvent du connecteur public sans authentification [`MCP-Outils`](https://github.com/jpoirierlavoie/MCP-Outils).)*

### ⚠ Source et portée des douze outils

Les douze outils sont exposés sous la clé serveur `juris` dans [`droit-civil-quebecois`](https://github.com/jpoirierlavoie/droit-civil-quebecois). **Dix outils sur douze** peuvent interroger CanLII et consommer votre quota d'API (`openWorldHint: true`, dont `check_exempt_authority` avec repli désactivable via `resolve_canlii=false`), tandis que **`parse_citation`** et **`list_exempt_authorities`** fonctionnent hors ligne et n'appellent jamais CanLII (`openWorldHint: false`). Cette distinction figure dans les descriptions et annotations MCP de chaque outil ainsi que sur la page publique.

| Portée | Source | Appels sortants |
|---|---|---|
| `verify_citations` … `get_legislation`, `check_exempt_authority` (10) | la collection de **CanLII** (et, pour `check_exempt_authority`, les 27 listes compilées dans `data/autorites-dispensees.md`) — couverture et verdicts en dépendent | oui (`openWorldHint: true`, désactivable sur `check_exempt_authority` par `resolve_canlii=false`) |
| `parse_citation`, `list_exempt_authorities` (2) | analyseur local, répertoire et 27 listes compilées d'autorités dispensées (9 tribunaux) — **aucun appel** | non (`openWorldHint: false`) |

---

## Se connecter (avocats et développeurs)

- **Via le greffon complet [`droit-civil-quebecois`](https://github.com/jpoirierlavoie/droit-civil-quebecois) (méthode recommandée) :** après approbation sur <https://acces.poirierlavoie.ca/demande> (avec votre clé API CanLII personnelle enregistrée sur `/moi`), Claude Code, Claude Desktop, `claude.ai`, ChatGPT Web/Desktop, Google Antigravity, Gemini CLI et Gemini App se connectent par navigateur en OAuth 2.1 sur `https://jurisprudence.poirierlavoie.ca/mcp/oauth`, sans secret à copier.
- **Via jeton individuel (scripts, API Gemini Deep Research ou installation autonome) :** utiliser `https://jurisprudence.poirierlavoie.ca/mcp` avec `Authorization: Bearer <jeton>` créé dans <https://acces.poirierlavoie.ca/moi> (ou `?key=<jeton>` pour les formulaires web sans OAuth ; clé CanLII lue depuis votre coffre `/moi` ou l'en-tête `X-Clef-CanLII`).
- **Installation autonome de ce seul dépôt (sans le greffon `droit-civil-quebecois`) :**
  - **Google Antigravity** (`plugin.json`, `mcp_config.json`) : `agy plugin install https://github.com/jpoirierlavoie/MCP-Jurisprudence.git`, puis saisir la variable `MCP_JURISPRUDENCE_SECRET` avec un jeton issu de `/moi`.
  - **Gemini CLI** (`gemini-extension.json`) : `gemini extensions install https://github.com/jpoirierlavoie/MCP-Jurisprudence` et saisir `MCP_JURISPRUDENCE_SECRET`. (`"contextFileName": []` évite d'injecter `GEMINI.md` dans vos sessions.)
- **Origines navigateur autorisées :** `https://gemini.google.com`, `https://aistudio.google.com`, `https://claude.ai`, `https://claude.com`, `https://chatgpt.com`, `https://chat.openai.com` et `https://platform.openai.com` (incluant `X-Clef-CanLII`).
- **Découverte HTTP (SEP-2127) :** la fiche publique de connectivité est exposée sans secret sur `GET https://jurisprudence.poirierlavoie.ca/mcp/server-card` (`application/mcp-server-card+json`).

---

## ⚠ Contrat de vérité

> Un vérificateur de citations qui promet plus qu'il ne tient est **pire qu'aucun outil** : il transforme une incertitude connue en fausse assurance, dans un contexte où la sanction est déontologique.

### Ce que l'API établit

- l'**existence** d'une décision dans la collection de CanLII ;
- son **identité** : intitulé, citation, date, numéro de dossier de cour, mots-clés,
  hyperlien `canlii.ca` ;
- ses **rapports de citation** : ce qu'elle cite, ce qui la cite, les dispositions qu'elle
  cite ;
- pour un texte législatif : type, indicateur d'abrogation, et les dates de la **version
  consolidée** que CanLII sert — bornes de cette version, **jamais de l'instrument** :
  elles ne datent ni son entrée en vigueur, ni son abrogation.

### Ce que l'API n'établit pas, et qu'aucun outil ne doit laisser croire

- le **texte** de la décision — il n'existe aucun point de terminaison de plein texte ni de recherche
  par mots du texte ;
- l'**autorité actuelle** — aucun historique d'appel, aucun indicateur de traitement
  (suivi, distingué, infirmé), aucun pourvoi pendant, aucun refus de permission d'appeler ;
- le **dispositif** ou le motif pour lequel une décision est invoquée ;
- l'**exhaustivité** — la couverture a des bornes historiques, et la documentation
  reconnaît un délai de diffusion de deux jours.

### Conséquences imposées au code

1. Toute sortie d'outil **heuristique** (`find_case`, `subsequent_history`)
   se termine par sa mise en garde, **dans le corps de la réponse** et non seulement dans
   la description de l'outil.
2. Un verdict `INTROUVABLE` n'est **jamais** formulé comme « cette décision n'existe pas ».
   Il énumère les explications concurrentes (numéro erroné, hors collection, diffusion
   récente).
3. Un verdict `CONFIRMÉE` porte, dans la même sortie, la phrase indiquant qu'il n'établit
   ni l'autorité actuelle ni le dispositif.
4. Les valeurs brutes renvoyées par CanLII sont **toujours affichées** en cas d'écart — le
   praticien tranche, l'outil ne masque pas.

Ces quatre garanties sont verrouillées par `test/garde.test.ts` afin qu'aucune refonte de gabarit ne fasse disparaître les mises en garde en silence.

---

## Les douze outils

### Adossés à CanLII et listes compilées

| Outil | Rôle |
|---|---|
| `verify_citations` | **Pivot.** Verdict par citation : CONFIRMÉE · DISCORDANTE · INTROUVABLE · NON CONSTRUCTIBLE · ILLISIBLE — et **INDÉTERMINÉE**, qui dit qu'aucun constat n'a pu être fait (CanLII injoignable, étranglé, réponse inexploitable, ou budget épuisé) et ne vaut JAMAIS absence |
| `find_case` | Recherche par noms des parties ; index local puis balayage en direct sur CanLII |
| `get_case` | Fiche officielle d'une décision |
| `citator` | Ce qu'une décision cite, ce qui la cite, les dispositions qu'elle cite |
| `subsequent_history` | **Indice heuristique** de sorts ultérieurs — ne remplace pas un citateur |
| `browse_cases` | Décisions d'un tribunal, avec filtres de dates |
| `list_databases` | Répertoire des cours et corpus législatifs — l'en-tête nomme le filtre et précise sur quel ensemble il compte |
| `browse_legislation` | Lois et règlements d'une base législative |
| `get_legislation` | Fiche d'une loi : abrogation, découpage, et les dates de la VERSION servie — jamais celles de l'instrument |
| `parse_citation` | Analyse hors ligne d'une citation — **aucun appel** |
| `list_exempt_authorities` | Consultation et recherche **hors ligne** dans les 27 listes compilées d'autorités dispensées de reproduction (9 tribunaux, 864 entrées) — **aucun appel** |
| `check_exempt_authority` | Vérification de dispense de reproduction (DISPENSÉE · À VÉRIFIER · NON LISTÉE · ILLISIBLE · INDÉTERMINÉE), hors ligne d'abord puis repli CanLII borné optionnel (`resolve_canlii`) |

Sorties en **texte français**, jamais en JSON.

---

## 🔒 Réserve de secret professionnel

Ce connecteur n'envoie vers CanLII que des **citations, identifiants de tribunaux et dates** — aucun nom de client, aucun fait de dossier, aucun document.

**Une seule réserve** : `find_case` transmet des **noms de parties**. Si ce nom est celui d'une partie à un dossier en cours plutôt que celui d'une décision publiée, la requête révèle à CanLII un intérêt de recherche. CanLII est un organisme sans but lucratif canadien, et la recherche nominative correspond à l'usage normal du site, mais ce point mérite d'être connu.

---

## Page publique (`GET /`)

`GET /` sert une page **statique et bilingue** (français · anglais, thème auto / clair / sombre) présentant le contrat de vérité, les douze outils, les schémas de paramètres et les instructions d'accès.

**Tout y dérive des données vives** : les outils viennent de `listToolDescriptors()`, les schémas de validation du serveur et les annotations MCP du registre. Trois propriétés de la route sont testées : égalité stricte sur `/`, exclusion du bloc `/mcp`, et absence d'en-tête CORS. Le secret n'y paraît jamais — seulement la forme `/mcp/<secret>`. Elle reste servie même lorsque `MCP_ENABLED=false` et ne charge aucune ressource tierce (sans JavaScript, le français reste affiché).

---

## Architecture

```
Claude / ChatGPT / Antigravity / Gemini
        │  POST /mcp/oauth + OAuth 2.1 Bearer (par défaut via acces.poirierlavoie.ca)
        │  OU  POST /mcp (+ Authorization: Bearer <jeton> ou ?key=<jeton>)
        │  GET /mcp/server-card (fiche publique SEP-2127, sans secret)
        ▼
  Worker `jurisprudence` (workerd, TypeScript, ZÉRO dépendance d'exécution)
    routeur → authentification → JSON-RPC → registre d'outils
        │                                           │
   analyseur de                               client CanLII
   citations                                 (séquentiel, étranglé,
   (pur, hors ligne)                          réessayé)
        │                                           │
        └───────────────────┬───────────────────────┘
                            ▼
                       D1 `canlii`      <─►  https://api.canlii.org/v1/…
                       index ET cache
```

**Transport** : Streamable HTTP, **mode JSON sans état** — un message JSON-RPC par `POST`, pas de SSE, pas de `Mcp-Session-Id`.

**Le cache se remplit par l'usage** : tout balayage effectué pour répondre à une requête est persisté dans D1 (uniquement les champs réellement retournés par CanLII, sans inventer de date manquante et sans exposer d'horodatage exact de récupération).

---

## Mise en service et déploiement (opérateur)

```bash
npm ci
npx wrangler d1 create canlii --location enam     # reporter l'UUID dans wrangler.jsonc
npx wrangler d1 migrations apply canlii --remote

# Secrets — à saisir SOI-MÊME : ces valeurs ne doivent transiter par aucun journal.
npx wrangler secret put CANLII_API_KEY
openssl rand -hex 32                              # puis :
npx wrangler secret put MCP_SHARED_SECRET

export CLOUDFLARE_API_TOKEN="$(tr -d '\r\n' < cf.token)"   # gitignoré, jamais affiché
npm run deploy
```

### Répertoire des tribunaux

Les correspondances mesurées contre l'API de CanLII sont appliquées automatiquement par les migrations D1 (`migrations/0003_reconcile_court_codes.sql`). Lorsqu'un tribunal est créé, fusionné ou renommé, rafraîchir le répertoire et relire le SQL produit :

```bash
node scripts/refresh-databases.mjs --remote --sql
```

Le script **n'écrit rien en base** : il signale les écarts détectés et produit un gabarit SQL à valider manuellement.

### Recette manuelle

```bash
node scripts/mcp-client.mjs --remote tools/call verify_citations \
  '{"citations":[{"citation":"2008 CSC 9"},{"citation":"2020 QCCA 999999"},{"citation":"[1985] C.A. 105"}]}'
```

Attendu : *Dunsmuir* CONFIRMÉE · `2020 QCCA 999999` INTROUVABLE (avec les explications concurrentes) · `[1985] C.A. 105` NON CONSTRUCTIBLE (avec renvoi à `find_case`).

### Déploiement continu sur `main`

Pousser sur `main` déclenche [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) dans l'environnement GitHub `production` (`CLOUDFLARE_API_TOKEN` requis) :

1. **4 contrôles préalables en lecture seule** (présence et validité du jeton Cloudflare, compte unique, concordance de la D1 `canlii` avec `wrangler.jsonc`).
2. **Porte technique complète** (`wrangler types`, `tsc --noEmit`, `biome check .`, `vitest run`, `wrangler deploy --dry-run`).
3. **`npm run deploy`** (`scripts/deployer.mjs`), qui applique les migrations D1 **avant** de déployer le Worker avec `--var COMMIT:<sha>`, et s'arrête au premier échec.
4. **Vérification vivante** de `/health` et `/mcp/server-card`.

⚠ **Ne pas appeler `npx wrangler deploy` directement.** L'ordre migrations → déploiement est garanti par `npm run deploy` (`scripts/deployer.mjs`), aussi bien en CI qu'en repli local (le script refuse tout arbre de travail sale). `.github/workflows/verifier-deploiement.yml` compare chaque jour `/health` au dernier commit de `main`.

```powershell
$env:CLOUDFLARE_API_TOKEN = (Get-Content cf.token -Raw).Trim()   # gitignoré, jamais affiché
npm run deploy
```

---

## Développement

```bash
cp .dev.vars.example .dev.vars    # y mettre la clef CanLII et un secret de DEV
npx wrangler dev
npx wrangler types                # engendre worker-configuration.d.ts (gitignoré)
npx tsc --noEmit && npx biome check . && npx vitest run
npx wrangler deploy --dry-run     # valide paquet ET configuration, sans aucun jeton
npx wrangler d1 migrations apply canlii --local
```

Les tests s'exécutent dans **workerd** avec une D1 locale et des réponses de CanLII figées (`test/fixtures/`), sans consommer votre quota d'API.

⚠ `wrangler dev` avec une vraie clef dans `.dev.vars` fait de **vrais appels** vers CanLII et consomme le quota.

---

## Contrôle d'accès et cadence d'appel

- **Garde stricte BYOK CanLII préalable au cache partagé :** pour tout titulaire, les dix outils pouvant interroger CanLII résolvent et vérifient la clé personnelle via `ouvrirCoffre` (`X-Clef-CanLII` ou `DB_IDENTITE.coffre_clef` chiffré `HKDF-SHA256` + `AES-256-GCM`) **avant** toute lecture du cache D1 partagé, sans jamais retomber sur `env.CANLII_API_KEY` (`parse_citation`, `list_exempt_authorities` et `check_exempt_authority` avec `resolve_canlii: false` demeurent accessibles sans clé CanLII). Toute clé refusée par CanLII (`401`/`403`) renvoie `[CLEF_REFUSEE]`, le texte clair ne quitte jamais `ouvrirCoffre`, toute URL journalisée passe par `redactUrl()`, et aucun horodatage exact `fetched_at` n'est exposé.
- **Gouverne à deux étages :** cinq limiteurs de débit (`1021..1025`, pré-auth IP + quarantaine sur échecs d'auth + débit par titulaire à `180/min` `actif` / `20/min` `limite`) et quotas journaliers UTC (`local` sur cache / `parse_citation`, `sortant` sur appels CanLII).
- **Double montage étanche (`/mcp` et `/mcp/oauth`) :**
  - `/mcp` accepte les jetons individuels `DB_IDENTITE` (`portee` `'jurisprudence'` ou `'les_deux'`) ou `MCP_SHARED_SECRET` sous `Authorization: Bearer <jeton>`, `?key=<jeton>` ou `/mcp/<secret>`. Tout appel non authentifié reçoit **uniformément `404` à corps vide sans `WWW-Authenticate`**.
  - `/mcp/oauth` accepte uniquement `Authorization: Bearer <jeton>` et répond `401` RFC 9728 pointant vers `GET /.well-known/oauth-protected-resource/mcp/oauth` (`https://acces.poirierlavoie.ca`), tandis que `/.well-known/oauth-protected-resource` reste en `404`.
  - `MCP_ENABLED=false` coupe toutes les routes MCP (`/mcp*`, `/health`, `/mcp/server-card`, `/.well-known/oauth-protected-resource/mcp/oauth`) en `404`, tout en laissant la page publique `GET /` accessible (`200`).
- **Cadence d'appel CanLII et absence de moissonnage :** aucun téléchargement massif en arrière-plan n'est exécuté (`BACKFILL_ENABLED=false`, aucun cron). Les appels sortants vers CanLII sont espacés de **600 ms** par défaut (intervalle doublé à chaque `429`, jusqu'à 4 s, max 40 appels séquentiels par invocation). Lorsqu'un étranglement ou une interruption survient, les outils le signalent explicitement dans leur réponse.

## Référence

Spécification complète : [`SPEC.md`](SPEC.md).
Connecteur jumeau pour le droit législatif québécois : « lois »
(`legislation.poirierlavoie.ca`).

## Sécurité, confidentialité et licence

- **Sécurité, vie privée et secret professionnel :** Aucun texte de requête ni citation n'est journalisé à l'exécution (journaux d'invocation Cloudflare désactivés, zéro écriture dans `search_log` et `api_usage`, télémétrie bornée à `compteur_jour` et `evenement_technique` sans contenu dans `DB_IDENTITE`). Consulter [`SECURITY.md`](SECURITY.md) pour signaler de façon privée et coordonnée toute vulnérabilité technique ou question de confidentialité / secret professionnel à Jason Poirier Lavoie (`jason@poirierlavoie.ca`), sans ouvrir d'issue publique ni transmettre de renseignements confidentiels de clients.
- **Licence :** Le logiciel, les schémas et la documentation originale (élaborés en grande partie avec l'assistance de l'IA pour l'intérêt public) sont publiés gratuitement sous licence **`Apache-2.0`** ([`LICENSE`](LICENSE)). Aucun droit n'est revendiqué sur les métadonnées jurisprudentielles et législatives interrogées via l'API REST de CanLII, qui demeurent régies par les conditions d'utilisation de CanLII (voir [`NOTICE`](NOTICE)).
