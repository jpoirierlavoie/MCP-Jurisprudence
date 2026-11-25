/**
 * Compilateur statique des listes d'autorités dispensées vers `src/data/exemptAuthorities.ts`.
 *
 * Lit `data/autorites-dispensees.md` (source verbatim) et `data/autorites-enrichies.json`
 * (métadonnées CanLII vérifiées), valide l'ensemble des URLs contre la liste blanche
 * d'hôtes officiels, et émet le module TypeScript embarqué par le Worker.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extraireFormesEtClef,
  parseAutoritesMarkdown,
  RACINE_DEPOT,
} from "./lib/parse-autorites-md.mjs";

export const CHEMIN_ENRICHIES = resolve(RACINE_DEPOT, "data/autorites-enrichies.json");
export const CHEMIN_SORTIE_JSON = resolve(RACINE_DEPOT, "src/data/exemptAuthorities.json");
export const CHEMIN_SORTIE_TS = resolve(RACINE_DEPOT, "src/data/exemptAuthorities.ts");

export const HOTES_SOURCES_AUTORISES = new Set([
  "bailii.org",
  "canlii.ca",
  "citoyens.soquij.qc.ca",
  "courdappelduquebec.ca",
  "courduquebec.ca",
  "coursuperieureduquebec.ca",
  "decisions.fca-caf.gc.ca",
  "decisions.fct-cf.gc.ca",
  "decisions.scc-csc.ca",
  "ised-isde.canada.ca",
  "library2.usask.ca",
  "reports.fja-cmf.gc.ca",
  "scc-csc.lexum.com",
  "scc.lexum.org",
  "supreme.justia.com",
  "t.soquij.ca",
  "tmf.gouv.qc.ca",
  "tribunaldesdroitsdelapersonne.ca",
  "tribunaldesprofessions.ca",
  "unik.caij.qc.ca",
  "www.bailii.org",
  "www.canlii.ca",
  "www.canlii.org",
  "www.courduquebec.ca",
  "www.coursuperieureduquebec.ca",
  "www.fct-cf.ca",
  "www.fct-cf.gc.ca",
  "www.tat.gouv.qc.ca",
]);

function validerUrlSource(url, contexte) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`URL invalide (${contexte}) : ${url}`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error(`Protocole interdit (${contexte}) : ${url}`);
  }
  if (!HOTES_SOURCES_AUTORISES.has(u.hostname)) {
    throw new Error(`Hôte source non autorisé (${contexte}) : ${u.hostname}`);
  }
}

function validerUrlCanlii(url, contexte) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`URL CanLII invalide (${contexte}) : ${url}`);
  }
  if (
    u.protocol !== "https:" ||
    (u.hostname !== "canlii.ca" && !u.hostname.endsWith(".canlii.ca"))
  ) {
    throw new Error(`URL CanLII hors domaine (${contexte}) : ${url}`);
  }
}

function dedup(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const v = typeof x === "string" ? x.trim() : "";
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function extraireTitreSource(texte) {
  if (!texte) return "";
  let s = texte
    // Retirer d'éventuels numéros d'affaire en queue
    .replace(/,\s*(?:C\.L\.P\.|D\.T\.E\.|88-A-|IMM-).*$/i, "")
    // Retirer l'amorce d'une citation recueil/neutre/CanLII/éditeur
    .replace(
      /(?:,\s*|\s+\(\d{4}\),?\s*)(?:\[\d{4}\]|\d{4}\s+(?:CSC|SCC|CAF|FCA|CF|FC|FCT|CFPI|QCCA|QCCS|QCCQ|QCTP|QCTDP|QCCLP|QCCRT|QCBDRVM|QCBDR|QCTMF|BCCA|YKCA|ONCA|CanLII|Carswell)|C\.L\.P\.|D\.T\.E\.|J\.E\.|REJB|EYB|AZ-|\d{1,4}\s+(?:C\.?P\.?R\.?|D\.?L\.?R\.?|F\.?T\.?R\.?|N\.?R\.?|A\.C\.|U\.?S\.?)).*$/i,
      "",
    )
    .replace(/\s*\(\d{4}\)\s*$/, "")
    .replace(/\s*,\s*$/, "")
    .trim();
  // Enlever un suffixe "(C.A.)" / "(T.D.)" / "(F.C.)" / "(QL)" / "(QC CA)" résiduel
  s = s.replace(/\s*\((?:C\.A\.|C\.S\.|T\.A\.|T\.D\.|F\.C\.|QL|QC\s*CA|QC\s*CS)\)\s*$/i, "").trim();
  return s;
}

export function buildCompiledAuthoritiesData(mdPath = undefined, enrichiesPath = CHEMIN_ENRICHIES) {
  const { lists, totalEntries, totalLinks } = parseAutoritesMarkdown(mdPath);
  const enrichiesRaw = JSON.parse(readFileSync(enrichiesPath, "utf8"));
  const enrichies = enrichiesRaw.decisions ?? {};

  const sourceMetaByKey = new Map();
  const enregistrerSource = (key, cleanText, altEnText, formes) => {
    let acc = sourceMetaByKey.get(key);
    if (!acc) {
      acc = {
        titles: [],
        neutrals: [],
        canliis: [],
        reporters: [],
        publishers: [],
        dockets: [],
      };
      sourceMetaByKey.set(key, acc);
    }
    const t1 = extraireTitreSource(cleanText);
    if (t1) acc.titles.push(t1);
    if (altEnText) {
      const t2 = extraireTitreSource(altEnText);
      if (t2) acc.titles.push(t2);
    }
    for (const n of formes.neutralMatches) acc.neutrals.push(n.raw);
    for (const c of formes.canliiMatches) acc.canliis.push(c.raw);
    for (const r of formes.reporterMatches) acc.reporters.push(r.raw);
    for (const p of formes.publisherMatches) acc.publishers.push(p.raw);
    for (const d of formes.docketMatches) acc.dockets.push(d);
  };

  const compiledLists = lists.map((l) => {
    validerUrlSource(l.sourceUrl, `${l.listId}.sourceUrl`);
    if (l.directiveUrl) validerUrlSource(l.directiveUrl, `${l.listId}.directiveUrl`);
    for (const ru of l.relatedUrls) validerUrlSource(ru, `${l.listId}.relatedUrls`);

    const entries = l.entries.map((e) => {
      for (const u of e.sourceUrls) {
        validerUrlSource(u, `${l.listId}#${e.position}`);
      }
      enregistrerSource(e.decisionKey, e.cleanText, e.altEnText, e.formes);
      if (e.affirming) {
        enregistrerSource(e.affirming.decisionKey, e.affirming.rawText, null, e.affirming.formes);
      }

      return {
        listId: e.listId,
        position: e.position,
        tabNumber: e.tabNumber,
        subdivision: e.subdivision,
        rawText: e.rawText,
        cleanText: e.cleanText,
        altEnText: e.altEnText,
        sourceDescriptors: e.sourceDescriptors,
        nicknames: e.nicknames,
        sourceLangNote: e.sourceLangNote,
        sourceUrls: e.sourceUrls,
        transcriptionNote: e.transcriptionNote,
        erroneousSourceCitations: e.erroneousSourceCitations,
        decisionKey: e.decisionKey,
        affirmingDecisionKey: e.affirming ? e.affirming.decisionKey : null,
      };
    });

    return {
      section: l.section,
      listId: l.listId,
      tribunal: l.tribunal,
      tribunalNomFr: l.tribunalNomFr,
      tribunalNomEn: l.tribunalNomEn,
      databaseId: l.databaseId,
      jurisdiction: l.jurisdiction,
      titleFr: l.titleFr,
      titleEn: l.titleEn,
      versionLabel: l.versionLabel,
      effectiveDate: l.effectiveDate,
      modifiedDate: l.modifiedDate,
      compiledAt: l.compiledAt,
      sourceUrl: l.sourceUrl,
      directiveUrl: l.directiveUrl,
      relatedUrls: l.relatedUrls,
      fondementReglementaire: l.fondementReglementaire,
      consigneCitation: l.consigneCitation,
      entries,
    };
  });

  const decisions = {};
  for (const key of [...sourceMetaByKey.keys()].sort()) {
    const rec = enrichies[key];
    if (!rec) {
      throw new Error(`Clé absente de data/autorites-enrichies.json : ${key}`);
    }
    if (rec.url_fr) validerUrlCanlii(rec.url_fr, `${key}.url_fr`);
    if (rec.url_en) validerUrlCanlii(rec.url_en, `${key}.url_en`);

    const src = sourceMetaByKey.get(key);
    const formesFr = rec.citation_fr ? extraireFormesEtClef(rec.citation_fr) : null;
    const formesEn = rec.citation_en ? extraireFormesEtClef(rec.citation_en) : null;

    const reporters = dedup([
      ...(rec.reporters ?? []),
      ...src.reporters,
      ...(formesFr?.reporterMatches.map((x) => x.raw) ?? []),
      ...(formesEn?.reporterMatches.map((x) => x.raw) ?? []),
    ]);
    const publishers = dedup([
      ...(rec.publishers ?? []),
      ...src.publishers,
      ...(formesFr?.publisherMatches.map((x) => x.raw) ?? []),
      ...(formesEn?.publisherMatches.map((x) => x.raw) ?? []),
    ]);
    const dockets = dedup([rec.docket_number ?? "", ...src.dockets]);

    let neutralFr = rec.neutral_fr ?? null;
    let neutralEn = rec.neutral_en ?? null;
    if (!neutralFr) {
      const f = src.neutrals.find((x) =>
        /\b(?:CSC|CAF|CF|CFPI|QCCA|QCCS|QCCQ|QCTP|QCTDP|QCCLP|QCCRT|QCBDRVM|QCBDR|QCTMF)\b/i.test(
          x,
        ),
      );
      if (f) neutralFr = f;
    }
    if (!neutralEn) {
      const e = src.neutrals.find((x) => /\b(?:SCC|FCA|FC|FCT|BCCA|YKCA)\b/i.test(x));
      if (e) neutralEn = e;
    }

    const canliiCite = rec.canlii_cite ?? src.canliis[0] ?? null;

    decisions[key] = {
      key,
      status: rec.status,
      database_id: rec.database_id ?? null,
      case_id: rec.case_id ?? null,
      decision_date: rec.decision_date ?? null,
      docket_number: rec.docket_number ?? null,
      title_fr: rec.title_fr ?? null,
      title_en: rec.title_en ?? null,
      source_titles: dedup(src.titles),
      url_fr: rec.url_fr ?? null,
      url_en: rec.url_en ?? null,
      citation_fr: rec.citation_fr ?? null,
      citation_en: rec.citation_en ?? null,
      neutral_fr: neutralFr,
      neutral_en: neutralEn,
      canlii_cite: canliiCite,
      reporters,
      publishers,
      dockets,
      keywords_fr: rec.keywords_fr ?? null,
      keywords_en: rec.keywords_en ?? null,
    };
  }

  return {
    lists: compiledLists,
    decisions,
    stats: {
      listCount: compiledLists.length,
      totalEntries,
      totalLinks,
      uniqueDecisions: Object.keys(decisions).length,
    },
  };
}

export function renderAuthoritiesModuleTs(data) {
  return `// GÉNÉRÉ PAR scripts/compile-authorities.mjs — NE PAS ÉDITER À LA MAIN.
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

export const EXEMPT_AUTHORITY_STATS = ${JSON.stringify(data.stats, null, 2)} as const;

const donneesCompilees = rawData as unknown as {
  lists: readonly ExemptAuthorityList[];
  decisions: Readonly<Record<string, ExemptDecisionRecord>>;
};

export const EXEMPT_AUTHORITY_LISTS: readonly ExemptAuthorityList[] = donneesCompilees.lists;

export const EXEMPT_DECISIONS: Readonly<Record<string, ExemptDecisionRecord>> =
  donneesCompilees.decisions;
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = buildCompiledAuthoritiesData();
  const ts = renderAuthoritiesModuleTs(data);
  mkdirSync(dirname(CHEMIN_SORTIE_TS), { recursive: true });
  writeFileSync(
    CHEMIN_SORTIE_JSON,
    `${JSON.stringify({ stats: data.stats, lists: data.lists, decisions: data.decisions }, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(CHEMIN_SORTIE_TS, ts, "utf8");
  console.log(
    `Compilé : ${data.stats.listCount} listes, ${data.stats.totalEntries} entrées, ${data.stats.totalLinks} liens, ${data.stats.uniqueDecisions} décisions uniques -> ${CHEMIN_SORTIE_JSON} + ${CHEMIN_SORTIE_TS}`,
  );
}
