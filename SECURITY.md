# Security, Privacy & Professional Secrecy Policy / Politique de sécurité, confidentialité et secret professionnel

> **Français :** Pour signaler une **vulnérabilité de sécurité** OU un **enjeu de vie privée, de confidentialité ou de secret professionnel / privilège** (`art. 9` *Charte québécoise*, `art. 131` *Loi sur le Barreau*), **n'ouvrez jamais d'issue publique sur GitHub**. Écrivez directement à :
> **Jason Poirier Lavoie, avocat (Québec)** — `jason@poirierlavoie.ca` (accusé de réception sous **72 heures**, divulgation coordonnée).
> **Ne transmettez jamais** de documents clients privilégiés, de noms ou faits confidentiels non caviardés ni de secrets ou clés API actifs dans un premier message.
>
> **English:** To report a **security vulnerability** OR a **privacy, confidentiality, or solicitor-client privilege / litigation privilege concern**, **do not open a public GitHub issue or pull request**. Email the maintainer directly:
> **Jason Poirier Lavoie, Lawyer (Québec)** — `jason@poirierlavoie.ca` (acknowledgement within **72 hours**, coordinated disclosure).
> **Never attach** privileged client documents, unredacted confidential client facts, or live tokens / CanLII API keys to an initial report; use synthetic examples first.

Ce dépôt héberge le connecteur **MCP Jurisprudence** (`https://jurisprudence.poirierlavoie.ca/mcp` et `/mcp/oauth`) — vérification déterministe de citations de jurisprudence canadienne contre la collection de CanLII — sur Cloudflare Workers en lecture seule, sans aucune dépendance d'exécution (`dependencies` absent).

---

## Portée

Dans la portée :
- Le Worker déployé sur `jurisprudence.poirierlavoie.ca` (`POST /mcp`, `POST /mcp/oauth`, `GET /.well-known/oauth-protected-resource/mcp/oauth`, `GET /`, `GET /mcp/server-card`, `GET /.well-known/mcp/server-card.json`, `GET /health`) ;
- Le code dans `src/`, `migrations/` et les manifestes clients (`plugin.json`, `mcp_config.json`, `gemini-extension.json`).

Hors portée :
- Ingénierie sociale ou attaques volumétriques / physiques ;
- L'API, le site ou les données propres de CanLII.

---

## Données traitées, BYOK CanLII et secret professionnel

1. **Zéro journalisation de contenu de requête (`S13`, `S14`, `G9`, `G37`)** :
   - Aucune écriture n'a lieu à l'exécution dans `search_log` ni `api_usage` ; aucun texte de citation, intitulé cherché ni URL `request.url` n'est journalisé.
   - Les journaux d'invocation Cloudflare sont explicitement désactivés dans `wrangler.jsonc` (`observability.enabled = false`, `observability.logs.invocation_logs = false`).
   - Seuls des compteurs journaliers agrégés (`compteur_jour`) et des événements techniques dépourvus de contenu (`evenement_technique`, horodatés à la minute UTC et purgés à 90 jours) sont inscrits dans `DB_IDENTITE`.
2. **Garde stricte BYOK CanLII et protection du cache partagé (`G8`, `G10`, `G38`)** :
   - Pour tout `titulaire`, chacun des 10 outils pouvant interroger CanLII ouvre le coffre (`ouvrirCoffre` : surcharge d'en-tête `X-Clef-CanLII` → `DB_IDENTITE.coffre_clef` chiffré par enveloppe `HKDF-SHA256` + `AES-256-GCM`) **avant** toute lecture du cache D1 `cases`/`cases_fts`/`citator_*`, sans aucune retombée sur `env.CANLII_API_KEY`.
   - En cas de refus `401`/`403` de CanLII sur une clé du coffre, `coffre_clef.etat` passe à `'refusee'` et l'outil renvoie `[CLEF_REFUSEE]` vers `https://acces.poirierlavoie.ca/moi`.
   - Aucun horodatage exact `fetched_at` n'est affiché dans les réponses servies (`G38`), empêchant toute inférence d'activité récente d'un confrère sur une décision donnée.
   - **Réserve sur `find_case` :** `find_case` transmet un fragment d'intitulé à l'API REST de CanLII en cas de balayage vif ; éviter d'y soumettre le nom d'une partie à un dossier confidentiel non publié lorsqu'une citation neutre suffit.

---

## Modèle d'authentification et contrôles de sécurité

- **Double montage (`/mcp` et `/mcp/oauth`) et coupe-circuit (`MCP_ENABLED !== "true"`) :**
  - `/mcp` accepte les jetons individuels `DB_IDENTITE` (`portee` `'tous'`, `'jurisprudence'` ou `'les_deux'` héritée) ainsi que le secret partagé transitoire Phase 3a (`MCP_SHARED_SECRET`), et renvoie **uniformément `404` à corps vide sans `WWW-Authenticate`** sur tout refus (`S8`, `G7`, `G23`).
  - `/mcp/oauth` accepte exclusivement `Authorization: Bearer <jeton>` et répond `401` RFC 9728 pointant vers `https://acces.poirierlavoie.ca`.
  - Le contrôle de méthode `POST` (`405`) s'exécute **après** l'authentification sur les deux montages.
- **Débit à deux niveaux et quotas (`G32`, `G34`) :** Pré-auth par IP (`RL_PRE_AUTH_IP` `1021` 600/min, `RL_ECHEC_IP` `1022` 20/min, `RL_ECHECS_GLOBAL` `1023` 300/min + quarantaine IP en mémoire contournée par tout jeton valide déjà reconnu), post-auth par `titulaire_id` (`RL_TITULAIRE` `1024` 180/min `actif`, `RL_TITULAIRE_LIMITE` `1025` 20/min `limite`), et quotas journaliers UTC (`local` sur cache / hors ligne, `sortant` dès qu'au moins un appel sortant CanLII est émis).

---

## Reproduction hors ligne de la suite de tests

```powershell
npm.cmd ci
npx.cmd wrangler types
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run audit
npm.cmd test
```

---

## Gouvernance Git et chaîne d'approvisionnement

- **Rulesets GitHub actifs (`main-integrity`, `immutable-release-tags`, `main-pr-and-ci`) :** Historique linéaire exigé ; suppression et *fast-forward* bloqués sur `main` et sur les étiquettes de version ; contournement administrateur de `main-pr-and-ci` restreint au mode `pull_request` (aucun `push` direct sur `main` ; toute modification passe par Pull Request validée par `CI`, `CodeQL`, `OSV-Scanner` et `Trivy`).
- **Analyse de secrets et chaîne logistique :** GitHub *Secret Scanning* et *Push Protection* activés (complétés en CI par le balayage `secret` de Trivy), Dependabot (`npm`, `github-actions`), Actions épinglées au SHA complet sous `step-security/harden-runner`, OpenSSF Scorecard et sonde quotidienne de dérive `/health` (`.github/workflows/verifier-deploiement.yml`).
