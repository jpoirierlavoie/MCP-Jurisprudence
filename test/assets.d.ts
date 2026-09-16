/**
 * Le texte brut d'un fichier Markdown, inliné par Vite (`?raw`). Voir `test/doc.test.ts`.
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
