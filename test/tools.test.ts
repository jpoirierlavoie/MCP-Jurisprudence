/**
 * Les neuf autres gestionnaires (spécification §7.2 à §7.10), sur réponses figées.
 * `jurisprudence_verify_citations` a son propre fichier.
 */
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

describe("§7.10 — jurisprudence_parse_citation", () => {
  it("n'appelle rien, rend les identifiants et renvoie vers verify_citations", async () => {
    const client = fakeClient({});
    const r = await callTool(
      "jurisprudence_parse_citation",
      { citation: "2020 QCCA 495" },
      toolCtx(client),
    );
    const out = texte(r);
    expect(client.chemins).toHaveLength(0);
    expect(out).toContain("aucun appel à CanLII");
    expect(out).toContain("database_id : qcca");
    expect(out).toContain("case_id     : 2020qcca495");
    expect(out).toContain("jurisprudence_verify_citations");
  });

  it("annonce « oui » pour une correspondance réconciliée", async () => {
    // Depuis la migration 0003, QCCA est confirmé par observation.
    const r = await callTool(
      "jurisprudence_parse_citation",
      { citation: "2020 QCCA 495" },
      toolCtx(fakeClient({})),
    );
    const out = texte(r);
    expect(out).toContain("qcca");
    expect(out).toContain("2020qcca495");
    expect(out).toContain("Constructible : oui");
  });

  it("annonce « probable » pour un code ABSENT du répertoire", async () => {
    // Le rang « probable » n'est pas décoratif : il commande la suite (on tente
    // l'appel, on consigne le résultat). Il faut donc qu'il subsiste après 0003.
    const r = await callTool(
      "jurisprudence_parse_citation",
      { citation: "2020 XXQQ 12" },
      toolCtx(fakeClient({})),
    );
    const out = texte(r);
    expect(out).toContain("Constructible : probable");
    expect(out).toContain("absent du répertoire");
  });

  it("expose les formes parallèles d'une citation doctrinale", async () => {
    const r = await callTool(
      "jurisprudence_parse_citation",
      { citation: "Dunsmuir c. Nouveau-Brunswick, [2008] 1 RCS 190, 2008 CSC 9 (CanLII)" },
      toolCtx(fakeClient({})),
    );
    const out = texte(r);
    expect(out).toContain("citation neutre");
    expect(out).toContain("Formes parallèles");
    expect(out).toContain("recueil");
  });
});

describe("§7.7 — jurisprudence_list_databases", () => {
  it("rafraîchit en deux appels et signale la réconciliation requise (§4.3)", async () => {
    const client = fakeClient({
      "caseBrowse/fr/": caseDatabases,
      "legislationBrowse/fr/": legislationDatabases,
    });
    const r = await callTool("jurisprudence_list_databases", { refresh: true }, toolCtx(client));
    const out = texte(r);
    expect(client.chemins).toEqual(["caseBrowse/fr/", "legislationBrowse/fr/"]);
    expect(out).toContain("Cour d'appel du Québec");
    expect(out).toContain("Corpus législatifs");
    // CHAÎNE DE COUPLAGE : `scripts/refresh-databases.mjs` la cherche telle quelle dans
    // la sortie et sort en code 2 si elle disparaît. Épinglée ici pour qu'elle soit
    // visible là où on lit cet outil, et dans `test/garde.test.ts` contre le littéral
    // du script lui-même — les deux moitiés se valent, aucune ne remplace l'autre.
    expect(out).toContain("base(s) au répertoire de CanLII");
  });

  it("SIGNALE toute correspondance démentie par le répertoire réel (§4.3)", async () => {
    // Le répertoire est réconcilié depuis 0003 : pour éprouver la barrière, on
    // introduit une correspondance fausse et l'on vérifie qu'elle est DÉNONCÉE.
    // C'est le seul garde-fou qui empêche de livrer des hypothèses non vérifiées.
    await env.DB.prepare(
      "INSERT INTO court_codes (code, database_id, caseid_code, jurisdiction, lang, verified, note) VALUES ('ZZTEST','zz-inexistante','zz','zz',NULL,0,'hypothèse de test')",
    ).run();

    const client = fakeClient({
      "caseBrowse/fr/": caseDatabases,
      "legislationBrowse/fr/": legislationDatabases,
    });
    const out = texte(
      await callTool("jurisprudence_list_databases", { refresh: true }, toolCtx(client)),
    );

    expect(out).toContain("RÉCONCILIATION REQUISE");
    expect(out).toContain("ZZTEST -> zz-inexistante");
  });

  it("filtre par ressort et par nom plié (« quebec » trouve « Québec »)", async () => {
    const client = fakeClient({
      "caseBrowse/fr/": caseDatabases,
      "legislationBrowse/fr/": legislationDatabases,
    });
    const ctx = toolCtx(client);
    await callTool("jurisprudence_list_databases", { refresh: true }, ctx);
    const r = await callTool(
      "jurisprudence_list_databases",
      { kind: "case", jurisdiction: "qc", query: "quebec" },
      toolCtx(fakeClient({})),
    );
    const out = texte(r);
    expect(out).toContain("qccq");
    expect(out).not.toContain("Cour suprême");
  });
});

