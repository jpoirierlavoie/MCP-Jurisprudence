/**
 * Worker « MCP Jurisprudence » — routage, authentification,
 * coupe-circuit, et gestionnaire planifié (spécification §8, §9, §11).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠ NE JAMAIS JOURNALISER `request.url` (§9.2).                                ║
 * ║                                                                              ║
 * ║ Le secret partagé voyage dans le CHEMIN de l'URL (`POST /mcp/<secret>`),      ║
 * ║ parce que c'est la seule forme que tous les clients MCP savent produire.      ║
 * ║ Toute trace, tout `console.log`, tout message d'erreur qui reproduirait       ║
 * ║ l'URL entière publierait le secret dans `wrangler tail` et dans les journaux  ║
 * ║ d'observabilité. On journalise la MÉTHODE, le NOM D'OUTIL et le STATUT —      ║
 * ║ jamais le chemin. C'est le prix de la simplicité du modèle D7, et il doit     ║
 * ║ figurer ici en toutes lettres pour que personne ne le paie par accident.      ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { runScheduled } from "./backfill";
import { createClient } from "./canlii/client";
import { mcpActif } from "./config";
import { callTool, INSTRUCTIONS, listToolDescriptors, SERVER_INFO, TOOLS } from "./mcp/registry";
import {
  err,
  errorResponse,
  INTERNAL_ERROR,
  INVALID_REQUEST,
  isNotification,
  JsonRpcError,
  METHOD_NOT_FOUND,
  PARSE_ERROR,
  parseMessage,
  type RequestId,
  resultResponse,
  type ToolResult,
} from "./mcp/rpc";
import { pagePubliqueHtml } from "./site";

/** Versions du protocole servies. La plus élevée EN TÊTE (§8). */
const VERSIONS = ["2025-06-18", "2025-03-26"] as const;

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

/**
 * Origines de navigateur admises.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ Deux exigences DISTINCTES se rejoignent ici, et il faut les servir toutes    ║
 * ║ les deux :                                                                   ║
 * ║                                                                              ║
 * ║ 1. CORS. `claude.ai` est une application de NAVIGATEUR. Sans pré-vol accepté ║
 * ║    et sans `Access-Control-Allow-Origin`, le navigateur refuse la requête —   ║
 * ║    et le connecteur se solde par « Impossible de joindre le serveur », alors  ║
 * ║    que le même point d'entrée répond parfaitement à un client serveur.        ║
 * ║                                                                              ║
 * ║ 2. Défense contre le RÉ-ATTACHEMENT DNS, exigée par la spécification MCP :    ║
 * ║    une origine de navigateur non reconnue est REFUSÉE. Une origine absente    ║
 * ║    (appel serveur à serveur, scripts/mcp-client.mjs) reste admise — c'est le  ║
 * ║    motif retenu par `athena/mcp/bearer.py`.                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
const ORIGINES_PAR_DEFAUT = ["https://claude.ai", "https://claude.com"];

function originesAdmises(env: Env): string[] {
  const brut = (env.ALLOWED_ORIGINS as string | undefined) ?? "";
  const sup = brut
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  return [...ORIGINES_PAR_DEFAUT, ...sup];
}

/** Origine à refléter, ou null si l'origine est absente ou refusée. */
function originAutorisee(request: Request, env: Env): string | null {
  const o = request.headers.get("Origin");
  if (!o) return null; // serveur à serveur : pas de CORS à négocier
  return originesAdmises(env).includes(o) ? o : null;
}

/** Une origine de NAVIGATEUR présente mais non reconnue doit être refusée. */
function origineRefusee(request: Request, env: Env): boolean {
  const o = request.headers.get("Origin");
  return Boolean(o) && !originesAdmises(env).includes(o as string);
}

/**
 * En-têtes CORS d'une réponse effective.
 *
 * `Vary: Origin` est obligatoire : sans lui, un cache intermédiaire pourrait
 * resservir à une origine la réponse calculée pour une autre.
 */
