import { drapeau } from "@poirierlavoie/mcp-socle";

function flag(value: string | undefined, defaut = false): boolean {
  return drapeau(value, defaut);
}

export function entier(value: string | undefined, defaut: number): number {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : defaut;
}

export function mcpActif(env: Env): boolean {
  return flag(env.MCP_ENABLED, false);
}

export function persisterBalayages(env: Env): boolean {
  return flag(env.PERSIST_SWEEPS, true);
}
