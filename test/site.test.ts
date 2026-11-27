import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import worker from "../src/index";
import { TOOLS } from "../src/mcp/registry";
import { RESUME_OUTILS_FR, SECTIONS } from "../src/site";
import { OUTILS_EN } from "../src/site.i18n";

const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function envAvec(over: Record<string, unknown> = {}): Env {
  return {
    ...env,
    MCP_SHARED_SECRET: SECRET,
    CANLII_API_KEY: "clef-de-test",
    ...over,
  } as unknown as Env;
}

async function demander(
  chemin = "/",
  opts: { method?: string; headers?: Record<string, string>; env?: Env } = {},
): Promise<Response> {
  const ctx = createExecutionContext();
  const req = new Request(`https://jurisprudence.poirierlavoie.ca${chemin}`, {
    method: opts.method ?? "GET",
    headers: opts.headers,
  });
  const res = await worker.fetch(req, opts.env ?? envAvec(), ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("§18 — routage de la page publique", () => {
  it("GET / rend 200 en text/html", async () => {
    const res = await demander("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
    const html = await res.text();
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");
  });

  it("HEAD / rend 200 SANS corps", async () => {
    const res = await demander("/", { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
    expect(await res.text()).toBe("");
  });

  it("POST / rend 405 avec Allow", async () => {
    const res = await demander("/", { method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, HEAD");
  });

  it("« tout le reste est 404 » reste VRAI", async () => {
    for (const chemin of [
      "/autre",
      "/index.html",
      "/favicon.ico",
      "/mcp2",
      "/a/b",
      "/server-card",
      "/.well-known/mcp.json",
    ]) {
      expect((await demander(chemin)).status, chemin).toBe(404);
    }
  });

  it("la page survit au coupe-circuit, /health, /mcp/server-card et /mcp non", async () => {
    const e = envAvec({ MCP_ENABLED: "false" });
    expect((await demander("/", { env: e })).status).toBe(200);
    for (const dec of ["/robots.txt", "/sitemap.xml", "/llms.txt"]) {
      const rDec = await demander(dec, { env: e });
      expect(rDec.status, dec).toBe(200);
      expect(rDec.headers.get("Access-Control-Allow-Origin"), dec).toBeNull();
      expect((await demander(dec, { method: "HEAD", env: e })).status, `${dec} HEAD`).toBe(200);
      expect((await demander(dec, { method: "POST", env: e })).status, `${dec} POST`).toBe(405);
    }
    expect((await demander("/health", { env: e })).status).toBe(404);
    expect((await demander("/mcp/server-card", { env: e })).status).toBe(404);
    expect((await demander(`/mcp/${SECRET}`, { method: "POST", env: e })).status).toBe(404);
  });
});

describe("§18 — la page ne divulgue rien", () => {
  it("ne contient NI le secret, NI rien qui y ressemble", async () => {
    const html = await (await demander("/")).text();
    expect(html).not.toContain(SECRET);
    expect(html).not.toMatch(/Bearer\s/);
    expect(html).not.toMatch(/[0-9a-f]{32,}/i);
    expect(html).not.toContain("api.canlii.org");
    expect(html).not.toContain("api_key");
  });

  it("documente la FORME du point d'entrée, jamais une URL utilisable", async () => {
    const html = await (await demander("/")).text();
    expect(html).toContain("/mcp/&lt;secret&gt;");
  });

  it("n'émet AUCUN en-tête CORS — elle ne peut pas servir d'oracle", async () => {
    for (const headers of [undefined, { Origin: "https://claude.ai" }]) {
      const res = await demander("/", { headers });
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(res.headers.get("Access-Control-Expose-Headers")).toBeNull();
    }
  });

  it("une origine de navigateur INCONNUE n'est pas refusée sur la page", async () => {
    const res = await demander("/", { headers: { Origin: "https://exemple.invalide" } });
    expect(res.status).toBe(200);
    const mcp = await demander(`/mcp/${SECRET}`, {
      method: "POST",
      headers: { Origin: "https://exemple.invalide" },
    });
    expect(mcp.status).toBe(403);
  });

  it("porte les en-têtes de sécurité d'une origine de DOCUMENT", async () => {
    const res = await demander("/");
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("ne met PAS la page en cache d'arête durable", async () => {
    const cc = (await demander("/")).headers.get("Cache-Control") ?? "";
    expect(cc).toContain("max-age=600");
    expect(cc).not.toContain("s-maxage");
  });
});

describe("§18 — bilinguisme et thème", () => {
  it("sert le FRANÇAIS par défaut, sans JavaScript", async () => {
    const html = await (await demander("/")).text();
    expect(html).toContain('<html lang="fr" class="l-fr">');
    expect(html).toContain("html.l-fr [data-l=en],html.l-en [data-l=fr]{display:none}");
  });

  it("émet les DEUX langues", async () => {
    const html = await (await demander("/")).text();
    expect(html).toMatch(/data-l="fr"/);
    expect(html).toMatch(/data-l="en"/);
    const fr = (html.match(/data-l="fr"/g) ?? []).length;
    const en = (html.match(/data-l="en"/g) ?? []).length;
    expect(fr).toBe(en);
    expect(fr).toBeGreaterThan(3);
  });

  it("porte les trois états de thème, « auto » compris", async () => {
    const html = await (await demander("/")).text();
    for (const etat of ["auto", "light", "dark"]) {
      expect(html, etat).toContain(`data-t="${etat}"`);
    }
    expect(html).toContain("html:not(.t-light):not(.t-dark) #theme [data-t=auto]");
    expect(html).toContain("@media(prefers-color-scheme:dark)");
  });

  it("le script de tête COMPOSE langue et thème", async () => {
    const html = await (await demander("/")).text();
    expect(html).toContain("c.push(p==='en'?'l-en':'l-fr')");
    expect(html).toContain("c.push('t-'+t)");
    expect(html).toContain("r.className=c.join(' ')");
  });
});

describe("§18 — autonomie et absence de dérive", () => {
  it("ne charge RIEN d'un tiers", async () => {
    const html = await (await demander("/")).text();
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html).not.toMatch(
      /https?:\/\/(?!jurisprudence\.poirierlavoie\.ca|acces\.poirierlavoie\.ca|legislation\.poirierlavoie\.ca|outils\.poirierlavoie\.ca|github\.com|canlii\.ca|schema\.org|creativecommons\.org|www\.apache\.org)[a-z]/i,
    );
    expect(html).not.toContain("@import");
  });

  it("aucune couleur en dur hors des deux jeux de thème", async () => {
    const html = await (await demander("/")).text();
    const css = html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));
    const sansJeux = css.replace(/^[\s\S]*?html\.t-dark\{[^}]*\}/, "");
    expect(sansJeux).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(sansJeux).not.toMatch(/\b(rgba?|hsla?)\(/i);
  });

  it("les deux jeux de thème déclarent EXACTEMENT les mêmes variables", async () => {
    const html = await (await demander("/")).text();
    const css = html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));
    const vars = (bloc: string) => [...bloc.matchAll(/(--[a-z-]+):/g)].map((m) => m[1]).sort();
    const clair = /html\.t-light\{([^}]*)\}/.exec(css)?.[1] ?? "";
    const sombre = /html\.t-dark\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(vars(clair).length).toBeGreaterThan(5);
    expect(vars(clair)).toEqual(vars(sombre));
  });

  it("chaque ancre du sommaire vise une section qui existe et tous les id sont uniques", async () => {
    const html = await (await demander("/")).text();
    for (const m of html.matchAll(/<a href="#([a-z]+)"/g)) {
      if (m[1] === "top") continue;
      expect(html, m[1]).toContain(`<section id="${m[1]}"`);
    }
    for (const s of SECTIONS) {
      expect(html, s.id).toContain(`<a href="#${s.id}"`);
      expect(html, s.id).toContain(`<section id="${s.id}"`);
    }
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).toContain('<nav class="suite"');
    expect(html).toContain('href="/" aria-current="page"');
    expect(html).toMatch(/<title data-fr="[^"]+" data-en="[^"]+">/);
    expect(html).toContain('<h3 id="sc-verify_citations">');
    const ldMatch = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    expect(ldMatch).not.toBeNull();
    expect((JSON.parse(ldMatch![1]!) as Record<string, unknown>)["@context"]).toBe(
      "https://schema.org",
    );
  });

  it("la table des matières et la pastille survivent SANS JavaScript", async () => {
    const html = await (await demander("/")).text();
    expect(html).toContain('<details class="tdm" open>');
    expect(html).toContain("html.js .haut{opacity:0;visibility:hidden}");
    expect(html).toContain('<a href="#top" class="haut">');
    expect(html).toContain('<span aria-hidden="true">');
    expect(html).toContain('<span class="sr">');
  });

  it("les deux bascules sont dans la barre de titre, alignées à droite", async () => {
    const html = await (await demander("/")).text();
    expect(html).toContain('<div class="bar">');
    expect(html).toContain('<div class="btns">');
    expect(html).toContain(".bar{display:flex;align-items:center;justify-content:space-between");
    const bar = html.indexOf('<div class="bar">');
    expect(html.indexOf("<h1>", bar)).toBeLessThan(html.indexOf('<div class="btns">', bar));
  });
});

describe("§18 — le registre est la source, pas une copie", () => {
  it("le nombre d'outils de la page suit TOOLS", async () => {
    const html = await (await demander("/")).text();
    for (const nom of Object.keys(TOOLS)) {
      expect(html, nom).toContain(nom);
    }
  });

  it("chaque outil a son pendant ANGLAIS et un résumé clair, dans les DEUX sens", async () => {
    expect(Object.keys(OUTILS_EN).sort()).toEqual(Object.keys(TOOLS).sort());
    expect(Object.keys(RESUME_OUTILS_FR).sort()).toEqual(Object.keys(TOOLS).sort());
    for (const [nom, frLines] of Object.entries(RESUME_OUTILS_FR)) {
      expect(frLines.length, `${nom} resume FR`).toBeGreaterThanOrEqual(1);
      expect(OUTILS_EN[nom]!.resume.length, `${nom} resume EN`).toBe(frLines.length);
    }
  });

  it("aucune traduction anglaise n'est une copie du français", async () => {
    for (const [nom, t] of Object.entries(TOOLS)) {
      const en = OUTILS_EN[nom]!;
      expect(en.titre, nom).not.toBe(t.title);
      expect(en.texte, nom).not.toBe(t.description);
      expect(en.titre.length, nom).toBeGreaterThan(3);
      expect(en.texte.length, nom).toBeGreaterThan(40);
    }
  });

  it("la version ANGLAISE nomme aussi la source de chaque outil", () => {
    for (const [nom, en] of Object.entries(OUTILS_EN)) {
      const texte = `${en.titre} ${en.texte}`;
      expect(texte, nom).toMatch(/canlii/i);
    }
  });

  const RESERVES_BILINGUES: Record<string, [RegExp, RegExp]> = {
    get_legislation: [/JAMAIS l'instrument/, /never the instrument/i],
    list_databases: [/ENTIER/, /WHOLE directory/],
    list_exempt_cases: [
      /n'établit NI l'autorité actuelle/,
      /establishes NEITHER the current authority/i,
    ],
    check_exempt_cases: [/ne vaut JAMAIS ni absence/, /NEVER means absence/i],
  };

  it("une réserve SUBSTANTIELLE portée en français l'est aussi en anglais", () => {
    for (const [nom, [fr, en]] of Object.entries(RESERVES_BILINGUES)) {
      expect(TOOLS[nom]!.description, `${nom} (fr)`).toMatch(fr);
      expect(OUTILS_EN[nom]!.texte, `${nom} (en)`).toMatch(en);
    }
  });

  it("la page ne dit pas que l'OUTIL réconcilie le répertoire : il DÉTECTE", () => {
    expect(OUTILS_EN.list_databases!.texte).not.toMatch(/\breconcil/i);
    expect(OUTILS_EN.list_databases!.texte).toMatch(/flagged/i);
  });
});

describe("§18 — le contrat de vérité tient sur la page", () => {
  it("la PROSE DE LA PAGE n'emploie aucune formulation interdite", async () => {
    const html = await (await demander("/")).text();
    const prose = html.replace(/<article>[\s\S]*?<\/article>/g, "");
    expect(prose.length).toBeLessThan(html.length - 5000);
    for (const interdite of [
      /n'existe pas/i,
      /n'a jamais existé/i,
      /\ba été infirmée\b/i,
      /\btoujours en vigueur\b/i,
      /\bfait autorité\b/i,
      /\bcitation valide\b/i,
    ]) {
      expect(prose, `formulation interdite ${interdite}`).not.toMatch(interdite);
    }
  });
});

describe("§18 / invariant 19 — la page dérive, et ses classes existent", () => {
  it("aucune classe CSS employée n'est indéfinie", async () => {
    const html = await (await demander("/")).text();
    const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
    const employees = new Set(
      [...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1]!.trim().split(/\s+/)),
    );
    const defini = (c: string) =>
      css.includes(`.${c} `) || /[,{:>]/.test(css.charAt(css.indexOf(`.${c}`) + c.length + 1));
    const orphelines = [...employees].filter((c) => !css.includes(`.${c}`) || !defini(c));
    expect(orphelines).toEqual([]);
  });

  it("le marqueur openWorldHint est DÉRIVÉ : deux faux, dix vrais", async () => {
    const html = await (await demander("/")).text();
    const vrais = [...html.matchAll(/openWorldHint: true/g)].length;
    const faux = [...html.matchAll(/openWorldHint: false/g)].length;
    expect(faux).toBe(2);
    expect(vrais).toBe(10);
    expect(faux + vrais).toBe(Object.keys(TOOLS).length);
  });

  it("le renvoi croisé get_case ↔ verify_citations et check_exempt_cases tient dans les DEUX langues", async () => {
    const fr = TOOLS.get_case!.description;
    const frV = TOOLS.verify_citations!.description;
    expect(fr).toContain("verify_citations");
    expect(frV).toContain("get_case");
    expect(OUTILS_EN.get_case!.texte).toContain("verify_citations");
    expect(OUTILS_EN.verify_citations!.texte).toContain("get_case");
    expect(TOOLS.check_exempt_cases!.description).toContain("verify_citations");
    expect(OUTILS_EN.check_exempt_cases!.texte).toContain("verify_citations");
    expect(OUTILS_EN.check_exempt_cases!.texte).toContain("list_exempt_cases");
  });

  it("chaque description de paramètre PARAÎT sur la page", async () => {
    const html = await (await demander("/")).text();
    const toutes: string[] = [];
    for (const t of Object.values(TOOLS)) {
      for (const p of Object.values(t.inputSchema.properties ?? {})) {
        if (p.description) toutes.push(p.description);
        for (const sp of Object.values(p.items?.properties ?? {})) {
          if (sp.description) toutes.push(sp.description);
        }
      }
    }
    expect(toutes.length).toBeGreaterThan(40);
    const clair = html
      .split("&#39;")
      .join("'")
      .split("&quot;")
      .join('"')
      .split("&amp;")
      .join("&")
      .split("&lt;")
      .join("<")
      .split("&gt;")
      .join(">");
    const absentes = toutes.filter((d) => !clair.includes(d));
    expect(absentes).toEqual([]);
  });

  it("D14 : renvoie vers les connecteurs « outils » et « lois » sans anciens libellés", async () => {
    const html = await (await demander("/")).text();
    expect(html).toContain("« outils »");
    expect(html).toContain("« lois »");
    expect(html).not.toContain("Législation du Québec");
    expect(html).not.toContain("MCP Outils");

    const card = await (await demander("/mcp/server-card")).text();
    for (const corps of [html, card]) {
      expect(corps).not.toContain("list_exempt_authorities");
      expect(corps).not.toContain("check_exempt_authorities");
      expect(corps).not.toContain("check_exempt_authority");
    }
  });
});
