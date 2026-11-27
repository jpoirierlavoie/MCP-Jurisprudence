declare module "*.md?raw" {
  const contenu: string;
  export default contenu;
}

declare module "*.mjs?raw" {
  const contenu: string;
  export default contenu;
}

interface ImportMeta {
  glob(
    motif: string,
    options: { query: string; eager: true; import: string },
  ): Record<string, unknown>;
}
