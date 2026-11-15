# CLAUDE.md — MCP Jurisprudence

Connecteur MCP exposant la REST API de CanLII en lecture seule :
`https://jurisprudence.poirierlavoie.ca/mcp/<secret>` *(les trois outils hors ligne `greffe_*`
et `palais_*` ont été déplacés le 2026-11-14 vers `pratique-civile-outils`)*.
Propriétaire : Jason Poirier Lavoie (avocat, Québec). **C'est un outil juridique : un
résultat faux rendu en silence est le pire défaut possible — refuser vaut toujours mieux
que deviner.**

La spécification qui fait foi est [`SPEC.md`](SPEC.md), versionnée à la
racine. Ses §1 (décisions arrêtées) et §2 (contrat de vérité) se lisent **avant** toute
modification.

---

## ⚠ ÉVALUATION D'IMPACT ET RÈGLE DE PROPAGATION — obligatoire, sans exception

```
╔═════════════════════════════════════════════════════════════════════════════╗
║ AUCUNE modification de ce depot n'est terminee tant que ses repercussions   ║
║ n'ont pas ete EVALUEES et RAPPORTEES sur les six axes ci-dessous, et        ║
║ INCLUSES dans le MEME changement :                                          ║
║                                                                             ║
║   1. les OUTILS MCP (registre, gestionnaires, préfixe jurisprudence_*)      ║
║   2. leurs DESCRIPTIONS et leurs titres (FR + EN)                           ║
║   3. leurs SCHÉMAS d'entrée                                                 ║
║   4. README.md, SPEC.md, SECURITY.md, LICENSE (CC-BY-NC-SA-4.0) & manifestes║
║   5. la PAGE PUBLIQUE HTML (GET / — src/site.ts + src/site.i18n.ts) et §18  ║
║   6. les IMPACTS INTER-DÉPÔTS (Cross-repository : pratique-civile-quebecoise║
║      MCP-Socle-Juridique, MCP-Legislation, pratique-civile-outils)          ║
╚═════════════════════════════════════════════════════════════════════════════╝
```

