/**
 * Worker « MCP Jurisprudence » — routage à double montage (`/mcp` et `/mcp/oauth`),
 * identité partagée `DB_IDENTITE`, garde stricte BYOK CanLII préalable au cache D1,
 * quotas journaliers et télémétrie sans contenu (`SPEC-SOCLE-COMMUN.md` §4–§7).
 *
 * ⚠ NE JAMAIS JOURNALISER `request.url`, une clé CanLII ni le texte d'une citation
 *   (`S13`, `S14`, `G9`, `G10`).
 */

import {
  type AnneauMaitresCoffre,
  type BinaireD1,
  type ClasseOutil,
  type CodeErreurTechnique,
  construireCarteServeur,
  construireRessourceProtegee,
  creerDepotJetonsD1,
  creerQuarantaineIpEchecs,
  type EtatEntreeCoffre,
  ecrireEvenementTechniqueD1,
  enregistrerEchecAuth,
  err,
  erreurQuotaEpuise,
  formaterEvenementTechnique,
  horodatageIsoUtc,
  type InfoClient,
  type IssueTechnique,
  incrementerCompteurJourD1,
  type JsonRpcMessage,
  type LigneCoffre,
  lireCompteursJourD1,
  lireMeta,
  methodeNonPermise,
  origineAutorisee,
  origineInterdite,
  origineRefusee,
  originesAdmises,
  ouvrirCoffre,
  ouvrirPrincipal,
  PORTEE_UNIVERSELLE,
  type Porte,
  type Principal,
  porteurEntete,
  porteursPresentes,
  preflight,
  refuser,
  repondreCarteServeur,
  repondreRessourceProtegee,
  reponseSante,
  SERVER_CARD_SCHEMA,
  servirRequeteMcp,
  type ToolResult,
  tropDeRequetes,
  validateArgs,
  verifierDebitPreAuth,
  verifierDebitTitulaire,
  verifierQuotaJour,
} from "@poirierlavoie/mcp-socle";
import { runScheduled } from "./backfill";
import { type CanliiClient, createClient } from "./canlii/client";
import { CanliiError, InterruptionGouverneError } from "./canlii/errors";
import { mcpActif } from "./config";
import {
  INSTRUCTIONS,
  listToolDescriptors,
  PUBLIC_DESCRIPTION,
  SANS_APPEL,
  SERVER_INFO,
  TOOLS,
} from "./mcp/registry";
import { pagePubliqueHtml } from "./site";

/** Versions du protocole servies. La plus élevée EN TÊTE (§8). */
export const VERSIONS = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"] as const;

export { SERVER_CARD_SCHEMA };

export const SERVICE_ID = "jurisprudence" as const;
export const ORIGINE_PORTAIL_DEFAUT = "https://acces.poirierlavoie.ca";
export const META_RESSOURCE_OAUTH_URL =
  "https://jurisprudence.poirierlavoie.ca/.well-known/oauth-protected-resource/mcp/oauth";
export const SCOPE_OAUTH = "jurisprudence les_deux";

const TTL_LISTE = 3_600_000;
const SERT_AVANT_2025_06_18 = true;
const MOTIF_OUTIL_SUR = /^[A-Za-z0-9_.:-]{1,80}$/;

let quarantaine = creerQuarantaineIpEchecs();

export function reinitialiserQuarantaineIpPourTests(): void {
  quarantaine = creerQuarantaineIpEchecs();
}

/**
 * Fiche de découverte HTTP MCP (SEP-2127) — PURE, sans accès à `env` ni à aucun secret.
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
    authDescription:
      "Jeton individuel de titulaire (« Bearer <jeton> ») + clé API CanLII personnelle au coffre (ou en-tête X-Clef-CanLII), ou OAuth 2.1 sur /mcp/oauth via acces.poirierlavoie.ca.",
  });
}

/**
 * Métadonnées RFC 9728 propres au sous-chemin `/mcp/oauth` (la racine
 * `/.well-known/oauth-protected-resource` demeure en 404 afin de préserver `/mcp`).
 */
