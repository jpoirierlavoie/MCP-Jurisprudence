/**
 * Transport MCP (spécification §8, §9 ; plan de test §13).
 *
 * On appelle le Worker par son export `fetch` plutôt que par `SELF`, afin de pouvoir
 * faire varier `env` (coupe-circuit, secret absent) d'un test à l'autre.
 */
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { type JsonSchema, parseMessage, validateArgs } from "@poirierlavoie/mcp-socle";
import { beforeEach, describe, expect, it } from "vitest";
import worker, { reinitialiserQuarantaineIpPourTests, VERSIONS } from "../src/index";
import { PUBLIC_DESCRIPTION, SERVER_INFO } from "../src/mcp/registry";

beforeEach(() => {
  reinitialiserQuarantaineIpPourTests();
});

const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
/** Second porteur (§19) — le clavardage de Pallas Athéna. Droits identiques. */
const SECRET_ATHENA = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

// `wrangler types` fige chaque var sur sa valeur LITTÉRALE de wrangler.jsonc :
// `Partial<Env>` garde donc `MCP_ENABLED: "true"` et interdit de l'éteindre dans un
// test. L'élargissement est confiné à ce helper — ailleurs, la précision du type
// reste un garde-fou utile.
function envAvec(over: Record<string, unknown> = {}): Env {
  return {
    ...env,
    MCP_SHARED_SECRET: SECRET,
    CANLII_API_KEY: "clef-de-test",
    ...over,
  } as unknown as Env;
}

