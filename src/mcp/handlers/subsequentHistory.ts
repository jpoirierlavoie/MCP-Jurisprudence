/**
 * `subsequent_history` (spécification §7.5, annexe A.3).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ OUTIL HEURISTIQUE. La mise en garde figure EN TÊTE ET EN PIED de la sortie.  ║
 * ║                                                                              ║
 * ║ AUCUNE formulation affirmative n'est permise ici : jamais « a été infirmée »,║
 * ║ jamais « confirmée en appel ». Uniquement « indice », « susceptible »,       ║
 * ║ « à vérifier ». Ce que l'outil produit, c'est une PISTE de recherche, pas un ║
 * ║ constat — l'API ne porte aucun indicateur de traitement, et un praticien qui ║
 * ║ prendrait cette liste pour un citateur professionnel s'exposerait.           ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { err, ok, type ToolResult } from "@poirierlavoie/mcp-socle";
import { describeError } from "../../canlii/client";
import { relancerSiInterruptionGouverne } from "../../canlii/errors";
import type { Lang } from "../../canlii/types";
import { titleSimilarity } from "../../citation/compare";
import { dateFr, pluriel } from "../../format/fr";
import { document, GARDE_SORTS_PIED, GARDE_SORTS_TETE } from "../../format/render";
import { collectCaseTitles, getCachedBatch, titleForLang } from "../../store/cases";
import {
  type EdgeRow,
  edgeStale,
  fetchEdges,
  getCachedEdges,
  replaceEdges,
} from "../../store/citator";
import { LIMITES } from "../defauts";
import type { ToolContext } from "../registry";
import { resoudreCible } from "./cible";

/** Table de hiérarchie (§7.5). Base de départ -> juridictions supérieures. */
const SUPERIEURES: Record<string, string[]> = {
  qccq: ["qccs", "qcca", "csc-scc"],
  qctal: ["qccs", "qcca", "csc-scc"],
  qctat: ["qccs", "qcca", "csc-scc"],
  qctaq: ["qccs", "qcca", "csc-scc"],
  qccs: ["qcca", "csc-scc"],
  qcca: ["csc-scc"],
};

/** Seuil de similarité d'intitulé (§7.5). */
const SEUIL = 0.5;

function superieures(base: string): string[] {
  return SUPERIEURES[base.toLowerCase()] ?? ["csc-scc"];
}

