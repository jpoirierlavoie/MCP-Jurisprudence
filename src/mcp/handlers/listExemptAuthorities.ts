/**
 * `list_exempt_cases` — Consultation et recherche hors ligne dans les 27 listes
 * d'autorités dispensées de reproduction (9 tribunaux canadiens et québécois).
 *
 * Aucun appel à l'API de CanLII n'est émis : les métadonnées CanLII et mots-clés
 * éventuels ont été compilés à l'avance dans le dépôt.
 */

import { err, ok, type ToolResult } from "@poirierlavoie/mcp-socle";
import {
  canliiBestLink,
  canliiCitationForLang,
  canliiKeywordsForLang,
  canliiTitleForLang,
  formatTargetProceduralRules,
  resolveTargetLists,
} from "../../authorities/match";
import { TRIBUNAUX } from "../../authorities/normalize";
import type { Lang } from "../../canlii/types";
import { fold } from "../../citation/normalize";
import {
  EXEMPT_AUTHORITY_LISTS,
  EXEMPT_AUTHORITY_STATS,
  EXEMPT_DECISIONS,
  type ExemptAuthorityEntry,
  type ExemptAuthorityList,
  type ExemptDecisionRecord,
} from "../../data/exemptAuthorities";
import { nombreFr, troncature } from "../../format/fr";
import { document, GARDE_AUTORITES_DISPENSEES } from "../../format/render";
import { LIMITES, OFFSET_DEFAUT, OFFSET_MAX } from "../defauts";
import type { ToolContext } from "../registry";

function formaterLienSource(urls: readonly string[]): string | null {
  if (urls.length === 0) return null;
  if (urls.length === 1) return `Lien de la liste source (non vérifié) : ${urls[0]}`;
  return `Liens de la liste source (non vérifiés) : ${urls.join(" · ")}`;
}

function formaterPagination(rendus: number, total: number, offset: number): string | null {
  if (offset === 0) return troncature(rendus, total);
  if (total === 0) return null;
  if (rendus === 0) {
    return `aucune entrée à partir du rang ${nombreFr(offset)} sur ${nombreFr(total)}`;
  }
  return `${nombreFr(rendus)} rendue(s) à partir du rang ${nombreFr(offset)} sur ${nombreFr(total)}`;
}

function formaterBlocListeAnnuaire(l: ExemptAuthorityList, lang: Lang): string {
  const titre = lang === "en" ? l.titleEn : l.titleFr;
  const trib = lang === "en" ? l.tribunalNomEn : l.tribunalNomFr;
  const lignes = [
    `${l.listId} — ${trib} · ${titre}`,
    `Ressort : ${l.jurisdiction} · Base CanLII attendue : ${l.databaseId} · Version : ${l.versionLabel}`,
    `${nombreFr(l.entries.length)} entrée(s) · ${nombreFr(l.entries.filter((e) => e.sourceUrls.length > 0).length)} avec hyperlien source`,
  ];
  if (l.fondementReglementaire) lignes.push(`Fondement : ${l.fondementReglementaire}`);
  lignes.push(`Portée : ${l.consigneCitation}`);
  lignes.push(`Liste source : ${l.sourceUrl}`);
  if (l.directiveUrl) lignes.push(`Directive connexe : ${l.directiveUrl}`);
  return lignes.join("\n");
}

function formaterEntree(
  l: ExemptAuthorityList,
  e: ExemptAuthorityEntry,
  dec: ExemptDecisionRecord | undefined,
  lang: Lang,
  avecListe: boolean,
): string {
  const entetePos = e.tabNumber !== null ? `Onglet ${e.tabNumber}` : `#${e.position}`;
  const prefix = avecListe ? `[${l.listId} · ${entetePos}]` : `[${entetePos}]`;
  const sub = e.subdivision ? ` (${e.subdivision})` : "";
  const lignes = [`${prefix}${sub} ${e.cleanText}`];

  if (e.altEnText) lignes.push(`Colonne EN source : ${e.altEnText}`);
  if (e.nicknames.length > 0) lignes.push(`Surnom(s) : ${e.nicknames.join(", ")}`);
  if (e.sourceDescriptors) lignes.push(`Descripteurs (liste source) : ${e.sourceDescriptors}`);
  if (e.sourceLangNote) lignes.push(`Note linguistique source : ${e.sourceLangNote}`);

  if (dec && dec.status === "canlii") {
    const tCan = canliiTitleForLang(dec, lang);
    const cCan = canliiCitationForLang(dec, lang);
    const lCan = canliiBestLink(dec, lang);
    const kwCan = canliiKeywordsForLang(dec, lang);
    const metaParts = [tCan, cCan, dec.decision_date, dec.docket_number].filter(Boolean);
    if (metaParts.length > 0) lignes.push(`CanLII : ${metaParts.join(" · ")}`);
    if (kwCan) lignes.push(`Mots-clés (index CanLII, non vérifiés) : ${kwCan}`);
    if (lCan) lignes.push(`Hyperlien CanLII : ${lCan}`);
  } else if (dec) {
    lignes.push(
      `Statut CanLII : ${dec.status === "hors_juridiction" ? "hors juridiction canadienne" : "hors collection / non indexée lors de la compilation"}`,
    );
  }

  if (e.affirmingDecisionKey) {
    const aff = EXEMPT_DECISIONS[e.affirmingDecisionKey];
    if (aff) {
      const affInfo = [
        canliiTitleForLang(aff, lang) ?? aff.key,
        canliiCitationForLang(aff, lang),
        canliiBestLink(aff, lang),
      ]
        .filter(Boolean)
        .join(" · ");
      lignes.push(`Décision confirmante (conf. par / aff'd) : ${affInfo}`);
    }
  }

  const lienSrc = formaterLienSource(e.sourceUrls);
  if (lienSrc) lignes.push(lienSrc);
  if (e.transcriptionNote) lignes.push(`Note : ${e.transcriptionNote}`);

  return lignes.join("\n");
}

