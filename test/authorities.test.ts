/**
 * Tests des listes d'autorités dispensées de reproduction (§7.11 & §7.12).
 *
 * Couvre :
 *  1. La parité exacte du jeu compilé (`exemptAuthorities.{json,ts}`) contre
 *     `data/autorites-dispensees.md` et `data/autorites-enrichies.json`.
 *  2. `list_exempt_authorities` (annuaire, consultation verbatim par onglets, recherche
 *     dédupliquée, pagination et erreurs de validation).
 *  3. `check_exempt_authorities` (XOR `list_id` / `tribunal`, 5 verdicts, formats neutre /
 *     CanLII / recueil / éditeur / dossier, `conf. par`, coquilles des listes sources,
 *     0 appel sur citation neutre ordinaire absente, repli CanLII borné et `INDÉTERMINÉE`).
 */
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import autoritesMd from "../data/autorites-dispensees.md?raw";
import autoritesEnrichies from "../data/autorites-enrichies.json";
import { CanliiError } from "../src/canlii/errors";
import {
  EXEMPT_AUTHORITY_LISTS,
  EXEMPT_AUTHORITY_STATS,
  EXEMPT_DECISIONS,
} from "../src/data/exemptAuthorities";
import { EXPLICATION_INDETERMINEE, GARDE_AUTORITES_DISPENSEES } from "../src/format/render";
import { callTool } from "../src/mcp/registry";
import { rowFromMetadata, upsertCase } from "../src/store/cases";
import dunsmuir from "./fixtures/dunsmuir.json";
import { fakeClient, resetDb, seedDatabases, texte, toolCtx } from "./helpers";

beforeEach(async () => {
  await resetDb();
  await seedDatabases(["csc-scc", "qcca", "qccs", "qccq", "fct", "fca", "qctat", "qcbdrvm"]);
});

describe("Parité de compilation des autorités dispensées", () => {
  it("les statistiques, 27 listes, 864 entrées et 737 décisions concordent avec les sources", () => {
    expect(EXEMPT_AUTHORITY_STATS).toEqual({
      listCount: 27,
      totalEntries: 864,
      totalLinks: 750,
      uniqueDecisions: 737,
    });
    expect(EXEMPT_AUTHORITY_LISTS).toHaveLength(27);

    const totalEntrees = EXEMPT_AUTHORITY_LISTS.reduce((acc, l) => acc + l.entries.length, 0);
    const totalLiens = EXEMPT_AUTHORITY_LISTS.reduce(
      (acc, l) => acc + l.entries.filter((e) => e.sourceUrls.length > 0).length,
      0,
    );
    expect(totalEntrees).toBe(864);
    expect(totalLiens).toBe(750);

    // Contrôler chaque ligne du tableau `## Sommaire` dans `autorites-dispensees.md`
    const sommaireSection = autoritesMd.split("## Sommaire")[1]?.split("\n## 1.")[0] ?? "";
    const lignesSommaire = [
      ...sommaireSection.matchAll(
        /^\|\s*[^|\n]+\|\s*[^|\n]+\|\s*[^|\n]+\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+(?:\.\d+)?)\s*\|/gm,
      ),
    ];
    expect(lignesSommaire).toHaveLength(27);
    expect(lignesSommaire.reduce((s, m) => s + Number(m[1]), 0)).toBe(864);
    expect(lignesSommaire.reduce((s, m) => s + Number(m[2]), 0)).toBe(750);

    // Vérifier la ventilation des 737 décisions enrichies
    const enrichiesMap = autoritesEnrichies.decisions as Record<string, { status: string }>;
    const clesCompilees = Object.keys(EXEMPT_DECISIONS).sort();
    const clesEnrichies = Object.keys(enrichiesMap).sort();
    expect(clesCompilees).toEqual(clesEnrichies);
    expect(clesCompilees).toHaveLength(737);

    const comptesStatut = { canlii: 0, hors_collection: 0, hors_juridiction: 0 };
    for (const d of Object.values(EXEMPT_DECISIONS)) {
      comptesStatut[d.status]++;
    }
    expect(comptesStatut).toEqual({
      canlii: 487,
      hors_collection: 246,
      hors_juridiction: 4,
    });
  });
});

