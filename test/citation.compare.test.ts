/**
 * Comparaison d'intitulés (spécification §6.5 et §13).
 *
 * Rappel du contrat : un appariement PARTIEL vaut DISCORDANTE en aval, jamais
 * CONFIRMÉE. Ces tests verrouillent la frontière entre les trois verdicts.
 */
import { describe, expect, it } from "vitest";

import { compareTitles, titleSimilarity } from "../src/citation/compare";
import { flattenCaseId, fold, tokens } from "../src/citation/normalize";

describe("§6.5 — pliage et jetons", () => {
  it("plie les diacritiques et la casse", () => {
    expect(fold("Québec")).toBe("quebec");
    expect(fold("HYDRO-QUÉBEC")).toBe("hydro quebec");
    expect(fold("Nouveau-Brunswick")).toBe("nouveau brunswick");
  });

  it("retire les jetons vides de sens mais JAMAIS les nombres", () => {
    expect(tokens("Droit de la famille — 20495")).toEqual(["droit", "famille", "20495"]);
    expect(tokens("Untel c. Unetelle")).toEqual(["untel", "unetelle"]);
  });

  it("neutralise les formes sociétaires", () => {
    expect(tokens("9044-3422 Québec Inc.")).toEqual(tokens("9044-3422 Quebec inc"));
  });
});

describe("§13 — matrice de comparaison d'intitulés", () => {
  it("accents : Québec ≡ Quebec", () => {
    expect(
      compareTitles("Ville de Québec c. Tremblay", "Ville de Quebec c. Tremblay").verdict,
    ).toBe("appariement");
  });

  it("formes sociétaires : « 9044-3422 Québec Inc. » ≡ « 9044-3422 Quebec inc »", () => {
    expect(
      compareTitles("9044-3422 Québec Inc. c. Gagnon", "9044-3422 Quebec inc c Gagnon").verdict,
    ).toBe("appariement");
  });

  it("séparateurs : « c. » ≡ « v. »", () => {
    expect(compareTitles("Untel c. Unetelle", "Untel v. Unetelle").verdict).toBe("appariement");
  });

  it("intitulés anonymisés : le NUMÉRO tranche", () => {
    expect(
      compareTitles("Droit de la famille — 20495", "Droit de la famille — 20495").verdict,
    ).toBe("appariement");
    // Deux décisions distinctes de la même série ne doivent PAS s'apparier, alors
    // qu'elles partagent tous leurs jetons alphabétiques.
    expect(
      compareTitles("Droit de la famille — 20495", "Droit de la famille — 21830").verdict,
    ).toBe("discordance");
  });

  it("l'absence de patronyme ne produit pas de discordance sur un intitulé anonymisé", () => {
    // Piège explicite de §6.5 : ces intitulés ne contiennent AUCUN nom de partie.
    const r = compareTitles(
      "Protection de la jeunesse — 231234",
      "Protection de la jeunesse — 231234",
    );
    expect(r.verdict).toBe("appariement");
    expect(r.manquants).toEqual([]);
  });

  it("inversion des parties ⇒ appariement", () => {
    expect(compareTitles("Untel c. Unetelle", "Unetelle c. Untel").verdict).toBe("appariement");
  });

  it("patronyme différent ⇒ discordance", () => {
    expect(compareTitles("Tremblay c. Gagnon", "Bouchard c. Lavoie").verdict).toBe("discordance");
  });

  it("l'exemple DISCORDANTE de l'annexe A.1 n'est PAS un appariement", () => {
    const r = compareTitles(
      "Syndicat des employés d'Hydro-Québec c. Hydro-Québec",
      "Association provinciale des retraités d'Hydro-Québec c. Hydro-Québec",
    );
    expect(r.verdict).not.toBe("appariement");
  });

  it("un intitulé plus court entièrement contenu dans le plus long ⇒ appariement", () => {
    expect(
      compareTitles("Dunsmuir c. Nouveau-Brunswick", "Dunsmuir c. Nouveau-Brunswick (Conseil)")
        .verdict,
    ).toBe("appariement");
  });

  it("B-N3 : normalise St/Saint, Ste/Sainte, P.G./Procureur général, formes féminines/plurielles et Compagnie", () => {
    expect(
      compareTitles("P.G. du Québec c. Untel", "Procureure générale du Québec c. Untel").verdict,
    ).toBe("appariement");
    expect(
      compareTitles(
        "Centrale des syndicats du Québec c. P.G. Québec",
        "Centrale des syndicats du Québec c. Québec (Procureure générale)",
      ).verdict,
    ).toBe("appariement");
    expect(compareTitles("P. G. Tremblay c. Gagnon", "Procureur général c. Gagnon").verdict).toBe(
      "discordance",
    );
    expect(compareTitles("Ville de St-Jérôme", "Ville de Saint-Jérôme").verdict).toBe(
      "appariement",
    );
    expect(compareTitles("Compagnie Tremblay c. Gagnon", "Cie Tremblay c. Gagnon").verdict).toBe(
      "appariement",
    );
  });
});

describe("similarité pour §7.5", () => {
  it("rend une valeur sur [0, 1] et dépasse le seuil de 0,5 pour un même litige", () => {
    expect(titleSimilarity("Untel c. Unetelle", "Unetelle c. Untel")).toBe(1);
    expect(titleSimilarity("Tremblay c. Gagnon", "Bouchard c. Lavoie")).toBeLessThan(0.5);
  });
});

describe("annexe B — caseId est un objet clé par langue dans les listes", () => {
  it("aplatit { fr: … } et { en: … }", () => {
    expect(flattenCaseId({ en: "2008scc9" })).toEqual({ caseId: "2008scc9", lang: "en" });
    expect(flattenCaseId({ fr: "2008csc9" })).toEqual({ caseId: "2008csc9", lang: "fr" });
  });

  it("préfère la langue demandée quand les deux sont présentes", () => {
    expect(flattenCaseId({ en: "2008scc9", fr: "2008csc9" }, "en")).toEqual({
      caseId: "2008scc9",
      lang: "en",
    });
  });

  it("accepte aussi la forme chaîne des fiches individuelles", () => {
    expect(flattenCaseId("2008scc9")).toEqual({ caseId: "2008scc9", lang: null });
  });

  it("rend null sur une valeur absente ou vide", () => {
    expect(flattenCaseId(null)).toBeNull();
    expect(flattenCaseId({})).toBeNull();
    expect(flattenCaseId("")).toBeNull();
  });
});
