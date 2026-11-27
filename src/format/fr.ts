const NBSP = " ";

export function dateFr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : iso;
}

export function nombreFr(n: number): string {
  return n.toLocaleString("fr-CA").replace(/ |\s/g, NBSP);
}

export function pluriel(n: number, singulier: string, pluriel_: string): string {
  return `${nombreFr(n)} ${n <= 1 ? singulier : pluriel_}`;
}

export function ou(valeur: string | null | undefined, defaut = "—"): string {
  const v = (valeur ?? "").trim();
  return v.length > 0 ? v : defaut;
}

export function troncature(rendus: number, total: number): string | null {
  return total > rendus ? `${nombreFr(rendus)} premiers sur ${nombreFr(total)}` : null;
}

export function motsCles(bruts: string | null | undefined, max = 12): string | null {
  if (!bruts) return null;
  const parts = bruts
    .split(/[|—–]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return null;
  const gardes = parts.slice(0, max);
  const suffixe = parts.length > max ? ` … (+${nombreFr(parts.length - max)})` : "";
  return gardes.join(" — ") + suffixe;
}

export function joindre(parts: Array<string | null | undefined>, sep = " · "): string {
  return parts.filter((p): p is string => typeof p === "string" && p.trim().length > 0).join(sep);
}
