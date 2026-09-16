/**
 * Registre des treize outils (spécification §7 et §17).
 *
 * ⚠ LES DESCRIPTIONS SONT REPRISES VERBATIM DE §7 ET NE DOIVENT PAS ÊTRE
 *   REFORMULÉES. Elles portent elles-mêmes leurs mises en garde : c'est le second
 *   canal de fiabilité, après le corps des réponses. Le motif est celui de
 *   `GARDE_FOU` dans le Worker `legislation` — une description d'outil est une
 *   surface de contrat, pas de la prose.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ DEUX FAMILLES DE PRÉFIXES, ET LA FRONTIÈRE EST SÉMANTIQUE (D8, §17).          ║
 * ║                                                                              ║
 * ║   `canlii_*`            la réponse vient de la COLLECTION DE CANLII, et sa    ║
 * ║   (10 outils)           couverture comme ses verdicts en dépendent.          ║
 * ║                                                                              ║
 * ║   `greffe_*` `palais_*` la réponse vient d'un RELEVÉ LOCAL du ministère de    ║
 * ║   (3 outils)            la Justice du Québec, daté, sans aucun appel.        ║
 * ║                                                                              ║
 * ║ Préfixer les seconds en `canlii_` attribuerait à CanLII une adresse de palais ║
 * ║ dont il n'est pas la source. La scission est VÉRIFIÉE par test/rpc.test.ts :  ║
 * ║ elle ne tient pas qu'à cette note.                                           ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Conventions communes appliquées sans exception :
 *   - nom d'outil en anglais, description ET sortie en français ;
 *   - `annotations: { readOnlyHint: true, openWorldHint: true }` sur TOUS les outils
 *     (openWorld : la source de vérité est distante et évolue) ;
 *   - `additionalProperties: false` sur tous les schémas ;
 *   - tout `lang` : enum ["fr","en"], défaut "fr" ;
 *   - erreur d'exécution => `isError: true` en français, JAMAIS une erreur JSON-RPC.
 */

import type { CanliiClient } from "../canlii/client";
import { browseCases } from "./handlers/browseCases";
import { browseLegislation } from "./handlers/browseLegislation";
import { citator } from "./handlers/citator";
import { findCase } from "./handlers/findCase";
import { getCase } from "./handlers/getCase";
import { getLegislation } from "./handlers/getLegislation";
import { listDatabasesTool } from "./handlers/listDatabases";
import { palaisGetTool } from "./handlers/palaisGet";
import { palaisListTool } from "./handlers/palaisList";
import { parseCitationTool } from "./handlers/parseCitation";
import { parseCourtFileTool } from "./handlers/parseCourtFile";
import { subsequentHistory } from "./handlers/subsequentHistory";
import { verifyCitations } from "./handlers/verifyCitations";
import { err, type ToolResult } from "./rpc";
import { type JsonSchema, validateArgs } from "./validate";

export interface ToolContext {
  env: Env;
  db: D1Database;
  client: CanliiClient;
  ctx: ExecutionContext;
  /** Injectable pour les tests ; `new Date()` en production. */
  now?: Date;
}

export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;

export interface ToolDescriptor {
  /**
   * Libellé lisible, distinct de `name` (MCP 2025-06-18).
   *
   * C'est ce que le praticien lit dans l'invite d'AUTORISATION, au moment précis
   * où il décide de laisser l'outil s'exécuter. « Sorts ultérieurs — indice
   * heuristique » y est plus utile que `canlii_subsequent_history`, et la réserve
   * portée par le titre se lit AVANT l'appel plutôt qu'après.
   *
   * Un client qui ignore ce champ retombe sur `name` : rien ne casse.
   */
  title: string;
  description: string;
  inputSchema: JsonSchema;
  handler: ToolHandler;
}

const READONLY = { readOnlyHint: true, openWorldHint: true } as const;

const LANG: JsonSchema = {
  type: "string",
  enum: ["fr", "en"],
  description: "Langue de la collection interrogée : « fr » (défaut) ou « en ».",
};

