/**
 * Moteur d'appariement et de vérification sur les listes d'autorités dispensées.
 *
 * Indexation paresseuse en mémoire sur `EXEMPT_AUTHORITY_LISTS` / `EXEMPT_DECISIONS`
 * + repli CanLII borné (`lookupCase` / `searchLocal` / `caseBrowse` <= 3 appels)
 * lorsque `resolve_canlii !== false` et qu'un doute subsiste.
 */

import { describeError } from "../canlii/client";
import { CanliiBudgetError, relancerSiInterruptionGouverne } from "../canlii/errors";
import type { CaseListResponse, Lang } from "../canlii/types";
import { type CompareResult, compareTitles } from "../citation/compare";
import { type CitationForm, type Directory, parseCitation, resolve } from "../citation/parse";
import { persisterBalayages } from "../config";
import {
  EXEMPT_AUTHORITY_LISTS,
  EXEMPT_DECISIONS,
  type ExemptAuthorityEntry,
  type ExemptAuthorityList,
  type ExemptDecisionRecord,
} from "../data/exemptAuthorities";
import type { ToolContext } from "../mcp/registry";
import {
  type CaseRow,
  collectCaseTitles,
  rowFromListItem,
  searchLocal,
  upsertCases,
} from "../store/cases";
import { lookupCase } from "../store/lookup";
import {
  citationFormKeys,
  expandDbCaseKeys,
  extractDocketKeys,
  hasEnoughTextForTitleSearch,
  NEUTRE_VERS_DB,
  normalizeTribunal,
  publisherMatchKey,
  TRIBUNAUX,
} from "./normalize";

export type ExemptVerdict =
  | "DISPENSÉE"
  | "À VÉRIFIER"
  | "NON LISTÉE"
  | "ILLISIBLE"
  | "INDÉTERMINÉE";

export interface ExemptMatchItem {
  list: ExemptAuthorityList;
  entry: ExemptAuthorityEntry;
  decision: ExemptDecisionRecord;
  viaAffirming: boolean;
}

export interface ErroneousMatchItem {
  list: ExemptAuthorityList;
  entry: ExemptAuthorityEntry;
  decision: ExemptDecisionRecord;
  erroneousCite: string;
}

export interface CheckCitationInput {
  citation: string;
  expected_title?: string;
  expected_year?: number;
}

export interface CheckCitationOutcome {
  input: CheckCitationInput;
  verdict: ExemptVerdict;
  matches: ExemptMatchItem[];
  erroneous?: ErroneousMatchItem;
  titleMismatch?: string;
  yearMismatch?: string;
  resolvedViaCanlii?: boolean;
  resolvedRow?: CaseRow | null;
  indetermineeReason?: string;
  note?: string;
}

interface HorsCollectionMeta {
  entry: ExemptAuthorityEntry;
  decision: ExemptDecisionRecord;
  viaAffirming: boolean;
  year: number | null;
  databases: Set<string>;
}

interface AuthorityIndex {
  listsById: Map<string, ExemptAuthorityList>;
  listsByTribunal: Map<string, ExemptAuthorityList[]>;
  keyIndex: Map<string, ExemptMatchItem[]>;
  erroneousIndex: Map<string, ErroneousMatchItem[]>;
  horsCollectionByList: Map<string, HorsCollectionMeta[]>;
}

let cachedIndex: AuthorityIndex | null = null;

