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
      titre: cache?.title ?? null,
      date: cache?.decision_date ?? null,
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
