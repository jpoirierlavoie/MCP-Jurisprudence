import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import {
  empreinte,
  frapperJeton,
  jourUtc,
  queueJeton,
  scellerCoffre,
} from "@poirierlavoie/mcp-socle";
import { beforeEach, describe, expect, it } from "vitest";
import worker, { reinitialiserQuarantaineIpPourTests } from "../src/index";
import dunsmuir from "./fixtures/dunsmuir.json";
import { resetDb, seedDatabases } from "./helpers";

const HERITEE = "2025-06-18";
const MAITRE_COFFRE = "maitre-coffre-test-phase3-32-caracteres-minimum";

let compteurMembre = 50000;

function envTest(over: Record<string, unknown> = {}): Env {
  return {
    ...env,
    MCP_ENABLED: "true",
    MCP_SHARED_SECRET: "secret-transitoire-phase3a",
    CANLII_API_KEY: "clef-globale-transitoire-ne-jamais-utiliser-pour-titulaire",
    CANLII_MIN_INTERVAL_MS: "0",
    COFFRE_MAITRE_V1: MAITRE_COFFRE,
    ...over,
  } as unknown as Env;
}

async function insererTitulaireEtJeton(opts: {
  id: string;
  courriel: string;
  etat?: "en_attente" | "actif" | "surveille" | "limite" | "suspendu" | "revoque" | "refuse";
  portee?: "les_deux" | "legislation" | "jurisprudence";
  clefCanlii?: string | null;
  etatClef?: "valide" | "refusee" | "inconnue";
  corrompreChiffre?: boolean;
  expireLe?: string | null;
}): Promise<string> {
  const maintenant = "2026-11-18T12:00:00.000Z";
  compteurMembre += 1;
  const jetonClair = frapperJeton();
  const hashHex = await empreinte(jetonClair);
  const queue = queueJeton(jetonClair);

  await env.DB_IDENTITE.prepare(
    `INSERT INTO titulaire (
       id, cree_le, etat, nom, numero_membre, section, courriel,
       attestation_le, attestation_ver, cgu_ver, hybride_permis
     ) VALUES (?1, ?2, ?3, 'Me Juris', ?4, 'Québec', ?5, ?2, 'v1', 'v1', 1)`,
  )
    .bind(opts.id, maintenant, opts.etat ?? "actif", `77${compteurMembre}-1`, opts.courriel)
    .run();

  await env.DB_IDENTITE.prepare(
    `INSERT INTO jeton (
       id, titulaire_id, empreinte, queue, libelle, portee, emis_le, expire_le
     ) VALUES (?1, ?2, ?3, ?4, 'poste', ?5, ?6, ?7)`,
  )
    .bind(
      `jet_${opts.id}`,
      opts.id,
      hashHex,
      queue,
      opts.portee ?? "les_deux",
      maintenant,
      opts.expireLe === undefined ? "2099-01-01T00:00:00.000Z" : opts.expireLe,
    )
    .run();

  if (opts.clefCanlii) {
    const scelle = await scellerCoffre(opts.clefCanlii, {
      titulaireId: opts.id,
      usage: "canlii",
      version: 1,
      maitre: MAITRE_COFFRE,
    });
    const chiffre = opts.corrompreChiffre
      ? new Uint8Array(scelle.chiffre.map((b) => b ^ 0xff))
      : scelle.chiffre;
    await env.DB_IDENTITE.prepare(
      `INSERT INTO coffre_clef (
         titulaire_id, usage, version, iv, chiffre, repere, empreinte_clef, pose_le, etat
       ) VALUES (?1, 'canlii', ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
      .bind(
        opts.id,
        scelle.version,
        scelle.iv,
        chiffre,
        scelle.repere,
        scelle.empreinteClef,
        maintenant,
        opts.etatClef ?? "valide",
      )
      .run();
  }

  return jetonClair;
}

async function amorcerDunsmuirEnCache(fetchedAt = "2026-07-23T14:35:59.987Z"): Promise<void> {
  await seedDatabases();
  await env.DB.prepare(
    `INSERT INTO cases (
       database_id, case_id, lang, title, title_norm, citation, neutral_cite,
       docket_number, decision_date, keywords, url, concatenated_id, source, fetched_at
     ) VALUES (
       'csc-scc', '2008csc9', 'fr',
       'Dunsmuir c. Nouveau-Brunswick', 'dunsmuir c nouveau brunswick',
       '2008 CSC 9 (CanLII)', '2008 CSC 9',
       '31459', '2008-03-07', 'contrôle judiciaire',
       'https://canlii.ca/t/1vxsm', '2008csc9', 'lookup', ?1
     )`,
  )
    .bind(fetchedAt)
    .run();
  await env.DB.prepare("INSERT INTO cases_fts(cases_fts) VALUES('rebuild')").run();
}

async function postMcp(
  chemin: string,
  jeton: string | null,
  body: unknown,
  opts: {
    headers?: Record<string, string>;
    env?: Env;
  } = {},
): Promise<Response> {
  const ctx = createExecutionContext();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "MCP-Protocol-Version": HERITEE,
    ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    ...(opts.headers ?? {}),
  };
  const res = await worker.fetch(
    new Request(`https://jurisprudence.poirierlavoie.ca${chemin}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    opts.env ?? envTest(),
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

describe("Phase 3 — DB_IDENTITE, double montage, BYOK strict CanLII et cache partagé", () => {
  beforeEach(async () => {
    reinitialiserQuarantaineIpPourTests();
    await resetDb();
    await env.DB_IDENTITE.exec(
      "DELETE FROM evenement_technique;\nDELETE FROM compteur_jour;\nDELETE FROM coffre_clef;\nDELETE FROM jeton;\nDELETE FROM titulaire;",
    );
  });

  it("expose /mcp (refus 404 uniforme), /mcp/oauth (Bearer seul, 401 RFC 9728, CORS X-Clef-CanLII) et /.well-known/oauth-protected-resource/mcp/oauth", async () => {
    // Racine /.well-known/oauth-protected-resource = 404.
    const ctxRoot = createExecutionContext();
    const resRoot = await worker.fetch(
      new Request("https://jurisprudence.poirierlavoie.ca/.well-known/oauth-protected-resource"),
      envTest(),
      ctxRoot,
    );
    await waitOnExecutionContext(ctxRoot);
    expect(resRoot.status).toBe(404);

    // Sous-chemin RFC 9728 = 200 (et 404 si MCP_ENABLED=false, G22).
    const ctxMeta = createExecutionContext();
    const resMeta = await worker.fetch(
      new Request(
        "https://jurisprudence.poirierlavoie.ca/.well-known/oauth-protected-resource/mcp/oauth",
      ),
      envTest(),
      ctxMeta,
    );
    await waitOnExecutionContext(ctxMeta);
    expect(resMeta.status).toBe(200);
    expect(await resMeta.json()).toMatchObject({
      resource: "https://jurisprudence.poirierlavoie.ca/mcp/oauth",
      authorization_servers: ["https://acces.poirierlavoie.ca"],
      scopes_supported: ["les_deux", "jurisprudence"],
      bearer_methods_supported: ["header"],
    });

    const ctxMetaOff = createExecutionContext();
    const resMetaOff = await worker.fetch(
      new Request(
        "https://jurisprudence.poirierlavoie.ca/.well-known/oauth-protected-resource/mcp/oauth",
      ),
      envTest({ MCP_ENABLED: "false" }),
      ctxMetaOff,
    );
    await waitOnExecutionContext(ctxMetaOff);
    expect(resMetaOff.status).toBe(404);

    // Pré-vol CORS sur /mcp et /mcp/oauth autorise X-Clef-CanLII.
    for (const chemin of ["/mcp", "/mcp/oauth"]) {
      const ctxOpt = createExecutionContext();
      const opt = await worker.fetch(
        new Request(`https://jurisprudence.poirierlavoie.ca${chemin}`, {
          method: "OPTIONS",
          headers: {
            Origin: "https://claude.ai",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization, x-clef-canlii",
          },
        }),
        envTest(),
        ctxOpt,
      );
      await waitOnExecutionContext(ctxOpt);
      expect(opt.status, chemin).toBe(204);
      expect(
        (opt.headers.get("Access-Control-Allow-Headers") ?? "").toLowerCase(),
        chemin,
      ).toContain("x-clef-canlii");
    }

    const jetonJuris = await insererTitulaireEtJeton({
      id: "tit_juris",
      courriel: "juris@exemple.qc.ca",
      portee: "jurisprudence",
    });
    const jetonLoisSeul = await insererTitulaireEtJeton({
      id: "tit_lois_seul",
      courriel: "lois@exemple.qc.ca",
      portee: "legislation",
    });

    // Jeton portée `legislation` refusé sur `jurisprudence` (404 vide sur /mcp, 401 RFC 9728 sur /mcp/oauth).
    const rHorsPorteeMcp = await postMcp("/mcp", jetonLoisSeul, {
      jsonrpc: "2.0",
      id: 1,
      method: "ping",
    });
    expect(rHorsPorteeMcp.status).toBe(404);
    expect(await rHorsPorteeMcp.text()).toBe("");

    const rHorsPorteeOAuth = await postMcp("/mcp/oauth", jetonLoisSeul, {
      jsonrpc: "2.0",
      id: 1,
      method: "ping",
    });
    expect(rHorsPorteeOAuth.status).toBe(401);
    expect(rHorsPorteeOAuth.headers.get("WWW-Authenticate")).toContain(
      'resource_metadata="https://jurisprudence.poirierlavoie.ca/.well-known/oauth-protected-resource/mcp/oauth"',
    );

    // /mcp/oauth refuse ?key=, /mcp/oauth/<jeton> et le secret partagé Worker, mais accepte Bearer D1.
    expect(
      (
        await postMcp(`/mcp/oauth?key=${jetonJuris}`, null, {
          jsonrpc: "2.0",
          id: 1,
          method: "ping",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await postMcp(`/mcp/oauth/${jetonJuris}`, jetonJuris, {
          jsonrpc: "2.0",
          id: 1,
          method: "ping",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await postMcp("/mcp/oauth", "secret-transitoire-phase3a", {
          jsonrpc: "2.0",
          id: 1,
          method: "ping",
        })
      ).status,
    ).toBe(401);

    // Méthode GET sur /mcp/oauth : 401 sans porteur, 405 avec porteur valide (G23).
    const ctxGetAnon = createExecutionContext();
    expect(
      (
        await worker.fetch(
          new Request("https://jurisprudence.poirierlavoie.ca/mcp/oauth", { method: "GET" }),
          envTest(),
          ctxGetAnon,
        )
      ).status,
    ).toBe(401);
    await waitOnExecutionContext(ctxGetAnon);

    const ctxGetAuth = createExecutionContext();
    expect(
      (
        await worker.fetch(
          new Request("https://jurisprudence.poirierlavoie.ca/mcp/oauth", {
            method: "GET",
            headers: { Authorization: `Bearer ${jetonJuris}` },
          }),
          envTest(),
          ctxGetAuth,
        )
      ).status,
    ).toBe(405);
    await waitOnExecutionContext(ctxGetAuth);

    expect(
      (await postMcp("/mcp/oauth", jetonJuris, { jsonrpc: "2.0", id: 1, method: "ping" })).status,
    ).toBe(200);
  });

  it("impose la garde BYOK stricte AVANT toute lecture du cache D1 et interdit toute retombée sur env.CANLII_API_KEY (G8, G10)", async () => {
    await amorcerDunsmuirEnCache();

    const jetonSansClef = await insererTitulaireEtJeton({
      id: "tit_sans_clef",
      courriel: "sansclef@exemple.qc.ca",
      clefCanlii: null,
    });
    const jetonClefRefusee = await insererTitulaireEtJeton({
      id: "tit_clef_refusee",
      courriel: "refusee@exemple.qc.ca",
      clefCanlii: "clef-deja-refusee-1234567890",
      etatClef: "refusee",
    });
    const jetonChiffreCorrompu = await insererTitulaireEtJeton({
      id: "tit_corrompu",
      courriel: "corrompu@exemple.qc.ca",
      clefCanlii: "clef-corrompue-1234567890",
      corrompreChiffre: true,
    });
    const jetonValide = await insererTitulaireEtJeton({
      id: "tit_avec_clef",
      courriel: "avecclef@exemple.qc.ca",
      clefCanlii: "clef-personnelle-valide-coffre-999",
    });

    // 1. MÊME avec env.CANLII_API_KEY présente et Dunsmuir déjà en cache D1, un titulaire sans clé
    //    reçoit [CLEF_ABSENTE] sur les outils CanLII et ne lit JAMAIS la fiche en cache.
    for (const [outil, args] of [
      ["get_case", { citation: "2008 CSC 9" }],
      ["verify_citations", { citations: [{ citation: "2008 CSC 9" }] }],
      ["find_case", { title: "Dunsmuir", live: false }],
    ] as const) {
      const res = await postMcp("/mcp", jetonSansClef, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: outil, arguments: args },
      });
      expect(res.status, outil).toBe(200);
      const corps = (await res.json()) as {
        result: { isError: boolean; content: Array<{ text: string }> };
      };
      expect(corps.result.isError, outil).toBe(true);
      expect(corps.result.content[0]?.text, outil).toContain("[CLEF_ABSENTE]");
      expect(corps.result.content[0]?.text, outil).toContain("https://acces.poirierlavoie.ca/moi");
      expect(corps.result.content[0]?.text, outil).not.toContain("Dunsmuir");
    }

    // En revanche `parse_citation` (purement hors ligne) reste accessible sans clé CanLII.
    const resParse = await postMcp("/mcp", jetonSansClef, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "parse_citation", arguments: { citation: "2008 CSC 9" } },
    });
    const corpsParse = (await resParse.json()) as {
      result: { isError?: boolean; content: Array<{ text: string }> };
    };
    expect(corpsParse.result.isError).toBe(false);
    expect(corpsParse.result.content[0]?.text).toContain("csc-scc");

    // 2. Clé marquée `refusee` ou chiffré altéré => [CLEF_REFUSEE], aucun accès au cache.
    for (const jeton of [jetonClefRefusee, jetonChiffreCorrompu]) {
      const res = await postMcp("/mcp", jeton, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "get_case", arguments: { citation: "2008 CSC 9" } },
      });
      const corps = (await res.json()) as {
        result: { isError: boolean; content: Array<{ text: string }> };
      };
      expect(corps.result.isError).toBe(true);
      expect(corps.result.content[0]?.text).toContain("[CLEF_REFUSEE]");
      expect(corps.result.content[0]?.text).not.toContain("Dunsmuir");
    }

    // 3. Avec une clé valide au coffre, le cache est lu en classe `local`, et un manqué de cache
    //    emploie EXCLUSIVEMENT la clé personnelle du coffre (jamais env.CANLII_API_KEY).
    const urlsAppelees: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      urlsAppelees.push(String(input));
      return new Response(JSON.stringify(dunsmuir), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      // Succès 100 % cache -> 0 appel réseau, classe `local`.
      const resCache = await postMcp("/mcp", jetonValide, {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "get_case", arguments: { citation: "2008 CSC 9" } },
      });
      const corpsCache = (await resCache.json()) as {
        result: { isError?: boolean; content: Array<{ text: string }> };
      };
      expect(corpsCache.result.isError).toBe(false);
      expect(corpsCache.result.content[0]?.text).toContain("Dunsmuir");
      expect(urlsAppelees).toHaveLength(0);

      // `refresh: true` -> appel sortant portant la clé du coffre et non env.CANLII_API_KEY.
      const resVif = await postMcp("/mcp", jetonValide, {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "get_case", arguments: { citation: "2008 CSC 9", refresh: true } },
      });
      expect(resVif.status).toBe(200);
      expect(urlsAppelees).toHaveLength(1);
      expect(urlsAppelees[0]).toContain("api_key=clef-personnelle-valide-coffre-999");
      expect(urlsAppelees[0]).not.toContain("clef-globale-transitoire");
    } finally {
      globalThis.fetch = originalFetch;
    }

    const { results: compteurs } = await env.DB_IDENTITE.prepare(
      "SELECT classe, appels, sortants FROM compteur_jour WHERE titulaire_id = 'tit_avec_clef' AND jour = ?1 ORDER BY classe",
    )
      .bind(jourUtc())
      .all<{ classe: string; appels: number; sortants: number }>();
    expect(compteurs).toEqual([
      { classe: "local", appels: 1, sortants: 0 },
      { classe: "sortant", appels: 1, sortants: 1 },
    ]);
  });

  it("bascule coffre_clef.etat à 'refusee' sur 401/403 amont (clé du coffre), sans jamais altérer le coffre si X-Clef-CanLII échoue", async () => {
    await amorcerDunsmuirEnCache();
    const jeton = await insererTitulaireEtJeton({
      id: "tit_revoc_dyn",
      courriel: "revoc@exemple.qc.ca",
      clefCanlii: "clef-coffre-initialement-valide-1234",
    });

    const originalFetch = globalThis.fetch;
    let derniereUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      derniereUrl = String(input);
      return new Response("Unauthorized", { status: 401 });
    }) as typeof fetch;

    try {
      // 1. Surcharge `X-Clef-CanLII` refusée en 401 : renvoie [CLEF_REFUSEE], mais NE modifie PAS `coffre_clef.etat`.
      const resEntete = await postMcp(
        "/mcp",
        jeton,
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "verify_citations",
            arguments: { citations: [{ citation: "2008 CSC 9" }], refresh: true },
          },
        },
        { headers: { "X-Clef-CanLII": "clef-entete-invalide-999" } },
      );
      const corpsEntete = (await resEntete.json()) as {
        result: { isError: boolean; content: Array<{ text: string }> };
      };
      expect(derniereUrl).toContain("api_key=clef-entete-invalide-999");
      expect(corpsEntete.result.isError).toBe(true);
      expect(corpsEntete.result.content[0]?.text).toContain("[CLEF_REFUSEE]");
      expect(corpsEntete.result.content[0]?.text).toContain("X-Clef-CanLII");

      const etatApresEntete = await env.DB_IDENTITE.prepare(
        "SELECT etat FROM coffre_clef WHERE titulaire_id = 'tit_revoc_dyn' AND usage = 'canlii'",
      ).first<{ etat: string }>();
      expect(etatApresEntete?.etat).toBe("valide");

      // 2. Appel avec la clé du coffre refusée en 401 par CanLII : marque `coffre_clef.etat = 'refusee'`.
      const resCoffre = await postMcp("/mcp", jeton, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "verify_citations",
          arguments: { citations: [{ citation: "2008 CSC 9" }], refresh: true },
        },
      });
      const corpsCoffre = (await resCoffre.json()) as {
        result: { isError: boolean; content: Array<{ text: string }> };
      };
      expect(derniereUrl).toContain("api_key=clef-coffre-initialement-valide-1234");
      expect(corpsCoffre.result.isError).toBe(true);
      expect(corpsCoffre.result.content[0]?.text).toContain("[CLEF_REFUSEE]");
      expect(corpsCoffre.result.content[0]?.text).toContain("https://acces.poirierlavoie.ca/moi");

      const etatApresCoffre = await env.DB_IDENTITE.prepare(
        "SELECT etat, eprouve_le FROM coffre_clef WHERE titulaire_id = 'tit_revoc_dyn' AND usage = 'canlii'",
      ).first<{ etat: string; eprouve_le: string | null }>();
      expect(etatApresCoffre?.etat).toBe("refusee");
      expect(etatApresCoffre?.eprouve_le).toBeTruthy();

      // 3. Dès lors, même la lecture du cache Dunsmuir est bloquée par [CLEF_REFUSEE].
      const resCacheBloque = await postMcp("/mcp", jeton, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "get_case", arguments: { citation: "2008 CSC 9" } },
      });
      const corpsBloque = (await resCacheBloque.json()) as {
        result: { isError: boolean; content: Array<{ text: string }> };
      };
      expect(corpsBloque.result.isError).toBe(true);
      expect(corpsBloque.result.content[0]?.text).toContain("[CLEF_REFUSEE]");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("n'expose jamais d'horodatage exact fetched_at dans la prose rendue (G38) et bloque les manqués de cache quand le quota sortant est épuisé tout en servant le cache sous quota local", async () => {
    const horodatageTemoin = "2026-07-23T14:35:59.987Z";
    await amorcerDunsmuirEnCache(horodatageTemoin);
    await env.DB.prepare(
      "INSERT INTO citator_state (database_id, case_id, rel, edge_count, fetched_at) VALUES ('csc-scc', '2008csc9', 'cited', 1, ?1)",
    )
      .bind(horodatageTemoin)
      .run();
    await env.DB.prepare(
      `INSERT INTO citator_edges (
         from_database_id, from_case_id, rel, to_database_id, to_case_id, to_title, to_citation, fetched_at
       ) VALUES ('csc-scc', '2008csc9', 'cited', 'csc-scc', '1979canlii8', 'SCFP c. Société des alcools', '[1979] 2 R.C.S. 227', ?1)`,
    )
      .bind(horodatageTemoin)
      .run();

    const jetonLimite = await insererTitulaireEtJeton({
      id: "tit_quota_mixte",
      courriel: "quota@exemple.qc.ca",
      etat: "limite",
      clefCanlii: "clef-quota-mixte-123456789012",
    });

    // Plafond `sortant` atteint pour l'état `limite` (20/20), tandis que `local` vaut 0/150.
    await env.DB_IDENTITE.prepare(
      `INSERT INTO compteur_jour (titulaire_id, jour, classe, appels, erreurs, introuvables, sortants)
       VALUES ('tit_quota_mixte', ?1, 'sortant', 20, 0, 0, 20)`,
    )
      .bind(jourUtc())
      .run();

    let appelsReseau = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      appelsReseau += 1;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      // 1. Outils servis à 100 % depuis le cache D1 : passent sous quota `local` et ne divulguent jamais `fetched_at` (G38).
      for (const [outil, args] of [
        ["get_case", { citation: "2008 CSC 9" }],
        ["verify_citations", { citations: [{ citation: "2008 CSC 9" }] }],
        ["find_case", { title: "Dunsmuir", live: false }],
        ["citator", { citation: "2008 CSC 9", rel: "cited" }],
      ] as const) {
        const res = await postMcp("/mcp", jetonLimite, {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: outil, arguments: args },
        });
        const corps = (await res.json()) as {
          result: { isError?: boolean; content: Array<{ text: string }> };
        };
        const prose = corps.result.content[0]?.text ?? "";
        expect(corps.result.isError, outil).toBe(false);
        expect(prose, outil).not.toContain(horodatageTemoin);
        expect(prose, outil).not.toContain("14:35:59");
      }
      expect(appelsReseau).toBe(0);

      // 2. Manqué de cache (y compris `find_case` sans `live` explicite quand < 3 fiches locales, lot mixte `verify_citations` et `browse_cases`) : bloqué AVANT tout appel réseau avec [QUOTA_EPUISE] `sortant`.
      for (const [outil, args] of [
        ["get_case", { citation: "2020 QCCA 999999" }],
        [
          "verify_citations",
          {
            citations: [
              { citation: "2008 CSC 9" },
              { citation: "2020 QCCA 999999" },
              { citation: "2021 QCCA 888888" },
            ],
          },
        ],
        ["find_case", { title: "TremblayInconnu" }],
        ["browse_cases", { database_id: "qcca" }],
      ] as const) {
        const res = await postMcp("/mcp", jetonLimite, {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: outil, arguments: args },
        });
        const corps = (await res.json()) as {
          result: { isError: boolean; content: Array<{ text: string }> };
        };
        expect(corps.result.isError, outil).toBe(true);
        expect(corps.result.content[0]?.text, outil).toContain("[QUOTA_EPUISE]");
        expect(corps.result.content[0]?.text, outil).toContain("sortant");
      }
      expect(appelsReseau).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }

    const cptLocal = await env.DB_IDENTITE.prepare(
      "SELECT appels FROM compteur_jour WHERE titulaire_id = 'tit_quota_mixte' AND jour = ?1 AND classe = 'local'",
    )
      .bind(jourUtc())
      .first<{ appels: number }>();
    expect(cptLocal?.appels).toBe(4);
  });

  it("avorte immédiatement un lot verify_citations au 1er 401 amont, borne evenement_technique.outil aux noms fermés, classe lang_swap/list_databases en 'ok' et échoue fermé sur panne DB_IDENTITE", async () => {
    await seedDatabases();
    const jeton = await insererTitulaireEtJeton({
      id: "tit_durcissement",
      courriel: "durcissement@exemple.qc.ca",
      clefCanlii: "clef-durcissement-valide-1234567890",
    });

    // 1. Outil inconnu portant un nom de dossier/parties : jamais recopié dans DB_IDENTITE.evenement_technique.outil (S13/G13).
    const resInconnu = await postMcp("/mcp", jeton, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "Dupont_c_Tremblay_500-17-123456-261", arguments: {} },
    });
    const corpsInconnu = (await resInconnu.json()) as {
      result: { isError: boolean; content: Array<{ text: string }> };
    };
    expect(corpsInconnu.result.isError).toBe(true);
    const evtInconnu = await env.DB_IDENTITE.prepare(
      "SELECT outil, issue, code FROM evenement_technique WHERE titulaire_id = 'tit_durcissement'",
    ).first<{ outil: string; issue: string; code: string | null }>();
    expect(evtInconnu).toEqual({
      outil: "outil_inconnu",
      issue: "erreur_usager",
      code: "OUTIL_INCONNU",
    });

    // 2. Auto-correction `lang_swap` (404 sur 2008csc9 puis 200 sur 2008scc9) + `list_databases` avec hypothèse absente :
    //    tous deux doivent être enregistrés en `issue: "ok"` (`introuvables = 0`).
    await env.DB.prepare("UPDATE databases SET refreshed_at = ?1")
      .bind(new Date().toISOString())
      .run();

    const originalFetch = globalThis.fetch;
    let appelsFetch = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      appelsFetch += 1;
      const u = String(input);
      if (u.includes("/csc-scc/2008scc9")) {
        return new Response("Not Found", { status: 404 });
      }
      return new Response(JSON.stringify(dunsmuir), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const resSwap = await postMcp("/mcp", jeton, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "get_case", arguments: { citation: "2008 CSC 9" } },
      });
      const corpsSwap = (await resSwap.json()) as {
        result: { isError?: boolean; content: Array<{ text: string }> };
      };
      expect(corpsSwap.result.isError).toBe(false);
      expect(appelsFetch).toBe(2);

      const resBases = await postMcp("/mcp", jeton, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "list_databases", arguments: {} },
      });
      const corpsBases = (await resBases.json()) as {
        result: { isError?: boolean; content: Array<{ text: string }> };
      };
      expect(corpsBases.result.isError).toBe(false);
      expect(corpsBases.result.content[0]?.text).toContain("INTROUVABLE sans appel");

      const { results: cpts } = await env.DB_IDENTITE.prepare(
        "SELECT classe, appels, introuvables FROM compteur_jour WHERE titulaire_id = 'tit_durcissement' AND jour = ?1 ORDER BY classe",
      )
        .bind(jourUtc())
        .all<{ classe: string; appels: number; introuvables: number }>();
      expect(cpts).toEqual([
        { classe: "local", appels: 1, introuvables: 0 },
        { classe: "sortant", appels: 1, introuvables: 0 },
      ]);

      // 3. Lot de 3 citations absentes du cache lorsque CanLII renvoie 401 : avorte dès le 1er appel (jamais 3 appels).
      appelsFetch = 0;
      globalThis.fetch = (async () => {
        appelsFetch += 1;
        return new Response("Unauthorized", { status: 401 });
      }) as typeof fetch;

      const resLot401 = await postMcp("/mcp", jeton, {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "verify_citations",
          arguments: {
            citations: [
              { citation: "2020 QCCA 101" },
              { citation: "2020 QCCA 102" },
              { citation: "2020 QCCA 103" },
            ],
          },
        },
      });
      const corpsLot401 = (await resLot401.json()) as {
        result: { isError: boolean; content: Array<{ text: string }> };
      };
      expect(corpsLot401.result.isError).toBe(true);
      expect(corpsLot401.result.content[0]?.text).toContain("[CLEF_REFUSEE]");
      expect(appelsFetch).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }

    // 4. Panne D1 sur lireCompteursJourD1 => refus fermé isError: true (G21), jamais erreur JSON-RPC -32603.
    const dbIdentitePanne = {
      prepare(sql: string) {
        if (sql.includes("FROM jeton")) {
          return env.DB_IDENTITE.prepare(sql);
        }
        if (sql.includes("UPDATE jeton")) {
          return env.DB_IDENTITE.prepare(sql);
        }
        return {
          bind() {
            return {
              async all() {
                throw new Error("D1 indisponible");
              },
              async first() {
                throw new Error("D1 indisponible");
              },
              async run() {
                throw new Error("D1 indisponible");
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const resPanne = await postMcp(
      "/mcp",
      jeton,
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "parse_citation", arguments: { citation: "2008 CSC 9" } },
      },
      { env: envTest({ DB_IDENTITE: dbIdentitePanne }) },
    );
    expect(resPanne.status).toBe(200);
    const corpsPanne = (await resPanne.json()) as {
      result?: { isError: boolean; content: Array<{ text: string }> };
      error?: unknown;
    };
    expect(corpsPanne.error).toBeUndefined();
    expect(corpsPanne.result?.isError).toBe(true);
    expect(corpsPanne.result?.content[0]?.text).toContain("indisponible");
  });
});
