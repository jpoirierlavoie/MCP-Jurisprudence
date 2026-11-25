/**
 * `check_exempt_authority` — Vérification d'un lot de citations contre la ou les
 * listes d'autorités dispensées d'un tribunal (ou d'une liste précise).
 *
 * Contrat à 5 verdicts :
 *   DISPENSÉE · À VÉRIFIER · NON LISTÉE · ILLISIBLE · INDÉTERMINÉE
 */

import { err, ok, type ToolResult } from "@poirierlavoie/mcp-socle";
import {
  type CheckCitationInput,
  type CheckCitationOutcome,
  canliiBestLink,
  canliiCitationForLang,
  canliiKeywordsForLang,
  canliiTitleForLang,
  checkExemptCitation,
  type ExemptMatchItem,
  formatTargetProceduralRules,
  resolveTargetLists,
} from "../../authorities/match";
import { TRIBUNAUX } from "../../authorities/normalize";
import type { Lang } from "../../canlii/types";
import { EXEMPT_DECISIONS } from "../../data/exemptAuthorities";
import { nombreFr } from "../../format/fr";
import {
  document,
  EXPLICATION_INDETERMINEE,
  GARDE_AUTORITES_DISPENSEES,
  noteEtranglement,
} from "../../format/render";
import { loadDirectory } from "../../store/databases";
import type { ToolContext } from "../registry";

const MAX_CITATIONS = 50;

/** Retire caractères de contrôle / retours à la ligne dans la citation reflétée. */
function citationAssainie(brut: string): string {
  const espaces = brut.replace(/[\r\n\t]+/g, " ");
  let out = "";
  for (let i = 0; i < espaces.length; i++) {
    const code = espaces.charCodeAt(i);
    if (code >= 0x20 && code !== 0x7f) out += espaces[i]!;
  }
  return out.trim().slice(0, 200);
}

function formaterOccurrenceMatch(m: ExemptMatchItem, lang: Lang): string {
  const pos = m.entry.tabNumber !== null ? `onglet ${m.entry.tabNumber}` : `#${m.entry.position}`;
  const sub = m.entry.subdivision ? `, ${m.entry.subdivision}` : "";
  const urlSrc =
    m.entry.sourceUrls.length > 0
      ? ` — Lien de la liste source (non vérifié) : ${m.entry.sourceUrls.join(" · ")}`
      : "";
  const titreListe = lang === "en" ? m.list.titleEn : m.list.titleFr;
  return `${m.list.listId} (${titreListe}, ${pos}${sub})${urlSrc}`;
}

function formaterResultat(outcome: CheckCitationOutcome, lang: Lang): string {
  const enTete = `${citationAssainie(outcome.input.citation) || "(vide)"} — ${outcome.verdict}`;

  if (outcome.verdict === "ILLISIBLE") {
    return [
      enTete,
      "Aucune citation neutre, CanLII, de recueil, d'éditeur, ni intitulé ou dossier exploitable reconnu.",
    ].join("\n");
  }

  if (outcome.verdict === "INDÉTERMINÉE") {
    return [
      enTete,
      EXPLICATION_INDETERMINEE,
      outcome.indetermineeReason ? `Cause : ${outcome.indetermineeReason}` : null,
    ]
      .filter((x): x is string => Boolean(x))
      .join("\n");
  }

  if (outcome.verdict === "NON LISTÉE") {
    const lignes = [enTete];
    if (outcome.note) lignes.push(outcome.note);
    if (outcome.resolvedRow) {
      const r = outcome.resolvedRow;
      lignes.push(
        `Décision identifiée sur CanLII (hors de la liste ciblée) : ${r.title}${r.citation ? ` · ${r.citation}` : ""}${r.url ? ` · ${r.url}` : ""}`,
      );
    }
    return lignes.join("\n");
  }

  // DISPENSÉE ou À VÉRIFIER
  const lignes = [enTete];
  if (outcome.erroneous) {
    const e = outcome.erroneous;
    lignes.push(
      `⚠ Coquille connue de la liste source (${e.list.listId}) : la source imprime « ${e.erroneousCite} », mais l'entrée visée correspond à « ${e.entry.cleanText} ».`,
    );
    if (e.entry.transcriptionNote) lignes.push(`Note source : ${e.entry.transcriptionNote}`);
  }
  if (outcome.titleMismatch) lignes.push(`⚠ ${outcome.titleMismatch}`);
  if (outcome.yearMismatch) lignes.push(`⚠ ${outcome.yearMismatch}`);
  if (outcome.note) lignes.push(outcome.note);
  if (outcome.resolvedViaCanlii) {
    lignes.push("Résolution CanLII préalable appliquée avant appariement sur la liste.");
  }

  if (outcome.matches.length > 0) {
    const first = outcome.matches[0]!;
    const dec = first.decision;

    if (first.viaAffirming) {
      const primDec = EXEMPT_DECISIONS[first.entry.decisionKey];
      const primLabel = primDec
        ? (canliiTitleForLang(primDec, lang) ?? first.entry.cleanText)
        : first.entry.cleanText;
      lignes.push(
        `Appariement via la décision confirmante (« conf. par » / « aff'd ») rattachée à : ${primLabel}`,
      );
    }

    if (dec.status === "canlii") {
      const tCan = canliiTitleForLang(dec, lang);
      const cCan = canliiCitationForLang(dec, lang);
      const lCan = canliiBestLink(dec, lang);
      const kwCan = canliiKeywordsForLang(dec, lang);
      const meta = [tCan, cCan, dec.decision_date, dec.docket_number].filter(Boolean);
      if (meta.length > 0) lignes.push(`Fiche CanLII : ${meta.join(" · ")}`);
      if (kwCan) lignes.push(`Mots-clés (index CanLII, non vérifiés) : ${kwCan}`);
      if (lCan) lignes.push(`Hyperlien CanLII : ${lCan}`);
    } else {
      lignes.push(`Référence compilée : ${first.entry.cleanText}`);
    }

    const vues = new Set<string>();
    for (const m of outcome.matches) {
      const line = formaterOccurrenceMatch(m, lang);
      if (!vues.has(line)) {
        vues.add(line);
        lignes.push(`Liste : ${line}`);
      }
    }
    if (first.entry.transcriptionNote && !outcome.erroneous) {
      lignes.push(`Note source : ${first.entry.transcriptionNote}`);
    }
    if (first.list.consigneCitation) {
      lignes.push(`Conditions de la liste (${first.list.listId}) : ${first.list.consigneCitation}`);
    }
  }

  return lignes.join("\n");
}

