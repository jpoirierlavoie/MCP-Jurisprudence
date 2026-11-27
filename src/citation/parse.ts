export interface NeutralForm {
  kind: "neutral";
  year: number;
  code: string;
  number: number;
  raw: string;
}

interface CanliiForm {
  kind: "canlii";
  year: number;
  number: number;
  juris: string | null;
  court: string | null;
  raw: string;
}

interface ReporterForm {
  kind: "reporter";
  reporter: string;
  year: number | null;
  volume: number | null;
  page: number;
  raw: string;
}

interface PublisherForm {
  kind: "publisher";
  scheme: "SOQUIJ" | "Yvon Blais" | "Carswell";
  id: string;
  raw: string;
}

interface UnparsedForm {
  kind: "unparsed";
  raw: string;
}

export type ResolvableForm = NeutralForm | CanliiForm;
export type CitationForm = ResolvableForm | ReporterForm | PublisherForm;

interface ParseResult {
  input: string;
  primary: CitationForm | UnparsedForm;
  parallel: CitationForm[];
  inlineTitle: string | null;
}

const CANLII =
  /\b(1[89]\d{2}|20\d{2})\s*CanLII\s*(\d{1,7})\s*\(\s*([A-Z]{2})\s+([A-Z](?:\.?[A-Z]){0,5}\.?)\s*\)/gi;

const CANLII_SOLO =
  /\b(1[89]\d{2}|20\d{2})\s*CanLII\s*(\d{1,7})\s*\(\s*([A-Z](?:\.?[A-Z]){1,6}\.?)\s*\)/gi;

const SINGLE_COURT_PARENS: Readonly<Record<string, string>> = {
  SCC: "SCC",
  CSC: "CSC",
  FCA: "FCA",
  CAF: "CAF",
  FCTAD: "FCTAD",
  FCT: "FCT",
  FC: "FCT",
  FCTD: "FCT",
  FCTTD: "FCTTD",
  CF: "CF",
  CFPI: "CFPI",
  TCC: "TCC",
  CCI: "CCI",
};

const CANLII_NUE = /\b(1[89]\d{2}|20\d{2})\s*CanLII\s*(\d{1,7})\b/gi;

const NEUTRAL = /\b(1[89]\d{2}|20\d{2})\s+([A-Za-z]{2,8})\s*(\d{1,6})\b/g;

const NEUTRAL_CONCAT = /\b(1[89]\d{2}|20\d{2})([A-Za-z]{2,8})(\d{1,7})\b/g;

const REPORTER =
  /\[(1[89]\d{2}|20\d{2})\]\s*(\d+)?\s*(C\.?A\.?L\.?P\.?|CALP|C\.?L\.?P\.?|CLP|C\.?N\.?L\.?R\.?|CNLR|F\.?C\.?R\.?|FCR|F\.?C\.?J\.?|FCJ|F\.?C\.?|FC|C\.?F\.?|CF|R\.?C\.?S\.?|RCS|S\.?C\.?R\.?|SCR|R\.?S\.?C\.?|RSC|R\.?C\.?F\.?|RCF|R\.?J\.?D\.?T\.?|RJDT|R\.?J\.?Q\.?|RJQ|R\.?D\.?J\.?|RDJ|R\.?D\.?T\.?|RDT|R\.?L\.?|RL|T\.?T\.?|TT|C\.?A\.?|C\.?S\.?|C\.?Q\.?|A\.?C\.?|AC|UKPC|(?:[A-Z]\.){2,4})\s*(?:No\.?\s*)?(\d+)/g;

const REPORTER_VOL =
  /(?:\(\s*(1[89]\d{2}|20\d{2})\s*\),?\s*)?\b(\d{1,4})\s+((?:C\.?P\.?R\.?|D\.?L\.?R\.?|F\.?T\.?R\.?|N\.?R\.?|A\.C\.|U\.\s*S\.)(?:\s*\.?\s*\(\s*(?:2d|3d|4th|5th)\s*\)|\s+\d+\s+Wheat\.)?)\s+(\d{1,5})(?:\s*\(\s*(1[89]\d{2}|20\d{2})\s*\))?/g;

