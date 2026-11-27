import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { callTool } from "../src/mcp/registry";
import caseDatabases from "./fixtures/caseDatabases.json";
import dunsmuir from "./fixtures/dunsmuir.json";
import legislationDatabases from "./fixtures/legislationDatabases.json";
import { fakeClient, resetDb, seedDatabases, texte, toolCtx } from "./helpers";

beforeEach(async () => {
  await resetDb();
});

describe("§7.10 — parse_citation", () => {
  it("n'appelle rien, rend les identifiants et renvoie vers verify_citations", async () => {
    const client = fakeClient({});
    const r = await callTool("parse_citation", { citation: "2020 QCCA 495" }, toolCtx(client));
    const out = texte(r);
    expect(client.chemins).toHaveLength(0);
    expect(out).toContain("aucun appel à CanLII");
    expect(out).toContain("database_id : qcca");
    expect(out).toContain("case_id     : 2020qcca495");
    expect(out).toContain("verify_citations");
  });

  it("annonce « oui » pour une correspondance réconciliée", async () => {
    const r = await callTool(
      "parse_citation",
      { citation: "2020 QCCA 495" },
      toolCtx(fakeClient({})),
    );
    const out = texte(r);
    expect(out).toContain("qcca");
    expect(out).toContain("2020qcca495");
    expect(out).toContain("Constructible : oui");
  });

  it("annonce « probable » pour un code ABSENT du répertoire", async () => {
    const r = await callTool(
      "parse_citation",
      { citation: "2020 XXQQ 12" },
      toolCtx(fakeClient({})),
    );
    const out = texte(r);
    expect(out).toContain("Constructible : probable");
    expect(out).toContain("absent du répertoire");
  });

  it("expose les formes parallèles d'une citation doctrinale", async () => {
    const r = await callTool(
      "parse_citation",
      { citation: "Dunsmuir c. Nouveau-Brunswick, [2008] 1 RCS 190, 2008 CSC 9 (CanLII)" },
      toolCtx(fakeClient({})),
    );
    const out = texte(r);
    expect(out).toContain("citation neutre");
    expect(out).toContain("Formes parallèles");
    expect(out).toContain("recueil");
  });
});

describe("§7.7 — list_databases", () => {
  it("rafraîchit en deux appels et signale la réconciliation requise (§4.3)", async () => {
    const client = fakeClient({
      "caseBrowse/fr/": caseDatabases,
      "legislationBrowse/fr/": legislationDatabases,
    });
    const r = await callTool("list_databases", { refresh: true }, toolCtx(client));
    const out = texte(r);
    expect(client.chemins).toEqual(["caseBrowse/fr/", "legislationBrowse/fr/"]);
    expect(out).toContain("Cour d'appel du Québec");
    expect(out).toContain("Corpus législatifs");
    expect(out).toContain("base(s) au répertoire de CanLII, sans filtre :");
    expect(out).toContain("répertoire ENTIER, filtres exclus");
  });

  it("SIGNALE toute correspondance démentie par le répertoire réel (§4.3)", async () => {
    await env.DB.prepare(
      "INSERT INTO court_codes (code, database_id, caseid_code, jurisdiction, lang, verified, note) VALUES ('ZZTEST','zz-inexistante','zz','zz',NULL,0,'hypothèse de test')",
    ).run();

    const client = fakeClient({
      "caseBrowse/fr/": caseDatabases,
      "legislationBrowse/fr/": legislationDatabases,
    });
    const out = texte(await callTool("list_databases", { refresh: true }, toolCtx(client)));

    expect(out).toContain("RÉCONCILIATION REQUISE");
    expect(out).toContain("ZZTEST -> zz-inexistante");
  });

  it("filtre par ressort et par nom plié (« quebec » trouve « Québec »)", async () => {
    const client = fakeClient({
      "caseBrowse/fr/": caseDatabases,
      "legislationBrowse/fr/": legislationDatabases,
    });
    const ctx = toolCtx(client);
    await callTool("list_databases", { refresh: true }, ctx);
    const r = await callTool(
      "list_databases",
      { kind: "case", jurisdiction: "qc", query: "quebec" },
      toolCtx(fakeClient({})),
    );
    const out = texte(r);
    expect(out).toContain("qccq");
    expect(out).not.toContain("Cour suprême");
    expect(out).toContain(
      "base(s) au répertoire de CanLII pour kind=case, jurisdiction=qc, query=quebec :",
    );
  });
});

