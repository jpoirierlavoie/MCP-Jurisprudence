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
 * ║ DEUX FAMILLES DE PRÉFIXES, ET LA FRONTIÈRE RESTE SÉMANTIQUE (D8, amendée le  ║
 * ║ 2026-09-16 ; §17).                                                           ║
 * ║                                                                              ║
 * ║   `jurisprudence_*`     la réponse vient de la COLLECTION DE CANLII, et sa   ║
 * ║   (10 outils)           couverture comme ses verdicts en dépendent.          ║
 * ║                                                                              ║
 * ║   `greffe_*` `palais_*` la réponse vient d'un RELEVÉ LOCAL du ministère de   ║
 * ║   (3 outils)            la Justice du Québec, daté, sans aucun appel.        ║
 * ║                                                                              ║
 * ║ CE QUI A CHANGÉ, ET CE QUI NE CHANGE PAS. Le préfixe s'appelait `canlii_` et ║
 * ║ portait à lui seul l'annonce de la source. Il ne la porte plus : un préfixe  ║
 * ║ ne peut de toute façon pas porter une RÉSERVE — il ne dit ni la couverture   ║
 * ║ bornée, ni qu'une absence n'est pas une inexistence, ni que l'API ne rend que║
 * ║ des métadonnées. Il en donnait seulement l'illusion. L'annonce vit désormais ║
 * ║ dans la DESCRIPTION de chacun des dix, dans `INSTRUCTIONS` et sur la page —  ║
 * ║ trois surfaces qui sont des PHRASES, et que des tests épinglent (« chaque    ║
 * ║ description NOMME sa source », dans les deux langues).                       ║
 * ║                                                                              ║
 * ║ Le préfixe ne fait plus que PARTITIONNER. Cette partition, elle, reste       ║
 * ║ load-bearing et vérifiée par test/rpc.test.ts : servir une adresse de palais ║
 * ║ dans la même famille qu'une réponse de CanLII resterait une attribution      ║
 * ║ fausse. Ajouter un outil oblige donc encore à choisir sa famille.            ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Conventions communes appliquées sans exception :
 *   - nom d'outil en anglais, description ET sortie en français ;
 *   - `readOnlyHint: true` sur TOUS les outils : aucun n'écrit hors de son cache ;
 *   - `openWorldHint` N'EST PAS uniforme — vrai pour les NEUF qui interrogent CanLII
 *     (source de vérité distante), faux pour les QUATRE qui ne font aucun appel. Ce
 *     cartouche a affirmé l'uniformité jusqu'au 2026-09-16, soixante lignes au-dessus
 *     du code qui fait l'inverse : un contributeur lisant « les conventions » posait
 *     `true` d'office. Voir `DISTANT`/`LOCAL` et `SANS_APPEL` plus bas ;
 *   - tout paramètre déclaré porte une `description` ;
 *   - `additionalProperties: false` sur tous les schémas ;
 *   - tout `lang` : enum ["fr","en"], défaut "fr" ;
 *   - erreur d'exécution => `isError: true` en français, JAMAIS une erreur JSON-RPC.
 *   - ⚠ ET LA FRONTIÈRE DE `isError`, qui n'était écrite nulle part : il vaut `true`
 *     quand l'outil n'a RIEN à livrer — argument refusé, forme d'appel invalide, appel
 *     sortant échoué sans repli. Il vaut `false` dès qu'un résultat part, **même vide,
 *     même partiel, même dégradé** : une liste vide est une réponse, pas une panne, et
 *     la réserve voyage alors dans le corps. La distinction est celle qu'un client lit
 *     pour décider s'il RÉESSAIE. Elle était incohérente jusqu'au 2026-09-16 —
 *     `palais_list` rendait `isError: true` sur une liste vide là où
 *     `browse_cases` rendait `false` dans la même situation.
 */

import type { CanliiClient } from "../canlii/client";
import { LIMITES, OFFSET_DEFAUT, OFFSET_MAX } from "./defauts";
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
   * heuristique » y est plus utile que `jurisprudence_subsequent_history`, et la réserve
   * portée par le titre se lit AVANT l'appel plutôt qu'après.
   *
   * Un client qui ignore ce champ retombe sur `name` : rien ne casse.
   */
  title: string;
  description: string;
  inputSchema: JsonSchema;
  handler: ToolHandler;
}

