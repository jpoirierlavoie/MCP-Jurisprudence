/**
 * Persistance (spécification §13) — contre la VRAIE D1 locale et le VRAI index FTS5.
 *
 * L'index `cases_fts` est en « external content » : il ne stocke pas les données, il
 * les référence par `rowid`. Toute divergence entre `cases` et `cases_fts` est donc
 * silencieuse — la recherche rend simplement moins de résultats, sans erreur. C'est
 * exactement ce que ces tests attrapent.
 */
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  anneeInferee,
  type CaseRow,
  extractNeutral,
  ftsQuery,
  getCachedCase,
  listCases,
  rowFromListItem,
  rowFromMetadata,
  searchLocal,
  upsertCase,
  upsertCases,
} from "../src/store/cases";
import { edgeStale, getCachedEdges, replaceEdges } from "../src/store/citator";
import {
  confirmCourtCode,
  directoryMismatches,
  directoryStale,
  loadDirectory,
} from "../src/store/databases";
import { flushUsage, logSearch, logSearchBatch, utcDay } from "../src/store/telemetry";

const db = env.DB;

function row(over: Partial<CaseRow> = {}): CaseRow {
  return {
    database_id: "qcca",
    case_id: "2005qcca304",
    lang: "fr",
    title: "Association provinciale des retraités d'Hydro-Québec c. Hydro-Québec",
    title_norm: "association provinciale des retraites d hydro quebec c hydro quebec",
    citation: "2005 QCCA 304 (CanLII)",
    neutral_cite: "2005 QCCA 304",
    docket_number: "500-09-014",
    decision_date: "2005-03-31",
    keywords: "régime de retraite — surplus",
    url: "https://canlii.ca/t/1g2h3",
    concatenated_id: "2005qcca304",
    source: "lookup",
    fetched_at: "2026-07-23T00:00:00.000Z",
    ...over,
  };
}

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM cases"),
    db.prepare("DELETE FROM citator_edges"),
    db.prepare("DELETE FROM citator_state"),
    db.prepare("DELETE FROM search_log"),
    db.prepare("DELETE FROM api_usage"),
    db.prepare("DELETE FROM databases"),
  ]);
});