function inferHorsCollectionMeta(
  list: ExemptAuthorityList,
  entry: ExemptAuthorityEntry,
  decision: ExemptDecisionRecord,
  viaAffirming: boolean,
): HorsCollectionMeta {
  const sourceStr = viaAffirming
    ? (decision.citation_fr ?? decision.citation_en ?? decision.key)
    : entry.cleanText;
  const mYear =
    /\b(1[89]\d{2}|20\d{2})\b/.exec(decision.key) ?? /\b(1[89]\d{2}|20\d{2})\b/.exec(sourceStr);
  const year = mYear ? Number(mYear[1]) : null;

  const dbs = new Set<string>();
  const upper = sourceStr.toUpperCase();
  if (/\b(?:SCR|RCS|RSC|CSC|SCC)\b/.test(upper)) dbs.add("csc-scc");
  if (/\b(?:FCA|CAF)\b|\(FCA\)|\(CAF\)/.test(upper)) dbs.add("fca");
  if (/\b(?:FCR|RCF|FC|CF|FCT|CFPI|FTR|FCJ|NR)\b|IMM-|\(TD\)|\(F\.?C\.?\)/.test(upper)) {
    dbs.add("fct");
    dbs.add("fca");
  }
  if (/\(C\.A\.?\)/.test(sourceStr)) dbs.add("qcca");
  if (/\(C\.S\.?\)/.test(sourceStr)) dbs.add("qccs");
  if (/\bC\.?L\.?P\.?\b/.test(upper)) dbs.add("qcclp");
  if (/\bC\.?A\.?L\.?P\.?\b/.test(upper)) dbs.add("qccalp");
  if (/\bT\.?T\.?\b/.test(upper)) dbs.add("qctt");
  if (/\bT\.?A\.?\b/.test(upper)) dbs.add("qcdag");
  if (dbs.size === 0 && list.databaseId) dbs.add(list.databaseId);

  return { entry, decision, viaAffirming, year, databases: dbs };
}

function indexFormsFromString(str: string | null | undefined, out: Set<string>): void {
  if (!str) return;
  const parsed = parseCitation(str);
  const formes =
    parsed.primary.kind === "unparsed" ? parsed.parallel : [parsed.primary, ...parsed.parallel];
  for (const f of formes) {
    for (const k of citationFormKeys(f)) out.add(k);
  }
  for (const dk of extractDocketKeys(str)) out.add(dk);
}

function collectKeysForEntry(
  entry: ExemptAuthorityEntry,
  decision: ExemptDecisionRecord,
  viaAffirming: boolean,
): string[] {
  const keys = new Set<string>();

  if (!viaAffirming) {
    indexFormsFromString(entry.cleanText, keys);
    indexFormsFromString(entry.altEnText, keys);
  }
  indexFormsFromString(decision.neutral_fr, keys);
  indexFormsFromString(decision.neutral_en, keys);
  indexFormsFromString(decision.citation_fr, keys);
  indexFormsFromString(decision.citation_en, keys);
  indexFormsFromString(decision.canlii_cite, keys);
  for (const r of decision.reporters) indexFormsFromString(r, keys);
  for (const p of decision.publishers) keys.add(publisherMatchKey(p));
  for (const d of decision.dockets) {
    if (d.trim()) keys.add(`D:${d.trim().toUpperCase()}`);
  }
  if (decision.docket_number) {
    keys.add(`D:${decision.docket_number.trim().toUpperCase()}`);
    for (const dk of extractDocketKeys(decision.docket_number)) keys.add(dk);
  }
  if (decision.database_id && decision.case_id) {
    for (const k of expandDbCaseKeys(decision.database_id, decision.case_id)) keys.add(k);
  }
  // Clé stockée directement (p. ex. R:1981:1:SCR:504, R:2001:1:FCR:219, N:fct:2004:1125)
  if (decision.key.startsWith("N:")) {
    const [, fam, y, n] = decision.key.split(":");
    if (fam && y && n) {
      keys.add(decision.key);
      if (fam === "qcbdr" || fam === "qctmf") keys.add(`N:qcbdrvm:${y}:${n}`);
    }
  } else if (decision.key.startsWith("C:")) {
    keys.add(decision.key);
  } else if (decision.key.startsWith("R:")) {
    const [, y, v, s, p] = decision.key.split(":");
    if (v && s && p) {
      const sigs = s === "FC" || s === "FCR" ? ["FC", "FCR"] : [s];
      for (const sc of sigs) {
        keys.add(`R:${y}:${v}:${sc}:${p}`);
        if (v !== "_") keys.add(`R:_:${v}:${sc}:${p}`);
      }
    }
  } else if (decision.key.startsWith("P:") || decision.key.startsWith("D:")) {
    keys.add(decision.key);
  }

  return [...keys];
}