function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    // Le client lit ces en-têtes ; sans exposition explicite ils lui sont invisibles.
    "Access-Control-Expose-Headers": "WWW-Authenticate, MCP-Protocol-Version",
  };
}

function jsonResponse(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(origin) },
  });
}

/**
 * Réponse au pré-vol CORS.
 *
 * ⚠ Le pré-vol est traité AVANT toute vérification du secret, et c'est
 *   obligatoire : un navigateur émet `OPTIONS` SANS en-tête d'authentification et
 *   sans corps. Exiger le secret ici ferait échouer le pré-vol, donc la requête
 *   réelle, donc le connecteur — sans que rien n'ait été authentifié pour autant.
 *   Le pré-vol ne divulgue rien : il ne fait qu'annoncer ce que le serveur accepte.
 */
function preflight(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, MCP-Protocol-Version, Accept, Last-Event-ID",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  });
}

/**
 * Comparaison À TEMPS CONSTANT, sur les empreintes plutôt que sur les chaînes (§9.1).
 *
 * Passer par SHA-256 neutralise aussi l'écart de LONGUEUR : `timingSafeEqual` exige
 * deux tampons de même taille et lèverait sur des chaînes de longueurs différentes —
 * ce qui, en soi, divulguerait la longueur du secret.
 */
