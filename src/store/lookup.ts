/**
 * Résolution d'une citation en fiche de décision, avec la BOUCLE D'AUTO-CORRECTION
 * du répertoire (spécification §6.4).
 *
 * Ce module combine le client et la base : il ne pouvait donc pas vivre dans
 * `src/citation/`, qui reste PUR par construction. Il est partagé par quatre
 * gestionnaires (verify_citations, get_case, citator, subsequent_history) — d'où un
 * fichier à lui plutôt qu'une duplication.
 *
 * La correspondance « code de citation -> databaseId » n'est documentée que pour
 * `csc-scc` ; tout le reste est une hypothèse d'amorçage. Le système APPREND : sur
 * échec, il essaie la variante linguistique, puis chaque moitié d'un databaseId
 * composé, et consigne celle qui a fonctionné.
 */

import type { CanliiClient } from "../canlii/client";
import { analyserErreur } from "../canlii/client";
import { CanliiBudgetError, CanliiError } from "../canlii/errors";
import type { CaseMetadata, Lang } from "../canlii/types";
import type { Directory, NeutralForm, Resolution, ResolvableForm } from "../citation/parse";
import { type CaseRow, getCachedAny, rowFromMetadata, upsertCase } from "./cases";
import { confirmCourtCode, confirmParenCode } from "./databases";

/** Au plus DEUX tentatives supplémentaires par citation (§6.4), budget compris. */
const MAX_RATTRAPAGES = 2;

export type LookupStatus = "trouvee" | "introuvable" | "base_inconnue" | "budget" | "erreur";

export interface LookupResult {
  status: LookupStatus;
  row: CaseRow | null;
  /** D'où vient la fiche : cache local ou appel à CanLII. */
  provenance: "cache" | "api" | null;
  /** Chemin de repli emprunté, consigné dans `search_log.fallback`. */
  fallback: string | null;
  /** Explication en français, destinée à la sortie quand le statut n'est pas « trouvee ». */
  message: string | null;
}

interface Candidat {
  databaseId: string;
  caseId: string;
  /** Étiquette du chemin, pour la télémétrie et la note d'auto-correction. */
  voie: "direct" | "lang_swap" | "split_db";
  /** Fragment employé dans le caseId, à consigner si la tentative réussit. */
  caseidCode: string | null;
}

/**
 * Construit la liste des tentatives : la directe, puis au plus deux rattrapages.
 *
 * Ordre imposé par §6.4 : (1) variante linguistique, (2) moitiés d'un databaseId
 * composé. Le plafond est dur — sans lui, une citation mal formée pourrait à elle
 * seule consommer le budget d'appels de toute l'invocation.
 */
