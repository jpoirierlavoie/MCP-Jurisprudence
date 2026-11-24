/**
 * Chaînes ANGLAISES de la page publique (§18).
 *
 * ⚠ POURQUOI CE FICHIER EXISTE, ET CE QU'IL NE DOIT PAS DEVENIR.
 *
 *   Ce dépôt est francophone : les titres d'outils, leurs descriptions et les mises en
 *   garde de §2 n'existent qu'en français, et le français y est CANONIQUE — c'est lui
 *   que le modèle reçoit. La page rend donc le français DIRECTEMENT DEPUIS LES DONNÉES
 *   (`listToolDescriptors()`), et ne recopie rien.
 *
 *   Ce fichier ne porte QUE l'anglais, qui n'a pas de source ailleurs. Il ne doit
 *   JAMAIS recevoir une copie française : deux copies d'une même vérité divergent, et
 *   ce dépôt l'a déjà payé deux fois. Un test de garde échoue si un outil gagne une
 *   entrée sans son pendant, dans les DEUX sens.
 *
 *   Les traductions des mises en garde sont des traductions de COURTOISIE : la version
 *   qui fait foi est la française, celle que les outils rendent.
 */

/** Traduction anglaise d'un outil, pour la page seulement. */
export interface OutilEn {
  /** Pendant anglais de `ToolDescriptor.title`. */
  readonly titre: string;
  /** Prose de la page — plus longue que la description MCP, qui est budgétée en jetons. */
  readonly texte: string;
}

/**
 * Pendant anglais de CHAQUE outil.
 *
 * ⚠ Les clefs doivent couvrir `TOOLS` exactement — ni plus, ni moins. Un test de
 *   garde échoue dans les DEUX sens : un outil ajouté sans traduction paraîtrait
 *   vide en anglais, et une traduction orpheline survivrait à un outil supprimé.
 */
export const OUTILS_EN: Readonly<Record<string, OutilEn>> = {
  verify_citations: {
    titre: "Verify citations",
    texte:
      "The pivot tool, answering from CanLII's collection. SIX verdicts, five of which state a " +
      "FINDING: CONFIRMÉE, DISCORDANTE, INTROUVABLE, NON CONSTRUCTIBLE, ILLISIBLE. The sixth, " +
      "INDÉTERMINÉE, says that NO finding could be made — CanLII unreachable, throttled, " +
      "answering with an unusable body, or the call budget spent — and never means absence: " +
      "do not read it as INTROUVABLE. A confirmed " +
      "verdict establishes existence and identity — never current authority, never the disposition. " +
      "For the RECORD alone of a decision already known to be accurately cited, " +
      "get_case is enough and uses less quota.",
  },
  find_case: {
    titre: "Find a decision by party names",
    texte:
      "For citations that cannot be constructed — law reports, publisher identifiers. " +
      "Searches titles and keywords only: CanLII's API does not expose the text of decisions.",
  },
  get_case: {
    titre: "Decision record",
    texte:
      "The official record of one decision: style of cause, citation, date, court file number, " +
      "keywords and its canlii.ca link. It does not return the text — follow the link. It does " +
      "NOT test the citation: no verdict, no comparison of the style of cause, no check on the " +
      "year — the record returned is that of the decision FOUND, which may not be the one you " +
      "believed you were citing. To find out whether a citation found elsewhere is accurate, use " +
      "verify_citations instead.",
  },
  citator: {
    titre: "Citator — raw lists",
    texte:
      "What a decision cites, what cites it, and the provisions it cites, as recorded by " +
      "CanLII. Raw lists carrying NO treatment sense: nothing here says followed, " +
      "distinguished or overruled, and their reach is only as wide as CanLII's collection. " +
      "CanLII's citator endpoint only accepts English (« caseCitator/en »); cached French " +
      "titles are substituted when « lang='fr' », and remaining English titles are flagged.",
  },
  subsequent_history: {
    titre: "Subsequent history — heuristic indication",
    texte:
      "A heuristic hint at what became of a decision, built from CanLII-held citing decisions " +
      "of higher courts. It is not a professional citator and does not replace one.",
  },
  browse_cases: {
    titre: "Decisions of a court",
    texte:
      "Browses one court's decisions as held by CanLII, with eight date filters across three " +
      "distinct axes: " +
      "decision date, publication date, and modification date.",
  },
  list_databases: {
    titre: "Directory of courts and corpora",
    texte:
      "The directory of CanLII databases — courts and legislative corpora — refreshed weekly " +
      "from the live API. Any bootstrap mapping the live directory CONTRADICTS is FLAGGED in " +
      "the output; nothing is corrected automatically, and the correction itself is a manual " +
      "step. The two counts measure different sets and say so: a refresh reports the WHOLE " +
      "directory, while the list below it counts only the rows the filters kept.",
  },
  browse_legislation: {
    titre: "Statutes and regulations of a corpus",
    texte: "Lists the statutes and regulations of one CanLII legislative database.",
  },
  get_legislation: {
    titre: "Statute or regulation record",
    texte:
      "CanLII's record for one instrument: citation, type, repeal indicator, and the dates of " +
      "the CONSOLIDATED VERSION CanLII serves. Those dates bound that version, never the " +
      "instrument — they date neither its coming into force nor its repeal, and a statute in " +
      "force for decades can carry a very recent start date. CanLII's date regime is shown RAW " +
      "and glossed, because its values do not mean the same thing. For the TEXT of Québec " +
      "statutes, use the « lois » connector instead.",
  },
  parse_citation: {
    titre: "Parse a citation (offline)",
    texte:
      "Diagnostic only, with no call to CanLII: reports the form recognised and, where the " +
      "citation is constructible, the identifiers that follow from it. It establishes NOTHING " +
      "about whether the decision exists.",
  },
} as const;

