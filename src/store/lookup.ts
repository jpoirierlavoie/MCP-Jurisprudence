import type { CanliiClient } from "../canlii/client";
import { analyserErreur } from "../canlii/client";
import { CanliiBudgetError, CanliiError, relancerSiInterruptionGouverne } from "../canlii/errors";
import type { CaseMetadata, Lang } from "../canlii/types";
import type { Directory, NeutralForm, Resolution, ResolvableForm } from "../citation/parse";
import {
  type CaseRow,
  getCachedCandidates,
  getCachedCase,
  hasLangCached,
  projectCaseForLang,
  rowFromMetadata,
  upsertCase,
} from "./cases";
import { confirmCourtCode, confirmParenCode } from "./databases";

const MAX_RATTRAPAGES = 2;

type LookupStatus = "trouvee" | "introuvable" | "base_inconnue" | "budget" | "erreur";

interface LookupResult {
  status: LookupStatus;
  row: CaseRow | null;
  provenance: "cache" | "api" | null;
  message: string | null;
}

interface Candidat {
  databaseId: string;
  caseId: string;
  voie: "direct" | "lang_swap" | "split_db";
  caseidCode: string | null;
}

function candidats(form: ResolvableForm, res: Resolution, dir: Directory): Candidat[] {
  if (!res.databaseId || !res.caseId) return [];
  const liste: Candidat[] = [
    {
      databaseId: res.databaseId,
      caseId: res.caseId,
      voie: "direct",
      caseidCode: null,
    },
  ];

  const rattrapages: Candidat[] = [];

  if (form.kind === "neutral") {
    const row = dir.courtCodes.get(form.code);
    const alt = form.code.toLowerCase();
    if (!row || row.caseid_code.toLowerCase() !== alt) {
      rattrapages.push({
        databaseId: res.databaseId,
        caseId: caseIdNeutre(form, alt),
        voie: "lang_swap",
        caseidCode: alt,
      });
    }
    for (const autre of dir.courtCodes.values()) {
      if (autre.database_id !== res.databaseId) continue;
      const frag = autre.caseid_code.toLowerCase();
      if (frag === (row?.caseid_code.toLowerCase() ?? "") || frag === alt) continue;
      rattrapages.push({
        databaseId: res.databaseId,
        caseId: caseIdNeutre(form, frag),
        voie: "lang_swap",
        caseidCode: frag,
      });
    }
  }

  if (res.databaseId.includes("-")) {
    for (const moitie of res.databaseId.split("-")) {
      if (moitie.length === 0) continue;
      rattrapages.push({
        databaseId: moitie,
        caseId: res.caseId,
        voie: "split_db",
        caseidCode: null,
      });
    }
  }

  const vus = new Set([`${liste[0]!.databaseId}/${liste[0]!.caseId}`]);
  for (const c of rattrapages) {
    const clef = `${c.databaseId}/${c.caseId}`;
    if (vus.has(clef)) continue;
    vus.add(clef);
    liste.push(c);
    if (liste.length > MAX_RATTRAPAGES) break;
  }
  return liste;
}

function caseIdNeutre(form: NeutralForm, fragment: string): string {
  return `${form.year}${fragment}${form.number}`;
}

interface LookupOptions {
  db: D1Database;
  client: CanliiClient;
  dir: Directory;
  lang: Lang;
  refresh?: boolean;
  now?: Date;
}

function mergeBilingualFields(base: CaseRow, candidates: CaseRow[]): CaseRow {
  let out = base;
  for (const cand of candidates) {
    if (cand.source !== "lookup") continue;
    out = {
      ...out,
      title_fr: out.title_fr ?? cand.title_fr,
      title_en: out.title_en ?? cand.title_en,
      url_fr: out.url_fr ?? cand.url_fr,
      url_en: out.url_en ?? cand.url_en,
      keywords_fr: out.keywords_fr ?? cand.keywords_fr,
      keywords_en: out.keywords_en ?? cand.keywords_en,
    };
  }
  return out;
}

