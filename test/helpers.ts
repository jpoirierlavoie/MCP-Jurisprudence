/**
 * Coutures de test partagées : un client CanLII factice, servi par des réponses
 * FIGÉES (test/fixtures/), et un contexte d'outil complet.
 *
 * Aucun test n'appelle la vraie API : le connecteur doit être entièrement éprouvable
 * hors ligne, faute de quoi la suite dépendrait du quota d'une clef personnelle.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠ CE QUE `fakeClient` NE PEUT PAS ÉPROUVER — et il faut le savoir.           ║
 * ║                                                                              ║
 * ║ Ce n'est pas un `fetch` factice : c'est un REMPLACEMENT de la classe          ║
 * ║ `CanliiClient`. Son `get()` est une consultation de dictionnaire qui rend un  ║
 * ║ objet DÉJÀ ANALYSÉ. Il ne construit aucune `Response`, ne lit aucun corps,    ║
 * ║ n'appelle jamais `JSON.parse`. Tout ce qui vit dans `#request` — lecture du   ║
 * ║ corps, plafonds, détection d'un code applicatif, traduction d'un statut — lui ║
 * ║ est donc STRUCTURELLEMENT INVISIBLE.                                         ║
 * ║                                                                              ║
 * ║ Un défaut y a vécu sans qu'aucun de ces tests ne bouge : le corps des         ║
 * ║ réponses réussies était coupé à 100 000 caractères, ce qui rendait            ║
 * ║ `browse_legislation` inutilisable en production. Le seuil aurait pu valoir 10 ║
 * ║ et les 498 tests seraient restés verts.                                      ║
 * ║                                                                              ║
 * ║ CE N'EST PAS UN DÉFAUT À CORRIGER ICI. Envelopper le vrai client ferait       ║
 * ║ dépendre quatre cents tests de gestionnaire du transport, et les ralentirait  ║
 * ║ pour rien. Ces chemins-là s'éprouvent dans `test/client.test.ts`, via         ║
 * ║ `fetchImpl`, et NULLE PART AILLEURS.                                          ║
 * ║                                                                              ║
 * ║ En revanche `fakeClient` sait PORTER l'erreur qui en résulte (option          ║
 * ║ `erreur`) : le RENDU d'une cause reste parfaitement éprouvable ici.           ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { env } from "cloudflare:test";

import type { CanliiClient, CanliiUsage } from "../src/canlii/client";
import { CanliiBudgetError, CanliiError } from "../src/canlii/errors";
import type { ToolContext } from "../src/mcp/registry";

export interface FakeClient extends CanliiClient {
  /** Chemins effectivement demandés, dans l'ordre. */
  readonly chemins: string[];
}

/**
 * @param routes chemin exact -> réponse. Un chemin absent lève un 404, ce qui est le
 *   comportement de CanLII et ce qui déclenche la boucle d'auto-correction (§6.4).
 */
export function fakeClient(
  routes: Record<string, unknown>,
  opts: {
    maxCalls?: number;
    erreur?: (chemin: string) => Error | null;
    /** Étranglements à simuler : le vrai client les compte, celui-ci les déclare. */
    throttled?: number;
  } = {},
): FakeClient {
  const maxCalls = opts.maxCalls ?? 40;
  const chemins: string[] = [];
  const usage: CanliiUsage = { calls: 0, errors: 0, throttled: opts.throttled ?? 0 };

  return {
    chemins,
    callsMade: () => usage.calls,
    remaining: () => Math.max(0, maxCalls - usage.calls),
    usage: () => ({ ...usage }),
    async get<T>(path: string): Promise<T> {
      if (usage.calls >= maxCalls) throw new CanliiBudgetError(usage.calls, maxCalls);
      usage.calls++;
      chemins.push(path);

      const forcee = opts.erreur?.(path);
      if (forcee) {
        usage.errors++;
        throw forcee;
      }
      // Tolère la barre oblique finale, présente ou non.
      const clef = path.replace(/\/+$/, "");
      const trouve = routes[path] ?? routes[clef] ?? routes[`${clef}/`];
      if (trouve === undefined) {
        usage.errors++;
        throw new CanliiError(404, `https://api.canlii.org/v1/${path}?api_key=SECRET`, "not found");
      }
      return trouve as T;
    },
  };
}

/** Contexte d'outil complet, adossé à la D1 de test. */
export function toolCtx(client: CanliiClient, over: Partial<ToolContext> = {}): ToolContext {
  return {
    env: { ...env, CANLII_API_KEY: "clef-de-test" },
    db: env.DB,
    client,
    ctx: {
      waitUntil: () => {},
      passThroughOnException: () => {},
      props: {},
    } as unknown as ExecutionContext,
    now: new Date("2026-07-23T12:00:00.000Z"),
    ...over,
  };
}

/** Texte d'un résultat d'outil. */
export function texte(r: { content: Array<{ text: string }> }): string {
  return r.content.map((c) => c.text).join("\n");
}

/** Remet la base de test à son état de sortie de migrations. */
export async function resetDb(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM cases"),
    env.DB.prepare("DELETE FROM citator_edges"),
    env.DB.prepare("DELETE FROM citator_state"),
    env.DB.prepare("DELETE FROM search_log"),
    env.DB.prepare("DELETE FROM api_usage"),
    env.DB.prepare("DELETE FROM databases"),
    env.DB.prepare("DELETE FROM sync_state"),
  ]);
}

/** Remplit `databases` comme après un rafraîchissement réussi. */
export async function seedDatabases(
  ids: string[] = ["csc-scc", "qcca", "qccs", "qccq"],
): Promise<void> {
  const stmt = env.DB.prepare(
    "INSERT INTO databases (id, kind, jurisdiction, name_fr, name_norm, refreshed_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
  );
  await env.DB.batch(
    ids.map((id) =>
      stmt.bind(id, "case", id.startsWith("qc") ? "qc" : "ca", id, id, "2026-07-23T00:00:00.000Z"),
    ),
  );
}