export function ressourceProtegeeOAuth(originePortail?: string) {
  const serveur = (originePortail ?? "").trim() || ORIGINE_PORTAIL_DEFAUT;
  return construireRessourceProtegee({
    resource: "https://jurisprudence.poirierlavoie.ca/mcp/oauth",
    authorizationServers: [serveur],
    scopesSupported: [PORTEE_UNIVERSELLE, SERVICE_ID],
    resourceDocumentation: "https://jurisprudence.poirierlavoie.ca/",
  });
}

const nonTrouve = () => new Response("Not found", { status: 404 });

/**
 * Porte directe `/mcp` : jetons individuels `DB_IDENTITE` + secret partagé transitoire Phase 3a.
 * Tout refus renvoie uniformément `404` à corps vide sans `WWW-Authenticate` (`S8`, `G7`, `G23`).
 */
export const PORTE: Porte = {
  mount: "/mcp",
  queryKey: "key",
  nomsSecrets: ["MCP_SHARED_SECRET"],
  segmentBorne: false,
};

/**
 * Porte OAuth 2.1 `/mcp/oauth` : en-tête `Authorization: Bearer <jeton>` uniquement,
 * aucun secret partagé de Worker, aucun `?key=`, aucun segment `/mcp/oauth/<x>`.
 */
export const PORTE_OAUTH: Porte = {
  mount: "/mcp/oauth",
  nomsSecrets: [],
  autoriserChemin: false,
};

function pagePublique(request: Request): Response {
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; " +
      "img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": "public, max-age=600",
  };
  const html = pagePubliqueHtml();
  return request.method === "HEAD"
    ? new Response(null, { status: 200, headers })
    : new Response(html, { status: 200, headers });
}

interface LigneCoffreBruteD1 {
  titulaire_id: string;
  version: number;
  iv: BinaireD1;
  chiffre: BinaireD1;
  repere: string;
  etat: EtatEntreeCoffre;
}

const SQL_LIRE_COFFRE_CANLII = `
SELECT titulaire_id, version, iv, chiffre, repere, etat
FROM coffre_clef
WHERE titulaire_id = ?1 AND usage = 'canlii'
LIMIT 1
`.trim();

const SQL_MARQUER_CLEF_REFUSEE = `
UPDATE coffre_clef
SET etat = 'refusee', eprouve_le = ?2
WHERE titulaire_id = ?1 AND usage = 'canlii'
`.trim();

async function lireEntreeCoffreCanlii(
  dbIdentite: D1Database,
  titulaireId: string,
): Promise<LigneCoffre | null> {
  const ligne = await dbIdentite
    .prepare(SQL_LIRE_COFFRE_CANLII)
    .bind(titulaireId)
    .first<LigneCoffreBruteD1>();
  if (!ligne) return null;
  return {
    titulaireId: ligne.titulaire_id,
    version: ligne.version,
    iv: ligne.iv,
    chiffre: ligne.chiffre,
    repere: ligne.repere,
    etat: ligne.etat,
  };
}

function planifier(ctx: ExecutionContext, tache: Promise<unknown>): void {
  ctx.waitUntil(tache.catch(() => {}));
}

function enregistrerEvenementTitulaire(
  dbIdentite: D1Database,
  ctx: ExecutionContext,
  principal: Extract<Principal, { type: "titulaire" }>,
  params: {
    outil: string;
    classe: ClasseOutil;
    issue: IssueTechnique;
    code?: CodeErreurTechnique;
    ms?: number;
    sortants?: number;
    clientInfo?: InfoClient;
  },
): void {
  const outilSur = MOTIF_OUTIL_SUR.test(params.outil) ? params.outil : "outil_inconnu";
  planifier(
    ctx,
    ecrireEvenementTechniqueD1(
      dbIdentite,
      formaterEvenementTechnique({
        titulaireId: principal.titulaireId,
        jetonId: principal.jetonId,
        service: SERVICE_ID,
        outil: outilSur,
        classe: params.classe,
        issue: params.issue,
        code: params.code,
        ms: params.ms,
        sortants: params.sortants,
        clientInfo: params.clientInfo,
      }),
    ),
  );
}