async function secretOk(given: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/**
 * L'un des secrets PRÉSENTÉS est-il l'un des secrets ADMIS ?
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ DEUX SECRETS, DES DROITS IDENTIQUES, ET UNE SEULE RAISON : LA RÉVOCATION.     ║
 * ║                                                                              ║
 * ║ `MCP_SHARED_SECRET` sert le connecteur claude.ai ; `MCP_SHARED_SECRET_ATHENA` ║
 * ║ sert le clavardage de Pallas Athéna. Le second n'ouvre AUCUN droit de plus —  ║
 * ║ ce que protège D7 reste la clef d'API et son quota, pas un périmètre de       ║
 * ║ données. Ils sont distincts pour qu'un porteur se retire SEUL : faire tourner ║
 * ║ celui de claude.ai ne doit pas éteindre le cabinet, ni l'inverse.             ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠ FERMÉ PAR DÉFAUT, et désormais des DEUX CÔTÉS du produit. Le second secret étant
 *   facultatif, la tentation serait de traiter « aucun secret configuré » comme « rien
 *   à comparer » : ce serait le défaut ouvert par omission que §9.1 interdit. Liste
 *   vide d'un côté OU de l'autre ⇒ produit vide ⇒ `some` rend faux ⇒ tout est refusé.
 *   « Aucun porteur présenté » se traite donc par la MÊME ligne que « aucun secret
 *   configuré » : le défaut fermé devient structurel, au lieu de reposer sur une garde
 *   `if` que l'appelant portait — et qu'un remaniement pouvait laisser tomber.
 *
 * ⚠ On compare TOUTES les paires, sans court-circuit, et on ne journalise ni ne renvoie
 *   jamais lequel a servi (§9.2) : tous les échecs sont le même 401. `Promise.all` résout
 *   l'intégralité du produit AVANT que `some` ne lise des booléens déjà calculés ; sa
 *   sortie anticipée porte donc sur un tableau figé et ne coûte aucun temps observable.
 *   Ni le PORTEUR ni le SECRET qui a servi n'est déductible de la latence.
 *
 * ⚠ COÛT, puisque la liste des présentés s'est allongée : au pire 5 candidats × 2 secrets
 *   = 10 paires, soit 20 empreintes SHA-256, en une seule vague. Quelques dizaines de
 *   microsecondes sur une requête qui en passera 100 à 600 MILLIsecondes en D1 et chez
 *   CanLII. Le dédoublonnage de `secretsPresentes` ramène le cas normal — secret
 *   hexadécimal, sans barre finale, un seul secret configuré — à DEUX empreintes, soit
 *   exactement ce que la garde coûtait avant. On ne mémorise délibérément PAS l'empreinte
 *   des attendus : `secretOk` est la primitive publiée en §9.1, et relue comme telle.
 */
async function secretAdmis(presentes: readonly string[], env: Env): Promise<boolean> {
  const attendus = [env.MCP_SHARED_SECRET, env.MCP_SHARED_SECRET_ATHENA].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  const verdicts = await Promise.all(
    attendus.flatMap((attendu) => presentes.map((presente) => secretOk(presente, attendu))),
  );
  return verdicts.some(Boolean);
}

/**
 * `decodeURIComponent` LÈVE une `URIError` sur un pourcentage malformé (`/mcp/x%FF`).
 *
 * ⚠ DÉFAUT RÉEL, mesuré en direct sur la production : l'exception remontait NON RATTRAPÉE
 *   hors du gestionnaire, et le Worker sortait en 500. Un refus doit refuser — un 500
 *   annonce au sondeur qu'il a trouvé un bord, sans avoir rien refusé pour autant.
 *
 * ⚠ L'exception est avalée SANS AUCUNE TRACE, et c'est §9.2 (invariant 5) : le segment
 *   fautif EST le secret présenté. Ni `console.error`, ni le message de l'`URIError`, ni
 *   `request.url`. Le `catch` est vide DÉLIBÉRÉMENT — ne pas y « ajouter un log pour
 *   déboguer », ce serait publier le secret dans `wrangler tail`.
 *
 * Même parade et même nom que chez le connecteur jumeau (« Législation du Québec »,
 * `src/auth.ts`), pour qu'on la reconnaisse en passant de l'un à l'autre.
 */
function decodeOrNull(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * Les secrets PRÉSENTÉS par la requête — tous les porteurs, toutes leurs graphies
 * plausibles, sans aucune préséance entre eux.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ POURQUOI UNE LISTE, ET NON « LE » SECRET PRÉSENTÉ.                           ║
 * ║                                                                              ║
 * ║ Cette fonction rendait UNE valeur, par RETOUR ANTICIPÉ : tout en-tête        ║
 * ║ `Bearer` non vide masquait définitivement le secret du chemin. Un            ║
 * ║ `Authorization` résiduel — périmé, collé d'un autre connecteur, posé par un  ║
 * ║ mandataire — rendait donc inopérante une URL PARFAITEMENT CORRECTE, et son   ║
 * ║ refus était indiscernable d'un mauvais secret. §9.1 énonce deux formes SANS  ║
 * ║ préséance ; le code en avait inventé une, et la spécification décrivait      ║
 * ║ depuis lors un comportement qui n'existait pas. On essaie désormais TOUT ce  ║
 * ║ qui est présenté, et aucun porteur n'en masque un autre.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠ LA BARRE FINALE EST LE DÉFAUT QUI A COÛTÉ UN CONNECTEUR. Les clients normalisent
 *   l'URL saisie et y ajoutent « / ». Le refus qui s'ensuivait n'était pas lu comme
 *   « mauvais secret » mais comme « ressource OAuth protégée » : claude.ai enchaîne sur
 *   `.well-known/*` (404), puis sur `POST /register` (404), et l'inscription dynamique
 *   échoue — « Impossible de s'inscrire auprès du service de connexion ». Le connecteur
 *   reste coincé là. Constaté en production sur le jumeau le 2026-07-23, corrigé ici le
 *   2026-09-16. `/mcp/<secret>/` DOIT valoir `/mcp/<secret>`, et `/mcp/` valoir `/mcp`.
 *
 * ⚠ TOLÉRANCE STRICTEMENT ÉLARGISSANTE : on AJOUTE des candidats, on n'en TRANSFORME
 *   aucun. Le secret de production n'est pas connu d'ici et ne doit pas l'être (CLAUDE.md,
 *   « Secrets ») : il peut se terminer lui-même par « / » — l'alphabet base64 STANDARD en
 *   produit — ou porter un « % ». Rogner « ce qui est évidemment de trop » casserait alors
 *   une authentification qui fonctionne, en production, sans qu'aucun test ne le dise. Le
 *   pire cas d'un candidat surnuméraire est une empreinte SHA-256 calculée pour rien ; le
 *   pire cas d'un rognage est un connecteur mort. ON NE RESSERRE PAS L'ANALYSE D'UN
 *   PORTEUR CONTRE UNE VALEUR QU'ON S'INTERDIT DE LIRE.
 *
 * ⚠ ÉLARGIR N'EST PAS OUVRIR : seules des barres obliques FINALES sont ôtées, et seulement
 *   pour produire un candidat de PLUS. Aucun PRÉFIXE du secret n'est admis — toute valeur
 *   ainsi acceptée est une valeur dont la connaissance implique déjà celle du secret.
 *   Épinglé par un test.
 *
 * ⚠ ON NE BORNE PAS À UN SEUL SEGMENT, contrairement au jumeau. Lui le DOIT : il retire le
 *   segment-jeton et remonte la requête sur son chemin de montage, où une profondeur
 *   imprévue casserait le routage de `McpAgent.serve("/mcp")`. Ici le chemin n'est qu'un
 *   PORTEUR — rien n'est remonté, `/mcp*` est capté en entier, et tout ce qui ne s'apparie
 *   pas rend le même 401. Borner serait un RÉTRÉCISSEMENT sans contrepartie : si le secret
 *   de production contient « / », `/mcp/a/b` l'authentifie aujourd'hui.
 *
 * Limite connue et assumée : les barres finales sont ôtées TOUTES D'UN COUP, non une à
 * une. Un secret finissant par « / » présenté avec une barre surnuméraire reste refusé. Ce
 * cas n'a aucun client, et l'échelle complète des suffixes n'ajouterait que des candidats
 * que personne n'émet.
 */
function secretsPresentes(request: Request, pathname: string): string[] {
  const candidats: (string | null)[] = [];

  // Porteur par en-tête (§19 — le clavardage de Pallas Athéna). `\s+` et le drapeau `/i` :
  // le nom du schéma est insensible à la casse (RFC 7235 §2.1), et `startsWith("Bearer ")`
  // refusait « bearer x » comme « Bearer  x ». Le `.trim()` sur le jeton est sans danger
  // ICI — la couche `Headers` normalise déjà les espaces de bord d'une valeur d'en-tête —
  // alors que le même geste sur le CHEMIN, lui, serait un rognage.
  const entete = request.headers.get("Authorization");
  const bearer = entete === null ? null : /^Bearer\s+(.+)$/i.exec(entete.trim());
  if (bearer?.[1]) candidats.push(bearer[1].trim());

  // Porteur par le chemin. `(.+)` : tout ce qui suit `/mcp/`, profondeur comprise.
  // `/mcp` et `/mcp/` ne s'apparient pas — rien n'est alors présenté par le chemin, et
  // l'en-tête décide seul. C'est le comportement voulu pour les deux.
  const chemin = /^\/mcp\/(.+)$/.exec(pathname);
  if (chemin?.[1]) {
    const brut = chemin[1];
    const rogne = brut.replace(/\/+$/, "");
    // `rogne` EN PLUS de `brut`, jamais à sa place.
    for (const forme of rogne === brut ? [brut] : [brut, rogne]) {
      candidats.push(forme); // tel quel : ferme le cas « le secret contient un % »
      candidats.push(decodeOrNull(forme)); // décodé : le cas normal
    }
  }

  // Dédoublonnage. Sur un secret hexadécimal sans barre finale — le cas normal — les
  // quatre graphies du chemin se réduisent à UNE, et la garde coûte exactement ce qu'elle
  // coûtait avant le correctif. La comparaison n'oppose que des valeurs PRÉSENTÉES entre
  // elles : elle ne touche aucun secret attendu, et ne peut donc rien en divulguer.
  return [...new Set(candidats.filter((c): c is string => c !== null && c.length > 0))];
}

function unauthorized(origin: string | null = null): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { ...JSON_HEADERS, "WWW-Authenticate": "Bearer", ...corsHeaders(origin) },
  });
}

