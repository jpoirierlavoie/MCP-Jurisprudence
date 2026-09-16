/**
 * Chaînes ANGLAISES de la page publique (§18).
 *
 * ⚠ POURQUOI CE FICHIER EXISTE, ET CE QU'IL NE DOIT PAS DEVENIR.
 *
 *   Ce dépôt est francophone : les titres d'outils, leurs descriptions et les mises en
 *   garde de §2 n'existent qu'en français, et le français y est CANONIQUE — c'est lui
 *   que le modèle reçoit. La page rend donc le français DIRECTEMENT DEPUIS LES DONNÉES
 *   (`listToolDescriptors()`, les tables de `src/qc/`, les constantes `GARDE_*`), et
 *   ne recopie rien.
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
  canlii_verify_citations: {
    titre: "Verify citations",
    texte:
      "The pivot tool, answering from CanLII's collection. Each citation gets one of five " +
      "verdicts: CONFIRMÉE, DISCORDANTE, " +
      "INTROUVABLE, NON CONSTRUCTIBLE, ILLISIBLE. A confirmed verdict establishes existence " +
      "and identity — never current authority, never the disposition.",
  },
  canlii_find_case: {
    titre: "Find a decision by party names",
    texte:
      "For citations that cannot be constructed — law reports, publisher identifiers. " +
      "Searches titles and keywords only: CanLII's API does not expose the text of decisions.",
  },
  canlii_get_case: {
    titre: "Decision record",
    texte:
      "The official record of one decision: style of cause, citation, date, court file number, " +
      "keywords and its canlii.ca link. It does not return the text — follow the link.",
  },
  canlii_citator: {
    titre: "Citator — raw lists",
    texte:
      "What a decision cites, what cites it, and the provisions it cites, as recorded by " +
      "CanLII. Raw lists carrying NO treatment sense: nothing here says followed, " +
      "distinguished or overruled, and their reach is only as wide as CanLII's collection.",
  },
  canlii_subsequent_history: {
    titre: "Subsequent history — heuristic indication",
    texte:
      "A heuristic hint at what became of a decision, built from CanLII-held citing decisions " +
      "of higher courts. It is not a professional citator and does not replace one.",
  },
  canlii_browse_cases: {
    titre: "Decisions of a court",
    texte:
      "Browses one court's decisions as held by CanLII, with eight date filters across three " +
      "distinct axes: " +
      "decision date, publication date, and modification date.",
  },
  canlii_list_databases: {
    titre: "Directory of courts and corpora",
    texte:
      "The directory of CanLII databases — courts and legislative corpora — refreshed weekly " +
      "and reconciled against the live API.",
  },
  canlii_browse_legislation: {
    titre: "Statutes and regulations of a corpus",
    texte: "Lists the statutes and regulations of one CanLII legislative database.",
  },
  canlii_get_legislation: {
    titre: "Statute or regulation record",
    texte:
      "CanLII's record for one instrument: dates, date regime and repeal indicator. For the " +
      "TEXT of Québec " +
      "statutes, use the « Législation du Québec » connector instead.",
  },
  canlii_parse_citation: {
    titre: "Parse a citation (offline)",
    texte:
      "Diagnostic only, with no call to CanLII: reports the form recognised and, where the " +
      "citation is constructible, the identifiers that follow from it. It establishes NOTHING " +
      "about whether the decision exists.",
  },
  greffe_parse_court_file_number: {
    titre: "Québec court file number (offline)",
    texte:
      "Reads NNN-NN-NNNNNN-NNN into its registry — courthouse and judicial district — and its " +
      "jurisdiction: court, competence, registry type. A letter prefix (TAL, TAQ, C.F.…) names " +
      "a tribunal that numbers its own files. Local tables, no call, and no proof that the file exists.",
  },
  palais_list: {
    titre: "Québec courthouses — directory",
    texte:
      "The courthouses and justice service points of Québec, with civic address, the registry " +
      "numbers sitting there and their judicial district. Filterable by district, type or free text.",
  },
  palais_get: {
    titre: "Québec courthouse — record",
    texte:
      "One location in full, by registry number or by name: address, distinct mailing address " +
      "where one is published, registries sitting there, and — for a circuit court — the " +
      "communities served.",
  },
} as const;

export const EN = {
  titre: "Canadian case law and Québec court registries",

  intro: [
    "A read-only MCP server. It tests case-law citations against CanLII's collection, and " +
      "reads Québec judicial nomenclature — court file numbers, registries, courthouses.",
  ],

  avertissement: [
    "This connector establishes the EXISTENCE and IDENTITY of a decision. It establishes " +
      "neither its current authority — no appellate history, no treatment indicator, no " +
      "pending appeal — nor the content of its disposition. CanLII's API returns metadata " +
      "only: never the text of a decision.",
    "An absence is never proof of non-existence.",
  ],

  acces: [
    "A private instance, run by a Québec lawyer for their own practice. The endpoint has " +
      "the form https://jurisprudence.poirierlavoie.ca/mcp/<secret> — the secret appears " +
      "nowhere on this page, and never will.",
    "The code is public, and the test suite runs with no API key and no network.",
  ],

  pied: [
    "Jason Poirier Lavoie, lawyer (Québec). Case-law data: CanLII. Registry and courthouse " +
      "data: ministère de la Justice du Québec.",
    "No legal advice. This tool replaces neither verification at the source nor professional " +
      "judgment.",
  ],

  // ── Les deux familles d'outils ─────────────────────────────────────────────
  familleCanlii: "Backed by CanLII",
  familleCanliiTexte: [
    "Ten tools whose answer comes from CanLII's collection — coverage and verdicts depend on it. " +
      "They make outbound calls and are subject to the API's quota.",
  ],
  familleQc: "Local Québec tables — no call, ever",
  familleQcTexte: [
    "Three tools that read reference tables compiled into the Worker, surveyed from the " +
      "ministère de la Justice du Québec. They make no outbound request and write nothing.",
    "The prefix states the SOURCE. Serving a courthouse address under canlii_ would credit " +
      "CanLII with data it never published; the split is enforced by tests, not merely documented.",
  ],

  // ── Schémas ────────────────────────────────────────────────────────────────
  schemaTexte: [
    "Every tool declares a closed schema: any property not listed is refused. These tables are " +
      "generated from the very same schema the validator applies at call time, so they cannot " +
      "drift from what the server accepts.",
  ],
  colParam: "Parameter",
  colType: "Type",
  colContrainte: "Constraints",
  requis: "required",

  // ── Numéro de dossier ──────────────────────────────────────────────────────
  dossierTexte: [
    "A Québec judicial file number reads NNN-NN-NNNNNN-NNN. Positions 1-3 are the registry — " +
      "courthouse and judicial district. Positions 5-6 are the jurisdiction — court, competence, " +
      "registry type. The remainder is a sequence and check digits.",
    "Positions 7 onward are NOT parsed, and no checksum is verified: there is none. Inventing " +
      "one would reject valid numbers, which is the worse of the two faults.",
    "A letter prefix short-circuits all of this: TAL-, TAQ-, C.F.- and the like name a tribunal " +
      "that numbers its own files. The prefix IS the answer to « which tribunal ».",
  ],
  dossierExemples: "Outcomes, produced by the real parser",
  dossierExemplesTexte: [
    "The examples below are not transcribed. The page runs the parser as it renders and prints " +
      "what it returns, so this documentation cannot drift from the behaviour.",
  ],
  colEntree: "Input",
  colIssue: "Outcome",

  // ── Greffes et palais ──────────────────────────────────────────────────────
  greffesTexte: [
    "The registries of Québec, keyed on the three-digit number a court file number begins with. " +
      "A registry is a REGISTER; a courthouse is a BUILDING — the relation is neither one-to-one " +
      "nor total, and one registry often serves several locations.",
  ],
  colGreffe: "Registry",
  colPalais: "Courthouse",
  colDistrict: "Judicial district",
  colAdresse: "Address",
  colTypeLieu: "Type",
  typePalais: "courthouse",
  typePoint: "service point",
  typeItinerant: "circuit court",
  sansAdresse: "no published address",
  filtrer: "Filter…",
  tousDistricts: "All districts",
  aucuneCoordonnee: "No contact information",
  aucuneCoordonneeTexte: [
    "This connector carries NO telephone number, no email address and no opening hours — for any " +
      "courthouse. That is a property of the data, not a failure of the page.",
    "Registry telephone numbers are published per chamber (Montréal alone publishes at least " +
      "four), on the Ministry's own site. Obtain them there.",
  ],
  juridictionsTitre: "Jurisdiction codes",
  juridictionsTexte: [
    "The two-digit code at positions 5-6. The em dash in codes 46, 72 and 73 is a real value: " +
      "those series belong to no named court.",
  ],
  colCode: "Code",
  colTribunal: "Court",
  colCompetence: "Competence",
  colGreffeType: "Registry type",
} as const;