export async function lookupCase(
  form: ResolvableForm,
  res: Resolution,
  opts: LookupOptions,
): Promise<LookupResult> {
  const { db, client, dir, lang } = opts;
  const now = opts.now ?? new Date();

  if (!res.databaseId || !res.caseId) {
    return {
      status: "introuvable",
      row: null,
      provenance: null,
      message: res.raison,
    };
  }

  const essais = candidats(form, res, dir);

  const cacheCandidates = await getCachedCandidates(
    db,
    essais.map((c) => [c.databaseId, c.caseId] as const),
  );

  if (!opts.refresh) {
    const cache = cacheCandidates.find((c) => c.source === "lookup" && hasLangCached(c, lang));
    if (cache) {
      return {
        status: "trouvee",
        row: projectCaseForLang(mergeBilingualFields(cache, cacheCandidates), lang),
        provenance: "cache",
        message: null,
      };
    }
  }

  if (dir.knownDatabases.size > 0 && !dir.knownDatabases.has(res.databaseId)) {
    return {
      status: "base_inconnue",
      row: null,
      provenance: null,
      message:
        `Le tribunal déduit (« ${res.databaseId} ») ne figure pas au répertoire des bases de ` +
        "CanLII. Aucun appel n'a été fait. Consulter list_databases pour l'identifiant exact.",
    };
  }

  let dernierEchec: LookupResult | null = null;

  for (const [i, c] of essais.entries()) {
    try {
      const meta = await client.get<CaseMetadata>(
        `caseBrowse/${lang}/${c.databaseId}/${c.caseId}/`,
      );
      const row = rowFromMetadata(
        meta,
        { databaseId: c.databaseId, caseId: c.caseId },
        "lookup",
        now,
        lang,
      );
      await upsertCase(db, row);
      if (i > 0) await apprendre(db, form, c, meta, res);
      const stored = (await getCachedCase(db, row.database_id, row.case_id)) ?? row;
      const merged = mergeBilingualFields(stored, cacheCandidates);
      return {
        status: "trouvee",
        row: projectCaseForLang(merged, lang),
        provenance: "api",
        message: null,
      };
    } catch (e) {
      relancerSiInterruptionGouverne(e);
      if (e instanceof CanliiBudgetError) {
        return {
          status: "budget",
          row: null,
          provenance: null,
          message: "Budget d'appels épuisé avant d'avoir pu vérifier cette citation.",
        };
      }
      if (e instanceof CanliiError && e.status === 404) {
        dernierEchec = {
          status: "introuvable",
          row: null,
          provenance: null,
          message: null,
        };
        continue;
      }
      return {
        status: "erreur",
        row: null,
        provenance: null,
        message: analyserErreur(e).phrase,
      };
    }
  }

  return (
    dernierEchec ?? {
      status: "introuvable",
      row: null,
      provenance: null,
      message: null,
    }
  );
}

async function apprendre(
  db: D1Database,
  form: ResolvableForm,
  c: Candidat,
  meta: CaseMetadata,
  res: Resolution,
): Promise<void> {
  const concat = meta.concatenatedId ?? null;
  if (form.kind === "neutral") {
    const retenu = c.caseId;
    const fragment = c.caseidCode ?? extraireFragment(retenu, form) ?? form.code.toLowerCase();
    await confirmCourtCode(
      db,
      form.code,
      meta.databaseId || c.databaseId,
      fragment,
      concat,
      `corrigé à l'usage (${c.voie}) : ${res.databaseId}/${res.caseId} -> ${meta.databaseId || c.databaseId}/${retenu}`,
    );
    return;
  }
  if (form.kind === "canlii" && form.juris && form.court) {
    await confirmParenCode(db, form.juris, form.court, meta.databaseId || c.databaseId);
  }
}

function extraireFragment(caseId: string, form: NeutralForm): string | null {
  const prefixe = String(form.year);
  const suffixe = String(form.number);
  if (!caseId.startsWith(prefixe) || !caseId.endsWith(suffixe)) return null;
  const milieu = caseId.slice(prefixe.length, caseId.length - suffixe.length);
  return milieu.length > 0 ? milieu : null;
}