**Exigence de reddition de compte :** Avant de conclure une tâche, énoncer explicitement pour **chacun des six axes** (en particulier `README.md`, la page publique HTML `GET /` et l'impact inter-dépôts) s'il est touché et pourquoi (« non touché » doit être vérifié et affirmé, jamais omis).

**Le motif.** Ces surfaces décrivent la MÊME chose à des publics complémentaires : le modèle, le
praticien, le lecteur de la spécification, le visiteur de la page publique HTML, le prochain
contributeur et les dépôts consommateurs. Quand l'une prend du retard, elle ne tombe pas en panne — **elle continue
de répondre, avec assurance, quelque chose de faux**. Un outil renommé dont le `README.md`
garde l'ancien nom, un schéma resserré que la page HTML annonce encore large, une réserve
retirée du corps mais laissée en vitrine : aucun de ces défauts ne lève d'erreur. C'est
exactement le mode de panne que §2 interdit, déplacé dans la documentation.

**Le coût en jetons de cette vérification est ASSUMÉ et n'est pas un motif de l'abréger.**
Relire ces surfaces coûte moins qu'un praticien qui se fie à une description périmée.

**Une surface hors dépôt a changé de forme le 2026-09-02 — mais la CATÉGORIE reste centrale.**
Le clavardage interne de Pallas Athéna offrait les mêmes treize outils à son modèle depuis
`athena/chat/worker_tools.py`, engendré depuis `tools/list` (§19). Il a été **retiré du
dépôt d'Athéna le 2026-09-02** (commit `ef854733` : « le clavardage interne est retiré —
87 fichiers, 22 592 lignes »), au passage du cabinet à un compte Claude for Work. Ni le
fichier ni son générateur n'existent plus : il n'y a rien à relancer, et il ne faut pas
les chercher. *(Cette consigne a survécu trois semaines à son objet — d'où sa date.)*

**L'impact inter-dépôts reste critique aujourd'hui.** Un nom d'outil qui vit hors de ce dépôt
n'est vu dériver par aucune commande d'ici : l'échec n'apparaît qu'au prochain appel, sous
la forme d'un « Outil inconnu » que l'usager lit comme une panne du connecteur. Cette surface
inter-dépôts recouvre principalement : le plugin `pratique-civile-quebecoise` et la Compétence
claude.ai de recherche juridique (qui nomment les 10 outils `jurisprudence_*` à la main et
déclarent le connecteur dans leurs manifestes), `MCP-Socle-Juridique` (`#v0.6.0`), le jumeau
`MCP-Legislation` (identité visuelle CSS/HTML et complémentarité droit législatif ↔ jurisprudence)
et `pratique-civile-outils` (frontière CanLII vs outils québécois hors ligne).
**Le repérage hors dépôt se fait par vérification des manifestes et compétences du plugin cadre.**

### Table de propagation

| Si vous touchez… | …vérifiez ET mettez à jour |
|---|---|
| **un outil** (ajout, retrait, renommage) | `src/mcp/registry.ts` · le gestionnaire dans `src/mcp/handlers/` · `OUTILS_EN` dans `src/site.i18n.ts` (parité testée **dans les deux sens**) · le tableau ET le compte de `README.md` §« Les dix outils » · §7 de `SPEC.md` · les compteurs de `test/garde.test.ts`, `test/rpc.test.ts` et `test/doc.test.ts` (ce dernier affirme `NOMS.length === 10` AVANT toute confrontation — et porte en plus `EN_LETTRES`, éprouvant le compte écrit en toutes lettres du `README.md`) · la **liste triée des noms** dans `test/rpc.test.ts` · le préfixe `jurisprudence_` · la DESCRIPTION doit nommer sa source (`CanLII`), en français ET en anglais · **inter-dépôts** : la Compétence claude.ai de recherche juridique et le plugin `pratique-civile-quebecoise` (`skills/`, manifestes, `scripts/regenerer_cache_mcp.py --apply`, `scripts/synchroniser_plugin_gemini.py --apply`, `verifier.py`, `verifier_tout.py`) |
| **une description ou un titre** | la page publique HTML (`GET /`) les rend **verbatim** : relancer `test/site.test.ts` (formulations interdites) et `test/garde.test.ts` (sous-chaînes épinglées) · `OUTILS_EN` doit rester une TRADUCTION, jamais une copie |
| **un `inputSchema`** | `validateArgs` (`@poirierlavoie/socle-juridique`) n'implémente qu'un SOUS-ENSEMBLE de JSON-Schema : ne pas déclarer ce qu'il ne sait pas imposer · **une contrainte que le GESTIONNAIRE impose et que le schéma ne sait pas dire (XOR, format, bornes croisées) s'écrit dans la `description`, et se RÉPÈTE sur chaque membre plutôt que de renvoyer à l'autre** (§8) · **toute valeur par défaut ou maximum vient de `src/mcp/defauts.ts`, jamais d'un nombre écrit à la main** · la page HTML (`GET /`) génère ses tableaux de schéma depuis le même objet · `additionalProperties: false` reste obligatoire · **tout paramètre porte une `description`** — `test/garde.test.ts` échoue sinon, et les schémas partagés du haut de `registry.ts` (`BASE_ID`, `CASE_ID`, `CITATION_REF`, `OFFSET`, `LANG`, `REFRESH`) existent pour qu'une même notion ne soit pas décrite deux fois en divergeant |
| **une constante `GARDE_*`** | elle vit dans le corps des réponses **et** sur la page publique HTML (`GET /`) · `test/garde.test.ts` · ⚠ *corrigé le 2026-09-16* : la chaîne de couplage RÉELLE lue par `scripts/refresh-databases.mjs` est l'en-tête « base(s) au répertoire de CanLII » (`src/mcp/handlers/listDatabases.ts`), sur laquelle le script pose son garde-fou (sortie code 2 si modifiée). C'est elle qu'il faut propager. |
| **la page publique HTML (`GET /`)** | `src/site.ts` · `src/site.i18n.ts` · `test/site.test.ts` (CSP, absence de CORS, liste blanche d'URLs) · §18 de `SPEC.md` · la section « Page publique » de `README.md` · le style reste **identique** à celui du connecteur jumeau `MCP-Legislation` et de `pratique-civile-outils` (invariant 21) |
| **sécurité, confidentialité ou licence** | `SECURITY.md` (contact `jason@poirierlavoie.ca`, sécurité et confidentialité / privilège, porteurs et `search_log`) · `LICENSE` (`CC-BY-NC-SA-4.0` Partie A + Partie B CanLII) · `package.json` · `README.md` (§ Sécurité, confidentialité et licence) · `src/site.ts` + `src/site.i18n.ts` (`#acces`, sans casser `test/site.test.ts`) · cohérence inter-dépôts (`pratique-civile-quebecoise/SECURITY.md`, `MCP-Socle-Juridique`) |
| **version, identité ou manifestes** | `package.json` · `SERVER_INFO` et `PUBLIC_DESCRIPTION` (`src/mcp/registry.ts`) · `carteServeur()` (`/mcp/server-card`) · `plugin.json` · `mcp_config.json` · `gemini-extension.json` · `GEMINI.md` (< 24 000 octets) · vérifié par `test/doc.test.ts` · resynchroniser `pratique-civile-quebecoise` |

### Comment vérifier

La porte habituelle ne suffit pas : elle attrape la dérive **testée**, pas la dérive
**rédactionnelle**. Après elle, relire réellement les surfaces concernées.

```bash
npx wrangler types && npx tsc --noEmit && npx biome check . && npx vitest run
```

La confrontation registre ↔ README n'est plus une commande à copier : c'est
`test/doc.test.ts`, et elle tourne dans `vitest run`. **Le motif du déplacement est écrit
en tête de ce fichier, et il mérite d'être lu avant d'en écrire une autre du même
genre.** La commande `diff` qu'elle remplace filtrait ses DEUX côtés par une liste de
préfixes tenue à la main ; le 2026-09-16 les préfixes ont changé, les deux côtés se sont
réduits au même sous-ensemble de trois outils, et elle aurait rendu 0 — « aucune dérive »,
sans avoir regardé dix outils sur treize. **Une vérification dont aucun côté n'est non
vide par construction ne vérifie pas.** Corriger la liste aurait rouvert le même trou au
renommage suivant ; le test, lui, affirme d'abord que le registre compte dix outils
(treize à l'origine avant le retrait de §17), puis confronte dans les deux sens, sans
aucune liste de préfixes.

La page, elle, ne peut pas dériver sur ce point : elle DÉRIVE du registre (invariant 19).
C'est le README et la spécification qui prennent du retard, parce qu'ils sont écrits à la
main — d'où la confrontation automatisée, **et la relecture des §7 et §18, qu'aucune
commande ne sait réclamer**.

---

## Architecture et intégration dans le cadre global

### Le cadre global à trois couches (`pratique-civile-quebecoise`)

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
                                ▼ (dépendance de dev `#v0.6.0`, zéro runtime dep)
                 ┌─────────────────────────────┐
                 │    MCP-Socle-Juridique      │
                 │  Transport JSON-RPC 2.0     │
                 │  Streamable HTTP sans état  │
                 │  Auth SHA-256 temps constant│
                 │  Zéro concept juridique     │
                 └─────────────────────────────┘
```

### Intégration avec le plugin et les compétences (`pratique-civile-quebecoise`)
- **`skills/recherche-juridique`** : Consommateur principal des 10 outils `jurisprudence_*`. Vérifie les citations d'autorités (`jurisprudence_verify_citations`), résout une décision par intitulé et année (`jurisprudence_find_case`), explore les décisions qui la citent (`jurisprudence_citator` avec `en` dans le chemin), retrace l'historique d'appel (`jurisprudence_subsequent_history`), et consulte les répertoires de tribunaux (`jurisprudence_list_databases`). L'outil rappelle rigoureusement au modèle que CanLII ne livre que des métadonnées et jamais le texte intégral d'un jugement. Nomme également l'ensemble des 10 outils `legislation_*`, `greffe_parse_court_file_number`, `palais_list`, `palais_get` et `interets_compute_1619` (notamment dans `references/methode-sources.md`, `livrables.md`, `preliminaires.md`, `sources-doctrinales.md`), et mobilise les besoins d'aptitude `TEXTE`, `CALCUL`, `GREFFE`, `INSCRIPTION`.
- **`skills/redaction-juridique`** : Consomme `legislation_get_article` (dont `lang="en"`), `legislation_search_text`, `calendrier_compute_deadlines` et `interets_compute_1619` (besoins `CALCUL`, `GREFFE`).
- **`skills/calendrier-procedural`** : Consomme `calendrier_compute_deadlines` et `calendrier_list_holidays` (avec repli local `scripts/calcul_delai.py`, besoins `CALCUL`, `INSCRIPTION`, `TEXTE`). N'appelle aucun outil `jurisprudence_*` ni `legislation_*` directement.
- **`skills/analyse-documentaire`** : Ne nomme AUCUN outil MCP directement. Exprime des besoins d'aptitude abstraits `GREFFE`, `TEXTE` et `INSCRIPTION`, en déléguant la recherche juridique et la vérification de citations à `recherche-juridique` et les délais à `calendrier-procedural`.
- **`skills/deontologie-professionnelle`** : Ne nomme AUCUN outil MCP directement ; délègue le droit substantiel et procédural hors déontologie à `recherche-juridique` et les délais à `calendrier-procedural`.
- **Configuration** : Câblé dans `.mcp.json` et `gemini-extension.json` sous `jurisprudence` (`https://jurisprudence.poirierlavoie.ca/mcp`) avec la variable d'environnement `MCP_JURISPRUDENCE_SECRET`.

### Surfaces de synchronisation du plugin cadre (`pratique-civile-quebecoise`)
Toute évolution des outils, schémas, noms ou transport de `MCP-Jurisprudence` exige la mise à jour synchronisée des surfaces du plugin cadre :
1. **Manifestes clients** : `.mcp.json`, `mcp_config.json`, `gemini-extension.json`, `.claude-plugin/plugin.json`, `plugin.json`.
2. **Définitions manuelles des compétences (`skills/`)** : notamment `skills/recherche-juridique`, `skills/redaction-juridique`, `skills/calendrier-procedural`.
3. **Scripts de synchronisation et de contrôle** :
   - `scripts/regenerer_cache_mcp.py --apply`
   - `scripts/synchroniser_plugin_gemini.py --apply`
   - `python verifier.py`
   - `python verifier_tout.py --mode mock` / `python verifier_tout.py --mode live`

### Dépendances croisées et limites de responsabilité
- **Dépendance envers `MCP-Socle-Juridique`** : Consomme `@poirierlavoie/socle-juridique#v0.6.0` en `devDependencies` pour le transport MCP Streamable HTTP révision `2026-07-28`, l'enveloppe JSON-RPC 2.0, l'authentification SHA-256 à temps constant (`timingSafeEqual`) et la fiche SEP-2127 (`/mcp/server-card`). Zéro dépendance d'exécution (`dependencies: {}`).
- **Jumeau de `MCP-Legislation`** : Partage la même identité visuelle et typographique sur sa page publique `GET /` (police Georgia, variables CSS `--f`, `--m`, `--b`, `--a`, `--bg`, `--card`). Législation traite le droit codifié verbatim ; Jurisprudence traite les décisions et métadonnées CanLII.
- **Transfert historique du 2026-11-14 vers `pratique-civile-outils`** : Les 3 outils québécois hors ligne (`greffe_parse_court_file_number`, `palais_list`, `palais_get`), les tables statiques du MJQ (`src/qc/`), `lieux.ts`, `sources-officielles/` et le parseur de dossier ont été transférés à `pratique-civile-outils` (v0.2.0). Ce dépôt se consacre désormais exclusivement aux métadonnées CanLII et à l'analyseur de citations.

### Contrat de vérité et Invariant D4
- **Sortie textuelle pure Markdown (`content[0].text`)** : ZÉRO `structuredContent`, ZÉRO `outputSchema`. Les avertissements légaux, statuts d'appariement et réserves statutaires (`GARDE_*`) doivent demeurer indissociables du corps de la réponse pour contraindre le modèle à les lire.
- **Refus HTTP 401** : Tout appel non authentifié est refusé en `401 Unauthorized` avec l'en-tête `WWW-Authenticate: Bearer` (déclenche la découverte d'authentification client).

### Architecture logicielle

Worker TypeScript sans cadriciel, **zéro dépendance d'exécution** (D2), base D1 `canlii`,
transport Streamable HTTP en **mode JSON sans état** (D3). Config : `wrangler.jsonc`.

```
src/index.ts      routage, authentification à temps constant (§9.1), CORS, fiche SEP-2127 `/mcp/server-card`, coupe-circuit, cron (transport, JSON-RPC et validation via `@poirierlavoie/socle-juridique`)
src/config.ts     lecture des `vars` : `flag()`, `entier()`. `wrangler types` les type en
                  LITTÉRAUX — `env.MCP_ENABLED === "true"` écrit en direct ne compile pas,
                  ou se réduit à une constante aux yeux du lecteur. Passer par ici.
src/mcp/          defauts.ts — LIMITES et OFFSET_*, en un seul exemplaire : la description
                  que le modèle lit et le `??` du gestionnaire viennent d'ici, sinon ils
                  divergent (ils l'ont fait, sur trois outils sur cinq)
                  registry.ts (les 10 descripteurs, `SERVER_INFO`, `PUBLIC_DESCRIPTION`, `INSTRUCTIONS`) ·
                  handlers/ (un par outil, plus `cible.ts` — la résolution de la décision
                  de départ, partagée par le citateur et les sorts ultérieurs)
src/citation/     analyseur PUR — parse, normalize, compare. AUCUNE E/S.
src/canlii/       client sortant : étranglement, réessais, redactUrl
src/store/        D1 : cases (+FTS) · databases (auto-correction) · citator · telemetry
                  lookup.ts — la boucle d'auto-correction, en UN SEUL exemplaire
src/format/       fr.ts (dates, listes) · render.ts (gabarits annexe A + mises en garde)
src/site.ts       §18 — page publique GET /. site.i18n.ts : l'ANGLAIS seulement.
src/backfill.ts   §11 — écrit, testé, INERTE
```

### Écrit mais PAS EN SERVICE — trois amorces, et il faut les reconnaître

*Relevé le 2026-09-16. Un balayage du dépôt les a signalées comme du « code mort » ; elles
ne le sont pas, mais rien ne le disait, et c'est ce silence qui les rendait supprimables au
premier ménage. Une amorce qu'on ne distingue pas d'un résidu finit toujours par partir.*

| Ce qui dort | Où | Ce qui l'attend |
|---|---|---|
| `src/backfill.ts` | tout le fichier | §11 — écrit, testé, **INERTE par décision** (invariant 15). Ne pas basculer `BACKFILL_ENABLED`. |
| `listCases()` | `src/store/cases.ts` | Servir les balayages **depuis le cache** (§7.6). Aujourd'hui `jurisprudence_browse_cases` appelle CanLII à chaque fois et ne lit JAMAIS la table `cases` : il n'existe aucun chemin où un balayage soit servi du cache. Son **seul appelant est son test**. |
| `idx_cases_docket` | `migrations/0001_initial.sql` | Une recherche par **numéro de dossier de cour**, qu'aucun outil n'offre. L'index est donc entretenu à chaque écriture de fiche sans que rien ne l'interroge. |

**La règle qui les gouverne : une amorce se DOCUMENTE, elle ne se déduit pas.** Le
commentaire de `listCases()` annonçait « §7.6, servi du cache » — c'était faux, et cette
phrase aurait fait croire à un lecteur que le cache sert déjà les balayages. Corrigé le
2026-09-16. Si l'une de ces trois est un jour mise en service, la ligne correspondante
disparaît d'ici ; si l'on renonce, elle part **avec son code** — mais dans les deux cas
délibérément, et non parce que quelqu'un a pris un `grep` sans appelant pour un verdict.

⚠ **Le coût de les garder est connu, et il est petit** : quelques octets de bundle pour
`backfill` et `listCases` (arbre mort, jamais exécuté), et pour l'index un surcoût à
chaque écriture dans `cases` — insensible à l'échelle d'un cabinet. Ce n'est donc pas une
question de performance mais de LISIBILITÉ : du code que rien n'appelle fait douter le
lecteur suivant de ce qu'il a compris du reste.

## Commandes

```bash
npx wrangler types && npx tsc --noEmit     # toujours avant commit
npx biome check .                          # --write pour corriger
npx vitest run                             # 344 tests, sans réseau ni clef
npx wrangler dev                           # exige .dev.vars
npx wrangler deploy --dry-run              # valide paquet + config, sans jeton
npx wrangler d1 migrations apply canlii --local
node scripts/mcp-client.mjs --local tools/list
node scripts/refresh-databases.mjs --remote --sql   # réconciliation §4.3
```

**Déploiement — continu sur `main` via `.github/workflows/deploy.yml` *(rétabli le 2026-11-14)*, ou local via `npm run deploy`** (§12 ; l'interlude manuel du 2026-09-16 au 2026-11-14 est clos). **Les migrations passent d'abord, sans exception** — et c'est `npm run deploy` (`scripts/deployer.mjs`) qui le garantit des deux côtés : en CI (dans l'environnement GitHub `production` avec `CLOUDFLARE_API_TOKEN`, précédé de 4 contrôles préalables et d'une porte complète de tests, suivi d'une vérification de `/health` et `/mcp/server-card`) comme en repli local. Ne pas appeler `npx wrangler deploy` directement : c'est l'ordre inverse.

Ce script fait trois choses qu'une ligne de `package.json` ne saurait faire : il **refuse
un arbre sale** — le Worker annonce son commit sur `/health`, et déployer un arbre modifié
ferait annoncer un commit qui ne décrit pas le code en ligne ; il **passe le commit** au
déploiement (`--var COMMIT:<sha>`) ; et il marche **sous Windows**, où `$(git rev-parse)`
dans un script npm ne s'évalue pas.

**Le contrôle de dérive** (`.github/workflows/verifier-deploiement.yml`) compare chaque jour
la version en ligne au dernier commit de `main`. Aucun secret, aucun jeton,
`contents: read` : il REGARDE, il ne déploie rien et ne le peut pas. Un rouge y signifie
« à déployer », jamais « cassé ».

Le jeton d'API Cloudflare vit dans `cf.token` (gitignoré) : il se LIT dans une variable
d'environnement, il ne s'affiche pas — un `cat` ou une capture de terminal le publient
aussi sûrement qu'un commit.

```powershell
$env:CLOUDFLARE_API_TOKEN = (Get-Content cf.token -Raw).Trim()
npm run deploy
```

Et non `npx wrangler deploy` : `scripts/deployer.mjs` refuse un arbre sale et passe
`--var COMMIT:<sha>`, sans quoi `/health` annonce « inconnu » et le contrôle de dérive
refuse de conclure.

## Invariants critiques

1. **`INSERT ... ON CONFLICT DO UPDATE`, JAMAIS `INSERT OR REPLACE`** sur `cases`. REPLACE
   change le `rowid` et fait diverger l'index FTS5 en *external content* — **en silence**.
2. **Une fiche est clée sur l'identifiant DEMANDÉ**, pas sur celui que CanLII renvoie.
   L'API rend `caseId` sous la clef de SA langue : demander `2008scc9` renvoie
   `{"fr": "2008csc9"}`. Clée sur la réponse, la fiche est rangée là où personne ne la
   cherche : le cache ne sert jamais et chaque vérification rappelle l'API. *(Défaut réel,
   trouvé par test.)*
3. **`source` distingue une FICHE d'une ligne de balayage, et ne se rétrograde jamais.**
   Un balayage (`browse`, `find`) persiste 4 champs : ni date, ni numéro de dossier, ni
   hyperlien. Deux règles en découlent, et elles se tiennent :
   *(a)* seule une ligne `source = 'lookup'` peut servir de fiche ou de vérification —
   servir une ligne de balayage rendrait un document amputé étiqueté « index local », et
   pire, ferait sauter en silence le contrôle de l'année faute de date ;
   *(b)* l'UPSERT enregistre la MEILLEURE provenance atteinte, jamais la dernière — sinon
   tout balayage recroisant une fiche déjà résolue la disqualifierait du cache et
   rachèterait l'appel. Un suivi quotidien à fenêtres chevauchantes recroise TOUT : le
   cache ne servirait jamais. *(Les deux moitiés sont des défauts réels, trouvés par
   test ; verrouillées dans `test/persist.test.ts` et `test/tools.test.ts`.)*
   *(c)* **la règle porte sur l'ÉCRITURE, pas sur la conversion.** *Ajouté le 2026-09-17,
   après l'avoir trouvée enfreinte.* `rowFromListItem` rendait bien `decision_date: null`,
   et son test unitaire passait — c'est le GESTIONNAIRE de `jurisprudence_find_case` qui
   reposait `${annee}-01-01` juste avant l'UPSERT. Un invariant vérifié une couche trop
   bas ne protège pas la couche qui l'enfreint. Et ce qui rendait le défaut GRAVE tient
   au `COALESCE` : il fait gagner la valeur NON NULLE, donc une date fabriquée
   n'appauvrit pas la fiche — elle **ÉCRASE la vraie**, sans rétrograder `source` (la
   règle (b) joue alors contre nous), et laisse une ligne corrompue pleinement éligible
   à servir une vérification. `jurisprudence_verify_citations` l'attribuait ensuite « à
   CanLII », et `jurisprudence_subsequent_history` écartait en silence un appel réel de
   la même année. Ce qui se déduit d'une fenêtre de requête, c'est une ANNÉE — et une
   année n'est pas une date : elle vit dans `anneeInferee`, pour le filtrage et le
   classement, et ne s'affiche jamais. *(1 819 lignes en production ; purgées par
   `migrations/0005`. Épinglé par un balayage structurel de `test/garde.test.ts` sur
   TOUTES les sources, et par son pendant positif.)*