describe("§7.3 — get_case", () => {
  it("refuse les deux formes à la fois", async () => {
    const r = await callTool(
      "get_case",
      { citation: "2008 CSC 9", database_id: "csc-scc", case_id: "2008scc9" },
      toolCtx(fakeClient({})),
    );
    expect(r.isError).toBe(true);
    expect(texte(r)).toContain("EXACTEMENT l'une des deux formes");
  });

  it("refuse le mélange partiel citation + database_id ou case_id", async () => {
    const r1 = await callTool(
      "get_case",
      { citation: "2020 QCCA 495", database_id: "qcca" },
      toolCtx(fakeClient({})),
    );
    expect(r1.isError).toBe(true);
    expect(texte(r1)).toContain("EXACTEMENT l'une des deux formes");

    const r2 = await callTool(
      "get_case",
      { citation: "2020 QCCA 495", case_id: "2020qcca495" },
      toolCtx(fakeClient({})),
    );
    expect(r2.isError).toBe(true);
    expect(texte(r2)).toContain("EXACTEMENT l'une des deux formes");
  });

  it("refuse l'absence des deux formes ou un identifiant incomplet", async () => {
    const r = await callTool("get_case", {}, toolCtx(fakeClient({})));
    expect(r.isError).toBe(true);
    expect(texte(r)).toContain("EXACTEMENT l'une des deux formes");

    const rOnlyDb = await callTool("get_case", { database_id: "csc-scc" }, toolCtx(fakeClient({})));
    expect(rOnlyDb.isError).toBe(true);
    expect(texte(rOnlyDb)).toContain("EXACTEMENT l'une des deux formes");
  });

  it("sert la fiche par identifiants et renvoie vers l'hyperlien pour le texte", async () => {
    const client = fakeClient({ "caseBrowse/fr/csc-scc/2008scc9/": dunsmuir });
    const r = await callTool(
      "get_case",
      { database_id: "csc-scc", case_id: "2008scc9" },
      toolCtx(client),
    );
    const out = texte(r);
    expect(out).toContain("Dunsmuir");
    expect(out).toContain("Identifiants : csc-scc / 2008scc9");
    expect(out).toContain("suivre l'hyperlien");
    expect(out).toContain("jamais l'autorité actuelle");
  });

  it("ne sert JAMAIS une ligne de balayage comme fiche : l'appel est refait", async () => {
    await env.DB.prepare(
      "INSERT INTO cases (database_id, case_id, lang, title, title_norm, citation, source, fetched_at) VALUES ('csc-scc','2008scc9','fr','Dunsmuir c. Nouveau-Brunswick','dunsmuir c nouveau-brunswick','2008 CSC 9 (CanLII)','sweep','2026-07-22T00:00:00.000Z')",
    ).run();

    const client = fakeClient({ "caseBrowse/fr/csc-scc/2008scc9/": dunsmuir });
    const r = await callTool(
      "get_case",
      { database_id: "csc-scc", case_id: "2008scc9" },
      toolCtx(client),
    );
    expect(client.chemins).toEqual(["caseBrowse/fr/csc-scc/2008scc9/"]);
    expect(texte(r)).toContain("Provenance : CanLII");

    const client2 = fakeClient({});
    const r2 = await callTool(
      "get_case",
      { database_id: "csc-scc", case_id: "2008scc9" },
      toolCtx(client2),
    );
    expect(client2.chemins).toHaveLength(0);
    expect(texte(r2)).toContain("index local");
  });

  it("oriente vers find_case sur une citation non constructible", async () => {
    const r = await callTool(
      "get_case",
      { citation: "[1996] 3 R.C.S. 211" },
      toolCtx(fakeClient({})),
    );
    expect(r.isError).toBe(true);
    expect(texte(r)).toContain("find_case");
  });
});

