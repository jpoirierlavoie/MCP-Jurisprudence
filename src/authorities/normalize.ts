import { fold } from "../citation/normalize";
import type { CitationForm } from "../citation/parse";

interface TribunalMeta {
  id: string;
  nomFr: string;
  nomEn: string;
  defaultDatabases: readonly string[];
}

export const TRIBUNAUX: Readonly<Record<string, TribunalMeta>> = {
  qcca: {
    id: "qcca",
    nomFr: "Cour d'appel du Québec",
    nomEn: "Court of Appeal of Québec",
    defaultDatabases: ["qcca", "csc-scc"],
  },
  qccs: {
    id: "qccs",
    nomFr: "Cour supérieure du Québec",
    nomEn: "Superior Court of Québec",
    defaultDatabases: ["qccs", "qcca", "csc-scc", "onca"],
  },
  qccq: {
    id: "qccq",
    nomFr: "Cour du Québec (Division administrative et d'appel)",
    nomEn: "Court of Québec (Administrative and Appeal Division)",
    defaultDatabases: ["qccq", "qcca", "qccs", "qctp", "qcbdrvm", "csc-scc", "ukpc"],
  },
  tat: {
    id: "tat",
    nomFr: "Tribunal administratif du travail",
    nomEn: "Administrative Labour Tribunal",
    defaultDatabases: [
      "qctat",
      "qcclp",
      "qccrt",
      "qccalp",
      "qctt",
      "qcdag",
      "qcca",
      "qccs",
      "csc-scc",
    ],
  },
  tdp: {
    id: "tdp",
    nomFr: "Tribunal des droits de la personne",
    nomEn: "Human Rights Tribunal",
    defaultDatabases: ["qctdp", "qcca", "csc-scc"],
  },
  tp: {
    id: "tp",
    nomFr: "Tribunal des professions",
    nomEn: "Professions Tribunal",
    defaultDatabases: ["qctp", "qcca", "csc-scc"],
  },
  tmf: {
    id: "tmf",
    nomFr: "Tribunal administratif des marchés financiers",
    nomEn: "Financial Markets Administrative Tribunal",
    defaultDatabases: ["qcbdrvm", "qcca", "qccs", "csc-scc"],
  },
  cf: {
    id: "cf",
    nomFr: "Cour fédérale",
    nomEn: "Federal Court",
    defaultDatabases: ["fct", "fca", "csc-scc", "ukpc"],
  },
  comc: {
    id: "comc",
    nomFr: "Commission des oppositions des marques de commerce",
    nomEn: "Trademarks Opposition Board",
    defaultDatabases: ["fct", "fca", "csc-scc"],
  },
};

const TRIBUNAL_ALIASES: Readonly<Record<string, string>> = {
  qcca: "qcca",
  caq: "qcca",
  qccs: "qccs",
  cs: "qccs",
  csq: "qccs",
  qccq: "qccq",
  cq: "qccq",
  "cq-daa": "qccq",
  "qccq-daa": "qccq",
  daa: "qccq",
  tat: "tat",
  qctat: "tat",
  tdp: "tdp",
  qctdp: "tdp",
  tpdq: "tdp",
  tp: "tp",
  qctp: "tp",
  tmf: "tmf",
  qcbdrvm: "tmf",
  qctmf: "tmf",
  cf: "cf",
  fc: "cf",
  fct: "cf",
  fctd: "cf",
  "fct-cf": "cf",
  comc: "comc",
  tmob: "comc",
};

export function normalizeTribunal(raw: string): string | null {
  const k = raw.trim().toLowerCase().replace(/\s+/g, "");
  return TRIBUNAL_ALIASES[k] ?? null;
}

export const NEUTRE_VERS_FAMILLE: Readonly<Record<string, string>> = {
  CSC: "csc-scc",
  SCC: "csc-scc",
  CAF: "fca",
  FCA: "fca",
  CF: "fct",
  FC: "fct",
  FCT: "fct",
  CFPI: "fct",
  CCI: "cci-tcc",
  TCC: "cci-tcc",
  QCCA: "qcca",
  QCCS: "qccs",
  QCCQ: "qccq",
  QCCM: "qccm",
  QCTAL: "qctal",
  QCTAT: "qctat",
  QCTAQ: "qctaq",
  QCTP: "qctp",
  QCTDP: "qctdp",
  QCCLP: "qcclp",
  QCCRT: "qccrt",
  QCBDRVM: "qcbdrvm",
  QCBDR: "qcbdrvm",
  QCTMF: "qcbdrvm",
  BCCA: "bcca",
  YKCA: "ykca",
  ONCA: "onca",
};

const SIGLE_CANON: ReadonlyMap<string, string> = new Map([
  ["RCS", "SCR"],
  ["SCR", "SCR"],
  ["RSC", "SCR"],
  ["RJQ", "RJQ"],
  ["RDJ", "RDJ"],
  ["CLP", "CLP"],
  ["CALP", "CALP"],
  ["RJDT", "RJDT"],
  ["TT", "TT"],
  ["RL", "RL"],
  ["RDT", "RDT"],
  ["FC", "FC"],
  ["CF", "FC"],
  ["FCR", "FCR"],
  ["RCF", "FCR"],
  ["CNLR", "CNLR"],
  ["FCJ", "FCJ"],
  ["CA", "CA"],
  ["CS", "CS"],
  ["CQ", "CQ"],
  ["AC", "AC"],
  ["US", "US"],
  ["CPR", "CPR"],
  ["DLR", "DLR"],
  ["FTR", "FTR"],
  ["NR", "NR"],
  ["UKPC", "UKPC"],
]);