4. **Les mises en garde de §2 vivent dans le CORPS des réponses**, pas seulement dans les
   descriptions d'outils. `test/garde.test.ts` échoue si elles disparaissent. Un test de
   garde qui échoue se **répare en remettant la garantie**, jamais en ajustant le test.
   Corollaire : **pas de `structuredContent`, pas d'`outputSchema`** — un client qui reçoit
   un objet typé laisse tomber la prose, et la réserve part avec elle SANS qu'aucun test
   n'échoue. Réexaminé le 2026-07-23, maintenu. L'argument contraire est réel (un champ
   `verdict` ne se lit pas de travers ; un consommateur par programme voudrait du typé)
   mais le gain est marginal devant une perte silencieuse. **Si** un consommateur par
   programme existe un jour, la réponse n'est PAS `structuredContent` : c'est un paramètre
   `format: {enum:["texte","json"]}` dont la charge utile porte `avertissement` en champ
   **obligatoire**, de sorte que la réserve voyage à l'intérieur des données. Quatre
   conditions cumulatives, et le texte reste le défaut. Argument complet en commentaire
   au-dessus de `ok()` dans `@poirierlavoie/socle-juridique` (`src/protocole/rpc.ts`) — le lire avant d'y toucher.
5. **Ne jamais journaliser `request.url`** : le secret partagé est dans le chemin (§9.2).
   Aucune sortie d'outil ne contient d'URL `api.canlii.org` — elles portent la clef d'API.