export async function subsequentHistory(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const lang: Lang = args.lang === "en" ? "en" : "fr";
  const bornes = LIMITES.subsequent_history;
  const limit = Math.min(Math.max((args.limit as number) ?? bornes.defaut, 1), bornes.max);
  const refresh = args.refresh === true;
  const now = ctx.now ?? new Date();

  const cible = await resoudreCible(args, ctx, now, lang);
  if (!cible.ok) return err(cible.message);
  const { databaseId, caseId, titre, titres, date } = cible;

  let aretes: EdgeRow[] = [];
  try {
    const cache = refresh ? null : await getCachedEdges(ctx.db, databaseId, caseId, "citing");
    if (cache && !edgeStale("citing", cache.fetchedAt, now)) {
      aretes = cache.edges;
    } else {
      aretes = await fetchEdges(ctx.client, databaseId, caseId, "citing", now);
      await replaceEdges(ctx.db, databaseId, caseId, "citing", aretes, now);
    }
  } catch (e) {
    relancerSiInterruptionGouverne(e);
    return err(describeError(e));
  }

  const rangs = superieures(databaseId);
  const couplesSuperieurs = aretes
    .filter((a): a is EdgeRow & { to_database_id: string; to_case_id: string } =>
      Boolean(a.to_database_id && a.to_case_id && rangs.includes(a.to_database_id.toLowerCase())),
    )
    .map((a) => [a.to_database_id, a.to_case_id] as const);
  const fiches =
    couplesSuperieurs.length > 0 ? await getCachedBatch(ctx.db, couplesSuperieurs) : new Map();

  const titresDepart = titres.length > 0 ? titres : titre ? [titre] : [];
  const candidats: Array<{
    arete: EdgeRow;
    titreAffiche: string | null;
    estLocalise: boolean;
    similarite: number;
    date: string | null;
  }> = [];

  for (const a of aretes) {
    // (a) juridiction de rang supérieur
    if (!a.to_database_id || !rangs.includes(a.to_database_id.toLowerCase())) continue;
    const fiche =
      a.to_database_id && a.to_case_id
        ? fiches.get(`${a.to_database_id}/${a.to_case_id}`)
        : undefined;
    // (b) similarité d'intitulé >= 0,5 sur l'ensemble des variantes connues (FR/EN)
    const titresCand = [a.to_title, ...(fiche ? collectCaseTitles(fiche) : [])].filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );
    let sim = 0;
    for (const td of titresDepart) {
      for (const tc of titresCand) {
        const s = titleSimilarity(td, tc);
        if (s > sim) sim = s;
      }
    }
    if (sim < SEUIL) continue;
    // (c) décision postérieure. La date n'est pas dans l'arête : on la lit en cache si
    // on l'a, sinon on retient le candidat sans dépenser un appel pour la dater.
    // ⚠ Invariant 3(a) : seule une ligne RÉSOLUE peut dater un candidat. Une ligne de
    //   balayage n'a pas de date, et une date fabriquée ferait passer un arrêt d'appel
    //   de la même année pour ANTÉRIEUR au jugement porté en appel — il serait alors
    //   écarté EN SILENCE de la sortie même qui existe pour le faire voir. Le sens de
    //   l'erreur compte : sans date, le candidat est RETENU (sur-inclusion), ce qui est
    //   la bonne direction pour un outil dont toute la sortie dit « indice, à vérifier ».
    const dateCandidat = fiche?.source === "lookup" ? (fiche.decision_date ?? null) : null;
    if (date && dateCandidat && dateCandidat <= date) continue;
    const titreCache = fiche ? titleForLang(fiche, lang) : null;
    candidats.push({
      arete: a,
      titreAffiche: titreCache ?? a.to_title,
      estLocalise: lang === "en" || titreCache !== null,
      similarite: sim,
      date: dateCandidat,
    });
  }

  candidats.sort((x, y) => (x.date ?? "9999").localeCompare(y.date ?? "9999"));
  const rendus = candidats.slice(0, limit);

  const depart = `Départ : ${titre ?? `${databaseId} / ${caseId}`}${date ? ` (${dateFr(date)})` : ""}`;

  if (rendus.length === 0) {
    return ok(
      [
        GARDE_SORTS_TETE,
        "",
        depart,
        "",
        `Aucun indice : parmi ${pluriel(aretes.length, "décision citante", "décisions citantes")}, aucune n'émane`,
        "d'une juridiction supérieure avec un intitulé suffisamment proche.",
        "",
        "Cela ne signifie PAS que la décision n'a pas été portée en appel : elle a pu",
        "l'être sans que l'arrêt figure dans la collection de CanLII, ou sous un",
        "intitulé différent, ou trop récemment pour avoir été diffusé.",
        "",
        GARDE_SORTS_PIED,
      ].join("\n"),
    );
  }

  const restentEnAnglais = lang === "fr" && rendus.some((c) => !c.estLocalise);
  const blocs = rendus.map((c) => {
    const lignes = [c.titreAffiche ?? "(intitulé absent)"];
    lignes.push(
      [c.arete.to_citation, c.date ? dateFr(c.date) : null, c.arete.to_database_id]
        .filter(Boolean)
        .join(" · "),
    );
    lignes.push(
      `Similarité d'intitulé : ${c.similarite.toFixed(2).replace(".", ",")} · juridiction supérieure`,
    );
    return lignes.join("\n");
  });

  const entete = [
    GARDE_SORTS_TETE,
    "",
    depart,
    "",
    `${pluriel(rendus.length, "indice", "indices")} — susceptibles de concerner le même litige, à vérifier :`,
  ].join("\n");

  const pied = restentEnAnglais
    ? [
        "Note de langue : l'API citateur de CanLII n'accepte que le point de terminaison « caseCitator/en » — les intitulés absents en français du cache local restent tels que retournés par l'API anglaise.",
        "",
        GARDE_SORTS_PIED,
      ].join("\n")
    : GARDE_SORTS_PIED;

  return ok(document(entete, blocs, pied));
}
