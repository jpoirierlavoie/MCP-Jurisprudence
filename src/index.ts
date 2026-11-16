/**
 * Worker « MCP Jurisprudence » — routage, authentification,
 * coupe-circuit, et gestionnaire planifié (spécification §8, §9, §11).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠ NE JAMAIS JOURNALISER `request.url` (§9.2).                                ║
 * ║                                                                              ║
 * ║ Le secret partagé voyage dans le CHEMIN de l'URL (`POST /mcp/<secret>`),     ║
 * ║ parce que c'est la seule forme que tous les clients MCP savent produire.     ║
 * ║ Toute trace, tout `console.log`, tout message d'erreur qui reproduirait      ║
 * ║ l'URL entière publierait le secret dans `wrangler tail` et dans les journaux ║
 * ║ d'observabilité. On journalise la MÉTHODE, le NOM D'OUTIL et le STATUT —     ║
 * ║ jamais le chemin. C'est le prix de la simplicité du modèle D7, et il doit    ║
 * ║ figurer ici en toutes lettres pour que personne ne le paie par accident.     ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import {
  apparie,
  construireCarteServeur,
  debitAcceptable,
  err,
  methodeNonPermise,
  origineAutorisee,
  origineInterdite,
  origineRefusee,
  originesAdmises,
  type Porte,
  porteursPresentes,
  preflight,
  refuser,
  repondreCarteServeur,
  reponseSante,
  SERVER_CARD_SCHEMA,
  secretsAdmis,
  servirRequeteMcp,
  type ToolResult,
  tropDeRequetes,
} from "@poirierlavoie/mcp-socle";
import { runScheduled } from "./backfill";
import { createClient } from "./canlii/client";
import { mcpActif } from "./config";
import {
  callTool,
  INSTRUCTIONS,
  listToolDescriptors,
  PUBLIC_DESCRIPTION,
  SERVER_INFO,
  TOOLS,
} from "./mcp/registry";

import { pagePubliqueHtml } from "./site";

/** Versions du protocole servies. La plus élevée EN TÊTE (§8). */
export const VERSIONS = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"] as const;

export { SERVER_CARD_SCHEMA };

/** Une heure : le registre ne bouge qu'au déploiement. */
const TTL_LISTE = 3_600_000;

/**
 * Ce dépôt sert-il les clients antérieurs à `2025-06-18` ?
 *
 * OUI, et c'est COUPLÉ au fait que `2025-03-26` reste servie. La spécification n'ouvre que
 * deux branches pour une requête sans en-tête de version : la traiter comme `2025-03-26`
 * — permis seulement si l'on sert ces clients-là — ou la refuser, ce que S3 prescrit PARCE
 * QU'ELLE RETIRE `2025-03-26`.
 *
 * ⚠ NE PAS BASCULER CE DRAPEAU SANS RETIRER `2025-03-26` DE `VERSIONS`, ni l'inverse. Les
 *   deux vont ensemble. Les avoir découplés a fait rendre 400 à la veille mensuelle, qui
 *   n'envoie pas l'en-tête — deux fois dans la même journée, et la seconde fois pour ce
 *   motif-ci. Le retrait de `2025-03-26` attend de toute façon la mesure de `clientInfo`
 *   (phase 4) : c'est à ce moment-là que les deux basculeront, ensemble.
 *
 * Ce qu'on ne fait JAMAIS, dans les deux cas : promouvoir silencieusement l'absence
 * d'en-tête en `2025-06-18`. Ce serait inventer une troisième branche que personne
 * n'implémente en face.
 */
const SERT_AVANT_2025_06_18 = true;

/**
 * Fiche de découverte HTTP MCP (SEP-2127) — PURE, sans accès à `env` ni à aucun secret.
 *
 * Toutes les valeurs d'identité et de protocole dérivent de `SERVER_INFO`,
 * `PUBLIC_DESCRIPTION` et `VERSIONS` (invariant 19 : aucune copie littérale).
 */