describe("upsert et index FTS5", () => {
  it("une insertion remplit `cases` ET `cases_fts`", async () => {
    await upsertCase(db, row());
    expect(await getCachedCase(db, "qcca", "2005qcca304")).toMatchObject({
      title: expect.stringContaining("Hydro-Québec"),
    });
    const hits = await searchLocal(db, "Hydro-Québec");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.case_id).toBe("2005qcca304");
  });

  it("l'index suit un upsert (ON CONFLICT DO UPDATE), sans divergence", async () => {
    await upsertCase(db, row());
    await upsertCase(db, row({ title: "Intitulé corrigé après réexamen", title_norm: "x" }));
    // L'ancien intitulé ne doit plus rien apparier…
    expect(await searchLocal(db, "provinciale")).toHaveLength(0);
    // …et le nouveau doit apparier.
    expect(await searchLocal(db, "réexamen")).toHaveLength(1);
    // Une seule ligne : c'est un upsert, pas un doublon.
    const n = await db.prepare("SELECT COUNT(*) AS n FROM cases").first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it("la recherche plie les diacritiques (remove_diacritics 2)", async () => {
    await upsertCase(db, row());
    expect(await searchLocal(db, "quebec")).toHaveLength(1);
    expect(await searchLocal(db, "retraites")).toHaveLength(1);
  });

  it("un balayage n'écrase pas les champs riches d'une fiche déjà résolue", async () => {
    // Fiche complète obtenue par résolution directe…
    await upsertCase(db, row());
    // …puis la même décision revue par un balayage, qui ne porte que 4 champs.
    const maigre = rowFromListItem(
      {
        databaseId: "qcca",
        caseId: { fr: "2005qcca304" },
        title: "Titre de liste",
        citation: "2005 QCCA 304 (CanLII)",
      },
      "qcca",
      "fr",
      "sweep",
    );
    await upsertCase(db, maigre!);
    const apres = await getCachedCase(db, "qcca", "2005qcca304");
    // La date, l'hyperlien et le numéro de dossier survivent au balayage.
    expect(apres?.decision_date).toBe("2005-03-31");
    expect(apres?.url).toBe("https://canlii.ca/t/1g2h3");
    expect(apres?.docket_number).toBe("500-09-014");
    // …et la PROVENANCE aussi : « lookup » ne se rétrograde jamais en « sweep ».
    // Sinon, tout balayage qui recroise une fiche résolue la disqualifierait du
    // cache (lookupCase et get_case ne servent que « lookup ») et rachèterait
    // l'appel — un suivi quotidien à fenêtres chevauchantes recroise TOUT.
    expect(apres?.source).toBe("lookup");
  });

  it("écrit un lot et l'indexe intégralement", async () => {
    const lot = Array.from({ length: 120 }, (_, i) =>
      row({
        case_id: `2020qcca${i}`,
        title: `Tremblay c. Gagnon numéro ${i}`,
        title_norm: `tremblay c gagnon numero ${i}`,
        neutral_cite: `2020 QCCA ${i}`,
        decision_date: "2020-05-01",
      }),
    );
    expect(await upsertCases(db, lot)).toBe(120);
    const hits = await searchLocal(db, "Tremblay Gagnon", { limit: 100 });
    expect(hits.length).toBe(100); // plafonné par `limit`, pas par l'indexation
    const n = await db.prepare("SELECT COUNT(*) AS n FROM cases_fts").first<{ n: number }>();
    expect(n?.n).toBe(120);
  });

  it("filtre par tribunal et par fenêtre de dates", async () => {
    await upsertCases(db, [
      row({ case_id: "a", database_id: "qcca", decision_date: "2005-03-31" }),
      row({ case_id: "b", database_id: "qccs", decision_date: "2015-06-01" }),
    ]);
    expect(await searchLocal(db, "Hydro-Québec", { databaseId: "qccs" })).toHaveLength(1);
    expect(await searchLocal(db, "Hydro-Québec", { yearFrom: 2010, yearTo: 2020 })).toHaveLength(1);
  });

  it("liste par tribunal, les plus récentes en tête", async () => {
    await upsertCases(db, [
      row({ case_id: "vieux", decision_date: "2001-01-01" }),
      row({ case_id: "recent", decision_date: "2024-01-01" }),
    ]);
    const l = await listCases(db, "qcca", 10, 0);
    expect(l.map((r) => r.case_id)).toEqual(["recent", "vieux"]);
  });
});

describe("l'ANNÉE inférée — pour filtrer et classer, jamais pour afficher", () => {
  it("lit l'année dans le préfixe du caseId quand la ligne n'a pas de date", () => {
    expect(anneeInferee({ decision_date: null, case_id: "2005qcca304" })).toBe(2005);
    expect(anneeInferee({ decision_date: null, case_id: "1997canlii335" })).toBe(1997);
  });

  it("la DATE l'emporte quand elle existe", () => {
    expect(anneeInferee({ decision_date: "1997-10-31", case_id: "1997canlii335" })).toBe(1997);
  });

  it("rend 0 — et non une année devinée — sur un identifiant illisible", () => {
    expect(anneeInferee({ decision_date: null, case_id: "scc-csc-abc" })).toBe(0);
    expect(anneeInferee({ decision_date: null, case_id: "" })).toBe(0);
  });

  it("une ligne SANS DATE reste dans une fenêtre d'année, bornes comprises", async () => {
    // Le repli portait sur `neutral_cite`, absente des arrêts d'avant 2000 : 1 634 des
    // 1 819 lignes concernées en production n'en avaient aucune, et sortaient donc de
    // TOUTE recherche locale bornée par année. Le trou ne se voyait pas parce qu'une
    // date fabriquée tenait le filtre en sous-main.
    await upsertCase(
      db,
      row({
        case_id: "1997canlii335",
        database_id: "csc-scc",
        title: "Godbout c. Longueuil (Ville)",
        title_norm: "godbout c longueuil ville",
        neutral_cite: null,
        decision_date: null,
        source: "sweep",
      }),
    );
    const dans = await searchLocal(db, "Godbout Longueuil", {
      databaseId: "csc-scc",
      yearFrom: 1997,
      yearTo: 1997,
    });
    expect(dans.map((r) => r.case_id)).toContain("1997canlii335");
    // Et la borne EXCLUT bien ce qui est hors fenêtre : sans quoi le filtre ne filtre plus.
    const hors = await searchLocal(db, "Godbout Longueuil", {
      databaseId: "csc-scc",
      yearFrom: 1998,
      yearTo: 1999,
    });
    expect(hors).toHaveLength(0);
  });
});

describe("requêtes FTS sûres", () => {
  it("cite chaque jeton et ne laisse passer aucune syntaxe FTS5", () => {
    expect(ftsQuery("Hydro-Québec")).toBe('"hydro" "quebec"');
    expect(ftsQuery('Untel c. "X" OR NOT *')).not.toContain("OR ");
    expect(ftsQuery("")).toBeNull();
  });

  it("une entrée hostile ne fait pas échouer la recherche", async () => {
    await upsertCase(db, row());
    for (const hostile of ['" OR "', "NEAR(a b)", "*", "^^^", "a AND NOT b"]) {
      await expect(searchLocal(db, hostile)).resolves.toBeInstanceOf(Array);
    }
  });
});

describe("conversion des réponses de l'API", () => {
  it("CLÉE la fiche sur l'identifiant DEMANDÉ, pas sur celui que CanLII renvoie", () => {
    // L'API rend `caseId` sous la clef de SA langue : on demande « 2008scc9 » et elle
    // répond « {"fr": "2008csc9"} ». Clée sur la réponse, la fiche serait rangée là où
    // aucune résolution ultérieure ne la cherche : le cache ne servirait jamais et
    // chaque vérification rappellerait l'API. La langue renvoyée reste dans `lang`.
    const r = rowFromMetadata(
      {
        databaseId: "csc-scc",
        caseId: { fr: "2008csc9" },
        title: "Dunsmuir c. Nouveau-Brunswick",
        citation: "[2008] 1 RCS 190, 2008 CSC 9 (CanLII)",
        decisionDate: "2008-03-07",
        docketNumber: "31459",
        url: "https://canlii.ca/t/1vxsn",
        concatenatedId: "2008csc-scc9",
      },
      { databaseId: "csc-scc", caseId: "2008scc9" },
      "lookup",
    );
    expect(r.case_id).toBe("2008scc9"); // ce qu'on a demandé
    expect(r.lang).toBe("fr"); // la langue sous laquelle CanLII l'a clée
    expect(r.concatenated_id).toBe("2008csc-scc9"); // la forme canonique, conservée
    expect(r.neutral_cite).toBe("2008 CSC 9");
    expect(r.title_norm).toContain("nouveau brunswick");
  });

  it("retombe sur les identifiants demandés quand la réponse est muette", () => {
    const r = rowFromMetadata({}, { databaseId: "qcca", caseId: "2020qcca495" }, "lookup");
    expect(r.database_id).toBe("qcca");
    expect(r.case_id).toBe("2020qcca495");
    expect(r.title).toBe("(intitulé absent)");
  });

  it("extractNeutral trouve la forme neutre au milieu d'une citation composée", () => {
    expect(extractNeutral("[2008] 1 RCS 190, 2008 CSC 9 (CanLII)")).toBe("2008 CSC 9");
    expect(extractNeutral("[1996] 3 R.C.S. 211")).toBeNull();
    expect(extractNeutral(null)).toBeNull();
  });

  it("rejette un élément de liste sans caseId exploitable", () => {
    expect(rowFromListItem({ title: "x" }, "qcca", "fr", "sweep")).toBeNull();
  });

  it("une ligne de LISTE n'a NI date NI numéro de dossier NI hyperlien (invariant 3)", () => {
    // ⚠ Ce test passait déjà AVANT le correctif du 2026-09-17, et c'est tout son
    //   intérêt : la conversion était juste ; c'est l'APPELANT qui reposait un
    //   1er janvier sur la ligne, juste avant l'UPSERT. On le garde pour fixer la
    //   frontière — ce qui est garanti ICI, et ce qui ne peut pas l'être.
    const r = rowFromListItem(
      {
        databaseId: "qcca",
        caseId: { fr: "2005qcca304" },
        title: "Association c. Hydro-Québec",
        citation: "2005 QCCA 304 (CanLII)",
      },
      "qcca",
      "fr",
      "sweep",
    )!;
    expect(r.decision_date).toBeNull();
    expect(r.docket_number).toBeNull();
    expect(r.url).toBeNull();
    expect(r.source).toBe("sweep");
  });
});

describe("citateur : TTL différencié et « vide » ≠ « jamais demandé »", () => {
  const edge = (rel: "cited" | "citing") => ({
    from_database_id: "csc-scc",
    from_case_id: "2008scc9",
    rel,
    to_database_id: "qcca",
    to_case_id: "2005qcca304",
    to_legislation_id: null,
    to_title: "Une décision citée",
    to_citation: "2005 QCCA 304 (CanLII)",
    fetched_at: "2026-07-23T00:00:00.000Z",
  });

  it("distingue « jamais demandé » (null) de « demandé, vide » (tableau vide)", async () => {
    expect(await getCachedEdges(db, "csc-scc", "2008scc9", "citing")).toBeNull();
    await replaceEdges(db, "csc-scc", "2008scc9", "citing", []);
    const apres = await getCachedEdges(db, "csc-scc", "2008scc9", "citing");
    expect(apres).not.toBeNull();
    expect(apres!.edges).toEqual([]);
  });

  it("remplace intégralement plutôt que d'accumuler", async () => {
    await replaceEdges(db, "csc-scc", "2008scc9", "cited", [edge("cited"), edge("cited")]);
    await replaceEdges(db, "csc-scc", "2008scc9", "cited", [edge("cited")]);
    const r = await getCachedEdges(db, "csc-scc", "2008scc9", "cited");
    expect(r!.edges).toHaveLength(1);
  });

  it("`citing` périme à 30 jours, `cited` et `legislation` jamais", () => {
    const vieux = "2026-01-01T00:00:00.000Z";
    const now = new Date("2026-07-23T00:00:00.000Z");
    expect(edgeStale("citing", vieux, now)).toBe(true);
    expect(edgeStale("cited", vieux, now)).toBe(false);
    expect(edgeStale("legislation", vieux, now)).toBe(false);
    const recent = "2026-07-20T00:00:00.000Z";
    expect(edgeStale("citing", recent, now)).toBe(false);
  });
});

describe("répertoire et auto-correction", () => {
  it("charge le répertoire RÉCONCILIÉ des migrations (0002 puis 0003)", async () => {
    const dir = await loadDirectory(db);
    expect(dir.courtCodes.get("CSC")).toMatchObject({ database_id: "csc-scc", verified: 1 });
    expect(dir.courtCodes.get("QCCA")).toMatchObject({ database_id: "qcca", verified: 1 });
    expect(dir.parenCodes.get("QC/CQ")).toMatchObject({ database_id: "qccq" });
  });

  it("la migration 0003 corrige les databaseId démentis par CanLII", async () => {
    // Régression sur la réconciliation du 2026-07-23 : ces quatre correspondances
    // ont été mesurées contre l'API vivante. Si 0002 était réappliquée seule sur une
    // base neuve, les hypothèses fausses reviendraient — d'où cette garde.
    const dir = await loadDirectory(db);
    // « caf-fca » et « cf-fc » n'existent pas ; les bases réelles sont fca et fct.
    expect(dir.courtCodes.get("CAF")).toMatchObject({ database_id: "fca", caseid_code: "caf" });
    expect(dir.courtCodes.get("FCA")).toMatchObject({ database_id: "fca", caseid_code: "fca" });
    expect(dir.courtCodes.get("CF")).toMatchObject({ database_id: "fct", caseid_code: "cf" });
    expect(dir.courtCodes.get("FC")).toMatchObject({ database_id: "fct", caseid_code: "fc" });
    // Le fragment FRANÇAIS de la Cour canadienne de l'impôt est « cci », non « tcc ».
    expect(dir.courtCodes.get("CCI")).toMatchObject({ database_id: "cci-tcc", caseid_code: "cci" });
    // Le TAL a gardé le databaseId de la Régie du logement.
    expect(dir.courtCodes.get("QCTAL")).toMatchObject({
      database_id: "qcrdl",
      caseid_code: "qctal",
    });
  });

  it("un répertoire vide ou vieux de plus de 7 jours est périmé", async () => {
    expect(await directoryStale(db)).toBe(true);
    await db
      .prepare(
        "INSERT INTO databases (id, kind, jurisdiction, refreshed_at) VALUES ('qcca','case','qc',?)",
      )
      .bind("2026-07-22T00:00:00.000Z")
      .run();
    expect(await directoryStale(db, new Date("2026-07-23T00:00:00Z"))).toBe(false);
    expect(await directoryStale(db, new Date("2026-08-23T00:00:00Z"))).toBe(true);
  });

  it("signale les hypothèses d'amorçage démenties par le répertoire réel (§4.3)", async () => {
    // Répertoire réel : qcca existe, caf-fca n'existe pas.
    await db
      .prepare(
        "INSERT INTO databases (id, kind, jurisdiction, refreshed_at) VALUES ('qcca','case','qc','2026-07-23T00:00:00Z'), ('csc-scc','case','ca','2026-07-23T00:00:00Z')",
      )
      .run();
    const { courts } = await directoryMismatches(db);
    const codes = courts.map((c) => c.code);
    expect(codes).toContain("CAF"); // caf-fca absent => hypothèse démentie
    expect(codes).not.toContain("QCCA");
    expect(codes).not.toContain("CSC");
  });

  it("ne signale rien tant que le répertoire n'a jamais été rafraîchi", async () => {
    const { courts, parens } = await directoryMismatches(db);
    expect(courts).toEqual([]);
    expect(parens).toEqual([]);
  });

  it("confirme une correspondance et la passe à verified = 1", async () => {
    const r = await confirmCourtCode(db, "CSC", "csc-scc", "scc", "2008csc-scc9", "confirmé");
    expect(r.verified).toBe(true);
    const dir = await loadDirectory(db);
    expect(dir.courtCodes.get("CSC")).toMatchObject({ verified: 1, caseid_code: "scc" });
  });

  it("REFUSE de confirmer quand concatenatedId dément le databaseId (§6.3)", async () => {
    // Un appel a réussi, mais sur un identifiant qui n'est pas celui qu'on croyait.
    const r = await confirmCourtCode(db, "CAF", "caf-fca", "fca", "2019fca100", "essai");
    expect(r.verified).toBe(false);
    expect(r.note).toContain("NON confirmée");
    const dir = await loadDirectory(db);
    expect(dir.courtCodes.get("CAF")?.verified).toBe(0);
  });
});

describe("télémétrie : elle n'échoue jamais l'outil qu'elle observe", () => {
  it("consigne une ligne par invocation, verdict compris", async () => {
    await logSearch(db, {
      tool: "jurisprudence_verify_citations",
      query: "2008 CSC 9",
      result_count: 1,
      verdict: "CONFIRMÉE",
    });
    const r = await db
      .prepare("SELECT tool, query, verdict, result_count FROM search_log")
      .first<{ tool: string; verdict: string; result_count: number }>();
    expect(r).toMatchObject({
      tool: "jurisprudence_verify_citations",
      verdict: "CONFIRMÉE",
      result_count: 1,
    });
  });

  it("consigne un lot en un aller-retour", async () => {
    await logSearchBatch(db, [
      { tool: "t", query: "a", result_count: 0, verdict: "INTROUVABLE" },
      { tool: "t", query: "b", result_count: 1, verdict: "CONFIRMÉE" },
    ]);
    const n = await db.prepare("SELECT COUNT(*) AS n FROM search_log").first<{ n: number }>();
    expect(n?.n).toBe(2);
  });

  it("tronque une requête démesurée plutôt que de refuser d'écrire", async () => {
    await logSearch(db, { tool: "t", query: "x".repeat(5000), result_count: 0 });
    const r = await db.prepare("SELECT query FROM search_log").first<{ query: string }>();
    expect(r!.query.length).toBe(400);
  });

  it("api_usage s'additionne par jour UTC", async () => {
    const jour = new Date("2026-07-23T18:00:00Z");
    await flushUsage(db, { calls: 3, errors: 1, throttled: 0 }, jour);
    await flushUsage(db, { calls: 2, errors: 0, throttled: 1 }, jour);
    const r = await db
      .prepare("SELECT * FROM api_usage WHERE day = ?")
      .bind(utcDay(jour))
      .first<{ calls: number; errors: number; throttled: number }>();
    expect(r).toMatchObject({ calls: 5, errors: 1, throttled: 1 });
  });

  it("n'écrit rien quand aucun appel n'a été fait", async () => {
    await flushUsage(db, { calls: 0, errors: 0, throttled: 0 });
    const n = await db.prepare("SELECT COUNT(*) AS n FROM api_usage").first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it("avale une erreur d'écriture sans la propager", async () => {
    const casse = {
      prepare: () => {
        throw new Error("table absente");
      },
      batch: () => {
        throw new Error("table absente");
      },
    } as unknown as D1Database;
    await expect(
      logSearch(casse, { tool: "t", query: "q", result_count: 0 }),
    ).resolves.toBeUndefined();
    await expect(
      logSearchBatch(casse, [{ tool: "t", query: "q", result_count: 0 }]),
    ).resolves.toBeUndefined();
    await expect(flushUsage(casse, { calls: 1, errors: 0, throttled: 0 })).resolves.toBeUndefined();
    await expect(upsertCase(casse, row())).resolves.toBeUndefined();
  });
});