function buildIndex(): AuthorityIndex {
  const listsById = new Map<string, ExemptAuthorityList>();
  const listsByTribunal = new Map<string, ExemptAuthorityList[]>();
  const keyIndex = new Map<string, ExemptMatchItem[]>();
  const erroneousIndex = new Map<string, ErroneousMatchItem[]>();
  const horsCollectionByList = new Map<string, HorsCollectionMeta[]>();

  const pushKey = (k: string, item: ExemptMatchItem) => {
    const arr = keyIndex.get(k);
    if (arr) arr.push(item);
    else keyIndex.set(k, [item]);
  };

  for (const list of EXEMPT_AUTHORITY_LISTS) {
    listsById.set(list.listId, list);
    const tArr = listsByTribunal.get(list.tribunal) ?? [];
    tArr.push(list);
    listsByTribunal.set(list.tribunal, tArr);

    const hors: HorsCollectionMeta[] = [];
    for (const entry of list.entries) {
      const decision = EXEMPT_DECISIONS[entry.decisionKey];
      if (!decision) continue;

      const primaryItem: ExemptMatchItem = { list, entry, decision, viaAffirming: false };
      for (const k of collectKeysForEntry(entry, decision, false)) {
        pushKey(k, primaryItem);
      }
      if (decision.status === "hors_collection") {
        hors.push(inferHorsCollectionMeta(list, entry, decision, false));
      }

      for (const errCite of entry.erroneousSourceCitations) {
        const parsedErr = parseCitation(errCite);
        const errForms =
          parsedErr.primary.kind === "unparsed"
            ? parsedErr.parallel
            : [parsedErr.primary, ...parsedErr.parallel];
        for (const f of errForms) {
          for (const k of citationFormKeys(f)) {
            const arr = erroneousIndex.get(k) ?? [];
            arr.push({ list, entry, decision, erroneousCite: errCite });
            erroneousIndex.set(k, arr);
          }
        }
      }

      if (entry.affirmingDecisionKey) {
        const affDec = EXEMPT_DECISIONS[entry.affirmingDecisionKey];
        if (affDec) {
          const affItem: ExemptMatchItem = {
            list,
            entry,
            decision: affDec,
            viaAffirming: true,
          };
          for (const k of collectKeysForEntry(entry, affDec, true)) {
            pushKey(k, affItem);
          }
          if (affDec.status === "hors_collection") {
            hors.push(inferHorsCollectionMeta(list, entry, affDec, true));
          }
        }
      }
    }
    horsCollectionByList.set(list.listId, hors);
  }

  return { listsById, listsByTribunal, keyIndex, erroneousIndex, horsCollectionByList };
}

export function getAuthorityIndex(): AuthorityIndex {
  if (!cachedIndex) cachedIndex = buildIndex();
  return cachedIndex;
}

/** Résout et valide la portée (`list_id` / `tribunal`) demandée. */
export function resolveTargetLists(params: {
  list_id?: string | null;
  tribunal?: string | null;
}):
  | { ok: true; lists: ExemptAuthorityList[]; tribNorm: string | null }
  | { ok: false; error: string } {
  const idx = getAuthorityIndex();
  const listId = params.list_id?.trim() || null;
  const tribRaw = params.tribunal?.trim() || null;

  let tribNorm: string | null = null;
  if (tribRaw) {
    tribNorm = normalizeTribunal(tribRaw);
    if (!tribNorm || !idx.listsByTribunal.has(tribNorm)) {
      const valides = Object.keys(TRIBUNAUX).join(", ");
      return {
        ok: false,
        error: `Tribunal inconnu : « ${tribRaw} ». Tribunaux disponibles : ${valides}.`,
      };
    }
  }

  if (listId) {
    const l = idx.listsById.get(listId);
    if (!l) {
      const valides = [...idx.listsById.keys()].join(", ");
      return {
        ok: false,
        error: `Liste inconnue : « ${listId} ». Identifiants disponibles : ${valides}.`,
      };
    }
    if (tribNorm && l.tribunal !== tribNorm) {
      return {
        ok: false,
        error: `La liste « ${listId} » relève du tribunal « ${l.tribunal} » et non de « ${tribNorm} ».`,
      };
    }
    return { ok: true, lists: [l], tribNorm: l.tribunal };
  }

  if (tribNorm) {
    return { ok: true, lists: idx.listsByTribunal.get(tribNorm) ?? [], tribNorm };
  }

  return { ok: true, lists: [...EXEMPT_AUTHORITY_LISTS], tribNorm: null };
}