export function carteServeur() {
  return construireCarteServeur({
    name: `ca.poirierlavoie.jurisprudence/${SERVER_INFO.name}`,
    title: SERVER_INFO.title,
    version: SERVER_INFO.version,
    description: PUBLIC_DESCRIPTION,
    websiteUrl: "https://jurisprudence.poirierlavoie.ca/",
    repositoryUrl: "https://github.com/jpoirierlavoie/MCP-Jurisprudence",
    remoteUrl: "https://jurisprudence.poirierlavoie.ca/mcp",
    supportedProtocolVersions: VERSIONS,
    authDescription: "Secret partagé de l'instance (« Bearer <secret> »).",
  });
}

const nonTrouve = () => new Response("Not found", { status: 404 });

/**
 * La porte d'accès, déclarée UNE fois et employée par le runtime comme par les tests.
 *
 * `queryKey` EST SERVI DEPUIS LE 2026-09-17, et c'est un ajout délibéré de surface. Motif :
 * `?key=` est la seule forme qui ait survécu au formulaire de connecteur de claude.ai
 * (mesuré en juillet 2026 sur le jumeau), de sorte que son absence rendait ce connecteur-ci
 * probablement inajoutable. Contrepartie assumée et connue : un jeton dans une URL voyage
 * dans les journaux d'arête, l'historique du navigateur et les captures d'écran — c'est
 * pourquoi il ne doit JAMAIS être journalisé ici (invariant 5).
 *
 * `segmentBorne` reste FAUX : le chemin n'est qu'un porteur, `/mcp*` est capté en entier et
 * rien n'est remonté sur un chemin de montage. Borner serait un rétrécissement sans
 * contrepartie — et si le secret contenait « / », `/mcp/a/b` l'authentifierait.
 *
 * `MCP_SHARED_SECRET_ATHENA` a été RETIRÉ de Cloudflare le 2026-09-17 : le clavardage de
 * Pallas Athéna n'existe plus depuis le 2026-09-02, et le secret n'avait donc plus d'appelant.
 */