6. **La boucle d'auto-correction (§6.4) vit dans `src/store/lookup.ts`, en un seul
   exemplaire.** Deux implémentations d'une même heuristique d'apprentissage divergeraient,
   et l'une enseignerait au répertoire ce que l'autre ignore. *(Une duplication a déjà été
   supprimée pour ce motif.)*
7. **`NEUTRAL` porte le drapeau `/i`** — sans lui, « 2020 qcca 495 » (exigé par §13) ne
   s'analyse pas. Le drapeau fait alors capturer « CanLII » comme code de tribunal : deux
   parades cumulatives (masquage des plages CanLII appariées d'abord, puis rejet explicite
   du code `CANLII`). Retirer l'une rouvre le défaut ; les deux sont testées.
8. **Un tribunal absent du répertoire ⇒ INTROUVABLE SANS appel sortant** (§6.4 point 3).
   Un appel voué à l'échec coûte du quota et produirait un « introuvable » qui ferait croire
   à l'absence de la décision.
9. **Une panne réseau n'est PAS une absence.** Un 401, un 429 ou une expiration rendent
   `INDÉTERMINÉE`, jamais `INTROUVABLE` : affirmer une absence qu'on n'a pas constatée est
   exactement ce que §2 interdit. Seul un **404** justifie un rattrapage puis un INTROUVABLE.
   *Étendu le 2026-09-16, après l'avoir trouvé enfreint sur SIX chemins.* Il était énoncé
   pour `verify_citations` et respecté là ; il ne l'était nulle part ailleurs. La racine
   tenait en un champ : `src/store/lookup.ts` rendait `message: null` sur le statut
   « erreur », et chaque appelant retombait donc sur SON texte d'absence par défaut. Un 429
   ressortait en « Aucune fiche pour … » par `jurisprudence_citator` et
   `jurisprudence_subsequent_history`, flanqué des explications d'ABSENCE par
   `jurisprudence_get_case` (forme par identifiants), en « Aucun candidat » par
   `jurisprudence_find_case`, et en « Aucune décision » par `jurisprudence_browse_cases`
   quand les entrées rendues n'étaient pas lisibles. **Quatre symptômes, un défaut.**
   **Trois règles en découlent, et elles se tiennent :**
   *(a)* la CAUSE se nomme dans la sortie — « CanLII a étranglé les appels (429) », et non
   « injoignable » : sans cela le lecteur ne sait pas s'il doit réessayer ou corriger sa
   clef, et rien n'empêche le message de redevenir `null` sans qu'un test ne bouge ;
   *(b)* une explication d'ABSENCE (`EXPLICATIONS_INTROUVABLE`) ne s'accole QU'À un 404 ;
   son pendant `EXPLICATION_INDETERMINEE` couvre tout le reste, et les deux vivent en **un
   seul exemplaire** dans `src/format/render.ts`, pour le motif de l'invariant 6 ;
   *(c)* « ne pas avoir pu chercher » n'est pas « n'avoir rien trouvé » — un balayage
   interrompu s'annonce INTERROMPU dès l'en-tête, et non par une note placée SOUS une
   affirmation déjà faite.
   ⚠ Le garde-fou est un **balayage structurel** dans `test/garde.test.ts`, et il porte son
   PENDANT POSITIF : sur un 404, les explications d'absence doivent être LÀ. Sans cette
   seconde moitié, on satisferait la première en retirant la garantie de §2 partout —
   c'est-à-dire en détruisant ce qu'elle protège.
