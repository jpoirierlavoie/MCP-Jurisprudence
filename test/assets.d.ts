/**
 * Le texte brut d'un fichier, inliné par Vite (`?raw`). Voir `test/doc.test.ts`.
 *
 * Ce fichier ne contient AUCUN `import` ni `export` de premier niveau, et c'est
 * délibéré : il reste un script global, seul contexte où `declare module` déclare
 * vraiment un module ambiant. Placée dans `test/env.d.ts`, qui est un module, la même
 * déclaration serait lue comme une AUGMENTATION de module et échouerait.
 */
declare module "*.md?raw" {
  const contenu: string;
  export default contenu;
}

/**
 * Le texte brut d'un script Node du dépôt.
 *
 * ⚠ Un `.mjs` lu par `?raw` n'est PAS exécuté : `?raw` court-circuite la transformation
 *   JavaScript de Vite et rend la source telle quelle. C'est précisément ce qu'on veut —
 *   `scripts/refresh-databases.mjs` ouvre une session MCP au chargement, et l'importer
 *   pour de vrai ferait sortir un appel réseau d'une suite qui se veut hors ligne.
 */
declare module "*.mjs?raw" {
  const contenu: string;
  export default contenu;
}

/**
 * `import.meta.glob` — inventaire de fichiers résolu par Vite À LA COMPILATION.
 *
 * Employé par `test/garde.test.ts` pour balayer TOUTES les sources de `src/` plutôt
 * qu'une liste tenue à la main : une liste se périme au fichier suivant, et le balayage
 * cesserait alors de regarder précisément le code qu'on vient d'écrire.
 *
 * ⚠ Déclaration MINIMALE, restreinte à la forme qu'on emploie. Tirer `vite/client` en
 *   entier pour trois lignes ferait entrer dans le graphe de types du dépôt tout
 *   l'ambient DOM de Vite, que rien ici n'utilise.
 */
interface ImportMeta {
  glob(
    motif: string,
    options: { query: string; eager: true; import: string },
  ): Record<string, unknown>;
}
