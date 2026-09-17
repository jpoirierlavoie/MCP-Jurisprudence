/**
 * Moissonnage planifié (spécification §11) et gestionnaire `scheduled`.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠ INERTE PAR DÉFAUT — `BACKFILL_ENABLED = "false"`.                          ║
 * ║                                                                              ║
 * ║ La sédimentation du cache par l'usage (D6) est difficilement distinguable    ║
 * ║ d'un cache ordinaire. LE MOISSONNAGE EST AUTRE CHOSE : c'est un              ║
 * ║ téléchargement en masse, et la documentation de l'API le SUGGÈRE sans        ║
 * ║ l'AUTORISER (les filtres changedAfter/modifiedAfter n'ont guère d'autre      ║
 * ║ raison d'être, mais lire une documentation n'est pas obtenir une             ║
 * ║ permission). §16.1 réserve la question à CanLII.                             ║
 * ║                                                                              ║
 * ║ Le code existe, il est testé, il ne s'exécute pas. Ne pas basculer le        ║
 * ║ drapeau avant la réponse de CanLII — et noter qu'aucun cron QUOTIDIEN n'est  ║
 * ║ déclaré dans wrangler.jsonc : l'activer exige DEUX gestes délibérés.         ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { type CanliiClient, createClient } from "./canlii/client";
import { CanliiBudgetError } from "./canlii/errors";
import type { CaseListResponse, Lang } from "./canlii/types";
import { liste, moissonnageActif } from "./config";
import { type CaseRow, rowFromListItem, upsertCases } from "./store/cases";
import { directoryStale, refreshDatabases } from "./store/databases";
import { flushUsage } from "./store/telemetry";

/** Marge sous le plafond de 10 Mo (annexe B) : 5 000 et non le maximum de 10 000. */
const PAGE = 5000;

/**
 * Jeu de deux jours recommandé par la documentation de CanLII pour le delta : la
 * diffusion connaît un délai, et un `changedAfter` calé au jour près raterait des
 * fiches diffusées entre-temps.
 */
const JEU_JOURS = 2;

/** Plafond de durée d'une exécution planifiée (§11) — l'exécution doit être REPRENABLE. */
const DUREE_MAX_MS = 15 * 60_000;

/** Budget d'appels du moissonnage : plus généreux que celui des outils, mais borné. */
const BUDGET_MOISSON = 500;

export interface SyncState {
  database_id: string;
  cursor_date: string | null;
  cursor_offset: number;
  last_run_at: string | null;
  complete: number;
}

/**
 * Point d'entrée du cron. Deux responsabilités bien séparées :
 *   1. TOUJOURS : rafraîchir le répertoire des bases (c'est le cron hebdomadaire
 *      effectivement déclaré — les tribunaux sont créés, fusionnés et renommés) ;
 *   2. SI ET SEULEMENT SI `BACKFILL_ENABLED === "true"` : le moissonnage de §11.
 */
export async function runScheduled(
  env: Env,
  now: Date = new Date(),
  /** Couture de test : injectable, jamais employée en production. */
  clientInjecte?: CanliiClient,
): Promise<void> {
  const client = clientInjecte ?? createClient(env);
  try {
    if (await directoryStale(env.DB, now)) {
      await refreshDatabases(env.DB, client, (env.DEFAULT_LANG as Lang) ?? "fr", now);
    }
  } catch (e) {
    console.error("rafraîchissement du répertoire en échec", {
      error: e instanceof Error ? e.name : "inconnu",
    });
  }

  // Le seul point d'entrée du moissonnage de masse. `moissonnageActif` élargit le
  // type littéral que `wrangler types` fige depuis wrangler.jsonc (« false ») — sans
  // quoi la comparaison ne compile même pas (voir src/config.ts). Que TypeScript juge
  // ce chemin inatteignable est en soi rassurant : la configuration VERSIONNÉE est
  // bien inerte, et seul un changement délibéré de la variable au déploiement peut
  // l'ouvrir (§16.1).
  if (moissonnageActif(env)) {
    try {
      await runBackfill(env, client, now);
    } catch (e) {
      console.error("moissonnage en échec", { error: e instanceof Error ? e.name : "inconnu" });
    }
  }

  await flushUsage(env.DB, client.usage(), now);
}

/**
 * Moissonnage reprenable, base par base.
 *
 * Deux phases par base :
 *   (a) RATTRAPAGE — remonte le temps par fenêtres annuelles depuis `cursor_date` ;
 *   (b) DELTA — `changedAfter = dernière exécution − 2 jours`.
 *
 * ⚠ Le curseur est persisté APRÈS CHAQUE PAGE, jamais seulement en fin d'exécution :
 *   une exécution planifiée est plafonnée en durée et peut être interrompue à tout
 *   moment. Un curseur écrit à la fin serait un curseur jamais écrit.
 */
export async function runBackfill(
  env: Env,
  client: CanliiClient,
  now: Date = new Date(),
  budget = BUDGET_MOISSON,
): Promise<{ bases: number; fiches: number }> {
  const bases = liste(env.BACKFILL_DATABASES);
  const lang = (env.DEFAULT_LANG as Lang) ?? "fr";
  // ⚠ Le départ du chronomètre est l'horloge RÉELLE, pas `now`. `now` sert aux
  //   horodatages écrits en base et peut être figé par un test ; s'en servir aussi
  //   pour mesurer la durée écoulée compare deux horloges différentes et fait sortir
  //   la boucle au premier tour dès que `now` n'est pas l'instant présent.
  const debut = Date.now();
  let fiches = 0;
  let traitees = 0;

  for (const base of bases) {
    if (Date.now() - debut > DUREE_MAX_MS || client.callsMade() >= budget) break;
    try {
      fiches += await moissonnerBase(env, client, base, lang, now, debut, budget);
      traitees++;
    } catch (e) {
      if (e instanceof CanliiBudgetError) break;
      console.error("moissonnage d'une base en échec", {
        base,
        error: e instanceof Error ? e.name : "inconnu",
      });
    }
  }

  return { bases: traitees, fiches };
}