10. **Un appariement d'intitulé PARTIEL vaut DISCORDANTE, jamais CONFIRMÉE** (§6.5). Mieux
    vaut un faux signalement qu'une fausse assurance.
11. **Les intitulés anonymisés se comparent par leur NUMÉRO** (« Droit de la famille —
    20495 ») : ils ne contiennent aucun nom de partie, et deux décisions distinctes de la
    même série partagent tous leurs jetons alphabétiques.
12. **Le citateur n'accepte que `en`** dans le chemin (annexe B). D'où l'absence de tout
    paramètre `lang` sur `jurisprudence_citator` : en exposer un serait mensonger.
13. **La télémétrie n'échoue jamais l'outil qu'elle observe** : table absente, écriture
    refusée — tout est avalé.
14. **Les fins de ligne sont LF dans la copie de travail** (`.gitattributes`) : sinon Biome
    local (CRLF sous Windows) et la CI (Linux) divergent en permanence.
15. **§11 est inerte et le reste : la question est TRANCHÉE (2026-07-23) — pas de
    moissonnage de masse.** Deux verrous : `BACKFILL_ENABLED="false"` et aucun cron
    quotidien déclaré. Ce n'est plus une question ouverte mais une décision du
    praticien : ne pas basculer le drapeau, même « pour essayer ». Le remplissage du
    cache par l'usage (D6) n'est pas concerné — c'est autre chose.