describe("§7.3 — jurisprudence_get_case", () => {
  it("refuse les deux formes à la fois", async () => {
    const r = await callTool(
      "jurisprudence_get_case",
      { citation: "2008 CSC 9", database_id: "csc-scc", case_id: "2008scc9" },
      toolCtx(fakeClient({})),
    );
    expect(r.isError).toBe(true);
    expect(texte(r)).toContain("EXACTEMENT l'une des deux formes");
  });

  it("refuse l'absence des deux formes", async () => {
    const r = await callTool("jurisprudence_get_case", {}, toolCtx(fakeClient({})));
    expect(r.isError).toBe(true);
  });

  it("sert la fiche par identifiants et renvoie vers l'hyperlien pour le texte", async () => {
    const client = fakeClient({ "caseBrowse/fr/csc-scc/2008scc9/": dunsmuir });
    const r = await callTool(
      "jurisprudence_get_case",
      { database_id: "csc-scc", case_id: "2008scc9" },
      toolCtx(client),
    );
    const out = texte(r);
    expect(out).toContain("Dunsmuir");
    // La fiche est clée et rendue sous l'identifiant DEMANDÉ (« 2008scc9 »), et non
    // sous celui que CanLII renvoie (« {"fr": "2008csc9"} ») : c'est le seul moyen
    // qu'une seconde consultation trouve le cache. Voir rowFromMetadata.
    expect(out).toContain("Identifiants : csc-scc / 2008scc9");
    expect(out).toContain("suivre l'hyperlien");
    expect(out).toContain("jamais l'autorité actuelle");
  });

  it("ne sert JAMAIS une ligne de balayage comme fiche : l'appel est refait", async () => {
    // Flux quotidien réel : browse_cases persiste des lignes de balayage (4 champs —
    // ni date, ni numéro de dossier, ni hyperlien), puis get_case est appelé sur
    // chaque décision nouvelle. Servir la ligne de balayage rendrait une fiche
    // amputée étiquetée « index local ».
    await env.DB.prepare(
      "INSERT INTO cases (database_id, case_id, lang, title, title_norm, citation, source, fetched_at) VALUES ('csc-scc','2008scc9','fr','Dunsmuir c. Nouveau-Brunswick','dunsmuir c nouveau-brunswick','2008 CSC 9 (CanLII)','sweep','2026-07-22T00:00:00.000Z')",
    ).run();

    const client = fakeClient({ "caseBrowse/fr/csc-scc/2008scc9/": dunsmuir });
    const r = await callTool(
      "jurisprudence_get_case",
      { database_id: "csc-scc", case_id: "2008scc9" },
      toolCtx(client),
    );
    expect(client.chemins).toEqual(["caseBrowse/fr/csc-scc/2008scc9/"]);
    expect(texte(r)).toContain("Provenance : CanLII");

    // La fiche pleine a pris la place de la ligne de balayage : le passage suivant
    // sert l'index local sans AUCUN appel sortant.
    const client2 = fakeClient({});
    const r2 = await callTool(
      "jurisprudence_get_case",
      { database_id: "csc-scc", case_id: "2008scc9" },
      toolCtx(client2),
    );
    expect(client2.chemins).toHaveLength(0);
    expect(texte(r2)).toContain("index local");
  });

  it("oriente vers find_case sur une citation non constructible", async () => {
    const r = await callTool(
      "jurisprudence_get_case",
      { citation: "[1996] 3 R.C.S. 211" },
      toolCtx(fakeClient({})),
    );
    expect(r.isError).toBe(true);
    expect(texte(r)).toContain("jurisprudence_find_case");
  });
});

