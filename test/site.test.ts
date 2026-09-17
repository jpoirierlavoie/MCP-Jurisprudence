/**
 * Page publique (§18) — route, en-têtes, et surtout ABSENCE DE FUITE.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ Cette page est la PREMIÈRE surface HTML du dépôt, sur une origine qui sert   ║
 * ║ par ailleurs `/mcp/<secret>`. Le risque n'est pas qu'elle soit laide : c'est ║
 * ║ qu'elle divulgue, qu'elle serve d'oracle à une autre origine, ou qu'elle     ║
 * ║ ouvre par mégarde une brèche dans la garde du bloc `/mcp`.                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { GARDE_DOSSIER, GARDE_PALAIS, GARDE_SANS_ADRESSE } from "../src/format/render";
import worker from "../src/index";
import { TOOLS } from "../src/mcp/registry";
import { GREFFES } from "../src/qc/greffes";
import { JURIDICTIONS } from "../src/qc/juridictions";
import { MJQ_MAJ } from "../src/qc/lieux";
import { RELEVE_LE } from "../src/qc/palais";
import { SECTIONS } from "../src/site";
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
    // La page est une exception NOMMÉE, pas un fourre-tout : une égalité stricte,
    // jamais un `startsWith("/")`.
    for (const chemin of ["/autre", "/index.html", "/favicon.ico", "/mcp2", "/a/b"]) {
      expect((await demander(chemin)).status, chemin).toBe(404);
    }
  });

  it("la page survit au coupe-circuit, /health et /mcp non", async () => {
    // Exception délibérée : le coupe-circuit protège la SURFACE MCP. La page ne
    // porte ni secret ni donnée vivante, et c'est justement quand le connecteur est
    // coupé qu'on veut pouvoir lire pourquoi.
    const e = envAvec({ MCP_ENABLED: "false" });
    expect((await demander("/", { env: e })).status).toBe(200);
    expect((await demander("/health", { env: e })).status).toBe(404);
    expect((await demander(`/mcp/${SECRET}`, { method: "POST", env: e })).status).toBe(404);
  });
});

describe("§18 — la page ne divulgue rien", () => {
  it("ne contient NI le secret, NI rien qui y ressemble", async () => {
    const html = await (await demander("/")).text();
    expect(html).not.toContain(SECRET);
    expect(html).not.toMatch(/Bearer\s/);
    // Aucune chaîne de 32 caractères hexadécimaux ou plus : la forme d'un jeton.
    expect(html).not.toMatch(/[0-9a-f]{32,}/i);
    // Ni la clef d'API ni l'hôte qui la porte (§5.3).
    expect(html).not.toContain("api.canlii.org");
    expect(html).not.toContain("api_key");
  });

  it("documente la FORME du point d'entrée, jamais une URL utilisable", async () => {
    const html = await (await demander("/")).text();
    expect(html).toContain("/mcp/&lt;secret&gt;");
  });

  it("n'émet AUCUN en-tête CORS — elle ne peut pas servir d'oracle", async () => {
    // Sans `Access-Control-Allow-Origin`, aucun script d'une autre origine ne peut
    // LIRE cette réponse. En ajouter « par cohérence » serait une régression.
    for (const headers of [undefined, { Origin: "https://claude.ai" }]) {
      const res = await demander("/", { headers });
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(res.headers.get("Access-Control-Expose-Headers")).toBeNull();
    }
  });

  it("une origine de navigateur INCONNUE n'est pas refusée sur la page", async () => {
    // La garde contre le ré-attachement DNS vit DANS le bloc /mcp. Une page publique
    // doit répondre à n'importe quel navigateur — y compris à un visiteur arrivant
    // par un lien d'un autre site, qui émet une Origin quelconque.
    const res = await demander("/", { headers: { Origin: "https://exemple.invalide" } });
    expect(res.status).toBe(200);
    // ... et la même origine reste refusée sur /mcp.
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
    // Le jumeau a documenté le piège : un `s-maxage` long fait survivre la page à son
    // propre déploiement. Ici le rendu ne coûte rien, il n'y a rien à amortir.
    const cc = (await demander("/")).headers.get("Cache-Control") ?? "";
    expect(cc).toContain("max-age=600");
    expect(cc).not.toContain("s-maxage");
  });
});

describe("§18 — bilinguisme et thème", () => {
  it("sert le FRANÇAIS par défaut, sans JavaScript", async () => {
    const html = await (await demander("/")).text();
    expect(html).toContain('<html lang="fr" class="l-fr">');
    // La règle unique qui porte tout le bilinguisme.
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
    // « auto » est l'ABSENCE des deux classes : c'est ce qui rend la main à la
    // media query. Le sélecteur doit donc exister tel quel.
    expect(html).toContain("html:not(.t-light):not(.t-dark) #theme [data-t=auto]");
    expect(html).toContain("@media(prefers-color-scheme:dark)");
  });

  it("le script de tête COMPOSE langue et thème", async () => {
    // Le piège du jumeau : écrire `className` en bloc dans l'un des deux
    // gestionnaires efface l'autre classe en silence.
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
      /https?:\/\/(?!jurisprudence\.poirierlavoie\.ca|github\.com|www\.justice\.gouv\.qc\.ca|canlii\.ca)[a-z]/i,
    );
    expect(html).not.toContain("@import");
  });

  it("aucune couleur en dur hors des deux jeux de thème", async () => {
    // Une couleur écrite en dur ne bascule pas : elle devient invisible dans l'un des
    // deux thèmes, et personne ne s'en aperçoit avant de regarder.
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

  it("chaque ancre du sommaire vise une section qui existe", async () => {
    // « #top » est EXCLU à dessein : c'est le repli spécifié par HTML pour le haut du
    // document, et il ne doit surtout PAS avoir de cible. Lui en inventer une casserait
    // la pastille de retour en haut là où le JavaScript ne s'exécute pas.
    const html = await (await demander("/")).text();
    for (const m of html.matchAll(/<a href="#([a-z]+)"/g)) {
      if (m[1] === "top") continue;
      expect(html, m[1]).toContain(`<h2 id="${m[1]}"`);
    }
    // ... et le sommaire couvre bel et bien toutes les sections.
    for (const s of SECTIONS) {
      expect(html, s.id).toContain(`<a href="#${s.id}"`);
      expect(html, s.id).toContain(`<h2 id="${s.id}"`);
    }
  });

  it("la table des matières et la pastille survivent SANS JavaScript", async () => {
    const html = await (await demander("/")).text();
    // Le <details> porte `open` dans le BALISAGE : sans script il reste déplié.
    expect(html).toContain('<details class="tdm" open>');
    // La pastille n'est masquée que par `html.js`, classe posée par le script lui-même.
    // Si le script ne s'exécute jamais, elle reste simplement visible.
    expect(html).toContain("html.js .haut{opacity:0;visibility:hidden}");
    expect(html).toContain('<a href="#top" class="haut">');
    // Son nom accessible vient du libellé .sr, pas de la flèche (aria-hidden).
    expect(html).toContain('<span aria-hidden="true">');
    expect(html).toContain('<span class="sr">');
  });

  it("les deux bascules sont dans la barre de titre, alignées à droite", async () => {
    const html = await (await demander("/")).text();
    expect(html).toContain('<div class="bar">');
    expect(html).toContain('<div class="btns">');
    expect(html).toContain(".bar{display:flex;align-items:center;justify-content:space-between");
    // L'ordre dans le DOM : le titre, PUIS les boutons.
    const bar = html.indexOf('<div class="bar">');
    expect(html.indexOf("<h1>", bar)).toBeLessThan(html.indexOf('<div class="btns">', bar));
  });
});

describe("§18 — le registre est la source, pas une copie", () => {
  it("le nombre d'outils de la page suit TOOLS", async () => {
    // Épingle la propriété qui compte : la page ne peut pas prendre du retard sur le
    // registre, puisqu'elle en dérive. Si ce test échoue, c'est qu'une copie a été
    // introduite quelque part.
    const html = await (await demander("/")).text();
    for (const nom of Object.keys(TOOLS)) {
      expect(html, nom).toContain(nom);
    }
  });

  it("chaque outil a son pendant ANGLAIS, dans les DEUX sens", async () => {
    // Un outil ajouté sans traduction paraîtrait vide en anglais ; une traduction
    // orpheline survivrait à un outil supprimé. Les deux sont des dérives silencieuses.
    expect(Object.keys(OUTILS_EN).sort()).toEqual(Object.keys(TOOLS).sort());
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
    // Le pendant du test français de `garde.test.ts`. La page est bilingue et le
    // visiteur anglophone n'en lit qu'une moitié : une réserve portée d'un seul côté
    // n'est pas portée. Six traductions sur dix ne nommaient CanLII nulle part —
    // le préfixe le disait pour elles, et il ne le dira plus.
    for (const [nom, en] of Object.entries(OUTILS_EN)) {
      const texte = `${en.titre} ${en.texte}`;
      const local = nom.startsWith("greffe_") || nom.startsWith("palais_");
      // ⚠ « Québec » a été RETIRÉ de l alternative locale le 2026-09-16, et c est le point
      //   de ce test. Québec est un LIEU, pas une source : il figure par construction dans le
      //   titre des trois outils locaux, si bien que l assertion passait TOUJOURS — y compris
      //   quand les trois descriptions anglaises ne nommaient aucune source et ne portaient
      //   aucune réserve de péremption, ce qui était le cas. Une assertion qui ne peut plus
      //   échouer achète une confiance qu elle ne finance pas.
      expect(texte, nom).toMatch(local ? /minist|MJQ/i : /canlii/i);
    }
  });

  /**
   * LA PARITÉ DES CLEFS NE VOIT PAS LE CONTENU.
   *
   * Le test des DEUX SENS confronte des ENSEMBLES DE CLEFS ; celui de la copie refuse
   * une traduction identique au français. Ni l'un ni l'autre ne remarque qu'une réserve
   * AJOUTÉE au français n'a pas de pendant anglais : le visiteur anglophone n'en lit
   * qu'une moitié, et une réserve portée d'un seul côté n'est pas portée.
   *
   * ⚠ Cette table est tenue À LA MAIN, délibérément, et n'énumère que les réserves
   *   SUBSTANTIELLES — celles dont l'absence change ce que la page promet. Une
   *   confrontation automatique mot à mot serait impossible entre deux langues, et une
   *   liste exhaustive se périmerait à la première reformulation.
   */
  const RESERVES_BILINGUES: Record<string, [RegExp, RegExp]> = {
    // Ajoutée le 2026-09-17 : les dates d'une fiche législative bornent la VERSION
    // servie par CanLII, jamais l'instrument.
    jurisprudence_get_legislation: [/JAMAIS l'instrument/, /never the instrument/i],
  };

  it("une réserve SUBSTANTIELLE portée en français l'est aussi en anglais", () => {
    for (const [nom, [fr, en]] of Object.entries(RESERVES_BILINGUES)) {
      expect(TOOLS[nom]!.description, `${nom} (fr)`).toMatch(fr);
      expect(OUTILS_EN[nom]!.texte, `${nom} (en)`).toMatch(en);
    }
  });

  it("la table des greffes porte EXACTEMENT les greffes de la table", async () => {
    const html = await (await demander("/")).text();
    const corps = html.slice(html.indexOf('<table id="tgreffes"'));
    const rangs = (corps.match(/<tr data-d=/g) ?? []).length;
    expect(rangs).toBe(Object.keys(GREFFES).length);
    for (const numero of Object.keys(GREFFES)) {
      expect(corps, numero).toContain(`<code>${numero}</code>`);
    }
  });

  it("les 27 codes de juridiction paraissent, tiret cadratin compris", async () => {
    const html = await (await demander("/")).text();
    for (const code of Object.keys(JURIDICTIONS)) {
      expect(html, code).toContain(`<code>${code}</code>`);
    }
    // Le tiret cadratin de 46, 72 et 73 est une VALEUR, pas un champ vide.
    expect(html).toContain("<td>—</td>");
  });
});