export const EN = {
  titre: "MCP Case Law — Citation Verification (CanLII)",

  intro: [
    "Read-only MCP server for checking Canadian case-law citations against CanLII's collection, " +
      "retrieving official decision metadata records, and reading raw citator lists.",
  ],

  avertissement: [
    "This connector establishes the EXISTENCE and IDENTITY of a decision. It establishes " +
      "neither its current authority — no appellate history, no treatment indicator, no " +
      "pending appeal — nor the content of its disposition. CanLII's API returns metadata " +
      "only: never the text of a decision.",
    "An absence is never proof of non-existence.",
  ],

  acces: [
    "This connector is reserved for active members in good standing of the Barreau du Québec. " +
      "Each practitioner supplies their own CanLII API key (stored encrypted in /moi or sent via " +
      "the X-Clef-CanLII header). Standard connection uses browser-based OAuth 2.1 authorization " +
      "through acces.poirierlavoie.ca (https://jurisprudence.poirierlavoie.ca/mcp/oauth), with no " +
      "key to copy; direct per-holder token access (https://jurisprudence.poirierlavoie.ca/mcp/<secret> " +
      "or https://jurisprudence.poirierlavoie.ca/mcp) remains available for scripts and command-line " +
      "tools. Access requests and self-service management: acces.poirierlavoie.ca/demande and " +
      "acces.poirierlavoie.ca/moi.",
    "Queries and searched citations are never logged. A public, secret-free MCP Server Card is " +
      "published at https://jurisprudence.poirierlavoie.ca/mcp/server-card; the repository also " +
      "includes standalone manifests for Google Antigravity and Gemini CLI.",
    "The code is free and open-source under Apache-2.0 (see LICENSE), with a NOTICE file " +
      "acknowledging CanLII's Terms of Use and disclaiming any claim over case-law data; " +
      "the test suite runs with no API key and no network.",
  ],

  pied: [
    "Jason Poirier Lavoie, lawyer (Québec). Case-law data: CanLII.",
    "No legal advice. This tool replaces neither verification at the source nor professional " +
      "judgment.",
  ],

  // ── Les outils ─────────────────────────────────────────────────────────────
  familleCanlii: "Backed by CanLII",
  familleCanliiTexte: [
    "Nine tools query CanLII's API (and count against your key's quota); parse_citation runs " +
      "offline and only analyses the structure of a citation.",
    "The offline Québec court-file and courthouse utilities (greffe_*, palais_*) now live in " +
      "the public unauthenticated connector « outils ».",
  ],

  // ── Schémas ────────────────────────────────────────────────────────────────
  schemaTexte: [
    "Every tool only accepts the parameters listed below: these tables are generated directly " +
      "from the validation schemas applied by the server.",
    "The Description column stays in French in both views because those sentences are the exact " +
      "canonical strings sent to the assistant.",
  ],
  colParam: "Parameter",
  colType: "Type",
  colContrainte: "Constraints",
  colDescription: "Description",
  requis: "required",
} as const;
