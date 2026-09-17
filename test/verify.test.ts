/**
 * `jurisprudence_verify_citations` — l'outil pivot (spécification §7.1, §13).
 *
 * Éprouve les CINQ verdicts, la boucle d'auto-correction du répertoire, le refus
 * d'appeler quand le tribunal est inconnu, et le résultat partiel sur budget épuisé.
 */
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { callTool } from "../src/mcp/registry";
import { rowFromListItem, upsertCases } from "../src/store/cases";
import dunsmuir from "./fixtures/dunsmuir.json";
import qcca2005 from "./fixtures/qcca2005.json";
import { fakeClient, resetDb, seedDatabases, texte, toolCtx } from "./helpers";

const CHEMIN_DUNSMUIR = "caseBrowse/fr/csc-scc/2008scc9/";
const CHEMIN_HYDRO = "caseBrowse/fr/qcca/2005qcca304/";

async function verifier(
  citations: Array<Record<string, unknown>>,
  routes: Record<string, unknown> = {},
  opts: Parameters<typeof fakeClient>[1] = {},
) {
  const client = fakeClient(routes, opts);
  const r = await callTool("jurisprudence_verify_citations", { citations }, toolCtx(client));
  return { texte: texte(r), isError: r.isError, client };
}

beforeEach(async () => {
  await resetDb();
  await seedDatabases();
});

describe("§7.1 — les cinq verdicts", () => {
  it("CONFIRMÉE : la fiche officielle et la mise en garde d'autorité", async () => {
    const { texte: t } = await verifier([{ citation: "2008 CSC 9" }], {
      [CHEMIN_DUNSMUIR]: dunsmuir,
    });
    expect(t).toContain("CONFIRMÉE");
    expect(t).toContain("Dunsmuir");
    expect(t).toContain("31459"); // n° de dossier
    expect(t).toContain("canlii.ca");
    // §2 conséquence n° 3 : le CONFIRMÉE porte, dans la MÊME sortie, la limite.
    expect(t).toContain("jamais l'autorité actuelle");
  });

  it("DISCORDANTE : les DEUX intitulés, verbatim et côte à côte", async () => {
    const { texte: t } = await verifier(
      [
        {
          citation: "2005 QCCA 304",
          expected_title: "Syndicat des employés d'Hydro-Québec c. Hydro-Québec",
        },
      ],
      { [CHEMIN_HYDRO]: qcca2005 },
    );
    expect(t).toContain("DISCORDANTE");
    expect(t).toContain("Syndicat des employés d'Hydro-Québec"); // attendu
    expect(t).toContain("Association provinciale des retraités"); // obtenu
    expect(t).toContain("ne désigne pas la décision annoncée");
  });

  it("un appariement PARTIEL vaut DISCORDANTE, jamais CONFIRMÉE (§6.5)", async () => {
    // « Syndicat » n'est pas dans l'intitulé obtenu : ce n'est donc pas un
    // sous-ensemble, mais l'indice de Jaccard reste à 0,50 — le cas exact que §6.5
    // veut voir traité en DISCORDANTE plutôt qu'en CONFIRMÉE.
    const { texte: t } = await verifier(
      [
        {
          citation: "2005 QCCA 304",
          expected_title: "Syndicat des retraités d'Hydro-Québec c. Hydro-Québec",
        },
      ],
      { [CHEMIN_HYDRO]: qcca2005 },
    );
    expect(t).toContain("DISCORDANTE");
    expect(t).toContain("appariement partiel");
    expect(t).not.toContain("— CONFIRMÉE");
  });

  it("un intitulé plus court entièrement contenu dans l'obtenu reste CONFIRMÉE", async () => {
    // Contrepartie du test précédent : §6.5 veut qu'une forme abrégée de l'intitulé,
    // ou l'inversion des parties, n'émette PAS de faux signalement.
    const { texte: t } = await verifier(
      [{ citation: "2005 QCCA 304", expected_title: "Retraités d'Hydro-Québec c. Hydro-Québec" }],
      { [CHEMIN_HYDRO]: qcca2005 },
    );
    expect(t).toContain("CONFIRMÉE");
  });

  it("INTROUVABLE : jamais « n'existe pas », toujours les explications concurrentes", async () => {
    const { texte: t } = await verifier([{ citation: "2020 QCCA 999999" }]);
    expect(t).toContain("INTROUVABLE");
    expect(t).toContain("qcca / 2020qcca999999");
    expect(t).toContain("Explications possibles");
    expect(t).toContain("diffusion récente");
    // §2 conséquence n° 2 — la formulation interdite.
    expect(t).not.toMatch(/n'existe pas|n'a jamais existé|aucune décision de ce genre/i);
  });

  it("NON CONSTRUCTIBLE : recueil, avec orientation vers find_case", async () => {
    const { texte: t } = await verifier([{ citation: "[1985] C.A. 105" }]);
    expect(t).toContain("NON CONSTRUCTIBLE");
    expect(t).toContain("recueil");
    expect(t).toContain("jurisprudence_find_case");
  });

  it("NON CONSTRUCTIBLE : identifiant SOQUIJ", async () => {
    const { texte: t } = await verifier([{ citation: "J.E. 94-1234" }]);
    expect(t).toContain("NON CONSTRUCTIBLE");
    expect(t).toContain("SOQUIJ");
  });

  it("ILLISIBLE : aucune forme reconnue", async () => {
    const { texte: t } = await verifier([{ citation: "voir l'arrêt de la Cour d'appel" }]);
    expect(t).toContain("ILLISIBLE");
    expect(t).toContain("Aucune forme de citation reconnue");
  });
});