function methodNotAllowed(origin: string | null = null): Response {
  return new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405,
    headers: { ...JSON_HEADERS, Allow: "POST, OPTIONS", ...corsHeaders(origin) },
  });
}

/**
 * Limitation de débit (§9.3) : 60 requêtes/minute par IP, dans le Worker.
 *
 * ⚠ FAIL OPEN délibéré. Si le binding manque (développement local, mauvaise
 *   configuration) ou si l'appel échoue, on LAISSE PASSER.
 *
 *   Ce choix se justifie parce que la limitation de débit n'est PAS le contrôle
 *   d'accès : l'authentification, elle, échoue fermée (sans aucun secret configuré,
 *   tout est refusé). Ici, la seule chose protégée est le coût — requêtes Workers
 *   facturables et quota CanLII. Échouer fermé sur un compteur indisponible
 *   rendrait le connecteur inutilisable pour protéger une facture, ce qui est le
 *   mauvais arbitrage.
 */
async function debitAcceptable(request: Request, env: Env): Promise<boolean> {
  const limiteur = env.RATE_LIMITER;
  if (!limiteur) return true;
  // L'IP du client vue par Cloudflare. La documentation déconseille l'IP comme clef
  // dans le cas général (elle est partagée derrière un NAT) ; pour un connecteur
  // mono-usager, deux usagers derrière la même sortie partageraient un budget de
  // 60/min, ce qui est sans portée pratique ici.
  const ip = request.headers.get("CF-Connecting-IP") ?? "sans-ip";
  try {
    const { success } = await limiteur.limit({ key: ip });
    return success;
  } catch {
    return true;
  }
}

