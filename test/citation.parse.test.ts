/**
 * Matrice obligatoire de l'analyseur (spécification §13). Chaque `it` est une ligne
 * du tableau, reprise telle quelle. Cette matrice est la PORTE : rien d'autre n'est
 * censé être construit tant qu'elle n'est pas verte.
 */
import { describe, expect, it } from "vitest";

import { type Directory, formLabel, parseCitation, resolve } from "../src/citation/parse";

// Répertoire d'amorçage identique à `migrations/0002_seed_court_codes.sql`.
const SEED: Array<[string, string, string, string, string | null, number]> = [
  ["CSC", "csc-scc", "scc", "ca", "fr", 1],
  ["SCC", "csc-scc", "scc", "ca", "en", 1],
  ["QCCA", "qcca", "qcca", "qc", null, 0],
  ["QCCS", "qccs", "qccs", "qc", null, 0],
  ["QCCQ", "qccq", "qccq", "qc", null, 0],
  ["QCCM", "qccm", "qccm", "qc", null, 0],
  ["QCTAL", "qctal", "qctal", "qc", null, 0],
  ["QCTAT", "qctat", "qctat", "qc", null, 0],
  ["QCTAQ", "qctaq", "qctaq", "qc", null, 0],
  ["QCTP", "qctp", "qctp", "qc", null, 0],
  ["CAF", "caf-fca", "fca", "ca", "fr", 0],
  ["FCA", "caf-fca", "fca", "ca", "en", 0],
  ["CF", "cf-fc", "fc", "ca", "fr", 0],
  ["FC", "cf-fc", "fc", "ca", "en", 0],
  ["CCI", "cci-tcc", "tcc", "ca", "fr", 0],
  ["TCC", "cci-tcc", "tcc", "ca", "en", 0],
];

const dir: Directory = {
  courtCodes: new Map(
    SEED.map(([code, database_id, caseid_code, jurisdiction, lang, verified]) => [
      code,
      { code, database_id, caseid_code, jurisdiction, lang, verified, note: null },
    ]),
  ),
  parenCodes: new Map(
    (
      [
        ["QC", "CA", "qcca", 0],
        ["QC", "CS", "qccs", 0],
        ["QC", "CQ", "qccq", 0],
        ["QC", "CM", "qccm", 0],
        ["CA", "SCC", "csc-scc", 1],
        ["CA", "CSC", "csc-scc", 1],
      ] as Array<[string, string, string, number]>
    ).map(([juris_code, court_code, database_id, verified]) => [
      `${juris_code}/${court_code}`,
      { juris_code, court_code, database_id, verified },
    ]),
  ),
  knownDatabases: new Set<string>(),
};

const connus = (code: string) => dir.courtCodes.has(code);

/** Raccourci : analyse puis résout la forme retenue. */
function ids(input: string) {
  const parsed = parseCitation(input, connus);
  const res = resolve(parsed.primary, dir);
  return { parsed, res, db: res.databaseId, cid: res.caseId };
}

