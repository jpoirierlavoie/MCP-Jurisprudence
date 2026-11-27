interface WorkerSecrets {
  CANLII_API_KEY?: string;
  MCP_SHARED_SECRET?: string;
  COFFRE_MAITRE_V1?: string;
  COFFRE_MAITRE_V2?: string;
}

interface Env extends WorkerSecrets {}

declare namespace Cloudflare {
  interface Env extends WorkerSecrets {}
}
