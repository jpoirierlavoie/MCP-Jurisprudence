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
  /** Résumé clair pour les juristes (haut de fiche). */
  readonly resume: readonly string[];
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
    resume: [
      "Checks whether one or more case citations actually exist in CanLII and match the party names and year you expect — ideal for verifying references from AI drafts, memos, or doctrine.",
      "Returns a clear status (CONFIRMED, DISCORDANT, NOT FOUND, UNCONSTRUCTIBLE, UNREADABLE, or INDETERMINATE when CanLII is unreachable) along with a direct canlii.ca link. Confirming a citation proves the decision exists; you still must read it and check subsequent history.",
    ],
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
    resume: [
      "Finds a decision by party names (and optional court or year window) when you only have an older law-report citation (S.C.R., R.J.Q., C.A.), a publisher ID (J.E., EYB, AZ), or the names of the parties.",
      "Searches decision titles and keywords only, as CanLII's API does not allow searching the full text of judgments.",
    ],
    texte:
      "For citations that cannot be constructed — law reports, publisher identifiers. " +
      "Searches titles and keywords only: CanLII's API does not expose the text of decisions.",
  },
  get_case: {
    titre: "Decision record",
    resume: [
      "Retrieves a decision's official CanLII card: style of cause, neutral citation, date, court file number, keywords, and direct canlii.ca link to read the full judgment.",
      "Does not return the text of the decision and does not test whether a citation matches an expected style of cause (use verify_citations for that).",
    ],
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
    resume: [
      "Lists the decisions cited by a case, later decisions that cite it, and statutory provisions it references, as indexed by CanLII.",
      "Raw lists only: they do not tell you whether a case was followed, distinguished, or overturned. Use the « lois » connector to read cited Québec statutes.",
    ],
    texte:
      "What a decision cites, what cites it, and the provisions it cites, as recorded by " +
      "CanLII. Raw lists carrying NO treatment sense: nothing here says followed, " +
      "distinguished or overruled, and their reach is only as wide as CanLII's collection. " +
      "CanLII's citator endpoint only accepts English (« caseCitator/en »); cached French " +
      "titles are substituted when « lang='fr' », and remaining English titles are flagged.",
  },
  subsequent_history: {
    titre: "Subsequent history — heuristic indication",
    resume: [
      "Flags higher-court decisions on CanLII that share similar party names and cite the starting decision — a quick clue to check for possible appeals.",
      "Heuristic indicator only: does not replace a full legal citator and cannot detect pending appeals, refusals of leave to appeal, or discontinuances.",
    ],
    texte:
      "A heuristic hint at what became of a decision, built from CanLII-held citing decisions " +
      "of higher courts. It is not a professional citator and does not replace one.",
  },
  browse_cases: {
    titre: "Decisions of a court",
    resume: [
      "Lists recent decisions from a specific court on CanLII, with optional filters by decision date or publication date — useful for monitoring recent judgments or checking CanLII's coverage.",
    ],
    texte:
      "Browses one court's decisions as held by CanLII, with eight date filters across three " +
      "distinct axes: " +
      "decision date, publication date, and modification date.",
  },
  list_databases: {
    titre: "Directory of courts and corpora",
    resume: [
      "Lists the courts, tribunals, and legislative databases available on CanLII along with their identifiers, so your assistant can target the right court.",
    ],
    texte:
      "The directory of CanLII databases — courts and legislative corpora — refreshed weekly " +
      "from the live API. Any bootstrap mapping the live directory CONTRADICTS is FLAGGED in " +
      "the output; nothing is corrected automatically, and the correction itself is a manual " +
      "step. The two counts measure different sets and say so: a refresh reports the WHOLE " +
      "directory, while the list below it counts only the rows the filters kept.",
  },
  browse_legislation: {
    titre: "Statutes and regulations of a corpus",
    resume: [
      "Lists the statutes or regulations indexed in a given CanLII legislative database (useful for checking federal or other provincial statutes outside Québec).",
    ],
    texte: "Lists the statutes and regulations of one CanLII legislative database.",
  },
  get_legislation: {
    titre: "Statute or regulation record",
    resume: [
      "Retrieves CanLII's metadata card for a statute or regulation (title, repeal flag, and the dates of CanLII's hosted copy — which do not date original enactment). To read Québec or key federal statutory text, your assistant uses « lois ».",
    ],
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
    resume: [
      "Quickly checks offline whether a citation string is well-formed (neutral citation, law report, or publisher ID) without using your CanLII quota. Confirms format only, never whether the case exists.",
    ],
    texte:
      "Diagnostic only, with no call to CanLII: reports the form recognised and, where the " +
      "citation is constructible, the identifiers that follow from it. It establishes NOTHING " +
      "about whether the decision exists.",
  },
  list_exempt_authorities: {
    titre: "List exempt authorities (offline)",
    resume: [
      "Browses and searches offline the 27 compiled lists of authorities exempt from reproduction across 9 Canadian and Québec courts and tribunals (QCCA, QCCS, QCCQ, TAT, TDP, TP, TMF, Federal Court, TMOB), enriched with compiled CanLII metadata and keywords.",
      "Runs strictly offline without using your CanLII quota; establishes neither the current authority of decisions nor the content of their disposition.",
    ],
    texte:
      "Consults and searches OFFLINE the 27 compiled lists of authorities exempt from " +
      "reproduction across 9 Canadian and Québec courts and tribunals, enriched with " +
      "pre-compiled CanLII metadata and keywords. Supports directory mode (no parameters), " +
      "verbatim single-list browsing preserving source order (`list_id`), and cross-list " +
      "full-text search (`query`). Makes NO outbound calls to CanLII, does not verify links " +
      "printed in source lists, and establishes NEITHER the current authority of decisions " +
      "(no appellate history, no treatment) NOR the content of their disposition.",
  },
  check_exempt_authorities: {
    titre: "Check reproduction exemption",
    resume: [
      "Checks a batch of up to 50 citations against a court's or tribunal's exempt-authorities list(s), returning DISPENSÉE, À VÉRIFIER, NON LISTÉE, ILLISIBLE, or INDÉTERMINÉE (which never means absence from the list or exemption).",
      "Runs offline matching first and queries CanLII only when resolve_canlii is enabled and a parallel citation or non-indexed entry requires resolution; use verify_citations to check general existence outside a list.",
    ],
    texte:
      "Checks up to 50 citations against the exempt-authorities list(s) of a target court " +
      "(`tribunal`, e.g. via `list_exempt_authorities`) or specific sub-list (`list_id`). " +
      "FIVE verdicts: DISPENSÉE, À VÉRIFIER (known source-list typo, title or year discrepancy), " +
      "NON LISTÉE, ILLISIBLE, and INDÉTERMINÉE (CanLII unreachable, throttled, or call budget " +
      "spent — NEVER means absence from the list or exemption). Runs offline matching first; " +
      "queries CanLII's API only if `resolve_canlii` is true and a reference may resolve a " +
      "parallel form or non-indexed entry. Exemption applies only before the specified court " +
      "subject to its procedural rules and establishes NEITHER current authority (no appellate " +
      "history, no treatment) NOR the content of the disposition. To verify general existence " +
      "of a citation outside a list against CanLII, use verify_citations.",
  },
} as const;