const PUBLISHER =
  /\b(J\.?E\.?\s*\d{2,4}-\d+|REJB\s*\d{4}-\d+|EYB\s*\d{4}-\d+|AZ-\d{6,10}|D\.?T\.?E\.?\s*\d{2,4}T?-\s*\d+|(?:1[89]\d{2}|20\d{2})\s+Carswell[A-Za-z]{2,12}\s+\d+)\b/gi;

const RESSORTS = new Set([
  "QC",
  "ON",
  "BC",
  "AB",
  "SK",
  "MB",
  "NS",
  "NB",
  "PE",
  "NL",
  "YK",
  "YT",
  "NT",
  "NU",
]);

const FEDERAUX = new Set([
  "CSC",
  "SCC",
  "CAF",
  "FCA",
  "CF",
  "FC",
  "FCT",
  "CFPI",
  "CCI",
  "TCC",
  "CACM",
  "CMAC",
  "CRTESPF",
  "FPSLREB",
  "CRTFP",
  "PSLREB",
  "TCDP",
  "CHRT",
  "CCRI",
  "CIRB",
  "COMC",
  "TMOB",
]);

interface Span {
  start: number;
  end: number;
}

function mask(text: string, spans: Span[]): string {
  if (spans.length === 0) return text;
  let out = text;
  for (const { start, end } of spans) {
    const s = Math.max(0, start);
    const e = Math.min(text.length, end);
    if (e > s) out = `${out.slice(0, s)}${" ".repeat(e - s)}${out.slice(e)}`;
  }
  return out;
}

