import type { Lang } from "../../canlii/types";
import { parseCitation, resolve } from "../../citation/parse";
import { EXPLICATION_INDETERMINEE } from "../../format/render";
import { collectCaseTitles, getCachedCase, projectCaseForLang } from "../../store/cases";
import { loadDirectory } from "../../store/databases";
import { lookupCase } from "../../store/lookup";
import type { ToolContext } from "../registry";

type Cible =
  | {
      ok: true;
      databaseId: string;
      caseId: string;
      titre: string | null;
      titres: string[];
      date: string | null;
    }
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

  const anyId = Boolean(databaseId || caseId);
  const bothIds = Boolean(databaseId && caseId);
  const parCitation = Boolean(citation);
  if ((parCitation && anyId) || (!parCitation && !bothIds)) {
    return {
      ok: false,
      message:
        "Fournir EXACTEMENT l'une des deux formes : soit « citation », soit le couple " +
        "« database_id » + « case_id ».",
    };
  }

  const parIds = bothIds;

  if (parIds) {
    const cache = await getCachedCase(ctx.db, databaseId!, caseId!);
    const projetee = cache ? projectCaseForLang(cache, lang) : null;
    return {
      ok: true,
      databaseId: databaseId!,
      caseId: caseId!,
      titre: projetee?.title ?? null,
      titres: cache ? collectCaseTitles(cache) : [],
      date: cache?.source === "lookup" ? (cache.decision_date ?? null) : null,
    };
  }

  const dir = await loadDirectory(ctx.db);
  const parsed = parseCitation(citation!, (c) => dir.courtCodes.has(c));
  const res = resolve(parsed.primary, dir);

  if (parsed.primary.kind !== "neutral" && parsed.primary.kind !== "canlii") {
    return {
      ok: false,
      message: `${res.raison}\n→ Identifier d'abord la décision avec find_case, puis rappeler cet outil avec database_id + case_id.`,
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
          "Une absence n'établit pas l'inexistence : vérifier la citation avec verify_citations.",
    };
  }

  return {
    ok: true,
    databaseId: lookup.row.database_id,
    caseId: lookup.row.case_id,
    titre: lookup.row.title,
    titres: collectCaseTitles(lookup.row),
    date: lookup.row.decision_date,
  };
}
