/**
 * Le README contre le REGISTRE (règle de propagation, CLAUDE.md).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ CE FICHIER REMPLACE UNE PORTE QUI POUVAIT RÉUSSIR SUR LE VIDE.               ║
 * ║                                                                              ║
 * ║ La vérification d'avant était une commande shell de CLAUDE.md : deux `grep`  ║
 * ║ confrontés par `diff`, tous deux FILTRÉS PAR UNE LISTE DE PRÉFIXES écrite à  ║
 * ║ la main — `(canlii|greffe|palais)_`. Le 2026-09-16, les préfixes ont changé. ║
 * ║ Les deux côtés se sont alors réduits au même sous-ensemble de trois outils,  ║
 * ║ sont restés égaux, et `diff` aurait rendu 0 : la porte aurait affirmé        ║
 * ║ « aucune dérive » sans avoir regardé dix outils sur treize — et l'aurait     ║
 * ║ affirmé aussi longtemps que personne ne l'aurait relue. Une vérification qui ║
 * ║ ne peut pas échouer est PIRE qu'aucune : elle achète une confiance qu'elle   ║
 * ║ ne finance pas.                                                              ║
 * ║                                                                              ║
 * ║ On ne répare pas cela en corrigeant la liste — on la corrigerait cette fois, ║
 * ║ et le prochain renommage rouvrirait le même trou au même endroit. Le défaut  ║
 * ║ est que les DEUX côtés étaient des heuristiques sur du texte, sans aucune    ║
 * ║ valeur non vide par construction pour ancrer la comparaison.                 ║
 * ║                                                                              ║
 * ║ Ici, un côté est `TOOLS` LUI-MÊME — non vide par construction, et sa longueur║
 * ║ est AFFIRMÉE avant tout le reste. L'autre est le texte du README, lu par     ║
 * ║ `?raw`. AUCUNE liste de préfixes n'intervient : le prochain renommage ne peut║
 * ║ pas rouvrir le trou, parce qu'il n'y a plus rien à tenir à jour.             ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
import { describe, expect, it } from "vitest";
import logoSvg from "../assets/logo.svg?raw";
import claudeMd from "../CLAUDE.md?raw";
import geminiMd from "../GEMINI.md?raw";
import geminiExtRaw from "../gemini-extension.json?raw";
import mcpConfigRaw from "../mcp_config.json?raw";
import packageRaw from "../package.json?raw";
import pluginRaw from "../plugin.json?raw";
import readme from "../README.md?raw";
import { carteServeur } from "../src/index";
import { PUBLIC_DESCRIPTION, SERVER_INFO, TOOLS } from "../src/mcp/registry";
import registryRaw from "../src/mcp/registry.ts?raw";
import wranglerRaw from "../wrangler.jsonc?raw";

const NOMS = Object.keys(TOOLS).sort();

/** Un compte écrit en toutes lettres vieillit en silence : on l'éprouve aussi. */
const EN_LETTRES: Record<number, string> = {
  10: "dix",
  11: "onze",
  12: "douze",
  13: "treize",
};

/** La section « Les douze outils » du README, bornée au titre de niveau 2 suivant. */
function sectionOutils(): string {
  const debut = readme.indexOf("\n## Les ");
  expect(debut, "le README n'a plus de section « Les N outils »").toBeGreaterThan(-1);
  const fin = readme.indexOf("\n## ", debut + 1);
  return readme.slice(debut, fin === -1 ? undefined : fin);
}

describe("README contre registre — ce que la porte shell ne savait pas faire", () => {
  it("le registre n'est pas vide : douze outils, et c'est affirmé AVANT le reste", () => {
    // L'assertion qui rend impossible la réussite sur le vide. Elle vient en premier
    // délibérément : si elle tombe, les trois suivantes ne veulent plus rien dire.
    expect(NOMS.length).toBe(12);
  });

  it("chaque outil du registre est nommé dans la section des outils", () => {
    const section = sectionOutils();
    for (const n of NOMS) expect(section, n).toContain(`\`${n}\``);
  });

  it("la section ne nomme AUCUN outil que le registre ne déclare plus", () => {
    // On ne lit que les lignes de TABLEAU (« | `nom` | … »). Ailleurs, le README parle
    // de `search_log`, `court_codes`, `database_id` : même forme, autre objet. Borner
    // par la section ET par la forme de ligne évite toute liste d'exceptions — c'est-
    // à-dire exactement ce qui a pourri la porte précédente.
    const cites = [...sectionOutils().matchAll(/^\| `([a-z][a-z0-9_]+)` \|/gm)].map((m) => m[1]!);
    expect(cites).toHaveLength(12);
    expect([...new Set(cites)].sort()).toEqual(NOMS);
  });

  it("le titre de la section porte le bon NUMÉRAL, en toutes lettres", () => {
    expect(readme).toContain(`## Les ${EN_LETTRES[NOMS.length]} outils`);
  });
});