function normalizeReporterAbbr(rawSigle: string): string {
  const s = rawSigle.replace(/\./g, "").replace(/\s+/g, " ").trim().toUpperCase();
  const serieMatch = /^(CPR|DLR)\s*\((\d+(?:ND|D|TH))\)$/i.exec(s);
  if (serieMatch) {
    return `${serieMatch[1]!.toUpperCase()}(${serieMatch[2]!.toUpperCase()})`;
  }
  const wheatMatch = /^US\s+(\d+\s+WHEAT)$/i.exec(s);
  if (wheatMatch) {
    return `US(${wheatMatch[1]!.replace(/\s+/g, "")})`;
  }
  return SIGLE_CANON.get(s) ?? s.replace(/\s+/g, "");
}

function neutralMatchKeys(year: number, code: string, number: number): string[] {
  const up = code.toUpperCase();
  const fam = NEUTRE_VERS_FAMILLE[up] ?? up.toLowerCase();
  const cles = [`N:${fam}:${year}:${number}`];
  if (up === "QCBDR" || up === "QCTMF") {
    cles.push(`N:${up.toLowerCase()}:${year}:${number}`);
  }
  return cles;
}

function canliiMatchKey(year: number, number: number): string {
  return `C:${year}:${number}`;
}

function reporterMatchKeys(
  year: number | null,
  volume: number | null,
  reporter: string,
  page: number,
): string[] {
  const sig = normalizeReporterAbbr(reporter);
  const sigles = sig === "FC" || sig === "FCR" ? ["FC", "FCR"] : [sig];
  const cles: string[] = [];
  for (const sc of sigles) {
    cles.push(`R:${year ?? "_"}:${volume ?? "_"}:${sc}:${page}`);
    if (volume !== null && year !== null) {
      cles.push(`R:_:${volume}:${sc}:${page}`);
    }
  }
  return cles;
}

export function publisherMatchKey(id: string): string {
  return `P:${id.toUpperCase().replace(/[.\s]/g, "")}`;
}

export function expandDbCaseKeys(databaseId: string, caseId: string): string[] {
  const db = databaseId.trim().toLowerCase();
  const cid = caseId.trim().toLowerCase();
  if (!db || !cid) return [];
  const cles = new Set<string>([`ID:${db}/${cid}`]);

  const mCan = /^(\d{4})canlii(\d+)$/i.exec(cid);
  if (mCan) {
    cles.add(canliiMatchKey(Number(mCan[1]), Number(mCan[2])));
  }

  const mFed = /^(\d{4})(csc|scc|caf|fca|cf|fc|fct|cfpi)(\d+)$/i.exec(cid);
  if (mFed) {
    const [, yr, frag, num] = mFed;
    const f = frag!.toLowerCase();
    if (f === "csc" || f === "scc") {
      cles.add(`ID:csc-scc/${yr}csc${num}`);
      cles.add(`ID:csc-scc/${yr}scc${num}`);
      cles.add(`N:csc-scc:${yr}:${num}`);
    } else if (f === "caf" || f === "fca") {
      cles.add(`ID:fca/${yr}caf${num}`);
      cles.add(`ID:fca/${yr}fca${num}`);
      cles.add(`N:fca:${yr}:${num}`);
    } else {
      for (const v of ["cf", "fc", "fct", "cfpi"]) {
        cles.add(`ID:fct/${yr}${v}${num}`);
      }
      cles.add(`N:fct:${yr}:${num}`);
    }
  }

  return [...cles];
}

export function extractDocketKeys(raw: string): string[] {
  const cles = new Set<string>();
  for (const rx of [
    /\bC\.L\.P\.\s*(\d{6}-[0-9A-Z]{2,3}-\d{4})\b/gi,
    /\b(\d{2}-A-\d{2,5})\b/g,
    /\b(IMM-\d{1,6}-\d{2,4})\b/gi,
    /\b([TA]-\d{1,5}-\d{2})\b/gi,
    /\b(\d{3}-\d{2}-\d{6}-\d{3})\b/g,
  ]) {
    rx.lastIndex = 0;
    for (const m of raw.matchAll(rx)) {
      cles.add(`D:${m[1]!.toUpperCase()}`);
    }
  }
  return [...cles];
}

export function citationFormKeys(form: CitationForm): string[] {
  switch (form.kind) {
    case "neutral":
      return neutralMatchKeys(form.year, form.code, form.number);
    case "canlii":
      return [canliiMatchKey(form.year, form.number)];
    case "reporter":
      return reporterMatchKeys(form.year, form.volume, form.reporter, form.page);
    case "publisher":
      return [publisherMatchKey(form.id)];
  }
}

export function hasEnoughTextForTitleSearch(raw: string): boolean {
  const f = fold(raw);
  const letters = f.replace(/[^a-z]/g, "");
  return letters.length >= 3;
}
