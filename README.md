# MCP Jurisprudence

*Vérification déterministe de jurisprudence canadienne (collection CanLII).*

Serveur MCP autonome sur Cloudflare Workers, exposant la **REST API de CanLII** sous forme
de dix outils orientés **vérification de références** plutôt que d'enveloppes d'endpoints.

- **Page publique** : <https://jurisprudence.poirierlavoie.ca/> — bilingue, trois thèmes, navigation inter-connecteurs, schéma JSON-LD et découverte (`/robots.txt`, `/sitemap.xml`, `/llms.txt`)
- **Points d'entrée MCP** : `https://jurisprudence.poirierlavoie.ca/mcp` (jeton direct, refus `404` vide) et `https://jurisprudence.poirierlavoie.ca/mcp/oauth` (OAuth 2.1 PKCE S256 via <https://acces.poirierlavoie.ca>)
- **Worker** `jurisprudence` · **bases D1** `canlii` (cache partagé) + `mcp-identite` (`DB_IDENTITE`)
- Propriétaire : Jason Poirier Lavoie (avocat, Québec) — accès réservé aux membres en règle du Barreau du Québec avec clé API CanLII personnelle (BYOK)

L'API de CanLII est en **lecture seule** et ne renvoie que des **métadonnées** — jamais le
texte d'une décision. La valeur du connecteur tient donc à trois usages :

1. **Éprouver** une citation tirée de la doctrine, d'un moteur de recherche ou d'un texte
   produit par une IA — existence et identité, de façon déterministe ;
2. **Retrouver** une décision à partir des noms des parties lorsque la citation n'est pas
   constructible (recueils, identifiants SOQUIJ) ;
3. **Identifier** précisément une décision, puis en obtenir l'hyperlien `canlii.ca` afin
   d'en tirer le texte par un autre moyen.

