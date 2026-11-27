import { err, ok, type ToolResult } from "@poirierlavoie/mcp-socle";
import { analyserErreur } from "../../canlii/client";
import { relancerSiInterruptionGouverne } from "../../canlii/errors";
import type { CaseMetadata, Lang } from "../../canlii/types";
import { parseCitation, resolve } from "../../citation/parse";
import {
  EXPLICATION_INDETERMINEE,
  EXPLICATIONS_INTROUVABLE,
  ficheDecision,
  GARDE_VERIFICATION,
  TEXTE_NON_EXPOSE,
} from "../../format/render";
import {
  getCachedCase,
  hasLangCached,
  projectCaseForLang,
  rowFromMetadata,
  upsertCase,
} from "../../store/cases";
import { loadDirectory } from "../../store/databases";
import { lookupCase } from "../../store/lookup";
import type { ToolContext } from "../registry";

export async function getCase(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const citation = (args.citation as string | undefined)?.trim();
  const databaseId = (args.database_id as string | undefined)?.trim();
  const caseId = (args.case_id as string | undefined)?.trim();
  const lang = (args.lang as Lang) ?? "fr";
  const refresh = args.refresh === true;
  const now = ctx.now ?? new Date();

  const anyId = Boolean(databaseId || caseId);
  const bothIds = Boolean(databaseId && caseId);
  const parCitation = Boolean(citation);
  if ((parCitation && anyId) || (!parCitation && !bothIds)) {
    return err(
      "Fournir EXACTEMENT l'une des deux formes : soit « citation », soit le couple " +
        "« database_id » + « case_id ».",
    );
  }

  const parIds = bothIds;

  if (parIds) {
    if (!refresh) {
      const cache = await getCachedCase(ctx.db, databaseId!, caseId!);
      if (cache && cache.source === "lookup" && hasLangCached(cache, lang)) {
        return ok(rendre(projectCaseForLang(cache, lang), "index local"));
      }
    }
    try {
      const meta = await ctx.client.get<CaseMetadata>(
        `caseBrowse/${lang}/${databaseId}/${caseId}/`,
      );
      const row = rowFromMetadata(
        meta,
        { databaseId: databaseId!, caseId: caseId! },
        "lookup",
        now,
        lang,
      );
      await upsertCase(ctx.db, row);
      const stored = (await getCachedCase(ctx.db, databaseId!, caseId!)) ?? row;
      return ok(rendre(projectCaseForLang(stored, lang), "CanLII"));
    } catch (e) {
      relancerSiInterruptionGouverne(e);
      const d = analyserErreur(e);
      const absence = d.cause === "INTROUVABLE_404";
      return err(
        absence
          ? `${d.phrase}\n\n${EXPLICATIONS_INTROUVABLE}`
          : `${d.phrase}\n${EXPLICATION_INDETERMINEE}`,
      );
    }
  }

  const dir = await loadDirectory(ctx.db);
  const parsed = parseCitation(citation!, (c) => dir.courtCodes.has(c));
  const res = resolve(parsed.primary, dir);

  if (parsed.primary.kind !== "neutral" && parsed.primary.kind !== "canlii") {
    return err(
      `${res.raison}\n→ Fournir les noms des parties et l'année à find_case, ou employer parse_citation pour le détail de l'analyse.`,
    );
  }

  const lookup = await lookupCase(parsed.primary, res, {
    db: ctx.db,
    client: ctx.client,
    dir,
    lang,
    refresh,
    now,
  });
  if (lookup.row)
    return ok(rendre(lookup.row, lookup.provenance === "cache" ? "index local" : "CanLII"));
  if (lookup.status === "erreur" || lookup.status === "budget") {
    return err(
      `${lookup.message ?? "CanLII n'a pas pu être interrogé."}\n${EXPLICATION_INDETERMINEE}`,
    );
  }
  return err(
    [
      lookup.message ?? `Aucune fiche pour « ${citation} » (${res.databaseId} / ${res.caseId}).`,
      EXPLICATIONS_INTROUVABLE,
    ].join("\n"),
  );
}

function rendre(row: Parameters<typeof ficheDecision>[0], provenance: string): string {
  return [
    ficheDecision(row, { avecIds: true }),
    "",
    `Provenance : ${provenance}.`,
    TEXTE_NON_EXPOSE,
    "",
    GARDE_VERIFICATION,
  ].join("\n");
}
