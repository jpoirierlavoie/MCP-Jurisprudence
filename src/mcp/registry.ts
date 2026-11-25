/**
 * Registre des douze outils MCP (spécification §7).
 *
 * ⚠ LES DESCRIPTIONS SONT REPRISES VERBATIM DE §7 ET NE DOIVENT PAS ÊTRE
 *   REFORMULÉES. Elles portent elles-mêmes leurs mises en garde : c'est le second
 *   canal de fiabilité, après le corps des réponses. Le motif est celui de
 *   `GARDE_FOU` dans le Worker `legislation` — une description d'outil est une
 *   surface de contrat, pas de la prose.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ PROVENANCE DANS LA DESCRIPTION (D8, amendée le 2026-09-16 ; §17 retiré le    ║
 * ║ 2026-11-14).                                                                 ║
 * ║                                                                              ║
 * ║   serveur `juris`       la réponse se rapporte à la COLLECTION DE CANLII     ║
 * ║   (12 outils)           ou aux 27 listes compilées d'autorités dispensées.    ║
 * ║                                                                              ║
 * ║ NOTE HISTORIQUE (2026-11-14) : les trois outils hors ligne `greffe_*` et     ║
 * ║ `palais_*` ont été déplacés vers le connecteur public sans authentification  ║
 * ║ « outils » (`MCP-Outils`, v0.2.0). Les douze outils du registre portent      ║
 * ║ tous « CanLII » dans leur description en français et en anglais (épinglé     ║
 * ║ par test/garde.test.ts et test/site.test.ts).                                ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Conventions communes appliquées sans exception :
 *   - nom d'outil en anglais, description ET sortie en français ;
 *   - `readOnlyHint: true` sur TOUS les outils : aucun n'écrit hors de son cache ;
 *   - `openWorldHint` N'EST PAS uniforme — vrai pour les DIX qui peuvent interroger
 *     CanLII (source de vérité distante), faux pour `parse_citation` et
 *     `list_exempt_cases` qui ne font aucun appel. Voir `DISTANT`/`LOCAL`
 *     et `SANS_APPEL` plus bas ;
 *   - tout paramètre déclaré porte une `description` ;
 *   - `additionalProperties: false` sur tous les schémas ;
 *   - tout `lang` : enum ["fr","en"], défaut "fr" ;
 *   - erreur d'exécution => `isError: true` en français, JAMAIS une erreur JSON-RPC.
 *   - ⚠ ET LA FRONTIÈRE DE `isError`, qui n'était écrite nulle part : il vaut `true`
 *     quand l'outil n'a RIEN à livrer — argument refusé, forme d'appel invalide, appel
 *     sortant échoué sans repli. Il vaut `false` dès qu'un résultat part, **même vide,
 *     même partiel, même dégradé** : une liste vide est une réponse, pas une panne, et
 *     la réserve voyage alors dans le corps. La distinction est celle qu'un client lit
 *     pour décider s'il RÉESSAIE.
 */

import { err, type JsonSchema, type ToolResult, validateArgs } from "@poirierlavoie/mcp-socle";
import type { CanliiClient } from "../canlii/client";
import { LIMITES, OFFSET_DEFAUT, OFFSET_MAX } from "./defauts";
import { browseCases } from "./handlers/browseCases";
import { browseLegislation } from "./handlers/browseLegislation";
import { checkExemptAuthorities } from "./handlers/checkExemptAuthorities";
import { citator } from "./handlers/citator";
import { findCase } from "./handlers/findCase";
import { getCase } from "./handlers/getCase";
import { getLegislation } from "./handlers/getLegislation";
import { listDatabasesTool } from "./handlers/listDatabases";
import { listExemptAuthorities } from "./handlers/listExemptAuthorities";
import { parseCitationTool } from "./handlers/parseCitation";
import { subsequentHistory } from "./handlers/subsequentHistory";
import { verifyCitations } from "./handlers/verifyCitations";

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
   * heuristique » y est plus utile que `subsequent_history`, et la réserve
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
 *   l'appelant. C'est vrai des neuf outils qui interrogent CanLII. Ce l'est FAUX de
 *   `parse_citation`, qui lit un analyseur pur et le répertoire local sans
 *   appeler CanLII : à version déployée égale, la même entrée rend la même sortie.
 *
 *   Le dire compte pour un client par programme : `openWorldHint: false` l'autorise à
 *   mettre en cache, à rejouer, et à ne pas prévoir de reprise sur panne réseau — trois
 *   choses que l'annotation uniforme lui interdisait sans raison. L'inverse serait plus
 *   grave : annoncer « monde fermé » sur un outil qui appelle CanLII ferait croire à une
 *   réponse stable là où la couverture évolue.
 */
