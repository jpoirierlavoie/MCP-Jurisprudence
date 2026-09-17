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
