/**
 * `verify_citations` — L'OUTIL PIVOT (spécification §7.1, annexe A.1).
 *
 * SIX verdicts. CINQ portent un constat : CONFIRMÉE · DISCORDANTE · INTROUVABLE ·
 * NON CONSTRUCTIBLE · ILLISIBLE. Le sixième, INDÉTERMINÉE, dit qu'AUCUN constat n'a pu
 * être fait — et ne vaut JAMAIS absence (invariant 9). Ce cartouche en annonçait CINQ
 * alors que le fichier en poussait six depuis longtemps ; corrigé le 2026-09-16.
 *
 * Les quatre conséquences du contrat de vérité (§2) sont ici, et chacune est
 * verrouillée par `test/garde.test.ts` :
 *   1. la mise en garde figure dans le CORPS de la réponse, pas seulement dans la
 *      description de l'outil ;
 *   2. un INTROUVABLE n'est JAMAIS formulé comme « cette décision n'existe pas » : il
 *      énumère les explications concurrentes ;
 *   3. un CONFIRMÉE porte, dans la MÊME sortie, la phrase indiquant qu'il n'établit ni
 *      l'autorité actuelle ni le dispositif ;
 *   4. en cas d'écart, les valeurs BRUTES de CanLII sont toujours affichées — le
 *      praticien tranche, l'outil ne masque pas.
 */

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

/**
 * La citation soumise est RÉÉMISE dans la sortie : elle doit tenir sur UNE ligne.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ UN VERDICT NE DOIT PAS POUVOIR ÊTRE FORGÉ PAR L'ENTRÉE.                      ║
 * ║                                                                              ║
 * ║ Le gabarit rend « <citation> — <VERDICT> » en tête de bloc. La citation       ║
 * ║ n'était jusqu'ici que `.trim()` : une chaîne contenant un saut de ligne       ║
 * ║ faisait donc apparaître dans la sortie une ligne « … — CONFIRMÉE » que ce     ║
 * ║ connecteur n'a JAMAIS rendue, et repoussait le vrai verdict en queue d'une    ║
 * ║ autre ligne, où ni un lecteur ni une expression régulière ne le cherchent.    ║
 * ║                                                                              ║
 * ║ Ce n'est pas une hypothèse d'école : la description de l'outil annonce qu'il  ║
 * ║ sert à éprouver « des références tirées de la doctrine, d'un moteur de        ║
 * ║ recherche ou d'un texte rédigé par une IA ». L'entrée est donc, par           ║
 * ║ construction, sous le contrôle du texte que l'on cherche justement à mettre   ║
 * ║ en doute. Un résultat faux rendu avec aplomb : §2, exactement.                ║
 * ║                                                                              ║
 * ║ On REPLIE plutôt que de refuser, et c'est délibéré : une citation collée      ║
 * ║ depuis un PDF porte souvent un retour à la ligne parasite, et la refuser      ║
 * ║ transformerait une maladresse banale en échec. Le repli ne perd rien — la     ║
 * ║ citation reste lisible — et referme la brèche. La troncature, elle, borne un  ║
 * ║ champ qui vient de l'extérieur, comme `src/index.ts` le fait déjà pour un     ║
 * ║ nom d'outil inconnu.                                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
export function citationAssainie(brut: string): string {
  // Tout blanc — saut de ligne, tabulation, séparateurs Unicode — devient une
  // espace simple. `\s` en JavaScript couvre déjà \n, \r, \t, \v, \f et U+2028/29.
  const uneLigne = brut.replace(/\s+/g, " ").trim();
  // Les autres caractères de contrôle ne sont pas des blancs et survivraient au
  // remplacement ci-dessus ; ils n'ont rien à faire dans une citation.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: c'est précisément ce qu'on retire.
  return uneLigne.replace(/[\u0000-\u001f\u007f]/g, "");
}

/**
 * La forme d'ÉCHO : assainie ET bornée à 200 caractères.
 *
 * ⚠ La borne appartient à l'AFFICHAGE, jamais à l'analyse. Ne pas réunir les deux
 *   fonctions « pour simplifier » : c'est précisément la confusion qui a fait analyser
 *   une citation tronquée, et rendre ILLISIBLE une citation doctrinale valide dont la
 *   citation neutre tombait au-delà du 200ᵉ caractère.
 */
