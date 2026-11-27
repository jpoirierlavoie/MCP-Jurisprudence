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

const STOPWORDS = new Set([
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

export function tokenSet(s: string): Set<string> {
  return new Set(tokens(s));
}

export function normalizeNeutral(year: number, code: string, number: number): string {
  return `${year} ${code.toUpperCase()} ${number}`;
}

export function flattenCaseId(
  value: unknown,
  preferred?: string,
): { caseId: string; lang: string | null } | null {
  if (typeof value === "string" && value.length > 0) {
    return { caseId: value, lang: null };
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
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