function classifierResultatJuris(
  resultat: ToolResult,
  signaux: { erreurAmont: boolean; echec404: boolean; succesSortants: number },
): {
  issue: IssueTechnique;
  code?: CodeErreurTechnique;
  estErreur: boolean;
  estIntrouvable: boolean;
} {
  const texte = resultat.content[0]?.text ?? "";
  if (signaux.erreurAmont) {
    return {
      issue: "erreur_amont",
      code: "AMONT_ERREUR",
      estErreur: true,
      estIntrouvable: false,
    };
  }
  if (resultat.isError) {
    if (
      (signaux.echec404 && signaux.succesSortants === 0) ||
      /^Aucune fiche\b|^Le tribunal déduit\b/m.test(texte)
    ) {
      return {
        issue: "introuvable",
        estErreur: false,
        estIntrouvable: true,
      };
    }
    return {
      issue: "erreur_usager",
      code: "ARGUMENTS_INVALIDES",
      estErreur: true,
      estIntrouvable: false,
    };
  }
  if (
    / — INTROUVABLE$/m.test(texte) ||
    /^Aucun candidat pour «|^Aucune décision pour |^Aucun texte pour /m.test(texte)
  ) {
    return {
      issue: "introuvable",
      estErreur: false,
      estIntrouvable: true,
    };
  }
  return {
    issue: "ok",
    estErreur: false,
    estIntrouvable: false,
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const admises = originesAdmises(env.ALLOWED_ORIGINS as string | undefined);
    const origin = origineAutorisee(request, admises);

    // Page publique servie AVANT le coupe-circuit, sans en-tête CORS (G22, §18).
    if (pathname === "/") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", {
          status: 405,
          headers: { Allow: "GET, HEAD" },
        });
      }
      return pagePublique(request);
    }

    const estMetaOAuth = pathname === "/.well-known/oauth-protected-resource/mcp/oauth";
    const estMcpOAuth = pathname === "/mcp/oauth" || pathname.startsWith("/mcp/oauth/");
    const estMcpDirect = !estMcpOAuth && (pathname === "/mcp" || pathname.startsWith("/mcp/"));

    if (pathname === "/health" || estMetaOAuth || estMcpOAuth || estMcpDirect) {
      // 1. Coupe-circuit global (`MCP_ENABLED !== "true"` => 404).
      const actif = mcpActif(env);
      if (!actif) return refuser("404", origin);

      if (pathname === "/health") {
        return reponseSante({ actif: true, commit: env.COMMIT as string | undefined });
      }

      if (estMetaOAuth) {
        return repondreRessourceProtegee(
          request.method,
          ressourceProtegeeOAuth((env as { ORIGINE_PORTAIL?: string }).ORIGINE_PORTAIL),
        );
      }

      // Fiche SEP-2127 interceptée AVANT `/mcp/<secret>`.
      if (pathname === "/mcp/server-card") {
        return repondreCarteServeur(request.method, carteServeur());
      }

      // 2. Défense DNS rebinding avant authentification (G6).
      if (origineRefusee(request, admises)) return origineInterdite();

      // 3. Pré-vol CORS jamais limité en débit, autorisant `X-Clef-CanLII` (G6).
      if (request.method === "OPTIONS" && origin) {
        return preflight(origin, ["X-Clef-CanLII"]);
      }

      const porte = estMcpOAuth ? PORTE_OAUTH : PORTE;
      const refuserAcces = () =>
        estMcpOAuth
          ? refuser("401", origin, {
              resourceMetadata: META_RESSOURCE_OAUTH_URL,
              scope: SCOPE_OAUTH,
            })
          : refuser("404", origin);

      // 4. Garde de débit pré-authentification par IP + quarantaine d'échecs (G32).
      const ip = request.headers.get("CF-Connecting-IP") ?? "sans-ip";
      const candidatsJetons = porteursPresentes(request, url, porte);
      const preAuthOk = await verifierDebitPreAuth({
        ip,
        quarantaine,
        limiteurRafaleIp: env.RL_PRE_AUTH_IP,
        candidatsJetons,
      });
      if (!preAuthOk) {
        return estMcpOAuth ? tropDeRequetes(60, origin) : refuser("404", origin);
      }

      // 5. Identité (`DB_IDENTITE` jetons individuels + secret partagé transitoire sur `/mcp`).
      const depot = env.DB_IDENTITE ? creerDepotJetonsD1(env.DB_IDENTITE) : undefined;
      const autorise = await ouvrirPrincipal(
        request,
        url,
        env as unknown as Record<string, unknown>,
        porte,
        {
          depot,
          service: SERVICE_ID,
          planifierArrierePlan: (tache) => ctx.waitUntil(tache),
          surEmpreinteValide: (h) => quarantaine.marquerEmpreinteValide(h),
        },
      );
      if (!autorise) {
        await enregistrerEchecAuth({
          ip,
          quarantaine,
          limiteurEchecIp: env.RL_ECHEC_IP,
          limiteurEchecsGlobal: env.RL_ECHECS_GLOBAL,
          candidatsJetons,
        });
        return refuserAcces();
      }

      // 6. Méthode HTTP jugée APRÈS l'authentification sur `/mcp` comme sur `/mcp/oauth` (G23).
      if (request.method !== "POST") return methodeNonPermise(origin);

      // 7. Débit par titulaire (`180/min` en régime `actif`, `20/min` en régime `limite`).
      if (autorise.principal.type === "titulaire") {
        const refusDebit = await verifierDebitTitulaire({
          titulaireId: autorise.principal.titulaireId,
          etat: autorise.principal.etat,
          limiteurActif: env.RL_TITULAIRE,
          limiteurLimite: env.RL_TITULAIRE_LIMITE,
          origin,
        });
        if (refusDebit) return refusDebit;
      }

      // 8–12. Enveloppe MCP 64 Kio, quotas, garde BYOK préalable au cache et exécution.
      return await servirRequeteMcp(autorise.requete, {
        versions: VERSIONS,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
        descripteurs: listToolDescriptors,
        appeler: (nom, args, message) =>
          executerOutil(nom, args, message, autorise.requete, autorise.principal, env, ctx),
        origin,
        sertAvant2025_06_18: SERT_AVANT_2025_06_18,
        ttlListeMs: TTL_LISTE,
        surErreur: (method, error) => {
          console.error("échec de répartition MCP", {
            method,
            error: error instanceof Error ? error.name : "inconnu",
          });
        },
      });
    }

    return nonTrouve();
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduled(env));
  },
};

