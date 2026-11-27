import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { analyserErreur, createClient, describeError, parseRetryAfter } from "../src/canlii/client";
import {
  CanliiBudgetError,
  CanliiError,
  CanliiTimeoutError,
  redactUrl,
} from "../src/canlii/errors";

const CLEF = "clef-secrete-a-ne-jamais-divulguer-42";

function fakeFetch(reponses: Array<Response | (() => Response | Promise<Response>)>) {
  const vues: string[] = [];
  let i = 0;
  const impl = (async (input: RequestInfo | URL) => {
    vues.push(String(input));
    const r = reponses[Math.min(i, reponses.length - 1)];
    i++;
    if (typeof r === "function") return await r();
    return r!.clone();
  }) as unknown as typeof fetch;
  return { impl, vues, appels: () => i };
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

function client(
  reponses: Array<Response | (() => Response | Promise<Response>)>,
  overrides: Partial<{
    maxCalls: number;
    minIntervalMs: number;
    timeoutMs: number;
    corpsMaxChars: number;
  }> = {},
) {
  const f = fakeFetch(reponses);
  const dormis: number[] = [];
  const c = createClient(
    { ...env, CANLII_API_KEY: CLEF },
    {
      fetchImpl: f.impl,
      sleepImpl: async (ms) => {
        dormis.push(ms);
      },
      jitterImpl: () => 0,
    },
    { minIntervalMs: 0, ...overrides },
  );
  return { c, f, dormis };
}

describe("§5.1 — construction des URL", () => {
  it("cible https://api.canlii.org/v1 et place api_key en dernier", async () => {
    const { c, f } = client([json({ ok: true })]);
    await c.get("caseBrowse/fr/csc-scc/2008scc9/");
    const url = new URL(f.vues[0]!);
    expect(url.origin + url.pathname).toBe(
      "https://api.canlii.org/v1/caseBrowse/fr/csc-scc/2008scc9/",
    );
    expect([...url.searchParams.keys()].at(-1)).toBe("api_key");
  });

  it("transmet les paramètres et ignore les valeurs vides", async () => {
    const { c, f } = client([json({ cases: [] })]);
    await c.get("caseBrowse/fr/qcca/", {
      offset: 0,
      resultCount: 5000,
      decisionDateAfter: "2020-01-01",
      decisionDateBefore: "",
    });
    const url = new URL(f.vues[0]!);
    expect(url.searchParams.get("resultCount")).toBe("5000");
    expect(url.searchParams.get("decisionDateAfter")).toBe("2020-01-01");
    expect(url.searchParams.has("decisionDateBefore")).toBe(false);
  });
});

describe("§5.2 — étranglement, réessais, délais", () => {
  it("réessaie sur 429 et respecte Retry-After, qui PRIME sur la temporisation", async () => {
    const { c, f, dormis } = client([
      () => new Response("throttled", { status: 429, headers: { "Retry-After": "7" } }),
      () => json({ ok: true }),
    ]);
    await expect(c.get("caseBrowse/fr/")).resolves.toEqual({ ok: true });
    expect(f.appels()).toBe(2);
    expect(dormis).toContain(7000);
    expect(c.usage().throttled).toBe(1);
  });

  it("temporise PLUS LONGTEMPS sur 429 que sur 5xx, Retry-After absent", async () => {
    const c429 = client([
      () => new Response("throttled", { status: 429 }),
      () => json({ ok: true }),
    ]);
    await c429.c.get("caseBrowse/fr/");
    const c503 = client([() => new Response("boom", { status: 503 }), () => json({ ok: true })]);
    await c503.c.get("caseBrowse/fr/");
    expect(c429.dormis).toContain(2000);
    expect(c503.dormis).toContain(500);
    expect(Math.max(...c429.dormis)).toBeGreaterThan(Math.max(...c503.dormis));
  });

  it("RALENTIT D'OFFICE le reste de l'invocation après un 429", async () => {
    const { c, dormis } = client(
      [
        () => new Response("throttled", { status: 429 }),
        () => json({ ok: true }),
        () => json({ ok: true }),
      ],
      { minIntervalMs: 600 },
    );
    await c.get("caseBrowse/fr/a");
    const avant = dormis.length;
    await c.get("caseBrowse/fr/b");
    const attentes = dormis.slice(avant);
    expect(attentes.some((ms) => ms > 1000 && ms <= 1200)).toBe(true);
    expect(attentes.every((ms) => ms <= 1200)).toBe(true);
    expect(c.usage().throttled).toBe(1);
  });

  it("l'adaptation est PLAFONNÉE et meurt avec l'invocation", async () => {
    const rafale = Array.from(
      { length: 6 },
      () => () => new Response("throttled", { status: 429 }),
    );
    const { c } = client([...rafale, () => json({ ok: true })], {
      minIntervalMs: 600,
      maxCalls: 40,
    });
    await expect(c.get("caseBrowse/fr/a")).rejects.toThrow();
    await expect(c.get("caseBrowse/fr/b")).rejects.toThrow();
    expect(c.usage().throttled).toBe(6);

    const neuf = client([() => json({ ok: true }), () => json({ ok: true })], {
      minIntervalMs: 600,
    });
    await neuf.c.get("caseBrowse/fr/a");
    await neuf.c.get("caseBrowse/fr/b");
    expect(neuf.dormis.some((ms) => ms > 400 && ms <= 600)).toBe(true);
    expect(neuf.dormis.every((ms) => ms <= 600)).toBe(true);
  });

  it("Retry-After PRIME encore sur la base allongée du 429", async () => {
    const { c, dormis } = client([
      () => new Response("t", { status: 429, headers: { "Retry-After": "3" } }),
      () => json({ ok: true }),
    ]);
    await c.get("caseBrowse/fr/");
    expect(dormis).toContain(3000);
    expect(dormis).not.toContain(2000);
  });

  it("temporise en exponentielle quand Retry-After est absent", async () => {
    const { c, dormis } = client([
      () => new Response("boom", { status: 503 }),
      () => new Response("boom", { status: 503 }),
      () => json({ ok: true }),
    ]);
    await c.get("caseBrowse/fr/");
    expect(dormis).toEqual([500, 1000]);
  });

  it("ne réessaie PAS sur 400/401/403/404", async () => {
    for (const status of [400, 401, 403, 404]) {
      const { c, f } = client([() => new Response("non", { status })]);
      await expect(c.get("caseBrowse/fr/x/y/")).rejects.toBeInstanceOf(CanliiError);
      expect(f.appels()).toBe(1);
    }
  });

  it("abandonne après trois tentatives", async () => {
    const { c, f } = client([() => new Response("boom", { status: 500 })]);
    await expect(c.get("caseBrowse/fr/")).rejects.toBeInstanceOf(CanliiError);
    expect(f.appels()).toBe(3);
  });

  it("traduit une expiration de délai", async () => {
    const { c } = client([
      () => {
        const e = new Error("timed out");
        e.name = "TimeoutError";
        throw e;
      },
    ]);
    await expect(c.get("caseBrowse/fr/")).rejects.toBeInstanceOf(CanliiTimeoutError);
  });

  it("plafonne les appels et lève CanliiBudgetError", async () => {
    const { c, f } = client([json({ ok: true })], { maxCalls: 2 });
    await c.get("caseBrowse/fr/");
    await c.get("caseBrowse/fr/");
    await expect(c.get("caseBrowse/fr/")).rejects.toBeInstanceOf(CanliiBudgetError);
    expect(f.appels()).toBe(2);
    expect(c.remaining()).toBe(0);
  });

  it("respecte l'intervalle minimal entre deux appels", async () => {
    const { c, dormis } = client([json({ ok: true })], { minIntervalMs: 250 });
    await c.get("caseBrowse/fr/");
    await c.get("caseBrowse/fr/");
    expect(dormis.some((ms) => ms > 0 && ms <= 250)).toBe(true);
  });
});

describe("§5.2 — charge utile TOO_LONG", () => {
  it("halve resultCount et réessaie UNE FOIS", async () => {
    let vu = 0;
    const { c, f } = client([
      () => {
        vu++;
        return json({ error: "TOO_LONG", message: "payload too large" });
      },
      () => json({ cases: [{ title: "ok" }] }),
    ]);
    const r = await c.get<{ cases: unknown[] }>("caseBrowse/fr/qccq/", {
      offset: 0,
      resultCount: 5000,
    });
    expect(r.cases).toHaveLength(1);
    expect(vu).toBe(1);
    expect(new URL(f.vues[1]!).searchParams.get("resultCount")).toBe("2500");
  });

  it("laisse remonter si TOO_LONG persiste après réduction", async () => {
    const { c } = client([() => json({ error: "TOO_LONG" })]);
    await expect(
      c.get("caseBrowse/fr/qccq/", { offset: 0, resultCount: 5000 }),
    ).rejects.toMatchObject({ code: "TOO_LONG" });
  });

  it("détecte un corps d'erreur applicatif rendu avec un statut 200", async () => {
    const { c } = client([() => json({ error: "TOO_LONG" })]);
    const e = (await c.get("caseBrowse/fr/").catch((x) => x)) as CanliiError;
    expect(e).toBeInstanceOf(CanliiError);
    expect(e.code).toBe("TOO_LONG");
    expect(describeError(e)).not.toMatch(/erreur 2dd/);
    expect(describeError(e)).toContain("TOO_LONG");
  });

  it("un 200 au corps non-JSON ne se rend JAMAIS en « erreur 200 »", async () => {
    const { c } = client([
      () =>
        new Response("<html><body>502 Bad Gateway</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
    ]);
    const e = (await c.get("legislationBrowse/fr/qcs/").catch((x) => x)) as CanliiError;
    expect(e.code).toBe("REPONSE_ILLISIBLE");
    const d = analyserErreur(e);
    expect(d.cause).toBe("REPONSE_INEXPLOITABLE");
    expect(d.phrase).not.toMatch(/erreur 2dd/);
    expect(d.phrase).toContain("n'a pas pu être LUE");
    expect(d.cause).not.toBe("INTROUVABLE_404");
  });

  it("AUCUNE combinaison statut 2xx × code ne se rend en « erreur 2xx »", () => {
    const codes = [
      null,
      "",
      "TOO_LONG",
      "REPONSE_ILLISIBLE",
      "CORPS_INTERROMPU",
      "CORPS_HORS_PLAFOND",
      "MACHIN_INCONNU",
      "pas un jeton !",
    ];
    for (let statut = 200; statut < 300; statut++) {
      for (const code of codes) {
        const d = analyserErreur(new CanliiError(statut, "https://exemple.invalid/x", "", code));
        const ou = `${statut}/${code}`;
        expect(d.phrase, ou).not.toMatch(/erreur 2dd/);
        expect(d.cause, ou).not.toBe("PANNE_AMONT");
        expect(d.cause, ou).not.toBe("INTROUVABLE_404");
        expect(d.phrase.length, ou).toBeGreaterThan(30);
      }
    }
  });

  it("un code applicatif qui n'a pas la forme d'un jeton n'est pas RÉÉMIS", () => {
    const d = analyserErreur(
      new CanliiError(200, "https://exemple.invalid/x", "", "<script>alert(1)</script>"),
    );
    expect(d.phrase).not.toContain("script");
    expect(d.phrase).toContain("ne sait pas nommer");
  });

  it("un statut 0 dit qu'AUCUNE réponse n'a été obtenue", () => {
    const d = analyserErreur(new CanliiError(0, "https://exemple.invalid/x", "échec inconnu"));
    expect(d.phrase).not.toContain("erreur 0");
    expect(d.phrase).toContain("Aucune réponse de CanLII");
  });
});

describe("§5.2 — le corps d'une réponse valide est lu ENTIER", () => {
  it("un corps bien au-delà de 100 000 caractères s'analyse, queue comprise", async () => {
    const grosse = {
      legislations: Array.from({ length: 4000 }, (_, i) => ({
        databaseId: "qcs",
        legislationId: `rlrq-c-x-${i}`,
        title: `Loi numéro ${i} sur quelque chose d'assez long pour peser son poids`,
        citation: `RLRQ c X-${i}`,
        type: "STATUTE",
      })),
    };
    expect(JSON.stringify(grosse).length).toBeGreaterThan(100_000);
    const { c } = client([() => json(grosse)]);
    const r = await c.get<typeof grosse>("legislationBrowse/fr/qcs/");
    expect(r.legislations).toHaveLength(4000);
    expect(r.legislations.at(-1)!.legislationId).toBe("rlrq-c-x-3999");
  });

  it("une page de balayage de 5 000 fiches passe entière (findCase, PAGE)", async () => {
    const cases = Array.from({ length: 5000 }, (_, i) => ({
      databaseId: "qccs",
      caseId: { fr: `2024qccs${i}` },
      title: `Untel c. Autrui ${i}`,
      citation: `2024 QCCS ${i}`,
    }));
    const { c } = client([() => json({ cases })]);
    const r = await c.get<{ cases: unknown[] }>("caseBrowse/fr/qccs/", {
      offset: 0,
      resultCount: 5000,
    });
    expect(r.cases).toHaveLength(5000);
  });

  it("au-delà du plafond du connecteur, le corps est REFUSÉ en entier, jamais tronqué", async () => {
    const { c } = client([() => json({ cases: [{ title: "assez long pour dépasser" }] })], {
      corpsMaxChars: 20,
    });
    const e = (await c.get("caseBrowse/fr/qcca/").catch((x) => x)) as CanliiError;
    expect(e).toBeInstanceOf(CanliiError);
    expect(e.code).toBe("CORPS_HORS_PLAFOND");
  });

  it("le plafond du connecteur déclenche le MÊME rattrapage que TOO_LONG", async () => {
    let vu = 0;
    const { c, f } = client(
      [
        () => {
          vu++;
          return json({ cases: Array.from({ length: 50 }, (_, i) => ({ title: `d ${i}` })) });
        },
        () => json({ cases: [{ title: "ok" }] }),
      ],
      { corpsMaxChars: 200 },
    );
    const r = await c.get<{ cases: unknown[] }>("caseBrowse/fr/qccq/", {
      offset: 0,
      resultCount: 5000,
    });
    expect(vu).toBe(1);
    expect(new URL(f.vues[1]!).searchParams.get("resultCount")).toBe("2500");
    expect(r.cases).toHaveLength(1);
  });

  it("une lecture INTERROMPUE se nomme, au lieu de passer pour un corps vide", async () => {
    const { c } = client([
      () =>
        new Response(
          new ReadableStream({
            start(ctl) {
              ctl.error(new Error("flux rompu"));
            },
          }),
          { status: 200 },
        ),
    ]);
    const e = (await c.get("caseBrowse/fr/qcca/").catch((x) => x)) as CanliiError;
    expect(e).toBeInstanceOf(CanliiError);
    expect(e.code).toBe("CORPS_INTERROMPU");
  });

  it("LE PENDANT : le corps d'une ERREUR reste borné pour le diagnostic (§5.3)", async () => {
    const { c } = client([() => new Response("E".repeat(5000), { status: 403 })]);
    const e = (await c.get("caseBrowse/fr/x/").catch((x) => x)) as CanliiError;
    expect(e.body).toContain("(tronqué)");
    expect(e.body.length).toBeLessThan(600);
  });
});

describe("Retry-After", () => {
  it("lit un nombre de secondes", () => {
    expect(parseRetryAfter("12")).toBe(12000);
  });
  it("lit une date HTTP", () => {
    const now = Date.parse("2026-07-23T12:00:00Z");
    expect(parseRetryAfter("Thu, 23 Jul 2026 12:00:30 GMT", now)).toBe(30000);
  });
  it("rend null sur en-tête absent ou illisible", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("bientôt")).toBeNull();
  });
});

