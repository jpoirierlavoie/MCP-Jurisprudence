/**
 * Analyseur de citations (spécification §6).
 *
 * C'est le cœur du connecteur. Module PUR : aucune E/S, aucune dépendance, donc
 * entièrement testable hors ligne. Le répertoire des tribunaux lui est PASSÉ
 * (interface `Directory`) plutôt que lu en base, précisément pour préserver cette
 * pureté — c'est `src/store/databases.ts` qui le charge.
 *
 * Principe directeur (§6.1) : LE BALAYAGE PRIME SUR L'APPARIEMENT TOTAL. Une citation
 * doctrinale complète contient presque toujours la forme neutre au milieu d'autres
 * éléments ; l'analyseur doit l'y trouver plutôt que de refuser la chaîne entière.
 */

// ── Formes reconnues ──────────────────────────────────────────────────────────

export interface NeutralForm {
  kind: "neutral";
  year: number;
  /** Code du tribunal, TOUJOURS en majuscules : 'QCCA', 'CSC'. */
  code: string;
  number: number;
  raw: string;
}

export interface CanliiForm {
  kind: "canlii";
  year: number;
  number: number;
  /** Code de ressort entre parenthèses : 'QC'. Null si les parenthèses manquent. */
  juris: string | null;
  /** Code de tribunal entre parenthèses : 'CQ'. Null si les parenthèses manquent. */
  court: string | null;
  raw: string;
}

export interface ReporterForm {
  kind: "reporter";
  /** Sigle du recueil, tel qu'écrit : 'R.C.S.', 'RCS', 'C.A.'. */
  reporter: string;
  year: number;
  volume: number | null;
  page: number;
  raw: string;
}

export interface PublisherForm {
  kind: "publisher";
  scheme: "SOQUIJ" | "Yvon Blais";
  id: string;
  raw: string;
}

export interface UnparsedForm {
  kind: "unparsed";
  raw: string;
}

export type ResolvableForm = NeutralForm | CanliiForm;
export type CitationForm = ResolvableForm | ReporterForm | PublisherForm;

export interface ParseResult {
  /** La chaîne soumise, telle quelle. */
  input: string;
  /** La forme retenue : la constructible s'il y en a une, sinon la première trouvée. */
  primary: CitationForm | UnparsedForm;
  /** Les autres formes coexistantes (§6.1 : « mentionner les autres »). */
  parallel: CitationForm[];
}

// ── Expressions régulières de référence (§6.2) ────────────────────────────────

/**
 * Citation attribuée par CanLII, AVEC son couple de codes entre parenthèses.
 * Appliquée EN PREMIER et ses plages masquées ensuite — voir NEUTRAL.
 */
const CANLII =
  /\b(1[89]\d{2}|20\d{2})\s+CanLII\s+(\d{1,7})\s*\(\s*([A-Z]{2})\s+([A-Z]{1,6})\s*\)/gi;

/** Même forme, mais sans les parenthèses : le tribunal reste indéterminable. */
const CANLII_NUE = /\b(1[89]\d{2}|20\d{2})\s+CanLII\s+(\d{1,7})\b/gi;

/**
 * Citation neutre : année + identifiant de tribunal + numéro d'ordre.
 *
 * ⚠ ÉCART ASSUMÉ À §6.2 : la spécification écrit cette expression sans le drapeau `i`,
 *   mais la matrice de test §13 exige que « 2020 qcca 495 » s'analyse. Le drapeau est
 *   donc obligatoire — et il fait alors capturer « CanLII » lui-même comme code de
 *   tribunal dans « 2002 CanLII 32322 ». Deux parades, cumulatives :
 *     1. les plages appariées par CANLII/CANLII_NUE sont MASQUÉES avant ce passage ;
 *     2. le code « CANLII » est rejeté explicitement (voir `scanNeutral`).
 *   Retirer l'une ou l'autre rouvre le défaut ; les deux sont testées.
 */
const NEUTRAL = /\b(1[89]\d{2}|20\d{2})\s+([A-Za-z]{2,8})\s+(\d{1,6})\b/g;

