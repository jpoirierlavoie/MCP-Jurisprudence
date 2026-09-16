/**
 * `jurisprudence_list_databases` (spécification §7.7).
 *
 * Sert le répertoire local si `refreshed_at` a moins de 7 jours ; sinon rafraîchit
 * (deux appels : `caseBrowse/{lang}/` et `legislationBrowse/{lang}/`).
 *
 * C'est aussi ici que se fait la RÉCONCILIATION exigée par §4.3 : toute ligne de
 * `court_codes` ou `paren_codes` dont le databaseId est absent du répertoire réel est
 * SIGNALÉE dans la sortie. L'outil détecte, il ne corrige jamais de lui-même.
 */

import { describeError } from "../../canlii/client";
import type { Lang } from "../../canlii/types";
import { nombreFr } from "../../format/fr";
import { MARQUEUR_RECONCILIATION } from "../../format/render";
import {
  directoryMismatches,
  directoryStale,
  listDatabases,
  refreshDatabases,
} from "../../store/databases";
import { flushUsage, logSearch } from "../../store/telemetry";
import type { ToolContext } from "../registry";
import { ok, type ToolResult } from "../rpc";

export async function listDatabasesTool(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const lang = (args.lang as Lang) ?? "fr";
  const refresh = args.refresh === true;
  const kind = args.kind as string | undefined;
  const jurisdiction = args.jurisdiction as string | undefined;
  const query = args.query as string | undefined;

  let noteRafraichissement: string | null = null;
  if (refresh || (await directoryStale(ctx.db, ctx.now))) {
    try {
      const r = await refreshDatabases(ctx.db, ctx.client, lang, ctx.now);
      noteRafraichissement = `Répertoire rafraîchi depuis CanLII : ${nombreFr(r.cases)} base(s) de jurisprudence, ${nombreFr(r.legislation)} base(s) législative(s).`;
    } catch (e) {
      noteRafraichissement = `Rafraîchissement impossible — ${describeError(e)} Le répertoire local est servi tel quel.`;
    } finally {
      await flushUsage(ctx.db, ctx.client.usage(), ctx.now);
    }
  }

  const bases = await listDatabases(ctx.db, { kind, jurisdiction, query });
  await logSearch(ctx.db, {
    tool: "jurisprudence_list_databases",
    query: [kind, jurisdiction, query].filter(Boolean).join(" ") || "(sans filtre)",
    lang,
    result_count: bases.length,
  });

  if (bases.length === 0) {
    const filtres = [
      kind ? `kind=${kind}` : null,
      jurisdiction ? `jurisdiction=${jurisdiction}` : null,
      query ? `query=${query}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const tete = filtres
      ? `Aucune base pour ${filtres}.`
      : "Le répertoire local est vide. Rappeler cet outil avec refresh: true.";
    return ok([noteRafraichissement, tete].filter(Boolean).join("\n\n"));
  }

  const parKind = new Map<string, typeof bases>();
  for (const b of bases) {
    const l = parKind.get(b.kind) ?? [];
    l.push(b);
    parKind.set(b.kind, l);
  }

  const blocs: string[] = [];
  for (const [k, liste] of parKind) {
    const titre = k === "case" ? "Cours et tribunaux" : "Corpus législatifs";
    const lignes = liste.map((b) => {
      const nom = b.name_fr ?? b.name_en ?? "—";
      const type = b.type ? ` [${b.type}]` : "";
      return `  · ${b.id} — ${nom} (${b.jurisdiction})${type}`;
    });
    blocs.push(`${titre} (${nombreFr(liste.length)}) :\n${lignes.join("\n")}`);
  }

  // §4.3 — signalement des hypothèses d'amorçage démenties par le répertoire réel.
  const { courts, parens } = await directoryMismatches(ctx.db);
  let alerte: string | null = null;
  if (courts.length > 0 || parens.length > 0) {
    const details = [
      ...courts.map((c) => `  · ${c.code} -> ${c.database_id} (${c.note ?? "hypothèse"})`),
      ...parens.map((p) => `  · (${p.juris_code} ${p.court_code}) -> ${p.database_id}`),
    ];
    // Le marqueur vient de la CONSTANTE, jamais recopié : `scripts/refresh-databases.mjs`
    // découpe la sortie dessus pour décider si le répertoire est livrable. Une copie
    // littérale qui dériverait rendrait le script muet sur la seule barrière bloquante
    // de §4.3 — il annoncerait « aucune correspondance démentie » alors qu'il y en a.
    alerte =
      `${MARQUEUR_RECONCILIATION} (§4.3) — ces correspondances d'amorçage désignent un\n` +
      "databaseId ABSENT du répertoire réel de CanLII. Toute citation qui en dépend\n" +
      "sera rendue INTROUVABLE sans appel, avec renvoi à cet outil :\n" +
      details.join("\n");
  }

  const entete = `${nombreFr(bases.length)} base(s) au répertoire de CanLII :`;
  return ok(
    [noteRafraichissement, entete, blocs.join("\n\n"), alerte]
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .join("\n\n"),
  );
}
