import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const LOCAL_BASE = process.env.MCP_LOCAL_BASE ?? "http://127.0.0.1:8787";

export function redacted(url) {
  return String(url).replace(/\/mcp\/[^/?#]+/, "/mcp/***");
}

function lireDevVars(clef) {
  try {
    const contenu = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
    for (const ligne of contenu.split(/\r?\n/)) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(ligne);
      if (m && m[1] === clef) return m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {}
  return null;
}

function resoudreUrl(mode) {
  if (mode === "--remote") {
    try {
      const u = readFileSync(new URL("../mcp.url", import.meta.url), "utf8").trim();
      if (u) return u;
    } catch {}
    if (process.env.JURIS_MCP_URL) return process.env.JURIS_MCP_URL.trim();
    throw new Error(
      "URL de production introuvable. Créer un fichier `mcp.url` (gitignoré) contenant\n" +
        "https://jurisprudence.poirierlavoie.ca/mcp/<secret>, ou exporter JURIS_MCP_URL.",
    );
  }
  const secret = lireDevVars("MCP_SHARED_SECRET");
  if (!secret) {
    throw new Error(
      "MCP_SHARED_SECRET introuvable dans `.dev.vars`. Copier `.dev.vars.example` et le remplir.",
    );
  }
  return `${LOCAL_BASE}/mcp/${encodeURIComponent(secret)}`;
}

let prochainId = 1;

export async function rpc(url, method, params) {
  const reponse = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: prochainId++, method, params }),
  });
  if (reponse.status === 202) return null;
  const texte = await reponse.text();
  if (!reponse.ok) {
    throw new Error(`HTTP ${reponse.status} sur ${redacted(url)} — ${texte.slice(0, 300)}`);
  }
  const corps = JSON.parse(texte);
  if (corps.error) throw new Error(`JSON-RPC ${corps.error.code} : ${corps.error.message}`);
  return corps.result;
}

export async function session(mode) {
  const url = resoudreUrl(mode);
  await rpc(url, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mcp-client.mjs", version: "1.0.0" },
  });
  return {
    url,
    appeler: (nom, args) => rpc(url, "tools/call", { name: nom, arguments: args ?? {} }),
    lister: () => rpc(url, "tools/list", {}),
  };
}

export function texte(resultat) {
  return (resultat?.content ?? []).map((c) => c.text).join("\n");
}

const estPrincipal = Boolean(
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href,
);
if (estPrincipal) {
  const args = process.argv.slice(2);
  const mode = args.find((a) => a === "--local" || a === "--remote") ?? "--local";
  const reste = args.filter((a) => a !== "--local" && a !== "--remote");
  const methode = reste[0] ?? "tools/list";

  try {
    const s = await session(mode);
    console.log(`→ ${redacted(s.url)}`);
    if (methode === "tools/list") {
      const r = await s.lister();
      for (const t of r.tools) console.log(`  ${t.name}`);
      console.log(`\n${r.tools.length} outil(s).`);
    } else if (methode === "tools/call") {
      const nom = reste[1];
      const params = reste[2] ? JSON.parse(reste[2]) : {};
      const r = await s.appeler(nom, params);
      console.log(texte(r));
      if (r.isError) process.exitCode = 1;
    } else {
      console.log(JSON.stringify(await rpc(s.url, methode, {}), null, 2));
    }
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exitCode = 1;
  }
}