describe("§6.4 — auto-correction du répertoire", () => {
  it("bascule csc <-> scc, consigne la correspondance et passe verified = 1", async () => {
    // Le répertoire d'amorçage dit « scc » ; ici seule la forme « csc » répond.
    await env.DB.prepare(
      "UPDATE court_codes SET caseid_code = 'csc', verified = 0 WHERE code = 'CSC'",
    ).run();

    const { texte: t, client } = await verifier([{ citation: "2008 CSC 9" }], {
      "caseBrowse/fr/csc-scc/2008scc9/": dunsmuir,
    });

    expect(t).toContain("CONFIRMÉE");
    // La tentative directe (csc) a échoué, la variante (scc) a réussi.
    expect(client.chemins[0]).toContain("2008csc9");
    expect(client.chemins.some((c) => c.includes("2008scc9"))).toBe(true);

    const row = await env.DB.prepare(
      "SELECT caseid_code, verified, note FROM court_codes WHERE code = 'CSC'",
    ).first<{ caseid_code: string; verified: number; note: string }>();
    expect(row?.caseid_code).toBe("scc");
    expect(row?.verified).toBe(1);
    expect(row?.note).toContain("corrigé à l'usage");
  });

  it("plafonne les rattrapages : au plus deux tentatives supplémentaires", async () => {
    const { client } = await verifier([{ citation: "2008 CSC 9" }]);
    expect(client.chemins.length).toBeLessThanOrEqual(3);
  });

  it("un tribunal absent du répertoire ⇒ INTROUVABLE SANS aucun appel sortant", async () => {
    // « XXQQ » se résout en base « xxqq », qui n'est pas au répertoire.
    const { texte: t, client } = await verifier([{ citation: "2020 XXQQ 12" }]);
    expect(t).toContain("INTROUVABLE");
    expect(t).toContain("ne figure pas au répertoire");
    expect(t).toContain("jurisprudence_list_databases");
    expect(client.chemins).toEqual([]); // le point capital : zéro appel, zéro quota
  });
});

describe("§5.2 — budget épuisé ⇒ résultat partiel annoncé", () => {
  it("rend ce qui a été obtenu et le DIT, plutôt qu'une erreur sèche", async () => {
    const { texte: t } = await verifier(
      [{ citation: "2008 CSC 9" }, { citation: "2005 QCCA 304" }],
      { [CHEMIN_DUNSMUIR]: dunsmuir, [CHEMIN_HYDRO]: qcca2005 },
      { maxCalls: 1 },
    );
    expect(t).toContain("CONFIRMÉE"); // la première a abouti
    expect(t).toContain("INDÉTERMINÉE"); // la seconde n'a pas pu être tentée
    expect(t).toContain("Budget d'appels épuisé — résultat partiel.");
  });
});

describe("une panne réseau n'est PAS une absence", () => {
  it("rend INDÉTERMINÉE et non INTROUVABLE quand CanLII est injoignable", async () => {
    const { texte: t } = await verifier(
      [{ citation: "2008 CSC 9" }],
      {},
      {
        erreur: () => Object.assign(new Error("réseau"), { name: "CanliiTimeoutError" }),
      },
    );
    expect(t).toContain("INDÉTERMINÉE");
    expect(t).toContain("PAS un constat d'absence");
    expect(t).not.toContain("INTROUVABLE");
  });
});

