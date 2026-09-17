/**
 * Résolution de la décision de départ pour `jurisprudence_citator` et
 * `jurisprudence_subsequent_history` : soit une citation, soit database_id + case_id.
 *
 * Extrait ici parce que les deux outils en ont besoin à l'identique, et parce que
 * l'un des deux enchaîne sur l'autre.
 */

import type { Lang } from "../../canlii/types";
import { parseCitation, resolve } from "../../citation/parse";
import { EXPLICATION_INDETERMINEE } from "../../format/render";
import { getCachedCase } from "../../store/cases";
import { loadDirectory } from "../../store/databases";
import { lookupCase } from "../../store/lookup";
import type { ToolContext } from "../registry";

export type Cible =
  | { ok: true; databaseId: string; caseId: string; titre: string | null; date: string | null }
  | { ok: false; message: string };

export async function resoudreCible(
  args: Record<string, unknown>,
  ctx: ToolContext,
  now: Date,
  lang: Lang = "fr",
): Promise<Cible> {
  const citation = (args.citation as string | undefined)?.trim();
  const databaseId = (args.database_id as string | undefined)?.trim();
  const caseId = (args.case_id as string | undefined)?.trim();

  const parIds = Boolean(databaseId && caseId);
  if (parIds === Boolean(citation)) {
    return {
      ok: false,
      message:
        "Fournir EXACTEMENT l'une des deux formes : soit « citation », soit le couple " +
        "« database_id » + « case_id ».",
    };
  }

  if (parIds) {
    // L'intitulé n'est pas indispensable ici : s'il est en cache, on l'affiche ; sinon
    // on travaille sur les identifiants seuls plutôt que de dépenser un appel.
    const cache = await getCachedCase(ctx.db, databaseId!, caseId!);
    return {
      ok: true,
      databaseId: databaseId!,
      caseId: caseId!,
      // L'INTITULÉ d'une ligne de balayage est celui que CanLII rend dans SA liste :
      // vrai, et utile au seuil de similarité. On le garde, quelle que soit la
      // provenance — le refuser dégraderait le classement sans rien gagner en vérité.
      titre: cache?.title ?? null,
      // La DATE, non : invariant 3(a). Elle sert de borne de POSTÉRIORITÉ à
      // `subsequent_history`, et une ligne de balayage n'en a pas. `getCachedCase` ne
      // filtre pas sur `source`, là où `lookupCase` et `getCase` le font tous deux : la
      // garde est ici EXPLICITE plutôt que tacite. Elle ne change rien aujourd'hui — un
      // balayage porte NULL depuis le 2026-09-17 — et c'est précisément pour que ça ne
      // change pas demain qu'elle est écrite.
      date: cache?.source === "lookup" ? (cache.decision_date ?? null) : null,
    };
  }

  const dir = await loadDirectory(ctx.db);
  const parsed = parseCitation(citation!, (c) => dir.courtCodes.has(c));
  const res = resolve(parsed.primary, dir);

  if (parsed.primary.kind !== "neutral" && parsed.primary.kind !== "canlii") {
    return {
      ok: false,
      message: `${res.raison}\n→ Identifier d'abord la décision avec jurisprudence_find_case, puis rappeler cet outil avec database_id + case_id.`,
    };
  }

  const lookup = await lookupCase(parsed.primary, res, {
    db: ctx.db,
    client: ctx.client,
    dir,
    lang,
    now,
  });

  if (!lookup.row) {
    // Un ÉCHEC n'est pas une ABSENCE, et les deux sortaient d'ici sous la même phrase.
    // `lookup.message` valait `null` sur le statut « erreur » (voir src/store/lookup.ts),
    // donc le `??` servait TOUJOURS le texte d'absence : un 429 ou une expiration
    // ressortait en « Aucune fiche pour … » par jurisprudence_citator ET par
    // jurisprudence_subsequent_history. Deux outils affirmaient une inexistence que
    // personne n'avait constatée. Invariant 9 ; corrigé le 2026-09-16.
    if (lookup.status === "erreur" || lookup.status === "budget") {
      return {
        ok: false,
        message: `${lookup.message ?? "CanLII n'a pas pu être interrogé."}
${EXPLICATION_INDETERMINEE}`,
      };
    }
    return {
      ok: false,
      message:
        lookup.message ??
        `Aucune fiche pour « ${citation} » (${res.databaseId} / ${res.caseId}). ` +
          "Une absence n'établit pas l'inexistence : vérifier la citation avec jurisprudence_verify_citations.",
    };
  }

  return {
    ok: true,
    databaseId: lookup.row.database_id,
    caseId: lookup.row.case_id,
    titre: lookup.row.title,
    date: lookup.row.decision_date,
  };
}