describe("§5.3 — LA CLEF NE QUITTE JAMAIS LE PROCESSUS", () => {
  it("redactUrl remplace api_key par ***", () => {
    const r = redactUrl(`https://api.canlii.org/v1/caseBrowse/fr/?offset=0&api_key=${CLEF}`);
    expect(r).not.toContain(CLEF);
    expect(r).toContain("api_key=***");
  });

  it("redactUrl ne renvoie jamais une chaîne illisible telle quelle", () => {
    expect(redactUrl(`pas-une-url?api_key=${CLEF}`)).not.toContain(CLEF);
  });

  it("aucune surface d'une erreur CanliiError ne porte la clef", async () => {
    const { c } = client([() => new Response(`refusé pour ${CLEF}`, { status: 403 })]);
    const err = (await c.get("caseBrowse/fr/").catch((e) => e)) as CanliiError;
    expect(err).toBeInstanceOf(CanliiError);
    expect(err.message).not.toContain(CLEF);
    expect(err.url).not.toContain(CLEF);
    expect(String(err.stack ?? "")).not.toContain(CLEF);
    expect(JSON.stringify({ m: err.message, u: err.url })).not.toContain(CLEF);
  });

  it("une erreur d'expiration ne porte pas la clef", async () => {
    const { c } = client([
      () => {
        const e = new Error("timed out");
        e.name = "TimeoutError";
        throw e;
      },
    ]);
    const err = (await c.get("caseBrowse/fr/").catch((e) => e)) as CanliiTimeoutError;
    expect(err.message).not.toContain(CLEF);
    expect(err.url).not.toContain(CLEF);
  });

  it("describeError rend du français sans clef ni URL d'api.canlii.org", () => {
    const messages = [
      describeError(new CanliiBudgetError(40, 40)),
      describeError(new CanliiError(403, `https://api.canlii.org/v1/x?api_key=${CLEF}`, "non")),
      describeError(new CanliiError(429, "https://api.canlii.org/v1/x", "non")),
      describeError(new CanliiTimeoutError(`https://api.canlii.org/v1/x?api_key=${CLEF}`, 15000)),
      describeError(new Error("autre")),
      describeError(
        new CanliiError(
          200,
          `https://api.canlii.org/v1/x?api_key=${CLEF}`,
          "",
          "REPONSE_ILLISIBLE",
        ),
      ),
      describeError(
        new CanliiError(
          200,
          `https://api.canlii.org/v1/x?api_key=${CLEF}`,
          "",
          "CORPS_HORS_PLAFOND",
        ),
      ),
      describeError(
        new CanliiError(200, `https://api.canlii.org/v1/x?api_key=${CLEF}`, "", "CORPS_INTERROMPU"),
      ),
      describeError(
        new CanliiError(200, `https://api.canlii.org/v1/x?api_key=${CLEF}`, "", "MACHIN_INCONNU"),
      ),
      describeError(
        new CanliiError(0, `https://api.canlii.org/v1/x?api_key=${CLEF}`, "échec inconnu"),
      ),
    ];
    for (const m of messages) {
      expect(m).not.toContain(CLEF);
      expect(m).not.toContain("api.canlii.org");
    }
  });
});
