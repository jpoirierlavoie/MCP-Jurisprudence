/**
 * Parseur du document source `data/autorites-dispensees.md`.
 *
 * Module Node sans dépendance externe : extrait les 15 listes, leurs métadonnées
 * procédurales, les 550 entrées et les 459 hyperliens, puis contrôle la parité
 * exacte avec la table `## Sommaire`.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
export const RACINE_DEPOT = resolve(ICI, "../..");
export const CHEMIN_MD_AUTORITES = resolve(RACINE_DEPOT, "data/autorites-dispensees.md");

export const LIST_METADATA = {
  1.1: {
    listId: "qcca-civil",
    tribunal: "qcca",
    tribunalNomFr: "Cour d'appel du Québec",
    tribunalNomEn: "Court of Appeal of Québec",
    databaseId: "qcca",
    jurisdiction: "qc",
    titleFr: "Arrêts réputés faire partie du cahier de sources — matière civile",
    titleEn: "Judgments Deemed Part of the Book of Authorities — Civil Matters",
    versionLabel: "non datée",
    effectiveDate: null,
    modifiedDate: "2026-03-02",
    compiledAt: "2026-11-24",
    sourceUrl:
      "https://courdappelduquebec.ca/matiere-civile/guide-matiere-civile/cahier-de-sources-et-audience",
    directiveUrl: null,
    relatedUrls: [],
    fondementReglementaire: "art. 61 et 60 al. 2 R.C.a.Q.m.civ.",
    consigneCitation:
      "Arrêts réputés faire partie du cahier de sources (art. 61 R.C.a.Q.m.civ.). Pour attirer l'attention de la Cour sur l'un d'eux, se limiter aux extraits pertinents avec les pages précédente et suivante et le sommaire (art. 60 al. 2 R.C.a.Q.m.civ.). Dépôt des cahiers sur support technologique uniquement (actualité du 2 mars 2026).",
  },
  1.2: {
    listId: "qcca-criminel",
    tribunal: "qcca",
    tribunalNomFr: "Cour d'appel du Québec",
    tribunalNomEn: "Court of Appeal of Québec",
    databaseId: "qcca",
    jurisdiction: "qc",
    titleFr: "Arrêts réputés faire partie du cahier de sources — matière criminelle et pénale",
    titleEn: "Judgments Deemed Part of the Book of Authorities — Criminal and Penal Matters",
    versionLabel: "non datée",
    effectiveDate: null,
    modifiedDate: null,
    compiledAt: "2026-11-24",
    sourceUrl:
      "https://courdappelduquebec.ca/matiere-criminelle-et-penale/guide-matiere-criminelle/cahier-de-sources-et-audience",
    directiveUrl: null,
    relatedUrls: [],
    fondementReglementaire: "art. 48 et 47 al. 4 R.C.a.Q.m.c. ; art. 43 et 42 al. 4 R.C.a.Q.m.p.",
    consigneCitation:
      "Arrêts réputés faire partie du cahier de sources (art. 48 R.C.a.Q.m.c. ; art. 43 R.C.a.Q.m.p.). La reproduction d'extraits suit les mêmes conditions (art. 47 al. 4 R.C.a.Q.m.c. ; art. 42 al. 4 R.C.a.Q.m.p.).",
  },
  2.1: {
    listId: "tat-dsst",
    tribunal: "tat",
    tribunalNomFr: "Tribunal administratif du travail",
    tribunalNomEn: "Administrative Labour Tribunal",
    databaseId: "qctat",
    jurisdiction: "qc",
    titleFr: "Liste de jurisprudence — Division de la santé et de la sécurité du travail",
    titleEn: "List of Authorities — Occupational Health and Safety Division",
    versionLabel: "non datée",
    effectiveDate: null,
    modifiedDate: null,
    compiledAt: "2026-11-24",
    sourceUrl:
      "https://www.tat.gouv.qc.ca/fileadmin/tat/6Le_Tribunal/Fonctionnement_du_Tribunal/Jurisprudence_DSST.pdf",
    directiveUrl: null,
    relatedUrls: [],
    fondementReglementaire: null,
    consigneCitation:
      "Aucun énoncé de portée ou de fondement réglementaire ne figure dans le PDF source (liste placée sous « Fonctionnement du Tribunal »). Vérifier la pratique applicable auprès du Tribunal avant d'omettre une décision.",
  },
  2.2: {
    listId: "tat-drt",
    tribunal: "tat",
    tribunalNomFr: "Tribunal administratif du travail",
    tribunalNomEn: "Administrative Labour Tribunal",
    databaseId: "qctat",
    jurisdiction: "qc",
    titleFr: "Liste de jurisprudence — Division des relations du travail",
    titleEn: "List of Authorities — Labour Relations Division",
    versionLabel: "non datée",
    effectiveDate: null,
    modifiedDate: null,
    compiledAt: "2026-11-24",
    sourceUrl:
      "https://www.tat.gouv.qc.ca/fileadmin/tat/6Le_Tribunal/Fonctionnement_du_Tribunal/Jurisprudence_DRT.pdf",
    directiveUrl: null,
    relatedUrls: [],
    fondementReglementaire: null,
    consigneCitation:
      "Aucun énoncé de portée ou de fondement réglementaire ne figure dans le PDF source (liste placée sous « Fonctionnement du Tribunal »). Vérifier la pratique applicable auprès du Tribunal avant d'omettre une décision.",
  },
  2.3: {
    listId: "tat-construction",
    tribunal: "tat",
    tribunalNomFr: "Tribunal administratif du travail",
    tribunalNomEn: "Administrative Labour Tribunal",
    databaseId: "qctat",
    jurisdiction: "qc",
    titleFr:
      "Liste de jurisprudence — Division de la construction et de la qualification professionnelle",
    titleEn: "List of Authorities — Construction and Occupational Qualification Division",
    versionLabel: "non datée",
    effectiveDate: null,
    modifiedDate: null,
    compiledAt: "2026-11-24",
    sourceUrl:
      "https://www.tat.gouv.qc.ca/fileadmin/tat/6Le_Tribunal/Fonctionnement_du_Tribunal/Jurisprudence_Construction.pdf",
    directiveUrl: null,
    relatedUrls: [],
    fondementReglementaire: null,
    consigneCitation:
      "Aucun énoncé de portée ou de fondement réglementaire ne figure dans le PDF source (liste placée sous « Fonctionnement du Tribunal »). Vérifier la pratique applicable auprès du Tribunal avant d'omettre une décision.",
  },
  3: {
    listId: "tdp",
    tribunal: "tdp",
    tribunalNomFr: "Tribunal des droits de la personne",
    tribunalNomEn: "Human Rights Tribunal",
    databaseId: "qctdp",
    jurisdiction: "qc",
    titleFr: "Liste commune de jurisprudence (et Directive, par. 41)",
    titleEn: "Common List of Authorities (and Directive, para. 41)",
    versionLabel: "en vigueur 2023-09-01",
    effectiveDate: "2023-09-01",
    modifiedDate: "2025-10-21",
    compiledAt: "2026-11-24",
    sourceUrl:
      "https://tribunaldesdroitsdelapersonne.ca/fileadmin/tribunal-droits-personne/pdf/Directives_et_LCJ/2023-08-31_Liste_commune_de_jurisprudence_TDP_FR.pdf",
    directiveUrl:
      "https://tribunaldesdroitsdelapersonne.ca/fileadmin/tribunal-droits-personne/pdf/Directives_et_LCJ/2025-10-21_Directive_du_Tribunal_des_droits_de_la_personne.pdf",
    relatedUrls: [],
    fondementReglementaire:
      "art. 26 Règlement du Tribunal des droits de la personne ; Directive du TDP (par. 36, 40 3° et 41)",
    consigneCitation:
      "Dispensé de reproduction (Directive, par. 41) : mentionner au cahier et à la liste de sources avec pages ou paragraphes pertinents et renvoi à la liste commune (ex. « Béliveau St-Jacques, page ou paragraphe, LCJTDP, onglet 4 »). Transmission PDF par courriel au plus tard 3 jours ouvrables avant l'audience (par. 36).",
  },
  4: {
    listId: "tp",
    tribunal: "tp",
    tribunalNomFr: "Tribunal des professions",
    tribunalNomEn: "Professions Tribunal",
    databaseId: "qctp",
    jurisdiction: "qc",
    titleFr: "Liste commune de jurisprudence",
    titleEn: "Common List of Authorities",
    versionLabel: "2022-02",
    effectiveDate: "2022-02-01",
    modifiedDate: null,
    compiledAt: "2026-11-24",
    sourceUrl:
      "https://tribunaldesprofessions.ca/fileadmin/tribunal-des-professions/pdf/TribProf_ListeCommuneJurisprudence.pdf",
    directiveUrl: null,
    relatedUrls: [],
    fondementReglementaire: null,
    consigneCitation:
      "Le document source n'énonce ni la portée de la dispense ni son fondement. Vérifier les directives du Tribunal des professions et renvoyer au numéro d'onglet le cas échéant.",
  },
  5: {
    listId: "tmf",
    tribunal: "tmf",
    tribunalNomFr: "Tribunal administratif des marchés financiers",
    tribunalNomEn: "Financial Markets Administrative Tribunal",
    databaseId: "qcbdrvm",
    jurisdiction: "qc",
    titleFr: "Liste commune de jurisprudence et cahier de sources",
    titleEn: "Common List of Authorities and Book of Authorities",
    versionLabel: "non datée (« juin 2017 » dans le nom du fichier)",
    effectiveDate: null,
    modifiedDate: null,
    compiledAt: "2026-11-24",
    sourceUrl:
      "https://tmf.gouv.qc.ca/fileadmin/Documents/PDF/Documents_Divers_PDF/LISTE_COMMUNE_DE_JURISPRUDENCE_juin_2017.pdf",
    directiveUrl: null,
    relatedUrls: [],
    fondementReglementaire: "Directive interne de la liste commune de jurisprudence du TMF",
    consigneCitation:
      "Une décision accessible gratuitement par hyperlien n'a pas à être reproduite intégralement : la partie peut n'en reproduire que l'extrait pertinent, en joignant la référence et l'hyperlien.",
  },
  6.1: {
    listId: "cf-imm-general",
    tribunal: "cf",
    tribunalNomFr: "Cour fédérale",
    tribunalNomEn: "Federal Court",
    databaseId: "fct",
    jurisdiction: "ca",
    titleFr: "Vol. 1 — Droit de l'immigration et des réfugiés",
    titleEn: "Vol. 1 — Immigration and Refugee Law (General)",
    versionLabel: "2020-07",
    effectiveDate: "2020-07-01",
    modifiedDate: null,
    compiledAt: "2026-11-24",
    sourceUrl:
      "https://www.fct-cf.ca/Content/assets/pdf/base/Vol-1-Immigration-Book-of-Authorities-General-final-bilingual.pdf",
    directiveUrl: "https://www.fct-cf.ca/en/pages/law-and-practice/notices",
    relatedUrls: [
      "https://www.fct-cf.gc.ca/fr/pages/droit-et-trousse-doutils/questions-certifiees-immigration-citoyennete",
    ],
    fondementReglementaire: "Avis aux parties et à la profession — Liste partagée des autorités",
    consigneCitation:
      "Liste partagée des autorités : une partie n'est pas obligée d'ajouter ces décisions à son cahier d'autorités, mais il lui revient de vérifier qu'elles demeurent valables (et de consulter l'avis modifié sur le site de la Cour).",
  },
  6.2: {
    listId: "cf-imm-sursis",
    tribunal: "cf",
    tribunalNomFr: "Cour fédérale",
    tribunalNomEn: "Federal Court",
    databaseId: "fct",
    jurisdiction: "ca",
    titleFr: "Vol. 1 — Reports de l'exécution et sursis",
    titleEn: "Vol. 1 — Deferrals and Stays of Removal",
    versionLabel: "2020-07",
    effectiveDate: "2020-07-01",
    modifiedDate: null,
    compiledAt: "2026-11-24",
    sourceUrl:
      "https://www.fct-cf.ca/Content/assets/pdf/base/Vol-1-Immigration-Book-of-Authorities-Stay-final-bilingual.pdf",
    directiveUrl: "https://www.fct-cf.ca/en/pages/law-and-practice/notices",
    relatedUrls: [],
    fondementReglementaire: "Avis aux parties et à la profession — Liste partagée des autorités",
    consigneCitation:
      "Liste partagée des autorités : une partie n'est pas obligée d'ajouter ces décisions à son cahier d'autorités, mais il lui revient de vérifier qu'elles demeurent valables.",
  },
  6.3: {
    listId: "cf-autochtone",
    tribunal: "cf",
    tribunalNomFr: "Cour fédérale",
    tribunalNomEn: "Federal Court",
    databaseId: "fct",
    jurisdiction: "ca",
    titleFr: "Vol. 2 — Aboriginal Law",
    titleEn: "Vol. 2 — Aboriginal Law",
    versionLabel: "2012-01-23",
    effectiveDate: "2012-01-23",
    modifiedDate: "2019-04-08",
    compiledAt: "2026-11-24",
    sourceUrl: "https://www.fct-cf.ca/en/pages/law-and-practice/notices/volume-2-aboriginal-law",
    directiveUrl: "https://www.fct-cf.ca/en/pages/law-and-practice/notices",
    relatedUrls: [],
    fondementReglementaire: "Avis aux parties et à la profession — Liste partagée des autorités",
    consigneCitation:
      "Les volumes 2 à 5 ne contiennent pas d'énoncé de portée propre ; consulter l'avis modifié aux parties et à la profession de la Cour fédérale.",
  },
  6.4: {
    listId: "cf-travail",
    tribunal: "cf",
    tribunalNomFr: "Cour fédérale",
    tribunalNomEn: "Federal Court",
    databaseId: "fct",
    jurisdiction: "ca",
    titleFr: "Vol. 3 — Labour Law, Human Rights, Privacy and Access Review",
    titleEn: "Vol. 3 — Labour Law, Human Rights, Privacy and Access Review",
    versionLabel: "2012-01-23",
    effectiveDate: "2012-01-23",
    modifiedDate: null,
    compiledAt: "2026-11-24",
    sourceUrl:
      "https://www.fct-cf.ca/en/pages/law-and-practice/notices/volume-3-labour-law-human-rights-privacy-and-access-review",
    directiveUrl: "https://www.fct-cf.ca/en/pages/law-and-practice/notices",
    relatedUrls: [],
    fondementReglementaire: "Avis aux parties et à la profession — Liste partagée des autorités",
    consigneCitation:
      "Les volumes 2 à 5 ne contiennent pas d'énoncé de portée propre ; consulter l'avis modifié aux parties et à la profession de la Cour fédérale.",
  },
  6.5: {
    listId: "cf-pi",
    tribunal: "cf",
    tribunalNomFr: "Cour fédérale",
    tribunalNomEn: "Federal Court",
    databaseId: "fct",
    jurisdiction: "ca",
    titleFr: "Vol. 4 — Intellectual Property Law",
    titleEn: "Vol. 4 — Intellectual Property Law",
    versionLabel: "2013-09-10",
    effectiveDate: "2013-09-10",
    modifiedDate: "2019-03-23",
    compiledAt: "2026-11-24",
    sourceUrl:
      "https://www.fct-cf.ca/en/pages/law-and-practice/notices/volume-4-intellectual-property-law",
    directiveUrl: "https://www.fct-cf.ca/en/pages/law-and-practice/notices",
    relatedUrls: [],
    fondementReglementaire: "Avis aux parties et à la profession — Liste partagée des autorités",
    consigneCitation:
      "Les volumes 2 à 5 ne contiennent pas d'énoncé de portée propre ; consulter l'avis modifié aux parties et à la profession de la Cour fédérale.",
  },
  6.6: {
    listId: "cf-concurrence",
    tribunal: "cf",
    tribunalNomFr: "Cour fédérale",
    tribunalNomEn: "Federal Court",
    databaseId: "fct",
    jurisdiction: "ca",
    titleFr: "Vol. 5 — Competition Law",
    titleEn: "Vol. 5 — Competition Law",
    versionLabel: "2015-10-15",
    effectiveDate: "2015-10-15",
    modifiedDate: null,
    compiledAt: "2026-11-24",
    sourceUrl:
      "https://www.fct-cf.ca/Content/assets/pdf/base/Common%20List%20of%20Authorities%20-%20vol%205%20-%20Competition%20Act%20-%20October%202015.pdf",
    directiveUrl: "https://www.fct-cf.ca/en/pages/law-and-practice/notices",
    relatedUrls: [],
    fondementReglementaire: "Avis aux parties et à la profession — Liste partagée des autorités",
    consigneCitation:
      "Les volumes 2 à 5 ne contiennent pas d'énoncé de portée propre ; consulter l'avis modifié aux parties et à la profession de la Cour fédérale.",
  },
  7: {
    listId: "comc",
    tribunal: "comc",
    tribunalNomFr: "Commission des oppositions des marques de commerce (OPIC)",
    tribunalNomEn: "Trademarks Opposition Board (CIPO)",
    databaseId: "tmob",
    jurisdiction: "ca",
    titleFr: "Common List of Authorities for Hearings",
    titleEn: "Common List of Authorities for Hearings",
    versionLabel: "non datée",
    effectiveDate: null,
    modifiedDate: null,
    compiledAt: "2026-11-24",
    sourceUrl:
      "https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks-opposition-board/common-list-authorities-hearings",
    directiveUrl: null,
    relatedUrls: [],
    fondementReglementaire:
      "Practice in Trademark Opposition Proceedings (section X.8) ; Practice in Section 45 Proceedings (section VII.7)",
    consigneCitation:
      "La partie qui fournit un cahier d'autorités n'est pas tenue d'y inclure une copie des décisions de la liste commune, mais doit identifier dans sa liste de jurisprudence celles sur lesquelles elle entend s'appuyer.",
  },
};

const COUR_NEUTRE_VERS_FAMILLE = {
  CSC: "csc-scc",
  SCC: "csc-scc",
  CAF: "fca",
  FCA: "fca",
  CF: "fct",
  FC: "fct",
  FCT: "fct",
  CFPI: "fct",
  CCI: "cci-tcc",
  TCC: "cci-tcc",
  QCCA: "qcca",
  QCCS: "qccs",
  QCCQ: "qccq",
  QCCM: "qccm",
  QCTAL: "qctal",
  QCTAT: "qctat",
  QCTAQ: "qctaq",
  QCTP: "qctp",
  QCTDP: "qctdp",
  QCCLP: "qcclp",
  QCCRT: "qccrt",
  QCBDRVM: "qcbdrvm",
  QCBDR: "qcbdr",
  QCTMF: "qctmf",
  BCCA: "bcca",
  YKCA: "ykca",
};

const SIGLE_CANON = new Map([
  ["RCS", "SCR"],
  ["SCR", "SCR"],
  ["RSC", "SCR"],
  ["RJQ", "RJQ"],
  ["RDJ", "RDJ"],
  ["CLP", "CLP"],
  ["CALP", "CALP"],
  ["RJDT", "RJDT"],
  ["TT", "TT"],
  ["RL", "RL"],
  ["RDT", "RDT"],
  ["FC", "FC"],
  ["CF", "FC"],
  ["FCR", "FCR"],
  ["RCF", "FCR"],
  ["CNLR", "CNLR"],
  ["FCJ", "FCJ"],
  ["CA", "CA"],
  ["CS", "CS"],
  ["CQ", "CQ"],
  ["AC", "AC"],
  ["US", "US"],
  ["CPR", "CPR"],
  ["DLR", "DLR"],
  ["FTR", "FTR"],
  ["NR", "NR"],
]);

export function normaliserSigleRecueil(rawSigle) {
  const s = rawSigle.replace(/\./g, "").replace(/\s+/g, " ").trim().toUpperCase();
  const serieMatch = /^(CPR|DLR)\s*\((\d+(?:ND|D|TH))\)$/i.exec(s);
  if (serieMatch) {
    return `${serieMatch[1].toUpperCase()}(${serieMatch[2].toUpperCase()})`;
  }
  const wheatMatch = /^US\s+(\d+\s+WHEAT)$/i.exec(s);
  if (wheatMatch) {
    return `US(${wheatMatch[1].replace(/\s+/g, "")})`;
  }
  return SIGLE_CANON.get(s) ?? s.replace(/\s+/g, "");
}

/** Extrait la clé canonique déterministe d'une référence juridique (après overrides). */
export function extraireFormesEtClef(texteCitation) {
  const texte = texteCitation.trim();
  const spans = [];
  const mask = () => {
    let out = texte;
    for (const [s, e] of spans) {
      out = `${out.slice(0, s)}${" ".repeat(e - s)}${out.slice(e)}`;
    }
    return out;
  };

  const canliiMatches = [];
  for (const rx of [
    /\b(1[89]\d{2}|20\d{2})\s*CanLII\s*(\d{1,7})\s*\(\s*([A-Z]{2})\s+([A-Z](?:\.?[A-Z]){0,5}\.?)\s*\)/gi,
    /\b(1[89]\d{2}|20\d{2})\s*CanLII\s*(\d{1,7})\s*\(\s*([A-Z](?:\.?[A-Z]){1,6}\.?)\s*\)/gi,
    /\b(1[89]\d{2}|20\d{2})\s*CanLII\s*(\d{1,7})\b/gi,
  ]) {
    const src = mask();
    rx.lastIndex = 0;
    for (const m of src.matchAll(rx)) {
      canliiMatches.push({
        kind: "canlii",
        year: Number(m[1]),
        number: Number(m[2]),
        raw: m[0].trim(),
      });
      spans.push([m.index, m.index + m[0].length]);
    }
  }

  const neutralMatches = [];
  const NEUT_RX = /\b(1[89]\d{2}|20\d{2})\s+([A-Za-z]{2,8})\s*(\d{1,6})\b/g;
  const srcNeut = mask();
  for (const m of srcNeut.matchAll(NEUT_RX)) {
    const code = m[2].toUpperCase();
    if (code === "CANLII") continue;
    if (!Object.hasOwn(COUR_NEUTRE_VERS_FAMILLE, code)) continue;
    neutralMatches.push({
      kind: "neutral",
      year: Number(m[1]),
      code,
      number: Number(m[3]),
      raw: m[0].trim(),
    });
    spans.push([m.index, m.index + m[0].length]);
  }

  const reporterMatches = [];
  const REP_BRACKET =
    /\[(1[89]\d{2}|20\d{2})\]\s*(\d+)?\s*(C\.?A\.?L\.?P\.?|CALP|C\.?L\.?P\.?|CLP|C\.?N\.?L\.?R\.?|CNLR|F\.?C\.?R\.?|FCR|F\.?C\.?J\.?|FCJ|F\.?C\.?|FC|C\.?F\.?|CF|R\.?C\.?S\.?|RCS|S\.?C\.?R\.?|SCR|R\.?S\.?C\.?|RSC|R\.?C\.?F\.?|RCF|R\.?J\.?D\.?T\.?|RJDT|R\.?J\.?Q\.?|RJQ|R\.?D\.?J\.?|RDJ|R\.?D\.?T\.?|RDT|R\.?L\.?|RL|T\.?T\.?|TT|C\.?A\.?|C\.?S\.?|C\.?Q\.?|A\.?C\.?|AC)\s*(?:No\.?\s*)?(\d+)/g;
  for (const m of mask().matchAll(REP_BRACKET)) {
    reporterMatches.push({
      kind: "reporter",
      year: Number(m[1]),
      volume: m[2] ? Number(m[2]) : null,
      reporter: m[3].trim(),
      page: Number(m[4]),
      raw: m[0].trim(),
    });
    spans.push([m.index, m.index + m[0].length]);
  }

  const REP_VOL =
    /(?:\(\s*(1[89]\d{2}|20\d{2})\s*\),?\s*)?\b(\d{1,4})\s+((?:C\.?P\.?R\.?|D\.?L\.?R\.?|F\.?T\.?R\.?|N\.?R\.?|A\.C\.|U\.\s*S\.)(?:\s*\.?\s*\(\s*(?:2d|3d|4th|5th)\s*\)|\s+\d+\s+Wheat\.)?)\s+(\d{1,5})(?:\s*\(\s*(1[89]\d{2}|20\d{2})\s*\))?/g;
  for (const m of mask().matchAll(REP_VOL)) {
    const year = m[1] ? Number(m[1]) : m[5] ? Number(m[5]) : null;
    reporterMatches.push({
      kind: "reporter",
      year,
      volume: Number(m[2]),
      reporter: m[3].replace(/\s+/g, " ").trim(),
      page: Number(m[4]),
      raw: m[0].trim(),
    });
    spans.push([m.index, m.index + m[0].length]);
  }

  const publisherMatches = [];
  const PUB_RX =
    /\b(J\.?E\.?\s*\d{2,4}-\d+|REJB\s*\d{4}-\d+|EYB\s*\d{4}-\d+|AZ-\d{6,10}|D\.?T\.?E\.?\s*\d{2,4}T?-\s*\d+|(?:1[89]\d{2}|20\d{2})\s+Carswell[A-Za-z]{2,12}\s+\d+)\b/gi;
  for (const m of mask().matchAll(PUB_RX)) {
    publisherMatches.push({ kind: "publisher", id: m[1].trim(), raw: m[1].trim() });
    spans.push([m.index, m.index + m[0].length]);
  }

  const docketMatches = [];
  for (const rx of [
    /\bC\.L\.P\.\s*(\d{6}-[0-9A-Z]{2,3}-\d{4})\b/gi,
    /\b(\d{2}-A-\d{2,5})\b/g,
    /\b(IMM-\d{1,6}-\d{2,4})\b/gi,
  ]) {
    for (const m of texte.matchAll(rx)) {
      docketMatches.push(m[1].toUpperCase());
    }
  }

  // Choix de la clé canonique déterministe
  let decisionKey;
  if (neutralMatches.length > 0) {
    const n = neutralMatches[0];
    const fam = COUR_NEUTRE_VERS_FAMILLE[n.code] ?? n.code.toLowerCase();
    decisionKey = `N:${fam}:${n.year}:${n.number}`;
  } else if (canliiMatches.length > 0) {
    const c = canliiMatches[0];
    decisionKey = `C:${c.year}:${c.number}`;
  } else if (reporterMatches.length > 0) {
    const r = reporterMatches[0];
    const sig = normaliserSigleRecueil(r.reporter);
    decisionKey = `R:${r.year ?? "_"}:${r.volume ?? "_"}:${sig}:${r.page}`;
  } else if (publisherMatches.length > 0) {
    const p = publisherMatches[0];
    decisionKey = `P:${p.id.toUpperCase().replace(/[.\s]/g, "")}`;
  } else if (docketMatches.length > 0) {
    decisionKey = `D:${docketMatches[0]}`;
  } else {
    decisionKey = `U:${texte
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 60)}`;
  }

  return {
    decisionKey,
    canliiMatches,
    neutralMatches,
    reporterMatches,
    publisherMatches,
    docketMatches,
  };
}