async function appeler(
  body: unknown,
  opts: {
    secret?: string | null;
    method?: string;
    headers?: Record<string, string>;
    env?: Env;
    /** Paramètres de requête — sert le porteur `?key=`, servi depuis le 2026-09-17. */
    query?: Record<string, string>;
  } = {},
): Promise<Response> {
  const secret = opts.secret === undefined ? SECRET : opts.secret;
  const chemin = secret === null ? "/mcp" : `/mcp/${secret}`;
  const qs = opts.query ? `?${new URLSearchParams(opts.query).toString()}` : "";
  const ctx = createExecutionContext();
  const req = new Request(`https://jurisprudence.poirierlavoie.ca${chemin}${qs}`, {
    method: opts.method ?? "POST",
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    body: opts.method && opts.method !== "POST" ? undefined : JSON.stringify(body),
  });
  const res = await worker.fetch(req, opts.env ?? envAvec(), ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const rpc = (method: string, params?: unknown, id: number | string = 1) => ({
  jsonrpc: "2.0",
  id,
  method,
  ...(params === undefined ? {} : { params }),
});

describe("CORS — sans quoi claude.ai ne peut pas joindre le serveur", () => {
  const SECRET_URL = `https://x/mcp/${SECRET}`;

  /**
   * Défaut réel constaté à la mise en service : le serveur répondait parfaitement
   * à un client SERVEUR (curl, scripts/mcp-client.mjs) et restait injoignable
   * depuis claude.ai, qui est une application de NAVIGATEUR. Le pré-vol `OPTIONS`
   * recevait un 405 et les réponses ne portaient aucun en-tête CORS : le
   * navigateur refusait avant même de lire la réponse.
   */
  it("répond au pré-vol OPTIONS SANS exiger le secret", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/mcp/peu-importe", {
        method: "OPTIONS",
        headers: {
          Origin: "https://claude.ai",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      }),
      envAvec(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    // Un navigateur émet le pré-vol sans authentification : l'exiger casserait tout.
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://claude.ai");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).toContain(
      "content-type",
    );
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("une réponse réelle porte Access-Control-Allow-Origin", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request(SECRET_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://claude.ai" },
        body: JSON.stringify(rpc("ping")),
      }),
      envAvec(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    // Sans cet en-tête, le navigateur bloque la LECTURE de la réponse, même 200.
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://claude.ai");
  });

  it("un refus 404 sur /mcp et un refus 401 sur /mcp/oauth portent aussi les en-têtes CORS", async () => {
    const ctx404 = createExecutionContext();
    const res404 = await worker.fetch(
      new Request("https://x/mcp/mauvais-secret", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://claude.ai" },
        body: JSON.stringify(rpc("ping")),
      }),
      envAvec(),
      ctx404,
    );
    await waitOnExecutionContext(ctx404);
    expect(res404.status).toBe(404);
    expect(await res404.text()).toBe("");
    expect(res404.headers.get("WWW-Authenticate")).toBeNull();
    expect(res404.headers.get("Access-Control-Allow-Origin")).toBe("https://claude.ai");

    const ctx401 = createExecutionContext();
    const res401 = await worker.fetch(
      new Request("https://x/mcp/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://claude.ai" },
        body: JSON.stringify(rpc("ping")),
      }),
      envAvec(),
      ctx401,
    );
    await waitOnExecutionContext(ctx401);
    expect(res401.status).toBe(401);
    expect(res401.headers.get("Access-Control-Allow-Origin")).toBe("https://claude.ai");
  });

  it("REFUSE une origine de navigateur inconnue (ré-attachement DNS)", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request(SECRET_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
        body: JSON.stringify(rpc("ping")),
      }),
      envAvec(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    // 403 MÊME avec le bon secret : l'origine est jugée avant l'authentification.
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("un appel SANS origine (serveur à serveur) reste admis", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request(SECRET_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rpc("ping")),
      }),
      envAvec(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("ALLOWED_ORIGINS ajoute une origine sans retirer claude.ai", async () => {
    const e = envAvec({ ALLOWED_ORIGINS: "https://exemple.test" });
    for (const [origine, attendu] of [
      ["https://exemple.test", 200],
      ["https://claude.ai", 200],
      ["https://autre.test", 403],
    ] as Array<[string, number]>) {
      const ctx = createExecutionContext();
      const res = await worker.fetch(
        new Request(SECRET_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origine },
          body: JSON.stringify(rpc("ping")),
        }),
        e,
        ctx,
      );
      await waitOnExecutionContext(ctx);
      expect(res.status, origine).toBe(attendu);
    }
  });

  it("admet les origines web Gemini et les en-têtes MCP 2026-07-28 en pré-vol", async () => {
    for (const origin of ["https://gemini.google.com", "https://aistudio.google.com"]) {
      const ctxPre = createExecutionContext();
      const pre = await worker.fetch(
        new Request("https://x/mcp", {
          method: "OPTIONS",
          headers: {
            Origin: origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers":
              "authorization, mcp-protocol-version, mcp-method, mcp-name, mcp-session-id",
          },
        }),
        envAvec(),
        ctxPre,
      );
      await waitOnExecutionContext(ctxPre);
      expect(pre.status, origin).toBe(204);
      expect(pre.headers.get("Access-Control-Allow-Origin"), origin).toBe(origin);
      const allows = (pre.headers.get("Access-Control-Allow-Headers") ?? "").toLowerCase();
      for (const h of [
        "authorization",
        "mcp-protocol-version",
        "mcp-method",
        "mcp-name",
        "mcp-session-id",
      ]) {
        expect(allows, `${origin} ${h}`).toContain(h);
      }

      const ctxPost = createExecutionContext();
      const post = await worker.fetch(
        new Request(SECRET_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: JSON.stringify(rpc("ping")),
        }),
        envAvec(),
        ctxPost,
      );
      await waitOnExecutionContext(ctxPost);
      expect(post.status, origin).toBe(200);
      expect(post.headers.get("Access-Control-Allow-Origin"), origin).toBe(origin);
    }
  });
});

