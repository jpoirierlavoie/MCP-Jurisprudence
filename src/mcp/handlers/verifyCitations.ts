import { ok, type ToolResult } from "@poirierlavoie/mcp-socle";
import { describeError } from "../../canlii/client";
import { relancerSiInterruptionGouverne } from "../../canlii/errors";
import type { Lang } from "../../canlii/types";
import { type CompareResult, compareTitles } from "../../citation/compare";
import { formLabel, parseCitation, type ResolvableForm, resolve } from "../../citation/parse";
import { dateFr, pluriel } from "../../format/fr";
import {
  EXPLICATION_INDETERMINEE,
  EXPLICATIONS_INTROUVABLE,
  ficheDecision,
  GARDE_VERIFICATION,
  noteEtranglement,
  numeroter,
} from "../../format/render";
import {
  type CaseRow,
  collectCaseTitles,
  hasLangCached,
  projectCaseForLang,
  searchLocal,
} from "../../store/cases";
import { loadDirectory } from "../../store/databases";
import { lookupCase } from "../../store/lookup";
import type { ToolContext } from "../registry";

type Verdict =
  | "CONFIRMÉE"
  | "DISCORDANTE"
  | "INTROUVABLE"
  | "NON CONSTRUCTIBLE"
  | "ILLISIBLE"
  | "INDÉTERMINÉE";

function citationAssainie(brut: string): string {
  const uneLigne = brut.replace(/\s+/g, " ").trim();
  // biome-ignore lint/suspicious/noControlCharactersInRegex: c'est précisément ce qu'on retire.
  return uneLigne.replace(/[\u0000-\u001f\u007f]/g, "");
}

export function citationSure(brut: string): string {
  const assainie = citationAssainie(brut);
  return assainie.length > 200 ? `${assainie.slice(0, 200)}…` : assainie;
}