describe("Manifestes Antigravity / Gemini et version — aucune dérive silencieuse", () => {
  const pkg = JSON.parse(packageRaw) as { name: string; version: string };
  const plugin = JSON.parse(pluginRaw) as {
    name: string;
    displayName: string;
    version: string;
    description: string;
    logo: string;
    homepage: string;
    repository: string;
  };
  const mcpConfig = JSON.parse(mcpConfigRaw) as {
    mcpServers: Record<
      string,
      {
        url?: string;
        headers?: Record<string, string>;
        variables?: Array<{ name: string; title: string; description: string }>;
        eager?: boolean;
      }
    >;
  };
  const geminiExt = JSON.parse(geminiExtRaw) as {
    name: string;
    version: string;
    description: string;
    contextFileName?: unknown;
    settings?: Array<{ name: string; description: string; envVar: string; sensitive?: boolean }>;
    mcpServers: Record<
      string,
      { httpUrl?: string; headers?: Record<string, string>; eager?: boolean }
    >;
  };
  const card = carteServeur();

  it("package.json, SERVER_INFO, plugin.json, gemini-extension.json et /mcp/server-card portent la MÊME version", () => {
    expect(pkg.version.length).toBeGreaterThan(0);
    expect(SERVER_INFO.version).toBe(pkg.version);
    expect(plugin.version).toBe(pkg.version);
    expect(geminiExt.version).toBe(pkg.version);
    expect(card.version).toBe(pkg.version);
  });

  it("identifiant, titre et description canonique concordent partout", () => {
    expect(pkg.name).toBe("mcp-jurisprudence");
    expect(SERVER_INFO.name).toBe(pkg.name);
    expect(plugin.name).toBe(pkg.name);
    expect(geminiExt.name).toBe(pkg.name);

    expect(plugin.displayName).toBe(SERVER_INFO.title);
    expect(card.title).toBe(SERVER_INFO.title);

    expect(plugin.description).toBe(PUBLIC_DESCRIPTION);
    expect(geminiExt.description).toBe(PUBLIC_DESCRIPTION);
    expect(card.description).toBe(PUBLIC_DESCRIPTION);

    expect(plugin.repository).toBe("https://github.com/jpoirierlavoie/MCP-Jurisprudence");
    expect(card.repository.url).toBe("https://github.com/jpoirierlavoie/MCP-Jurisprudence");
    expect(readme).not.toContain("MCP-Jurisprudence-Quebec");
    expect(readme).not.toContain("pratique-civile-outils");
    expect(geminiMd).not.toContain("MCP-Socle-Juridique");
    expect(geminiMd).not.toContain("socle-juridique");
    expect(geminiMd).not.toContain("pratique-civile-outils");
  });

  it("mcp_config.json et gemini-extension.json configurent Streamable HTTP par en-tête, sans secret ni eager", () => {
    for (const brut of [mcpConfigRaw, geminiExtRaw]) {
      expect(brut).not.toMatch(/[0-9a-f]{32,}/i);
    }

    const agy = mcpConfig.mcpServers.juris;
    expect(agy?.url).toBe("https://jurisprudence.poirierlavoie.ca/mcp");
    expect(agy?.headers?.Authorization).toBe(`Bearer $${"{MCP_JURISPRUDENCE_SECRET}"}`);
    expect(agy?.eager).toBeUndefined();
    expect(agy?.variables?.some((v) => v.name === "MCP_JURISPRUDENCE_SECRET")).toBe(true);

    // Critiquement vide : évite d'injecter le GEMINI.md de développement dans les sessions utilisateur.
    expect(geminiExt.contextFileName).toEqual([]);
    const gcli = geminiExt.mcpServers.juris;
    expect(gcli?.httpUrl).toBe("https://jurisprudence.poirierlavoie.ca/mcp");
    expect(gcli?.headers?.Authorization).toBe(`Bearer $${"{MCP_JURISPRUDENCE_SECRET}"}`);
    expect(
      geminiExt.settings?.some(
        (s) => s.envVar === "MCP_JURISPRUDENCE_SECRET" && s.sensitive === true,
      ),
    ).toBe(true);
  });

  it("assets/logo.svg est un SVG carré valide", () => {
    expect(plugin.logo).toBe("assets/logo.svg");
    expect(logoSvg).toContain("<svg");
    expect(logoSvg).toContain('viewBox="0 0 128 128"');
  });

  it("CLAUDE.md === GEMINI.md et reste sous la limite de troncature Antigravity (24 000 octets UTF-8, G2)", () => {
    expect(geminiMd).toBe(claudeMd);
    const octets = new TextEncoder().encode(geminiMd).byteLength;
    expect(octets).toBeGreaterThan(1_000);
    expect(octets).toBeLessThan(24_000);
    expect(geminiMd).toContain("CLAUDE.md");
    expect(geminiMd).toContain("SPEC.md");
  });

  it("wrangler.jsonc désactive l'observabilité (G37), lie DB_IDENTITE et isole les namespace_id 1021..1025 (G34), et registry.ts bannit x-mcp-header (G19)", () => {
    const sansComm = wranglerRaw
      .split("\n")
      .filter((l) => !/^\s*\/\//.test(l))
      .join("\n");
    const cfg = JSON.parse(sansComm) as {
      observability?: unknown;
      d1_databases?: Array<{ binding: string; database_name: string }>;
      ratelimits?: Array<{
        name: string;
        namespace_id: string;
        simple: { limit: number; period: number };
      }>;
    };
    expect(cfg.observability).toEqual({
      enabled: false,
      logs: { enabled: false, invocation_logs: false },
    });
    expect(
      cfg.d1_databases?.some(
        (d) => d.binding === "DB_IDENTITE" && d.database_name === "mcp-identite",
      ),
    ).toBe(true);
    expect(
      cfg.ratelimits?.map((r) => [r.name, r.namespace_id, r.simple.limit, r.simple.period]),
    ).toEqual([
      ["RL_PRE_AUTH_IP", "1021", 600, 60],
      ["RL_ECHEC_IP", "1022", 20, 60],
      ["RL_ECHECS_GLOBAL", "1023", 300, 60],
      ["RL_TITULAIRE", "1024", 180, 60],
      ["RL_TITULAIRE_LIMITE", "1025", 20, 60],
    ]);
    expect(registryRaw).not.toContain("x-mcp-header");
  });
});