describe("SEP-2127 — fiche de découverte /mcp/server-card", () => {
  it("GET /mcp/server-card rend 200 en application/mcp-server-card+json, dérivé sans secret", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://jurisprudence.poirierlavoie.ca/mcp/server-card", {
        headers: { Origin: "https://exemple.invalide" },
      }),
      envAvec(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/mcp-server-card+json; charset=utf-8");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const cc = res.headers.get("Cache-Control") ?? "";
    expect(cc).toContain("max-age=600");
    expect(cc).not.toContain("s-maxage");

    const brut = await res.text();
    expect(brut).not.toContain(SECRET);
    expect(brut).not.toContain(SECRET_ATHENA);
    expect(brut).not.toContain("api.canlii.org");
    expect(brut).not.toMatch(/[0-9a-f]{32,}/i);

    const card = JSON.parse(brut) as {
      $schema: string;
      name: string;
      title: string;
      version: string;
      description: string;
      websiteUrl: string;
      remotes: Array<{
        type: string;
        url: string;
        supportedProtocolVersions: string[];
        headers: Array<{ name: string; isRequired: boolean; isSecret: boolean }>;
      }>;
    };
    expect(card.$schema).toBe(
      "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
    );
    expect(card.name).toBe(`ca.poirierlavoie.jurisprudence/${SERVER_INFO.name}`);
    expect(card.title).toBe(SERVER_INFO.title);
    expect(card.version).toBe(SERVER_INFO.version);
    expect(card.description).toBe(PUBLIC_DESCRIPTION);
    expect(card.websiteUrl).toBe("https://jurisprudence.poirierlavoie.ca/");
    expect(card.remotes).toHaveLength(1);
    expect(card.remotes[0]).toMatchObject({
      type: "streamable-http",
      url: "https://jurisprudence.poirierlavoie.ca/mcp",
      supportedProtocolVersions: [...VERSIONS],
    });
    expect(card.remotes[0]!.headers[0]).toMatchObject({
      name: "Authorization",
      isRequired: true,
      isSecret: true,
    });
  });

  it("HEAD et OPTIONS répondent sans corps, POST et DELETE rendent 405", async () => {
    const appel = async (method: string) => {
      const ctx = createExecutionContext();
      const res = await worker.fetch(
        new Request("https://jurisprudence.poirierlavoie.ca/mcp/server-card", { method }),
        envAvec(),
        ctx,
      );
      await waitOnExecutionContext(ctx);
      return res;
    };

    const head = await appel("HEAD");
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Type")).toBe(
      "application/mcp-server-card+json; charset=utf-8",
    );
    expect(await head.text()).toBe("");

    const opt = await appel("OPTIONS");
    expect(opt.status).toBe(204);
    expect(opt.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(opt.headers.get("Access-Control-Allow-Methods")).toContain("GET");

    for (const m of ["POST", "DELETE"]) {
      const r = await appel(m);
      expect(r.status, m).toBe(405);
      expect(r.headers.get("Allow")).toBe("GET, HEAD, OPTIONS");
      expect(r.headers.get("Access-Control-Allow-Origin")).toBe("*");
    }
  });

  it("MCP_ENABLED = « false » coupe aussi /mcp/server-card en 404", async () => {
    const eteint = envAvec({ MCP_ENABLED: "false" });
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://jurisprudence.poirierlavoie.ca/mcp/server-card"),
      eteint,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });
});

describe("§9.3 — limitation de débit", () => {
  const SECRET_URL = `https://x/mcp/${SECRET}`;
  /** Faux limiteur : accepte `n` requêtes puis refuse. */
  const limiteur = (n: number) => {
    let vues = 0;
    return { limit: async () => ({ success: ++vues <= n }) };
  };

  it("répond 429 avec Retry-After sur /mcp/oauth et 404 muet sur /mcp lorsque RL_PRE_AUTH_IP est franchi", async () => {
    const eOAuth = envAvec({ RL_PRE_AUTH_IP: limiteur(0) });
    const ctxOAuth = createExecutionContext();
    const refusOAuth = await worker.fetch(
      new Request("https://x/mcp/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rpc("ping")),
      }),
      eOAuth,
      ctxOAuth,
    );
    await waitOnExecutionContext(ctxOAuth);
    expect(refusOAuth.status).toBe(429);
    expect(refusOAuth.headers.get("Retry-After")).toBe("60");

    const eDirect = envAvec({ RL_PRE_AUTH_IP: limiteur(0) });
    const ctxDirect = createExecutionContext();
    const refusDirect = await worker.fetch(
      new Request("https://x/mcp/inconnu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rpc("ping")),
      }),
      eDirect,
      ctxDirect,
    );
    await waitOnExecutionContext(ctxDirect);
    expect(refusDirect.status).toBe(404);
  });

  it("le PRÉ-VOL n'est JAMAIS limité", async () => {
    // Un 429 sur un pré-vol ne remonte au navigateur que comme un échec CORS
    // opaque : le connecteur casserait sans que le motif soit lisible nulle part.
    const e = envAvec({ RL_PRE_AUTH_IP: limiteur(0) });
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request(SECRET_URL, {
        method: "OPTIONS",
        headers: { Origin: "https://claude.ai", "Access-Control-Request-Method": "POST" },
      }),
      e,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(204);
  });

  it("limite AVANT l'authentification : une rafale mal authentifiée sur /mcp/oauth reçoit 429 avant D1", async () => {
    const e = envAvec({ RL_PRE_AUTH_IP: limiteur(0) });
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/mcp/oauth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer mauvais-jeton",
        },
        body: JSON.stringify(rpc("ping")),
      }),
      e,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(429); // et non 401 : coupé avant toute lecture D1
  });

  it("FAIL OPEN : binding absent ou en panne => la requête passe", async () => {
    // La limitation protège le COÛT, pas l'accès. Échouer fermé sur un compteur
    // indisponible rendrait le connecteur inutilisable pour protéger une facture.
    for (const rl of [
      undefined,
      {
        limit: async () => {
          throw new Error("panne");
        },
      },
    ]) {
      const ctx = createExecutionContext();
      const res = await worker.fetch(
        new Request(SECRET_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rpc("ping")),
        }),
        envAvec({ RL_PRE_AUTH_IP: rl }),
        ctx,
      );
      await waitOnExecutionContext(ctx);
      expect(res.status).toBe(200);
    }
  });
});

