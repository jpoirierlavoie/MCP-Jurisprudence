#!/usr/bin/env node
/**
 * Régénère `src/qc/lieux.ts` depuis la page officielle du ministère de la Justice
 * enregistrée dans le dépôt.
 *
 *   node scripts/extraire-lieux-mjq.mjs sources-officielles/mjq-numeros-greffes-2026-07-22.html
 *
 * La page est VERSIONNÉE dans `sources-officielles/` : c'est la preuve dont ce script
 * tire `src/qc/lieux.ts`, et elle doit y rester pour que la transcription reste
 * vérifiable. Ne pas la prendre pour un résidu.
 *
 * POURQUOI CE SCRIPT EXISTE. La page se met à jour (elle porte sa propre date), et
 * elle compte 86 lignes. Les recopier à la main, c'est un numéro de greffe faux qui
 * ne se signale par AUCUNE erreur — il rend simplement « greffe inconnu » sur un
 * greffe qui existe, ou pire, rattache un dossier au mauvais district. La génération
 * est la seule façon de rendre la transcription vérifiable.
 *
 * POURQUOI LA PAGE EST ENREGISTRÉE À LA MAIN. `justice.gouv.qc.ca` répond **403** à
 * toute requête automatisée : il n'y a pas de moissonnage possible, et il n'y a pas
 * non plus de jeu de données ouvert équivalent. Enregistrer la page depuis le
 * navigateur est le seul chemin, et il a l'avantage d'être un geste DÉLIBÉRÉ et daté.
 *
 * Le script n'écrit que `src/qc/lieux.ts`. Il ne touche NI `greffes.ts` NI `palais.ts` :
 * corriger automatiquement une correspondance de greffe reviendrait à figer une erreur
 * en silence. Les écarts se lisent dans le rapport et se reportent à la main — c'est la
 * même règle qu'à §4.3 pour le répertoire des tribunaux.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { argv } from "node:process";

const source = argv[2];
if (!source) {
  console.error("usage : node scripts/extraire-lieux-mjq.mjs <page.html>");
  process.exit(2);
}

const html = readFileSync(source, "utf8");

const dechiffrer = (s) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/[\s ]+/g, " ")
    .trim();

const tableau = html.match(/<table[\s\S]*?<\/table>/i);
if (!tableau) {
  console.error("Aucun <table> dans cette page : est-ce bien la bonne ?");
  process.exit(2);
}

const lignes = [...tableau[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].slice(1);
const parGreffe = new Map();
let lus = 0;

for (const [, ligne] of lignes) {
  const cases = [...ligne.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
    dechiffrer(m[1]),
  );
  if (cases.length < 3) continue;
  const [nomBrut, numBrut] = cases;
  const numero = numBrut.match(/\d{3}/)?.[0];
  if (!numero) continue;
  // L'astérisque du MJQ : « Point de service itinérant ». Il qualifie le LIEU.
  const itinerant = nomBrut.includes("*");
  const nom = nomBrut.replace(/\*/g, "").trim();
  if (!parGreffe.has(numero)) parGreffe.set(numero, []);
  parGreffe.get(numero).push({ nom, itinerant });
  lus++;
}

const maj = dechiffrer(html).match(/Derni[^:]*jour\s*:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? "?";
if (maj === "?") {
  console.error("⚠ Date de mise à jour introuvable sur la page — à reporter à la main.");
}

const q = (v) => JSON.stringify(v);
const corps = [...parGreffe.keys()]
  .sort()
  .map(
    (n) =>
      `  ${q(n)}: [` +
      parGreffe
        .get(n)
        .map((l) => `{ nom: ${q(l.nom)}, itinerant: ${l.itinerant} }`)
        .join(", ") +
      `],`,
  )
  .join("\n");

const sortie = `/**
 * Lieux desservis par chaque greffe — relevé OFFICIEL du ministère de la Justice.
 *
 * ⚠ FICHIER GÉNÉRÉ par \`scripts/extraire-lieux-mjq.mjs\`. Ne pas le modifier à la
 *   main : régénérer depuis la page enregistrée.
 *
 * Source : « Numéros des greffes des palais de justice et des points de service de
 * justice », justice.gouv.qc.ca. Page enregistrée à la main — le site répond 403 à
 * toute requête automatisée. Elle porte sa propre date de mise à jour : **${maj}**.
 *
 * ⚠ UN GREFFE PEUT DESSERVIR PLUSIEURS LIEUX. C'est ce que \`GREFFES.palais_key\`, qui
 *   est 1:1, ne peut pas exprimer : il ne nomme qu'un bâtiment. Cette table-ci porte
 *   la relation réelle, un-à-plusieurs, telle que le Ministère la publie.
 *
 * \`itinerant\` reprend l'astérisque de la page, dont la légende est « Point de service
 * itinérant ». Il qualifie un LIEU, non le greffe : le greffe 760 tient un palais fixe
 * à Salaberry-de-Valleyfield ET un point itinérant à Vaudreuil-Dorion. Ne pas le
 * confondre avec \`GREFFES.point_de_service\`, qui qualifie le greffe.
 *
 * Réconciliation du 2026-07-30 contre la table portée d'Athéna — deux écarts RÉELS,
 * consignés avec leur preuve plutôt que corrigés en silence :
 *   - le greffe **625 (Senneterre, Abitibi)** manquait entièrement ; « 625-… » rendait
 *     « greffe inconnu » sur un greffe qui existe ;
 *   - **Kuujjuaq** relève du greffe **635** et n'y est PAS itinérant : c'est le siège
 *     fixe. Athéna l'avait laissé volontairement orphelin, refusant de le rattacher au
 *     jugé « sur un greffe itinérant du Nunavik ». La page officielle le dit.
 * Aucun district ne diverge, et aucun greffe de notre table n'est absent du relevé.
 */

export interface LieuMjq {
  readonly nom: string;
  /** Point de service ITINÉRANT (astérisque du MJQ). Qualifie le LIEU, pas le greffe. */
  readonly itinerant: boolean;
}

/** Date de mise à jour publiée PAR le Ministère sur la page elle-même. */
export const MJQ_MAJ = ${q(maj)};

export const LIEUX_PAR_GREFFE: Readonly<Record<string, readonly LieuMjq[]>> = {
${corps}
};
`;

writeFileSync("src/qc/lieux.ts", sortie, "utf8");

console.log(`src/qc/lieux.ts régénéré.`);
console.log(`  ${parGreffe.size} greffes · ${lus} lieux · mise à jour du ${maj}`);
console.log("");
console.log("Relire le diff : ce script n'écrit QUE lieux.ts. Tout écart avec");
console.log("src/qc/greffes.ts se reporte à la main, après lecture — jamais en série.");