function tooManyRequests(origin: string | null): Response {
  return new Response(JSON.stringify({ error: "rate_limited" }), {
    status: 429,
    headers: { ...JSON_HEADERS, "Retry-After": "60", ...corsHeaders(origin) },
  });
}

/** Origine de navigateur présente mais non reconnue (§ défense ré-attachement DNS). */
function forbiddenOrigin(): Response {
  return new Response(JSON.stringify({ error: "forbidden_origin" }), {
    status: 403,
    headers: JSON_HEADERS,
  });
}

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

/**
 * Page publique (§18).
 *
 * ⚠ AUCUN en-tête CORS, comme `/health`. Sans `Access-Control-Allow-Origin`, aucun
 *   script d'une autre origine ne peut LIRE cette réponse : la page ne peut pas
 *   servir d'oracle. En ajouter « pour faire comme le reste » serait une régression.
 *
 * Ces en-têtes de sécurité sont les PREMIERS du dépôt, et c'est normal : servir du
 * `text/html` fait de cette origine une origine de DOCUMENT, ce qu'elle n'était pas
 * tant que tout était du JSON consommé hors navigateur.
 */
function pagePublique(request: Request): Response {
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    // Rien n'est chargé d'un tiers : le style et le script sont en ligne, il n'y a
    // ni police distante, ni CDN, ni image.
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; " +
      "img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // Volontairement court, et SANS `s-maxage` long : le rendu ne coûte rien (des
    // tables en mémoire), alors qu'un cache d'arête durable ferait survivre la page
    // à son propre déploiement.
    "Cache-Control": "public, max-age=600",
  };
  const html = pagePubliqueHtml();
  return request.method === "HEAD"
    ? new Response(null, { status: 200, headers })
    : new Response(html, { status: 200, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // Coupe-circuit (§8) : « false » => 404 sur TOUTES les routes MCP, /health
    // compris. Un /health qui répondrait encore révélerait que le service existe.
    const actif = mcpActif(env);

    if (pathname === "/health") {
      return actif ? jsonResponse({ status: "ok" }) : notFound();
    }

    // ── Page publique (§18) ──────────────────────────────────────────────────
    //
    // ⚠ ÉGALITÉ STRICTE, jamais `startsWith("/")` : le `notFound()` final doit rester
    //   la réponse de tout le reste, et c'est épinglé par un test.
    //
    // ⚠ DÉLIBÉRÉMENT HORS de la garde du bloc `/mcp` ci-dessous. Le contrôle
    //   d'origine, la limitation de débit et l'authentification y vivent TOUS ; une
    //   page publique doit répondre à n'importe quel navigateur, et ne doit donc pas
    //   passer par `origineRefusee()`. Corollaire à ne pas oublier : ne JAMAIS
    //   remonter ces contrôles en portée globale « par cohérence », ce qui casserait
    //   la page pour tout visiteur arrivant par un lien d'un autre site.
    //
    // ⚠ ET DÉLIBÉRÉMENT AVANT le coupe-circuit. `MCP_ENABLED=false` protège la
    //   SURFACE MCP — la clef d'API et son quota ; il n'y a rien à protéger ici. La
    //   page ne porte ni secret ni donnée vivante : elle existe pour être lue, et
    //   c'est précisément quand le connecteur est coupé qu'on veut pouvoir lire
    //   pourquoi. Exception assumée au principe énoncé pour `/health`.
    if (pathname === "/") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", {
          status: 405,
          headers: { Allow: "GET, HEAD" },
        });
      }
      return pagePublique(request);
    }

    if (pathname === "/mcp" || pathname.startsWith("/mcp/")) {
      if (!actif) return notFound();

      // Défense contre le ré-attachement DNS (spécification MCP) : une origine de
      // NAVIGATEUR présente mais inconnue est refusée d'emblée. Une origine absente
      // (serveur à serveur) passe — elle n'est pas soumise à la politique de même
      // origine et ne peut donc pas être détournée de cette façon.
      if (origineRefusee(request, env)) return forbiddenOrigin();
      const origin = originAutorisee(request, env);

      // Pré-vol CORS AVANT l'authentification : le navigateur l'émet sans en-tête
      // d'authentification. L'exiger ici casserait le connecteur sans rien protéger.
      if (request.method === "OPTIONS" && origin) return preflight(origin);

      // Limitation de débit APRÈS le pré-vol, et avant tout le reste (§9.3).
      //
      // L'ordre est délibéré des deux côtés : un 429 sur un pré-vol casserait le
      // connecteur de façon incompréhensible (le navigateur ne rapporte qu'un échec
      // CORS), tandis que limiter AVANT le contrôle de méthode et l'authentification
      // fait que même une rafale de requêtes mal formées ou mal authentifiées cesse
      // de coûter — ce qui est précisément l'objet de la mesure.
      if (!(await debitAcceptable(request, env))) return tooManyRequests(origin);

      // Aucun flux SSE, aucune session à supprimer : mode JSON sans état (D3).
      if (request.method !== "POST") return methodNotAllowed(origin);

      // Aucune garde `if (!presente)` : une liste VIDE — aucun porteur présenté — produit
      // un produit cartésien vide, donc `some` faux, donc 401. Le défaut fermé vit
      // désormais tout entier dans `secretAdmis`, des deux côtés du produit.
      if (!(await secretAdmis(secretsPresentes(request, pathname), env))) {
        return unauthorized(origin);
      }
      return await handleMcp(request, env, ctx, origin);
    }

    return notFound();
  },

  /**
   * Cron hebdomadaire (lundi 06:17 UTC) : rafraîchit le répertoire des bases.
   * Le moissonnage de masse (§11) n'est atteint que si BACKFILL_ENABLED === "true",
   * ce qui n'est PAS le cas par défaut et ne doit pas l'être avant la détermination
   * de §16.1 auprès de CanLII.
   */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduled(env));
  },
};

