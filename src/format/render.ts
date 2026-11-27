import type { CaseRow } from "../store/cases";
import { dateFr, joindre, motsCles, nombreFr, ou } from "./fr";

export const GARDE_VERIFICATION =
  "Établit l'existence et l'identité, jamais l'autorité actuelle (aucun historique\n" +
  "d'appel, aucun indicateur de traitement) ni le contenu du dispositif.";

export const GARDE_RECHERCHE =
  "Recherche sur l'intitulé et les mots-clés uniquement — l'API de CanLII n'expose\n" +
  "pas le texte des décisions.";

export const GARDE_SORTS_TETE = "Sorts ultérieurs — INDICE HEURISTIQUE, à vérifier à la source.";

export const GARDE_SORTS_PIED =
  "Ce résultat n'indique NI le sens du traitement (confirmée, infirmée, distinguée),\n" +
  "NI les pourvois pendants, NI les refus de permission d'appeler. Ce n'est pas un\n" +
  "citateur professionnel.";

export const GARDE_CITATEUR =
  "Listes brutes : elles n'indiquent AUCUN sens de traitement (suivi, distingué,\n" +
  "infirmé). Pour les dispositions québécoises, enchaîner avec le connecteur\n" +
  "« lois » afin d'en lire le texte officiel.";

export const GARDE_AUTORITES_DISPENSEES =
  "Dispense propre au tribunal et à la liste visés, sous réserve de ses conditions\n" +
  "procédurales (cahier technologique, extraits ou renvoi d'onglet), sans établir\n" +
  "NI l'autorité actuelle de la décision (aucun historique d'appel ni traitement),\n" +
  "NI le contenu de son dispositif. Mots-clés (index CanLII, non vérifiés) et liens\n" +
  "des listes sources non vérifiés ; compilation des listes sources au 2026-11-24.";

const ETRANGLEMENT_SANS_PERTE =
  "Ils ont été rejoués et le rythme a été réduit d'office : les résultats ci-dessus\n" +
  "ne sont ni tronqués ni affaiblis par ce fait. Un lot plus petit, ou repris plus\n" +
  "tard, s'exécutera plus vite.";

const ETRANGLEMENT_RESULTAT_PARTIEL =
  "Ils ont été rejoués, mais le résultat ci-dessus n'est PAS complet pour autant :\n" +
  "son étendue réelle n'est pas connue. Reprendre plus tard, ou sur un lot plus petit.";

export function noteEtranglement(etranglements: number, resultatComplet = true): string {
  if (etranglements <= 0) return "";
  const pluriel = etranglements > 1 ? "appels" : "appel";
  const tete = `CanLII a étranglé ${nombreFr(etranglements)} ${pluriel} pendant cet appel (HTTP 429).`;
  return [tete, resultatComplet ? ETRANGLEMENT_SANS_PERTE : ETRANGLEMENT_RESULTAT_PARTIEL].join(
    "\n",
  );
}

export const GARDE_VERSION_LEGISLATIVE =
  "⚠ Ces dates bornent la VERSION que CanLII sert, et non l'instrument : elles ne\n" +
  "datent ni son entrée en vigueur, ni son abrogation. Un texte en vigueur depuis des\n" +
  "décennies peut porter une date de début toute récente.";

export const GARDE_DIFFUSION =
  "La diffusion sur CanLII connaît un délai : prévoir un jeu de deux jours sur les\n" +
  "filtres de date de diffusion.";

export const MARQUEUR_RECONCILIATION = "⚠ RÉCONCILIATION REQUISE";

export const EXPLICATIONS_INTROUVABLE =
  "Explications possibles : numéro erroné · décision hors de la collection ·\n" +
  "diffusion récente (prévoir un jeu de 2 jours).";

export const EXPLICATION_INDETERMINEE =
  "AUCUN constat n'a été fait : ce n'est PAS un constat d'absence. Réessayer plus tard.";

