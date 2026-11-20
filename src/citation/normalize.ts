/**
 * Normalisation de chaînes pour la comparaison d'intitulés (spécification §6.5).
 *
 * Module PUR : aucune E/S, aucune dépendance. Entièrement testable hors ligne.
 */

/**
 * Plie une chaîne : minuscules, diacritiques supprimés, ponctuation réduite à
 * l'espace, espaces normalisés.
 *
 * NFD + suppression des marques combinantes (\p{M}) : « Québec » -> « quebec ».
 * C'est le même pliage que `tokenize="unicode61 remove_diacritics 2"` côté FTS5,
 * afin que l'index et la comparaison en mémoire s'accordent.
 */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Jetons vides de sens, retirés avant comparaison (§6.5).
 *
 * Deux familles : les séparateurs de parties (`c`, `v`, `vs`, `et`, `al`) et les
 * formes sociétaires (`inc`, `ltee`, `ltd`…). Retirer les secondes rend
 * « 9044-3422 Québec Inc. » et « 9044-3422 Quebec inc » équivalents.
 *
 * ⚠ Les nombres ne sont JAMAIS retirés : sur les intitulés anonymisés du droit de
 *   la famille et de la protection de la jeunesse (« Droit de la famille — 20495 »),
 *   le numéro est le SEUL discriminant. Le retirer ferait apparier entre elles
 *   toutes les décisions anonymisées de la même série.
 */
const STOPWORDS = new Set([
  // séparateurs et liaisons
  "c",
  "v",
  "vs",
  "et",
  "al",
  "la",
  "le",
  "les",
  "de",
  "du",
  "des",
  "d",
  "l",
  // formes sociétaires
  "inc",
  "ltee",
  "ltd",
  "limitee",
  "limited",
  "corp",
  "corporation",
  "cie",
  "compagnie",
  "co",
  "senc",
  "sencrl",
  "srl",
  "enr",
]);

const TOKEN_CANON: Record<string, string> = {
  st: "saint",
  ste: "sainte",
  procureure: "procureur",
  procureurs: "procureur",
  procureures: "procureur",
  generale: "general",
  generaux: "general",
  generales: "general",
  directrice: "directeur",
  presidente: "president",
  syndique: "syndic",
  liquidatrice: "liquidateur",
  curatrice: "curateur",
  tutrice: "tuteur",
};

/** Découpe une chaîne pliée en jetons significatifs. */
export function tokens(s: string): string[] {
  const expanded = s
    .replace(
      /\bP\.\s*G\.(?=\s+(?:du|de|des|d['’]|of|for|pour|Qu[ée]bec|Qc|Canada|Ontario|Alberta|Manitoba|Saskatchewan|Colombie-Britannique|British\s+Columbia|Nouveau-Brunswick|New\s+Brunswick|Nouvelle-[ÉéE]cosse|Nova\s+Scotia|[ÎîI]le-du-Prince-[ÉéE]douard|Prince\s+Edward\s+Island|Terre-Neuve(?:-et-Labrador)?|Newfoundland|Yukon|Nunavut|Territoires\s+du\s+Nord-Ouest|Northwest\s+Territories)\b|\s*[,)]|\s*$)/gi,
      "Procureur général",
    )
    .replace(/\bA\.\s*G\.(?=\s+(?:of|for)\b|\s*[,)]|\s*$)/g, "Attorney General");
  return fold(expanded)
    .split(" ")
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
    .map((t) => TOKEN_CANON[t] ?? t);
}

/** Jetons significatifs, dédoublonnés, en ensemble. */
export function tokenSet(s: string): Set<string> {
  return new Set(tokens(s));
}

/**
 * Normalise une citation neutre pour l'affichage et l'indexation :
 * « 2020   qcca 495 » -> « 2020 QCCA 495 ».
 */
export function normalizeNeutral(year: number, code: string, number: number): string {
  return `${year} ${code.toUpperCase()} ${number}`;
}

/**
 * Aplatit le champ `caseId` des réponses de liste de CanLII, qui est un OBJET
 * clé par langue (`{"en": "2008scc9"}` ou `{"fr": "2008csc9"}`) et non une chaîne.
 *
 * Documenté à l'annexe B de la spécification : « caseId renvoyé dans les listes
 * sous forme d'objet clé par langue — aplatir à la lecture ». Les fiches
 * individuelles, elles, renvoient parfois une chaîne : les deux formes sont
 * acceptées ici pour que l'appelant n'ait pas à savoir laquelle il tient.
 *
 * @returns l'identifiant et la langue sous laquelle CanLII l'a clé, ou null.
 */
export function flattenCaseId(
  value: unknown,
  preferred?: string,
): { caseId: string; lang: string | null } | null {
  if (typeof value === "string" && value.length > 0) {
    return { caseId: value, lang: null };
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    // La langue demandée d'abord, puis fr, puis en, puis la première venue :
    // CanLII ne garantit pas que la clef corresponde à la langue de l'appel.
    const order = [preferred, "fr", "en"].filter((k): k is string => typeof k === "string");
    for (const key of order) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.length > 0) {
        return { caseId: candidate, lang: key };
      }
    }
    for (const [key, candidate] of Object.entries(record)) {
      if (typeof candidate === "string" && candidate.length > 0) {
        return { caseId: candidate, lang: key };
      }
    }
  }
  return null;
}