describe("§7.4 — citator", () => {
  it("emploie « en » dans le chemin même en français (annexe B)", async () => {
    const client = fakeClient({
      "caseCitator/en/csc-scc/2008scc9/citingCases": {
        citingCases: [
          {
            databaseId: "qcca",
            caseId: { en: "2010qcca1" },
            title: "Untel c. Unetelle",
            citation: "2010 QCCA 1 (CanLII)",
          },
        ],
      },
    });
    const r = await callTool(
      "citator",
      { database_id: "csc-scc", case_id: "2008scc9", rel: "citing" },
      toolCtx(client),
    );
    expect(client.chemins[0]).toBe("caseCitator/en/csc-scc/2008scc9/citingCases");
    const out = texte(r);
    expect(out).toContain("QUI CITENT");
    expect(out).toContain("Untel c. Unetelle");
    expect(out.toLowerCase()).toContain("aucun sens de traitement");
  });

  it("rend les dispositions citées et renvoie au connecteur « lois » (D14)", async () => {
    const client = fakeClient({
      "caseCitator/en/qcca/2005qcca304/citedLegislations": {
        citedLegislations: [
          {
            databaseId: "qcs",
            legislationId: "rsq-c-c-1991",
            title: "Code civil du Québec",
            citation: "RLRQ c CCQ-1991",
            type: "STATUTE",
          },
        ],
      },
    });
    const r = await callTool(
      "citator",
      { database_id: "qcca", case_id: "2005qcca304", rel: "legislation" },
      toolCtx(client),
    );
    const out = texte(r);
    expect(out).toContain("Code civil du Québec");
    expect(out).toContain("« lois »");
    expect(out).toContain("caseCitator/en");
  });

  it("distingue « aucune » de « jamais demandé » et sert le cache ensuite", async () => {
    const client = fakeClient({
      "caseCitator/en/qcca/2005qcca304/citedCases": { citedCases: [] },
    });
    const r1 = await callTool(
      "citator",
      { database_id: "qcca", case_id: "2005qcca304", rel: "cited" },
      toolCtx(client),
    );
    expect(texte(r1)).toContain("aucune");

    const client2 = fakeClient({});
    await callTool(
      "citator",
      { database_id: "qcca", case_id: "2005qcca304", rel: "cited" },
      toolCtx(client2),
    );
    expect(client2.chemins).toHaveLength(0);
  });

  it("accepte lang='fr'|'en', substitue le cache local et divulgue caseCitator/en (D22)", async () => {
    await env.DB.prepare(
      `INSERT INTO cases (
         database_id, case_id, lang, title, title_norm, title_fr, title_en, source, fetched_at
       ) VALUES (
         'csc-scc', '2008scc9', 'fr',
         'Dunsmuir c. Nouveau-Brunswick', 'dunsmuir c nouveau brunswick',
         'Dunsmuir c. Nouveau-Brunswick', 'Dunsmuir v. New Brunswick',
         'lookup', '2026-07-23T00:00:00.000Z'
       )`,
    ).run();

    const client = fakeClient({
      "caseCitator/en/qcca/2005qcca304/citedCases": {
        citedCases: [
          {
            databaseId: "csc-scc",
            caseId: { en: "2008scc9" },
            title: "Dunsmuir v. New Brunswick",
            citation: "2008 SCC 9 (CanLII)",
          },
          {
            databaseId: "qccs",
            caseId: { en: "2004qccs1" },
            title: "Other Decision Inc.",
            citation: "2004 CanLII 1 (QC CS)",
          },
        ],
      },
    });
    const rFr = await callTool(
      "citator",
      { database_id: "qcca", case_id: "2005qcca304", rel: "cited", lang: "fr" },
      toolCtx(client),
    );
    const outFr = texte(rFr);
    expect(rFr.isError).not.toBe(true);
    expect(client.chemins[0]).toBe("caseCitator/en/qcca/2005qcca304/citedCases");
    expect(outFr).toContain("Dunsmuir c. Nouveau-Brunswick");
    expect(outFr).toContain("Other Decision Inc.");
    expect(outFr).toContain("caseCitator/en");

    const rEn = await callTool(
      "citator",
      { database_id: "qcca", case_id: "2005qcca304", rel: "cited", lang: "en" },
      toolCtx(fakeClient({})),
    );
    const outEn = texte(rEn);
    expect(outEn).toContain("Dunsmuir v. New Brunswick");
    expect(outEn).not.toContain("Note de langue :");
  });

  it("refuse les deux formes à la fois", async () => {
    const r = await callTool(
      "citator",
      {
        citation: "2020 QCCA 495",
        database_id: "qcca",
        case_id: "2020qcca495",
        rel: "citing",
      },
      toolCtx(fakeClient({})),
    );
    expect(r.isError).toBe(true);
    expect(texte(r)).toContain("EXACTEMENT l'une des deux formes");
  });

  it("refuse le mélange partiel citation + database_id ou case_id", async () => {
    const r1 = await callTool(
      "citator",
      { citation: "2020 QCCA 495", database_id: "qcca", rel: "citing" },
      toolCtx(fakeClient({})),
    );
    expect(r1.isError).toBe(true);
    expect(texte(r1)).toContain("EXACTEMENT l'une des deux formes");

    const r2 = await callTool(
      "citator",
      { citation: "2020 QCCA 495", case_id: "2020qcca495", rel: "citing" },
      toolCtx(fakeClient({})),
    );
    expect(r2.isError).toBe(true);
    expect(texte(r2)).toContain("EXACTEMENT l'une des deux formes");
  });

  it("refuse l'absence des deux formes ou un identifiant incomplet", async () => {
    const r = await callTool("citator", { rel: "citing" }, toolCtx(fakeClient({})));
    expect(r.isError).toBe(true);
    expect(texte(r)).toContain("EXACTEMENT l'une des deux formes");

    const rOnlyDb = await callTool(
      "citator",
      { database_id: "qcca", rel: "citing" },
      toolCtx(fakeClient({})),
    );
    expect(rOnlyDb.isError).toBe(true);
    expect(texte(rOnlyDb)).toContain("EXACTEMENT l'une des deux formes");
  });
});

