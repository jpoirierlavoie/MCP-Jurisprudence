import { tokenSet, tokens } from "./normalize";

type Appariement = "appariement" | "partiel" | "discordance";

export interface CompareResult {
  verdict: Appariement;
  jaccard: number;
  manquants: string[];
}

const ANONYMISE = /^(droit de la famille|protection de la jeunesse|adoption|dpj)\b/i;

function numeros(s: string): string[] {
  return tokens(s).filter((t) => /^\d+$/.test(t));
}

function estAnonymise(s: string): boolean {
  return ANONYMISE.test(s.trim());
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : Math.round((inter / union) * 100) / 100;
}

export function compareTitles(attendu: string, obtenu: string): CompareResult {
  const a = tokenSet(attendu);
  const b = tokenSet(obtenu);
  const j = jaccard(a, b);

  if (estAnonymise(attendu) || estAnonymise(obtenu)) {
    const na = numeros(attendu);
    const nb = numeros(obtenu);
    if (na.length > 0 && nb.length > 0) {
      const commun = na.some((n) => nb.includes(n));
      return {
        verdict: commun ? "appariement" : "discordance",
        jaccard: j,
        manquants: commun ? [] : na.filter((n) => !nb.includes(n)),
      };
    }
  }

  const [court, long] = a.size <= b.size ? [a, b] : [b, a];
  const manquants = [...court].filter((t) => !long.has(t));

  if (court.size > 0 && manquants.length === 0) {
    return { verdict: "appariement", jaccard: j, manquants: [] };
  }
  if (j >= 0.5) {
    return { verdict: "partiel", jaccard: j, manquants };
  }
  return { verdict: "discordance", jaccard: j, manquants };
}

export function titleSimilarity(a: string, b: string): number {
  return jaccard(tokenSet(a), tokenSet(b));
}
