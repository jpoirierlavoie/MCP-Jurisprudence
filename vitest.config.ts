import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Les tests s'exécutent dans `workerd`, et non dans Node : c'est le seul moyen
 * d'éprouver pour de vrai la D1 locale, les déclencheurs FTS5 et les extensions
 * propres au moteur (crypto.subtle.timingSafeEqual). Un test qui passerait sous Node
 * mais pas sous workerd ne prouverait rien.
 */
export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(path.join(__dirname, "migrations"));
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
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