describe("§7.5 — subsequent_history", () => {
  beforeEach(async () => {
    await seedDatabases();
    await env.DB.prepare(
      "INSERT INTO cases (database_id, case_id, title, title_norm, decision_date, source, fetched_at) VALUES ('qccs','2018qccs1234','Untel c. Unetelle','untel unetelle','2018-03-15','lookup','2026-07-23T00:00:00Z')",
    ).run();
  });

  const CITANTES = {
    "caseCitator/en/qccs/2018qccs1234/citingCases": {
      citingCases: [
        {
          databaseId: "qcca",
          caseId: { en: "2019qcca456" },
          title: "Unetelle c. Untel",
          citation: "2019 QCCA 456 (CanLII)",
        },
        {
          databaseId: "qccq",
          caseId: { en: "2019qccq1" },
          title: "Untel c. Unetelle",
          citation: "2019 QCCQ 1 (CanLII)",
        },
        {
          databaseId: "qcca",
          caseId: { en: "2020qcca9" },
          title: "Tremblay c. Gagnon",
          citation: "2020 QCCA 9 (CanLII)",
        },
      ],
    },
  };

  it("retient la juridiction supérieure à intitulé proche, écarte le reste", async () => {
    const r = await callTool(
      "subsequent_history",
      { database_id: "qccs", case_id: "2018qccs1234" },
      toolCtx(fakeClient(CITANTES)),
    );
    const out = texte(r);
    expect(out).toContain("Unetelle c. Untel");
    expect(out).not.toContain("Tremblay c. Gagnon");
    expect(out).not.toContain("2019 QCCQ 1");
  });

  it("porte la mise en garde EN TÊTE ET EN PIED, sans aucune affirmation", async () => {
    const r = await callTool(
      "subsequent_history",
      { database_id: "qccs", case_id: "2018qccs1234" },
      toolCtx(fakeClient(CITANTES)),
    );
    const out = texte(r);
    expect(out.split("\n")[0]).toContain("INDICE HEURISTIQUE");
    expect(out.replace(/\s+/g, " ")).toContain("Ce n'est pas un citateur professionnel");
    expect(out).toMatch(/susceptibles|à vérifier/);
    expect(out).not.toMatch(/a été (infirmée|confirmée|cassée|renversée)/i);
  });

  it("une ligne de BALAYAGE ne date pas un candidat, et ne peut donc pas l'écarter", async () => {
    await env.DB.prepare(
      "INSERT INTO cases (database_id, case_id, title, title_norm, decision_date, source, fetched_at) " +
        "VALUES ('qcca','2018qcca77','Unetelle c. Untel','unetelle untel','2018-01-01','sweep','2026-07-23T00:00:00Z')",
    ).run();
    const out = texte(
      await callTool(
        "subsequent_history",
        { database_id: "qccs", case_id: "2018qccs1234" },
        toolCtx(
          fakeClient({
            "caseCitator/en/qccs/2018qccs1234/citingCases": {
              citingCases: [
                {
                  databaseId: "qcca",
                  caseId: { en: "2018qcca77" },
                  title: "Unetelle c. Untel",
                  citation: "2018 QCCA 77 (CanLII)",
                },
              ],
            },
          }),
        ),
      ),
    );
    expect(out).toContain("2018 QCCA 77");
    expect(out).not.toContain("Aucun indice");
    expect(out).not.toContain("2018-01-01");
  });

  it("une liste vide ne conclut PAS à l'absence d'appel", async () => {
    const r = await callTool(
      "subsequent_history",
      { database_id: "qccs", case_id: "2018qccs1234" },
      toolCtx(fakeClient({ "caseCitator/en/qccs/2018qccs1234/citingCases": { citingCases: [] } })),
    );
    const out = texte(r);
    expect(out).toContain("Aucun indice");
    expect(out).toContain("ne signifie PAS que la décision n'a pas été portée en appel");
  });

  it("refuse les deux formes à la fois", async () => {
    const r = await callTool(
      "subsequent_history",
      {
        citation: "2020 QCCA 495",
        database_id: "qcca",
        case_id: "2020qcca495",
      },
      toolCtx(fakeClient({})),
    );
    expect(r.isError).toBe(true);
    expect(texte(r)).toContain("EXACTEMENT l'une des deux formes");
  });

  it("refuse le mélange partiel citation + database_id ou case_id", async () => {
    const r1 = await callTool(
      "subsequent_history",
      { citation: "2020 QCCA 495", database_id: "qcca" },
      toolCtx(fakeClient({})),
    );
    expect(r1.isError).toBe(true);
    expect(texte(r1)).toContain("EXACTEMENT l'une des deux formes");

    const r2 = await callTool(
      "subsequent_history",
      { citation: "2020 QCCA 495", case_id: "2020qcca495" },
      toolCtx(fakeClient({})),
    );
    expect(r2.isError).toBe(true);
    expect(texte(r2)).toContain("EXACTEMENT l'une des deux formes");
  });

  it("refuse l'absence des deux formes ou un identifiant incomplet", async () => {
    const r = await callTool("subsequent_history", {}, toolCtx(fakeClient({})));
    expect(r.isError).toBe(true);
    expect(texte(r)).toContain("EXACTEMENT l'une des deux formes");

    const rOnlyDb = await callTool(
      "subsequent_history",
      { database_id: "qcca" },
      toolCtx(fakeClient({})),
    );
    expect(rOnlyDb.isError).toBe(true);
    expect(texte(rOnlyDb)).toContain("EXACTEMENT l'une des deux formes");
  });

  it("D22 : substitue l'intitulé français du cache et compare les intitulés FR/EN avant de filtrer", async () => {
    await env.DB.prepare(
      `INSERT INTO cases (
         database_id, case_id, lang, title, title_norm, title_fr, title_en,
         decision_date, source, fetched_at
       ) VALUES (
         'csc-scc', '2014csc55', 'fr',
         'Banque de Montréal c. Marcotte', 'banque de montreal c marcotte',
         'Banque de Montréal c. Marcotte', 'Bank of Montreal v. Marcotte',
         '2014-09-19', 'lookup', '2026-07-23T00:00:00Z'
       )`,
    ).run();
    const r = await callTool(
      "subsequent_history",
      { database_id: "qccs", case_id: "2018qccs1234", lang: "fr" },
      toolCtx(
        fakeClient({
          "caseCitator/en/qccs/2018qccs1234/citingCases": {
            citingCases: [
              {
                databaseId: "qcca",
                caseId: { en: "2019qcca456" },
                title: "Unetelle c. Untel",
                citation: "2019 QCCA 456 (CanLII)",
              },
            ],
          },
        }),
      ),
    );
    const out = texte(r);
    expect(out).toContain("Unetelle c. Untel");
    expect(out).toContain("caseCitator/en");

    await env.DB.prepare(
      `INSERT INTO cases (
         database_id, case_id, lang, title, title_norm, title_fr, title_en,
         decision_date, source, fetched_at
       ) VALUES (
         'qccs', '2012qccs1', 'fr',
         'Marcotte c. Banque de Montréal', 'marcotte c banque de montreal',
         'Marcotte c. Banque de Montréal', 'Marcotte v. Bank of Montreal',
         '2012-01-01', 'lookup', '2026-07-23T00:00:00Z'
       )`,
    ).run();
    const rCross = await callTool(
      "subsequent_history",
      { database_id: "qccs", case_id: "2012qccs1", lang: "fr" },
      toolCtx(
        fakeClient({
          "caseCitator/en/qccs/2012qccs1/citingCases": {
            citingCases: [
              {
                databaseId: "csc-scc",
                caseId: { en: "2014csc55" },
                title: "Bank of Montreal v. Marcotte",
                citation: "2014 SCC 55 (CanLII), [2014] 2 SCR 725",
              },
            ],
          },
        }),
      ),
    );
    const outCross = texte(rCross);
    expect(outCross).toContain("Banque de Montréal c. Marcotte");
    expect(outCross).toContain("2014 CSC 55 (CanLII), [2014] 2 RCS 725");
    expect(outCross).not.toContain("Note de langue :");
  });
});

