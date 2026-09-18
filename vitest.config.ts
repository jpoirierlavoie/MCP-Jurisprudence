import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * DEUX PROJETS, et le second n'est pas un confort.
 *
 * « workerd » — tout ce qui touche la D1 locale, les déclencheurs FTS5 ou les extensions
 *   propres au moteur (`crypto.subtle.timingSafeEqual`). Un test qui passerait sous Node
 *   mais pas sous workerd ne prouverait rien.
 *
 * « node » — les tests de PROVENANCE, qui lisent le TypeScript COMME DU TEXTE avec
 *   `node:fs`. Ils ne peuvent PAS tourner dans workerd, dont le shim `fs` ne sert pas
 *   l'arborescence du projet — mesuré dans le dépôt jumeau, et non supposé.
 *
 *   Ils existent parce qu'une propriété comme « ce texte est IMPORTÉ, non recopié » est
 *   invisible à l'exécution : deux chaînes égales sont égales, qu'elles viennent d'une
 *   constante partagée ou d'un copier-coller. Seule la lecture de la SOURCE les distingue.
 */
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          cloudflareTest(async () => {
            const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
            return {
              // Les bindings (DB, vars) viennent du VRAI wrangler.jsonc : les tests
              // éprouvent la configuration déployée, pas une copie qui pourrait dériver.
              wrangler: { configPath: "./wrangler.jsonc" },
              miniflare: {
                // Binding réservé aux tests : les migrations sont appliquées par le fichier
                // de préparation, sur une base neuve à chaque fichier de test.
                bindings: { TEST_MIGRATIONS: migrations },
              },
            };
          }),
        ],
        test: {
          name: "workerd",
          include: ["test/**/*.test.ts"],
          setupFiles: ["./test/apply-migrations.ts"],
        },
      },
      {
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.mjs"],
        },
      },
    ],
  },
});