describe("list_exempt_authorities (hors ligne)", () => {
  it("sans paramètre, rend l'annuaire des 27 listes / 9 tribunaux sans appel CanLII", async () => {
    const client = fakeClient({});
    const res = await callTool("list_exempt_authorities", {}, toolCtx(client));
    expect(res.isError).toBe(false);
    expect(client.usage().calls).toBe(0);

    const out = texte(res);
    expect(out).toContain("27 listes d'autorités dispensées compilées");
    expect(out).toContain("9 tribunaux");
    expect(out).toContain("mode hors ligne");
    for (const lid of [
      "qcca-civil",
      "qcca-criminel",
      "tat-dsst",
      "tat-drt",
      "tat-construction",
      "tdp",
      "tp",
      "tmf",
      "cf-imm-general",
      "cf-imm-sursis",
      "cf-autochtone",
      "cf-travail",
      "cf-pi",
      "cf-concurrence",
      "comc",
      "qccs-mtl-controle-judiciaire",
      "qccs-mtl-commercial",
      "qccs-mtl-oppression",
      "qccs-mtl-actions-collectives",
      "qccs-qc-civil",
      "qccs-qc-familial",
      "qccq-daa-disciplinaire",
      "qccq-daa-deontologie-policiere",
      "qccq-daa-fiscalite-municipale",
      "qccq-daa-fiscale",
      "qccq-daa-secteur-financier",
      "qccq-daa-acces-information",
    ]) {
      expect(out, lid).toContain(lid);
    }
    expect(out).toContain(GARDE_AUTORITES_DISPENSEES.split("\n")[0]!);
  });

  it("avec list_id, rend la liste verbatim dans l'ordre source avec métadonnées et pagination", async () => {
    const client = fakeClient({});
    const resTdp = await callTool(
      "list_exempt_authorities",
      { list_id: "tdp", limit: 3 },
      toolCtx(client),
    );
    expect(resTdp.isError).toBe(false);
    expect(client.usage().calls).toBe(0);

    const outTdp = texte(resTdp);
    expect(outTdp).toContain("tdp — Tribunal des droits de la personne");
    expect(outTdp).toContain("Onglet 1");
    expect(outTdp).toContain("Janzen");
    expect(outTdp).toContain("Descripteurs (liste source)");
    expect(outTdp).toContain("Lien de la liste source (non vérifié)");
    expect(outTdp).toContain("3 premiers sur");

    const resQcca = await callTool(
      "list_exempt_authorities",
      { list_id: "qcca-civil", limit: 5, offset: 5 },
      toolCtx(client),
    );
    expect(resQcca.isError).toBe(false);
    expect(texte(resQcca)).toContain("5 rendue(s) à partir du rang 5");
  });

  it("avec query, déduplique par decisionKey et mentionne toutes les listes où l'arrêt paraît", async () => {
    const res = await callTool(
      "list_exempt_authorities",
      { query: "Dunsmuir" },
      toolCtx(fakeClient({})),
    );
    expect(res.isError).toBe(false);
    const out = texte(res);
    expect(out).toContain("décision(s) pour « Dunsmuir »");
    expect(out).toContain("Dunsmuir c. Nouveau-Brunswick");
    expect(out).toContain("Présente dans");
    expect(out).toContain("qcca-civil");
    expect(out).toContain("tat-dsst");
    expect(out).toContain("tmf");
    expect(out).toContain("cf-imm-general");
    expect(out).toContain("Mots-clés (index CanLII, non vérifiés)");

    const resNick = await callTool(
      "list_exempt_authorities",
      { query: "Meiorin" },
      toolCtx(fakeClient({})),
    );
    expect(resNick.isError).toBe(false);
    const outNick = texte(resNick);
    expect(outNick).toContain("Surnom(s) : Meiorin");
    expect(outNick).toContain("Colombie-Britannique");
  });

  it("refuse list_id inconnu, tribunal inconnu ou couple list_id/tribunal incompatible", async () => {
    for (const args of [
      { list_id: "inexistant" },
      { tribunal: "qccm" },
      { list_id: "qcca-civil", tribunal: "cf" },
    ]) {
      const res = await callTool("list_exempt_authorities", args, toolCtx(fakeClient({})));
      expect(res.isError, JSON.stringify(args)).toBe(true);
    }
  });
});