function scanCanlii(text: string, spans: Span[]): CanliiForm[] {
  const found: CanliiForm[] = [];
  CANLII.lastIndex = 0;
  for (const m of text.matchAll(CANLII)) {
    found.push({
      kind: "canlii",
      year: Number(m[1]),
      number: Number(m[2]),
      juris: (m[3] ?? "").toUpperCase(),
      court: (m[4] ?? "").replace(/\./g, "").toUpperCase(),
      raw: m[0].trim(),
    });
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  const apresCouples = mask(text, spans);
  CANLII_SOLO.lastIndex = 0;
  for (const m of apresCouples.matchAll(CANLII_SOLO)) {
    const token = (m[3] ?? "").replace(/\./g, "").toUpperCase();
    const mapped = SINGLE_COURT_PARENS[token];
    if (!mapped) continue;
    found.push({
      kind: "canlii",
      year: Number(m[1]),
      number: Number(m[2]),
      juris: "CA",
      court: mapped,
      raw: m[0].trim(),
    });
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  const reste = mask(text, spans);
  CANLII_NUE.lastIndex = 0;
  for (const m of reste.matchAll(CANLII_NUE)) {
    found.push({
      kind: "canlii",
      year: Number(m[1]),
      number: Number(m[2]),
      juris: null,
      court: null,
      raw: m[0].trim(),
    });
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return found;
}

function codePlausible(code: string, isole: boolean): boolean {
  if (code === "CANLII") return false;
  if (FEDERAUX.has(code)) return true;
  if (RESSORTS.has(code.slice(0, 2))) return true;
  return isole;
}

function scanNeutral(
  text: string,
  spans: Span[],
  connus: (code: string) => boolean,
  isole: boolean,
): NeutralForm[] {
  const found: NeutralForm[] = [];
  for (const regex of [NEUTRAL, NEUTRAL_CONCAT]) {
    const reste = mask(text, spans);
    regex.lastIndex = 0;
    for (const m of reste.matchAll(regex)) {
      const code = (m[2] ?? "").toUpperCase();
      if (!connus(code) && !codePlausible(code, isole)) continue;
      if (code === "CANLII") continue;
      found.push({
        kind: "neutral",
        year: Number(m[1]),
        code,
        number: Number(m[3]),
        raw: m[0].trim(),
      });
      spans.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  return found;
}

function scanReporter(text: string, spans: Span[]): ReporterForm[] {
  const found: ReporterForm[] = [];
  const resteBracket = mask(text, spans);
  REPORTER.lastIndex = 0;
  for (const m of resteBracket.matchAll(REPORTER)) {
    found.push({
      kind: "reporter",
      reporter: (m[3] ?? "").trim(),
      year: Number(m[1]),
      volume: m[2] ? Number(m[2]) : null,
      page: Number(m[4]),
      raw: m[0].trim(),
    });
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  const resteVol = mask(text, spans);
  REPORTER_VOL.lastIndex = 0;
  for (const m of resteVol.matchAll(REPORTER_VOL)) {
    const annee = m[1] ? Number(m[1]) : m[5] ? Number(m[5]) : null;
    found.push({
      kind: "reporter",
      reporter: (m[3] ?? "").replace(/\s+/g, " ").trim(),
      year: annee,
      volume: Number(m[2]),
      page: Number(m[4]),
      raw: m[0].trim(),
    });
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return found;
}

function scanPublisher(text: string, spans: Span[]): PublisherForm[] {
  const found: PublisherForm[] = [];
  const reste = mask(text, spans);
  PUBLISHER.lastIndex = 0;
  for (const m of reste.matchAll(PUBLISHER)) {
    const id = (m[1] ?? "").trim();
    const tete = id.toUpperCase().replace(/[.\s]/g, "");
    const scheme: PublisherForm["scheme"] =
      tete.startsWith("REJB") || tete.startsWith("EYB")
        ? "Yvon Blais"
        : /CARSWELL/.test(tete)
          ? "Carswell"
          : "SOQUIJ";
    found.push({ kind: "publisher", scheme, id, raw: id });
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return found;
}

const TRAILING_PUNCT = /[\s,;:—–\-[(«"]+$/u;
const TRAILING_CONNECTOR =
  /(?:^|[\s,;:[(«"—–-])(?:dans(?:\s+l['’](?:arrêt|arret|affaire|espèce|espece)|\s+la\s+décision|\s+le\s+jugement)?|in(?:\s+the\s+case\s+of)?|voir(?:\s+(?:aussi|notamment|également|egalement))?|see(?:\s+also)?|cf\.?|compare|comp\.?|selon|suivant|notamment|e\.g\.|p\.?\s*ex\.?)\s*$/i;
const CLAUSE_INTRODUCER =
  /^.+?[,;:]\s*(?:voir(?:\s+(?:aussi|notamment|également|egalement))?|see(?:\s+also)?|cf\.?|dans(?:\s+(?:l['’](?:arrêt|arret|jugement)|la\s+décision|le\s+jugement|l['’]affaire(?!\s+de\b)))?|in(?!\s+(?:re|the\s+matter)\b)|notamment|p\.?\s*ex\.?|e\.g\.)[\s,:]+(?=[A-ZÀ-ÖØ-Ý0-9])/i;
const LEADING_INTRODUCER =
  /^(?:voir(?:\s+(?:aussi|notamment|également|egalement))?|see(?:\s+also)?|cf\.?|compare|comp\.?|dans(?:\s+(?:l['’](?:arrêt|arret|jugement)|la\s+décision|le\s+jugement|l['’]affaire(?!\s+de\b))|(?!\s+l['’]affaire\s+de\b))|in(?!\s+(?:re|the\s+matter)\b)|notamment|p\.?\s*ex\.?|e\.g\.|l['’](?:arrêt|arret)|l['’]affaire(?!\s+de\b)|la\s+décision|le\s+jugement)\b[\s,:—–-]+/i;
const PROSE_VERB_INTRO =
  /^.*?\b(?:comme|tel|selon|suivant|notamment|parce|car|l['’]a|a\s+[a-zà-öø-ÿ]{2,}|est\s+|ont\s+|sont\s+|était|etait|fût|fut|held|was|were)\b.*?\b(?:dans(?:\s+l['’](?:arrêt|arret)|\s+la\s+décision|\s+le\s+jugement)?|in(?!\s+(?:re|the\s+matter)\b)|voir|see)\b[\s,:]+(?=[A-ZÀ-ÖØ-Ý0-9])/;

const STYLE_ADVERSARIAL = /\S.*\s+(?:c\.|v\.|vs\.?|versus)\s+(?!supra\b|infra\b|à\s+d\.)\S/i;
const STYLE_NOMME =
  /^(?:in\s+re|re:?|in\s+the\s+matter\s+of|matter\s+of|ex\s+parte|(?:dans\s+)?l['’]affaire\s+(?:de|du|des|d['’])|succession(?:\s+(?:de|du|des|d['’]))?|estate\s+of|syndic(?:\s+(?:de|du|des|d['’]|à\s+la\s+faillite))?|faillite\s+(?:de|du|des|d['’])|proposition\s+(?:de|du|des|d['’])|bankruptcy\s+of|proposal\s+of|renvoi\s+(?:relatif|sur|concernant)|reference\s+re)\s+\S/i;
const STYLE_ANONYMISE =
  /^(?:droit\s+de\s+la\s+famille|protection\s+de\s+la\s+jeunesse|adoption)\s*(?:[—–-]\s*|\s+)[A-Z0-9]\S*/i;
const STYLE_SUFFIXE = /\(\s*(?:(?:in\s+)?re|syndic(?:\s+de)?|faillite|succession)\s*\)$/i;

function estStyleJuridique(s: string): boolean {
  return (
    STYLE_ADVERSARIAL.test(s) ||
    STYLE_NOMME.test(s) ||
    STYLE_ANONYMISE.test(s) ||
    STYLE_SUFFIXE.test(s)
  );
}

function extractInlineTitle(texte: string, firstSpanStart: number): string | null {
  if (firstSpanStart <= 0) return null;
  let prefix = texte.slice(0, firstSpanStart);

  for (;;) {
    const avant = prefix;
    prefix = prefix.replace(TRAILING_PUNCT, "");
    prefix = prefix.replace(TRAILING_CONNECTOR, (m) => (/^[\s,;:[(«"—–-]/.test(m) ? m[0]! : ""));
    prefix = prefix.replace(TRAILING_PUNCT, "").trim();
    if (prefix === avant) break;
  }
  if (!prefix) return null;

  const clauseMatch = CLAUSE_INTRODUCER.exec(prefix);
  if (clauseMatch) {
    prefix = prefix.slice(clauseMatch[0].length).trim();
  } else {
    const proseMatch = PROSE_VERB_INTRO.exec(prefix);
    if (proseMatch) prefix = prefix.slice(proseMatch[0].length).trim();
  }
  for (;;) {
    const suivant = prefix.replace(LEADING_INTRODUCER, "").trim();
    if (suivant === prefix) break;
    prefix = suivant;
  }
  if (!prefix) return null;

  return estStyleJuridique(prefix) ? prefix : null;
}

function estIsole(input: string): boolean {
  const nu = input
    .replace(/\(\s*canlii\s*\)/gi, " ")
    .replace(/[.,;:()[\]]/g, " ")
    .trim();
  return nu.split(/\s+/).filter(Boolean).length <= 5;
}

export function parseCitation(
  input: string,
  connus: (code: string) => boolean = () => false,
): ParseResult {
  const texte = input.trim();
  const spans: Span[] = [];
  const isole = estIsole(texte);

  const canlii = scanCanlii(texte, spans);
  const neutral = scanNeutral(texte, spans, connus, isole);
  const reporter = scanReporter(texte, spans);
  const publisher = scanPublisher(texte, spans);

  const toutes: CitationForm[] = [...canlii, ...neutral, ...reporter, ...publisher];
  if (toutes.length === 0) {
    return { input, primary: { kind: "unparsed", raw: texte }, parallel: [], inlineTitle: null };
  }

  const constructibles = toutes.filter(
    (f) => f.kind === "neutral" || (f.kind === "canlii" && f.juris !== null),
  );
  const primary = constructibles[0] ?? toutes[0]!;
  const parallel = toutes.filter((f) => f !== primary);
  const firstSpanStart = Math.min(...spans.map((s) => s.start));
  const inlineTitle = extractInlineTitle(texte, firstSpanStart);
  return { input, primary, parallel, inlineTitle };
}

export interface CourtCode {
  code: string;
  database_id: string;
  caseid_code: string;
  jurisdiction: string;
  lang: string | null;
  verified: number;
  note: string | null;
}

export interface ParenCode {
  juris_code: string;
  court_code: string;
  database_id: string;
  verified: number;
}

export interface Directory {
  courtCodes: Map<string, CourtCode>;
  parenCodes: Map<string, ParenCode>;
  knownDatabases: Set<string>;
}

type Constructible = "oui" | "probable" | "non";

export interface Resolution {
  constructible: Constructible;
  databaseId: string | null;
  caseId: string | null;
  raison: string;
  databaseConnue: boolean;
}

export function resolve(form: CitationForm | UnparsedForm, dir: Directory): Resolution {
  if (form.kind === "unparsed") {
    return {
      constructible: "non",
      databaseId: null,
      caseId: null,
      raison:
        "Forme non reconnue : ni citation neutre, ni citation attribuée par CanLII, ni recueil, ni identifiant d'éditeur.",
      databaseConnue: false,
    };
  }

  if (form.kind === "reporter") {
    const ref =
      form.year !== null && form.raw.trim().startsWith("[")
        ? `[${form.year}]${form.volume === null ? "" : ` ${form.volume}`} ${form.reporter} ${form.page}`
        : form.raw;
    return {
      constructible: "non",
      databaseId: null,
      caseId: null,
      raison: `Forme reconnue : recueil (${ref}). L'API de CanLII ne résout pas les citations de recueils.`,
      databaseConnue: false,
    };
  }

  if (form.kind === "publisher") {
    return {
      constructible: "non",
      databaseId: null,
      caseId: null,
      raison: `Forme reconnue : identifiant d'éditeur (${form.scheme}, ${form.id}). L'API de CanLII ne résout pas les identifiants d'éditeurs.`,
      databaseConnue: false,
    };
  }

  if ((form.kind === "canlii" || form.kind === "neutral") && form.number <= 0) {
    return {
      constructible: "non",
      databaseId: null,
      caseId: null,
      raison: `Numéro de décision invalide (${form.number}) : un numéro de décision doit être strictement positif.`,
      databaseConnue: false,
    };
  }

  if (form.kind === "canlii") {
    if (form.juris === null || form.court === null) {
      return {
        constructible: "non",
        databaseId: null,
        caseId: null,
        raison:
          "Citation attribuée par CanLII privée de son couple de codes entre parenthèses (p. ex. « (QC CQ) ») : le tribunal ne peut pas être déduit.",
        databaseConnue: false,
      };
    }
    const clef = `${form.juris}/${form.court}`;
    const row = dir.parenCodes.get(clef);
    const caseId = `${form.year}canlii${form.number}`;
    if (!row) {
      return {
        constructible: "non",
        databaseId: null,
        caseId,
        raison: `Couple de codes « ${form.juris} ${form.court} » absent du répertoire. Consulter list_databases.`,
        databaseConnue: false,
      };
    }
    return {
      constructible: row.verified === 1 ? "oui" : "probable",
      databaseId: row.database_id,
      caseId,
      raison:
        row.verified === 1
          ? `Citation attribuée par CanLII : ${row.database_id} / ${caseId}.`
          : `Citation attribuée par CanLII : ${row.database_id} / ${caseId} (correspondance non encore confirmée par un appel réussi).`,
      databaseConnue: dir.knownDatabases.size === 0 || dir.knownDatabases.has(row.database_id),
    };
  }

  const row = dir.courtCodes.get(form.code);
  if (row) {
    const caseId = `${form.year}${row.caseid_code}${form.number}`;
    return {
      constructible: row.verified === 1 ? "oui" : "probable",
      databaseId: row.database_id,
      caseId,
      raison:
        row.verified === 1
          ? `Citation neutre : ${row.database_id} / ${caseId}.`
          : `Citation neutre : ${row.database_id} / ${caseId} (hypothèse de répertoire, non encore confirmée par un appel réussi${row.note ? ` — ${row.note}` : ""}).`,
      databaseConnue: dir.knownDatabases.size === 0 || dir.knownDatabases.has(row.database_id),
    };
  }

  const devine = form.code.toLowerCase();
  const caseId = `${form.year}${devine}${form.number}`;
  return {
    constructible: "probable",
    databaseId: devine,
    caseId,
    raison: `Code de tribunal « ${form.code} » absent du répertoire. Hypothèse d'identité : ${devine} / ${caseId}. À confirmer par un appel ; consulter list_databases.`,
    databaseConnue: dir.knownDatabases.has(devine),
  };
}

export function formLabel(form: CitationForm | UnparsedForm): string {
  switch (form.kind) {
    case "neutral":
      return `${form.raw} (citation neutre)`;
    case "canlii":
      return `${form.raw} (citation attribuée par CanLII)`;
    case "reporter":
      return `${form.raw} (recueil)`;
    case "publisher":
      return `${form.raw} (identifiant ${form.scheme})`;
    default:
      return form.raw;
  }
}