describe("§13 — matrice de l'analyseur", () => {
  it("2020 QCCA 495 → qcca / 2020qcca495", () => {
    const { parsed, db, cid } = ids("2020 QCCA 495");
    expect(parsed.primary.kind).toBe("neutral");
    expect(db).toBe("qcca");
    expect(cid).toBe("2020qcca495");
  });

  it("2020 qcca 495 → idem (insensible à la casse)", () => {
    const { parsed, db, cid } = ids("2020 qcca 495");
    expect(parsed.primary.kind).toBe("neutral");
    expect(db).toBe("qcca");
    expect(cid).toBe("2020qcca495");
  });

  it("2008 CSC 9 → csc-scc / 2008scc9", () => {
    const { db, cid, res } = ids("2008 CSC 9");
    expect(db).toBe("csc-scc");
    expect(cid).toBe("2008scc9");
    expect(res.constructible).toBe("oui"); // ligne documentée, verified = 1
  });

  it("2008 SCC 9 → csc-scc / 2008scc9", () => {
    const { db, cid } = ids("2008 SCC 9");
    expect(db).toBe("csc-scc");
    expect(cid).toBe("2008scc9");
  });

  it("citation doctrinale complète → neutre extraite, recueil en parallèle", () => {
    const input = "Dunsmuir c. Nouveau-Brunswick, [2008] 1 RCS 190, 2008 CSC 9 (CanLII)";
    const { parsed, db, cid } = ids(input);
    expect(parsed.primary.kind).toBe("neutral");
    expect(db).toBe("csc-scc");
    expect(cid).toBe("2008scc9");
    // « [2008] 1 RCS 190 » doit figurer dans les formes parallèles.
    const recueils = parsed.parallel.filter((f) => f.kind === "reporter");
    expect(recueils).toHaveLength(1);
    expect(recueils[0]!.raw).toBe("[2008] 1 RCS 190");
    expect(formLabel(recueils[0]!)).toContain("recueil");
  });

  it("2002 CanLII 32322 (QC CQ) → qccq / 2002canlii32322", () => {
    const { parsed, db, cid } = ids("2002 CanLII 32322 (QC CQ)");
    expect(parsed.primary.kind).toBe("canlii");
    expect(db).toBe("qccq");
    expect(cid).toBe("2002canlii32322");
    // Parade n° 1 + n° 2 : « CanLII » ne doit JAMAIS ressortir comme code de tribunal.
    expect(parsed.parallel.some((f) => f.kind === "neutral")).toBe(false);
  });

  it("2005 QCCA 304 (CanLII) → qcca / 2005qcca304", () => {
    const { parsed, db, cid } = ids("2005 QCCA 304 (CanLII)");
    expect(parsed.primary.kind).toBe("neutral");
    expect(db).toBe("qcca");
    expect(cid).toBe("2005qcca304");
  });

  it("[1996] 3 R.C.S. 211 → recueil, non constructible", () => {
    const { parsed, res } = ids("[1996] 3 R.C.S. 211");
    expect(parsed.primary.kind).toBe("reporter");
    expect(res.constructible).toBe("non");
    expect(res.raison).toContain("recueil");
  });

  it("[1985] C.A. 105 → recueil, non constructible", () => {
    const { parsed, res } = ids("[1985] C.A. 105");
    expect(parsed.primary.kind).toBe("reporter");
    expect(res.constructible).toBe("non");
  });

  it("[1998] R.J.Q. 1234 → recueil, non constructible", () => {
    const { parsed, res } = ids("[1998] R.J.Q. 1234");
    expect(parsed.primary.kind).toBe("reporter");
    expect(res.constructible).toBe("non");
  });

  it("J.E. 94-1234 → identifiant d'éditeur (SOQUIJ), non constructible", () => {
    const { parsed, res } = ids("J.E. 94-1234");
    expect(parsed.primary.kind).toBe("publisher");
    expect(parsed.primary).toMatchObject({ scheme: "SOQUIJ" });
    expect(res.constructible).toBe("non");
  });

  it.each([
    ["REJB 1998-09876", "Yvon Blais"],
    ["EYB 2005-12345", "Yvon Blais"],
    ["AZ-51234567", "SOQUIJ"],
    ["D.T.E. 2004T-123", "SOQUIJ"],
  ])("%s → identifiant d'éditeur, non constructible", (input, scheme) => {
    const { parsed, res } = ids(input);
    expect(parsed.primary.kind).toBe("publisher");
    expect(parsed.primary).toMatchObject({ scheme });
    expect(res.constructible).toBe("non");
  });

  it("art. 1457 C.c.Q. → unparsed (c'est une disposition, pas une décision)", () => {
    const { parsed, res } = ids("art. 1457 C.c.Q.");
    expect(parsed.primary.kind).toBe("unparsed");
    expect(res.constructible).toBe("non");
  });

  it("2023 QCTAL 12345 → qctal / 2023qctal12345", () => {
    const { db, cid } = ids("2023 QCTAL 12345");
    expect(db).toBe("qctal");
    expect(cid).toBe("2023qctal12345");
  });

  it("voir la décision de la Cour d'appel → unparsed", () => {
    const { parsed } = ids("voir la décision de la Cour d'appel");
    expect(parsed.primary.kind).toBe("unparsed");
  });

  it("2020 XXQQ 12 → code inconnu, constructible « probable »", () => {
    const { parsed, res } = ids("2020 XXQQ 12");
    expect(parsed.primary.kind).toBe("neutral");
    expect(res.constructible).toBe("probable");
    expect(res.databaseId).toBe("xxqq");
    expect(res.caseId).toBe("2020xxqq12");
    expect(res.raison).toContain("absent du répertoire");
  });
});