describe("§7.4 — jurisprudence_citator", () => {
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
      "jurisprudence_citator",
      { database_id: "csc-scc", case_id: "2008scc9", rel: "citing" },
      toolCtx(client),
    );
    expect(client.chemins[0]).toBe("caseCitator/en/csc-scc/2008scc9/citingCases");
    const out = texte(r);
    expect(out).toContain("QUI CITENT");
    expect(out).toContain("Untel c. Unetelle");
    // Le gabarit met « AUCUN » en capitales pour l'emphase : ce qui compte est la
    // présence de la réserve, pas sa casse.
    expect(out.toLowerCase()).toContain("aucun sens de traitement");
  });

  it("rend les dispositions citées et renvoie au connecteur Législation du Québec", async () => {
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
      "jurisprudence_citator",
      { database_id: "qcca", case_id: "2005qcca304", rel: "legislation" },
      toolCtx(client),
    );
    const out = texte(r);
    expect(out).toContain("Code civil du Québec");
    expect(out).toContain("Législation du Québec");
  });

  it("distingue « aucune » de « jamais demandé » et sert le cache ensuite", async () => {
    const client = fakeClient({
      "caseCitator/en/qcca/2005qcca304/citedCases": { citedCases: [] },
    });
    const r1 = await callTool(
      "jurisprudence_citator",
      { database_id: "qcca", case_id: "2005qcca304", rel: "cited" },
      toolCtx(client),
    );
    expect(texte(r1)).toContain("aucune");

    const client2 = fakeClient({});
    await callTool(
      "jurisprudence_citator",
      { database_id: "qcca", case_id: "2005qcca304", rel: "cited" },
      toolCtx(client2),
    );
    expect(client2.chemins).toHaveLength(0);
  });

  it("n'expose AUCUN paramètre lang (le citateur n'accepte que « en »)", async () => {
    const r = await callTool(
      "jurisprudence_citator",
      { database_id: "qcca", case_id: "x", rel: "cited", lang: "fr" },
      toolCtx(fakeClient({})),
    );
    expect(r.isError).toBe(true);
    expect(texte(r)).toContain("n'est pas un argument reconnu");
  });
});

describe("§7.5 — jurisprudence_subsequent_history", () => {
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
      "jurisprudence_subsequent_history",
      { database_id: "qccs", case_id: "2018qccs1234" },
      toolCtx(fakeClient(CITANTES)),
    );
    const out = texte(r);
    expect(out).toContain("Unetelle c. Untel"); // qcca + intitulé inversé => retenu
    expect(out).not.toContain("Tremblay c. Gagnon"); // qcca mais intitulé étranger
    expect(out).not.toContain("2019 QCCQ 1"); // juridiction INFÉRIEURE
  });

  it("porte la mise en garde EN TÊTE ET EN PIED, sans aucune affirmation", async () => {
    const r = await callTool(
      "jurisprudence_subsequent_history",
      { database_id: "qccs", case_id: "2018qccs1234" },
      toolCtx(fakeClient(CITANTES)),
    );
    const out = texte(r);
    // Ce qui est verrouillé : la réserve se lit AVANT tout résultat, c'est-à-dire dès
    // la première ligne (« Sorts ultérieurs — INDICE HEURISTIQUE, à vérifier … »).
    // Exiger l'index 0 figerait la formulation exacte de l'en-tête, pas la garantie.
    expect(out.split("\n")[0]).toContain("INDICE HEURISTIQUE");
    expect(out.replace(/\s+/g, " ")).toContain("Ce n'est pas un citateur professionnel");
    expect(out).toMatch(/susceptibles|à vérifier/);
    expect(out).not.toMatch(/a été (infirmée|confirmée|cassée|renversée)/i);
  });

  it("une liste vide ne conclut PAS à l'absence d'appel", async () => {
    const r = await callTool(
      "jurisprudence_subsequent_history",
      { database_id: "qccs", case_id: "2018qccs1234" },
      toolCtx(fakeClient({ "caseCitator/en/qccs/2018qccs1234/citingCases": { citingCases: [] } })),
    );
    const out = texte(r);
    expect(out).toContain("Aucun indice");
    expect(out).toContain("ne signifie PAS que la décision n'a pas été portée en appel");
  });
});

