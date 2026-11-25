// GÉNÉRÉ PAR scripts/compile-authorities.mjs — NE PAS ÉDITER À LA MAIN.
// Source : data/autorites-dispensees.md + data/autorites-enrichies.json

import rawData from "./exemptAuthorities.json";

export interface ExemptDecisionRecord {
  key: string;
  status: "canlii" | "hors_collection" | "hors_juridiction";
  database_id: string | null;
  case_id: string | null;
  decision_date: string | null;
  docket_number: string | null;
  title_fr: string | null;
  title_en: string | null;
  source_titles: string[];
  url_fr: string | null;
  url_en: string | null;
  citation_fr: string | null;
  citation_en: string | null;
  neutral_fr: string | null;
  neutral_en: string | null;
  canlii_cite: string | null;
  reporters: string[];
  publishers: string[];
  dockets: string[];
  keywords_fr: string | null;
  keywords_en: string | null;
}

export interface ExemptAuthorityEntry {
  listId: string;
  position: number;
  tabNumber: number | null;
  subdivision: string | null;
  rawText: string;
  cleanText: string;
  altEnText: string | null;
  sourceDescriptors: string | null;
  nicknames: string[];
  sourceLangNote: string | null;
  sourceUrls: string[];
  transcriptionNote: string | null;
  erroneousSourceCitations: string[];
  decisionKey: string;
  affirmingDecisionKey: string | null;
}

export interface ExemptAuthorityList {
  section: string;
  listId: string;
  tribunal: string;
  tribunalNomFr: string;
  tribunalNomEn: string;
  databaseId: string;
  jurisdiction: string;
  titleFr: string;
  titleEn: string;
  versionLabel: string;
  effectiveDate: string | null;
  modifiedDate: string | null;
  compiledAt: string;
  sourceUrl: string;
  directiveUrl: string | null;
  relatedUrls: string[];
  fondementReglementaire: string | null;
  consigneCitation: string;
  entries: ExemptAuthorityEntry[];
}

export const EXEMPT_AUTHORITY_STATS = {
  listCount: 27,
  totalEntries: 864,
  totalLinks: 750,
  uniqueDecisions: 737,
} as const;

const donneesCompilees = rawData as unknown as {
  lists: readonly ExemptAuthorityList[];
  decisions: Readonly<Record<string, ExemptDecisionRecord>>;
};

export const EXEMPT_AUTHORITY_LISTS: readonly ExemptAuthorityList[] = donneesCompilees.lists;

export const EXEMPT_DECISIONS: Readonly<Record<string, ExemptDecisionRecord>> =
  donneesCompilees.decisions;