16. **Le préfixe `jurisprudence_` identifie le connecteur ; c'est la DESCRIPTION qui nomme la source (§7).**
    *Réécrit le 2026-09-16 ; amendé le 2026-11-14 au retrait de §17.* Un préfixe ne sait pas
    porter une réserve : l'annonce vit dans la **description** de chacun des dix outils,
    dans `INSTRUCTIONS` et sur la page — trois surfaces épinglées par un test **par langue**
    exigeant la présence de « CanLII ». `openWorldHint` vaut `false` sur
    `jurisprudence_parse_citation` (analyseur pur hors ligne) et `true` sur les neuf autres.
17. *(Retiré le 2026-11-14, v0.3.0 — déplacé vers « pratique-civile-outils ».)* Les tables
    `src/qc/`, `palais_list`, `palais_get`, `GARDE_PALAIS` et `GARDE_SANS_ADRESSE` relèvent
    désormais de `pratique-civile-outils`.
18. *(Retiré le 2026-11-14, v0.3.0 — déplacé vers « pratique-civile-outils ».)* `src/qc/lieux.ts`
    et `sources-officielles/mjq-numeros-greffes-2026-07-22.html` ont suivi vers
    `pratique-civile-outils`.
19. **La page publique DÉRIVE des données, elle ne les recopie pas (§18).** Outils,
    descriptions, schémas et annotations `openWorldHint` viennent de `listToolDescriptors()`.
    Une valeur recopiée deviendrait fausse **sans qu'aucun test n'échoue**.
    Trois propriétés de sa route sont load-bearing : égalité stricte sur `/` ;
    **délibérément hors du bloc `/mcp`** (n'y remontez JAMAIS le contrôle d'origine
    « par cohérence », la page cesserait de répondre aux visiteurs venus d'ailleurs) ;
    et **aucun en-tête CORS**, sans quoi la page deviendrait un oracle. Elle survit au
    coupe-circuit : exception assumée, car elle ne porte ni secret ni donnée vivante.
20. *(Retiré le 2026-11-14, v0.3.0 — déplacé vers « pratique-civile-outils ».)* Le parseur de
    dossiers `src/qc/dossier.ts` et son jeu différentiel `test/fixtures/dossier-athena.json`
    ont suivi vers `pratique-civile-outils`.
21. **La page partage le style du connecteur JUMEAU, au caractère près.** Les deux jeux de
    variables, la police (`16px/1.6 Georgia`), les tailles de titres et la grille (barre
    latérale de 13rem, rupture à 78rem) sont repris de « Législation du Québec ». Les deux
    sites appartiennent au même praticien et se consultent l'un après l'autre : une
    divergence de teinte ou de police les ferait passer pour deux outils sans rapport.
    Toute retouche ici se porte là-bas, et réciproquement. Deux gardes tiennent la
    cohérence interne : **aucune couleur en dur** hors des deux jeux (une couleur figée ne
    bascule pas et devient invisible dans l'un des thèmes), et les deux jeux déclarent
    **exactement** les mêmes variables.
22. **Un refus sur `/mcp` est une porte vers OAuth : il ne se donne jamais par accident
    (§9.1).** Un `401` est lu par claude.ai comme « ressource OAuth protégée » : il
    enchaîne sur `.well-known/*`, puis sur `POST /register`, et l'inscription dynamique
    échoue — « Impossible de s'inscrire auprès du service de connexion » ; le connecteur
    reste coincé là. Subi en production par le jumeau le 2026-07-23, corrigé ici le
    2026-09-16. D'où trois propriétés de la garde, toutes testées : **tous les porteurs
    présentés sont essayés** — un en-tête `Bearer` résiduel ne masque pas une URL
    correcte, ni l'inverse ; **`/mcp/<secret>/` vaut `/mcp/<secret>`** ; **un chemin mal
    encodé refuse en `401`**, il ne fait pas sortir le Worker en `500`. Et la règle qui
    les gouverne : la tolérance ne fait qu'**ajouter** des candidats, elle n'en **rogne**
    aucun. Le secret de production n'est connu ni du code ni de qui le modifie (voir
    « Secrets »), il peut se terminer par `/` — base64 standard — ou porter un `%` : **on
    ne resserre pas l'analyse d'un porteur contre une valeur qu'on s'interdit de lire.**
    Corollaire : ne pas « borner à un seul segment par cohérence avec le jumeau » — lui
    DOIT le faire, il remonte la requête sur son chemin de montage ; pas nous. Le statut
    du refus reste `401` + `WWW-Authenticate: Bearer` : le jumeau refuse en `404` et a
    reçu le MÊME message — le statut n'est donc pas le déclencheur — et un `404` rendrait
    le coupe-circuit indiscernable d'un secret refusé.

## Procédure sûre

Coder → **propager (règle ci-dessus)** → `wrangler types` → `tsc --noEmit` →
`biome check` → `vitest run` → `wrangler deploy --dry-run` → déployer.

La propagation vient **avant** la porte technique, et non après : c'est la seule étape
qu'aucune commande ne peut réclamer à votre place. **Les migrations D1 passent AVANT le
déploiement** : l'ordre inverse met en ligne du code qui lit des colonnes inexistantes.

⚠ *Amendé le 2026-09-16 : le déploiement automatique a été RETIRÉ.* Cette phrase attribuait
l'ordre à un workflow — « **Les migrations D1 passent AVANT le déploiement**
(`deploy.yml`) ». L'ordre est juste ; l'attribution était fausse et l'avait toujours été.
`.github/workflows/deploy.yml` n'a **jamais réussi** — dix-neuf exécutions depuis le
2026-07-23, dix-neuf échecs, tous à l'étape des migrations, l'étape de déploiement étant
alors systématiquement sautée. Aucune version en production n'en est jamais sortie. Il a
été **supprimé** plutôt que réparé (décision du praticien, motivée en §12).

**L'ordre migrations → déploiement est tenu en un seul endroit : `npm run deploy`**
(`scripts/deployer.mjs`), qui exécute `wrangler d1 migrations apply canlii --remote` PUIS
`wrangler deploy --var COMMIT:<sha>` et s'arrête au premier échec. Le script valait
auparavant `wrangler deploy` tout court — l'ordre inverse, disponible sous un nom
rassurant. Le workflow `.github/workflows/deploy.yml` (rétabli le 2026-11-14 dans
l'environnement GitHub `production`, actions épinglées par SHA, `harden-runner`, 4 contrôles
préalables du jeton et de la D1 avant `npm ci`, puis vérification vivante de `/health` et
`/mcp/server-card`) exécute lui aussi **`npm run deploy`**. Le déploiement reste jouable à
la main en repli local via le même script.

⚠ *Cause établie le 2026-09-16, et une fausse piste retirée le même jour.* Cette note a
porté quelques heures « le jeton ouvre DEUX comptes Cloudflare et wrangler ne sait pas
trancher ». **C'était faux, et l'erreur était de comptage** — la ligne d'en-tête du
tableau de `wrangler whoami` prise pour une ligne de données ; le jeton n'en voit qu'UN.
La cause est **confirmée à la source** : le journal du job dit `CLOUDFLARE_API_TOKEN:`
suivi de rien, puis « In a non-interactive environment, it's necessary to set a
CLOUDFLARE_API_TOKEN environment variable ». La variable était littéralement vide.

⚠ *Corrigé le 2026-09-16 : ces journaux sont LISIBLES.* Cette note a d'abord affirmé
qu'ils « exigent des droits d'administration » — vrai de l'API **anonyme**, qui rend
403, mais faux pour le propriétaire du dépôt : `gh run view <id> --log` les rend
intégralement. La cause avait donc été établie par un détour — l'audit de sortie de
`harden-runner`, public, ne montrant aucun appel à `api.cloudflare.com` — là où la
source directe était à portée de commande. **Avant de conclure qu'une trace est
inaccessible, essayer `gh`.**
Un correctif posé le même jour l'avait rendue lisible — quatre contrôles nommant la cause
dans le titre de l'étape — et la toute première exécution l'a CONFIRMÉE : « CLOUDFLARE_API_TOKEN
est VIDE dans ce job ». Le workflow a ensuite été retiré ; la cause est consignée ici parce
qu'elle vaudra encore le jour où l'on voudra rouvrir la question (§12).

## Secrets

- `CANLII_API_KEY` et `MCP_SHARED_SECRET` : posés par `wrangler secret put`, saisis par
  Jason lui-même. **Ne jamais les afficher, les lire en contexte, ni les écrire dans un
  fichier versionné.**
- `MCP_SHARED_SECRET_ATHENA` : **retiré le 2026-09-17**. Second porteur historique du point
  d'entrée, aux droits IDENTIQUES — il n'ouvre aucun outil de plus. Il a existé pour que
  le clavardage de Pallas Athéna et le connecteur claude.ai se révoquent SÉPARÉMENT
  (§9.1, §19). Depuis le 2026-09-02, ce porteur n'avait plus de client actif (le clavardage
  ayant été retiré du dépôt d'Athéna, commit `ef854733`) et a été formellement retiré de
  Cloudflare le 2026-09-17 (`PORTE.nomsSecrets = ["MCP_SHARED_SECRET"]` dans `src/index.ts:124`).
  Les appelants actifs en production sont le connecteur `claude.ai` et le greffon cadre
  `pratique-civile-quebecoise` (sous Claude for Desktop / Anthropic et Google Gemini / Antigravity).
  L'authentification reste **fermée par défaut** : aucun secret configuré ⇒ tout est
  refusé. Ne jamais journaliser lequel des secrets a servi.
- `.dev.vars` (dev), `mcp.url` (URL de prod avec secret), `*.token` : **gitignorés**.
  Parmi eux, **`cf.token` porte le jeton d'API Cloudflare, et c'est lui qui déploie
  réellement la production** (voir « Commandes ») : il se lit dans une variable
  d'environnement, jamais par un affichage — `cat`, `echo` ou une capture de terminal
  le publient aussi sûrement qu'un commit. Même règle que les deux précédents : ne
  jamais l'afficher, ne jamais le lire en contexte, ne jamais le versionner.
- Commits signés, footer `Co-Authored-By:` adapté au modèle courant. Un commit par
  sous-tâche.

## État

**Livré et en production** sur `jurisprudence.poirierlavoie.ca`, suite de tests exécutable sans réseau ni clef. Dix outils `jurisprudence_*` — neuf adossés à la REST API de CanLII et un analyseur hors ligne (`jurisprudence_parse_citation`) — plus une page publique bilingue sur la même origine (§18). `/health` annonce le commit dont la version en ligne est issue (§8, §12.1), et le déploiement sur `main` est automatisé via `.github/workflows/deploy.yml` (`npm run deploy`, `environment: production`) *(rétabli le 2026-11-14 après le retrait manuel du 2026-09-16, §12)*. `migrations/0004_rename_tool_prefix.sql` est **appliquée en production** : `search_log.tool` et `court_codes.note` portent les noms d'aujourd'hui, et aucune ligne ne subsiste sous un ancien nom — l'historique de §10 n'est donc pas coupé en deux à la date du renommage.

`migrations/0005_purge_dates_fabriquees.sql` est **appliquée en production** *(2026-09-17)* :
elle a purgé les 1 819 dates de décision au 1er janvier fabriquées par l'ancien balayage vif
(sur 2 630 lignes `sweep` recensées avant purge, dont 811 sans date). Vérifiée sur la D1
vivante : `0` ligne hors `lookup` porte une `decision_date`, et `cases` = `cases_fts` (parité
à 457 311 entrées).

**Clients actifs aujourd'hui** (§19) : Le connecteur est sollicité par le connecteur `claude.ai`
ainsi que par le greffon cadre `pratique-civile-quebecoise` (sous Claude et Gemini). Le clavardage de
Pallas Athéna, client de 2026-08-27 à 2026-09-02, a été retiré (commit `ef854733`) et le secret
dédié `MCP_SHARED_SECRET_ATHENA` a été définitivement retiré le 2026-09-17 (`PORTE.nomsSecrets = ["MCP_SHARED_SECRET"]`).
§19 est conservée, datée, plutôt qu'effacée : ce qu'elle démontre — qu'un second client
n'a rien exigé du protocole — reste vrai, et vaudra pour le prochain.

La réconciliation du répertoire (§4.3) est **faite** contre l'API vivante : elle a
démenti cinq hypothèses d'amorçage, consignées avec leur preuve d'observation dans
`migrations/0003_reconcile_court_codes.sql` (`caf-fca`/`cf-fc` inexistants — les vraies
bases sont `fca` et `fct` ; fragment français `cci` et non `tcc` ; le TAL a gardé le
`databaseId` de la Régie du logement, `qcrdl`). Les tests de `test/persist.test.ts`
verrouillent ces six correspondances : ils empêchent une réapplication de 0002 seule de
ressusciter les hypothèses fausses sur une base neuve.

Les lignes encore `verified = 0` ne sont pas un reliquat : elles sont **inertes par
construction** (invariant 8 — un tribunal absent du répertoire rend INTROUVABLE sans
appel sortant), et se confirmeront à l'usage par la boucle de §6.4.

*(2026-11-13)* Ajout de la compatibilité et découvrabilité **Google Antigravity** (`plugin.json`,
`mcp_config.json`, `assets/logo.svg`), **Gemini CLI** (`gemini-extension.json` avec
`"contextFileName": []`), **Gemini web** (`https://gemini.google.com` et
`https://aistudio.google.com` admises par défaut dans CORS, avec `Mcp-Method`, `Mcp-Name`,
`Mcp-Session-Id` en pré-vol `2026-07-28`), fiche publique SEP-2127 (`GET /mcp/server-card`),
et `GEMINI.md` (< 24 000 octets, synthèse d'espace de travail renvoyant à `CLAUDE.md` et
`SPEC.md`). Parité des versions, descriptions et taille de `GEMINI.md` verrouillée par
`test/doc.test.ts`.

*(2026-11-14)* Rétablissement du déploiement continu sécurisé via `.github/workflows/deploy.yml`
(`environment: production`, `CLOUDFLARE_API_TOKEN`, 4 contrôles préalables en lecture seule,
porte complète, `npm run deploy` via `scripts/deployer.mjs`, puis vérification vivante sur
`/health` et `/mcp/server-card`) ; alignement de l'URL canonique du dépôt sur `MCP-Jurisprudence`
(`src/index.ts`, `src/site.ts`, `plugin.json`, `README.md`, vérifié par `test/doc.test.ts`).

*(2026-11-14, v0.3.0)* Extraction et transfert des trois outils hors ligne du Québec
(`greffe_parse_court_file_number`, `palais_list`, `palais_get`), de `src/qc/`, de
`sources-officielles/mjq-numeros-greffes-2026-07-22.html`, de `scripts/extraire-lieux-mjq.mjs`,
des tests QC et des garde-fous `GARDE_PALAIS` / `GARDE_DOSSIER` / `GARDE_SANS_ADRESSE` /
`SANS_PLUMITIF` vers le connecteur public non authentifié `pratique-civile-outils` (`0.2.0`) ;
conservation de §17 et des invariants 17, 18 et 20 comme épitaphes datées afin de préserver la
numérotation, et alignement du serveur sur les 10 outils `jurisprudence_*`.
