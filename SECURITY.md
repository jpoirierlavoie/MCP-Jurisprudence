# Security, Privacy & Professional Secrecy Policy

> **English:** To report a **security vulnerability** OR a **privacy, confidentiality, or solicitor-client privilege / litigation privilege concern**, **do not open a public GitHub issue or pull request**. Email the maintainer directly:
> **Jason Poirier Lavoie, Lawyer (Québec)** — `jason@poirierlavoie.ca` (acknowledgement within **72 hours**, coordinated disclosure).
> **Never attach** privileged client documents, unredacted confidential client facts, or live secrets (`CANLII_API_KEY`, `MCP_SHARED_SECRET`) to an initial report; use synthetic examples first.
>
> **Français :** Pour signaler une **vulnérabilité de sécurité** OU un **enjeu de vie privée, de confidentialité ou de secret professionnel / privilège** (`art. 9` *Charte québécoise*, `art. 131` *Loi sur le Barreau*), **n'ouvrez jamais d'issue publique sur GitHub**. Écrivez directement à :
> **Jason Poirier Lavoie, avocat (Québec)** — `jason@poirierlavoie.ca` (accusé de réception sous **72 heures**, divulgation coordonnée).
> **Ne transmettez jamais** de documents clients privilégiés, de noms ou faits confidentiels non caviardés ni de secrets actifs dans un premier message.

This repository holds the **MCP Jurisprudence** connector — deterministic Canadian case-law and CanLII citation verification — a read-only Cloudflare Worker used by a practising Québec lawyer. It stores no client documents, but holds a personal CanLII API key and a shared authentication secret — both configured strictly as Cloudflare Worker secrets, never in this repository.

*(Note: Offline Québec court file parsing and MJQ courthouse/registry lookups — `greffe_*` and `palais_*` — moved on 2026-11-14 to the separate public stateless connector [`pratique-civile-outils`](https://github.com/jpoirierlavoie/pratique-civile-outils).)*

---

## Reporting a Vulnerability, Privacy, or Privilege Issue

Please include:
- Whether the issue involves **security** (authentication, CORS/DNS rebinding, input/header validation, secret leakage) or **privacy / confidentiality / legal privilege** (unintended data retention, query transmission to CanLII or logs, client-identifying leakage)
- A clear description and minimal reproduction steps (using synthetic inputs only)
- The potential impact you've identified
- Any suggested mitigation, if you have one

You will receive an initial acknowledgement within **72 hours**. Coordinated disclosure is appreciated — please allow a reasonable window to patch before publishing details.

---

## Scope

In scope:
- The deployed Worker at `jurisprudence.poirierlavoie.ca`
- Code in this repository (`src/`, `migrations/`, `plugin.json`, `mcp_config.json`, `gemini-extension.json`)
- The MCP endpoint (`POST /mcp` and `/mcp/<secret>`) and its authentication / CORS boundary
- The public page (`GET /`) and public MCP Server Card (`GET /mcp/server-card`)

Out of scope:
- Social engineering of the maintainer or anyone else
- Physical or DoS / volumetric attacks
- CanLII's own API, website, or data — report upstream issues directly to CanLII
- Issues in development dependencies that do not reach the deployed bundle (this Worker ships with **zero runtime dependencies**; `package.json` contains `devDependencies` only)

---

## Data Handled, Privacy & Privilege Considerations

This connector is deliberately narrow. What leaves the infrastructure is **citations, court/database identifiers, dates, and search queries** — no client documents and no full-text judgments.

- **Offline citation parser (`jurisprudence_parse_citation`):** Makes **no outbound network request** (`openWorldHint: false`) and **writes nothing**. It parses neutral citations against local normalization rules only.
- **Party-name sensitivity (`jurisprudence_find_case`):** `jurisprudence_find_case` accepts **party names** (`openWorldHint: true`). If a searched name belongs to a party in an active, unpublished client matter, the query discloses a research interest to CanLII (a Canadian non-profit where name search is normal use, though not zero-disclosure) and writes the query string to the D1 `search_log` table. Treat `search_log` accordingly and avoid searching unredacted confidential client names where a neutral citation or keyword law search suffices.
- **D1 retention (`cases`, `search_log`, `api_usage`):** Stores cached public CanLII metadata and telemetry (`search_log`, `api_usage` — which fail soft without failing tool calls). Write to `jason@poirierlavoie.ca` regarding any privacy/privilege concern or deletion request.

---

## Authentication & Security Model

- **Closed by default (`PORTE.nomsSecrets` in `src/index.ts`):** Controlled via `@poirierlavoie/socle-juridique` (`#v0.6.0`). Expects `MCP_SHARED_SECRET` (the legacy `MCP_SHARED_SECRET_ATHENA` secret was retired on 2026-09-17 after that client was removed). If `MCP_SHARED_SECRET` is unset, or if `MCP_ENABLED=false`, all `/mcp*` routes fail closed.
- **Three equivalent bearer forms (no precedence):**
  1. `Authorization: Bearer <secret>` on `POST /mcp` (preferred for CLI/desktop/backend clients — never puts the secret in URLs or edge request logs)
  2. Query parameter `?key=<secret>` (supported for browser connector UIs such as claude.ai; note that URL-borne tokens can appear in Cloudflare edge URL logs, so never log `request.url` in Worker code)
  3. Path segment `POST /mcp/<secret>` (trailing slash `/mcp/<secret>/` tolerated; malformed percent-encoding fails closed with `401` and **zero** log output because the segment is the presented secret)
- **Constant-time comparison:** All presented candidates are hashed and compared against configured secrets via `crypto.subtle.timingSafeEqual` over SHA-256 digests (`apparie`), with no short-circuiting.
- **Why refusals return `401` with `WWW-Authenticate: Bearer`:** Unlike `MCP-Legislation` (which returns `404`), keeping `401` distinguishes a rejected secret from the `MCP_ENABLED=false` kill switch (`404` on `/mcp*`, `/mcp/server-card`, and `/health`).
- **DNS-rebinding & CORS defense:** Browser requests on `/mcp*` with an unrecognized `Origin` (outside `https://claude.ai`, `https://claude.com`, `https://gemini.google.com`, `https://aistudio.google.com`, and `ALLOWED_ORIGINS`) are rejected with `403` before rate limiting or authentication. Server-to-server requests without `Origin` pass to auth.
- **Public documentation page (`GET /`) & Server Card (`GET /mcp/server-card`):**
  - `GET /` is static/pure, serves `text/html; charset=utf-8`, carries **no CORS headers** (cannot be read cross-origin), enforces `Content-Security-Policy: default-src 'none' ... frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, survives `MCP_ENABLED=false`, and is tested against secret or `api.canlii.org` / `api_key` leakage.
  - `GET /mcp/server-card` publishes secret-free SEP-2127 discovery metadata when `MCP_ENABLED=true` (`404` when disabled).
- **Rate limiting:** 60 requests per minute per `CF-Connecting-IP` via the Worker `ratelimits` binding (`debitAcceptable`), applied after CORS preflight and before auth. Fails open if the rate-limit binding is unavailable.
- **Log hygiene:** `src/index.ts` strictly prohibits logging `request.url`, and every outbound CanLII URL passes through `redactUrl()` so `CANLII_API_KEY` never reaches logs or error messages (`test/garde.test.ts` / `test/tools.test.ts` verify zero API key leakage).

---

## Reproducing the Test Suite

The full suite runs offline against frozen fixtures — **no API key, no network, no Cloudflare account required**:

```powershell
npm.cmd ci
npx.cmd wrangler types
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd test
```