async function executerOutil(
  nomBrut: unknown,
  argsBruts: unknown,
  message: JsonRpcMessage | undefined,
  requete: Request,
  principal: Principal,
  env: Env,
  ctx: ExecutionContext,
): Promise<ToolResult> {
  const clientInfo = lireMeta(message?.params).clientInfo;
  const nom = typeof nomBrut === "string" ? nomBrut : "";
  const outil = Object.hasOwn(TOOLS, nom) ? TOOLS[nom] : undefined;

  if (!outil) {
    if (principal.type === "titulaire" && env.DB_IDENTITE) {
      enregistrerEvenementTitulaire(env.DB_IDENTITE, ctx, principal, {
        outil: "outil_inconnu",
        classe: "local",
        issue: "erreur_usager",
        code: "OUTIL_INCONNU",
        ms: 0,
        clientInfo,
      });
    }
    return err(
      `Outil inconnu : « ${String(nomBrut).slice(0, 80)} ». Outils disponibles : ${Object.keys(TOOLS).join(", ")}.`,
    );
  }

  const objet = argsBruts ?? {};
  if (typeof objet !== "object" || objet === null || Array.isArray(objet)) {
    if (principal.type === "titulaire" && env.DB_IDENTITE) {
      enregistrerEvenementTitulaire(env.DB_IDENTITE, ctx, principal, {
        outil: nom,
        classe: "local",
        issue: "erreur_usager",
        code: "ARGUMENTS_INVALIDES",
        ms: 0,
        clientInfo,
      });
    }
    return err("« arguments » doit être un objet.");
  }

  const args = objet as Record<string, unknown>;
  const fautes = validateArgs(outil.inputSchema, args);
  if (fautes.length > 0) {
    if (principal.type === "titulaire" && env.DB_IDENTITE) {
      enregistrerEvenementTitulaire(env.DB_IDENTITE, ctx, principal, {
        outil: nom,
        classe: "local",
        issue: "erreur_usager",
        code: "ARGUMENTS_INVALIDES",
        ms: 0,
        clientInfo,
      });
    }
    return err(`Arguments invalides pour ${nom} : ${fautes.join(" ")}`);
  }

  const estOutilHorsLigne = SANS_APPEL.has(nom);
  const estToujoursSortant =
    nom === "browse_cases" ||
    nom === "browse_legislation" ||
    nom === "get_legislation" ||
    args.refresh === true ||
    (nom === "find_case" && args.live === true);
  const estJamaisSortant = estOutilHorsLigne || (nom === "find_case" && args.live === false);

  // 8 & 10. Lecture des compteurs journaliers et contrôle de quota sur le nom d'outil du corps.
  let verdictLocal: ReturnType<typeof verifierQuotaJour> | null = null;
  let verdictSortant: ReturnType<typeof verifierQuotaJour> | null = null;

  if (principal.type === "titulaire") {
    if (!env.DB_IDENTITE) {
      return err("Service d'identité temporairement indisponible.");
    }
    let compteurs: Awaited<ReturnType<typeof lireCompteursJourD1>>;
    try {
      compteurs = await lireCompteursJourD1(env.DB_IDENTITE, principal.titulaireId);
    } catch {
      return err("Service d'identité temporairement indisponible.");
    }
    verdictLocal = verifierQuotaJour(compteurs, "local", principal.etat);
    verdictSortant = verifierQuotaJour(compteurs, "sortant", principal.etat);

    if (estToujoursSortant && !verdictSortant.autorise) {
      enregistrerEvenementTitulaire(env.DB_IDENTITE, ctx, principal, {
        outil: nom,
        classe: "sortant",
        issue: "quota",
        code: "QUOTA_EPUISE",
        ms: 0,
        clientInfo,
      });
      return erreurQuotaEpuise("sortant", verdictSortant.plafond);
    }
    if (estJamaisSortant && !verdictLocal.autorise) {
      enregistrerEvenementTitulaire(env.DB_IDENTITE, ctx, principal, {
        outil: nom,
        classe: "local",
        issue: "quota",
        code: "QUOTA_EPUISE",
        ms: 0,
        clientInfo,
      });
      return erreurQuotaEpuise("local", verdictLocal.plafond);
    }
    if (!verdictLocal.autorise && !verdictSortant.autorise) {
      enregistrerEvenementTitulaire(env.DB_IDENTITE, ctx, principal, {
        outil: nom,
        classe: "sortant",
        issue: "quota",
        code: "QUOTA_EPUISE",
        ms: 0,
        clientInfo,
      });
      return erreurQuotaEpuise("sortant", verdictSortant.plafond);
    }
  }

  // 11. Garde stricte BYOK CanLII AVANT toute lecture du cache D1 `cases`/`citator_*` (G8, G10).
  let baseClient: CanliiClient;
  let provenanceClef: "entete" | "coffre" | "transitoire" | "aucune" = "aucune";

  if (estOutilHorsLigne) {
    baseClient = createClient(env, {}, { apiKey: "" });
  } else if (principal.type === "titulaire") {
    const dbIdentite = env.DB_IDENTITE!;
    const surchargeEntete = porteurEntete(requete, "X-Clef-CanLII");
    let entree: LigneCoffre | null = null;
    if (!surchargeEntete) {
      try {
        entree = await lireEntreeCoffreCanlii(dbIdentite, principal.titulaireId);
      } catch {
        return err("Service d'identité temporairement indisponible.");
      }
    }
    const maitres: AnneauMaitresCoffre = {
      1: env.COFFRE_MAITRE_V1,
      2: env.COFFRE_MAITRE_V2,
    };
    const ouverture = await ouvrirCoffre(
      {
        titulaireId: principal.titulaireId,
        usage: "canlii",
        entree,
        maitres,
        surchargeEntete,
      },
      (clair) => createClient(env, {}, { apiKey: clair }),
    );
    if (!ouverture.ok) {
      const codeRefus: CodeErreurTechnique =
        ouverture.motif === "ABSENTE" ? "CLEF_ABSENTE" : "CLEF_REFUSEE";
      enregistrerEvenementTitulaire(dbIdentite, ctx, principal, {
        outil: nom,
        classe: "sortant",
        issue: "refus",
        code: codeRefus,
        ms: 0,
        clientInfo,
      });
      return ouverture.motif === "ABSENTE"
        ? err(
            "[CLEF_ABSENTE] Aucune clé API CanLII active n'est associée à ce compte. " +
              "Déposez votre clé personnelle dans https://acces.poirierlavoie.ca/moi " +
              "(ou transmettez l'en-tête X-Clef-CanLII).",
          )
        : err(
            "[CLEF_REFUSEE] La clé API CanLII enregistrée pour ce compte a été refusée ou est invalide. " +
              "Mettez votre clé à jour dans https://acces.poirierlavoie.ca/moi.",
          );
    }
    baseClient = ouverture.client;
    provenanceClef = ouverture.provenance;
  } else {
    // Phase 3a coexistence sur `/mcp` pour `secret_partage` uniquement (zéro retombée pour `titulaire`).
    const surchargeEntete = porteurEntete(requete, "X-Clef-CanLII");
    const clefTransitoire = surchargeEntete ?? (env.CANLII_API_KEY ?? "").trim();
    if (!clefTransitoire) {
      return err("[CLEF_ABSENTE] Aucune clé API CanLII n'est configurée pour cet appel.");
    }
    baseClient = createClient(env, {}, { apiKey: clefTransitoire });
    provenanceClef = "transitoire";
  }

  const peutSortir = principal.type !== "titulaire" || Boolean(verdictSortant?.autorise);
  let erreurAmont = false;
  let echec404 = false;
  let succesSortants = 0;

  const client: CanliiClient = {
    async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
      if (!peutSortir) {
        throw new InterruptionGouverneError("QUOTA_SORTANT_EPUISE");
      }
      try {
        const reponse = await baseClient.get<T>(path, params);
        succesSortants += 1;
        return reponse;
      } catch (e) {
        if (e instanceof CanliiError) {
          if (e.status === 401 || e.status === 403) {
            if (principal.type === "titulaire") {
              throw new InterruptionGouverneError("CLEF_REFUSEE_AMONT");
            }
            erreurAmont = true;
          } else if (e.status === 404) {
            echec404 = true;
          } else {
            erreurAmont = true;
          }
        } else {
          erreurAmont = true;
        }
        throw e;
      }
    },
    callsMade: () => baseClient.callsMade(),
    remaining: () => baseClient.remaining(),
    usage: () => baseClient.usage(),
  };

  // 12. Exécution de l'outil, révocation dynamique sur 401/403 et comptabilisation exacte local vs sortant.
  const debut = Date.now();
  try {
    const resultat = await outil.handler(args, { env, db: env.DB, client, ctx });
    const ms = Date.now() - debut;
    const sortants = baseClient.callsMade();

    if (principal.type === "titulaire" && env.DB_IDENTITE) {
      const dbIdentite = env.DB_IDENTITE;

      if (sortants === 0 && verdictLocal && !verdictLocal.autorise) {
        enregistrerEvenementTitulaire(dbIdentite, ctx, principal, {
          outil: nom,
          classe: "local",
          issue: "quota",
          code: "QUOTA_EPUISE",
          ms,
          sortants: 0,
          clientInfo,
        });
        return erreurQuotaEpuise("local", verdictLocal.plafond);
      }

      const classeEffective: ClasseOutil = sortants > 0 ? "sortant" : "local";
      const bilan = classifierResultatJuris(resultat, {
        erreurAmont,
        echec404,
        succesSortants,
      });
      const evt = formaterEvenementTechnique({
        titulaireId: principal.titulaireId,
        jetonId: principal.jetonId,
        service: SERVICE_ID,
        outil: nom,
        classe: classeEffective,
        issue: bilan.issue,
        code: bilan.code,
        ms,
        sortants,
        clientInfo,
      });
      planifier(
        ctx,
        Promise.all([
          incrementerCompteurJourD1(dbIdentite, {
            titulaireId: principal.titulaireId,
            classe: classeEffective,
            estErreur: bilan.estErreur,
            estIntrouvable: bilan.estIntrouvable,
            sortants,
          }),
          ecrireEvenementTechniqueD1(dbIdentite, evt),
        ]),
      );
    }

    return resultat;
  } catch (e) {
    const ms = Date.now() - debut;
    const sortants = baseClient.callsMade();
    if (
      e instanceof InterruptionGouverneError &&
      principal.type === "titulaire" &&
      env.DB_IDENTITE
    ) {
      const dbIdentite = env.DB_IDENTITE;
      if (e.motif === "QUOTA_SORTANT_EPUISE" && verdictSortant && !verdictSortant.autorise) {
        enregistrerEvenementTitulaire(dbIdentite, ctx, principal, {
          outil: nom,
          classe: "sortant",
          issue: "quota",
          code: "QUOTA_EPUISE",
          ms,
          sortants: 0,
          clientInfo,
        });
        return erreurQuotaEpuise("sortant", verdictSortant.plafond);
      }
      if (e.motif === "CLEF_REFUSEE_AMONT") {
        if (provenanceClef === "coffre") {
          planifier(
            ctx,
            dbIdentite
              .prepare(SQL_MARQUER_CLEF_REFUSEE)
              .bind(principal.titulaireId, horodatageIsoUtc())
              .run(),
          );
        }
        const evtRefus = formaterEvenementTechnique({
          titulaireId: principal.titulaireId,
          jetonId: principal.jetonId,
          service: SERVICE_ID,
          outil: nom,
          classe: "sortant",
          issue: "refus",
          code: "CLEF_REFUSEE",
          ms,
          sortants,
          clientInfo,
        });
        planifier(
          ctx,
          Promise.all([
            incrementerCompteurJourD1(dbIdentite, {
              titulaireId: principal.titulaireId,
              classe: "sortant",
              estErreur: true,
              sortants,
            }),
            ecrireEvenementTechniqueD1(dbIdentite, evtRefus),
          ]),
        );
        return provenanceClef === "coffre"
          ? err(
              "[CLEF_REFUSEE] CanLII a refusé la clé API enregistrée au coffre (HTTP 401/403). " +
                "Mettez votre clé à jour dans https://acces.poirierlavoie.ca/moi.",
            )
          : err(
              "[CLEF_REFUSEE] CanLII a refusé la clé API transmise dans l'en-tête X-Clef-CanLII (HTTP 401/403). " +
                "Vérifiez cet en-tête ou gérez votre clé dans https://acces.poirierlavoie.ca/moi.",
            );
      }
    }
    if (principal.type === "titulaire" && env.DB_IDENTITE) {
      enregistrerEvenementTitulaire(env.DB_IDENTITE, ctx, principal, {
        outil: nom,
        classe: sortants > 0 ? "sortant" : "local",
        issue: "refus",
        code: "ERREUR_INTERNE",
        ms,
        sortants,
        clientInfo,
      });
    }
    console.error("échec d'exécution d'outil", {
      tool: nom,
      ms,
      error: e instanceof Error ? e.name : "inconnu",
    });
    return err(
      "L'outil a échoué pour une raison interne. Réessayer ; si l'échec persiste, le signaler.",
    );
  }
}