async function moissonnerBase(
  env: Env,
  client: CanliiClient,
  base: string,
  lang: Lang,
  now: Date,
  debut: number,
  budget: number,
): Promise<number> {
  const etat = await lireEtat(env.DB, base);
  const anneeCourante = now.getUTCFullYear();
  let ecrites = 0;

  // ── (b) Delta quotidien, d'abord : c'est le moins coûteux et le plus utile. ──
  if (etat.last_run_at) {
    const depuis = new Date(Date.parse(etat.last_run_at) - JEU_JOURS * 86_400_000);
    ecrites += await pagineret(
      env,
      client,
      base,
      lang,
      { changedAfter: depuis.toISOString().slice(0, 10) },
      now,
      debut,
      budget,
    );
  }

  // ── (a) Rattrapage : fenêtres annuelles, du plus récent au plus ancien. ──────
  if (etat.complete !== 1) {
    const curseur = etat.cursor_date ? Number(etat.cursor_date.slice(0, 4)) : anneeCourante;
    for (let annee = curseur; annee >= 1970; annee--) {
      if (Date.now() - debut > DUREE_MAX_MS || client.callsMade() >= budget) break;
      ecrites += await pagineret(
        env,
        client,
        base,
        lang,
        {
          decisionDateAfter: `${annee}-01-01`,
          decisionDateBefore: `${annee}-12-31`,
        },
        now,
        debut,
        budget,
        annee,
      );
      // Curseur persisté à CHAQUE année franchie.
      await ecrireEtat(env.DB, base, `${annee}-01-01`, 0, now, annee <= 1970 ? 1 : 0);
    }
  }

  // ⚠ On ne réécrit ICI que l'horodatage de passage. Réécrire `cursor_date` avec la
  //   valeur LUE À L'ENTRÉE écraserait la progression que la boucle ci-dessus vient
  //   de persister année par année : le curseur reviendrait à son point de départ à
  //   chaque exécution et le rattrapage ne progresserait JAMAIS — précisément le
  //   défaut que §11 cherche à éviter en exigeant une écriture après chaque page.
  await toucherDerniereExecution(env.DB, base, now);
  return ecrites;
}

async function pagineret(
  env: Env,
  client: CanliiClient,
  base: string,
  lang: Lang,
  filtres: Record<string, string>,
  now: Date,
  debut: number,
  budget: number,
  annee?: number,
): Promise<number> {
  let offset = 0;
  let ecrites = 0;
  for (;;) {
    if (Date.now() - debut > DUREE_MAX_MS || client.callsMade() >= budget) break;
    const page = await client.get<CaseListResponse>(`caseBrowse/${lang}/${base}/`, {
      ...filtres,
      offset,
      resultCount: PAGE,
    });
    const items = page.cases ?? [];
    if (items.length === 0) break;

    const lignes = items
      .map((it) => rowFromListItem(it, base, lang, "backfill", now))
      .filter((r): r is CaseRow => r !== null)
      .map((r) => ({
        ...r,
        decision_date: r.decision_date ?? (annee ? `${annee}-01-01` : null),
      }));
    ecrites += await upsertCases(env.DB, lignes);

    offset += items.length;
    // Curseur d'offset persisté APRÈS CHAQUE PAGE (§11).
    if (annee) await ecrireEtat(env.DB, base, `${annee}-01-01`, offset, now, 0);
    if (items.length < PAGE) break;
  }
  return ecrites;
}

async function lireEtat(db: D1Database, base: string): Promise<SyncState> {
  const r = await db
    .prepare("SELECT * FROM sync_state WHERE database_id = ?")
    .bind(base)
    .first<SyncState>();
  return (
    r ?? { database_id: base, cursor_date: null, cursor_offset: 0, last_run_at: null, complete: 0 }
  );
}

async function ecrireEtat(
  db: D1Database,
  base: string,
  cursorDate: string | null,
  cursorOffset: number,
  now: Date,
  complete: number,
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO sync_state (database_id, cursor_date, cursor_offset, last_run_at, complete)
         VALUES (?,?,?,?,?)
         ON CONFLICT(database_id) DO UPDATE SET
           cursor_date = excluded.cursor_date,
           cursor_offset = excluded.cursor_offset,
           last_run_at = excluded.last_run_at,
           complete = excluded.complete`,
      )
      .bind(base, cursorDate, cursorOffset, now.toISOString(), complete)
      .run();
  } catch {
    // Un curseur non écrit fait recommencer la fenêtre : coûteux, jamais faux.
  }
}

/**
 * Note le passage du moissonneur SANS toucher au curseur.
 *
 * Séparé d'`ecrireEtat` pour rendre l'invariant impossible à enfreindre par
 * inadvertance : rien, dans cette instruction, ne peut faire reculer la progression.
 */
async function toucherDerniereExecution(db: D1Database, base: string, now: Date): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO sync_state (database_id, cursor_date, cursor_offset, last_run_at, complete)
         VALUES (?, NULL, 0, ?, 0)
         ON CONFLICT(database_id) DO UPDATE SET last_run_at = excluded.last_run_at`,
      )
      .bind(base, now.toISOString())
      .run();
  } catch {
    // Sans horodatage, la prochaine exécution refera le delta depuis le début :
    // coûteux, jamais faux.
  }
}
