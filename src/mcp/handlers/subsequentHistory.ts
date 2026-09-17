/**
 * `jurisprudence_subsequent_history` (spécification §7.5, annexe A.3).
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

import { describeError } from "../../canlii/client";
import { titleSimilarity } from "../../citation/compare";
import { dateFr, pluriel } from "../../format/fr";
import { document, GARDE_SORTS_PIED, GARDE_SORTS_TETE } from "../../format/render";
import { getCachedCase } from "../../store/cases";
import {
  type EdgeRow,
  edgeStale,
  fetchEdges,
  getCachedEdges,
  replaceEdges,
} from "../../store/citator";
import { flushUsage, logSearch } from "../../store/telemetry";
import { LIMITES } from "../defauts";
import type { ToolContext } from "../registry";
import { err, ok, type ToolResult } from "../rpc";
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
  const bornes = LIMITES.subsequent_history;
  const limit = Math.min(Math.max((args.limit as number) ?? bornes.defaut, 1), bornes.max);
  const refresh = args.refresh === true;
  const now = ctx.now ?? new Date();

  const cible = await resoudreCible(args, ctx, now);
  if (!cible.ok) return err(cible.message);
  const { databaseId, caseId, titre, date } = cible;

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
    await logSearch(ctx.db, {
      tool: "jurisprudence_subsequent_history",
      query: `${databaseId}/${caseId}`,
      database_id: databaseId,
      result_count: 0,
      fallback: "api_error",
    });
    return err(describeError(e));
  } finally {
    await flushUsage(ctx.db, ctx.client.usage(), now);
  }

  const rangs = superieures(databaseId);
  const candidats: Array<{ arete: EdgeRow; similarite: number; date: string | null }> = [];

  for (const a of aretes) {
    // (a) juridiction de rang supérieur
    if (!a.to_database_id || !rangs.includes(a.to_database_id.toLowerCase())) continue;
    // (b) similarité d'intitulé >= 0,5
    const sim = titre && a.to_title ? titleSimilarity(titre, a.to_title) : 0;
    if (sim < SEUIL) continue;
    // (c) décision postérieure. La date n'est pas dans l'arête : on la lit en cache si
    // on l'a, sinon on retient le candidat sans dépenser un appel pour la dater.
    const fiche =
      a.to_database_id && a.to_case_id
        ? await getCachedCase(ctx.db, a.to_database_id, a.to_case_id)
        : null;
    // ⚠ Invariant 3(a) : seule une ligne RÉSOLUE peut dater un candidat. Une ligne de
    //   balayage n'a pas de date, et une date fabriquée ferait passer un arrêt d'appel
    //   de la même année pour ANTÉRIEUR au jugement porté en appel — il serait alors
    //   écarté EN SILENCE de la sortie même qui existe pour le faire voir. Le sens de
    //   l'erreur compte : sans date, le candidat est RETENU (sur-inclusion), ce qui est
    //   la bonne direction pour un outil dont toute la sortie dit « indice, à vérifier ».
    const dateCandidat = fiche?.source === "lookup" ? (fiche.decision_date ?? null) : null;
    if (date && dateCandidat && dateCandidat <= date) continue;
    candidats.push({ arete: a, similarite: sim, date: dateCandidat });
  }

  candidats.sort((x, y) => (x.date ?? "9999").localeCompare(y.date ?? "9999"));
  const rendus = candidats.slice(0, limit);

  await logSearch(ctx.db, {
    tool: "jurisprudence_subsequent_history",
    query: `${databaseId}/${caseId}`,
    database_id: databaseId,
    result_count: rendus.length,
    fallback: "heuristique",
  });

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

  const blocs = rendus.map((c) => {
    const lignes = [c.arete.to_title ?? "(intitulé absent)"];
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

  return ok(document(entete, blocs, GARDE_SORTS_PIED));
}