describe("une fiche de balayage ne peut pas servir de vérification", () => {
  it("refetch quand le cache ne contient qu'une ligne de BALAYAGE", async () => {
    // Situation réelle : `jurisprudence_browse_cases` a moissonné la base, puis on vérifie
    // une citation. La ligne moissonnée n'a ni date, ni dossier, ni hyperlien.
    await upsertCases(env.DB, [
      rowFromListItem(
        {
          databaseId: "csc-scc",
          caseId: { en: "2008scc9" },
          title: "Dunsmuir c. Nouveau-Brunswick",
          citation: "2008 CSC 9 (CanLII)",
        },
        "csc-scc",
        "fr",
        "sweep",
      )!,
    ]);

    const { texte: t, client } = await verifier([{ citation: "2008 CSC 9" }], {
      [CHEMIN_DUNSMUIR]: dunsmuir,
    });

    // L'appel a bien eu lieu malgré la présence d'une ligne en cache…
    expect(client.chemins).toEqual([CHEMIN_DUNSMUIR]);
    // …et la fiche rendue est complète.
    expect(t).toContain("31459");
    expect(t).toContain("canlii.ca");
  });

  it("le contrôle d'ANNÉE n'est jamais sauté en silence", async () => {
    // Le cœur du défaut : sans date, `comparer()` ne compare pas l'année et rendrait
    // CONFIRMÉE une citation dont l'année est fausse.
    await upsertCases(env.DB, [
      rowFromListItem(
        {
          databaseId: "csc-scc",
          caseId: { en: "2008scc9" },
          title: "Dunsmuir c. Nouveau-Brunswick",
          citation: "2008 CSC 9 (CanLII)",
        },
        "csc-scc",
        "fr",
        "sweep",
      )!,
    ]);

    const { texte: t } = await verifier([{ citation: "2008 CSC 9", expected_year: 1999 }], {
      [CHEMIN_DUNSMUIR]: dunsmuir,
    });
    expect(t).toContain("DISCORDANTE");
    expect(t).toContain("1999");
    expect(t).toContain("2008");
  });
});

describe("cache et persistance (§13)", () => {
  it("un second appel identique ne fait AUCUN appel sortant", async () => {
    await verifier([{ citation: "2008 CSC 9" }], { [CHEMIN_DUNSMUIR]: dunsmuir });
    const { texte: t, client } = await verifier([{ citation: "2008 CSC 9" }], {
      [CHEMIN_DUNSMUIR]: dunsmuir,
    });
    expect(t).toContain("CONFIRMÉE");
    expect(client.chemins).toEqual([]);
  });

  it("refresh: true refait l'appel", async () => {
    await verifier([{ citation: "2008 CSC 9" }], { [CHEMIN_DUNSMUIR]: dunsmuir });
    const client = fakeClient({ [CHEMIN_DUNSMUIR]: dunsmuir });
    await callTool(
      "jurisprudence_verify_citations",
      { citations: [{ citation: "2008 CSC 9" }], refresh: true },
      toolCtx(client),
    );
    expect(client.chemins.length).toBe(1);
  });

  it("consigne un verdict par citation dans search_log", async () => {
    await verifier([{ citation: "2008 CSC 9" }, { citation: "J.E. 94-1234" }], {
      [CHEMIN_DUNSMUIR]: dunsmuir,
    });
    const r = await env.DB.prepare(
      "SELECT verdict FROM search_log WHERE tool = 'jurisprudence_verify_citations' ORDER BY id",
    ).all<{ verdict: string }>();
    expect(r.results?.map((x) => x.verdict)).toEqual(["CONFIRMÉE", "NON CONSTRUCTIBLE"]);
  });

  it("comptabilise les appels dans api_usage", async () => {
    await verifier([{ citation: "2008 CSC 9" }], { [CHEMIN_DUNSMUIR]: dunsmuir });
    const r = await env.DB.prepare("SELECT calls FROM api_usage").first<{ calls: number }>();
    expect(r?.calls).toBe(1);
  });
});

describe("validation des arguments (§8)", () => {
  it("un argument inconnu est un RÉSULTAT isError, pas une erreur JSON-RPC", async () => {
    const r = await callTool(
      "jurisprudence_verify_citations",
      { citations: [{ citation: "2008 CSC 9" }], inconnu: 1 },
      toolCtx(fakeClient({})),
    );
    expect(r.isError).toBe(true);
    expect(texte(r)).toContain("n'est pas un argument reconnu");
  });

  it("refuse une liste vide", async () => {
    const r = await callTool(
      "jurisprudence_verify_citations",
      { citations: [] },
      toolCtx(fakeClient({})),
    );
    expect(r.isError).toBe(true);
  });
});