export function candidats(form: ResolvableForm, res: Resolution, dir: Directory): Candidat[] {
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
    // (1) Variante linguistique : 2008csc9 <-> 2008scc9. Le code de citation lui-même
    // EST la variante de l'autre langue — « CSC » en français, « SCC » en anglais.
    const alt = form.code.toLowerCase();
    if (!row || row.caseid_code.toLowerCase() !== alt) {
      rattrapages.push({
        databaseId: res.databaseId,
        caseId: caseIdNeutre(form, alt),
        voie: "lang_swap",
        caseidCode: alt,
      });
    }
    // Et la variante inverse : si l'on a essayé le code brut, essayer le fragment
    // enregistré de l'autre ligne de même base (p. ex. CSC -> 'scc' quand on vient
    // de « csc »).
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

  // (2) databaseId composé « a-b » : essayer chaque moitié.
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

  // Dédoublonnage : deux chemins peuvent proposer la même tentative.
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

export interface LookupOptions {
  db: D1Database;
  client: CanliiClient;
  dir: Directory;
  lang: Lang;
  refresh?: boolean;
  now?: Date;
}

/**
 * Résout une forme constructible en fiche.
 *
 * §6.4 point 3 : si le databaseId déduit N'EXISTE PAS au répertoire, on N'APPELLE PAS
 * l'API. Rendre INTROUVABLE sans dépenser un appel est plus honnête et moins coûteux —
 * et le message oriente vers `jurisprudence_list_databases` plutôt que de laisser croire que
 * la décision n'existe pas.
 */
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
      fallback: "non_constructible",
      message: res.raison,
    };
  }

  const essais = candidats(form, res, dir);

  // Cache (D5/D6) : les métadonnées d'une décision sont quasi immuables, le cache est
  // donc permanent. `refresh` est le seul moyen de le contourner.
  //
  // ⚠ On interroge le cache sur TOUS les identifiants candidats, pas seulement sur
  //   celui qu'on vient de construire. Motif : CanLII CLASSE ses fiches sous un caseId
  //   propre à la langue (« 2008csc9 » en français) qui n'est pas nécessairement celui
  //   qu'on a construit (« 2008scc9 »). La fiche est donc persistée sous SON identifiant
  //   à lui. Chercher uniquement l'identifiant construit ferait manquer le cache à
  //   CHAQUE appel, pour toujours : la vérification resterait correcte, mais le cache
  //   ne servirait jamais et chaque citation coûterait un appel à perpétuité.
  if (!opts.refresh) {
    const cache = await getCachedAny(
      db,
      essais.map((c) => [c.databaseId, c.caseId] as const),
    );
    // ⚠ Une fiche issue d'un BALAYAGE ne suffit PAS à répondre à une vérification.
    //
    //   Une réponse de liste ne porte que quatre champs (annexe B) : ni date de
    //   décision, ni numéro de dossier, ni mots-clés, ni hyperlien. Servir une telle
    //   ligne depuis le cache aurait deux effets, dont le second est grave :
    //     1. la fiche rendue serait appauvrie (date « — », aucun hyperlien) ;
    //     2. surtout, `comparer()` n'effectue le contrôle d'ANNÉE que si
    //        `decision_date` existe. Sur une ligne de balayage, ce contrôle serait
    //        donc SILENCIEUSEMENT SAUTÉ : une citation dont l'année est fausse
    //        ressortirait CONFIRMÉE alors qu'`expected_year` n'a jamais été comparée.
    //   Une garantie qui disparaît sans bruit est exactement ce que §2 interdit.
    //
    //   On ne sert donc du cache que les fiches obtenues par RÉSOLUTION DIRECTE
    //   (`source = 'lookup'`), seules complètes. Une ligne de balayage est conservée
    //   pour l'INDEX de recherche — c'est son rôle — mais déclenche ici un appel.
    if (cache && cache.source === "lookup") {
      return { status: "trouvee", row: cache, provenance: "cache", fallback: null, message: null };
    }
  }

  if (dir.knownDatabases.size > 0 && !dir.knownDatabases.has(res.databaseId)) {
    return {
      status: "base_inconnue",
      row: null,
      provenance: null,
      fallback: "unknown_court",
      message:
        `Le tribunal déduit (« ${res.databaseId} ») ne figure pas au répertoire des bases de ` +
        "CanLII. Aucun appel n'a été fait. Consulter jurisprudence_list_databases pour l'identifiant exact.",
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
      );
      await upsertCase(db, row);
      // Apprentissage du répertoire (§6.4) : UNIQUEMENT sur un rattrapage réussi.
      // Une résolution directe n'apprend rien qu'on ne sache déjà — et surtout, il ne
      // faut PAS « corriger » court_codes vers le fragment que CanLII emploie dans sa
      // réponse (« csc » là où l'on a demandé « scc ») : les fiches sont clées par ce
      // qu'on demande (voir rowFromMetadata), donc déplacer le fragment ferait
      // construire un identifiant qui ne correspond plus aux lignes déjà en cache.
      if (i > 0) await apprendre(db, form, c, meta, res);
      return {
        status: "trouvee",
        row,
        provenance: "api",
        fallback: i === 0 ? null : c.voie,
        message: null,
      };
    } catch (e) {
      if (e instanceof CanliiBudgetError) {
        return {
          status: "budget",
          row: null,
          provenance: null,
          fallback: "budget",
          message: "Budget d'appels épuisé avant d'avoir pu vérifier cette citation.",
        };
      }
      if (e instanceof CanliiError && e.status === 404) {
        dernierEchec = {
          status: "introuvable",
          row: null,
          provenance: null,
          fallback: i === 0 ? "not_found" : `not_found_${c.voie}`,
          message: null,
        };
        continue; // rattrapage suivant
      }
      // Une erreur qui n'est PAS un 404 (401, 429, 5xx, expiration) ne doit surtout pas
      // se présenter comme un INTROUVABLE : ce serait affirmer une absence qu'on n'a
      // pas constatée.
      // La PHRASE de la cause voyage avec le statut. Elle valait `null`, et les
      // appelants retombaient alors sur leur message d'ABSENCE par défaut : un 429
      // ressortait en « Aucune fiche pour … » sur trois outils. C'était l'invariant 9
      // enfreint à la racine, et non chez l'appelant. Corrigé le 2026-09-16.
      return {
        status: "erreur",
        row: null,
        provenance: null,
        fallback: "api_error",
        message: analyserErreur(e).phrase,
      };
    }
  }

  return (
    dernierEchec ?? {
      status: "introuvable",
      row: null,
      provenance: null,
      fallback: "not_found",
      message: null,
    }
  );
}

/**
 * Consigne la correspondance qui a effectivement fonctionné (§6.4).
 *
 * Le fragment consigné est celui du caseId QUI A FONCTIONNÉ — pas celui que CanLII
 * emploie dans sa réponse : les fiches sont clées par ce qu'on demande, et les deux
 * doivent rester cohérents.
 */
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

/** Retrouve le fragment employé dans un caseId : « 2008scc9 » -> « scc ». */
function extraireFragment(caseId: string, form: NeutralForm): string | null {
  const prefixe = String(form.year);
  const suffixe = String(form.number);
  if (!caseId.startsWith(prefixe) || !caseId.endsWith(suffixe)) return null;
  const milieu = caseId.slice(prefixe.length, caseId.length - suffixe.length);
  return milieu.length > 0 ? milieu : null;
}