function allDecisionTitles(
  decision: ExemptDecisionRecord,
  entry: ExemptAuthorityEntry,
  viaAffirming: boolean,
): string[] {
  const out: string[] = [];
  for (const t of [decision.title_fr, decision.title_en, ...decision.source_titles]) {
    if (t && !out.includes(t)) out.push(t);
  }
  if (!viaAffirming) {
    for (const n of entry.nicknames) {
      if (n && !out.includes(n)) out.push(n);
    }
  }
  return out;
}

function bestTitleComparison(
  expectedTitle: string,
  candidateTitles: string[],
): CompareResult | null {
  if (candidateTitles.length === 0) return null;
  const rank = (v: CompareResult["verdict"]) => (v === "appariement" ? 2 : v === "partiel" ? 1 : 0);
  let best = compareTitles(expectedTitle, candidateTitles[0]!);
  for (const cand of candidateTitles.slice(1)) {
    const c = compareTitles(expectedTitle, cand);
    if (
      rank(c.verdict) > rank(best.verdict) ||
      (rank(c.verdict) === rank(best.verdict) && c.jaccard > best.jaccard)
    ) {
      best = c;
    }
  }
  return best;
}

function knownYearsForDecision(
  decision: ExemptDecisionRecord,
  entry: ExemptAuthorityEntry,
): Set<number> {
  const years = new Set<number>();
  if (decision.decision_date) {
    const y = Number(decision.decision_date.slice(0, 4));
    if (Number.isFinite(y) && y > 1800) years.add(y);
  }
  for (const str of [
    decision.citation_fr,
    decision.citation_en,
    decision.neutral_fr,
    decision.neutral_en,
    decision.canlii_cite,
    ...decision.reporters,
    entry.cleanText,
  ]) {
    if (!str) continue;
    for (const m of str.matchAll(/\b(1[89]\d{2}|20\d{2})\b/g)) {
      years.add(Number(m[1]));
    }
  }
  return years;
}

function verifyExpectedMetadata(
  matches: ExemptMatchItem[],
  expectedTitle: string | null,
  expectedYear: number | null,
): { titleMismatch?: string; yearMismatch?: string } {
  const first = matches[0]!;
  let titleMismatch: string | undefined;
  let yearMismatch: string | undefined;

  if (expectedTitle && expectedTitle.trim().length > 0) {
    const candTitles = matches.flatMap((m) =>
      allDecisionTitles(m.decision, m.entry, m.viaAffirming),
    );
    const cmp = bestTitleComparison(expectedTitle, candTitles);
    if (cmp && cmp.verdict !== "appariement") {
      const attendu = candTitles[0] ?? first.entry.cleanText;
      titleMismatch =
        cmp.verdict === "partiel"
          ? `Intitulé partiel (« ${expectedTitle} » vs « ${attendu} »)`
          : `Intitulé discordant (« ${expectedTitle} » vs « ${attendu} »)`;
    }
  }

  if (expectedYear !== null) {
    const years = new Set<number>();
    for (const m of matches) {
      for (const y of knownYearsForDecision(m.decision, m.entry)) years.add(y);
    }
    if (years.size > 0 && !years.has(expectedYear)) {
      const decYear = first.decision.decision_date
        ? Number(first.decision.decision_date.slice(0, 4))
        : null;
      const withinReporterLag =
        decYear !== null &&
        Math.abs(decYear - expectedYear) <= 1 &&
        first.decision.reporters.length > 0;
      if (!withinReporterLag) {
        yearMismatch = `Année attendue ${expectedYear} différente de ${[...years].sort().join(" / ")}`;
      }
    }
  }

  return { titleMismatch, yearMismatch };
}

