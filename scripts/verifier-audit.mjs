import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { executerAudit } from "@poirierlavoie/mcp-socle/verifier-audit";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
executerAudit(RACINE);
