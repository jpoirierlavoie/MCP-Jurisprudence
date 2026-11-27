import { env } from "cloudflare:test";

import type { CanliiClient, CanliiUsage } from "../src/canlii/client";
import { CanliiBudgetError, CanliiError } from "../src/canlii/errors";
import type { ToolContext } from "../src/mcp/registry";

export interface FakeClient extends CanliiClient {
  readonly chemins: string[];
}

export function fakeClient(
  routes: Record<string, unknown>,
  opts: {
    maxCalls?: number;
    erreur?: (chemin: string) => Error | null;
    throttled?: number;
  } = {},
): FakeClient {
  const maxCalls = opts.maxCalls ?? 40;
  const chemins: string[] = [];
  const usage: CanliiUsage = { calls: 0, throttled: opts.throttled ?? 0 };

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
        throw forcee;
      }
      const clef = path.replace(/\/+$/, "");
      const trouve = routes[path] ?? routes[clef] ?? routes[`${clef}/`];
      if (trouve === undefined) {
        throw new CanliiError(404, `https://api.canlii.org/v1/${path}?api_key=SECRET`, "not found");
      }
      return trouve as T;
    },
  };
}

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

export function texte(r: { content: Array<{ text: string }> }): string {
  return r.content.map((c) => c.text).join("\n");
}

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