describe("check_exempt_authorities", () => {
  it("impose EXACTEMENT list_id ou tribunal", async () => {
    const sans = await callTool(
      "check_exempt_authorities",
      { citations: [{ citation: "2008 CSC 9" }] },
      toolCtx(fakeClient({})),
    );
    expect(sans.isError).toBe(true);
    expect(texte(sans)).toContain("EXACTEMENT");

    const deux = await callTool(
      "check_exempt_authorities",
      { list_id: "qcca-civil", tribunal: "qcca", citations: [{ citation: "2008 CSC 9" }] },
      toolCtx(fakeClient({})),
    );
    expect(deux.isError).toBe(true);
    expect(texte(deux)).toContain("EXACTEMENT");
  });

  it("rend DISPENSÉE hors ligne sur citation neutre FR/EN, CanLII, R.C.S., FCR et éditeur (0 appel)", async () => {
    const c1 = fakeClient({});
    const rQcca = await callTool(
      "check_exempt_authorities",
      {
        list_id: "qcca-civil",
        citations: [
          { citation: "2008 CSC 9" },
          { citation: "2008 SCC 9" },
          { citation: "[1986] 1 R.C.S. 103" },
        ],
      },
      toolCtx(c1),
    );
    expect(rQcca.isError).toBe(false);
    expect(c1.usage().calls).toBe(0);
    const outQcca = texte(rQcca);
    expect(outQcca).toContain("2008 CSC 9 — DISPENSÉE");
    expect(outQcca).toContain("2008 SCC 9 — DISPENSÉE");
    expect(outQcca).toContain("[1986] 1 R.C.S. 103 — DISPENSÉE");
    expect(outQcca).toContain("https://canlii.ca/t/1vxsn");

    const c2 = fakeClient({});
    const rCfPi = await callTool(
      "check_exempt_authorities",
      { list_id: "cf-pi", citations: [{ citation: "1994 CanLII 3534 (CAF)" }] },
      toolCtx(c2),
    );
    expect(c2.usage().calls).toBe(0);
    expect(texte(rCfPi)).toContain("1994 CanLII 3534 (CAF) — DISPENSÉE");

    const c3 = fakeClient({});
    const rFcr = await callTool(
      "check_exempt_authorities",
      {
        list_id: "cf-concurrence",
        citations: [{ citation: "[2001] 1 FC 219" }, { citation: "[2001] 1 FCR 219" }],
      },
      toolCtx(c3),
    );
    expect(c3.usage().calls).toBe(0);
    expect(texte(rFcr)).toContain("[2001] 1 FC 219 — DISPENSÉE");
    expect(texte(rFcr)).toContain("[2001] 1 FCR 219 — DISPENSÉE");

    const c4 = fakeClient({});
    const rPub = await callTool(
      "check_exempt_authorities",
      {
        tribunal: "tmf",
        citations: [{ citation: "J.E. 2004-1751" }],
      },
      toolCtx(c4),
    );
    expect(c4.usage().calls).toBe(0);
    expect(texte(rPub)).toContain("J.E. 2004-1751 — DISPENSÉE");

    const c5 = fakeClient({});
    const rDte = await callTool(
      "check_exempt_authorities",
      {
        list_id: "tat-drt",
        citations: [{ citation: "D.T.E. 97T-1375" }],
      },
      toolCtx(c5),
    );
    expect(c5.usage().calls).toBe(0);
    expect(texte(rDte)).toContain("D.T.E. 97T-1375 — DISPENSÉE");

    const cQccq = fakeClient({});
    const rQccq = await callTool(
      "check_exempt_authorities",
      {
        tribunal: "qccq",
        citations: [
          { citation: "2014 QCCA 2189" },
          { citation: "[1951] UKPC 28" },
          { citation: "2011 QCCA 994" },
          { citation: "2016 QCCA 878" },
          { citation: "[2011] 2 R.C.S. 175" },
          { citation: "2011 CSC 23" },
        ],
      },
      toolCtx(cQccq),
    );
    expect(rQccq.isError).toBe(false);
    expect(cQccq.usage().calls).toBe(0);
    const outQccq = texte(rQccq);
    expect(outQccq).toContain("2014 QCCA 2189 — DISPENSÉE");
    expect(outQccq).toContain("[1951] UKPC 28 — DISPENSÉE");
    expect(outQccq).toContain("2011 QCCA 994 — DISPENSÉE");
    expect(outQccq).toContain("2016 QCCA 878 — DISPENSÉE");
    expect(outQccq).toContain("[2011] 2 R.C.S. 175 — DISPENSÉE");
    expect(outQccq).toContain("2011 CSC 23 — DISPENSÉE");

    const cQccs = fakeClient({});
    const rQccs = await callTool(
      "check_exempt_authorities",
      {
        tribunal: "qccs",
        citations: [
          { citation: "[1984] C.A. 633" },
          { citation: "2008 ONCA 587" },
          { citation: "J.E. 2003-45" },
          { citation: "2002 CanLII 41290 (QC CA)" },
          { citation: "[1999] 1 R.C.S. 420" },
          { citation: "1999 CanLII 715 (CSC)" },
        ],
      },
      toolCtx(cQccs),
    );
    expect(rQccs.isError).toBe(false);
    expect(cQccs.usage().calls).toBe(0);
    const outQccs = texte(rQccs);
    expect(outQccs).toContain("[1984] C.A. 633 — DISPENSÉE");
    expect(outQccs).toContain("2008 ONCA 587 — DISPENSÉE");
    expect(outQccs).toContain("J.E. 2003-45 — DISPENSÉE");
    expect(outQccs).toContain("2002 CanLII 41290 (QC CA) — DISPENSÉE");
    expect(outQccs).toContain("[1999] 1 R.C.S. 420 — DISPENSÉE");
    expect(outQccs).toContain("1999 CanLII 715 (CSC) — DISPENSÉE");
  });

  it("contrôle toutes les sous-listes d'un tribunal et nomme celles qui concordent", async () => {
    const res = await callTool(
      "check_exempt_authorities",
      { tribunal: "tat", citations: [{ citation: "2008 CSC 9" }] },
      toolCtx(fakeClient({})),
    );
    expect(res.isError).toBe(false);
    const out = texte(res);
    expect(out).toContain("2008 CSC 9 — DISPENSÉE");
    expect(out).toContain("Liste : tat-dsst (Liste de jurisprudence");
    expect(out).toContain("[tat-dsst, tat-drt, tat-construction]");
  });

  it("apparie les décisions confirmantes (conf. par / aff'd) avec mention explicite", async () => {
    const res = await callTool(
      "check_exempt_authorities",
      {
        list_id: "cf-pi",
        citations: [
          { citation: "2011 FCA 300" },
          { citation: "1997 CanLII 16675 (FCTAD)" },
          { citation: "209 NR 387" },
        ],
      },
      toolCtx(fakeClient({})),
    );
    expect(res.isError).toBe(false);
    const out = texte(res);
    expect(out).toContain("2011 FCA 300 — DISPENSÉE");
    expect(out).toContain("1997 CanLII 16675 (FCTAD) — DISPENSÉE");
    expect(out).toContain("209 NR 387 — DISPENSÉE");
    expect(out).toContain("Appariement via la décision confirmante (« conf. par » / « aff'd »)");
  });

  it("signale À VÉRIFIER sur les coquilles connues des listes sources et sur les écarts d'intitulé/année", async () => {
    const rTypo = await callTool(
      "check_exempt_authorities",
      {
        tribunal: "cf",
        citations: [
          { citation: "2016 CAF 126" },
          { citation: "1994 CanLII 35340" },
          { citation: "2004 CF 1124" },
        ],
      },
      toolCtx(fakeClient({})),
    );
    expect(rTypo.isError).toBe(false);
    const outTypo = texte(rTypo);
    expect(outTypo).toContain("2016 CAF 126 — À VÉRIFIER");
    expect(outTypo).toContain("1994 CanLII 35340 — À VÉRIFIER");
    expect(outTypo).toContain("2004 CF 1124 — À VÉRIFIER");
    expect(outTypo).toContain("Coquille connue de la liste source");

    const rEcart = await callTool(
      "check_exempt_authorities",
      {
        list_id: "qcca-civil",
        citations: [
          { citation: "2008 CSC 9", expected_title: "Roncarelli c. Duplessis" },
          { citation: "2008 CSC 9", expected_year: 1999 },
        ],
      },
      toolCtx(fakeClient({})),
    );
    expect(rEcart.isError).toBe(false);
    const outEcart = texte(rEcart);
    expect(outEcart.match(/2008 CSC 9 — À VÉRIFIER/g)).toHaveLength(2);
  });

  it("apparie le numéro de dossier dans le bon tribunal et rend NON LISTÉE ailleurs", async () => {
    const okCf = await callTool(
      "check_exempt_authorities",
      { tribunal: "cf", citations: [{ citation: "IMM-2664-00" }], resolve_canlii: false },
      toolCtx(fakeClient({})),
    );
    expect(texte(okCf)).toContain("IMM-2664-00 — DISPENSÉE");
    expect(texte(okCf)).toContain("cf-imm-sursis");

    const nonTat = await callTool(
      "check_exempt_authorities",
      { tribunal: "tat", citations: [{ citation: "IMM-2664-00" }], resolve_canlii: false },
      toolCtx(fakeClient({})),
    );
    expect(texte(nonTat)).toContain("IMM-2664-00 — NON LISTÉE");
  });

  it("une citation neutre ordinaire absente de la liste rend NON LISTÉE avec 0 appel CanLII", async () => {
    const client = fakeClient({});
    const res = await callTool(
      "check_exempt_authorities",
      { list_id: "qcca-civil", citations: [{ citation: "2020 QCCA 495" }] },
      toolCtx(client),
    );
    expect(res.isError).toBe(false);
    expect(client.usage().calls).toBe(0);
    expect(texte(res)).toContain("2020 QCCA 495 — NON LISTÉE");
  });

  it("résout via le repli CanLII (lookupCase hors_collection et searchLocal D1)", async () => {
    // 1. Repli lookupCase sur entrée `hors_collection` compatible (Fairford First Nation 1998/1999)
    const clientLookup = fakeClient({
      "caseBrowse/fr/fct/1998canlii8888/": {
        databaseId: "fct",
        caseId: "1998canlii8888",
        title: "Fairford First Nation v. Canada (Attorney General)",
        citation: "[1999] 2 F.C. 48",
        decisionDate: "1998-11-26",
        url: "https://canlii.ca/t/4abc",
      },
    });
    const rLookup = await callTool(
      "check_exempt_authorities",
      {
        list_id: "cf-autochtone",
        citations: [{ citation: "1998 CanLII 8888 (FCT)" }],
      },
      toolCtx(clientLookup),
    );
    expect(rLookup.isError).toBe(false);
    expect(clientLookup.usage().calls).toBe(1);
    const outLookup = texte(rLookup);
    expect(outLookup).toContain("1998 CanLII 8888 (FCT) — DISPENSÉE");
    expect(outLookup).toContain("Résolution CanLII préalable appliquée");

    // 2. Repli searchLocal sur citation de recueil avec intitulé déjà présent dans `cases`
    await upsertCase(
      env.DB,
      rowFromMetadata(
        dunsmuir,
        { databaseId: "csc-scc", caseId: "2008scc9" },
        "lookup",
        new Date("2026-07-23T12:00:00Z"),
        "fr",
      ),
    );
    const clientLocal = fakeClient({});
    const rLocal = await callTool(
      "check_exempt_authorities",
      {
        list_id: "qcca-civil",
        citations: [
          {
            citation: "[2008] R.J.Q. 9999",
            expected_title: "Dunsmuir c. Nouveau-Brunswick",
            expected_year: 2008,
          },
        ],
      },
      toolCtx(clientLocal),
    );
    expect(rLocal.isError).toBe(false);
    expect(clientLocal.usage().calls).toBe(0);
    expect(texte(rLocal)).toContain("DISPENSÉE");
    expect(texte(rLocal)).toContain("Résolution CanLII préalable appliquée");
  });

  it("rend ILLISIBLE sur forme inexploitable/vide et INDÉTERMINÉE sur panne CanLII 429/500", async () => {
    const rIllisible = await callTool(
      "check_exempt_authorities",
      {
        list_id: "qcca-civil",
        citations: [{ citation: "???" }, { citation: "" }],
        resolve_canlii: false,
      },
      toolCtx(fakeClient({})),
    );
    expect(rIllisible.isError).toBe(false);
    const outIllisible = texte(rIllisible);
    expect(outIllisible).toContain("??? — ILLISIBLE");
    expect(outIllisible).toContain("(vide) — ILLISIBLE");

    const rErr = await callTool(
      "check_exempt_authorities",
      {
        list_id: "cf-imm-general",
        citations: [{ citation: "2004 CF 9999" }],
      },
      toolCtx(
        fakeClient(
          {},
          {
            erreur: () =>
              new CanliiError(
                500,
                "https://api.canlii.org/v1/caseBrowse/fr/fct/2004cf9999/",
                "err",
              ),
          },
        ),
      ),
    );
    expect(rErr.isError).toBe(false);
    const outErr = texte(rErr);
    expect(outErr).toContain("Vérification INTERROMPUE");
    expect(outErr).toContain("2004 CF 9999 — INDÉTERMINÉE");
    expect(outErr).toContain(EXPLICATION_INDETERMINEE);
    expect(outErr).not.toContain("2004 CF 9999 — NON LISTÉE");
  });

  it("expose l'Avis modifié CF (2015), les règles multiples QCCS et les consignes sur NON LISTÉE", async () => {
    const resCf = await callTool(
      "list_exempt_authorities",
      { list_id: "cf-pi", limit: 1 },
      toolCtx(fakeClient({})),
    );
    expect(resCf.isError).toBe(false);
    const outCf = texte(resCf);
    expect(outCf).toContain("LCJ Vol. 1, partie A, onglet 7");
    expect(outCf).toContain("Notice%20to%20Parties%20re%20Common%20List");
    expect(outCf).toContain("Sources connexes :");

    const resQccs = await callTool(
      "list_exempt_authorities",
      { tribunal: "qccs", limit: 2 },
      toolCtx(fakeClient({})),
    );
    expect(resQccs.isError).toBe(false);
    const outQccs = texte(resQccs);
    expect(outQccs).toContain("par. 188");
    expect(outQccs).toContain("par. 189");
    expect(outQccs).toContain("par. 24.2");

    const resTmf = await callTool(
      "check_exempt_authorities",
      { tribunal: "tmf", citations: [{ citation: "2022 QCTMF 99" }], resolve_canlii: false },
      toolCtx(fakeClient({})),
    );
    expect(resTmf.isError).toBe(false);
    const outTmf = texte(resTmf);
    expect(outTmf).toContain("2022 QCTMF 99 — NON LISTÉE");
    expect(outTmf).toContain("Toute décision accessible gratuitement par hyperlien");

    const resTdp = await callTool(
      "check_exempt_authorities",
      { list_id: "tdp", citations: [{ citation: "2022 QCTDP 99" }], resolve_canlii: false },
      toolCtx(fakeClient({})),
    );
    expect(resTdp.isError).toBe(false);
    const outTdp = texte(resTdp);
    expect(outTdp).toContain("2022 QCTDP 99 — NON LISTÉE");
    expect(outTdp).toContain("par. 40, 3°");
  });
});
