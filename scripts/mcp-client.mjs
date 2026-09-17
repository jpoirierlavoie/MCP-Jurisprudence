/**
 * Client MCP minimal pour la recette et l'amorçage (spécification §14).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠ LE SECRET PARTAGÉ NE DOIT JAMAIS ÊTRE AFFICHÉ.                             ║
 * ║                                                                              ║
 * ║ Il voyage dans le CHEMIN de l'URL (`/mcp/<secret>`). Ce script le lit        ║
 * ║ lui-même — depuis `.dev.vars` en local, depuis `mcp.url` en production, tous ║
 * ║ deux gitignorés — et ne l'écrit nulle part. Toute URL journalisée passe par  ║
 * ║ `redacted()`. C'est le motif `cf.token` du dépôt `legislation`.              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Usage :
 *   node scripts/mcp-client.mjs --local  tools/list
 *   node scripts/mcp-client.mjs --local  tools/call jurisprudence_verify_citations '{"citations":[{"citation":"2008 CSC 9"}]}'
 *   node scripts/mcp-client.mjs --remote tools/call jurisprudence_list_databases '{"refresh":true}'
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const LOCAL_BASE = process.env.MCP_LOCAL_BASE ?? "http://127.0.0.1:8787";

/** Masque le secret dans une URL avant tout affichage. */
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
  } catch {
    // fichier absent : on le dira plus bas, sans divulguer de chemin sensible
  }
  return null;
}

/** Résout l'URL du point d'entrée MCP. Ne la renvoie jamais en clair aux journaux. */
function resoudreUrl(mode) {
  if (mode === "--remote") {
    // `mcp.url` contient l'URL COMPLÈTE, secret compris. Gitignoré.
    try {
      const u = readFileSync(new URL("../mcp.url", import.meta.url), "utf8").trim();
      if (u) return u;
    } catch {
      /* rien */
    }
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
  if (reponse.status === 202) return null; // notification
  const texte = await reponse.text();
  if (!reponse.ok) {
    throw new Error(`HTTP ${reponse.status} sur ${redacted(url)} — ${texte.slice(0, 300)}`);
  }
  const corps = JSON.parse(texte);
  if (corps.error) throw new Error(`JSON-RPC ${corps.error.code} : ${corps.error.message}`);
  return corps.result;
}

/**
 * Une seule session pour tout un lot d'appels : le motif est repris de
 * `eval/mcp-client.mjs` du dépôt `legislation`, où un processus par appel avait fini
 * par épuiser un quota.
 */
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

/** Extrait le texte d'un résultat d'outil. */
export function texte(resultat) {
  return (resultat?.content ?? []).map((c) => c.text).join("\n");
}

// ── Exécution directe ─────────────────────────────────────────────────────────

// ⚠ `pathToFileURL`, et surtout PAS une concaténation « file:// » + chemin.
//   Sous Windows, `process.argv[1]` vaut « C:\…\mcp-client.mjs » ; concaténé, cela
//   donne « file://C:/… » (deux barres) là où Node produit « file:///C:/… » (trois).
//   La comparaison échouait donc TOUJOURS : le script se terminait avec un code 0 et
//   sans rien afficher — le pire des échecs, celui qui a l'air d'un succès.
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