export const PORTE: Porte = {
  mount: "/mcp",
  queryKey: "key",
  nomsSecrets: ["MCP_SHARED_SECRET"],
  segmentBorne: false,
};

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

    // `/health` annonce le COMMIT dont la version en ligne est issue (§8, §12).
    //
    // ╔══════════════════════════════════════════════════════════════════════════════╗
    // ║ POURQUOI UN POINT D'ENTRÉE PUBLIC DIT QUELLE VERSION TOURNE.                 ║
    // ║                                                                              ║
    // ║ Le déploiement est MANUEL depuis le 2026-09-16 (§12). Rien ne signale donc   ║
    // ║ qu'un commit est poussé mais pas en ligne : l'écart se tient de mémoire, et  ║
    // ║ un écart tenu de mémoire dure plus longtemps qu'on ne croit. Ce champ le     ║
    // ║ rend MESURABLE par un tiers qui n'a aucun droit sur l'infrastructure — le    ║
    // ║ contrôle de dérive compare cette valeur au dernier commit de `main`, sans    ║
    // ║ jeton, en lecture seule. C'est l'inverse exact du compromis refusé en §12 :  ║
    // ║ surveiller sans rien pouvoir écrire.                                         ║
    // ║                                                                              ║
    // ║ CE QUE CELA DIVULGUE, énoncé plutôt que passé sous silence : la version      ║
    // ║ exacte qui tourne, donc si un correctif publié est déjà en ligne. Le dépôt   ║
    // ║ est PUBLIC — tout le code l'est déjà, et la seule chose ajoutée est un       ║
    // ║ horodatage de fait. Le gain est de rendre visible une dérive silencieuse ;   ║
    // ║ la perte est de dater publiquement un retard de déploiement. L'arbitrage     ║
    // ║ penche parce que le retard, lui, existe qu'on le publie ou non.              ║
    // ║                                                                              ║
    // ║ « inconnu » est un AVEU et non un remplissage : il dit que la version en     ║
    // ║ ligne n'est pas passée par `npm run deploy`, donc qu'on ne sait PAS de quel  ║
    // ║ commit elle sort. Le contrôle refuse alors de conclure — il ne suppose pas   ║
    // ║ qu'elle est à jour. C'est la règle d'INDÉTERMINÉE de §2, appliquée au        ║
    // ║ déploiement.                                                                 ║
    // ╚══════════════════════════════════════════════════════════════════════════════╝
    if (pathname === "/health") {
      return reponseSante({ actif, commit: env.COMMIT as string | undefined });
    }

    // ── Page publique (§18) ──────────────────────────────────────────────────
    //
    // ⚠ ÉGALITÉ STRICTE, jamais `startsWith("/")` : le `nonTrouve()` final doit rester
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

    // ── Fiche de découverte SEP-2127 (`/mcp/server-card`) ─────────────────────
    //
    // Exception NOMMÉE et exacte avant la garde `/mcp*` : métadonnées publiques sans
    // secret, lisibles par tout catalogue ou client MCP avant authentification, tout en
    // respectant le coupe-circuit `MCP_ENABLED` (§8).
    if (pathname === "/mcp/server-card") {
      return actif ? repondreCarteServeur(request.method, carteServeur()) : nonTrouve();
    }

    if (pathname === "/mcp" || pathname.startsWith("/mcp/")) {
      if (!actif) return nonTrouve();

      // Défense contre le ré-attachement DNS (spécification MCP) : une origine de
      // NAVIGATEUR présente mais inconnue est refusée d'emblée. Une origine absente
      // (serveur à serveur) passe — elle n'est pas soumise à la politique de même
      // origine et ne peut donc pas être détournée de cette façon.
      const admises = originesAdmises(env.ALLOWED_ORIGINS as string | undefined);
      if (origineRefusee(request, admises)) return origineInterdite();
      const origin = origineAutorisee(request, admises);

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
      const ip = request.headers.get("CF-Connecting-IP") ?? "sans-ip";
      if (!(await debitAcceptable(env.RATE_LIMITER, ip))) return tropDeRequetes(60, origin);

      // Aucun flux SSE, aucune session à supprimer : mode JSON sans état (D3).
      if (request.method !== "POST") return methodeNonPermise(origin);

      // Aucune garde `if (!presente)` : une liste VIDE — aucun porteur présenté — produit
      // un produit cartésien vide, donc `some` faux, donc 401. Le défaut fermé vit
      // tout entier dans `apparie`, des deux côtés du produit.
      const presentes = porteursPresentes(request, url, PORTE);
      const attendus = secretsAdmis(env as unknown as Record<string, unknown>, PORTE);
      if (!(await apparie(presentes, attendus))) {
        return refuser("401", origin);
      }

      return await servirRequeteMcp(request, {
        versions: VERSIONS,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
        descripteurs: listToolDescriptors,
        appeler: (nom, args) => executerOutil(nom, args, env, ctx),
        origin,
        sertAvant2025_06_18: SERT_AVANT_2025_06_18,
        ttlListeMs: TTL_LISTE,
        surErreur: (method, error) => {
          // Journalisation SANS l'URL (§9.2) : méthode et nature de l'échec, rien d'autre.
          console.error("échec de répartition MCP", {
            method,
            error: error instanceof Error ? error.name : "inconnu",
          });
        },
      });
    }

    return nonTrouve();
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

async function executerOutil(
  nom: unknown,
  args: unknown,
  env: Env,
  ctx: ExecutionContext,
): Promise<ToolResult> {
  if (typeof nom !== "string" || !Object.hasOwn(TOOLS, nom)) {
    // Outil inconnu : c'est une erreur d'EXÉCUTION rendue au modèle, pas une faute de
    // protocole — le modèle doit pouvoir la lire et se corriger (§7, conventions).
    return err(
      `Outil inconnu : « ${String(nom).slice(0, 80)} ». Outils disponibles : ${Object.keys(TOOLS).join(", ")}.`,
    );
  }

  const objet = args ?? {};
  if (typeof objet !== "object" || objet === null || Array.isArray(objet)) {
    return err("« arguments » doit être un objet.");
  }

  const client = createClient(env);
  const debut = Date.now();
  try {
    return await callTool(nom, objet as Record<string, unknown>, { env, db: env.DB, client, ctx });
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