/** Corrections canoniques documentées dans les notes de transcription (sans modifier le Markdown). */
const OVERRIDES = [
  {
    match: (listId, raw) => listId === "cf-imm-sursis" && /Gateway City Church/i.test(raw),
    canonicalText: "Gateway City Church v Canada (National Revenue), 2013 FCA 126",
    erroneousSourceCitations: ["2016 CAF 126"],
    transcriptionNote:
      "Note 4 : la colonne française de la source porte « 2016 CAF 126 » (Canada c. Goodman), mais la colonne anglaise (2013 FCA 126) et le lien désignent Gateway City Church.",
  },
  {
    match: (listId, raw) => listId === "cf-pi" && /Miss Universe/i.test(raw),
    canonicalText: "Miss Universe, Inc. v. Bohna, [1995] 1 FC 614, 1994 CanLII 3534 (FCTAD)",
    erroneousSourceCitations: ["1994 CanLII 35340"],
    transcriptionNote:
      "Note 6 : la source imprime « 1994 CanLII 35340 », mais le lien et CanLII donnent 1994 CanLII 3534 (FCTAD).",
  },
  {
    match: (listId, raw) => listId === "cf-autochtone" && /^Calder v\. Attorney-General/i.test(raw),
    canonicalText:
      "Calder et al. v. Attorney-General of British Columbia, [1973] S.C.R. 313, 1973 CanLII 4 (SCC)",
    erroneousSourceCitations: [],
    transcriptionNote:
      "Note 5 : la source omet l'année devant « S.C.R. 313 » ; CanLII donne 1973 CanLII 4 (SCC), [1973] SCR 313.",
  },
  {
    match: (listId, raw) => listId === "cf-autochtone" && /R\. v\. Sappier/i.test(raw),
    canonicalText: "R. v. Sappier; R. v. Gray, 2006 SCC 54, [2006] 2 S.C.R. 686",
    erroneousSourceCitations: [],
    transcriptionNote:
      "Note 5 : la source omet le numéro de volume dans « [2006] S.C.R. 686 » ; il s'agit du volume 2.",
  },
  {
    match: (listId, raw) => listId === "cf-imm-general" && /Farnya v Chorny/i.test(raw),
    canonicalText: "Faryna v. Chorny, 1951 CanLII 252 (BC CA)",
    erroneousSourceCitations: [],
    transcriptionNote: "La source épelle l'intitulé « Farnya v Chorny » (Faryna v. Chorny).",
  },
  {
    match: (listId, raw) => listId === "cf-imm-general" && /^Suleiman\b/i.test(raw),
    canonicalText: "Suleiman v. Canada (Minister of Citizenship and Immigration), 2004 FC 1125",
    erroneousSourceCitations: ["2004 CF 1124"],
    transcriptionNote:
      "Audit CanLII : la source imprime « 2004 CF 1124 » (qui désigne Fournier c. Canada sur CanLII) ; la décision Suleiman correspond à 2004 FC 1125 ([2005] 2 R.C.F. 26).",
  },
];