export function champDonneeSaine(brut: string, max = 200): string {
  const propre = citationAssainie(brut).replace(/[`<>«»]/g, "'");
  const bornee = propre.length > max ? `${propre.slice(0, max)}…` : propre;
  return JSON.stringify(bornee);
}

interface Demande {
  citation: string;
  expected_title?: string;
  expected_year?: number;
}

export async function verifyCitations(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const demandes = (args.citations ?? []) as Demande[];
  const lang = (args.lang as Lang) ?? "fr";
  const refresh = args.refresh === true;
  const now = ctx.now ?? new Date();
  const dir = await loadDirectory(ctx.db);
  const connus = (code: string) => dir.courtCodes.has(code);

  const blocs: string[] = [];
  let budgetEpuise = false;

  for (const d of demandes) {
    const brut = String(d.citation ?? "");
    const citation = citationSure(brut);
    const parsed = parseCitation(citationAssainie(brut), connus);
    const res = resolve(parsed.primary, dir);

    if (parsed.primary.kind === "unparsed") {
      blocs.push(
        [
          `${citation} — ILLISIBLE`,
          "Aucune forme de citation reconnue (ni citation neutre, ni citation attribuée",
          "par CanLII, ni recueil, ni identifiant d'éditeur).",
          "→ Fournir la citation neutre, ou les noms des parties et l'année à find_case.",
        ].join("\n"),
      );
      continue;
    }

    if (
      parsed.primary.kind === "reporter" ||
      parsed.primary.kind === "publisher" ||
      res.constructible === "non"
    ) {
      const lignes = [`${citation} — NON CONSTRUCTIBLE`, res.raison];
      if (
        (parsed.primary.kind === "reporter" || parsed.primary.kind === "canlii") &&
        parsed.primary.year !== null &&
        parsed.primary.year > now.getUTCFullYear() + 1
      ) {
        lignes.push(
          `⚠ Année future / invraisemblable (${parsed.primary.year}, année courante : ${now.getUTCFullYear()}).`,
        );
      }
      const titreRecherche = d.expected_title ?? parsed.inlineTitle;
      if (titreRecherche) {
        const bornes = d.expected_year
          ? { yearFrom: d.expected_year - 1, yearTo: d.expected_year + 1 }
          : {};
        const candidats = (await searchLocal(ctx.db, titreRecherche, { ...bornes, limit: 15 }))
          .filter((c) =>
            collectCaseTitles(c).some(
              (t) => compareTitles(titreRecherche, t).verdict !== "discordance",
            ),
          )
          .slice(0, 5);
        if (candidats.length > 0) {
          lignes.push(
            "",
            `Candidats de l'index local (données brutes non vérifiées, ${pluriel(candidats.length, "fiche", "fiches")}) :`,
          );
          for (const c of candidats) {
            const titreLit = champDonneeSaine(c.title);
            const refBrute = c.citation ?? c.neutral_cite;
            const refLit = refBrute ? champDonneeSaine(refBrute) : "—";
            lignes.push(`  · intitulé=${titreLit} — réf=${refLit} (${dateFr(c.decision_date)})`);
          }
          lignes.push("→ Confirmer avec find_case (balayage vif) puis verify_citations.");
        } else {
          lignes.push(
            "",
            "→ Fournir les noms des parties et l'année à find_case (aucune correspondance dans l'index local pour l'intitulé attendu).",
          );
        }
      } else {
        lignes.push("→ Fournir les noms des parties et l'année à find_case.");
      }
      blocs.push(lignes.join("\n"));
      continue;
    }

    const form = parsed.primary as ResolvableForm;
    if (form.year > now.getUTCFullYear() + 1) {
      blocs.push(
        [
          `${citation} — INTROUVABLE`,
          `Forme ${parsed.primary.kind === "neutral" ? "neutre" : "attribuée par CanLII"} bien formée (${res.databaseId} / ${res.caseId}), mais l'année (${form.year}) est future / invraisemblable (année courante : ${now.getUTCFullYear()}).`,
          "Aucun appel à CanLII n'a été fait : une décision ne peut pas porter une année future. Vérifier la transcription de l'année.",
        ].join("\n"),
      );
      continue;
    }

    let lookup: Awaited<ReturnType<typeof lookupCase>>;
    try {
      lookup = await lookupCase(form, res, {
        db: ctx.db,
        client: ctx.client,
        dir,
        lang,
        refresh,
        now,
      });
    } catch (e) {
      relancerSiInterruptionGouverne(e);
      blocs.push(`${citation} — INDÉTERMINÉE\n${describeError(e)}`);
      continue;
    }

    if (lookup.status === "budget") {
      budgetEpuise = true;
      blocs.push(
        `${citation} — INDÉTERMINÉE\nBudget d'appels épuisé : cette citation n'a pas pu être vérifiée.`,
      );
      continue;
    }

    if (lookup.status === "erreur") {
      blocs.push(
        `${citation} — INDÉTERMINÉE\nCanLII n'a pas pu être interrogé. ${EXPLICATION_INDETERMINEE}`,
      );
      continue;
    }

    if (lookup.status === "base_inconnue") {
      blocs.push(
        [`${citation} — INTROUVABLE`, lookup.message ?? "", EXPLICATIONS_INTROUVABLE]
          .filter(Boolean)
          .join("\n"),
      );
      continue;
    }

    if (lookup.status === "introuvable" || !lookup.row) {
      blocs.push(
        [
          `${citation} — INTROUVABLE`,
          `Forme ${parsed.primary.kind === "neutral" ? "neutre" : "attribuée par CanLII"} bien formée (${res.databaseId} / ${res.caseId}), mais aucune fiche.`,
          EXPLICATIONS_INTROUVABLE,
        ].join("\n"),
      );
      continue;
    }

    let row = lookup.row;
    let ecarts = comparer(row, d, parsed.inlineTitle, lang);
    const ecartIntitule = ecarts.some((e) => e.champ.startsWith("Intitulé"));
    const altLang: Lang = lang === "fr" ? "en" : "fr";
    let noteAutreLangue: string | null = null;
    let altInterrompue = false;
    if (ecartIntitule && !hasLangCached(row, altLang)) {
      try {
        const altLookup = await lookupCase(form, res, {
          db: ctx.db,
          client: ctx.client,
          dir,
          lang: altLang,
          refresh,
          now,
        });
        if (altLookup.status === "trouvee" && altLookup.row) {
          row = projectCaseForLang(altLookup.row, lang);
          ecarts = comparer(row, d, parsed.inlineTitle, lang);
        } else if (altLookup.status === "budget") {
          budgetEpuise = true;
          altInterrompue = true;
          noteAutreLangue = `Vérification dans l'autre langue (${altLang}) interrompue : budget d'appels épuisé.`;
        } else if (altLookup.status === "erreur") {
          altInterrompue = true;
          noteAutreLangue = `Vérification dans l'autre langue (${altLang}) impossible : ${altLookup.message ?? "erreur CanLII"}`;
        }
      } catch (e) {
        relancerSiInterruptionGouverne(e);
        altInterrompue = true;
        noteAutreLangue = `Vérification dans l'autre langue (${altLang}) impossible : ${describeError(e)}`;
      }
    }
    const ecartHorsIntitule = ecarts.some((e) => !e.champ.startsWith("Intitulé"));
    const verdict: Verdict =
      ecarts.length === 0
        ? "CONFIRMÉE"
        : altInterrompue && !ecartHorsIntitule
          ? "INDÉTERMINÉE"
          : "DISCORDANTE";
    blocs.push(
      rendreFiche(citation, verdict, row, ecarts, parsed.parallel.map(formLabel), noteAutreLangue),
    );
  }

  const entete = `Vérification de ${pluriel(demandes.length, "citation", "citations")} — collection CanLII.`;
  const corps = blocs.map((b, i) => numeroter(i + 1, b)).join("\n\n");
  const pied = [
    budgetEpuise ? "Budget d'appels épuisé — résultat partiel." : "",
    noteEtranglement(ctx.client.usage().throttled, !budgetEpuise),
    GARDE_VERIFICATION,
  ]
    .filter((p) => p.length > 0)
    .join("\n\n");

  return ok([entete, corps, pied].join("\n\n"));
}