const DISTANT = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;
const LOCAL = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/** Outils dont la réponse ne dépend d'aucun appel sortant ni du cache CanLII en direct. */
export const SANS_APPEL = new Set(["parse_citation", "list_exempt_cases"]);

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
    "La liste exacte est rendue par list_databases : la LIRE plutôt que la deviner, " +
    "les identifiants fédéraux et administratifs ne suivent aucune règle prévisible.",
};

const CASE_ID: JsonSchema = {
  type: "string",
  minLength: 1,
  maxLength: 60,
  description:
    "Identifiant CanLII de la décision DANS cette base, p. ex. « 2008csc9 ». Rendu par " +
    "verify_citations, find_case et browse_cases. " +
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
    "find_case." +
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
  version: "2.3.0",
};

/**
 * Description publique canonique — partagée avec la fiche SEP-2127 (`/mcp/server-card`)
 * et épinglée contre `plugin.json` et `gemini-extension.json` dans `test/doc.test.ts`.
 */
export const PUBLIC_DESCRIPTION =
  "Vérification déterministe de citations de jurisprudence canadienne et d'autorités dispensées " +
  "(collection CanLII, métadonnées en lecture seule).";

/** Orientation rendue à l'initialisation. Elle porte, elle aussi, le contrat de §2. */
export const INSTRUCTIONS =
  "Connecteur de VÉRIFICATION DE RÉFÉRENCES adossé à la collection de CanLII. " +
  "L'API de CanLII ne rend que des MÉTADONNÉES : jamais le texte d'une décision, et " +
  "aucune recherche par mots du texte n'est possible. Ce connecteur établit " +
  "l'EXISTENCE et l'IDENTITÉ d'une décision ; il n'établit NI son autorité actuelle " +
  "(aucun historique d'appel, aucun indicateur de traitement, aucun pourvoi pendant), " +
  "NI le contenu de son dispositif. Pour éprouver des citations tirées de la doctrine, " +
  "d'un moteur de recherche ou d'un texte rédigé par une IA, commencer par " +
  "verify_citations ; si la citation n'est pas constructible (recueils R.C.S. / " +
  "R.J.Q. / C.A., identifiants J.E. / REJB / EYB / AZ), enchaîner avec find_case. " +
  "Pour consulter les 27 listes d'autorités dispensées de reproduction (9 tribunaux) " +
  "ou vérifier si des citations y figurent, utiliser list_exempt_cases (hors ligne) " +
  "et check_exempt_cases. Pour le TEXTE des lois et règlements du Québec, employer " +
  "le connecteur « lois ». Les verdicts et la couverture dépendent de la collection de CanLII : " +
  "une absence n'est jamais une preuve d'inexistence. " +
  "C'est la description de chaque outil qui nomme sa source et ses limites. DIX des douze " +
  "outils peuvent interroger CanLII ; deux, parse_citation et list_exempt_cases, " +
  "n'appellent RIEN en direct. Pour analyser un numéro de dossier judiciaire québécois " +
  "(greffe_parse_number) ou consulter le répertoire des palais de justice et " +
  "greffes du Québec (palais_list, palais_get), employer le connecteur public hors ligne " +
  "« outils ».";

