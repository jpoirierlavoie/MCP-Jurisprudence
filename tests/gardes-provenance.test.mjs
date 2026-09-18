// La garde qui fait tenir `src/gardes.ts` : les textes y sont IMPORTÉS, jamais recopiés.
//
// POURQUOI ELLE NE PEUT PAS S'ÉCRIRE À L'EXÉCUTION. Deux chaînes égales sont égales, qu'elles
// viennent d'une constante partagée ou d'un copier-coller : `===` ne distingue pas les deux.
// La propriété « ce texte EST celui que la prose sert » n'est visible que dans la SOURCE.
// D'où ce test, qui lit le TypeScript comme du texte, et d'où le projet `node` du
// vitest.config — le shim `fs` de workerd ne sert pas l'arborescence du projet.
//
// CE QU'ELLE PROTÈGE. Le jour où quelqu'un ajuste une réserve dans `render.ts` et que le
// registre en garde une copie périmée, la sortie STRUCTURÉE sert une mise en garde que la
// PROSE ne sert plus. Les deux se contrediraient, et rien ne rougirait — c'est exactement le
// mode de panne que l'invariant 4 décrivait, déplacé d'un cran.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

const gardes = readFileSync(new URL("../src/gardes.ts", import.meta.url), "utf8");
const render = readFileSync(new URL("../src/format/render.ts", import.meta.url), "utf8");

/** Les paires `texte: <valeur>` du registre, dans l'ordre du fichier. */
const textes = [...gardes.matchAll(/^\s*texte:\s*([^,\n]+),$/gm)].map((m) => m[1].trim());

/** Les constantes que `render.ts` exporte et qui portent de la prose. */
const exportees = [...render.matchAll(/^export const ([A-Z_]+)\s*=/gm)].map((m) => m[1]);

describe("le registre de gardes importe ses textes", () => {
  it("le registre en déclare vingt", () => {
    // Un compte explicite : ajouter un code sans y penser doit coûter une ligne ici.
    assert.equal(textes.length, 20);
  });

  it("AUCUN `texte:` n'est un littéral — ils sont tous des identifiants", () => {
    // La garde centrale. Un `texte: "…"` dans ce fichier est une copie, donc une divergence
    // en attente. Le message nomme le coupable plutôt que d'annoncer un compte.
    const litteraux = textes.filter((t) => t.startsWith('"') || t.startsWith("`"));
    assert.deepEqual(
      litteraux,
      [],
      `réserve(s) RECOPIÉE(S) dans src/gardes.ts au lieu d'être importée(s) : ${litteraux.join(" · ")}`,
    );
  });

  it("chaque texte est une constante réellement exportée par render.ts", () => {
    const orphelins = textes.filter((t) => !exportees.includes(t));
    assert.deepEqual(orphelins, [], `texte(s) sans constante dans render.ts : ${orphelins.join(", ")}`);
  });

  it("chaque texte importé est bien nommé à l'import", () => {
    const bloc = gardes.match(/import \{([^}]*)\} from "\.\/format\/render";/);
    assert.ok(bloc, "src/gardes.ts n'importe pas de src/format/render");
    const importes = bloc[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const manquants = textes.filter((t) => !importes.includes(t));
    assert.deepEqual(manquants, [], `employé sans être importé : ${manquants.join(", ")}`);
  });
});

describe("les trois sévérités arbitrées le 2026-09-17", () => {
  // Elles s'écartent de la §8.4 du socle, ou la précisent. Un écart arbitré par l'avocat ne
  // doit pas se refermer tout seul au prochain alignement « de cohérence » : ces trois
  // assertions sont là pour qu'un retour en arrière soit un geste DÉLIBÉRÉ.
  const severite = (code) =>
    gardes.match(new RegExp(`code:\\s*"${code}",\\s*\\n\\s*severite:\\s*"([a-z]+)"`))?.[1];

  it("SANS_ADRESSE_PUBLIEE est `avertissement`, contre `information` au socle", () => {
    // Le dommage nommé est qu'un praticien RENONCE à une démarche possible.
    assert.equal(severite("SANS_ADRESSE_PUBLIEE"), "avertissement");
  });

  it("SORTS_SANS_SENS est plus sévère que SORTS_HEURISTIQUES, dans le même outil", () => {
    // La tête dit « ceci est un indice » ; le pied dit ce que le résultat N'ÉTABLIT PAS.
    assert.equal(severite("SORTS_HEURISTIQUES"), "reserve");
    assert.equal(severite("SORTS_SANS_SENS"), "avertissement");
  });

  it("l'étranglement garde DEUX codes de sévérités distinctes", () => {
    // Les fondre reperdrait une distinction payée par un défaut réel du 2026-09-17.
    assert.equal(severite("ETRANGLEMENT_SANS_PERTE"), "information");
    assert.equal(severite("ETRANGLEMENT_RESULTAT_PARTIEL"), "reserve");
  });
});
