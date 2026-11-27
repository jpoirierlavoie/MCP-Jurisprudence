import { err, ok, type ToolResult } from "@poirierlavoie/mcp-socle";
import { describeError } from "../../canlii/client";
import { CanliiBudgetError, relancerSiInterruptionGouverne } from "../../canlii/errors";
import type { CaseListResponse, Lang } from "../../canlii/types";
import { type CompareResult, compareTitles } from "../../citation/compare";
import { persisterBalayages } from "../../config";
import { pluriel, troncature } from "../../format/fr";
import {
  document,
  EXPLICATION_INDETERMINEE,
  GARDE_RECHERCHE,
  ligneCandidat,
  noteEtranglement,
  provenance,
} from "../../format/render";
import {
  anneeInferee,
  type CaseRow,
  collectCaseTitles,
  projectCaseForLang,
  rowFromListItem,
  searchLocal,
  upsertCases,
} from "../../store/cases";
import { LIMITES } from "../defauts";
import type { ToolContext } from "../registry";

const BASES_QC_USUELLES = ["csc-scc", "qcca", "qccs", "qccq"];

const FENETRE_MAX_SANS_TRIBUNAL = 3;

const PAGE = 5000;

export async function findCase(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const titre = String(args.title ?? "").trim();
  const databaseId = (args.database_id as string | undefined)?.trim() || null;
  const lang = (args.lang as Lang) ?? "fr";
  const bornes = LIMITES.find_case;
  const limit = Math.min(Math.max((args.limit as number) ?? bornes.defaut, 1), bornes.max);
  const now = ctx.now ?? new Date();

  const anneeCourante = now.getUTCFullYear();
  const yearFrom = (args.year_from as number | undefined) ?? null;
  const yearTo = (args.year_to as number | undefined) ?? null;

  if (yearFrom && yearTo && yearFrom > yearTo) {
    return err("« year_from » doit être antérieure ou égale à « year_to ».");
  }

  const debut = yearFrom ?? (yearTo ? yearTo - FENETRE_MAX_SANS_TRIBUNAL + 1 : anneeCourante - 2);
  const fin = yearTo ?? anneeCourante;
  const etendue = fin - debut + 1;

  if (!databaseId && etendue > FENETRE_MAX_SANS_TRIBUNAL) {
    return err(
      `Sans « database_id », la fenêtre de dates ne peut pas dépasser ${FENETRE_MAX_SANS_TRIBUNAL} ans ` +
        `(demandée : ${etendue} ans, ${debut}→${fin}). Préciser le tribunal (voir list_databases) ` +
        "ou resserrer year_from / year_to.",
    );
  }

  const localesBrutes = await searchLocal(ctx.db, titre, {
    databaseId,
    yearFrom,
    yearTo,
    limit: Math.max(limit * 4, 50),
  });
  const locales = localesBrutes
    .filter((r) => meilleurAppariementTitre(titre, r).verdict !== "discordance")
    .map((r) => projectCaseForLang(r, lang));

  const live = args.live === undefined ? locales.length < 3 : args.live === true;

  let parcourues = 0;
  let appels = 0;
  let vives: CaseRow[] = [];
  let noteBalayage: string | null = null;
  let budgetEpuise = false;
  let balayageEchoue = false;

  if (live) {
    const bases = databaseId ? [databaseId] : BASES_QC_USUELLES;
    const avantBalayage = ctx.client.callsMade();
    try {
      const r = await balayer(ctx, bases, debut, fin, lang, titre, now);
      vives = r.retenues;
      parcourues = r.parcourues;
      appels = r.appels;
      budgetEpuise = r.budgetEpuise;
    } catch (e) {
      relancerSiInterruptionGouverne(e);
      balayageEchoue = true;
      appels = ctx.client.callsMade() - avantBalayage;
      noteBalayage = `Balayage interrompu — ${describeError(e)}`;
    }
  }

  const FED_BI: Record<string, string> = {
    scc: "csc",
    csc: "csc",
    fca: "caf",
    caf: "caf",
    fc: "cf",
    cf: "cf",
    tcc: "cci",
    cci: "cci",
  };
  const dedupClef = (r: CaseRow) => {
    const cid = r.case_id.toLowerCase();
    const m = cid.match(/^(\d{4})([a-z]+)(\d+)$/);
    const canon = m && FED_BI[m[2]!] ? `${m[1]}${FED_BI[m[2]!]}.${m[3]}` : cid;
    return `${r.database_id.toLowerCase()}/${canon}`;
  };
  const parClef = new Map<string, CaseRow>();
  for (const r of [...locales, ...vives]) {
    const k = dedupClef(r);
    const prev = parClef.get(k);
    if (!prev || (!prev.decision_date && r.decision_date)) {
      parClef.set(k, r);
    }
  }
  const tous = [...parClef.values()].sort((a, b) => {
    const cmpA = meilleurAppariementTitre(titre, a);
    const cmpB = meilleurAppariementTitre(titre, b);
    return (
      rangVerdict(cmpB.verdict) - rangVerdict(cmpA.verdict) ||
      cmpB.jaccard - cmpA.jaccard ||
      anneeInferee(b) - anneeInferee(a) ||
      (b.decision_date ?? "").localeCompare(a.decision_date ?? "") ||
      a.case_id.localeCompare(b.case_id)
    );
  });
  const rendus = tous.slice(0, limit);

  const prov = provenance({
    locales: locales.length,
    appels,
    parcourues,
    persistees: persisterBalayages(ctx.env),
  });

  if (rendus.length === 0) {
    return ok(
      [
        balayageEchoue
          ? `Recherche INTERROMPUE pour « ${titre} »${databaseId ? ` (${databaseId})` : ""}${fenetreLabel(yearFrom, yearTo)} — aucun constat.`
          : `Aucun candidat pour « ${titre} »${databaseId ? ` (${databaseId})` : ""}${fenetreLabel(yearFrom, yearTo)}.`,
        "",
        prov,
        noteBalayage,
        budgetEpuise ? "Budget d'appels épuisé — résultat partiel." : null,
        balayageEchoue ? EXPLICATION_INDETERMINEE : null,
        noteEtranglement(ctx.client.usage().throttled, !balayageEchoue && !budgetEpuise) || null,
        "",
        "Une absence de candidat n'établit pas l'inexistence de la décision : la couverture",
        "de CanLII a des bornes historiques, et la diffusion connaît un délai.",
        "",
        GARDE_RECHERCHE,
      ]
        .filter((s): s is string => s !== null)
        .join("\n"),
    );
  }

  const contexte = `${databaseId ? `${databaseId}, ` : ""}${fenetreLabel(yearFrom, yearTo, true)}`;

  const entete = balayageEchoue
    ? `Recherche INTERROMPUE pour « ${titre} » (${contexte}) — liste INCOMPLÈTE : ` +
      `${pluriel(rendus.length, "candidat obtenu", "candidats obtenus")} avant l'interruption, ` +
      "l'étendue réelle n'est pas connue."
    : `${pluriel(rendus.length, "candidat", "candidats")} pour « ${titre} » (${contexte}) :`;

  const tronque = balayageEchoue ? null : troncature(rendus.length, tous.length);
  const pied = [
    prov,
    noteBalayage,
    tronque ? `Troncature : ${tronque}.` : null,
    budgetEpuise ? "Budget d'appels épuisé — résultat partiel." : null,
    noteEtranglement(ctx.client.usage().throttled, !balayageEchoue && !budgetEpuise) || null,
    rendus.some((r) => !r.decision_date)
      ? "Un candidat rendu « — » n'a pas de date : les listes de CanLII n'en portent\n" +
        "aucune. Pour la date exacte, employer get_case."
      : null,
    "",
    GARDE_RECHERCHE,
  ]
    .filter((s): s is string => s !== null)
    .join("\n");

  return ok(document(entete, rendus.map(ligneCandidat), pied));
}