const REFRESH: JsonSchema = {
  type: "boolean",
  description: "Forcer un appel à CanLII plutôt que de servir la fiche en cache.",
};

const DATE: JsonSchema = {
  type: "string",
  maxLength: 10,
  description: "Date au format AAAA-MM-JJ. Borne INCLUSIVE.",
};

export const SERVER_INFO = {
  // `name` est un IDENTIFIANT, pas un libellé : il ne change pas avec le titre. Le
  // renommer n'apporterait rien et romprait un point d'appui (test/rpc.test.ts).
  name: "jurisprudence-canlii",
  title: "Jurisprudence canadienne et greffes du Québec",
  version: "0.2.0",
};

/** Orientation rendue à l'initialisation. Elle porte, elle aussi, le contrat de §2. */
export const INSTRUCTIONS =
  "Connecteur de VÉRIFICATION DE RÉFÉRENCES adossé à la collection de CanLII. " +
  "L'API de CanLII ne rend que des MÉTADONNÉES : jamais le texte d'une décision, et " +
  "aucune recherche par mots du texte n'est possible. Ce connecteur établit " +
  "l'EXISTENCE et l'IDENTITÉ d'une décision ; il n'établit NI son autorité actuelle " +
  "(aucun historique d'appel, aucun indicateur de traitement, aucun pourvoi pendant), " +
  "NI le contenu de son dispositif. Pour éprouver des citations tirées de la doctrine, " +
  "d'un moteur de recherche ou d'un texte rédigé par une IA, commencer par " +
  "canlii_verify_citations ; si la citation n'est pas constructible (recueils R.C.S. / " +
  "R.J.Q. / C.A., identifiants J.E. / REJB / EYB / AZ), enchaîner avec canlii_find_case. " +
  "Pour le TEXTE des lois et règlements du Québec, employer le connecteur « Législation " +
  "du Québec ». Les verdicts et la couverture dépendent de la collection de CanLII : " +
  "une absence n'est jamais une preuve d'inexistence. " +
  // §17 — la frontière des sources, énoncée au modèle AVANT tout appel : sans elle,
  // il attribuerait à CanLII une adresse de palais, ou chercherait dans CanLII un
  // numéro de greffe. Les deux erreurs sont silencieuses.
  "DEUX SOURCES DISTINCTES coexistent ici. Les outils canlii_* interrogent CanLII. Les " +
  "outils greffe_* et palais_* lisent des TABLES LOCALES relevées auprès du ministère de " +
  "la Justice du Québec le 2026-07-15 : ils ne font aucun appel, ne consultent aucun " +
  "registre de dossiers ni plumitif, et n'établissent donc PAS qu'un dossier existe. " +
  "greffe_parse_court_file_number lit un numéro de dossier québécois (500-05-123456-241) " +
  "et en tire le greffe, le district judiciaire, le tribunal et la compétence ; palais_list " +
  "et palais_get donnent les palais de justice et leur adresse. Ces adresses vieillissent " +
  "et ne portent aucune coordonnée téléphonique : les vérifier auprès du Ministère avant " +
  "toute signification ou tout dépôt.";