describe("§7.6 — browse_cases", () => {
  it("refuse une date mal formée ou calendairement impossible AVANT tout appel", async () => {
    const client = fakeClient({});
    const r = await callTool(
      "browse_cases",
      { database_id: "qcca", decision_date_after: "01-01-2020" },
      toolCtx(client),
    );
    expect(r.isError).toBe(true);
    expect(texte(r)).toContain("AAAA-MM-JJ");
    expect(client.chemins).toHaveLength(0);

    const rInvalidCal = await callTool(
      "browse_cases",
      { database_id: "qcca", decision_date_after: "2024-02-30" },
      toolCtx(client),
    );
    expect(rInvalidCal.isError).toBe(true);
    expect(texte(rInvalidCal)).toContain("calendaire valide");
    expect(client.chemins).toHaveLength(0);
  });

  it("rappelle le jeu de deux jours quand un filtre de diffusion est employé", async () => {
    const client = fakeClient({
      "caseBrowse/fr/qcca/": {
        cases: [
          {
            databaseId: "qcca",
            caseId: { fr: "2026qcca1" },
            title: "Une décision récente",
            citation: "2026 QCCA 1 (CanLII)",
          },
        ],
      },
    });
    const r = await callTool(
      "browse_cases",
      { database_id: "qcca", published_after: "2026-07-01" },
      toolCtx(client),
    );
    const out = texte(r);
    expect(out).toContain("Une décision récente");
    expect(out).toContain("jeu de deux jours");
  });

  it("persiste les fiches parcourues (D6)", async () => {
    const client = fakeClient({
      "caseBrowse/fr/qcca/": {
        cases: [
          { databaseId: "qcca", caseId: { fr: "2026qcca1" }, title: "A", citation: "2026 QCCA 1" },
          { databaseId: "qcca", caseId: { fr: "2026qcca2" }, title: "B", citation: "2026 QCCA 2" },
        ],
      },
    });
    await callTool("browse_cases", { database_id: "qcca" }, toolCtx(client));
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM cases").first<{ n: number }>();
    expect(n?.n).toBe(2);
  });
});