/**
 * Annotations MCP. `readOnlyHint` vaut vrai partout — aucun outil n'écrit.
 *
 * ⚠ `openWorldHint` N'EST PAS UNIFORME, et c'est le point (corrigé le 2026-09-16).
 *   Il annonce que la source de vérité est DISTANTE et peut changer sous les pieds de
 *   l'appelant. C'est vrai des neuf outils qui interrogent CanLII. Ce l'est FAUX des
 *   quatre qui n'appellent rien : `jurisprudence_parse_citation` lit un analyseur pur
 *   et le répertoire local, et les trois outils du Québec lisent des tables compilées
 *   dans le Worker. Leur réponse ne dépend d'aucun tiers : à version déployée égale,
 *   la même entrée rend la même sortie.
 *
 *   Le dire compte pour un client par programme : `openWorldHint: false` l'autorise à
 *   mettre en cache, à rejouer, et à ne pas prévoir de reprise sur panne réseau — trois
 *   choses que l'annotation uniforme lui interdisait sans raison. L'inverse serait plus
 *   grave : annoncer « monde fermé » sur un outil qui appelle CanLII ferait croire à une
 *   réponse stable là où la couverture évolue.
 */
const DISTANT = { readOnlyHint: true, openWorldHint: true } as const;
const LOCAL = { readOnlyHint: true, openWorldHint: false } as const;

/** Les quatre outils dont la réponse ne dépend d'aucun appel sortant. */
const SANS_APPEL = new Set([
  "jurisprudence_parse_citation",
  "greffe_parse_court_file_number",
  "palais_list",
  "palais_get",
]);

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
  minLength: 10,
  maxLength: 10,
  description:
    "Date au format AAAA-MM-JJ, p. ex. « 2020-03-31 ». Borne INCLUSIVE. ⚠ Le format est " +
    "imposé par l'outil et non par le schéma — le validateur ne connaît pas « pattern » — " +
    "donc « 2020-3-1 » ou « 31/03/2020 » passent le schéma et sont refusés ensuite.",
};