function fenetreLabel(from: number | null, to: number | null, nu = false): string {
  if (!from && !to) return nu ? "toutes années" : "";
  const f = from ?? "…";
  const t = to ?? "…";
  return nu ? `${f}→${t}` : ` (${f}→${t})`;
}

function rangVerdict(verdict: CompareResult["verdict"]): number {
  switch (verdict) {
    case "appariement":
      return 2;
    case "partiel":
      return 1;
    default:
      return 0;
  }
}

function meilleurAppariementTitre(requete: string, row: CaseRow): CompareResult {
  const titres = collectCaseTitles(row);
  let meilleur = compareTitles(requete, row.title);
  for (const t of titres) {
    if (t === row.title) continue;
    const c = compareTitles(requete, t);
    if (
      rangVerdict(c.verdict) > rangVerdict(meilleur.verdict) ||
      (rangVerdict(c.verdict) === rangVerdict(meilleur.verdict) && c.jaccard > meilleur.jaccard)
    ) {
      meilleur = c;
    }
  }
  return meilleur;
}

async function balayer(
  ctx: ToolContext,
  bases: string[],
  debut: number,
  fin: number,
  lang: Lang,
  titre: string,
  now: Date,
): Promise<{ retenues: CaseRow[]; parcourues: number; appels: number; budgetEpuise: boolean }> {
  const retenues: CaseRow[] = [];
  let parcourues = 0;
  const avant = ctx.client.callsMade();
  let budgetEpuise = false;

  const persister = persisterBalayages(ctx.env);

  boucle: for (const base of bases) {
    for (let annee = fin; annee >= debut; annee--) {
      let offset = 0;
      for (;;) {
        if (ctx.client.remaining() === 0) {
          budgetEpuise = true;
          break boucle;
        }
        let page: CaseListResponse;
        try {
          page = await ctx.client.get<CaseListResponse>(`caseBrowse/${lang}/${base}/`, {
            offset,
            resultCount: PAGE,
            decisionDateAfter: `${annee}-01-01`,
            decisionDateBefore: `${annee}-12-31`,
          });
        } catch (e) {
          if (e instanceof CanliiBudgetError) {
            budgetEpuise = true;
            break boucle;
          }
          throw e;
        }
        const items = page.cases ?? [];
        if (items.length === 0) break;
        parcourues += items.length;

        const lignes = items
          .map((it) => rowFromListItem(it, base, lang, "sweep", now))
          .filter((r): r is CaseRow => r !== null);

        if (persister) await upsertCases(ctx.db, lignes);

        for (const l of lignes) {
          const c = compareTitles(titre, l.title);
          if (c.verdict !== "discordance") retenues.push(l);
        }

        if (items.length < PAGE) break;
        offset += items.length;
      }
    }
  }

  return { retenues, parcourues, appels: ctx.client.callsMade() - avant, budgetEpuise };
}