describe("§7.2 — find_case", () => {
  it("refuse une fenêtre de plus de 3 ans sans tribunal (§7.2 point 4)", async () => {
    const r = await callTool(
      "find_case",
      { title: "Hydro-Québec", year_from: 1990, year_to: 2020 },
      toolCtx(fakeClient({})),
    );
    expect(r.isError).toBe(true);
    expect(texte(r)).toContain("ne peut pas dépasser 3 ans");
  });

  it("sert l'index local sans balayer quand il rend au moins trois candidats", async () => {
    await seedDatabases();
    const stmt = env.DB.prepare(
      "INSERT INTO cases (database_id, case_id, title, title_norm, citation, decision_date, source, fetched_at) VALUES (?,?,?,?,?,?,?,?)",
    );
    await env.DB.batch(
      [1, 2, 3].map((i) =>
        stmt.bind(
          "qcca",
          `2005qcca${i}`,
          `Association ${i} d'Hydro-Québec c. Hydro-Québec`,
          `association ${i} hydro quebec hydro quebec`,
          `2005 QCCA ${i} (CanLII)`,
          "2005-03-31",
          "lookup",
          "2026-07-23T00:00:00.000Z",
        ),
      ),
    );
    const client = fakeClient({});
    const r = await callTool(
      "find_case",
      { title: "Hydro-Québec", database_id: "qcca", year_from: 2004, year_to: 2006 },
      toolCtx(client),
    );
    const out = texte(r);
    expect(client.chemins).toHaveLength(0);
    expect(out).toContain("aucun appel à CanLII");
    expect(out).toContain("n'expose\npas le texte des décisions");
  });

  it("balaie, filtre côté Worker, persiste TOUT et chiffre sa provenance", async () => {
    await seedDatabases();
    const client = fakeClient({
      "caseBrowse/fr/qcca/": {
        cases: [
          {
            databaseId: "qcca",
            caseId: { fr: "2005qcca304" },
            title: "Association provinciale des retraités d'Hydro-Québec c. Hydro-Québec",
            citation: "2005 QCCA 304 (CanLII)",
          },
          {
            databaseId: "qcca",
            caseId: { fr: "2005qcca999" },
            title: "Tremblay c. Gagnon",
            citation: "2005 QCCA 999 (CanLII)",
          },
        ],
      },
    });
    const r = await callTool(
      "find_case",
      { title: "Hydro-Québec", database_id: "qcca", year_from: 2005, year_to: 2005 },
      toolCtx(client),
    );
    const out = texte(r);
    expect(out).toContain("Association provinciale des retraités");
    expect(out).not.toContain("Tremblay c. Gagnon");
    expect(out).toContain("balayage vif");
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM cases").first<{ n: number }>();
    expect(n?.n).toBe(2);
  });

  it("un candidat moissonné n'affiche AUCUNE date, et n'en persiste aucune", async () => {
    await seedDatabases();
    const client = fakeClient({
      "caseBrowse/fr/qcca/": {
        cases: [
          {
            databaseId: "qcca",
            caseId: { fr: "2005qcca304" },
            title: "Association provinciale des retraités d'Hydro-Québec c. Hydro-Québec",
            citation: "2005 QCCA 304 (CanLII)",
          },
        ],
      },
    });
    const out = texte(
      await callTool(
        "find_case",
        { title: "Hydro-Québec", database_id: "qcca", year_from: 2005, year_to: 2005 },
        toolCtx(client),
      ),
    );
    expect(out).toContain("· — ·");
    expect(out).not.toMatch(/\d{4}-01-01/);
    expect(out).toContain("n'a pas de date");
    const r = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM cases WHERE decision_date IS NOT NULL",
    ).first<{ n: number }>();
    expect(r?.n).toBe(0);
  });

  it("un balayage qui recroise une fiche résolue n'écrase NI sa date NI sa provenance", async () => {
    await seedDatabases();
    await env.DB.prepare(
      "INSERT INTO cases (database_id, case_id, title, title_norm, citation, decision_date, url, source, fetched_at) " +
        "VALUES ('qcca','2005qcca304','Association provinciale des retraités d''Hydro-Québec c. Hydro-Québec'," +
        "'association provinciale des retraites d hydro quebec c hydro quebec','2005 QCCA 304 (CanLII)'," +
        "'2005-03-31','https://canlii.ca/t/1g2h3','lookup','2026-07-23T00:00:00.000Z')",
    ).run();
    const client = fakeClient({
      "caseBrowse/fr/qcca/": {
        cases: [
          {
            databaseId: "qcca",
            caseId: { fr: "2005qcca304" },
            title: "Association provinciale des retraités d'Hydro-Québec c. Hydro-Québec",
            citation: "2005 QCCA 304 (CanLII)",
          },
        ],
      },
    });
    await callTool(
      "find_case",
      { title: "Hydro-Québec", database_id: "qcca", year_from: 2005, year_to: 2005, live: true },
      toolCtx(client),
    );
    const apres = await env.DB.prepare(
      "SELECT decision_date, source, url FROM cases WHERE case_id = '2005qcca304'",
    ).first<{ decision_date: string; source: string; url: string }>();
    expect(apres?.decision_date).toBe("2005-03-31");
    expect(apres?.source).toBe("lookup");
    expect(apres?.url).toBe("https://canlii.ca/t/1g2h3");
  });

  it("une absence de candidat n'établit pas l'inexistence", async () => {
    await seedDatabases();
    const r = await callTool(
      "find_case",
      { title: "Partie introuvable", database_id: "qcca", year_from: 2005, year_to: 2005 },
      toolCtx(fakeClient({ "caseBrowse/fr/qcca/": { cases: [] } })),
    );
    expect(texte(r)).toContain("n'établit pas l'inexistence");
  });

  it("D9 : inclut csc-scc dans les bases québécoises usuelles sans database_id", async () => {
    await seedDatabases();
    const client = fakeClient({
      "caseBrowse/fr/csc-scc/": {
        cases: [
          {
            databaseId: "csc-scc",
            caseId: { fr: "2014csc55" },
            title: "Banque de Montréal c. Marcotte",
            citation: "2014 CSC 55 (CanLII)",
          },
        ],
      },
      "caseBrowse/fr/qcca/": { cases: [] },
      "caseBrowse/fr/qccs/": { cases: [] },
      "caseBrowse/fr/qccq/": { cases: [] },
    });
    const r = await callTool(
      "find_case",
      { title: "Banque de Montréal c. Marcotte", year_from: 2014, year_to: 2014 },
      toolCtx(client),
    );
    const out = texte(r);
    expect(client.chemins[0]).toBe("caseBrowse/fr/csc-scc/");
    expect(out).toContain("Banque de Montréal c. Marcotte");
    expect(out).toContain("2014 CSC 55");
  });

  it("D9 : refuse une fenêtre > 3 ans sans tribunal même lorsque l'index local contient >= 3 lignes", async () => {
    await seedDatabases();
    const stmt = env.DB.prepare(
      "INSERT INTO cases (database_id, case_id, title, title_norm, decision_date, source, fetched_at) VALUES (?,?,?,?,?,?,?)",
    );
    await env.DB.batch(
      [1, 2, 3].map((i) =>
        stmt.bind(
          "qcca",
          `2020qcca${i}`,
          `Hydro-Québec c. Partie ${i}`,
          `hydro quebec partie ${i}`,
          "2020-05-01",
          "lookup",
          "2026-07-23T00:00:00Z",
        ),
      ),
    );
    const r = await callTool(
      "find_case",
      { title: "Hydro-Québec", year_from: 2010, year_to: 2020 },
      toolCtx(fakeClient({})),
    );
    expect(r.isError).toBe(true);
    expect(texte(r)).toContain("ne peut pas dépasser 3 ans");
  });

  it("D9 : écarte le bruit de mots-clés FTS et classe l'appariement d'intitulé avant les concordances partielles", async () => {
    await seedDatabases();
    const stmt = env.DB.prepare(
      "INSERT INTO cases (database_id, case_id, title, title_norm, keywords, decision_date, source, fetched_at) VALUES (?,?,?,?,?,?,?,?)",
    );
    await env.DB.batch([
      stmt.bind(
        "qcca",
        "2014qcca1",
        "Dupont c. Tremblay",
        "dupont c tremblay",
        "banque de montreal marcotte",
        "2014-01-01",
        "lookup",
        "2026-07-23T00:00:00Z",
      ),
      stmt.bind(
        "qcca",
        "2014qcca2",
        "Gagnon c. Leblanc",
        "gagnon c leblanc",
        "banque de montreal marcotte",
        "2014-01-02",
        "lookup",
        "2026-07-23T00:00:00Z",
      ),
      stmt.bind(
        "qcca",
        "2014qcca3",
        "Roy c. Pelletier",
        "roy c pelletier",
        "banque de montreal marcotte",
        "2014-01-03",
        "lookup",
        "2026-07-23T00:00:00Z",
      ),
      stmt.bind(
        "qccs",
        "2014qccs4",
        "Banque Nationale c. Marcotte",
        "banque nationale c marcotte",
        "cartes de credit montreal",
        "2014-02-01",
        "lookup",
        "2026-07-23T00:00:00Z",
      ),
    ]);
    const client = fakeClient({
      "caseBrowse/fr/csc-scc/": {
        cases: [
          {
            databaseId: "csc-scc",
            caseId: { fr: "2014csc55" },
            title: "Banque de Montréal c. Marcotte",
            citation: "2014 CSC 55 (CanLII)",
          },
        ],
      },
    });
    const r = await callTool(
      "find_case",
      { title: "Banque de Montréal c. Marcotte", year_from: 2014, year_to: 2014 },
      toolCtx(client),
    );
    const out = texte(r);
    expect(client.chemins).toContain("caseBrowse/fr/csc-scc/");
    expect(out).not.toContain("Dupont c. Tremblay");
    expect(out).not.toContain("Gagnon c. Leblanc");
    expect(out).not.toContain("Roy c. Pelletier");
    expect(out.indexOf("Banque de Montréal c. Marcotte")).toBeLessThan(
      out.indexOf("Banque Nationale c. Marcotte"),
    );
  });

  it("A-N3 : dédoublonne les couples bilingues fédéraux (2014csc55 ≡ 2014scc55)", async () => {
    await seedDatabases();
    await env.DB.prepare(
      `INSERT INTO cases (
         database_id, case_id, lang, title, title_norm, title_fr, title_en,
         decision_date, source, fetched_at
       ) VALUES (
         'csc-scc', '2014csc55', 'fr',
         'Banque de Montréal c. Marcotte', 'banque de montreal c marcotte',
         'Banque de Montréal c. Marcotte', 'Bank of Montreal v. Marcotte',
         '2014-09-19', 'lookup', '2026-07-23T00:00:00Z'
       )`,
    ).run();
    const client = fakeClient({
      "caseBrowse/fr/csc-scc/": {
        cases: [
          {
            databaseId: "csc-scc",
            caseId: { en: "2014scc55" },
            title: "Bank of Montreal v. Marcotte",
            citation: "2014 SCC 55 (CanLII)",
          },
        ],
      },
    });
    const r = await callTool(
      "find_case",
      {
        title: "Banque de Montréal c. Marcotte",
        database_id: "csc-scc",
        year_from: 2014,
        year_to: 2014,
      },
      toolCtx(client),
    );
    const out = texte(r);
    expect(out).toContain("1 candidat pour");
  });
});

