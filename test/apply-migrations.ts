import { applyD1Migrations, env } from "cloudflare:test";
import { construireSchemaIdentiteD1 } from "@poirierlavoie/mcp-socle";

function enonces(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0)
    .map((s) => `${s};`)
    .join("\n");
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
await env.DB_IDENTITE.exec(enonces(construireSchemaIdentiteD1(["legislation", "jurisprudence"])));