describe("garde-fous de l'analyseur", () => {
  it("une ligne d'amorçage verified = 0 rend « probable », jamais « oui »", () => {
    // QCCA est une HYPOTHÈSE d'identité tant que §14 étape 7 n'a pas eu lieu.
    expect(ids("2020 QCCA 495").res.constructible).toBe("probable");
    // CSC est documenté : verified = 1.
    expect(ids("2008 CSC 9").res.constructible).toBe("oui");
  });

  it("n'invente pas de citation dans une phrase courante", () => {
    const { parsed } = ids(
      "La facture de 2020 USD 500 a été payée avant l'audience de la semaine suivante.",
    );
    expect(parsed.primary.kind).toBe("unparsed");
  });

  it("reconnaît une citation neutre au milieu d'une phrase quand le ressort est connu", () => {
    const { parsed, db, cid } = ids(
      "Comme l'a rappelé la Cour d'appel dans 2020 QCCA 495, le principe demeure.",
    );
    expect(parsed.primary.kind).toBe("neutral");
    expect(db).toBe("qcca");
    expect(cid).toBe("2020qcca495");
  });

  it("une forme CanLII sans parenthèses est RECONNUE mais non constructible", () => {
    const { parsed, res } = ids("2002 CanLII 32322");
    expect(parsed.primary.kind).toBe("canlii");
    expect(res.constructible).toBe("non");
    expect(res.raison).toContain("parenthèses");
  });

  it("un couple de codes inconnu ne devine pas de base", () => {
    const { res } = ids("2002 CanLII 32322 (ZZ ZZ)");
    expect(res.constructible).toBe("non");
    expect(res.databaseId).toBeNull();
  });

  it("retient la forme constructible quand plusieurs coexistent", () => {
    const { parsed, db } = ids("[1996] 3 R.C.S. 211, 1996 CSC 12, J.E. 96-1234");
    expect(parsed.primary.kind).toBe("neutral");
    expect(db).toBe("csc-scc");
    expect(parsed.parallel).toHaveLength(2);
    expect(parsed.inlineTitle).toBeNull();
  });
});