*(Note — 2026-11-14 : les trois outils hors ligne sur les numéros de dossier de cour et les
palais de justice du Québec — aujourd'hui `greffe_parse_number`, `palais_list`, `palais_get` —
ont été déplacés vers le connecteur public sans authentification [`MCP-Outils`](https://github.com/jpoirierlavoie/MCP-Outils), où ils
ne requièrent aucun secret.)*

### ⚠ Source et portée des dix outils

Les dix outils sont exposés **sans préfixe** (`v2.0.0`, sous la clé serveur `juris` dans [`droit-civil-quebecois`](https://github.com/jpoirierlavoie/droit-civil-quebecois)) et portent leur provenance dans leur **description** :

| Portée | Source | Appels sortants |
|---|---|---|
| `verify_citations` … `get_legislation` (9) | la collection de **CanLII** — couverture et verdicts en dépendent | oui (`openWorldHint: true`) |
| `parse_citation` (1) | analyseur local et répertoire compilé — concerne les identifiants **CanLII**, **aucun appel** | non (`openWorldHint: false`) |

**Neuf outils sur dix appellent CanLII, pas dix.** `parse_citation` indique quels identifiants une
citation permettrait de construire dans CanLII, mais il ne l'interroge jamais : c'est un analyseur pur.
Cette nuance est **lisible par machine** : `parse_citation` porte `openWorldHint: false` dans ses
annotations MCP, les neuf autres `openWorldHint: true`. Un hôte qui restreint les outils « monde
ouvert » peut donc le distinguer sans lire une ligne de prose.

**Le nom d'outil ne porte pas la mise en garde à lui seul** — les noms ont évolué de `canlii_*`
à `jurisprudence_*` le 2026-09-16 (D8 amendée), puis vers des noms courts sans préfixe en `v2.0.0`
afin d'alléger la budgétisation des clients MCP : un préfixe ne sait pas porter une réserve.
L'annonce vit dans la **description de chaque outil**, dans les instructions du serveur (`INSTRUCTIONS`)
et sur la page publique — trois surfaces qui sont des phrases, épinglées par test dans les deux langues.

---

## ⚠ Contrat de vérité

> Reproduit **in extenso** de la spécification §2. Un vérificateur de citations qui promet
> plus qu'il ne tient est **pire qu'aucun outil** : il transforme une incertitude connue en
> fausse assurance, dans un contexte où la sanction est déontologique.

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

- le **texte** de la décision — il n'existe aucun endpoint de plein texte ni de recherche
  par mots du texte ;
- l'**autorité actuelle** — aucun historique d'appel, aucun indicateur de traitement
  (suivi, distingué, infirmé), aucun pourvoi pendant, aucun refus de permission d'appeler ;
- le **dispositif** ou le motif pour lequel une décision est invoquée ;
- l'**exhaustivité** — la couverture a des bornes historiques, et la documentation
  reconnaît un délai de diffusion pour lequel elle recommande de prévoir un jeu de deux
  jours.

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

**Ces quatre conséquences sont verrouillées par `test/garde.test.ts`.** Ce fichier n'éprouve
pas une fonctionnalité : il empêche une *disparition*. Le mode de panne redouté n'est pas
l'erreur, c'est le **silence** — une refonte de gabarit qui rend des sorties impeccables
dont la garantie a discrètement disparu. Si l'un de ses tests échoue, la bonne réaction
n'est pas de l'ajuster pour qu'il passe : c'est de remettre la mise en garde.

---

## Les dix outils

### Adossés à CanLII

| Outil | Rôle |
|---|---|
| `verify_citations` | **Pivot.** Verdict par citation : CONFIRMÉE · DISCORDANTE · INTROUVABLE · NON CONSTRUCTIBLE · ILLISIBLE — et **INDÉTERMINÉE**, qui dit qu’aucun constat n’a pu être fait (CanLII injoignable, étranglé, réponse inexploitable, ou budget épuisé) et ne vaut JAMAIS absence |
| `find_case` | Recherche par noms des parties ; index local puis balayage vif |
| `get_case` | Fiche officielle d'une décision |
| `citator` | Ce qu'une décision cite, ce qui la cite, les dispositions qu'elle cite |
| `subsequent_history` | **Indice heuristique** de sorts ultérieurs — ne remplace pas un citateur |
| `browse_cases` | Décisions d'un tribunal, avec les huit filtres de dates |
| `list_databases` | Répertoire des cours et corpus législatifs — l'en-tête nomme le filtre et dit sur quel ensemble il compte |
| `browse_legislation` | Lois et règlements d'une base législative |
| `get_legislation` | Fiche d'une loi : abrogation, découpage, et les dates de la VERSION servie — jamais celles de l'instrument |
| `parse_citation` | Analyse hors ligne d'une citation — **aucun appel** |

Sorties en **texte français**, jamais en JSON (décision D4).

---

## 🔒 Réserve de secret professionnel

> Spécification §9.5.

Ce connecteur est, sur ce plan, exceptionnellement propre : ce qui sort de l'infrastructure,
ce sont des **citations, des identifiants de tribunaux et des dates**. Aucun nom de client,
aucun fait de dossier, aucun document.

**Une seule réserve** : `find_case` prend des **noms de parties**. Si ce nom est celui
d'une partie à un dossier en cours plutôt que celui d'une décision publiée, la requête révèle
à CanLII un intérêt de recherche. Le risque est faible — CanLII est un organisme sans but
lucratif canadien, et la recherche jurisprudentielle nominative est l'usage normal du site —
mais il n'est pas nul, et il mérite d'être connu plutôt que découvert.

---

## Page publique (§18)

`GET /` sert une page **statique et bilingue** (français · anglais, thème auto / clair /
sombre) en trois sections : les dix outils, leurs schémas et l'accès. Depuis le 2026-09-16 elle
porte aussi, comme la description de chaque outil et les instructions du serveur, l'**annonce
de la source** que le préfixe `canlii_` portait seul jusque-là — dans les deux langues, et
un test échoue si une traduction cesse de la porter.

**Tout y dérive des données vives** : les outils viennent de `listToolDescriptors()` — la
fonction même que sert `tools/list` —, les schémas du même `inputSchema` que le validateur
applique, et les annotations MCP du registre. Une valeur recopiée deviendrait fausse sans
qu'aucun test n'échoue ; il n'y a donc aucune copie.

Trois propriétés de sa route sont délibérées et testées : égalité stricte sur `/` ;
**hors** du bloc `/mcp`, dont la garde d'origine refuserait la page à tout visiteur venu
d'un lien externe ; et **aucun en-tête CORS**, sans quoi la page pourrait servir d'oracle
à une autre origine. Le secret n'y paraît jamais — seulement sa forme. Elle est servie
même lorsque `MCP_ENABLED=false` : le coupe-circuit protège la surface MCP, pas la
documentation.

Aucune requête tierce : ni CDN, ni police distante, ni image. Sans JavaScript, le français
s'affiche et tout reste lisible.

---

## Architecture

```
claude.ai / Claude Code / Google Antigravity / Gemini
        │  POST /mcp/<secret>  OU  POST /mcp + Authorization: Bearer <secret>
        │  (JSON-RPC 2.0, un message par requête ; porteurs SANS préséance, §9.1)
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

**Transport** : Streamable HTTP, **mode JSON sans état** — un message JSON-RPC par `POST`,
pas de SSE, pas de `Mcp-Session-Id`.

**Le cache se remplit par l'usage** : tout balayage effectué pour répondre à une requête est
persisté. Ce n'est pas un miroir téléchargé, c'est la sédimentation des appels déjà faits.
Un balayage persiste les **quatre champs** que porte une liste de CanLII — ni date, ni
numéro de dossier, ni hyperlien. C'est la phrase dont l'absence a rendu le défaut écrivable :
le connecteur a longtemps complété la date manquante par le 1er janvier de l'année balayée,
l'a rendue comme une date de décision, et l'a écrite en base par-dessus la vraie.

---

## Mise en service

```bash
npm ci
npx wrangler d1 create canlii --location enam     # reporter l'UUID dans wrangler.jsonc
npx wrangler d1 migrations apply canlii --remote

# Secrets — à saisir SOI-MÊME : ces valeurs ne doivent transiter par aucun journal.
npx wrangler secret put CANLII_API_KEY
openssl rand -hex 32                              # puis :
npx wrangler secret put MCP_SHARED_SECRET

# FACULTATIF — second porteur du MÊME point d'entrée, aux droits identiques (§9.1).
# Il n'ouvre rien de plus ; il existe pour que deux clients se révoquent SÉPARÉMENT.
# ⚠ IL N'A PLUS DE PORTEUR depuis le 2026-09-02 : le clavardage de Pallas Athéna,
#   qui l'employait depuis le 2026-08-27, a été retiré de son dépôt (commit ef854733)
#   au passage du cabinet à un compte Claude for Work. Une installation neuve n'a donc
#   aucune raison de le poser — sauter ces deux lignes. Ce bloc disait jusqu'au
#   2026-09-16 : « il existe pour que les deux clients se révoquent SÉPARÉMENT » ; la
#   raison reste juste pour le PROCHAIN client, elle n'en décrit aucun aujourd'hui.
#   Le secret reste admis et n'est pas à retirer (§19), il ne coûte rien.
openssl rand -hex 32
npx wrangler secret put MCP_SHARED_SECRET_ATHENA

# Déploiement continu sur `main` (§12) via `.github/workflows/deploy.yml` (`environment: production`),
# ou repli local via `npm run deploy` (`scripts/deployer.mjs` : migrations --remote PUIS wrangler deploy).
export CLOUDFLARE_API_TOKEN="$(tr -d '\r\n' < cf.token)"   # gitignoré, jamais affiché
npm run deploy
```

### Répertoire des tribunaux (§4.3) — réconcilié, et à re-vérifier périodiquement

Les correspondances « code de citation → databaseId » ne sont documentées que pour
`csc-scc`. Tout le reste était une **hypothèse** d'amorçage, et les identifiants fédéraux
composés n'étaient pas documentés du tout.

**La réconciliation a été faite contre l'API vivante le 2026-07-23**, et elle a démenti
cinq hypothèses : `caf-fca` et `cf-fc` n'existent pas (les vraies bases sont `fca` et
`fct`), le fragment français de la Cour canadienne de l'impôt est `cci` et non `tcc`, et
le TAL a gardé le `databaseId` de la Régie du logement (`qcrdl`) — exactement le piège de
renommage que la spécification anticipait. Les valeurs mesurées, avec leur preuve
d'observation, sont dans `migrations/0003_reconcile_court_codes.sql` : **une installation
neuve les obtient donc par les migrations**, sans manœuvre manuelle.

Ce qui reste utile, et qu'il faut refaire quand un tribunal est créé, fusionné ou renommé :

```bash
node scripts/refresh-databases.mjs --remote --sql
```

Le script **n'écrit rien en base** : il rafraîchit le répertoire, dénonce les hypothèses que
CanLII dément, et produit un gabarit SQL à relire. Corriger automatiquement une
correspondance de tribunal reviendrait à figer une erreur en silence — c'est pourquoi la
dernière étape reste un geste humain.

### Recette manuelle (§14 étape 8)

```bash
node scripts/mcp-client.mjs --remote tools/call verify_citations \
  '{"citations":[{"citation":"2008 CSC 9"},{"citation":"2020 QCCA 999999"},{"citation":"[1985] C.A. 105"}]}'
```

Attendu : *Dunsmuir* CONFIRMÉE · `2020 QCCA 999999` INTROUVABLE (avec les explications
concurrentes) · `[1985] C.A. 105` NON CONSTRUCTIBLE (avec renvoi à `find_case`).

### Déploiement — continu sur `main` via `.github/workflows/deploy.yml` *(rétabli le 2026-11-14)*

**Pousser sur `main` déclenche [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)**
dans l'environnement GitHub `production` (`CLOUDFLARE_API_TOKEN` requis côté GitHub) :

1. **4 contrôles préalables en lecture seule** (présence du jeton sans espace/retour chariot,
   validité auprès de Cloudflare, compte unique, concordance de la D1 `canlii` avec
   `wrangler.jsonc`).
2. **Porte technique complète** (`wrangler types`, `tsc --noEmit`, `biome check .`,
   `vitest run`, `wrangler deploy --dry-run`).
3. **`npm run deploy`** (`scripts/deployer.mjs`), qui applique les migrations D1 **avant**
   de déployer le Worker avec `--var COMMIT:<sha>`, et s'arrête au premier échec.
4. **Vérification vivante** de `/health` (correspondance exacte du `commit` déployé) et de
   `/mcp/server-card` (`HTTP 200`).

⚠ **Ne pas appeler `npx wrangler deploy` directement.** L'ordre migrations → déploiement est
tenu par `npm run deploy` (`scripts/deployer.mjs`), aussi bien en CI qu'en repli local.

**Le filet indépendant de dérive reste actif.** `/health` annonce le commit dont la version en
ligne est issue, et `.github/workflows/verifier-deploiement.yml` (aucun secret, `contents: read`)
le compare **chaque jour** au dernier commit de `main` pour signaler tout déploiement CD manqué
ou expiré :

```bash
curl -s https://jurisprudence.poirierlavoie.ca/health
# {"status":"ok","commit":"8b34810"}   ← ce sha change à chaque déploiement
```

En repli local, `scripts/deployer.mjs` **refuse un arbre de travail sale** (déployer un arbre
modifié ferait annoncer un commit qui ne décrit pas le code en ligne) :

```powershell
$env:CLOUDFLARE_API_TOKEN = (Get-Content cf.token -Raw).Trim()   # gitignoré, jamais affiché
npm run deploy    # = migrations --remote PUIS wrangler deploy, arrêt au premier échec
```

### Après le déploiement

- **Portail d'accès et OAuth 2.1** (<https://acces.poirierlavoie.ca/demande> et <https://acces.poirierlavoie.ca/moi>) :
  chaque membre en règle du Barreau du Québec dépose sa clé API CanLII personnelle au coffre chiffré (`AES-256-GCM`, ou la fournit par en-tête `X-Clef-CanLII`) et obtient ses jetons individuels ou se connecte en OAuth 2.1 PKCE S256 sur `https://jurisprudence.poirierlavoie.ca/mcp/oauth` (métadonnées RFC 9728 sur `GET /.well-known/oauth-protected-resource/mcp/oauth`).
- **Montage direct à jeton** : `https://jurisprudence.poirierlavoie.ca/mcp` + `Authorization: Bearer <jeton>` (ou `?key=<jeton>` / `/mcp/<secret>` en coexistence transitoire Phase 3a).
- **Google Antigravity** (`plugin.json`, `mcp_config.json`, `assets/logo.svg` à la racine) :
  installer via `agy plugin install https://github.com/jpoirierlavoie/MCP-Jurisprudence.git`
  (ou copier les fichiers du greffon dans `~/.gemini/config/plugins/mcp-jurisprudence`),
  renseigner la variable `MCP_JURISPRUDENCE_SECRET` sur la page du greffon puis l'activer
  — les dix outils se chargent à la demande (*lazy*) par défaut, sans contexte additionnel
  hors les `INSTRUCTIONS` canoniques du serveur.
- **Gemini CLI** (`gemini-extension.json`) : installer via
  `gemini extensions install https://github.com/jpoirierlavoie/MCP-Jurisprudence`
  et saisir `MCP_JURISPRUDENCE_SECRET` (stocké de façon sensible). Le manifeste déclare
  `"contextFileName": []` afin que `GEMINI.md` (réservé au développement de ce dépôt) ne
  soit pas injecté dans les sessions d'usage général.
- **Gemini web** : les origines `https://gemini.google.com` et `https://aistudio.google.com`
  sont admises par défaut dans CORS (§9.6, incluant `X-Clef-CanLII`), aux côtés de `https://claude.ai` et
  `https://claude.com`.
- **Découverte HTTP (SEP-2127)** : la fiche publique de connectivité est exposée sans secret
  sur `GET https://jurisprudence.poirierlavoie.ca/mcp/server-card` (`application/mcp-server-card+json`).
- **Gouverne à deux étages et zéro journalisation de contenu** : cinq liaisons `ratelimits` dédiées (`1021..1025`, pré-auth IP + quarantaine d'échecs épargnant les jetons déjà validés + débit par `titulaire_id` à `180/min` `actif` / `20/min` `limite`), quotas journaliers UTC (`local` sur cache D1 / `parse_citation`, `sortant` sur appels CanLII), journaux d'invocation Cloudflare désactivés et zéro écriture dans `search_log` ni `api_usage` (seuls `compteur_jour` et `evenement_technique` sans contenu sont tenus dans `DB_IDENTITE`).

---

## Développement

```bash
cp .dev.vars.example .dev.vars    # y mettre la clef CanLII et un secret de DEV
npx wrangler dev
npx wrangler types                # engendre worker-configuration.d.ts, GITIGNORÉ :
                                  # sans lui, tsc ignore `Env` sur un clone neuf
npx tsc --noEmit && npx biome check . && npx vitest run
npx wrangler deploy --dry-run     # valide paquet ET configuration, sans aucun jeton
npx wrangler d1 migrations apply canlii --local
```

Les tests s'exécutent dans **workerd** avec une D1 locale et des réponses de CanLII figées
(`test/fixtures/`) : **la suite est verte sans la clef d'API**, faute de quoi elle
dépendrait du quota d'une clef personnelle.

⚠ `wrangler dev` avec une vraie clef dans `.dev.vars` fait de **vrais appels** et consomme
le quota.

---

## Sécurité

- **Garde stricte BYOK CanLII préalable au cache partagé (`G8`, `G10`)** : pour tout `titulaire`, les neuf outils adossés à CanLII résolvent la clé personnelle via `ouvrirCoffre` (`X-Clef-CanLII` → `DB_IDENTITE.coffre_clef` chiffré `HKDF-SHA256` + `AES-256-GCM`) **avant** toute lecture du cache D1 `cases`/`citator_*`, sans aucune retombée sur `env.CANLII_API_KEY`. Toute clé refusée en direct par CanLII (`401`/`403`) fait basculer l'entrée du coffre à `etat = 'refusee'` et renvoie `[CLEF_REFUSEE]`. Le texte clair ne quitte jamais la fermeture `ouvrirCoffre`, toute URL journalisée passe par `redactUrl()`, et aucun horodatage exact `fetched_at` n'est exposé au rendu (`G38`).
- **Zéro journalisation de contenu et observabilité désactivée (`S13`, `S14`, `G9`, `G37`)** : aucune écriture n'est effectuée dans `search_log` ni `api_usage`, `request.url` n'est jamais journalisée, et `wrangler.jsonc` désactive explicitement les journaux d'invocation Cloudflare.
- **Double montage étanche (`/mcp` et `/mcp/oauth`)** :
  - `/mcp` accepte les jetons individuels `DB_IDENTITE` (`portee` `'jurisprudence'` ou `'les_deux'`) en coexistence transitoire Phase 3a avec `MCP_SHARED_SECRET`, sous `Authorization: Bearer <jeton>`, `?key=<jeton>` ou `/mcp/<secret>`. Tout appel non authentifié ou jeton invalide/hors portée reçoit **uniformément `404` à corps vide sans `WWW-Authenticate`** (`S8`, `G7`, `G23`) afin de prévenir toute découverte OAuth non sollicitée ; le contrôle de méthode `POST` (`405`) s'exécute **après** l'authentification.
  - `/mcp/oauth` accepte uniquement `Authorization: Bearer <jeton>` et répond `401` RFC 9728 pointant vers `GET /.well-known/oauth-protected-resource/mcp/oauth` (`https://acces.poirierlavoie.ca`), tandis que la racine `/.well-known/oauth-protected-resource` reste en `404`.
- `MCP_ENABLED=false` ⇒ **404 sur toutes les routes MCP**, `/health`, `/mcp/server-card` et `/.well-known/oauth-protected-resource/mcp/oauth` compris, tout en laissant la page publique `GET /` accessible (`200`).

---

## Questions restées ouvertes

- **§16.1 — moissonnage de masse : TRANCHÉ, ce sera non (2026-07-23).** Décision du
  praticien : pas de téléchargement en masse. `src/backfill.ts` reste écrit et testé mais
  **ne s'exécute pas** — `BACKFILL_ENABLED=false`, et aucun cron quotidien n'est déclaré,
  de sorte que l'activer exigerait deux gestes délibérés. Le cache continue de se remplir
  par l'usage (D6), ce qui est autre chose : la sédimentation des appels réellement faits,
  et non un aspirateur. Rouvrir la question supposerait de la poser d'abord à CanLII.
- **§16.2 — quota et débit.** Non publiés, et **mesurés faute d'être documentés** : à
  250 ms entre appels, la production était étranglée sur 12 à 18 % des appels des
  journées chargées (8 `429` pour 64 appels le 2026-08-24). Les valeurs par défaut sont
  donc **600 ms** entre appels — et l'intervalle **double à chaque `429`**, plafonné à
  4 s, pour le reste de l'invocation. 40 appels par invocation, aucune concurrence
  sortante. Quand un étranglement a lieu, les outils le **disent** dans leur réponse,
  en précisant que le résultat n'en est ni tronqué ni affaibli : sans cela, un « aucun
  candidat » obtenu sous étranglement se lirait comme une inexistence. **Sauf quand le
  balayage a été interrompu ou le budget épuisé** — la note dit alors l'inverse plutôt
  que de rassurer à tort. Elle a longtemps rassuré inconditionnellement, deux lignes
  sous celle qui annonçait l'interruption ; c'est ce voisinage qui faisait prendre
  l'étranglement pour la cause. À réajuster si CanLII finit par publier ses chiffres.

## Référence

Spécification complète : [`SPEC.md`](SPEC.md).
Connecteur jumeau pour le droit législatif québécois : « lois »
(`legislation.poirierlavoie.ca`).

## Sécurité, confidentialité et licence

- **Sécurité, vie privée et secret professionnel :** Aucun texte de requête ni citation n'est journalisé à l'exécution (journaux d'invocation Cloudflare désactivés, zéro écriture dans `search_log` et `api_usage`, télémétrie bornée à `compteur_jour` et `evenement_technique` sans contenu dans `DB_IDENTITE`). Consulter [`SECURITY.md`](SECURITY.md) pour signaler de façon privée et coordonnée toute vulnérabilité technique ou question de confidentialité / secret professionnel à Jason Poirier Lavoie (`jason@poirierlavoie.ca`), sans ouvrir d'issue publique ni transmettre de renseignements confidentiels de clients.
- **Licence :** Le logiciel, les schémas et la documentation originale sont mis à disposition sous licence **Creative Commons Attribution - Pas d'Utilisation Commerciale - Partage dans les Mêmes Conditions 4.0 International (`CC-BY-NC-SA-4.0`)**, assortie d'une **Autorisation complémentaire de pratique professionnelle du droit** pour les membres en règle du Barreau du Québec (Partie A de [`LICENSE`](LICENSE)). Les métadonnées jurisprudentielles et législatives interrogées via l'API REST de CanLII demeurent régies par les conditions d'utilisation de CanLII (Partie B de [`LICENSE`](LICENSE)).