interface Ecart {
  champ: string;
  attendu: string;
  obtenu: string;
  note: string;
}

function compareAcrossTitles(attendu: string, row: CaseRow): CompareResult {
  const titres = collectCaseTitles(row);
  let meilleur = compareTitles(attendu, row.title);
  if (meilleur.verdict === "appariement") return meilleur;
  for (const t of titres) {
    if (t === row.title) continue;
    const c = compareTitles(attendu, t);
    if (c.verdict === "appariement") return c;
    if (
      c.verdict === "partiel" &&
      (meilleur.verdict === "discordance" || c.jaccard > meilleur.jaccard)
    ) {
      meilleur = c;
    }
  }
  return meilleur;
}

function noteIntituleEcart(c: CompareResult, row: CaseRow, lang: Lang): string {
  const altLang: Lang = lang === "fr" ? "en" : "fr";
  const altTitre = altLang === "en" ? row.title_en : row.title_fr;
  const suffixe =
    altTitre && altTitre !== row.title
      ? ` ; autre version CanLII (${altLang}) : « ${altTitre} »`
      : "";
  return c.verdict === "partiel"
    ? `appariement partiel (indice ${c.jaccard.toFixed(2).replace(".", ",")}) — traité comme une discordance${suffixe}`
    : `discordance${suffixe}`;
}

function comparer(row: CaseRow, d: Demande, inlineTitle: string | null, lang: Lang): Ecart[] {
  const ecarts: Ecart[] = [];

  if (d.expected_title) {
    const c = compareAcrossTitles(d.expected_title, row);
    if (c.verdict !== "appariement") {
      ecarts.push({
        champ: "Intitulé",
        attendu: d.expected_title,
        obtenu: row.title,
        note: noteIntituleEcart(c, row, lang),
      });
    }
  }

  if (inlineTitle && (!d.expected_title || d.expected_title !== inlineTitle)) {
    const c = compareAcrossTitles(inlineTitle, row);
    if (c.verdict !== "appariement") {
      ecarts.push({
        champ: d.expected_title ? "Intitulé (dans la citation)" : "Intitulé",
        attendu: inlineTitle,
        obtenu: row.title,
        note: noteIntituleEcart(c, row, lang),
      });
    }
  }

  if (d.expected_year) {
    if (!row.decision_date) {
      ecarts.push({
        champ: "Année",
        attendu: String(d.expected_year),
        obtenu: "—",
        note: "CanLII ne rend aucune date pour cette fiche : l'année n'a PAS été vérifiée",
      });
    } else {
      const annee = Number(row.decision_date.slice(0, 4));
      if (Number.isFinite(annee) && annee !== d.expected_year) {
        ecarts.push({
          champ: "Année",
          attendu: String(d.expected_year),
          obtenu: String(annee),
          note: `date complète chez CanLII : ${dateFr(row.decision_date)}`,
        });
      }
    }
  }

  return ecarts;
}

function rendreFiche(
  citation: string,
  verdict: Verdict,
  row: CaseRow,
  ecarts: Ecart[],
  paralleles: string[],
  noteAutreLangue: string | null = null,
): string {
  const lignes = [`${citation} — ${verdict}`];

  for (const e of ecarts) {
    lignes.push(`${e.champ} attendu : « ${e.attendu} »`);
    lignes.push(`${e.champ} obtenu  : « ${e.obtenu} »`);
    lignes.push(`(${e.note})`);
  }
  if (noteAutreLangue && ecarts.length > 0) {
    lignes.push(`(${noteAutreLangue})`);
  }

  lignes.push(ficheDecision(row));

  if (paralleles.length > 0) {
    lignes.push(`Formes parallèles dans la citation soumise : ${paralleles.join(" ; ")}`);
  }

  if (verdict === "DISCORDANTE") {
    lignes.push(
      "→ La citation existe mais ne désigne pas la décision annoncée. Vérifier la source.",
    );
  } else if (verdict === "INDÉTERMINÉE") {
    lignes.push(
      "→ Identité partiellement vérifiée : l'autre version linguistique n'a pas pu être interrogée. Vérifier l'intitulé à la source ou réessayer.",
    );
  }

  return lignes.join("\n");
}