describe("§7.8 et §7.9 — législation", () => {
  it("browse_legislation filtre sur le titre plié et pagine côté Worker", async () => {
    const client = fakeClient({
      "legislationBrowse/fr/qcs/": {
        legislations: [
          {
            databaseId: "qcs",
            legislationId: "rsq-c-c-1991",
            title: "Code civil du Québec",
            citation: "RLRQ c CCQ-1991",
            type: "STATUTE",
          },
          {
            databaseId: "qcs",
            legislationId: "rsq-c-a-2",
            title: "Loi sur l'accès aux documents",
            citation: "RLRQ c A-2.1",
            type: "STATUTE",
          },
        ],
      },
    });
    const r = await callTool(
      "browse_legislation",
      { database_id: "qcs", query: "code civil" },
      toolCtx(client),
    );
    const out = texte(r);
    expect(out).toContain("Code civil du Québec");
    expect(out).not.toContain("Loi sur l'accès");
    expect(out).toContain("« lois »");
  });

  async function fiche(id: string, meta: Record<string, unknown>): Promise<string> {
    return texte(
      await callTool(
        "get_legislation",
        { database_id: "qcs", legislation_id: id },
        toolCtx(fakeClient({ [`legislationBrowse/fr/qcs/${id}/`]: meta })),
      ),
    );
  }

  it("get_legislation borne la VERSION servie, et ne date pas l'instrument", async () => {
    const out = await fiche("cqlr-c-ccq-1991", {
      legislationId: "cqlr-c-ccq-1991",
      title: "Code civil du Québec",
      citation: "CQLR c CCQ-1991",
      type: "STATUTE",
      dateScheme: "ENTRY_INTO_FORCE",
      startDate: "2026-02-24",
      repealed: "false",
      content: [{}],
    });
    expect(out).toContain("Abrogé : non");
    expect(out).toContain("Version servie par CanLII : depuis le 2026-02-24, sans date de fin.");
    expect(out).toContain("« ENTRY_INTO_FORCE » — entrée en vigueur de CETTE VERSION.");
    expect(out).toContain("bornent la VERSION que CanLII sert, et non l'instrument");
    expect(out).not.toContain("Date de début :");
    expect(out).toContain("« lois »");
  });

  it("DOWNLOAD_DATE ne se lit PAS comme ENTRY_INTO_FORCE", async () => {
    const out = await fiche("cqlr-c-c-25.01-r-0.2.1", {
      title: "Règlement de la Cour supérieure du Québec en matière civile",
      type: "REGULATION",
      dateScheme: "DOWNLOAD_DATE",
      startDate: "2024-12-05",
      repealed: "false",
    });
    expect(out).toContain("« DOWNLOAD_DATE » — jour où CanLII a téléchargé le texte");
    expect(out).toContain("aucune portée juridique");
    expect(out).not.toContain("entrée en vigueur de CETTE VERSION");
  });

  it("une fenêtre FERMÉE se lit comme une fenêtre, sur un texte abrogé", async () => {
    const out = await fiche("lrq-c-c-24", {
      title: "Code de la route",
      type: "REVISED_STATUTE",
      dateScheme: "ENTRY_INTO_FORCE",
      startDate: "1986-12-18",
      endDate: "1987-12-01",
      repealed: true,
    });
    expect(out).toContain("Version servie par CanLII : du 1986-12-18 au 1987-12-01.");
    expect(out).toContain("Abrogé : oui");
  });

  it("un régime INCONNU ou ABSENT est rendu brut, jamais traduit au jugé", async () => {
    const inconnu = await fiche("z", { title: "Loi", dateScheme: "SOMETHING_NEW" });
    expect(inconnu).toContain("« SOMETHING_NEW » — régime inconnu de ce connecteur");
    expect(inconnu).toContain("n'en rien inférer");

    const absent = await fiche("w", { title: "Loi sans régime" });
    expect(absent).toContain("Version servie par CanLII : dates non précisées.");
    expect(absent).toContain("Régime de dates : non précisé par CanLII");
  });

  it("get_legislation rend « oui » sur un booléen vrai et signale une valeur inconnue", async () => {
    const abroge = await callTool(
      "get_legislation",
      { database_id: "qcs", legislation_id: "x" },
      toolCtx(
        fakeClient({
          "legislationBrowse/fr/qcs/x/": { title: "Loi abrogée", repealed: true },
        }),
      ),
    );
    expect(texte(abroge)).toContain("Abrogé : oui");

    const bizarre = await callTool(
      "get_legislation",
      { database_id: "qcs", legislation_id: "y" },
      toolCtx(
        fakeClient({
          "legislationBrowse/fr/qcs/y/": { title: "Loi bizarre", repealed: "PARTIALLY" },
        }),
      ),
    );
    expect(texte(bizarre)).toContain("valeur brute de CanLII");
  });
});
