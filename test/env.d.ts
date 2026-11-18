declare namespace Cloudflare {
  interface Env {
    /**
     * Migrations lues par `vitest.config.ts` et appliquées par
     * `test/apply-migrations.ts`. Binding réservé aux tests : il n'existe
     * évidemment pas en production.
     */
    TEST_MIGRATIONS: import("@cloudflare/vitest-pool-workers").D1Migration[];
  }
}

declare module "*.json?raw" {
  const content: string;
  export default content;
}

declare module "*.svg?raw" {
  const content: string;
  export default content;
}

declare module "*.ts?raw" {
  const content: string;
  export default content;
}

declare module "*.jsonc?raw" {
  const content: string;
  export default content;
}