describe("§18 — le contrat de vérité tient sur la page", () => {
  it("porte les trois réserves imposées, verbatim", async () => {
    const html = await (await demander("/")).text();
    // Les réserves traversent `esc()` : l'apostrophe devient `&#39;`. On compare donc
    // la forme ÉCHAPPÉE — comparer la forme brute passerait à côté sans rien prouver.
    const echapper = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;");
    const plat = (s: string) => s.replace(/\s+/g, " ").trim();
    const page = plat(html);
    for (const [nom, garde] of [
      ["GARDE_PALAIS", GARDE_PALAIS],
      ["GARDE_SANS_ADRESSE", GARDE_SANS_ADRESSE],
      ["GARDE_DOSSIER", GARDE_DOSSIER],
    ] as const) {
      expect(page, nom).toContain(plat(echapper(garde)));
    }
    // La réserve de péremption ne vaut rien sans sa DATE.
    expect(html).toContain(RELEVE_LE);
    expect(html).toContain(MJQ_MAJ);
  });

  it("énonce l'absence de coordonnées plutôt que de la laisser découvrir", async () => {
    const html = await (await demander("/")).text();
    expect(html).toContain("AUCUN numéro de téléphone");
    expect(html).toContain("justice.gouv.qc.ca");
  });

  it("la PROSE DE LA PAGE n'emploie aucune formulation interdite", async () => {
    // Les mêmes que celles qu'interdit test/garde.test.ts aux sorties d'outils : une
    // page qui affirmerait plus que l'API n'établit serait le même défaut, en vitrine.
    //
    // ⚠ On retire d'abord les fiches d'outils. Elles rendent les descriptions de §7
    //   VERBATIM, et l'une d'elles contient « a été infirmée » — à l'intérieur d'une
    //   NÉGATION (« n'indique pas si une décision a été infirmée… »). Ce texte fait
    //   foi et ne se reformule pas ; il est déjà gouverné par ses propres assertions
    //   dans garde.test.ts. Ce que ce test-ci protège, c'est la prose PROPRE à la page.
    const html = await (await demander("/")).text();
    const prose = html.replace(/<article>[\s\S]*?<\/article>/g, "");
    // Garde de la garde : si les fiches d'outils changeaient de balise, le retrait
    // ci-dessus deviendrait muet et ce test passerait pour de mauvaises raisons.
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

  it("n'attribue PAS à CanLII les données locales du Québec", async () => {
    const html = await (await demander("/")).text();
    const debut = html.indexOf('<section id="greffes"');
    const fin = html.indexOf("<section", debut + 1);
    const greffes = html.slice(debut, fin > 0 ? fin : undefined);
    expect(greffes.length).toBeGreaterThan(1000);
    expect(greffes).not.toMatch(/CanLII/i);
  });
});

/**
 * §18 / INVARIANT 19 — CE QUE LA PAGE AFFIRME, ELLE LE DÉRIVE.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ Ces quatre gardes ferment des dérives qu'AUCUN test n'attrapait, et dont    ║
 * ║ chacune s'était déjà produite :                                              ║
 * ║                                                                              ║
 * ║  · la page AFFIRMAIT « ses annotations MCP le déclarent » sans jamais lire   ║
 * ║    `annotations` — l'interface `Descripteur` les jetait. Basculer un outil   ║
 * ║    de DISTANT à LOCAL n'aurait pas changé un octet de la page ;              ║
 * ║  · le renvoi croisé get_case ↔ verify_citations existait en français et pas  ║
 * ║    en anglais : la réserve « n'éprouve pas la citation » n'était portée que  ║
 * ║    d'un côté, et le test de parité ne l'a pas vu parce qu'il n'exigeait de   ║
 * ║    l'anglais qu'un /canlii/i — satisfait par « canlii.ca » ;                 ║
 * ║  · neuf usages de `class="small"` et six de `class="muted"` pour deux        ║
 * ║    classes définies NULLE PART : toute la hiérarchie visuelle secondaire     ║
 * ║    était inerte, et « aucune adresse publiée » se rendait comme une adresse. ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
describe("§18 / invariant 19 — la page dérive, et ses classes existent", () => {
  it("aucune classe CSS employée n'est indéfinie", async () => {
    // Garde STRUCTURELLE : une classe absente du CSS ne lève rien, elle ne fait
    // simplement RIEN. Le défaut se voit à l'œil sur la page rendue, et pas du tout
    // dans la suite — c'est exactement le mode de panne silencieux que §2 vise.
    const html = await (await demander("/")).text();
    const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
    const employees = new Set(
      [...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1]!.trim().split(/\s+/)),
    );
    // Une classe est DÉFINIE si le CSS porte « .<nom> » suivi d'un caractère qui clôt
    // le sélecteur : espace (sélecteur descendant), virgule, accolade, deux-points
    // (pseudo-classe) ou chevron. La liste est explicite plutôt qu'écrite en s :
    // ce fichier a déjà perdu une barre oblique inverse en chemin.
    const defini = (c: string) =>
      css.includes(`.${c} `) || /[,{:>]/.test(css.charAt(css.indexOf(`.${c}`) + c.length + 1));
    const orphelines = [...employees].filter((c) => !css.includes(`.${c}`) || !defini(c));
    expect(orphelines).toEqual([]);
  });

  it("le marqueur openWorldHint est DÉRIVÉ : quatre faux, neuf vrais", async () => {
    const html = await (await demander("/")).text();
    const vrais = [...html.matchAll(/openWorldHint: true/g)].length;
    const faux = [...html.matchAll(/openWorldHint: false/g)].length;
    expect(faux).toBe(4);
    expect(vrais).toBe(9);
    expect(faux + vrais).toBe(Object.keys(TOOLS).length);
  });

  it("le renvoi croisé get_case ↔ verify_citations tient dans les DEUX langues", async () => {
    // Le français vient du registre et ne peut pas dériver ; l'anglais est écrit à la
    // main dans OUTILS_EN, et c'est lui qui avait pris du retard.
    const fr = TOOLS.jurisprudence_get_case!.description;
    const frV = TOOLS.jurisprudence_verify_citations!.description;
    expect(fr).toContain("jurisprudence_verify_citations");
    expect(frV).toContain("jurisprudence_get_case");
    expect(OUTILS_EN.jurisprudence_get_case!.texte).toContain("jurisprudence_verify_citations");
    expect(OUTILS_EN.jurisprudence_verify_citations!.texte).toContain("jurisprudence_get_case");
  });

  it("chaque description de paramètre PARAÎT sur la page", async () => {
    // La page documentait le type et les bornes, jamais le sens. Les descriptions
    // existent toutes depuis le 2026-09-16 ; sans ce test, la colonne pourrait être
    // retirée « pour alléger le tableau » sans qu'aucune commande ne s'en aperçoive.
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
    expect(toutes.length).toBeGreaterThan(50);
    // L'échappement HTML transforme les apostrophes : on compare sur un fragment sûr.
    // La page ÉCHAPPE le HTML : on déséchappe plutôt que d'amputer l'aiguille, sans
    // quoi le test passerait sur des fragments tronqués avant la première apostrophe.
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
});