export function citationSure(brut: string): string {
  const assainie = citationAssainie(brut);
  return assainie.length > 200 ? `${assainie.slice(0, 200)}…` : assainie;
}

/**
 * Encode un champ externe non fiable (ex. intitulé ou référence issue du cache CanLII)
 * comme littéral JSON borné sur une seule ligne, sans balises ni accents graves, afin
 * qu'un modèle lecteur le traite comme donnée et non comme instruction.
 */
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
    // DEUX formes de la même entrée, et la distinction est load-bearing.
    //
    // `citationSure` BORNE à 200 caractères parce que la citation est RÉÉMISE en tête
    // du bloc : c'est une précaution d'ÉCHO. Analyser cette forme bornée était un
    // défaut — une citation doctrinale complète (« Machin c. Truc, [2008] 1 R.C.S. 190,
    // 2008 CSC 9, par. 47 »ss, avec noms de parties et historique) dépasse aisément 200
    // caractères, et sa citation neutre se trouve alors APRÈS la coupure. L'analyseur
    // ne la voyait jamais : verdict ILLISIBLE sur une citation parfaitement valide,
    // rendu avec aplomb. Introduit le 2026-09-16 avec le repli, corrigé le même jour.
    const brut = String(d.citation ?? "");
    const citation = citationSure(brut);
    const parsed = parseCitation(citationAssainie(brut), connus);
    const res = resolve(parsed.primary, dir);

    // ── ILLISIBLE ──────────────────────────────────────────────────────────
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

    // ── NON CONSTRUCTIBLE (recueils, éditeurs, CanLII sans parenthèses) ────
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
      // §7.1 étape 1 : si `expected_title` (ou intitulé dans la citation) est fourni,
      // enchaîner AUTOMATIQUEMENT une recherche bornée et proposer les candidats.
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

    // ── Garde d'année future / invraisemblable (D21) ──────────────────────
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

    // ── Résolution, avec la boucle d'auto-correction (§6.4) ────────────────
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
      // Une panne réseau n'est PAS une absence : la présenter en INTROUVABLE
      // affirmerait un fait qu'on n'a pas constaté.
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

    // ── Comparaison : intitulé (§6.5, D1/D2) et année ────────────────────
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
  // La note de rythme précède la mise en garde de §2 et ne s'y substitue jamais :
  // l'une parle de ce que le résultat établit, l'autre du temps qu'il a pris.
  const pied = [
    budgetEpuise ? "Budget d'appels épuisé — résultat partiel." : "",
    // Le même schéma vivait ici : « résultat partiel » suivi, une ligne plus bas, de
    // « ni tronqués ni affaiblis ». Deux affirmations adjacentes qui se contredisent.
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

/**
 * Compare l'attendu et l'obtenu.
 *
 * ⚠ Un appariement PARTIEL vaut DISCORDANTE, jamais CONFIRMÉE (§6.5). Mieux vaut un
 *   faux signalement qu'une fausse assurance.
 */
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
      // ⚠ UN CONTRÔLE SAUTÉ SE DIT. La condition portait `&& row.decision_date` : sans
      //   date, la comparaison d'année DISPARAISSAIT — sans un mot — et la citation
      //   pouvait ressortir CONFIRMÉE avec une année fausse, n'ayant jamais été
      //   comparée. C'est exactement le mode de panne de §2 : une incertitude connue
      //   transformée en assurance.
      //
      //   L'écart rend donc le verdict DISCORDANTE, et c'est délibéré (invariant 10) :
      //   mieux vaut un faux signalement qu'une fausse assurance. Le praticien voit
      //   qu'il reste quelque chose à vérifier, ce qui est la vérité.
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

  // §2 conséquence n° 4 : en cas d'écart, les DEUX valeurs, toujours.
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