/** Recueils : [année] volume? sigle page. */
const REPORTER =
  /\[(1[89]\d{2}|20\d{2})\]\s*(\d+)?\s*((?:[A-Z]\.){2,4}|R\.?C\.?S\.?|RCS|SCR|R\.?J\.?Q\.?|C\.?A\.?|C\.?S\.?|C\.?Q\.?)\s*(\d+)/g;

/** Identifiants d'éditeurs. */
const PUBLISHER =
  /\b(J\.?E\.?\s*\d{2,4}-\d+|REJB\s*\d{4}-\d+|EYB\s*\d{4}-\d+|AZ-\d{6,10}|D\.?T\.?E\.?\s*\d{4}T?-\d+)\b/gi;

/**
 * Codes de ressort canadiens connus, employés pour écarter les faux positifs de
 * NEUTRAL lors d'un BALAYAGE dans une phrase (§6.2 : « un code de deux lettres suivi
 * d'un numéro peut apparaître fortuitement »).
 */
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

/** Codes fédéraux bien formés, langue-neutres ou non. */
const FEDERAUX = new Set([
  "CSC",
  "SCC",
  "CAF",
  "FCA",
  "CF",
  "FC",
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

// ── Balayage ──────────────────────────────────────────────────────────────────

interface Span {
  start: number;
  end: number;
}

/** Remplace les plages déjà consommées par des espaces, pour ne pas les réapparier. */
function mask(text: string, spans: Span[]): string {
  if (spans.length === 0) return text;
  const chars = [...text];
  for (const { start, end } of spans) {
    for (let i = start; i < end && i < chars.length; i++) chars[i] = " ";
  }
  return chars.join("");
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
      court: (m[4] ?? "").toUpperCase(),
      raw: m[0].trim(),
    });
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  // Second passage : les formes CanLII privées de leur couple de codes. Elles ne sont
  // pas constructibles (le tribunal est indéterminable) mais il faut les RECONNAÎTRE,
  // sinon elles tombent en « ILLISIBLE », ce qui serait un diagnostic faux.
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

/**
 * Un code inconnu est-il assez bien formé pour valoir une tentative ?
 *
 * `isole` = la citation occupe à elle seule toute la chaîne soumise. Dans ce cas on
 * accepte tout code de 2 à 8 lettres : l'usager a manifestement voulu donner une
 * citation, et la matrice §13 exige que « 2020 XXQQ 12 » ressorte en `probable`
 * plutôt qu'en `unparsed`. En revanche, lorsqu'on BALAIE une phrase, on exige un
 * préfixe de ressort connu — sans quoi « il a payé 2020 USD 500 » deviendrait une
 * citation.
 */
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
  const reste = mask(text, spans);
  NEUTRAL.lastIndex = 0;
  for (const m of reste.matchAll(NEUTRAL)) {
    const code = (m[2] ?? "").toUpperCase();
    if (!connus(code) && !codePlausible(code, isole)) continue;
    if (code === "CANLII") continue; // parade n° 2 — voir le commentaire de NEUTRAL
    found.push({
      kind: "neutral",
      year: Number(m[1]),
      code,
      number: Number(m[3]),
      raw: m[0].trim(),
    });
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return found;
}

function scanReporter(text: string, spans: Span[]): ReporterForm[] {
  const found: ReporterForm[] = [];
  const reste = mask(text, spans);
  REPORTER.lastIndex = 0;
  for (const m of reste.matchAll(REPORTER)) {
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
      tete.startsWith("REJB") || tete.startsWith("EYB") ? "Yvon Blais" : "SOQUIJ";
    found.push({ kind: "publisher", scheme, id, raw: id });
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return found;
}

/**
 * La citation occupe-t-elle toute la chaîne ? On tolère les enrobages usuels :
 * « (CanLII) » en suffixe, la ponctuation et les espaces.
 */
function estIsole(input: string): boolean {
  const nu = input
    .replace(/\(\s*canlii\s*\)/gi, " ")
    .replace(/[.,;:()[\]]/g, " ")
    .trim();
  // Une citation isolée fait au plus quatre jetons : année, code, numéro (+ résidu).
  return nu.split(/\s+/).filter(Boolean).length <= 5;
}

/**
 * Analyse une chaîne et rend la forme retenue plus les formes parallèles.
 *
 * @param connus prédicat « ce code figure-t-il au répertoire ? ». Facultatif : sans
 *   lui, seule la plausibilité syntaxique joue. Passer le vrai répertoire améliore le
 *   balayage dans les phrases (un code connu n'a pas besoin d'être « plausible »).
 */
export function parseCitation(
  input: string,
  connus: (code: string) => boolean = () => false,
): ParseResult {
  const texte = input.trim();
  const spans: Span[] = [];
  const isole = estIsole(texte);

  // Ordre imposé par §6.1 : (1) forme attribuée par CanLII, (2) forme neutre,
  // (3) recueils, (4) identifiants d'éditeurs.
  const canlii = scanCanlii(texte, spans);
  const neutral = scanNeutral(texte, spans, connus, isole);
  const reporter = scanReporter(texte, spans);
  const publisher = scanPublisher(texte, spans);

  const toutes: CitationForm[] = [...canlii, ...neutral, ...reporter, ...publisher];
  if (toutes.length === 0) {
    return { input, primary: { kind: "unparsed", raw: texte }, parallel: [] };
  }

  // §6.1 : « Si plusieurs formes coexistent, retenir la constructible ». Une forme
  // CanLII complète et une forme neutre le sont ; la CanLII nue ne l'est pas.
  const constructibles = toutes.filter(
    (f) => f.kind === "neutral" || (f.kind === "canlii" && f.juris !== null),
  );
  const primary = constructibles[0] ?? toutes[0]!;
  const parallel = toutes.filter((f) => f !== primary);
  return { input, primary, parallel };
}

// ── Résolution en databaseId / caseId (§6.3) ──────────────────────────────────

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
  /** Clef : code en majuscules. */
  courtCodes: Map<string, CourtCode>;
  /** Clef : `${juris}/${court}` en majuscules. */
  parenCodes: Map<string, ParenCode>;
  /** Identifiants réellement présents dans la table `databases` (peut être vide). */
  knownDatabases: Set<string>;
}

/** « oui » = répertoire confirmé ; « probable » = hypothèse ; « non » = irrésoluble. */
export type Constructible = "oui" | "probable" | "non";

export interface Resolution {
  constructible: Constructible;
  databaseId: string | null;
  caseId: string | null;
  /** Explication en français, destinée à la sortie de `jurisprudence_parse_citation`. */
  raison: string;
  /** Le databaseId déduit figure-t-il au répertoire local des bases ? */
  databaseConnue: boolean;
}

/**
 * Déduit `databaseId` et `caseId` d'une forme analysée.
 *
 *   caseId = `${year}${caseid_code}${number}`   (formes neutres)
 *   caseId = `${year}canlii${number}`           (formes attribuées par CanLII)
 *
 * Le rang `probable` n'est pas décoratif : il commande le comportement du reste du
 * système. Une ligne `verified = 0` est une HYPOTHÈSE d'amorçage (§4.3), et la boucle
 * d'auto-correction (§6.4) est ce qui la promeut — ou la corrige.
 */
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
    const volume = form.volume === null ? "" : ` ${form.volume}`;
    return {
      constructible: "non",
      databaseId: null,
      caseId: null,
      raison: `Forme reconnue : recueil ([${form.year}]${volume} ${form.reporter} ${form.page}). L'API de CanLII ne résout pas les citations de recueils.`,
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
        raison: `Couple de codes « ${form.juris} ${form.court} » absent du répertoire. Consulter jurisprudence_list_databases.`,
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

  // form.kind === "neutral"
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

  // Code absent du répertoire mais bien formé : on tente l'identité (le motif qui vaut
  // pour toutes les cours du Québec) et l'on consigne le résultat (§6.2, §6.4).
  const devine = form.code.toLowerCase();
  const caseId = `${form.year}${devine}${form.number}`;
  return {
    constructible: "probable",
    databaseId: devine,
    caseId,
    raison: `Code de tribunal « ${form.code} » absent du répertoire. Hypothèse d'identité : ${devine} / ${caseId}. À confirmer par un appel ; consulter jurisprudence_list_databases.`,
    databaseConnue: dir.knownDatabases.has(devine),
  };
}

/** Rendu court d'une forme, pour les listes de formes parallèles. */
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