describe("D1 & D21 — extraction d'intitulé de tête et formes concaténées", () => {
  it("extrait l'intitulé de tête dans les styles civils français et anglais courants", () => {
    expect(ids("Banque de Montréal c. Marcotte, 2014 CSC 55").parsed.inlineTitle).toBe(
      "Banque de Montréal c. Marcotte",
    );
    expect(ids("Bank of Montreal v. Marcotte, 2014 SCC 55").parsed.inlineTitle).toBe(
      "Bank of Montreal v. Marcotte",
    );
    expect(ids("Re Thibault — 2020 QCCA 495").parsed.inlineTitle).toBe("Re Thibault");
    expect(ids("Succession Tremblay c. Gagnon, 2021 QCCS 100").parsed.inlineTitle).toBe(
      "Succession Tremblay c. Gagnon",
    );
    expect(ids("Syndic de Boisvert, 2019 QCCA 88").parsed.inlineTitle).toBe("Syndic de Boisvert");
    expect(ids("Droit de la famille — 21100, 2021 QCCA 100").parsed.inlineTitle).toBe(
      "Droit de la famille — 21100",
    );
    expect(ids("Protection de la jeunesse — 20123, 2020 QCCQ 456").parsed.inlineTitle).toBe(
      "Protection de la jeunesse — 20123",
    );
  });

  it("retire les introducteurs de prose et les connecteurs finals", () => {
    expect(ids("voir Banque de Montréal c. Marcotte, dans 2014 CSC 55").parsed.inlineTitle).toBe(
      "Banque de Montréal c. Marcotte",
    );
    expect(
      ids("voir Bank of Montreal v. Marcotte, in [2014] 2 SCR 725, 2014 SCC 55").parsed.inlineTitle,
    ).toBe("Bank of Montreal v. Marcotte");
  });

  it("n'extrait aucun intitulé sur de la simple prose ou une citation nue (pas de faux positifs)", () => {
    expect(ids("voir 2020 QCCA 495").parsed.inlineTitle).toBeNull();
    expect(ids("il a payé 2020 QCCA 495").parsed.inlineTitle).toBeNull();
    expect(ids("Recours contre la décision dans 2020 QCCA 495").parsed.inlineTitle).toBeNull();
    expect(ids("2020 QCCA 495").parsed.inlineTitle).toBeNull();
  });

  it("reconnaît les identifiants CanLII bruts concaténés (D21)", () => {
    const scc = ids("2008csc64");
    expect(scc.parsed.primary.kind).toBe("neutral");
    expect(scc.db).toBe("csc-scc");
    expect(scc.cid).toBe("2008scc64");

    const qcca = ids("2020qcca495");
    expect(qcca.parsed.primary.kind).toBe("neutral");
    expect(qcca.db).toBe("qcca");
    expect(qcca.cid).toBe("2020qcca495");

    const canlii = ids("1997canlii335");
    expect(canlii.parsed.primary.kind).toBe("canlii");
    expect(canlii.res.constructible).toBe("non");
  });

  it("B-N5 & B-N14 : accepte l'espace omis avant le numéro et rejette le numéro 0", () => {
    const glued = ids("2014 CSC55");
    expect(glued.parsed.primary.kind).toBe("neutral");
    expect(glued.db).toBe("csc-scc");
    expect(glued.cid).toBe("2014scc55");

    const zeroNeutral = ids("2020 QCCA 0");
    expect(zeroNeutral.res.constructible).toBe("non");
    expect(zeroNeutral.res.raison).toContain("strictement positif");

    const zeroCanlii = ids("2020 CanLII 0 (QC CQ)");
    expect(zeroCanlii.res.constructible).toBe("non");
    expect(zeroCanlii.res.raison).toContain("strictement positif");
  });

  it("reconnaît les parenthèses CanLII à un jeton fédéral, les points et les recueils des listes", () => {
    const fca = parseCitation("Li c. Canada, 1996 CanLII 4086 (FCA)");
    expect(fca.primary).toMatchObject({
      kind: "canlii",
      year: 1996,
      number: 4086,
      juris: "CA",
      court: "FCA",
    });
    expect(fca.inlineTitle).toBe("Li c. Canada");

    const qcca = parseCitation("Béliveau c. Barreau, 1992 CanLII 3299 (QC C.A.)");
    expect(qcca.primary).toMatchObject({
      kind: "canlii",
      year: 1992,
      number: 3299,
      juris: "QC",
      court: "CA",
    });

    const clp = parseCitation("Amar c. CSST, [2003] C.L.P. 606 (C.A.)");
    expect(clp.primary).toMatchObject({
      kind: "reporter",
      year: 2003,
      reporter: "C.L.P.",
      page: 606,
    });

    const cpr = parseCitation("Canada v. CII Honeywell Bull (1985), 4 CPR (3d) 523 (FCA)");
    expect(cpr.primary).toMatchObject({ kind: "reporter", year: 1985, volume: 4, page: 523 });

    const nr = parseCitation("Beloit Canada Ltd v Valmet Oy, 64 NR 287 (FCA)");
    expect(nr.primary).toMatchObject({
      kind: "reporter",
      year: null,
      volume: 64,
      reporter: "NR",
      page: 287,
    });

    const fcj = parseCitation("Coca-Cola Ltd. v. Pardhan, [1999] FCJ No 483");
    expect(fcj.primary).toMatchObject({ kind: "reporter", year: 1999, reporter: "FCJ", page: 483 });

    const dte = parseCitation("Saint-Georges c. Deschamps, D.T.E. 97T- 1342 (C.A.)");
    expect(dte.primary).toMatchObject({ kind: "publisher", scheme: "SOQUIJ" });

    const carswell = parseCitation("Manhattan Industries Inc. v. Princeton, 1971 CarswellNat 513");
    expect(carswell.primary).toMatchObject({ kind: "publisher", scheme: "Carswell" });
  });
});