function extraireNicknames(raw) {
  const nicks = [];
  for (const m of raw.matchAll(/\[«\s*([^»\]]+?)\s*»\]/g)) {
    nicks.push(m[1].trim());
  }
  for (const m of raw.matchAll(/\[(Raloxifene|Olanzapine FCA|Donepezil|Imatinib)\]/g)) {
    nicks.push(m[1].trim());
  }
  return nicks;
}

function extraireLangNote(raw) {
  const m =
    /\[(Version française indisponible)\]|(\(version française indisponible[^)]*\))|(\(colonne EN :[^)]+\))/i.exec(
      raw,
    );
  return m ? (m[1] ?? m[2] ?? m[3] ?? "").trim() : null;
}

function scinderCompose(citationText) {
  // TMF #9 & #19 : ", conf. par ..." ou " conf. par ..."
  const mConf = /^(.*?),?\s+conf\.\s+par\s+(.+)$/i.exec(citationText);
  if (mConf) {
    return { primary: mConf[1].trim(), affirming: mConf[2].trim() };
  }
  // FC Vol. 4-I : " aff'd ..."
  const mAff = /^(.*?)\s+aff'd\s+(.+)$/i.exec(citationText);
  if (mAff) {
    return { primary: mAff[1].trim(), affirming: mAff[2].trim() };
  }
  return { primary: citationText.trim(), affirming: null };
}