export const TOOLS: Record<string, ToolDescriptor> = {
  // ── 7.1 — l'outil pivot ────────────────────────────────────────────────────
  verify_citations: {
    title: "Vérifier des citations",
    description:
      "Vérifie une ou plusieurs citations de jurisprudence contre la collection de CanLII. " +
      "SIX verdicts, dont CINQ portent un constat : CONFIRMÉE, DISCORDANTE, INTROUVABLE, " +
      "NON CONSTRUCTIBLE, ILLISIBLE. Le sixième, INDÉTERMINÉE, dit qu'AUCUN constat n'a pu " +
      "être fait — CanLII injoignable, étranglé, réponse inexploitable, ou budget d'appels " +
      "épuisé — et ne vaut " +
      "JAMAIS absence : ne pas le confondre avec INTROUVABLE. Un client qui n'attend que " +
      "cinq valeurs prendra une panne pour une inexistence. " +
      "Rend aussi la fiche officielle (intitulé, citation, date, n° de dossier, hyperlien) " +
      "et, s'il y a lieu, l'écart avec l'intitulé attendu. Établit l'EXISTENCE et l'IDENTITÉ " +
      "d'une décision ; n'établit NI son autorité actuelle (aucun historique d'appel, aucun " +
      "indicateur de traitement), NI le contenu de son dispositif. Outil de choix pour " +
      "éprouver des références tirées de la doctrine, d'un moteur de recherche ou d'un texte " +
      "rédigé par une IA. Les citations de recueils (R.C.S., R.J.Q., C.A.) et les identifiants " +
      "d'éditeurs (J.E., REJB, EYB, AZ) ne sont pas résolubles directement : enchaîner avec " +
      "find_case. Pour la seule FICHE d'une décision déjà tenue pour juste, " +
      "get_case suffit et coûte moins.",
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
                description:
                  "Intitulé annoncé par la source, s'il est connu (un intitulé en tête de « citation » est aussi vérifié automatiquement).",
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
  find_case: {
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
          description: "Tribunal ciblé, p. ex. « qcca ». Voir list_databases.",
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
  get_case: {
    title: "Fiche d'une décision",
    description:
      "Fiche CanLII d'une décision : intitulé, citation, date, numéro de dossier de cour, " +
      "mots-clés et hyperlien canlii.ca. Accepte soit une citation (« 2020 QCCA 495 »), soit " +
      "le couple database_id + case_id. Ne renvoie PAS le texte de la décision : suivre " +
      "l'hyperlien. N'ÉPROUVE PAS la citation : aucun verdict, aucune comparaison d'intitulé, " +
      "aucun contrôle d'année — la fiche rendue est celle de la décision TROUVÉE, qui peut " +
      "n'être pas celle que l'on croyait citer. Pour savoir si une référence rencontrée " +
      "ailleurs est juste, employer verify_citations.",
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
  citator: {
    title: "Citateur — listes brutes",
    description:
      "Citateur, sur la collection de CanLII : décisions citées PAR une décision (`cited`), " +
      "décisions qui LA citent (`citing`), ou dispositions législatives qu'elle cite " +
      "(`legislation`). Les listes sont brutes : elles n'indiquent aucun sens de traitement " +
      "(suivi, distingué, infirmé), et leur exhaustivité est celle de la collection de " +
      "CanLII. Pour les dispositions québécoises, enchaîner avec le connecteur « lois » " +
      "afin d'en lire le texte officiel. L'API citateur de CanLII n'accepte que le chemin " +
      "anglais (« caseCitator/en ») : avec « lang='fr' », les intitulés déjà présents en " +
      "français dans le cache local sont substitués et ceux qui restent en anglais sont " +
      "signalés.",
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
        lang: {
          type: "string",
          enum: ["fr", "en"],
          description:
            "Langue d'affichage souhaitée (« fr » par défaut). L'API citateur de CanLII " +
            "n'accepte que « caseCitator/en » : avec « fr », les intitulés français " +
            "disponibles en cache local sont substitués et les intitulés restés en anglais " +
            "sont signalés.",
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
  subsequent_history: {
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
        lang: {
          type: "string",
          enum: ["fr", "en"],
          description:
            "Langue d'affichage souhaitée (« fr » par défaut). S'appuie sur " +
            "« caseCitator/en » et substitue les intitulés français présents en cache " +
            "local lorsqu'ils existent.",
        },
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
  browse_cases: {
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
  list_databases: {
    title: "Répertoire des tribunaux et corpus",
    description:
      "Répertoire des bases de CanLII : cours et tribunaux (`kind='case'`) ou corpus " +
      "législatifs (`kind='legislation'`), avec leur databaseId et leur ressort. Point de " +
      "départ de toute commande exigeant un database_id. DEUX COMPTES paraissent dans la " +
      "sortie et ne mesurent PAS le même ensemble : la note de rafraîchissement annonce le " +
      "répertoire ENTIER de CanLII, tandis que l'en-tête de la liste ne compte que les " +
      "bases retenues par les filtres, qu'il nomme.",
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
  browse_legislation: {
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
  get_legislation: {
    title: "Fiche d'une loi ou d'un règlement",
    description:
      "Fiche CanLII d'une loi ou d'un règlement : citation, type, indicateur d'abrogation, " +
      "découpage en parties, et les dates de la VERSION CONSOLIDÉE que CanLII sert. Ces " +
      "dates bornent cette version, JAMAIS l'instrument : elles ne datent ni son entrée en " +
      "vigueur ni son abrogation, et un texte en vigueur depuis des décennies peut porter " +
      "une date de début toute récente. Le régime de dates de CanLII est rendu BRUT puis " +
      "glosé, parce que ses valeurs ne disent pas la même chose : « ENTRY_INTO_FORCE » vise " +
      "l'entrée en vigueur de la VERSION, « DOWNLOAD_DATE » le seul jour où CanLII a " +
      "téléchargé le texte. Utile pour vérifier une abrogation, PAS pour dater une " +
      "disposition. Pour le TEXTE d'une loi ou d'un règlement du Québec, utiliser le " +
      "connecteur « lois », qui rend le texte officiel verbatim.",
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
            "browse_legislation : le LIRE plutôt que le composer.",
        },
        lang: LANG,
      },
      required: ["database_id", "legislation_id"],
      additionalProperties: false,
    },
    handler: getLegislation,
  },

  // ── 7.10 ───────────────────────────────────────────────────────────────────
  parse_citation: {
    title: "Analyser une citation (hors ligne)",
    description:
      "Analyse une citation SANS aucun appel : la réponse vient de l'analyseur local et du " +
      "répertoire local des bases, jamais de CanLII. Indique la forme reconnue (citation " +
      "neutre, citation attribuée par CanLII, recueil, identifiant d'éditeur), et, si elle est " +
      "constructible, le database_id et le case_id qui en découlent. N'ÉTABLIT RIEN quant à " +
      "l'existence de la décision : « constructible » veut dire « bien formée », pas " +
      "« existante ». Outil de diagnostic ; pour éprouver réellement une référence, employer " +
      "verify_citations.",
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

  // ── 7.11 ───────────────────────────────────────────────────────────────────
  list_exempt_cases: {
    title: "Lister les autorités dispensées (hors ligne)",
    description:
      "Consulte et recherche HORS LIGNE les 27 listes compilées d'autorités dispensées de " +
      "reproduction (9 tribunaux canadiens et québécois : QCCA, QCCS, QCCQ, TAT, TDP, TP, TMF, " +
      "CF et COMC), enrichies des métadonnées et mots-clés compilés depuis CanLII. Sans " +
      "paramètre, rend l'annuaire des 27 listes ; avec « list_id », rend la liste verbatim dans " +
      "l'ordre source ; avec « query », recherche par intitulé, surnom, citation ou mot-clé " +
      "CanLII. N'émet AUCUN appel réseau à CanLII, ne vérifie pas les hyperliens des listes " +
      "sources et n'établit NI l'autorité actuelle des décisions (aucun historique d'appel, " +
      "aucun traitement), NI le contenu de leur dispositif.",
    inputSchema: {
      type: "object",
      properties: {
        tribunal: {
          type: "string",
          minLength: 1,
          maxLength: 20,
          description:
            "Filtre sur un tribunal : « qcca », « qccs », « qccq », « tat », « tdp », « tp », " +
            "« tmf », « cf » ou « comc ».",
        },
        list_id: {
          type: "string",
          minLength: 1,
          maxLength: 35,
          description:
            "Identifiant précis d'une sous-liste (p. ex. « qcca-civil », " +
            "« qccs-mtl-controle-judiciaire », « qccq-daa-disciplinaire », « tat-dsst », " +
            "« tdp », « cf-imm-general »). Annuaire obtenu sans paramètres.",
        },
        query: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          description:
            "Recherche plein texte sur les intitulés, surnoms, descripteurs sources, citations et " +
            "mots-clés CanLII compilés.",
        },
        lang: LANG,
        limit: {
          type: "integer",
          minimum: 1,
          maximum: LIMITES.list_exempt_cases.max,
          description:
            `Nombre maximal d'entrées rendues (défaut ${LIMITES.list_exempt_cases.defaut}, ` +
            `maximum ${LIMITES.list_exempt_cases.max}).`,
        },
        offset: offsetDe("de la première entrée rendue"),
      },
      additionalProperties: false,
    },
    handler: listExemptAuthorities,
  },

  // ── 7.12 ───────────────────────────────────────────────────────────────────
  check_exempt_cases: {
    title: "Vérifier la dispense de reproduction",
    description:
      "Vérifie un lot de citations (au plus 50) contre les listes d'autorités dispensées d'un " +
      "tribunal ou d'une liste précise. CINQ verdicts : DISPENSÉE, À VÉRIFIER (coquille connue " +
      "de la liste source, écart d'intitulé ou d'année), NON LISTÉE, ILLISIBLE et INDÉTERMINÉE " +
      "(CanLII injoignable, étranglé ou budget épuisé — ne vaut JAMAIS ni absence de la liste " +
      "ni dispense). L'appariement hors ligne s'exécute en premier ; un repli vers l'API de " +
      "CanLII n'intervient que si « resolve_canlii » est vrai et que la référence peut " +
      "correspondre à une forme parallèle ou à une entrée non encore indexée sur CanLII. " +
      "La dispense ne vaut que devant le tribunal et sous réserve de ses règles procédurales ; " +
      "n'établit NI l'autorité actuelle (aucun historique d'appel, aucun traitement), NI le " +
      "contenu du dispositif. Pour éprouver l'existence générale d'une citation hors liste, " +
      "employer verify_citations.",
    inputSchema: {
      type: "object",
      properties: {
        list_id: {
          type: "string",
          minLength: 1,
          maxLength: 35,
          description:
            "Identifiant de la sous-liste ciblée (p. ex. « qcca-civil », " +
            "« qccs-mtl-controle-judiciaire », « qccq-daa-disciplinaire », « cf-imm-general »). " +
            "Voir list_exempt_cases. ⚠ Fournir EXACTEMENT l'un des deux paramètres de portée " +
            ": soit « list_id », soit « tribunal » (jamais les deux ensemble ni aucun).",
        },
        tribunal: {
          type: "string",
          minLength: 1,
          maxLength: 20,
          description:
            "Code du tribunal dont toutes les sous-listes sont contrôlées : « qcca », « qccs », " +
            "« qccq », « tat », « tdp », « tp », « tmf », « cf » ou « comc ». ⚠ Fournir EXACTEMENT " +
            "l'un des deux paramètres de portée : soit « list_id », soit « tribunal » (jamais les " +
            "deux ensemble ni aucun).",
        },
        citations: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          description: "Les références à contrôler contre la liste, au plus 50 par appel.",
          items: {
            type: "object",
            properties: {
              citation: {
                type: "string",
                maxLength: 400,
                description:
                  "Citation neutre, CanLII, de recueil, d'éditeur, numéro de dossier ou intitulé.",
              },
              expected_title: {
                type: "string",
                maxLength: 300,
                description:
                  "Intitulé attendu, s'il est connu (signalera À VÉRIFIER en cas d'écart).",
              },
              expected_year: {
                type: "integer",
                minimum: 1800,
                maximum: 2100,
                description:
                  "Année attendue de la décision ou du recueil (signalera À VÉRIFIER en cas d'écart).",
              },
            },
            required: ["citation"],
            additionalProperties: false,
          },
        },
        lang: LANG,
        resolve_canlii: {
          type: "boolean",
          description:
            "Autoriser un repli vers l'API de CanLII pour résoudre les citations non appariées hors ligne " +
            "(vrai par défaut ; faux force un contrôle strictement hors ligne sans clé CanLII).",
        },
      },
      required: ["citations"],
      additionalProperties: false,
    },
    handler: checkExemptAuthorities,
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
  const outil = Object.hasOwn(TOOLS, name) ? TOOLS[name] : undefined;
  if (!outil) return err(`Outil inconnu : « ${name} ».`);
  const erreurs = validateArgs(outil.inputSchema, args);
  if (erreurs.length > 0) {
    return err(`Arguments invalides pour ${name} : ${erreurs.join(" ")}`);
  }
  return await outil.handler(args, ctx);
}