function deduplicateMatches(items: ExemptMatchItem[]): ExemptMatchItem[] {
  const seen = new Set<string>();
  const out: ExemptMatchItem[] = [];
  for (const item of items) {
    const sig = `${item.list.listId}#${item.entry.position}#${item.viaAffirming ? "aff" : "pri"}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(item);
  }
  return out;
}

function hasCompatibleHorsCollection(
  idx: AuthorityIndex,
  targetListIds: Set<string>,
  year: number | null,
  targetDb: string | null,
): boolean {
  for (const listId of targetListIds) {
    const hors = idx.horsCollectionByList.get(listId) ?? [];
    for (const h of hors) {
      const yearOk = year === null || h.year === null || Math.abs(h.year - year) <= 1;
      const dbOk = targetDb === null || h.databases.size === 0 || h.databases.has(targetDb);
      if (yearOk && dbOk) return true;
    }
  }
  return false;
}

function matchRowAgainstLists(
  idx: AuthorityIndex,
  row: CaseRow,
  targetListIds: Set<string>,
): ExemptMatchItem[] {
  const keys = new Set<string>(expandDbCaseKeys(row.database_id, row.case_id));
  if (row.neutral_cite) indexFormsFromString(row.neutral_cite, keys);
  if (row.citation) indexFormsFromString(row.citation, keys);

  const rawHits: ExemptMatchItem[] = [];
  for (const k of keys) {
    for (const h of idx.keyIndex.get(k) ?? []) {
      if (targetListIds.has(h.list.listId)) rawHits.push(h);
    }
  }
  if (rawHits.length > 0) return deduplicateMatches(rawHits);

  // Vérifier aussi les entrées `hors_collection` de la cible par titre + tribunal/année
  const rowYear = row.decision_date ? Number(row.decision_date.slice(0, 4)) : null;
  const caseYearM = /^(\d{4})/.exec(row.case_id);
  const effYear = rowYear ?? (caseYearM ? Number(caseYearM[1]) : null);
  const rowTitles = collectCaseTitles(row);

  for (const listId of targetListIds) {
    for (const h of idx.horsCollectionByList.get(listId) ?? []) {
      const dbMatch = h.databases.size === 0 || h.databases.has(row.database_id);
      const yrMatch = effYear === null || h.year === null || Math.abs(h.year - effYear) <= 1;
      if (!dbMatch || !yrMatch) continue;
      const candTitles = allDecisionTitles(h.decision, h.entry, h.viaAffirming);
      for (const rt of rowTitles) {
        const cmp = bestTitleComparison(rt, candTitles);
        if (cmp?.verdict === "appariement") {
          rawHits.push({
            list: idx.listsById.get(listId)!,
            entry: h.entry,
            decision: h.decision,
            viaAffirming: h.viaAffirming,
          });
          break;
        }
      }
    }
  }
  return deduplicateMatches(rawHits);
}

function inferYearFromInput(
  citation: string,
  expectedYear: number | null,
  forms: CitationForm[],
): number | null {
  if (expectedYear !== null) return expectedYear;
  for (const f of forms) {
    if ("year" in f && f.year !== null) return f.year;
  }
  const m = /\b(1[89]\d{2}|20\d{2})\b/.exec(citation);
  return m ? Number(m[1]) : null;
}

function targetDatabasesForFallback(targetLists: readonly ExemptAuthorityList[]): string[] {
  const dbs = new Set<string>();
  for (const l of targetLists) {
    const tm = TRIBUNAUX[l.tribunal];
    for (const d of tm?.defaultDatabases ?? [l.databaseId]) {
      dbs.add(d);
    }
  }
  return [...dbs];
}

/**
 * Vérifie une référence individuelle contre les listes ciblées (`list_id` ou `tribunal`).
 */
export async function checkExemptCitation(
  input: CheckCitationInput,
  targetLists: readonly ExemptAuthorityList[],
  opts: {
    resolveCanlii: boolean;
    lang: Lang;
    ctx: ToolContext;
    dir: Directory;
    now: Date;
  },
): Promise<CheckCitationOutcome> {
  const idx = getAuthorityIndex();
  const targetListIds = new Set(targetLists.map((l) => l.listId));
  const rawCite = input.citation.trim();

  if (rawCite.length === 0) {
    return { input, verdict: "ILLISIBLE", matches: [] };
  }

  const parsed = parseCitation(rawCite);
  const forms: CitationForm[] =
    parsed.primary.kind === "unparsed" ? parsed.parallel : [parsed.primary, ...parsed.parallel];
  const docketKeys = extractDocketKeys(rawCite);

  const allKeys = new Set<string>(docketKeys);
  for (const f of forms) {
    for (const k of citationFormKeys(f)) allKeys.add(k);
  }

  const expectedTitle = input.expected_title?.trim() || parsed.inlineTitle || null;
  const expectedYear = input.expected_year ?? null;

  // 1. Repérage des coquilles connues des listes sources -> À VÉRIFIER prioritaire
  for (const k of allKeys) {
    const errs = idx.erroneousIndex.get(k) ?? [];
    const hit = errs.find((e) => targetListIds.has(e.list.listId));
    if (hit) {
      return {
        input,
        verdict: "À VÉRIFIER",
        matches: [
          { list: hit.list, entry: hit.entry, decision: hit.decision, viaAffirming: false },
        ],
        erroneous: hit,
      };
    }
  }

  // 2. Appariement hors ligne direct
  const directHits: ExemptMatchItem[] = [];
  for (const k of allKeys) {
    for (const h of idx.keyIndex.get(k) ?? []) {
      if (targetListIds.has(h.list.listId)) directHits.push(h);
    }
  }
  const matches = deduplicateMatches(directHits);
  if (matches.length > 0) {
    const { titleMismatch, yearMismatch } = verifyExpectedMetadata(
      matches,
      expectedTitle,
      expectedYear,
    );
    return {
      input,
      verdict: titleMismatch || yearMismatch ? "À VÉRIFIER" : "DISPENSÉE",
      matches,
      titleMismatch,
      yearMismatch,
    };
  }

  // 3. Formes inexploitables
  const hasConstructible = forms.some(
    (f) => f.kind === "neutral" || (f.kind === "canlii" && f.juris !== null && f.court !== null),
  );
  if (
    parsed.primary.kind === "unparsed" &&
    docketKeys.length === 0 &&
    !hasEnoughTextForTitleSearch(rawCite)
  ) {
    return { input, verdict: "ILLISIBLE", matches: [] };
  }

  // 4. Mode hors ligne strict
  if (!opts.resolveCanlii) {
    return {
      input,
      verdict: "NON LISTÉE",
      matches: [],
      note: "Vérification hors ligne uniquement (resolve_canlii=false ; aucun appel à CanLII).",
    };
  }

  // 5a. Repli CanLII pour citation constructible non appariée (seulement si hors_collection compatible)
  if (hasConstructible) {
    const form = forms.find(
      (f): f is Extract<CitationForm, { kind: "neutral" | "canlii" }> =>
        f.kind === "neutral" || (f.kind === "canlii" && f.juris !== null && f.court !== null),
    )!;
    const res = resolve(form, opts.dir);
    const targetDb =
      res.databaseId ?? (form.kind === "neutral" ? (NEUTRE_VERS_DB[form.code] ?? null) : null);

    if (!hasCompatibleHorsCollection(idx, targetListIds, form.year, targetDb)) {
      return { input, verdict: "NON LISTÉE", matches: [] };
    }

    try {
      const lookup = await lookupCase(form, res, {
        db: opts.ctx.db,
        client: opts.ctx.client,
        dir: opts.dir,
        lang: opts.lang,
        refresh: false,
        now: opts.now,
      });
      if (lookup.status === "budget" || lookup.status === "erreur") {
        return {
          input,
          verdict: "INDÉTERMINÉE",
          matches: [],
          indetermineeReason: lookup.message ?? "Interruption CanLII.",
        };
      }
      if (lookup.status === "trouvee" && lookup.row) {
        const canliiHits = matchRowAgainstLists(idx, lookup.row, targetListIds);
        if (canliiHits.length > 0) {
          const { titleMismatch, yearMismatch } = verifyExpectedMetadata(
            canliiHits,
            expectedTitle,
            expectedYear,
          );
          return {
            input,
            verdict: titleMismatch || yearMismatch ? "À VÉRIFIER" : "DISPENSÉE",
            matches: canliiHits,
            titleMismatch,
            yearMismatch,
            resolvedViaCanlii: true,
            resolvedRow: lookup.row,
          };
        }
      }
      return { input, verdict: "NON LISTÉE", matches: [], resolvedRow: lookup.row };
    } catch (e) {
      relancerSiInterruptionGouverne(e);
      return {
        input,
        verdict: "INDÉTERMINÉE",
        matches: [],
        indetermineeReason: describeError(e),
      };
    }
  }

  // 5b. Repli CanLII pour recueil / éditeur / CanLII sans parenthèses / intitulé seul
  const partyQuery = expectedTitle ?? (parsed.primary.kind === "unparsed" ? rawCite : null);
  const inferredYear = inferYearFromInput(rawCite, expectedYear, forms);

  if (!partyQuery || !hasEnoughTextForTitleSearch(partyQuery)) {
    if (hasCompatibleHorsCollection(idx, targetListIds, inferredYear, null)) {
      return {
        input,
        verdict: "À VÉRIFIER",
        matches: [],
        note:
          "Citation de recueil/éditeur sans intitulé de parties : la liste visée comporte des entrées " +
          "non indexées sur CanLII pour cette période — préciser l'intitulé pour résoudre ou vérifier la liste source.",
      };
    }
    return { input, verdict: "NON LISTÉE", matches: [] };
  }

  // Chercher d'abord dans l'index local D1
  const localRows = await searchLocal(opts.ctx.db, partyQuery, {
    yearFrom: inferredYear ? inferredYear - 1 : null,
    yearTo: inferredYear ? inferredYear + 1 : null,
    limit: 20,
  });
  for (const row of localRows) {
    const cmp = bestTitleComparison(partyQuery, collectCaseTitles(row));
    if (!cmp || cmp.verdict === "discordance") continue;
    const hitLists = matchRowAgainstLists(idx, row, targetListIds);
    if (hitLists.length > 0) {
      const { titleMismatch, yearMismatch } = verifyExpectedMetadata(
        hitLists,
        expectedTitle,
        expectedYear,
      );
      return {
        input,
        verdict: titleMismatch || yearMismatch ? "À VÉRIFIER" : "DISPENSÉE",
        matches: hitLists,
        titleMismatch,
        yearMismatch,
        resolvedViaCanlii: true,
        resolvedRow: row,
      };
    }
  }

  // Balayage vif borné (au plus 3 appels) sur les bases cibles du tribunal
  const candDbs = targetDatabasesForFallback(targetLists).slice(0, 3);
  const sweepYear = inferredYear ?? opts.now.getUTCFullYear();
  const maxSweepCalls = 3;
  let callsDone = 0;
  const persister = persisterBalayages(opts.ctx.env);

  try {
    for (const dbId of candDbs) {
      if (callsDone >= maxSweepCalls || opts.ctx.client.remaining() === 0) break;
      callsDone++;
      const page = await opts.ctx.client.get<CaseListResponse>(`caseBrowse/${opts.lang}/${dbId}/`, {
        offset: 0,
        resultCount: 5000,
        decisionDateAfter: `${sweepYear}-01-01`,
        decisionDateBefore: `${sweepYear}-12-31`,
      });
      const rows = (page.cases ?? [])
        .map((it) => rowFromListItem(it, dbId, opts.lang, "sweep", opts.now))
        .filter((r): r is CaseRow => r !== null);
      if (persister && rows.length > 0) await upsertCases(opts.ctx.db, rows);

      for (const row of rows) {
        const cmp = bestTitleComparison(partyQuery, [row.title]);
        if (!cmp || cmp.verdict === "discordance") continue;
        const hitLists = matchRowAgainstLists(idx, row, targetListIds);
        if (hitLists.length > 0) {
          const { titleMismatch, yearMismatch } = verifyExpectedMetadata(
            hitLists,
            expectedTitle,
            expectedYear,
          );
          return {
            input,
            verdict: titleMismatch || yearMismatch ? "À VÉRIFIER" : "DISPENSÉE",
            matches: hitLists,
            titleMismatch,
            yearMismatch,
            resolvedViaCanlii: true,
            resolvedRow: row,
          };
        }
      }
    }
  } catch (e) {
    relancerSiInterruptionGouverne(e);
    if (e instanceof CanliiBudgetError) {
      return {
        input,
        verdict: "INDÉTERMINÉE",
        matches: [],
        indetermineeReason: "Budget d'appels CanLII épuisé.",
      };
    }
    return {
      input,
      verdict: "INDÉTERMINÉE",
      matches: [],
      indetermineeReason: describeError(e),
    };
  }

  // En tout dernier ressort (uniquement pour requête par intitulé seul sans forme recueil/éditeur),
  // apparier une entrée non CanLII (hors_collection / hors_juridiction) par intitulé exact.
  if (forms.length === 0) {
    const horsHits: ExemptMatchItem[] = [];
    for (const list of targetLists) {
      for (const entry of list.entries) {
        const decision = EXEMPT_DECISIONS[entry.decisionKey];
        if (!decision || decision.status === "canlii") continue;
        if (inferredYear !== null) {
          const ky = knownYearsForDecision(decision, entry);
          if (ky.size > 0 && ![...ky].some((y) => Math.abs(y - inferredYear) <= 1)) continue;
        }
        const cmp = bestTitleComparison(partyQuery, allDecisionTitles(decision, entry, false));
        if (cmp?.verdict === "appariement") {
          horsHits.push({ list, entry, decision, viaAffirming: false });
        }
      }
    }
    if (horsHits.length === 1) {
      const deduped = deduplicateMatches(horsHits);
      const { titleMismatch, yearMismatch } = verifyExpectedMetadata(
        deduped,
        expectedTitle,
        expectedYear,
      );
      return {
        input,
        verdict: titleMismatch || yearMismatch ? "À VÉRIFIER" : "DISPENSÉE",
        matches: deduped,
        titleMismatch,
        yearMismatch,
        note: "Appariement par intitulé sur une entrée hors CanLII de la liste.",
      };
    }
  }

  return { input, verdict: "NON LISTÉE", matches: [] };
}

export function canliiBestLink(decision: ExemptDecisionRecord, lang: Lang): string | null {
  return lang === "en"
    ? (decision.url_en ?? decision.url_fr)
    : (decision.url_fr ?? decision.url_en);
}

export function canliiCitationForLang(decision: ExemptDecisionRecord, lang: Lang): string | null {
  return lang === "en"
    ? (decision.citation_en ?? decision.citation_fr ?? decision.neutral_en ?? decision.neutral_fr)
    : (decision.citation_fr ?? decision.citation_en ?? decision.neutral_fr ?? decision.neutral_en);
}

export function canliiTitleForLang(decision: ExemptDecisionRecord, lang: Lang): string | null {
  return lang === "en"
    ? (decision.title_en ?? decision.title_fr)
    : (decision.title_fr ?? decision.title_en);
}

export function canliiKeywordsForLang(decision: ExemptDecisionRecord, lang: Lang): string | null {
  return lang === "en"
    ? (decision.keywords_en ?? decision.keywords_fr)
    : (decision.keywords_fr ?? decision.keywords_en);
}
