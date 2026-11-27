export type Lang = "fr" | "en";

export interface CaseDatabasesResponse {
  caseDatabases?: CaseDatabase[];
}
interface CaseDatabase {
  databaseId?: string;
  jurisdiction?: string;
  name?: string;
}

export interface LegislationDatabasesResponse {
  legislationDatabases?: LegislationDatabase[];
}
interface LegislationDatabase {
  databaseId?: string;
  type?: string;
  jurisdiction?: string;
  name?: string;
}

export interface CaseListResponse {
  cases?: CaseListItem[];
}
export interface CaseListItem {
  databaseId?: string;
  caseId?: Record<string, string> | string;
  title?: string;
  citation?: string;
}

export interface CaseMetadata {
  databaseId?: string;
  caseId?: Record<string, string> | string;
  url?: string;
  title?: string;
  citation?: string;
  language?: string;
  docketNumber?: string;
  decisionDate?: string;
  keywords?: string;
  concatenatedId?: string;
}

export interface CitedLegislationsResponse {
  citedLegislations?: LegislationListItem[];
}

export interface LegislationListResponse {
  legislations?: LegislationListItem[];
}
export interface LegislationListItem {
  databaseId?: string;
  legislationId?: string;
  title?: string;
  citation?: string;
  type?: string;
}

export interface LegislationMetadata {
  legislationId?: string;
  url?: string;
  title?: string;
  citation?: string;
  type?: string;
  language?: string;
  dateScheme?: string;
  startDate?: string;
  endDate?: string;
  repealed?: string | boolean;
  content?: unknown[];
}

export interface CanliiErrorBody {
  error?: string;
  message?: string;
}

export const METADATA_TYPE = {
  cited: "citedCases",
  citing: "citingCases",
  legislation: "citedLegislations",
} as const;

export type CitatorRel = keyof typeof METADATA_TYPE;