export const TOOLS: Record<string, ToolDescriptor> = {
  // ── 7.1 — l'outil pivot ────────────────────────────────────────────────────
  canlii_verify_citations: {
    title: "Vérifier des citations",
    description:
      "Vérifie une ou plusieurs citations de jurisprudence contre la collection de CanLII. " +
      "Pour chacune : un verdict (CONFIRMÉE, DISCORDANTE, INTROUVABLE, NON CONSTRUCTIBLE, " +
      "ILLISIBLE), la fiche officielle (intitulé, citation, date, n° de dossier, hyperlien) " +
      "et, s'il y a lieu, l'écart avec l'intitulé attendu. Établit l'EXISTENCE et l'IDENTITÉ " +
      "d'une décision ; n'établit NI son autorité actuelle (aucun historique d'appel, aucun " +
      "indicateur de traitement), NI le contenu de son dispositif. Outil de choix pour " +
      "éprouver des références tirées de la doctrine, d'un moteur de recherche ou d'un texte " +
      "rédigé par une IA. Les citations de recueils (R.C.S., R.J.Q., C.A.) et les identifiants " +
      "d'éditeurs (J.E., REJB, EYB, AZ) ne sont pas résolubles directement : enchaîner avec " +
      "canlii_find_case.",
    inputSchema: {
      type: "object",
      properties: {
        citations: {
          type: "array",
          minItems: 1,
          maxItems: 25,
          description: "Les citations à éprouver, au plus 25 par appel.",
          items: {
            type: "object",
            properties: {
              citation: {
                type: "string",
                maxLength: 400,
                description:
                  "La citation telle qu'elle a été rencontrée. Une citation doctrinale " +
                  "complète est acceptée : l'analyseur y trouve la forme constructible.",
              },
              expected_title: {
                type: "string",
                maxLength: 300,
                description: "Intitulé annoncé par la source, s'il est connu.",
              },
              expected_year: {
                type: "integer",
                minimum: 1800,
                maximum: 2100,
                description: "Année annoncée par la source, si elle est connue.",
              },
            },
            required: ["citation"],
            additionalProperties: false,
          },
        },
        lang: LANG,
        refresh: REFRESH,
      },
      required: ["citations"],
      additionalProperties: false,
    },
    handler: verifyCitations,
  },

  // ── 7.2 ────────────────────────────────────────────────────────────────────
  canlii_find_case: {
    title: "Retrouver une décision par les parties",
    description:
      "Recherche une décision par les noms des parties ou un fragment d'intitulé, avec " +
      "tribunal et bornes de date facultatifs. Sert de rattrapage lorsque la citation n'est " +
      "pas constructible (recueils, SOQUIJ) ou lorsqu'on ne connaît que les parties et " +
      "l'année. Interroge d'abord l'index local, puis balaie la base de CanLII sur la fenêtre " +
      "demandée. La recherche porte sur l'INTITULÉ et les mots-clés uniquement — l'API de " +
      "CanLII n'expose pas le texte des décisions et ne permet aucune recherche par mots du " +
      "texte.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          minLength: 2,
          maxLength: 200,
          description: "Noms des parties ou fragment d'intitulé.",
        },
        database_id: {
          type: "string",
          maxLength: 20,
          description: "Tribunal ciblé, p. ex. « qcca ». Voir canlii_list_databases.",
        },
        year_from: { type: "integer", minimum: 1800, maximum: 2100 },
        year_to: { type: "integer", minimum: 1800, maximum: 2100 },
        lang: LANG,
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 25,
          description: "Nombre de candidats rendus (défaut 10, maximum 25).",
        },
        live: {
          type: "boolean",
          description:
            "Balayer CanLII en plus de l'index local. Défaut : vrai lorsque l'index rend " +
            "moins de trois candidats.",
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
    handler: findCase,
  },

  // ── 7.3 ────────────────────────────────────────────────────────────────────
  canlii_get_case: {
    title: "Fiche d'une décision",
    description:
      "Fiche CanLII d'une décision : intitulé, citation, date, numéro de dossier de cour, " +
      "mots-clés et hyperlien canlii.ca. Accepte soit une citation (« 2020 QCCA 495 »), soit " +
      "le couple database_id + case_id. Ne renvoie PAS le texte de la décision : suivre " +
      "l'hyperlien.",
    inputSchema: {
      type: "object",
      properties: {
        citation: { type: "string", maxLength: 400 },
        database_id: { type: "string", maxLength: 20 },
        case_id: { type: "string", maxLength: 60 },
        lang: LANG,
        refresh: REFRESH,
      },
      additionalProperties: false,
    },
    handler: getCase,
  },

  // ── 7.4 ────────────────────────────────────────────────────────────────────
  canlii_citator: {
    title: "Citateur — listes brutes",
    description:
      "Citateur, sur la collection de CanLII : décisions citées PAR une décision (`cited`), " +
      "décisions qui LA citent (`citing`), ou dispositions législatives qu'elle cite " +
      "(`legislation`). Les listes sont brutes : elles n'indiquent aucun sens de traitement " +
      "(suivi, distingué, infirmé), et leur exhaustivité est celle de la collection de " +
      "CanLII. Pour les dispositions québécoises, enchaîner avec le connecteur " +
      "« Législation du Québec » afin d'en lire le texte officiel.",
    // Aucun paramètre `lang` : le chemin du citateur n'accepte que `en` (annexe B).
    // En exposer un serait mensonger.
    inputSchema: {
      type: "object",
      properties: {
        citation: { type: "string", maxLength: 400 },
        database_id: { type: "string", maxLength: 20 },
        case_id: { type: "string", maxLength: 60 },
        rel: {
          type: "string",
          enum: ["cited", "citing", "legislation"],
          description:
            "« cited » : ce que la décision cite. « citing » : ce qui la cite. " +
            "« legislation » : les dispositions qu'elle cite.",
        },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        offset: { type: "integer", minimum: 0, maximum: 100000 },
        refresh: REFRESH,
      },
      required: ["rel"],
      additionalProperties: false,
    },
    handler: citator,
  },

  // ── 7.5 ────────────────────────────────────────────────────────────────────
  canlii_subsequent_history: {
    title: "Sorts ultérieurs — indice heuristique",
    description:
      "Indice heuristique de sorts ultérieurs : parmi les décisions DE LA COLLECTION DE " +
      "CANLII qui citent la décision de départ, retient celles qui émanent d'une " +
      "juridiction supérieure et dont l'intitulé " +
      "ressemble au sien. NE REMPLACE PAS un citateur professionnel : n'indique pas si la " +
      "décision a été infirmée, confirmée ou distinguée, et ne détecte ni les pourvois " +
      "pendants, ni les refus de permission d'appeler, ni les désistements. À vérifier " +
      "systématiquement à la source.",
    inputSchema: {
      type: "object",
      properties: {
        citation: { type: "string", maxLength: 400 },
        database_id: { type: "string", maxLength: 20 },
        case_id: { type: "string", maxLength: 60 },
        limit: { type: "integer", minimum: 1, maximum: 50 },
        refresh: REFRESH,
      },
      additionalProperties: false,
    },
    handler: subsequentHistory,
  },

  // ── 7.6 ────────────────────────────────────────────────────────────────────
  canlii_browse_cases: {
    title: "Décisions d'un tribunal",
    description:
      "Liste les décisions d'un tribunal, les plus récemment diffusées en tête, avec filtres " +
      "de date : date de la décision (`decision_date_*`), date de diffusion sur CanLII " +
      "(`published_*`) ou date de dernière modification (`modified_*`, `changed_*`). Utile " +
      "pour la veille et pour cerner la couverture de CanLII pour un tribunal donné.",
    inputSchema: {
      type: "object",
      properties: {
        database_id: { type: "string", maxLength: 20 },
        lang: LANG,
        offset: { type: "integer", minimum: 0, maximum: 100000 },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description:
            "Nombre de fiches rendues (défaut 25, maximum 100). Bien en deçà du maximum de " +
            "10 000 de l'API : au-delà, la sortie est inexploitable par un modèle.",
        },
        decision_date_after: DATE,
        decision_date_before: DATE,
        published_after: DATE,
        published_before: DATE,
        modified_after: DATE,
        modified_before: DATE,
        changed_after: DATE,
        changed_before: DATE,
      },
      required: ["database_id"],
      additionalProperties: false,
    },
    handler: browseCases,
  },

  // ── 7.7 ────────────────────────────────────────────────────────────────────
  canlii_list_databases: {
    title: "Répertoire des tribunaux et corpus",
    description:
      "Répertoire des bases de CanLII : cours et tribunaux (`kind='case'`) ou corpus " +
      "législatifs (`kind='legislation'`), avec leur databaseId et leur ressort. Point de " +
      "départ de toute commande exigeant un database_id.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["case", "legislation"] },
        jurisdiction: {
          type: "string",
          maxLength: 10,
          description: "Ressort : « qc », « ca », « on »…",
        },
        query: { type: "string", maxLength: 100, description: "Filtre sur le nom du tribunal." },
        lang: LANG,
        refresh: REFRESH,
      },
      additionalProperties: false,
    },
    handler: listDatabasesTool,
  },

  // ── 7.8 ────────────────────────────────────────────────────────────────────
  canlii_browse_legislation: {
    title: "Lois et règlements d'un corpus",
    description:
      "Liste les lois ou règlements d'une base législative DE CANLII (p. ex. « qcs » pour " +
      "les lois du Québec), avec leur legislationId, leur citation et leur type.",
    inputSchema: {
      type: "object",
      properties: {
        database_id: { type: "string", maxLength: 20 },
        lang: LANG,
        query: { type: "string", maxLength: 100, description: "Filtre sur le titre." },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        offset: { type: "integer", minimum: 0, maximum: 100000 },
      },
      required: ["database_id"],
      additionalProperties: false,
    },
    handler: browseLegislation,
  },

  // ── 7.9 ────────────────────────────────────────────────────────────────────
  canlii_get_legislation: {
    title: "Fiche d'une loi ou d'un règlement",
    description:
      "Fiche CanLII d'une loi ou d'un règlement : citation, type, régime de dates (entrée en " +
      "vigueur), dates de début et de fin, indicateur d'abrogation et découpage en parties. " +
      "Utile pour dater une disposition ou vérifier une abrogation. Pour le TEXTE d'une loi " +
      "ou d'un règlement du Québec, utiliser le connecteur « Législation du Québec », qui " +
      "rend le texte officiel verbatim.",
    inputSchema: {
      type: "object",
      properties: {
        database_id: { type: "string", maxLength: 20 },
        legislation_id: { type: "string", maxLength: 60 },
        lang: LANG,
      },
      required: ["database_id", "legislation_id"],
      additionalProperties: false,
    },
    handler: getLegislation,
  },

  // ── 7.10 ───────────────────────────────────────────────────────────────────
  canlii_parse_citation: {
    title: "Analyser une citation (hors ligne)",
    description:
      "Analyse une citation sans appeler CanLII : indique la forme reconnue (citation neutre, " +
      "citation attribuée par CanLII, recueil, identifiant d'éditeur), et, si elle est " +
      "constructible, le database_id et le case_id qui en découlent. Outil de diagnostic ; " +
      "pour vérifier réellement l'existence d'une décision, utiliser canlii_verify_citations.",
    inputSchema: {
      type: "object",
      properties: {
        citation: { type: "string", minLength: 1, maxLength: 400 },
      },
      required: ["citation"],
      additionalProperties: false,
    },
    handler: parseCitationTool,
  },

  // ══ §17 — greffes et palais du Québec. HORS CANLII : relevé local, aucun appel. ══

  // ── 17.2 ───────────────────────────────────────────────────────────────────
  greffe_parse_court_file_number: {
    title: "Numéro de dossier de cour du Québec (hors ligne)",
    description:
      "Analyse un numéro de dossier de cour du Québec (NNN-NN-NNNNNN-NNN) et en tire le greffe " +
      "— palais de justice et district judiciaire — puis la juridiction : tribunal, compétence, " +
      "type de greffe. Un préfixe alphabétique (TAL, TAQ, C.F.…) désigne un tribunal administratif " +
      "ou une cour fédérale, qui numérotent leurs dossiers eux-mêmes. Données de référence LOCALES, " +
      "relevées auprès du ministère de la Justice du Québec : cet outil n'interroge ni CanLII ni " +
      "aucun registre, et n'établit donc PAS que le dossier existe ou qu'il est actif. Les positions " +
      "7 et suivantes ne sont pas analysées ; aucune somme de contrôle n'est vérifiée.",
    inputSchema: {
      type: "object",
      properties: {
        court_file_number: {
          type: "string",
          minLength: 1,
          maxLength: 40,
          description: "Le numéro brut, p. ex. « 500-05-123456-241 » ou « TAL-594531 ».",
        },
      },
      required: ["court_file_number"],
      additionalProperties: false,
    },
    handler: parseCourtFileTool,
  },

  // ── 17.3 ───────────────────────────────────────────────────────────────────
  palais_list: {
    title: "Palais de justice du Québec — répertoire",
    description:
      "Répertorie les palais de justice et points de service de justice du Québec, avec leur " +
      "adresse municipale, les numéros de greffe qui y siègent et leur district judiciaire. " +
      "Filtrable par district, par type de lieu ou par texte libre (nom, ville, numéro de greffe). " +
      "Relevé auprès du ministère de la Justice du Québec le 2026-07-15 : les adresses DÉMÉNAGENT, " +
      "et ce connecteur ne porte aucune coordonnée téléphonique ni courriel. Vérifier la liste " +
      "officielle du Ministère avant toute signification ou tout dépôt.",
    inputSchema: {
      type: "object",
      properties: {
        district: {
          type: "string",
          maxLength: 60,
          description: "District judiciaire, p. ex. « Montréal ». Les diacritiques sont pliés.",
        },
        query: {
          type: "string",
          maxLength: 60,
          description: "Texte libre : nom du palais, ville ou numéro de greffe.",
        },
        type: {
          type: "string",
          enum: ["palais", "point_de_service"],
          description:
            "« palais » (43) ou « point_de_service » (8, au sens du MJQ — à ne pas confondre " +
            "avec les greffes de cour itinérante).",
        },
      },
      additionalProperties: false,
    },
    handler: palaisListTool,
  },

  // ── 17.4 ───────────────────────────────────────────────────────────────────
  palais_get: {
    title: "Palais de justice du Québec — fiche",
    description:
      "Fiche d'un lieu de justice du Québec, par numéro de greffe (3 chiffres) OU par nom de " +
      "palais : adresse municipale, adresse postale distincte le cas échéant, greffes qui y " +
      "siègent, district judiciaire et, pour une cour itinérante, les localités desservies. " +
      "Relevé LOCAL auprès du ministère de la Justice du Québec, sans appel sortant. Six greffes " +
      "n'ont aucune adresse publiée : l'outil le dit sans jamais affirmer qu'il n'en existe pas. " +
      "Aucune coordonnée téléphonique ni courriel n'est portée par ce connecteur.",
    inputSchema: {
      type: "object",
      properties: {
        greffe_number: {
          type: "string",
          maxLength: 3,
          description: "Numéro de greffe à 3 chiffres, p. ex. « 500 ».",
        },
        palais: {
          type: "string",
          maxLength: 60,
          description: "Nom ou clef du palais, p. ex. « Montréal » ou « saint-jerome ».",
        },
      },
      additionalProperties: false,
    },
    handler: palaisGetTool,
  },
};

/** Descripteurs rendus à `tools/list`. */
export function listToolDescriptors(): Array<Record<string, unknown>> {
  return Object.entries(TOOLS).map(([name, t]) => ({
    name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: { ...READONLY },
  }));
}

/**
 * Valide puis exécute un outil.
 *
 * ⚠ Un échec de validation est un RÉSULTAT `isError: true`, pas une erreur JSON-RPC
 *   (§8). Cela DIVERGE d'Athéna, qui lève INVALID_PARAMS. La spécification prime : le
 *   modèle doit pouvoir lire l'erreur et corriger son appel.
 */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const outil = TOOLS[name];
  if (!outil) return err(`Outil inconnu : « ${name} ».`);
  const erreurs = validateArgs(outil.inputSchema, args);
  if (erreurs.length > 0) {
    return err(`Arguments invalides pour ${name} : ${erreurs.join(" ")}`);
  }
  return await outil.handler(args, ctx);
}