describe("§7.6 — jurisprudence_browse_cases", () => {
  it("refuse une date mal formée AVANT tout appel", async () => {
    const client = fakeClient({});
    const r = await callTool(
      "jurisprudence_browse_cases",
      { database_id: "qcca", decision_date_after: "01-01-2020" },
      toolCtx(client),
    );
    expect(r.isError).toBe(true);
    expect(texte(r)).toContain("AAAA-MM-JJ");
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
      "jurisprudence_browse_cases",
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
    await callTool("jurisprudence_browse_cases", { database_id: "qcca" }, toolCtx(client));
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM cases").first<{ n: number }>();
    expect(n?.n).toBe(2);
  });
});

describe("§7.2 — jurisprudence_find_case", () => {
  it("refuse une fenêtre de plus de 3 ans sans tribunal (§7.2 point 4)", async () => {
    const r = await callTool(
      "jurisprudence_find_case",
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
      "jurisprudence_find_case",
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
      "jurisprudence_find_case",
      { title: "Hydro-Québec", database_id: "qcca", year_from: 2005, year_to: 2005 },
      toolCtx(client),
    );
    const out = texte(r);
    expect(out).toContain("Association provinciale des retraités");
    expect(out).not.toContain("Tremblay c. Gagnon");
    expect(out).toContain("balayage vif");
    // D6 : les DEUX fiches parcourues sont persistées, pas seulement celle retenue.
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM cases").first<{ n: number }>();
    expect(n?.n).toBe(2);
  });

  it("une absence de candidat n'établit pas l'inexistence", async () => {
    await seedDatabases();
    const r = await callTool(
      "jurisprudence_find_case",
      { title: "Partie introuvable", database_id: "qcca", year_from: 2005, year_to: 2005 },
      toolCtx(fakeClient({ "caseBrowse/fr/qcca/": { cases: [] } })),
    );
    expect(texte(r)).toContain("n'établit pas l'inexistence");
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
      "jurisprudence_browse_legislation",
      { database_id: "qcs", query: "code civil" },
      toolCtx(client),
    );
    const out = texte(r);
    expect(out).toContain("Code civil du Québec");
    expect(out).not.toContain("Loi sur l'accès");
    expect(out).toContain("Législation du Québec");
  });

  it("get_legislation rend l'abrogation en français explicite", async () => {
    const client = fakeClient({
      "legislationBrowse/fr/qcs/rsq-c-c-25/": {
        legislationId: "rsq-c-c-25",
        title: "Code de procédure civile",
        citation: "RLRQ c C-25.01",
        type: "STATUTE",
        dateScheme: "IN_FORCE",
        startDate: "2016-01-01",
        repealed: "false",
        content: [{}, {}],
      },
    });
    const r = await callTool(
      "jurisprudence_get_legislation",
      { database_id: "qcs", legislation_id: "rsq-c-c-25" },
      toolCtx(client),
    );
    const out = texte(r);
    expect(out).toContain("Abrogé : non");
    expect(out).toContain("Régime de dates : IN_FORCE");
    expect(out).toContain("Date de début : 2016-01-01");
    expect(out).toContain("Législation du Québec");
  });

  it("get_legislation rend « oui » sur un booléen vrai et signale une valeur inconnue", async () => {
    const abroge = await callTool(
      "jurisprudence_get_legislation",
      { database_id: "qcs", legislation_id: "x" },
      toolCtx(
        fakeClient({
          "legislationBrowse/fr/qcs/x/": { title: "Loi abrogée", repealed: true },
        }),
      ),
    );
    expect(texte(abroge)).toContain("Abrogé : oui");

    const bizarre = await callTool(
      "jurisprudence_get_legislation",
      { database_id: "qcs", legislation_id: "y" },
      toolCtx(
        fakeClient({
          "legislationBrowse/fr/qcs/y/": { title: "Loi bizarre", repealed: "PARTIALLY" },
        }),
      ),
    );
    // Valeur inattendue : on l'affiche BRUTE plutôt que de la traduire au jugé.
    expect(texte(bizarre)).toContain("valeur brute de CanLII");
  });
});