async function handleMcp(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  origin: string | null,
): Promise<Response> {
  // Négociation d'en-tête : absent => la plus ancienne version servie.
  const entete = request.headers.get("MCP-Protocol-Version");
  if (entete !== null && !VERSIONS.includes(entete as (typeof VERSIONS)[number])) {
    return jsonResponse(
      errorResponse(
        null,
        INVALID_REQUEST,
        `Version de protocole non prise en charge ; versions servies : ${VERSIONS.join(", ")}.`,
      ),
      400,
      origin,
    );
  }

  let message: ReturnType<typeof parseMessage>;
  try {
    message = parseMessage(await request.text());
  } catch (e) {
    const je = e instanceof JsonRpcError ? e : new JsonRpcError(PARSE_ERROR, "Erreur d'analyse.");
    return jsonResponse(errorResponse(je.requestId, je.code, je.message), 200, origin);
  }

  // notifications/initialized, notifications/cancelled, … : accusé de réception vide.
  if (isNotification(message))
    return new Response(null, { status: 202, headers: corsHeaders(origin) });

  const id = (message.id ?? null) as RequestId;
  const params = message.params ?? {};

  try {
    switch (message.method) {
      case "initialize":
        return jsonResponse(resultResponse(id, initialize(params)), 200, origin);
      case "ping":
        return jsonResponse(resultResponse(id, {}), 200, origin);
      case "tools/list":
        return jsonResponse(resultResponse(id, { tools: listToolDescriptors() }), 200, origin);
      case "tools/call":
        return jsonResponse(resultResponse(id, await toolsCall(params, env, ctx)), 200, origin);
      default:
        return jsonResponse(
          errorResponse(id, METHOD_NOT_FOUND, `Méthode inconnue : ${message.method}`),
          200,
          origin,
        );
    }
  } catch (e) {
    if (e instanceof JsonRpcError) {
      return jsonResponse(errorResponse(id, e.code, e.message), 200, origin);
    }
    // Journalisation SANS l'URL (§9.2) : méthode et nature de l'échec, rien d'autre.
    console.error("échec de répartition MCP", {
      method: message.method,
      error: e instanceof Error ? e.name : "inconnu",
    });
    return jsonResponse(errorResponse(id, INTERNAL_ERROR, "Erreur interne."), 200, origin);
  }
}

