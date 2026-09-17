/**
 * `jurisprudence_get_case` (spécification §7.3).
 *
 * Accepte SOIT une citation, SOIT le couple database_id + case_id — exactement l'une
 * des deux formes, ce que le validateur de schéma ne sait pas exprimer et qui est donc
 * contrôlé ici.
 */

import { analyserErreur } from "../../canlii/client";
import type { CaseMetadata, Lang } from "../../canlii/types";
import { parseCitation, resolve } from "../../citation/parse";
import {
  EXPLICATION_INDETERMINEE,
  EXPLICATIONS_INTROUVABLE,
  ficheDecision,
  GARDE_VERIFICATION,
} from "../../format/render";
import { getCachedCase, rowFromMetadata, upsertCase } from "../../store/cases";
import { loadDirectory } from "../../store/databases";
import { lookupCase } from "../../store/lookup";
import { flushUsage, logSearch } from "../../store/telemetry";
import type { ToolContext } from "../registry";
import { err, ok, type ToolResult } from "../rpc";

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

  const parIds = Boolean(databaseId && caseId);
  const parCitation = Boolean(citation);
  if (parIds === parCitation) {
    return err(
      "Fournir EXACTEMENT l'une des deux formes : soit « citation », soit le couple " +
        "« database_id » + « case_id ».",
    );
  }

  // ── Forme directe : database_id + case_id ────────────────────────────────
  if (parIds) {
    if (!refresh) {
      const cache = await getCachedCase(ctx.db, databaseId!, caseId!);
      // Même barrière que dans lookupCase (src/store/lookup.ts) : une ligne de
      // balayage (4 champs — ni date, ni numéro de dossier, ni hyperlien) ne peut
      // pas tenir lieu de fiche. La servir rendrait un document amputé étiqueté
      // « index local », alors que l'outil promet la fiche complète. Elle force
      // donc l'appel, dont la fiche pleine prend la place (source « lookup »,
      // qu'un balayage ultérieur ne rétrograde pas — voir l'UPSERT).
      if (cache && cache.source === "lookup") {
        await logSearch(ctx.db, {
          tool: "jurisprudence_get_case",
          query: `${databaseId}/${caseId}`,
          database_id: databaseId,
          lang,
          result_count: 1,
        });
        return ok(rendre(cache, "index local"));
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
      );
      await upsertCase(ctx.db, row);
      await logSearch(ctx.db, {
        tool: "jurisprudence_get_case",
        query: `${databaseId}/${caseId}`,
        database_id: databaseId,
        lang,
        result_count: 1,
      });
      return ok(rendre(row, "CanLII"));
    } catch (e) {
      // SEUL un 404 constate une absence. Ce `catch` attrapait aussi les 401, 429,
      // 5xx, expirations et budgets épuisés, et leur collait EXPLICATIONS_INTROUVABLE
      // — « numéro erroné · décision hors de la collection · diffusion récente ».
      // Sur un étranglement, le lecteur en concluait que la décision n'existe
      // probablement pas, alors que CanLII n'avait pas répondu. Invariant 9 ;
      // corrigé le 2026-09-16. La branche par citation, elle, faisait déjà le partage.
      const d = analyserErreur(e);
      const absence = d.cause === "INTROUVABLE_404";
      await logSearch(ctx.db, {
        tool: "jurisprudence_get_case",
        query: `${databaseId}/${caseId}`,
        database_id: databaseId,
        lang,
        result_count: 0,
        // `api_error` était écrit AUSSI sur un 404 : un dépouillement de §10 comptait
        // une absence réellement constatée comme une panne, et réciproquement. Le
        // vocabulaire s'aligne ici sur celui de src/store/lookup.ts.
        fallback: absence ? "not_found" : d.cause === "BUDGET_EPUISE" ? "budget" : "api_error",
      });
      return err(
        absence
          ? `${d.phrase}\n\n${EXPLICATIONS_INTROUVABLE}`
          : `${d.phrase}\n${EXPLICATION_INDETERMINEE}`,
      );
    } finally {
      await flushUsage(ctx.db, ctx.client.usage(), now);
    }
  }

  // ── Forme par citation ───────────────────────────────────────────────────
  const dir = await loadDirectory(ctx.db);
  const parsed = parseCitation(citation!, (c) => dir.courtCodes.has(c));
  const res = resolve(parsed.primary, dir);

  if (parsed.primary.kind !== "neutral" && parsed.primary.kind !== "canlii") {
    await logSearch(ctx.db, {
      tool: "jurisprudence_get_case",
      query: citation!,
      lang,
      result_count: 0,
      fallback: parsed.primary.kind,
    });
    return err(
      `${res.raison}\n→ Fournir les noms des parties et l'année à jurisprudence_find_case, ou employer jurisprudence_parse_citation pour le détail de l'analyse.`,
    );
  }

  try {
    const lookup = await lookupCase(parsed.primary, res, {
      db: ctx.db,
      client: ctx.client,
      dir,
      lang,
      refresh,
      now,
    });
    await logSearch(ctx.db, {
      tool: "jurisprudence_get_case",
      query: citation!,
      database_id: res.databaseId,
      lang,
      result_count: lookup.row ? 1 : 0,
      fallback: lookup.fallback,
    });
    if (lookup.row)
      return ok(rendre(lookup.row, lookup.provenance === "cache" ? "index local" : "CanLII"));
    // « budget » rejoint « erreur » : un budget d'appels épuisé avant d'avoir pu
    // interroger CanLII ne constate rien non plus, et tombait jusqu'ici dans la
    // branche INTROUVABLE ci-dessous, avec ses explications d'absence.
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
  } finally {
    await flushUsage(ctx.db, ctx.client.usage(), now);
  }
}

function rendre(row: Parameters<typeof ficheDecision>[0], provenance: string): string {
  return [
    ficheDecision(row, { avecIds: true }),
    "",
    `Provenance : ${provenance}.`,
    "Le TEXTE de la décision n'est pas exposé par l'API de CanLII : suivre l'hyperlien.",
    "",
    GARDE_VERIFICATION,
  ].join("\n");
}
