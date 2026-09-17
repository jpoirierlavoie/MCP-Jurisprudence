/**
 * `jurisprudence_citator` (spécification §7.4).
 *
 * ⚠ CONTRAINTE DE L'API CODÉE EN DUR : le chemin du citateur n'accepte QUE `en` comme
 *   segment de langue (annexe B). On construit `caseCitator/en/…` quelle que soit la
 *   langue et l'on rend malgré tout la sortie en français. C'est pourquoi cet outil
 *   n'expose AUCUN paramètre `lang` : en exposer un serait mensonger.
 */

import { describeError } from "../../canlii/client";
import type { CitatorRel } from "../../canlii/types";
import { nombreFr, pluriel, troncature } from "../../format/fr";
import { document, GARDE_CITATEUR } from "../../format/render";
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

const LIBELLE: Record<CitatorRel, string> = {
  cited: "Décisions CITÉES PAR la décision de départ",
  citing: "Décisions QUI CITENT la décision de départ",
  legislation: "Dispositions législatives CITÉES PAR la décision de départ",
};

export async function citator(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const rel = args.rel as CitatorRel;
  const bornes = LIMITES.citator;
  const limit = Math.min(Math.max((args.limit as number) ?? bornes.defaut, 1), bornes.max);
  const offset = Math.max((args.offset as number) ?? 0, 0);
  const refresh = args.refresh === true;
  const now = ctx.now ?? new Date();

  const cible = await resoudreCible(args, ctx, now);
  if (!cible.ok) return err(cible.message);
  const { databaseId, caseId, titre } = cible;

  let aretes: EdgeRow[] = [];
  let provenance = "index local";
  try {
    const cache = refresh ? null : await getCachedEdges(ctx.db, databaseId, caseId, rel);
    if (cache && !edgeStale(rel, cache.fetchedAt, now)) {
      aretes = cache.edges;
    } else {
      aretes = await fetchEdges(ctx.client, databaseId, caseId, rel, now);
      await replaceEdges(ctx.db, databaseId, caseId, rel, aretes, now);
      provenance = "CanLII";
    }
  } catch (e) {
    await logSearch(ctx.db, {
      tool: "jurisprudence_citator",
      query: `${databaseId}/${caseId} ${rel}`,
      database_id: databaseId,
      result_count: 0,
      fallback: "api_error",
    });
    return err(describeError(e));
  } finally {
    await flushUsage(ctx.db, ctx.client.usage(), now);
  }

  await logSearch(ctx.db, {
    tool: "jurisprudence_citator",
    query: `${databaseId}/${caseId} ${rel}`,
    database_id: databaseId,
    result_count: aretes.length,
  });

  const page = aretes.slice(offset, offset + limit);
  const depart = `Départ : ${titre ?? `${databaseId} / ${caseId}`}`;

  if (aretes.length === 0) {
    return ok(
      [
        `${LIBELLE[rel]} — aucune.`,
        depart,
        "",
        rel === "citing"
          ? "Aucune décision de la collection de CanLII ne cite celle-ci. Cela n'établit pas\nqu'aucune ne la cite : la couverture a des bornes et la diffusion connaît un délai."
          : "La fiche de CanLII ne rattache aucune référence de ce type à cette décision.",
        "",
        GARDE_CITATEUR,
      ].join("\n"),
    );
  }

  const blocs = page.map((e) => rendreArete(e, rel));
  const tronque = troncature(offset + page.length, aretes.length);
  const entete = `${LIBELLE[rel]} — ${pluriel(aretes.length, "référence", "références")}.\n${depart}`;
  const pied = [
    `Provenance : ${provenance}.`,
    tronque ? `Troncature : ${tronque} (rappeler avec offset=${nombreFr(offset + limit)}).` : null,
    rel === "citing"
      ? "Liste rafraîchie au plus tous les 30 jours : elle croît indéfiniment."
      : "Ce qu'une décision cite est figé au jour de son prononcé : cette liste ne change plus.",
    "",
    GARDE_CITATEUR,
  ]
    .filter((s): s is string => s !== null)
    .join("\n");

  return ok(document(entete, blocs, pied));
}

function rendreArete(e: EdgeRow, rel: CitatorRel): string {
  const lignes = [e.to_title ?? "(intitulé absent)"];
  const ids =
    rel === "legislation"
      ? [e.to_database_id, e.to_legislation_id].filter(Boolean).join(" / ")
      : [e.to_database_id, e.to_case_id].filter(Boolean).join(" / ");
  lignes.push([e.to_citation, ids].filter(Boolean).join(" · "));
  return lignes.join("\n");
}
