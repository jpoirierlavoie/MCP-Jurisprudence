/**
 * Le README contre le REGISTRE (règle de propagation, CLAUDE.md).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ CE FICHIER REMPLACE UNE PORTE QUI POUVAIT RÉUSSIR SUR LE VIDE.                ║
 * ║                                                                              ║
 * ║ La vérification d'avant était une commande shell de CLAUDE.md : deux `grep`   ║
 * ║ confrontés par `diff`, tous deux FILTRÉS PAR UNE LISTE DE PRÉFIXES écrite à   ║
 * ║ la main — `(canlii|greffe|palais)_`. Le 2026-09-16, les préfixes ont changé.  ║
 * ║ Les deux côtés se sont alors réduits au même sous-ensemble de trois outils,   ║
 * ║ sont restés égaux, et `diff` aurait rendu 0 : la porte aurait affirmé         ║
 * ║ « aucune dérive » sans avoir regardé dix outils sur treize — et l'aurait      ║
 * ║ affirmé aussi longtemps que personne ne l'aurait relue. Une vérification qui  ║
 * ║ ne peut pas échouer est PIRE qu'aucune : elle achète une confiance qu'elle    ║
 * ║ ne finance pas.                                                              ║
 * ║                                                                              ║
 * ║ On ne répare pas cela en corrigeant la liste — on la corrigerait cette fois,  ║
 * ║ et le prochain renommage rouvrirait le même trou au même endroit. Le défaut   ║
 * ║ est que les DEUX côtés étaient des heuristiques sur du texte, sans aucune     ║
 * ║ valeur non vide par construction pour ancrer la comparaison.                  ║
 * ║                                                                              ║
 * ║ Ici, un côté est `TOOLS` LUI-MÊME — non vide par construction, et sa longueur ║
 * ║ est AFFIRMÉE avant tout le reste. L'autre est le texte du README, lu par      ║
 * ║ `?raw`. AUCUNE liste de préfixes n'intervient : le prochain renommage ne peut ║
 * ║ pas rouvrir le trou, parce qu'il n'y a plus rien à tenir à jour.              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
import { describe, expect, it } from "vitest";

import readme from "../README.md?raw";
import { TOOLS } from "../src/mcp/registry";

const NOMS = Object.keys(TOOLS).sort();

/** Un compte écrit en toutes lettres vieillit en silence : on l'éprouve aussi. */
const EN_LETTRES: Record<number, string> = { 12: "douze", 13: "treize", 14: "quatorze" };

/** La section « Les treize outils » du README, bornée au titre de niveau 2 suivant. */
function sectionOutils(): string {
  const debut = readme.indexOf("\n## Les ");
  expect(debut, "le README n'a plus de section « Les N outils »").toBeGreaterThan(-1);
  const fin = readme.indexOf("\n## ", debut + 1);
  return readme.slice(debut, fin === -1 ? undefined : fin);
}

describe("README contre registre — ce que la porte shell ne savait pas faire", () => {
  it("le registre n'est pas vide : treize outils, et c'est affirmé AVANT le reste", () => {
    // L'assertion qui rend impossible la réussite sur le vide. Elle vient en premier
    // délibérément : si elle tombe, les trois suivantes ne veulent plus rien dire.
    expect(NOMS.length).toBe(13);
  });

  it("chaque outil du registre est nommé dans la section des outils", () => {
    const section = sectionOutils();
    for (const n of NOMS) expect(section, n).toContain(`\`${n}\``);
  });

  it("la section ne nomme AUCUN outil que le registre ne déclare plus", () => {
    // On ne lit que les lignes de TABLEAU (« | `nom` | … »). Ailleurs, le README parle
    // de `search_log`, `court_codes`, `database_id` : même forme, autre objet. Borner
    // par la section ET par la forme de ligne évite toute liste d'exceptions — c'est-
    // à-dire exactement ce qui a pourri la porte précédente.
    const cites = [...sectionOutils().matchAll(/^\| `([a-z][a-z0-9_]+)` \|/gm)].map((m) => m[1]!);
    expect(cites).toHaveLength(13);
    expect([...new Set(cites)].sort()).toEqual(NOMS);
  });

  it("le titre de la section porte le bon NUMÉRAL, en toutes lettres", () => {
    expect(readme).toContain(`## Les ${EN_LETTRES[NOMS.length]} outils`);
  });
});