export async function checkExemptAuthorities(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const listId = typeof args.list_id === "string" ? args.list_id.trim() : "";
  const tribunal = typeof args.tribunal === "string" ? args.tribunal.trim() : "";

  if (Boolean(listId) === Boolean(tribunal)) {
    return err(
      "Fournir EXACTEMENT l'un des deux paramètres de portée : soit « list_id », soit « tribunal » (jamais les deux ensemble ni aucun).",
    );
  }

  const cible = resolveTargetLists({ list_id: listId, tribunal });
  if (!cible.ok) return err(cible.error);

  const items = (args.citations as CheckCitationInput[] | undefined) ?? [];
  if (items.length === 0) {
    return err("« citations » doit contenir au moins une référence.");
  }
  if (items.length > MAX_CITATIONS) {
    return err(`Au plus ${MAX_CITATIONS} citations par appel (reçu : ${items.length}).`);
  }

  const lang = (args.lang as Lang) ?? "fr";
  const resolveCanlii = args.resolve_canlii !== false;
  const now = ctx.now ?? new Date();
  const dir = await loadDirectory(ctx.db);

  const outcomes: CheckCitationOutcome[] = [];
  for (const item of items) {
    outcomes.push(
      await checkExemptCitation(item, cible.lists, {
        resolveCanlii,
        lang,
        ctx,
        dir,
        now,
      }),
    );
  }

  const aIndeterminee = outcomes.some((o) => o.verdict === "INDÉTERMINÉE");
  const tribMeta = cible.tribNorm ? TRIBUNAUX[cible.tribNorm] : null;
  const porteeLabel = listId
    ? `${listId} (${lang === "en" ? cible.lists[0]!.tribunalNomEn : cible.lists[0]!.tribunalNomFr})`
    : `${tribMeta ? (lang === "en" ? tribMeta.nomEn : tribMeta.nomFr) : tribunal} [${cible.lists.map((l) => l.listId).join(", ")}]`;

  const baseEntete = aIndeterminee
    ? `Vérification INTERROMPUE sur ${porteeLabel} — ${nombreFr(outcomes.length)} citation(s), au moins une INDÉTERMINÉE (ne vaut JAMAIS absence) :`
    : `Contrôle d'autorités dispensées (${porteeLabel}) — ${nombreFr(outcomes.length)} référence(s) :`;
  const entete = [baseEntete, ...formatTargetProceduralRules(cible.lists)].join("\n");

  const corps = outcomes.map((o) => formaterResultat(o, lang));
  const piedParts: Array<string | null> = [
    aIndeterminee ? EXPLICATION_INDETERMINEE : null,
    noteEtranglement(ctx.client.usage().throttled, !aIndeterminee) || null,
    GARDE_AUTORITES_DISPENSEES,
  ];
  const pied = piedParts.filter((s): s is string => Boolean(s)).join("\n\n");

  return ok(document(entete, corps, pied));
}
