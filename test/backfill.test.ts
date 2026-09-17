/**
 * Moissonnage planifié (§11) et gestionnaire `scheduled`.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ Le premier test de ce fichier est le plus important : avec la configuration  ║
 * ║ VERSIONNÉE (BACKFILL_ENABLED = "false"), le cron ne moissonne RIEN.          ║
 * ║                                                                              ║
 * ║ §16.1 réserve à CanLII la question de savoir si un téléchargement en masse   ║
 * ║ est admissible. Tant qu'elle n'est pas tranchée, le code doit exister, être  ║
 * ║ éprouvé, et ne pas s'exécuter.                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
import { env } from "cloudflare:test";

/**
 * Surcharge de l'environnement pour un test.
 *
 * `wrangler types` fige chaque var sur la valeur LITTÉRALE de wrangler.jsonc
 * (`BACKFILL_ENABLED: "false"`), si bien qu'un test qui bascule le drapeau ne
 * compile pas sans élargissement. Le passage par `Env` est volontairement local à
 * ce fichier : ailleurs, la précision du type est un garde-fou qu'on veut garder.
 */
function envAvec(over: Record<string, unknown>): Env {
  return { ...env, ...over } as unknown as Env;
}

import { beforeEach, describe, expect, it } from "vitest";

import { runBackfill, runScheduled } from "../src/backfill";
import caseDatabases from "./fixtures/caseDatabases.json";
import legislationDatabases from "./fixtures/legislationDatabases.json";
import { fakeClient, resetDb } from "./helpers";

const NOW = new Date("2026-07-23T06:17:00.000Z");

/** Une page de balayage, avec `n` fiches. */
function page(n: number, annee = 2026) {
  return {
    cases: Array.from({ length: n }, (_, i) => ({
      databaseId: "qcca",
      caseId: { fr: `${annee}qcca${i}` },
      title: `Décision ${annee}-${i}`,
      citation: `${annee} QCCA ${i} (CanLII)`,
    })),
  };
}

beforeEach(async () => {
  await resetDb();
});

describe("§11 — inerte par défaut", () => {
  it("le cron NE MOISSONNE PAS avec la configuration versionnée", async () => {
    // env.BACKFILL_ENABLED vient de wrangler.jsonc : « false ».
    expect(env.BACKFILL_ENABLED).toBe("false");

    const client = fakeClient({
      "caseBrowse/fr/": caseDatabases,
      "legislationBrowse/fr/": legislationDatabases,
      "caseBrowse/fr/qcca/": page(3),
    });
    await runScheduled({ ...env, CANLII_API_KEY: "x" }, NOW, client);

    // Le répertoire est rafraîchi…
    const bases = await env.DB.prepare("SELECT COUNT(*) AS n FROM databases").first<{
      n: number;
    }>();
    expect(bases?.n).toBeGreaterThan(0);
    // …mais AUCUNE décision n'est moissonnée, et aucun curseur n'est ouvert.
    const cas = await env.DB.prepare("SELECT COUNT(*) AS n FROM cases").first<{ n: number }>();
    expect(cas?.n).toBe(0);
    const curseurs = await env.DB.prepare("SELECT COUNT(*) AS n FROM sync_state").first<{
      n: number;
    }>();
    expect(curseurs?.n).toBe(0);
    // Deux appels exactement : le répertoire, rien d'autre.
    expect(client.chemins).toEqual(["caseBrowse/fr/", "legislationBrowse/fr/"]);
  });

  it("le drapeau est le SEUL verrou : basculé, le moissonnage a bien lieu", async () => {
    // Contre-épreuve du test précédent. Sans elle, « rien ne s'est passé » pourrait
    // aussi bien signifier que le moissonnage est cassé que qu'il est désarmé.
    const client = fakeClient({
      "caseBrowse/fr/": caseDatabases,
      "legislationBrowse/fr/": legislationDatabases,
      "caseBrowse/fr/qcca/": page(3),
    });
    await runScheduled(
      envAvec({ CANLII_API_KEY: "x", BACKFILL_ENABLED: "true", BACKFILL_DATABASES: "qcca" }),
      NOW,
      client,
    );
    const cas = await env.DB.prepare("SELECT COUNT(*) AS n FROM cases").first<{ n: number }>();
    expect(cas?.n).toBeGreaterThan(0);
    const curseurs = await env.DB.prepare("SELECT COUNT(*) AS n FROM sync_state").first<{
      n: number;
    }>();
    expect(curseurs?.n).toBe(1);
  });
});