/**
 * Les identifiants qui reviennent d'un outil à l'autre, décrits UNE fois.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ CES DESCRIPTIONS SONT LA SEULE DOCUMENTATION D'UN CLIENT PAR PROGRAMME.       ║
 * ║                                                                              ║
 * ║ Un humain devine « database_id » d'après le contexte ; un programme, non — il ║
 * ║ ne dispose que de `tools/list`. Vingt-et-un paramètres n'en portaient aucune  ║
 * ║ au 2026-09-16, dont SIX des sept `database_id` : construire un appel valide   ║
 * ║ exigeait de deviner, et deviner est la façon dont naissent les erreurs        ║
 * ║ silencieuses. Chacune dit donc TROIS choses : à quoi ressemble la valeur, où  ║
 * ║ l'obtenir, et ce qu'il ne faut pas faire.                                    ║
 * ║                                                                              ║
 * ║ `minLength: 1` n'est pas décoratif : `validate.ts` ROGNE les blancs avant de  ║
 * ║ compter, donc une chaîne vide ou faite d'espaces est refusée À L'ENTRÉE. Sans ║
 * ║ lui, elle était concaténée telle quelle dans le chemin de l'appel sortant, où ║
 * ║ elle coûtait un aller-retour pour produire une erreur illisible.              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
const BASE_ID: JsonSchema = {
  type: "string",
  minLength: 1,
  maxLength: 20,
  description:
    "Identifiant de base CanLII, p. ex. « qcca » (Cour d'appel du Québec) ou « csc-scc ». " +
    "La liste exacte est rendue par jurisprudence_list_databases : la LIRE plutôt que la deviner, " +
    "les identifiants fédéraux et administratifs ne suivent aucune règle prévisible.",
};

const CASE_ID: JsonSchema = {
  type: "string",
  minLength: 1,
  maxLength: 60,
  description:
    "Identifiant CanLII de la décision DANS cette base, p. ex. « 2008csc9 ». Rendu par " +
    "jurisprudence_verify_citations, jurisprudence_find_case et jurisprudence_browse_cases. " +
    "S'emploie AVEC database_id ; si l'on n'a que la citation neutre, renseigner « citation » à la place." +
    " ⚠ Fournir EXACTEMENT l'une des deux formes : soit « citation », soit le couple « database_id » + « case_id ». Les deux ensemble, ou aucune, sont REFUSÉS par l'outil — le schéma ne sait pas l'exprimer, lui seul le peut.",
};

const CITATION_REF: JsonSchema = {
  type: "string",
  minLength: 1,
  maxLength: 400,
  description:
    "Citation neutre, p. ex. « 2008 CSC 9 » ou « 2020 QCCA 495 ». Voie la plus simple : elle " +
    "dispense de connaître database_id et case_id. Les recueils (R.C.S., R.J.Q., C.A.) et les " +
    "identifiants d'éditeur (J.E., REJB, EYB, AZ) ne sont PAS résolubles ici — passer par " +
    "jurisprudence_find_case." +
    " ⚠ Fournir EXACTEMENT l'une des deux formes : soit « citation », soit le couple « database_id » + « case_id ». Les deux ensemble, ou aucune, sont REFUSÉS par l'outil — le schéma ne sait pas l'exprimer, lui seul le peut.",
};

function offsetDe(quoi: string): JsonSchema {
  return {
    type: "integer",
    minimum: OFFSET_DEFAUT,
    maximum: OFFSET_MAX,
    description: `Rang ${quoi}, pour parcourir au-delà de « limit ». ${OFFSET_DEFAUT} par défaut.`,
  };
}

export const SERVER_INFO = {
  // `name` est un IDENTIFIANT, `title` un libellé : les deux ont changé le 2026-09-16,
  // et pas pour la même raison. Le libellé parce que le praticien a renommé son
  // connecteur ; l'identifiant parce qu'il contenait « canlii », seul vestige d'un
  // préfixe que tout le reste du dépôt venait d'abandonner (D8 amendée). Cette note
  // disait auparavant qu'il « ne change pas avec le titre » et que le renommer
  // « n'apporterait rien » : vrai tant que le nom restait cohérent avec le reste, faux
  // le jour où il devient le dernier endroit à dire l'inverse des douze autres.
  name: "mcp-jurisprudence",
  title: "MCP Jurisprudence",
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
  "jurisprudence_verify_citations ; si la citation n'est pas constructible (recueils R.C.S. / " +
  "R.J.Q. / C.A., identifiants J.E. / REJB / EYB / AZ), enchaîner avec jurisprudence_find_case. " +
  "Pour le TEXTE des lois et règlements du Québec, employer le connecteur « Législation " +
  "du Québec ». Les verdicts et la couverture dépendent de la collection de CanLII : " +
  "une absence n'est jamais une preuve d'inexistence. " +
  // §17 — la frontière des sources, énoncée au modèle AVANT tout appel : sans elle,
  // il attribuerait à CanLII une adresse de palais, ou chercherait dans CanLII un
  // numéro de greffe. Les deux erreurs sont silencieuses.
  "DEUX SOURCES DISTINCTES coexistent ici, et le PRÉFIXE ne les annonce plus : c'est la " +
  "description de chaque outil qui nomme sa source. NEUF des dix outils jurisprudence_* " +
  "interrogent CanLII ; le dixième, jurisprudence_parse_citation, n'appelle RIEN — il " +
  "analyse une citation contre le répertoire local et ne confirme aucune existence. Les " +
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
  jurisprudence_verify_citations: {
    title: "Vérifier des citations",
    description:
      "Vérifie une ou plusieurs citations de jurisprudence contre la collection de CanLII. " +
      "SIX verdicts, dont CINQ portent un constat : CONFIRMÉE, DISCORDANTE, INTROUVABLE, " +
      "NON CONSTRUCTIBLE, ILLISIBLE. Le sixième, INDÉTERMINÉE, dit qu'AUCUN constat n'a pu " +
      "être fait — CanLII injoignable, étranglé, ou budget d'appels épuisé — et ne vaut " +
      "JAMAIS absence : ne pas le confondre avec INTROUVABLE. Un client qui n'attend que " +
      "cinq valeurs prendra une panne pour une inexistence. " +
      "Rend aussi la fiche officielle (intitulé, citation, date, n° de dossier, hyperlien) " +
      "et, s'il y a lieu, l'écart avec l'intitulé attendu. Établit l'EXISTENCE et l'IDENTITÉ " +
      "d'une décision ; n'établit NI son autorité actuelle (aucun historique d'appel, aucun " +
      "indicateur de traitement), NI le contenu de son dispositif. Outil de choix pour " +
      "éprouver des références tirées de la doctrine, d'un moteur de recherche ou d'un texte " +
      "rédigé par une IA. Les citations de recueils (R.C.S., R.J.Q., C.A.) et les identifiants " +
      "d'éditeurs (J.E., REJB, EYB, AZ) ne sont pas résolubles directement : enchaîner avec " +
      "jurisprudence_find_case. Pour la seule FICHE d'une décision déjà tenue pour juste, " +
      "jurisprudence_get_case suffit et coûte moins.",
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
  jurisprudence_find_case: {
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
          description: "Tribunal ciblé, p. ex. « qcca ». Voir jurisprudence_list_databases.",
        },
        year_from: {
          type: "integer",
          minimum: 1800,
          maximum: 2100,
          description:
            "Borne INFÉRIEURE, incluse, sur l'année de la décision. CanLII filtre sur la date de " +
            "DÉCISION, non de publication : une décision de 2019 diffusée en 2020 répond à 2019. " +
            "⚠ DEUX règles que le schéma ne sait pas imposer, et que l'outil impose : year_from " +
            "doit être ≤ year_to ; et SANS « database_id », la fenêtre ne peut pas dépasser TROIS " +
            "ans — un balayage vif sur toutes les bases québécoises coûterait trop d'appels. " +
            "Préciser le tribunal pour ouvrir la fenêtre.",
        },
        year_to: {
          type: "integer",
          minimum: 1800,
          maximum: 2100,
          description:
            "Borne SUPÉRIEURE, incluse, sur l'année de la décision. Doit être ≥ year_from — " +
            "contrainte ENTRE champs, donc imposée par l'outil et non par le schéma.",
        },
        lang: LANG,
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 25,
          description: `Nombre de candidats rendus (défaut ${LIMITES.find_case.defaut}, maximum ${LIMITES.find_case.max}).`,
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
  jurisprudence_get_case: {
    title: "Fiche d'une décision",
    description:
      "Fiche CanLII d'une décision : intitulé, citation, date, numéro de dossier de cour, " +
      "mots-clés et hyperlien canlii.ca. Accepte soit une citation (« 2020 QCCA 495 »), soit " +
      "le couple database_id + case_id. Ne renvoie PAS le texte de la décision : suivre " +
      "l'hyperlien. N'ÉPROUVE PAS la citation : aucun verdict, aucune comparaison d'intitulé, " +
      "aucun contrôle d'année — la fiche rendue est celle de la décision TROUVÉE, qui peut " +
      "n'être pas celle que l'on croyait citer. Pour savoir si une référence rencontrée " +
      "ailleurs est juste, employer jurisprudence_verify_citations.",
    inputSchema: {
      type: "object",
      properties: {
        citation: CITATION_REF,
        database_id: BASE_ID,
        case_id: CASE_ID,
        lang: LANG,
        refresh: REFRESH,
      },
      additionalProperties: false,
    },
    handler: getCase,
  },

  // ── 7.4 ────────────────────────────────────────────────────────────────────
  jurisprudence_citator: {
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
        citation: CITATION_REF,
        database_id: BASE_ID,
        case_id: CASE_ID,
        rel: {
          type: "string",
          enum: ["cited", "citing", "legislation"],
          description:
            "« cited » : ce que la décision cite. « citing » : ce qui la cite. " +
            "« legislation » : les dispositions qu'elle cite.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: `Nombre de lignes rendues (défaut ${LIMITES.citator.defaut}, maximum ${LIMITES.citator.max}).`,
        },
        offset: offsetDe("de la première ligne rendue"),
        refresh: REFRESH,
      },
      required: ["rel"],
      additionalProperties: false,
    },
    handler: citator,
  },

  // ── 7.5 ────────────────────────────────────────────────────────────────────
  jurisprudence_subsequent_history: {
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
        citation: CITATION_REF,
        database_id: BASE_ID,
        case_id: CASE_ID,
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description:
            `Nombre de décisions citantes EXAMINÉES (défaut ${LIMITES.subsequent_history.defaut}, maximum ${LIMITES.subsequent_history.max}). Ce n'est PAS le nombre ` +
            "de sorts rendus : seules sont retenues celles d'une juridiction supérieure dont " +
            "l'intitulé ressemble au sien.",
        },
        refresh: REFRESH,
      },
      additionalProperties: false,
    },
    handler: subsequentHistory,
  },

  // ── 7.6 ────────────────────────────────────────────────────────────────────
  jurisprudence_browse_cases: {
    title: "Décisions d'un tribunal",
    description:
      "Liste les décisions d'un tribunal, les plus récemment diffusées en tête, avec filtres " +
      "de date : date de la décision (`decision_date_*`), date de diffusion sur CanLII " +
      "(`published_*`) ou date de dernière modification (`modified_*`, `changed_*`). Utile " +
      "pour la veille et pour cerner la couverture de CanLII pour un tribunal donné.",
    inputSchema: {
      type: "object",
      properties: {
        database_id: BASE_ID,
        lang: LANG,
        offset: offsetDe("du premier texte rendu"),
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description:
            `Nombre de fiches rendues (défaut ${LIMITES.browse_cases.defaut}, maximum ${LIMITES.browse_cases.max}). Bien en deçà du maximum de ` +
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
  jurisprudence_list_databases: {
    title: "Répertoire des tribunaux et corpus",
    description:
      "Répertoire des bases de CanLII : cours et tribunaux (`kind='case'`) ou corpus " +
      "législatifs (`kind='legislation'`), avec leur databaseId et leur ressort. Point de " +
      "départ de toute commande exigeant un database_id.",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["case", "legislation"],
          description:
            "Restreindre au répertoire des TRIBUNAUX (« case ») ou à celui des CORPUS LÉGISLATIFS " +
            "(« legislation »). Omis, les deux sont rendus.",
        },
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
  jurisprudence_browse_legislation: {
    title: "Lois et règlements d'un corpus",
    description:
      "Liste les lois ou règlements d'une base législative DE CANLII (p. ex. « qcs » pour " +
      "les lois du Québec), avec leur legislationId, leur citation et leur type.",
    inputSchema: {
      type: "object",
      properties: {
        database_id: BASE_ID,
        lang: LANG,
        query: { type: "string", maxLength: 100, description: "Filtre sur le titre." },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: `Nombre de LOIS et RÈGLEMENTS rendus (défaut ${LIMITES.browse_legislation.defaut}, maximum ${LIMITES.browse_legislation.max}). Cet outil ne rend aucune décision.`,
        },
        offset: offsetDe("de la première décision rendue"),
      },
      required: ["database_id"],
      additionalProperties: false,
    },
    handler: browseLegislation,
  },

  // ── 7.9 ────────────────────────────────────────────────────────────────────
  jurisprudence_get_legislation: {
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
        database_id: BASE_ID,
        legislation_id: {
          type: "string",
          minLength: 1,
          maxLength: 60,
          description:
            "Identifiant CanLII du texte DANS cette base, p. ex. « rlrq-c-c-25.01 ». Rendu par " +
            "jurisprudence_browse_legislation : le LIRE plutôt que le composer.",
        },
        lang: LANG,
      },
      required: ["database_id", "legislation_id"],
      additionalProperties: false,
    },
    handler: getLegislation,
  },

  // ── 7.10 ───────────────────────────────────────────────────────────────────
  jurisprudence_parse_citation: {
    title: "Analyser une citation (hors ligne)",
    description:
      "Analyse une citation SANS aucun appel : la réponse vient de l'analyseur local et du " +
      "répertoire local des bases, jamais de CanLII. Indique la forme reconnue (citation " +
      "neutre, citation attribuée par CanLII, recueil, identifiant d'éditeur), et, si elle est " +
      "constructible, le database_id et le case_id qui en découlent. N'ÉTABLIT RIEN quant à " +
      "l'existence de la décision : « constructible » veut dire « bien formée », pas " +
      "« existante ». Outil de diagnostic ; pour éprouver réellement une référence, employer " +
      "jurisprudence_verify_citations.",
    inputSchema: {
      type: "object",
      properties: {
        citation: {
          type: "string",
          minLength: 1,
          maxLength: 400,
          description:
            "La citation à analyser, telle qu'elle a été rencontrée, p. ex. « 2020 QCCA 495 » ou " +
            "« [1996] 3 R.C.S. 211 ». Une forme non reconnue n'est pas une erreur : elle est " +
            "rendue comme telle.",
        },
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
          minLength: 1,
          maxLength: 3,
          description:
            "Numéro de greffe à 3 chiffres, p. ex. « 500 ». ⚠ Fournir EXACTEMENT l'un des deux : " +
            "soit « greffe_number », soit « palais ». Les deux ensemble, ou aucun, sont REFUSÉS.",
        },
        palais: {
          type: "string",
          minLength: 1,
          maxLength: 60,
          description:
            "Nom ou clef du palais, p. ex. « Montréal » ou « saint-jerome ». ⚠ Fournir " +
            "EXACTEMENT l'un des deux : soit « palais », soit « greffe_number ». Les deux " +
            "ensemble, ou aucun, sont REFUSÉS. Un nom ambigu fait rendre la LISTE des candidats " +
            "plutôt qu'un choix arbitraire.",
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
    annotations: { ...(SANS_APPEL.has(name) ? LOCAL : DISTANT) },
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