function initialize(params: Record<string, unknown>): Record<string, unknown> {
  const demandee = params.protocolVersion;
  const negociee =
    typeof demandee === "string" && VERSIONS.includes(demandee as (typeof VERSIONS)[number])
      ? demandee
      : VERSIONS[0]; // la plus élevée que l'on serve
  return {
    protocolVersion: negociee,
    capabilities: { tools: { listChanged: false } },
    serverInfo: SERVER_INFO,
    instructions: INSTRUCTIONS,
  };
}

async function toolsCall(
  params: Record<string, unknown>,
  env: Env,
  ctx: ExecutionContext,
): Promise<ToolResult> {
  const nom = params.name;
  if (typeof nom !== "string" || !(nom in TOOLS)) {
    // Outil inconnu : c'est une erreur d'EXÉCUTION rendue au modèle, pas une faute de
    // protocole — le modèle doit pouvoir la lire et se corriger (§7, conventions).
    return err(
      `Outil inconnu : « ${String(nom).slice(0, 80)} ». Outils disponibles : ${Object.keys(TOOLS).join(", ")}.`,
    );
  }

  const args = params.arguments ?? {};
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return err("« arguments » doit être un objet.");
  }

  const client = createClient(env);
  const debut = Date.now();
  try {
    return await callTool(nom, args as Record<string, unknown>, { env, db: env.DB, client, ctx });
  } catch (e) {
    console.error("échec d'exécution d'outil", {
      tool: nom,
      ms: Date.now() - debut,
      error: e instanceof Error ? e.name : "inconnu",
    });
    return err(
      "L'outil a échoué pour une raison interne. Réessayer ; si l'échec persiste, le signaler.",
    );
  }
}
