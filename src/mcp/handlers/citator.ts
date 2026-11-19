/**
 * `citator` (spécification §7.4).
 *
 * ⚠ CONTRAINTE DE L'API CODÉE EN DUR : le chemin du citateur de CanLII n'accepte
 *   QUE `en` comme segment de langue (`caseCitator/en/…`, annexe B).
 *   Lorsqu'une langue d'affichage (`fr` par défaut, ou `en`) est demandée, on
 *   projette la décision de départ et on substitue les intitulés `title_fr` /
 *   `title_en` déjà présents dans le cache local `cases`. Lorsque `lang = "fr"` et
 *   que des intitulés restent ceux retournés par `caseCitator/en`, une mention
 *   explicite l'indique en pied de sortie (D22).
 */

import { err, ok, type ToolResult } from "@poirierlavoie/mcp-socle";
import { describeError } from "../../canlii/client";
import { relancerSiInterruptionGouverne } from "../../canlii/errors";
import type { CitatorRel, Lang } from "../../canlii/types";
import { nombreFr, pluriel, troncature } from "../../format/fr";
import { document, GARDE_CITATEUR } from "../../format/render";
import { getCachedBatch, titleForLang } from "../../store/cases";
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
  const lang: Lang = args.lang === "en" ? "en" : "fr";
  const bornes = LIMITES.citator;
  const limit = Math.min(Math.max((args.limit as number) ?? bornes.defaut, 1), bornes.max);
  const offset = Math.max((args.offset as number) ?? 0, 0);
  const refresh = args.refresh === true;
  const now = ctx.now ?? new Date();

  const cible = await resoudreCible(args, ctx, now, lang);
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
    relancerSiInterruptionGouverne(e);
    return err(describeError(e));
  }

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

  const couples =
    rel === "legislation"
      ? []
      : page
          .filter((e): e is EdgeRow & { to_database_id: string; to_case_id: string } =>
            Boolean(e.to_database_id && e.to_case_id),
          )
          .map((e) => [e.to_database_id, e.to_case_id] as const);
  const caches = couples.length > 0 ? await getCachedBatch(ctx.db, couples) : new Map();

  let restentNonLocalises = false;
  const blocs = page.map((e) => {
    if (rel === "legislation") {
      restentNonLocalises = true;
      return rendreArete(e, rel, e.to_title);
    }
    const cache =
      e.to_database_id && e.to_case_id
        ? caches.get(`${e.to_database_id}/${e.to_case_id}`)
        : undefined;
    const titreCache = cache ? titleForLang(cache, lang) : null;
    if (lang === "fr" && !titreCache) {
      restentNonLocalises = true;
    }
    return rendreArete(e, rel, titreCache ?? e.to_title);
  });

  const noteLangue =
    lang === "fr" && restentNonLocalises
      ? "Note de langue : l'API citateur de CanLII n'accepte que le point de terminaison « caseCitator/en » — les intitulés absents en français du cache local restent tels que retournés par l'API anglaise."
      : null;

  const tronque = troncature(offset + page.length, aretes.length);
  const entete = `${LIBELLE[rel]} — ${pluriel(aretes.length, "référence", "références")}.\n${depart}`;
  const pied = [
    `Provenance : ${provenance}.`,
    tronque ? `Troncature : ${tronque} (rappeler avec offset=${nombreFr(offset + limit)}).` : null,
    rel === "citing"
      ? "Liste rafraîchie au plus tous les 30 jours : elle croît indéfiniment."
      : "Ce qu'une décision cite est figé au jour de son prononcé : cette liste ne change plus.",
    noteLangue,
    "",
    GARDE_CITATEUR,
  ]
    .filter((s): s is string => s !== null)
    .join("\n");

  return ok(document(entete, blocs, pied));
}

function rendreArete(e: EdgeRow, rel: CitatorRel, titreAffiche: string | null): string {
  const lignes = [titreAffiche ?? "(intitulé absent)"];
  const ids =
    rel === "legislation"
      ? [e.to_database_id, e.to_legislation_id].filter(Boolean).join(" / ")
      : [e.to_database_id, e.to_case_id].filter(Boolean).join(" / ");
  lignes.push([e.to_citation, ids].filter(Boolean).join(" · "));
  return lignes.join("\n");
}