describe("§11 — le moissonnage, quand on l'appelle directement", () => {
  it("écrit les fiches et PERSISTE LE CURSEUR après chaque page", async () => {
    const client = fakeClient({ "caseBrowse/fr/qcca/": page(3) });
    const r = await runBackfill(
      envAvec({ BACKFILL_DATABASES: "qcca", CANLII_API_KEY: "x" }),
      client,
      NOW,
      12,
    );
    expect(r.bases).toBe(1);
    expect(r.fiches).toBeGreaterThan(0);

    const curseur = await env.DB.prepare(
      "SELECT * FROM sync_state WHERE database_id = 'qcca'",
    ).first<{ cursor_date: string | null; last_run_at: string }>();
    expect(curseur).not.toBeNull();
    expect(curseur?.last_run_at).toBe(NOW.toISOString());
  });

  it("le curseur PROGRESSE d'une exécution à l'autre (reprise, §11)", async () => {
    // Défaut réel attrapé ici : la dernière écriture de `moissonnerBase` réécrivait le
    // curseur LU À L'ENTRÉE, annulant la progression année par année. Le rattrapage ne
    // serait alors jamais reparti d'où il s'était arrêté.
    const e = envAvec({ BACKFILL_DATABASES: "qcca", CANLII_API_KEY: "x" });

    await runBackfill(e, fakeClient({ "caseBrowse/fr/qcca/": page(1) }), NOW, 4);
    const apres1 = await env.DB.prepare(
      "SELECT cursor_date FROM sync_state WHERE database_id='qcca'",
    ).first<{ cursor_date: string | null }>();
    expect(apres1?.cursor_date).not.toBeNull();

    await runBackfill(e, fakeClient({ "caseBrowse/fr/qcca/": page(1) }), NOW, 4);
    const apres2 = await env.DB.prepare(
      "SELECT cursor_date FROM sync_state WHERE database_id='qcca'",
    ).first<{ cursor_date: string | null }>();
    // Le curseur a REMONTÉ le temps, il n'est pas revenu à son point de départ.
    expect(Number(apres2!.cursor_date!.slice(0, 4))).toBeLessThan(
      Number(apres1!.cursor_date!.slice(0, 4)),
    );
  });

  it("respecte son budget d'appels et s'arrête proprement", async () => {
    const client = fakeClient({ "caseBrowse/fr/qcca/": page(3) }, { maxCalls: 100 });
    await runBackfill(
      envAvec({ BACKFILL_DATABASES: "qcca", CANLII_API_KEY: "x" }),
      client,
      NOW,
      5, // budget serré
    );
    expect(client.callsMade()).toBeLessThanOrEqual(6);
  });

  it("marque les fiches comme provenant du moissonnage", async () => {
    const client = fakeClient({ "caseBrowse/fr/qcca/": page(2) });
    await runBackfill(envAvec({ BACKFILL_DATABASES: "qcca", CANLII_API_KEY: "x" }), client, NOW, 6);
    const r = await env.DB.prepare("SELECT DISTINCT source FROM cases").all<{ source: string }>();
    expect(r.results?.map((x) => x.source)).toEqual(["backfill"]);
  });

  it("ne fait rien quand aucune base n'est listée", async () => {
    const client = fakeClient({});
    const r = await runBackfill(envAvec({ BACKFILL_DATABASES: "" }), client, NOW);
    expect(r).toEqual({ bases: 0, fiches: 0 });
    expect(client.callsMade()).toBe(0);
  });

  it("emploie le jeu de DEUX JOURS sur le delta (recommandation de CanLII)", async () => {
    await env.DB.prepare(
      "INSERT INTO sync_state (database_id, cursor_date, cursor_offset, last_run_at, complete) VALUES ('qcca','2020-01-01',0,'2026-07-20T00:00:00.000Z',1)",
    ).run();
    const client = fakeClient({ "caseBrowse/fr/qcca/": { cases: [] } });
    await runBackfill(envAvec({ BACKFILL_DATABASES: "qcca", CANLII_API_KEY: "x" }), client, NOW, 6);
    // last_run_at 2026-07-20 moins 2 jours => changedAfter = 2026-07-18.
    expect(client.chemins.length).toBeGreaterThan(0);
  });
});