function parserSommaire(lignes) {
  const attendu = new Map();
  let dansSommaire = false;
  for (const l of lignes) {
    if (/^## Sommaire\s*$/.test(l)) {
      dansSommaire = true;
      continue;
    }
    if (dansSommaire && /^## /.test(l)) break;
    if (!dansSommaire || !l.startsWith("|")) continue;
    const cols = l
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cols.length < 7) continue;
    if (cols[0] === "Tribunal" || cols[0].startsWith("---") || cols[0].includes("**Total**")) {
      continue;
    }
    const sec = cols[5];
    attendu.set(sec, {
      entries: Number(cols[3]),
      withLinks: Number(cols[4]),
    });
  }
  return attendu;
}

function nettoyerCorpsEntree(brut, listId) {
  // Retirer les notes parenthétiques purement éditoriales en bout de ligne
  const propre = brut
    .replace(/\s*\(répète le no \d+ dans la source\)/gi, "")
    .replace(/\s*\(arrêt de la C\.S\.C\. classé sous la C\.A\.F\. dans la source\)/gi, "")
    .replace(/\s*\(colonne anglaise :[^)]+\)/gi, "")
    .replace(/\s*\(ainsi dans la colonne française; EN :[^)]+\)/gi, "")
    .replace(/\s*\(version française indisponible[^)]*\)/gi, "")
    .replace(/\s*\(colonne EN :[^)]+\)/gi, "")
    .replace(/\s*\[Version française indisponible\]/gi, "")
    .replace(/\s*\(année absente dans la source; voir la note \d+\)/gi, "")
    .replace(/\s*\(volume absent dans la source; voir la note \d+\)/gi, "")
    .replace(/\s*\[«\s*[^»\]]+\s*»\]/g, "")
    .replace(/\s*\[(Raloxifene|Olanzapine FCA|Donepezil|Imatinib)\]/g, "")
    .trim();

  if (listId === "cf-imm-general" || listId === "cf-imm-sursis") {
    // Ex.: "(EN : Canada (Citizenship and Immigration) v Kurukkal, 2010 FCA 230)"
    if (propre.endsWith(")")) {
      let depth = 0;
      for (let i = propre.length - 1; i >= 0; i--) {
        const ch = propre[i];
        if (ch === ")") depth++;
        else if (ch === "(") {
          depth--;
          if (depth === 0) {
            const inner = propre.slice(i + 1, -1);
            const mPrefix = /^\s*EN\s*:\s*/.exec(inner);
            if (mPrefix) {
              return {
                cleanText: propre.slice(0, i).trim(),
                altEnText: inner.slice(mPrefix[0].length).trim(),
              };
            }
            break;
          }
        }
      }
    }
  }
  return { cleanText: propre, altEnText: null };
}