export const EN = {
  titre: "MCP Case Law — Citation Verification (CanLII)",

  intro: [
    "Connects your AI assistant (Claude, ChatGPT, Gemini, Antigravity) to CanLII so it can verify " +
      "case citations, retrieve official decision records, and check courts' exempt-authorities " +
      "lists rather than inventing references.",
  ],

  avertissement: [
    "This connector establishes the EXISTENCE and IDENTITY of a decision. It establishes " +
      "neither its current authority — no appellate history, no treatment indicator, no " +
      "pending appeal — nor the content of its disposition. CanLII's API returns metadata " +
      "only: never the text of a decision.",
    "An absence is never proof of non-existence.",
  ],

  acces: [
    "Free access reserved for active members in good standing of the Barreau du Québec.",
    "1. Apply once at https://acces.poirierlavoie.ca/demande using your Barreau number and your " +
      "own CanLII API key (the service stores it encrypted and uses your own quota).",
    "2. Install the droit-civil-quebecois plugin in Claude, ChatGPT, Gemini, or Antigravity — or " +
      "add https://jurisprudence.poirierlavoie.ca/mcp/oauth directly in connector settings — then " +
      "click Connect and sign in through your browser (no secret keys to copy).",
    "Your searched citations and queries are never logged. Manage your CanLII key or account " +
      "anytime at https://acces.poirierlavoie.ca/moi.",
  ],

  accesTechniqueTitre: "Technical details (scripts, CLI & MCP discovery)",
  accesTechnique: [
    "Browser OAuth 2.1 endpoint: https://jurisprudence.poirierlavoie.ca/mcp/oauth. Direct " +
      "per-holder token access (https://jurisprudence.poirierlavoie.ca/mcp or /mcp/<secret>, " +
      "with optional X-Clef-CanLII header) remains available for scripts, command-line tools, and " +
      "Gemini API Deep Research.",
    "A public, secret-free MCP Server Card is published at " +
      "https://jurisprudence.poirierlavoie.ca/mcp/server-card; the repository also includes " +
      "standalone manifests for Google Antigravity and Gemini CLI.",
    "The code is free and open-source under Apache-2.0 (see LICENSE), with a NOTICE file " +
      "acknowledging CanLII's Terms of Use and disclaiming any claim over case-law data.",
  ],

  pied: [
    "Jason Poirier Lavoie, lawyer (Québec). Case-law data: CanLII.",
    "No legal advice. This tool replaces neither verification at the source nor professional " +
      "judgment.",
  ],

  // ── Les outils ─────────────────────────────────────────────────────────────
  familleCanlii: "Backed by CanLII",
  familleCanliiTexte: [
    "You never need to invoke these tools manually: your AI assistant runs them automatically when " +
      "checking authorities, exempt lists, or looking up a decision.",
    "Ten tools may query CanLII's API (using your personal key's quota); parse_citation and " +
      "list_exempt_authorities run strictly offline without consuming quota (and " +
      "check_exempt_authorities supports offline-only mode with resolve_canlii=false). Offline " +
      "Québec court-file and courthouse tools (greffe_*, palais_*) live in the public « outils » connector.",
  ],

  // ── Schémas ────────────────────────────────────────────────────────────────
  schemaTexte: [
    "Technical reference for developers and automated scripts: every tool accepts only the " +
      "parameters listed below, generated directly from the server's validation rules.",
    "The Description column stays in French in both views because those sentences are the exact " +
      "canonical strings sent to the assistant.",
  ],
  schemaResume: "Show parameter tables for all 12 tools (technical reference)",
  colParam: "Parameter",
  colType: "Type",
  colContrainte: "Constraints",
  colDescription: "Description",
  requis: "required",
} as const;