export const LISTES_SANS_FICHE =
  "Les listes de CanLII ne portent ni date de décision, ni numéro de dossier, ni\n" +
  "hyperlien : pour la fiche complète d'une décision, employer get_case.";

export const TEXTE_NON_EXPOSE =
  "Le TEXTE de la décision n'est pas exposé par l'API de CanLII : suivre l'hyperlien.";

export const LEGISLATION_METADONNEES =
  "Métadonnées seulement — l'API de CanLII ne rend pas le texte. Pour le TEXTE d'une\n" +
  "loi ou d'un règlement du Québec, employer le connecteur « lois »,\n" +
  "qui rend le texte officiel verbatim.";

export const LEGISLATION_METADONNEES_LISTE =
  "Métadonnées seulement. Pour le TEXTE d'une loi ou d'un règlement du Québec,\n" +
  "employer le connecteur « lois », qui rend le texte officiel verbatim.";

export const DIAGNOSTIC_SEULEMENT =
  "Outil de diagnostic : il n'établit RIEN sur l'existence de la décision. " +
  "Pour l'éprouver réellement, utiliser verify_citations.";

export function lien(row: { url: string | null }): string | null {
  const u = (row.url ?? "").trim();
  if (u.length === 0) return null;
  if (/\s/.test(u)) return null;
  for (let i = 0; i < u.length; i++) {
    const code = u.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username !== "" || parsed.password !== "") return null;
  if (parsed.port !== "") return null;
  const host = parsed.hostname.toLowerCase();
  if (host === "api.canlii.org" || host.endsWith(".api.canlii.org")) return null;
  if (host === "canlii.ca" || host.endsWith(".canlii.ca")) return parsed.toString();
  return null;
}

export function ficheDecision(row: CaseRow, options: { avecIds?: boolean } = {}): string {
  const lignes: string[] = [row.title];
  lignes.push(
    joindre([
      ou(row.citation, row.neutral_cite ?? "—"),
      row.database_id,
      dateFr(row.decision_date),
    ]),
  );
  if (options.avecIds) lignes.push(`Identifiants : ${row.database_id} / ${row.case_id}`);
  if (row.docket_number) lignes.push(`N° de dossier : ${row.docket_number}`);
  const mc = motsCles(row.keywords);
  if (mc) lignes.push(`Mots-clés (index CanLII, non vérifiés) : ${mc}`);
  const l = lien(row);
  if (l) lignes.push(l);
  return lignes.join("\n");
}

export function ligneCandidat(row: CaseRow): string {
  const lignes: string[] = [row.title];
  lignes.push(
    joindre([
      ou(row.citation, row.neutral_cite ?? "—"),
      dateFr(row.decision_date),
      `${row.database_id}/${row.case_id}`,
    ]),
  );
  const l = lien(row);
  if (l) lignes.push(l);
  return lignes.join("\n");
}

export function numeroter(index: number, bloc: string): string {
  const lignes = bloc.split("\n");
  const tete = `${index}. ${lignes[0] ?? ""}`;
  const suite = lignes.slice(1).map((l) => (l.length > 0 ? `   ${l}` : l));
  return [tete, ...suite].join("\n");
}

export function document(entete: string, blocs: string[], pied?: string | null): string {
  const corps = blocs.map((b, i) => numeroter(i + 1, b)).join("\n\n");
  return [entete, corps, pied ?? ""].filter((s) => s.trim().length > 0).join("\n\n");
}

export function provenance(opts: {
  locales: number;
  appels: number;
  parcourues: number;
  persistees: boolean;
}): string {
  if (opts.appels === 0) {
    return `Provenance : index local (${nombreFr(opts.locales)} fiche(s)), aucun appel à CanLII.`;
  }
  const persist = opts.persistees ? ", persistées" : "";
  return (
    `Provenance : index local (${nombreFr(opts.locales)} fiche(s)) + balayage vif ` +
    `(${nombreFr(opts.appels)} appel(s), ${nombreFr(opts.parcourues)} fiche(s) parcourues${persist}).`
  );
}