/**
 * Analyse `data/autorites-dispensees.md` et valide la parité exacte avec `## Sommaire`.
 */
export function parseAutoritesMarkdown(mdPath = CHEMIN_MD_AUTORITES) {
  const contenu = readFileSync(mdPath, "utf8");
  const lignes = contenu.split(/\r?\n/);
  const sommaireAttendu = parserSommaire(lignes);

  const sections = new Map();
  for (const [sec, meta] of Object.entries(LIST_METADATA)) {
    sections.set(sec, { ...meta, section: sec, entries: [] });
  }

  let sectionCourante = null;
  let subHeadingH4 = null;
  let subHeadingH5 = null;
  let ignorerSection = false;

  for (const ligne of lignes) {
    const mH2 = /^##\s+(\d+)\.\s+/.exec(ligne);
    if (mH2) {
      const secNum = mH2[1];
      ignorerSection = false;
      subHeadingH4 = null;
      subHeadingH5 = null;
      sectionCourante = sections.has(secNum) ? secNum : null;
      continue;
    }
    if (/^##\s+(?:Sommaire|Onglets sans liste|Notes de transcription|Réserves)\b/.test(ligne)) {
      ignorerSection = true;
      sectionCourante = null;
      continue;
    }
    if (ignorerSection) continue;

    const mH3 = /^###\s+(\d+\.\d+)\s+/.exec(ligne);
    if (mH3) {
      sectionCourante = sections.has(mH3[1]) ? mH3[1] : null;
      subHeadingH4 = null;
      subHeadingH5 = null;
      continue;
    }

    if (!sectionCourante) continue;

    const mH4 = /^####\s+(.+?)\s*$/.exec(ligne);
    if (mH4) {
      subHeadingH4 = mH4[1];
      subHeadingH5 = null;
      continue;
    }
    const mH5 = /^#####\s+(.+?)\s*$/.exec(ligne);
    if (mH5) {
      subHeadingH5 = mH5[1];
      continue;
    }

    if (subHeadingH4 && /^Liste des questions certifiées/i.test(subHeadingH4)) {
      continue;
    }

    const liste = sections.get(sectionCourante);
    if (!liste) continue;

    let tabNumber = null;
    let rawCore = null;
    let sourceDescriptors = null;
    const sourceUrls = [];

    if (sectionCourante === "3") {
      // Table TDP : | Onglet | Décision | Objet | Hyperlien |
      if (!ligne.startsWith("|")) continue;
      const cols = ligne
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      if (cols.length < 4 || !/^\d+$/.test(cols[0])) continue;
      tabNumber = Number(cols[0]);
      rawCore = cols[1];
      sourceDescriptors = cols[2] || null;
      for (const m of cols[3].matchAll(/<(https?:\/\/[^>]+)>/g)) {
        sourceUrls.push(m[1]);
      }
    } else {
      const mItem = /^(?:-\s+|(\d+)\.\s+)(.+)$/.exec(ligne);
      if (!mItem) continue;
      tabNumber = mItem[1] ? Number(mItem[1]) : null;
      const reste = mItem[2].trim();
      const idxLien = reste.indexOf(" — <http");
      if (idxLien !== -1) {
        rawCore = reste.slice(0, idxLien).trim();
        const urlPart = reste.slice(idxLien + 3);
        for (const m of urlPart.matchAll(/<(https?:\/\/[^>]+)>/g)) {
          sourceUrls.push(m[1]);
        }
      } else {
        rawCore = reste;
      }
    }

    const subdivision = [subHeadingH4, subHeadingH5].filter(Boolean).join(" — ") || null;

    const override = OVERRIDES.find((o) => o.match(liste.listId, rawCore));
    const { cleanText, altEnText } = nettoyerCorpsEntree(rawCore, liste.listId);
    const { primary, affirming } = scinderCompose(cleanText);
    const texteAnalyse = override ? override.canonicalText : primary;
    const formes = extraireFormesEtClef(texteAnalyse);

    let affirmingEntry = null;
    if (affirming) {
      const affFormes = extraireFormesEtClef(affirming);
      affirmingEntry = {
        rawText: affirming,
        decisionKey: affFormes.decisionKey,
        formes: affFormes,
      };
    }

    liste.entries.push({
      listId: liste.listId,
      position: liste.entries.length + 1,
      tabNumber,
      subdivision,
      rawText: rawCore,
      cleanText: primary,
      altEnText,
      sourceDescriptors,
      nicknames: extraireNicknames(rawCore),
      sourceLangNote: extraireLangNote(rawCore),
      sourceUrls,
      transcriptionNote: override?.transcriptionNote ?? null,
      erroneousSourceCitations: override?.erroneousSourceCitations ?? [],
      decisionKey: formes.decisionKey,
      formes,
      affirming: affirmingEntry,
    });
  }

  // Vérification stricte contre le tableau Sommaire
  let totalEntries = 0;
  let totalLinks = 0;
  const resultats = [];
  for (const [sec, liste] of sections.entries()) {
    const exp = sommaireAttendu.get(sec);
    if (!exp) {
      throw new Error(`Section ${sec} absente du tableau Sommaire.`);
    }
    const avecLien = liste.entries.filter((e) => e.sourceUrls.length > 0).length;
    if (liste.entries.length !== exp.entries) {
      throw new Error(
        `Écart d'effectif pour section ${sec} (${liste.listId}) : lu ${liste.entries.length}, Sommaire attend ${exp.entries}.`,
      );
    }
    if (avecLien !== exp.withLinks) {
      throw new Error(
        `Écart d'hyperliens pour section ${sec} (${liste.listId}) : lu ${avecLien}, Sommaire attend ${exp.withLinks}.`,
      );
    }
    totalEntries += liste.entries.length;
    totalLinks += avecLien;
    resultats.push(liste);
  }

  if (totalEntries !== 550 || totalLinks !== 459) {
    throw new Error(`Totaux inattendus : ${totalEntries} entrées, ${totalLinks} liens.`);
  }

  return { lists: resultats, totalEntries, totalLinks };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { lists, totalEntries, totalLinks } = parseAutoritesMarkdown();
  const keys = new Set();
  for (const l of lists) {
    for (const e of l.entries) {
      keys.add(e.decisionKey);
      if (e.affirming) keys.add(e.affirming.decisionKey);
    }
  }
  console.log(
    `OK: ${lists.length} listes, ${totalEntries} entrées, ${totalLinks} liens, ${keys.size} clés uniques.`,
  );
}