describe("§8 — routage", () => {
  it("GET /health répond 200 sans authentification, et ANNONCE son commit", async () => {
    const ctx = createExecutionContext();
    const e = envAvec({ COMMIT: "abc1234" });
    const res = await worker.fetch(new Request("https://x/health"), e, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", commit: "abc1234" });
  });

  it("/health avoue « inconnu » quand le commit n'a pas été posé", async () => {
    // L'aveu vaut mieux que le silence, et bien mieux qu'une valeur plausible : le
    // contrôle de dérive traite « inconnu » comme un REFUS DE CONCLURE, et non comme
    // « à jour ». C'est la règle d'INDÉTERMINÉE de §2 appliquée au déploiement — un
    // déploiement fait hors de `npm run deploy` ne doit pas se faire passer pour une
    // production dont on connaît la version.
    const ctx = createExecutionContext();
    const sansCommit = { ...envAvec(), COMMIT: undefined } as unknown as Env;
    const res = await worker.fetch(new Request("https://x/health"), sansCommit, ctx);
    await waitOnExecutionContext(ctx);
    expect(await res.json()).toEqual({ status: "ok", commit: "inconnu" });
  });

  it("GET et DELETE sur /mcp répondent 405 — aucun flux SSE, aucune session", async () => {
    for (const method of ["GET", "DELETE"]) {
      const res = await appeler(null, { method });
      expect(res.status).toBe(405);
      // OPTIONS figure desormais dans Allow : le pre-vol CORS est servi (claude.ai
      // est un client de NAVIGATEUR). GET et DELETE restent refuses.
      expect(res.headers.get("Allow")).toBe("POST, OPTIONS");
    }
  });

  it("tout le reste répond 404", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/autre"), envAvec(), ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });

  it("MCP_ENABLED = « false » => 404 PARTOUT, /health compris", async () => {
    const eteint = envAvec({ MCP_ENABLED: "false" });
    const ctx = createExecutionContext();
    const sante = await worker.fetch(new Request("https://x/health"), eteint, ctx);
    await waitOnExecutionContext(ctx);
    expect(sante.status).toBe(404);

    const mcp = await appeler(rpc("ping"), { env: eteint });
    expect(mcp.status).toBe(404);
  });
});

describe("§9.1 — authentification (/mcp uniforme en 404 sans WWW-Authenticate, S8, G7, G23)", () => {
  it("secret erroné sur /mcp => 404 à corps vide sans WWW-Authenticate", async () => {
    const res = await appeler(rpc("ping"), { secret: "mauvais-secret" });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
    expect(res.headers.get("WWW-Authenticate")).toBeNull();
  });

  it("secret de longueur différente => 404, sans lever", async () => {
    const res = await appeler(rpc("ping"), { secret: "x" });
    expect(res.status).toBe(404);
  });

  it("/mcp sans secret => 404 (y compris en GET : méthode jugée après l'identité, G23)", async () => {
    const res = await appeler(rpc("ping"), { secret: null });
    expect(res.status).toBe(404);
    const getAnon = await appeler(null, { secret: null, method: "GET" });
    expect(getAnon.status).toBe(404);
  });

  it("accepte le secret par l'en-tête Authorization: Bearer", async () => {
    const res = await appeler(rpc("ping"), {
      secret: null,
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    expect(res.status).toBe(200);
  });

  it("REFUSE TOUT quand aucun secret n'est configuré (défaut fermé)", async () => {
    const sansSecret = {
      ...envAvec(),
      MCP_SHARED_SECRET: undefined,
      MCP_SHARED_SECRET_ATHENA: undefined,
    };
    const res = await appeler(rpc("ping"), { env: sansSecret as Env });
    expect(res.status).toBe(404);
  });

  it("la barre oblique finale ne refuse plus : /mcp/<secret>/ vaut /mcp/<secret>", async () => {
    expect((await appeler(rpc("ping"), { secret: `${SECRET}/` })).status).toBe(200);
    expect((await appeler(rpc("ping"), { secret: `${SECRET}//` })).status).toBe(200);
  });

  it("« /mcp/ » nu se comporte comme « /mcp » : 404 seul, 200 avec un en-tête valide", async () => {
    expect((await appeler(rpc("ping"), { secret: "" })).status).toBe(404);
    const avecEntete = await appeler(rpc("ping"), {
      secret: "",
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    expect(avecEntete.status).toBe(200);
  });

  it("un chemin mal encodé REFUSE en 404 — il ne fait pas sortir le Worker en 500", async () => {
    const res = await appeler(rpc("ping"), { secret: "bogus%FF" });
    expect(res.status).toBe(404);
    expect(res.headers.get("WWW-Authenticate")).toBeNull();
  });

  it("un chemin mal encodé n'empêche pas un en-tête valide d'authentifier", async () => {
    const res = await appeler(rpc("ping"), {
      secret: "bogus%FF",
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    expect(res.status).toBe(200);
  });

  it("un en-tête Bearer résiduel ne masque plus le secret du chemin", async () => {
    const res = await appeler(rpc("ping"), {
      secret: SECRET,
      headers: { Authorization: "Bearer jeton-perime-et-residuel" },
    });
    expect(res.status).toBe(200);
  });

  it("et réciproquement : un chemin erroné ne masque pas un en-tête valide", async () => {
    const res = await appeler(rpc("ping"), {
      secret: "mauvais-secret",
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    expect(res.status).toBe(200);
  });

  it("les deux porteurs se croisent : chemin Athéna + en-tête claude.ai, et l'inverse", async () => {
    const deux = envAvec({ MCP_SHARED_SECRET_ATHENA: SECRET_ATHENA });
    const a = await appeler(rpc("ping"), {
      secret: SECRET_ATHENA,
      headers: { Authorization: `Bearer ${SECRET}` },
      env: deux,
    });
    expect(a.status).toBe(200);
    const b = await appeler(rpc("ping"), {
      secret: SECRET,
      headers: { Authorization: `Bearer ${SECRET_ATHENA}` },
      env: deux,
    });
    expect(b.status).toBe(200);
  });

  it("ÉLARGIR N'EST PAS OUVRIR : deux porteurs faux restent un seul refus", async () => {
    const res = await appeler(rpc("ping"), {
      secret: "mauvais-secret",
      headers: { Authorization: "Bearer mauvais-aussi" },
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("WWW-Authenticate")).toBeNull();
  });

  it("un secret qui se TERMINE par « / » ouvre encore : on essaie, on ne rogne pas", async () => {
    const finitParSlash = "abcdef/";
    const e = envAvec({ MCP_SHARED_SECRET: finitParSlash });
    expect((await appeler(rpc("ping"), { secret: finitParSlash, env: e })).status).toBe(200);
  });

  it("la PROFONDEUR du chemin est conservée : un secret contenant « / » s'authentifie", async () => {
    const avecSlash = "abc/def";
    const e = envAvec({ MCP_SHARED_SECRET: avecSlash });
    expect((await appeler(rpc("ping"), { secret: avecSlash, env: e })).status).toBe(200);
    expect((await appeler(rpc("ping"), { secret: "abc%2Fdef", env: e })).status).toBe(200);
  });

  it("le nom du schéma est insensible à la casse (RFC 7235) : « bearer » authentifie", async () => {
    const res = await appeler(rpc("ping"), {
      secret: null,
      headers: { Authorization: `bearer ${SECRET}` },
    });
    expect(res.status).toBe(200);
  });

  it("un second nom de secret n'ouvre PLUS rien — MCP_SHARED_SECRET_ATHENA est retiré", async () => {
    const avecAncien = envAvec({ MCP_SHARED_SECRET_ATHENA: SECRET_ATHENA });
    const res = await appeler(rpc("ping"), { secret: SECRET_ATHENA, env: avecAncien });
    expect(res.status).toBe(404);
  });

  it("les deux porteurs coexistent : configurer le second n'invalide pas le premier", async () => {
    const deux = envAvec({ MCP_SHARED_SECRET_ATHENA: SECRET_ATHENA });
    const res = await appeler(rpc("ping"), { secret: SECRET, env: deux });
    expect(res.status).toBe(200);
  });

  it("retirer l'unique secret ferme tout — le défaut fermé n'a pas de repli", async () => {
    const sansAucun = envAvec({ MCP_SHARED_SECRET: undefined });
    expect((await appeler(rpc("ping"), { secret: SECRET, env: sansAucun })).status).toBe(404);
    expect(
      (
        await appeler(rpc("ping"), {
          secret: null,
          headers: { Authorization: `Bearer ${SECRET}` },
          env: sansAucun,
        })
      ).status,
    ).toBe(404);
  });

  it("le porteur ?key= est servi — la forme qui survit au formulaire de claude.ai", async () => {
    const res = await appeler(rpc("ping"), { secret: null, query: { key: SECRET } });
    expect(res.status).toBe(200);
  });

  it("deux secrets configurés n'admettent pas pour autant un troisième", async () => {
    const deux = envAvec({ MCP_SHARED_SECRET_ATHENA: SECRET_ATHENA });
    const res = await appeler(rpc("ping"), { secret: "mauvais-secret", env: deux });
    expect(res.status).toBe(404);
    expect(res.headers.get("WWW-Authenticate")).toBeNull();
  });

  it("le secret bon passe", async () => {
    const res = await appeler(rpc("ping"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ jsonrpc: "2.0", id: 1, result: {} });
  });
});

describe("§8 — méthodes JSON-RPC", () => {
  it("initialize négocie la version demandée", async () => {
    const res = await appeler(rpc("initialize", { protocolVersion: "2025-03-26" }));
    const body = (await res.json()) as { result: Record<string, unknown> };
    expect(body.result.protocolVersion).toBe("2025-03-26");
    expect(body.result.serverInfo).toMatchObject({
      name: "mcp-jurisprudence",
      title: "MCP Jurisprudence",
    });
    expect(body.result.capabilities).toEqual({ tools: { listChanged: false } });
  });

  it("initialize rend la plus élevée HÉRITÉE quand la demande est inconnue", async () => {
    // La valeur attendue a changé le 2026-09-17 — la GARANTIE, non. `2025-11-25` a rejoint
    // les versions servies, et c'est désormais la plus élevée des HÉRITÉES.
    //
    // Pourquoi héritée et non `VERSIONS[0]` : celle-ci est maintenant `2026-07-28`, qui a
    // SUPPRIMÉ la poignée. Répondre son nom à un client qui vient d'appeler `initialize`
    // lui annoncerait une ère où sa propre requête n'existe pas.
    const res = await appeler(rpc("initialize", { protocolVersion: "1999-01-01" }));
    const body = (await res.json()) as { result: { protocolVersion: string } };
    expect(body.result.protocolVersion).toBe("2025-11-25");
  });

  it("les instructions d'initialisation portent le contrat de vérité", async () => {
    const res = await appeler(rpc("initialize", {}));
    const body = (await res.json()) as { result: { instructions: string } };
    expect(body.result.instructions).toContain("MÉTADONNÉES");
    expect(body.result.instructions).toContain("autorité actuelle");
  });

  it("une notification répond 202 avec un corps vide", async () => {
    const ctx = createExecutionContext();
    const req = new Request(`https://x/mcp/${SECRET}`, {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    const res = await worker.fetch(req, envAvec(), ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("tools/list rend les dix outils, tous décrits et annotés", async () => {
    const res = await appeler(rpc("tools/list"));
    const body = (await res.json()) as {
      result: {
        tools: Array<{
          name: string;
          description: string;
          inputSchema: Record<string, unknown>;
          annotations: Record<string, boolean>;
        }>;
      };
    };
    const outils = body.result.tools;
    expect(outils).toHaveLength(12);
    for (const t of outils) {
      expect(t.name).not.toMatch(/^(?:jurisprudence|canlii)_/);
      expect(t.description.length).toBeGreaterThan(80);
      // `openWorldHint` n est PAS uniforme : vrai pour les dix outils qui peuvent interroger
      // CanLII, faux pour `parse_citation` et `list_exempt_cases` qui n appellent rien.
      const sansAppel = t.name === "parse_citation" || t.name === "list_exempt_cases";
      expect(t.annotations, t.name).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: !sansAppel,
      });
      // §7, conventions : additionalProperties false sur TOUS les schémas.
      expect(t.inputSchema.additionalProperties).toBe(false);
    }
    expect(outils.map((t) => t.name).sort()).toEqual(
      [
        "browse_cases",
        "browse_legislation",
        "check_exempt_cases",
        "citator",
        "find_case",
        "get_case",
        "get_legislation",
        "list_databases",
        "list_exempt_cases",
        "parse_citation",
        "subsequent_history",
        "verify_citations",
      ].sort(),
    );
  });

  it("tous les outils sont sans préfixe et les outils retirés ou déplacés sont rejetés sans repli", async () => {
    const listRes = await appeler(rpc("tools/list"));
    const listBody = (await listRes.json()) as { result: { tools: Array<{ name: string }> } };
    const noms = listBody.result.tools.map((t) => t.name);
    expect(noms).toHaveLength(12);
    expect(noms.every((n) => !n.startsWith("jurisprudence_") && !n.startsWith("canlii_"))).toBe(
      true,
    );

    for (const retire of [
      "greffe_parse_court_file_number",
      "palais_list",
      "palais_get",
      "jurisprudence_verify_citations",
      "jurisprudence_parse_citation",
      "list_exempt_authorities",
      "check_exempt_authorities",
      "check_exempt_authority",
    ]) {
      const res = await appeler(rpc("tools/call", { name: retire, arguments: {} }));
      const body = (await res.json()) as {
        result: { isError: boolean; content: [{ text: string }] };
      };
      expect(body.result.isError, retire).toBe(true);
      expect(body.result.content[0].text, retire).toContain(`Outil inconnu : « ${retire} ».`);
    }
  });

  it("une méthode inconnue rend -32601", async () => {
    const res = await appeler(rpc("resources/list"));
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32601);
  });

  it("un outil inconnu rend isError, PAS une erreur JSON-RPC", async () => {
    const res = await appeler(
      rpc("tools/call", { name: "jurisprudence_inexistant", arguments: {} }),
    );
    const body = (await res.json()) as {
      result: { isError: boolean; content: [{ text: string }] };
    };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("Outil inconnu");
  });

  it("des arguments invalides rendent isError, PAS une erreur JSON-RPC (§8)", async () => {
    const res = await appeler(
      rpc("tools/call", { name: "parse_citation", arguments: { citation: 42 } }),
    );
    const body = (await res.json()) as {
      result: { isError: boolean; content: [{ text: string }] };
    };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("chaîne de caractères");
  });

  it("un argument non déclaré est refusé (additionalProperties: false)", async () => {
    const res = await appeler(
      rpc("tools/call", {
        name: "parse_citation",
        arguments: { citation: "2020 QCCA 495", inconnu: true },
      }),
    );
    const body = (await res.json()) as {
      result: { isError: boolean; content: [{ text: string }] };
    };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("n'est pas un argument reconnu");
  });

  it("JSON illisible rend -32700", async () => {
    const ctx = createExecutionContext();
    const req = new Request(`https://x/mcp/${SECRET}`, { method: "POST", body: "{pas du json" });
    const res = await worker.fetch(req, envAvec(), ctx);
    await waitOnExecutionContext(ctx);
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32700);
  });

  it("un lot (tableau) est refusé", async () => {
    const res = await appeler([rpc("ping"), rpc("ping", undefined, 2)]);
    const body = (await res.json()) as { error: { code: number; message: string } };
    expect(body.error.code).toBe(-32600);
    expect(body.error.message).toContain("groupées");
  });

  it("une version de protocole inconnue en en-tête rend 400", async () => {
    const res = await appeler(rpc("ping"), { headers: { "MCP-Protocol-Version": "2001-01-01" } });
    expect(res.status).toBe(400);
  });

  it("n'émet PAS structuredContent (symétrie avec qclaw, D4)", async () => {
    const res = await appeler(
      rpc("tools/call", {
        name: "parse_citation",
        arguments: { citation: "2020 QCCA 495" },
      }),
    );
    const body = (await res.json()) as { result: Record<string, unknown> };
    expect(body.result).not.toHaveProperty("structuredContent");
    expect(Object.keys(body.result).sort()).toEqual(["content", "isError"]);
  });
});

describe("parseMessage — validation de forme", () => {
  it("refuse un jsonrpc absent ou faux", () => {
    expect(() => parseMessage('{"method":"ping","id":1}')).toThrow();
    expect(() => parseMessage('{"jsonrpc":"1.0","method":"ping","id":1}')).toThrow();
  });
  it("refuse une méthode vide", () => {
    expect(() => parseMessage('{"jsonrpc":"2.0","method":"","id":1}')).toThrow();
  });
  it("refuse un id objet", () => {
    expect(() => parseMessage('{"jsonrpc":"2.0","method":"ping","id":{}}')).toThrow();
  });
  it("accepte params absent", () => {
    expect(parseMessage('{"jsonrpc":"2.0","method":"ping","id":1}').params).toBeUndefined();
  });
});

describe("validateArgs — port du sous-ensemble d'Athéna", () => {
  const schema: JsonSchema = {
    type: "object",
    properties: {
      titre: { type: "string", minLength: 2, maxLength: 10 },
      n: { type: "integer", minimum: 1, maximum: 5 },
      choix: { type: "string", enum: ["a", "b"] },
      liste: { type: "array", minItems: 1, maxItems: 2, items: { type: "integer", minimum: 0 } },
      drapeau: { type: "boolean" },
    },
    required: ["titre"],
    additionalProperties: false,
  };

  it("accepte un objet conforme", () => {
    expect(
      validateArgs(schema, { titre: "abc", n: 3, choix: "a", liste: [1], drapeau: true }),
    ).toEqual([]);
  });

  it("signale le manquant, l'inconnu, le type, l'enum et les bornes", () => {
    const e = validateArgs(schema, { n: 9, choix: "z", inconnu: 1 });
    expect(e.join(" ")).toContain("« titre » est obligatoire");
    expect(e.join(" ")).toContain("« inconnu » n'est pas un argument reconnu");
    expect(e.join(" ")).toContain("inférieur ou égal à 5");
    expect(e.join(" ")).toContain("l'une de ces valeurs");
  });

  it("compte les caractères NON BLANCS pour minLength", () => {
    expect(validateArgs(schema, { titre: "   " }).join(" ")).toContain("non blancs");
  });

  it("valide les éléments d'un tableau, un niveau", () => {
    expect(validateArgs(schema, { titre: "ab", liste: [1, -3] }).join(" ")).toContain("liste[1]");
    expect(validateArgs(schema, { titre: "ab", liste: [] }).join(" ")).toContain("au moins 1");
    expect(validateArgs(schema, { titre: "ab", liste: [1, 2, 3] }).join(" ")).toContain(
      "au plus 2",
    );
  });

  it("un booléen n'est pas soumis aux bornes numériques", () => {
    expect(validateArgs(schema, { titre: "ab", drapeau: true })).toEqual([]);
    expect(validateArgs(schema, { titre: "ab", n: true }).join(" ")).toContain("entier");
  });
});
