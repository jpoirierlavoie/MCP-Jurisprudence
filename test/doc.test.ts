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

const EN_LETTRES: Record<number, string> = {
  10: "dix",
  11: "onze",
  12: "douze",
  13: "treize",
};

function sectionOutils(): string {
  const debut = readme.indexOf("\n## Les ");
  expect(debut, "le README n'a plus de section « Les N outils »").toBeGreaterThan(-1);
  const fin = readme.indexOf("\n## ", debut + 1);
  return readme.slice(debut, fin === -1 ? undefined : fin);
}

describe("README contre registre — ce que la porte shell ne savait pas faire", () => {
  it("le registre n'est pas vide : douze outils, et c'est affirmé AVANT le reste", () => {
    expect(NOMS.length).toBe(12);
  });

  it("chaque outil du registre est nommé dans la section des outils", () => {
    const section = sectionOutils();
    for (const n of NOMS) expect(section, n).toContain(`\`${n}\``);
  });

  it("la section ne nomme AUCUN outil que le registre ne déclare plus", () => {
    const cites = [...sectionOutils().matchAll(/^\| `([a-z][a-z0-9_]+)` \|/gm)].map((m) => m[1]!);
    expect(cites).toHaveLength(12);
    expect([...new Set(cites)].sort()).toEqual(NOMS);
  });

  it("le titre de la section porte le bon NUMÉRAL, en toutes lettres", () => {
    expect(readme).toContain(`## Les ${EN_LETTRES[NOMS.length]} outils`);
  });

  it("chaque identifiant composé Claude Code (mcp__plugin_droit-civil-quebecois_juris__<outil>) respecte <= 64 car.", () => {
    for (const n of NOMS) {
      expect(`mcp__plugin_droit-civil-quebecois_juris__${n}`.length, n).toBeLessThanOrEqual(64);
    }
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
      { type?: string; url?: string; headers?: Record<string, string>; eager?: boolean }
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

  it("mcp_config.json et gemini-extension.json configurent Streamable HTTP par OAuth 2.1 (/mcp/oauth), sans secret, headers, variables ni eager", () => {
    for (const brut of [mcpConfigRaw, geminiExtRaw]) {
      expect(brut).not.toMatch(/[0-9a-f]{32,}/i);
      expect(brut).not.toContain("MCP_JURISPRUDENCE_SECRET");
    }

    const agy = mcpConfig.mcpServers.juris;
    expect(agy?.url).toBe("https://jurisprudence.poirierlavoie.ca/mcp/oauth");
    expect(agy?.headers).toBeUndefined();
    expect(agy?.variables).toBeUndefined();
    expect(agy?.eager).toBeUndefined();

    expect(geminiExt.contextFileName).toEqual([]);
    expect(geminiExt.settings).toEqual([]);
    const gcli = geminiExt.mcpServers.juris;
    expect(gcli?.type).toBe("http");
    expect(gcli?.url).toBe("https://jurisprudence.poirierlavoie.ca/mcp/oauth");
    expect(gcli?.headers).toBeUndefined();
    expect(gcli?.eager).toBeUndefined();
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