function matchesQuery(
  l: ExemptAuthorityList,
  e: ExemptAuthorityEntry,
  dec: ExemptDecisionRecord | undefined,
  qNorm: string,
  qTokens: string[],
): boolean {
  const aff = e.affirmingDecisionKey ? EXEMPT_DECISIONS[e.affirmingDecisionKey] : undefined;
  const hay = fold(
    [
      l.listId,
      l.titleFr,
      l.titleEn,
      l.tribunalNomFr,
      l.tribunalNomEn,
      e.subdivision ?? "",
      e.rawText,
      e.altEnText ?? "",
      e.sourceDescriptors ?? "",
      e.nicknames.join(" "),
      dec?.title_fr ?? "",
      dec?.title_en ?? "",
      dec?.citation_fr ?? "",
      dec?.citation_en ?? "",
      dec?.keywords_fr ?? "",
      dec?.keywords_en ?? "",
      dec?.docket_number ?? "",
      aff?.title_fr ?? "",
      aff?.title_en ?? "",
      aff?.citation_fr ?? "",
      aff?.citation_en ?? "",
    ].join(" "),
  );
  if (hay.includes(qNorm)) return true;
  return qTokens.length > 0 && qTokens.every((t) => hay.includes(t));
}

export async function listExemptAuthorities(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<ToolResult> {
  const listIdArg = typeof args.list_id === "string" ? args.list_id.trim() : "";
  const tribunalArg = typeof args.tribunal === "string" ? args.tribunal.trim() : "";
  const queryArg = typeof args.query === "string" ? args.query.trim() : "";
  const lang = (args.lang as Lang) ?? "fr";

  const bornes = LIMITES.list_exempt_cases;
  const limit = Math.min(Math.max((args.limit as number) ?? bornes.defaut, 1), bornes.max);
  const offset = Math.min(Math.max((args.offset as number) ?? OFFSET_DEFAUT, 0), OFFSET_MAX);

  const cible = resolveTargetLists({ list_id: listIdArg, tribunal: tribunalArg });
  if (!cible.ok) return err(cible.error);

  // Mode 1 : Annuaire des 27 listes (aucun filtre)
  if (!listIdArg && !tribunalArg && !queryArg) {
    const toutes = EXEMPT_AUTHORITY_LISTS;
    const tranche = toutes.slice(offset, offset + limit);
    const blocs = tranche.map((l) => formaterBlocListeAnnuaire(l, lang));
    const entete =
      `${nombreFr(EXEMPT_AUTHORITY_STATS.listCount)} listes d'autorités dispensées compilées ` +
      `(${nombreFr(Object.keys(TRIBUNAUX).length)} tribunaux · ${nombreFr(EXEMPT_AUTHORITY_STATS.totalEntries)} entrées · ` +
      `${nombreFr(EXEMPT_AUTHORITY_STATS.uniqueDecisions)} décisions uniques) — mode hors ligne :`;
    const tronq = formaterPagination(tranche.length, toutes.length, offset);
    const pied = [tronq ? `Troncature : ${tronq}.` : null, GARDE_AUTORITES_DISPENSEES]
      .filter((x): x is string => Boolean(x))
      .join("\n\n");
    return ok(document(entete, blocs, pied));
  }

  // Mode 2 : Lecture verbatim d'une liste unique (sans requête `query`)
  if (!queryArg && cible.lists.length === 1) {
    const l = cible.lists[0]!;
    const tranche = l.entries.slice(offset, offset + limit);
    const blocs = tranche.map((e) =>
      formaterEntree(l, e, EXEMPT_DECISIONS[e.decisionKey], lang, false),
    );
    const titre = lang === "en" ? l.titleEn : l.titleFr;
    const trib = lang === "en" ? l.tribunalNomEn : l.tribunalNomFr;
    const entete = [
      `${l.listId} — ${trib} : ${titre} (${nombreFr(l.entries.length)} entrées, ordre source conservé)`,
      l.fondementReglementaire ? `Fondement : ${l.fondementReglementaire}` : null,
      `Portée : ${l.consigneCitation}`,
      `Liste source : ${l.sourceUrl}`,
      l.directiveUrl ? `Directive connexe : ${l.directiveUrl}` : null,
      l.relatedUrls.length > 0 ? `Sources connexes : ${l.relatedUrls.join(" · ")}` : null,
    ]
      .filter((x): x is string => Boolean(x))
      .join("\n");
    const tronq = formaterPagination(tranche.length, l.entries.length, offset);
    const pied = [
      tronq ? `Troncature : ${tronq}.` : null,
      blocs.length === 0 ? "Aucune entrée dans cette plage (offset hors limites)." : null,
      GARDE_AUTORITES_DISPENSEES,
    ]
      .filter((x): x is string => Boolean(x))
      .join("\n\n");
    return ok(document(entete, blocs, pied));
  }

  // Mode 3 : Recherche (`query`) ou parcours multi-listes (`tribunal`)
  const qNorm = fold(queryArg);
  const qTokens = qNorm ? qNorm.split(" ").filter(Boolean) : [];
  const paires: Array<{ list: ExemptAuthorityList; entry: ExemptAuthorityEntry }> = [];

  for (const l of cible.lists) {
    for (const e of l.entries) {
      const dec = EXEMPT_DECISIONS[e.decisionKey];
      if (!queryArg || matchesQuery(l, e, dec, qNorm, qTokens)) {
        paires.push({ list: l, entry: e });
      }
    }
  }

  // Déduplication par `decisionKey` en recherche (`query`), en conservant toutes les listes appariées
  let blocsTotal: string[];
  if (queryArg) {
    const groupes = new Map<
      string,
      Array<{ list: ExemptAuthorityList; entry: ExemptAuthorityEntry }>
    >();
    for (const p of paires) {
      const grp = groupes.get(p.entry.decisionKey);
      if (grp) grp.push(p);
      else groupes.set(p.entry.decisionKey, [p]);
    }
    blocsTotal = [...groupes.values()].map((grp) => {
      const principal = grp[0]!;
      const dec = EXEMPT_DECISIONS[principal.entry.decisionKey];
      const base = formaterEntree(principal.list, principal.entry, dec, lang, grp.length === 1);
      if (grp.length === 1) return base;
      const occurrences = grp
        .map((x) => {
          const ong =
            x.entry.tabNumber !== null ? `onglet ${x.entry.tabNumber}` : `#${x.entry.position}`;
          return x.entry.subdivision
            ? `${x.list.listId} (${ong}, ${x.entry.subdivision})`
            : `${x.list.listId} (${ong})`;
        })
        .join(" · ");
      return `${base}\nPrésente dans ${nombreFr(grp.length)} listes : ${occurrences}`;
    });
  } else {
    blocsTotal = paires.map((p) =>
      formaterEntree(p.list, p.entry, EXEMPT_DECISIONS[p.entry.decisionKey], lang, true),
    );
  }

  const tranche = blocsTotal.slice(offset, offset + limit);
  const tribMeta = cible.tribNorm ? TRIBUNAUX[cible.tribNorm] : null;
  const portee = tribMeta
    ? `${lang === "en" ? tribMeta.nomEn : tribMeta.nomFr} (${cible.lists.map((l) => l.listId).join(", ")})`
    : "toutes les listes compilées";
  const baseEntete = queryArg
    ? `${nombreFr(blocsTotal.length)} décision(s) pour « ${queryArg} » sur ${portee} :`
    : `${tribMeta ? (lang === "en" ? tribMeta.nomEn : tribMeta.nomFr) : portee} — ${nombreFr(blocsTotal.length)} entrée(s) sur ${nombreFr(cible.lists.length)} liste(s) (${cible.lists.map((l) => l.listId).join(", ")}) :`;
  const reglesEntete = cible.tribNorm ? formatTargetProceduralRules(cible.lists) : [];
  const entete = [baseEntete, ...reglesEntete].join("\n");

  const tronq = formaterPagination(tranche.length, blocsTotal.length, offset);
  const pied = [
    blocsTotal.length === 0 ? "Aucune autorité correspondante dans les listes visées." : null,
    tronq ? `Troncature : ${tronq}.` : null,
    GARDE_AUTORITES_DISPENSEES,
  ]
    .filter((x): x is string => Boolean(x))
    .join("\n\n");

  return ok(document(entete, tranche, pied));
}
