/**
 * Page publique du connecteur (§18) — `GET /`, et fichiers publics de découverte
 * (`/robots.txt`, `/sitemap.xml`, `/llms.txt`).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠ CETTE PAGE EST PUBLIQUE. Le secret partagé ne doit JAMAIS y paraître.      ║
 * ║                                                                              ║
 * ║ Elle documente la FORME du point d'entrée — `/mcp/<secret>` — et jamais une  ║
 * ║ URL réelle. Elle ne lit pas `env.MCP_SHARED_SECRET`, ne lit pas `request.url`║
 * ║ et n'appelle rien. Un test épingle l'absence de toute chaîne qui ressemble à ║
 * ║ un jeton dans le corps rendu.                                                ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * TOUT LE CONTENU DÉRIVE DES DONNÉES VIVES : les outils viennent du registre et les
 * schémas du même `inputSchema` que le validateur applique.
 *
 * Aucune dépendance, aucune requête tierce : ni police distante, ni CDN, ni image.
 * Sans JavaScript, le FRANÇAIS s'affiche et tout le contenu reste lisible.
 */

import type { JsonSchema } from "@poirierlavoie/mcp-socle";
import { listToolDescriptors, PUBLIC_DESCRIPTION } from "./mcp/registry";
import { EN, OUTILS_EN } from "./site.i18n";

const ORIGINE_SITE = "https://jurisprudence.poirierlavoie.ca";
const DEPOT = "https://github.com/jpoirierlavoie/MCP-Jurisprudence";
const DEPOT_PLUGIN = "https://github.com/jpoirierlavoie/droit-civil-quebecois";

/** Échappement HTML. Appliqué à TOUTE valeur interpolée, sans exception. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Bloc bilingue : les DEUX langues sont émises, une règle CSS n'en montre qu'une. */
export function bi(fr: string, en: string): string {
  return `<span data-l="fr">${esc(fr)}</span><span data-l="en" lang="en">${esc(en)}</span>`;
}

/** Suite de paragraphes bilingues. */
export function biP(fr: readonly string[], en: readonly string[]): string {
  return (
    `<div data-l="fr">${fr.map((p) => `<p>${esc(p)}</p>`).join("")}</div>\n` +
    `<div data-l="en" lang="en">${en.map((p) => `<p>${esc(p)}</p>`).join("")}</div>`
  );
}

export const SECTIONS = [
  { id: "outils", fr: "Les outils", en: "The tools" },
  { id: "schema", fr: "Les schémas", en: "The schemas" },
  { id: "acces", fr: "Accès", en: "Access" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

const TITRE_SECTION = new Map<SectionId, { fr: string; en: string }>(
  SECTIONS.map((s) => [s.id, { fr: s.fr, en: s.en }]),
);

function h2(id: SectionId): string {
  const t = TITRE_SECTION.get(id)!;
  return `<h2 id="h-${id}">${bi(t.fr, t.en)}</h2>`;
}

function compacterBloc(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\/\/.*$/, "").trim())
    .filter(Boolean)
    .join("\n");
}

// ── Thème ─────────────────────────────────────────────────────────────────────

const CLAIR =
  "color-scheme:light;--f:#111;--m:#666;--b:#e2e0da;--a:#7a2e1d;--bg:#fdfcfa;--card:#fff;" +
  "--th:#f7f5f1;--code:#f2efe9;--hover:#faf8f4;--avert-bg:#fbf7f1;--avert-b:#e6d9c6";

const SOMBRE =
  "color-scheme:dark;--f:#e8e6e1;--m:#a09a90;--b:#3a372f;--a:#e08b6a;--bg:#16150f;--card:#1e1c16;" +
  "--th:#252219;--code:#252219;--hover:#242118;--avert-bg:#211d15;--avert-b:#3d3527";

const LARGE = "78rem";
const SOLEIL = "☀︎";
const FLECHE = "↑︎";

const CSS = `
:root{${CLAIR}}
@media(prefers-color-scheme:dark){:root{${SOMBRE}}}
html.t-light{${CLAIR}}
html.t-dark{${SOMBRE}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--f);font:16px/1.6 Georgia,'Times New Roman',serif}
.wrap{max-width:${LARGE};margin:0 auto;padding:2rem 1.25rem 4rem;display:grid;gap:1rem}
main{min-width:0;max-width:60rem;width:100%;justify-self:center}
section[id]{scroll-margin-top:1.5rem}
#schema{content-visibility:auto;contain-intrinsic-size:auto 40rem}
h1{font-size:1.6rem;margin:0}
h2{font-size:1.35rem;margin:2.75rem 0 .75rem;padding-bottom:.3rem;border-bottom:2px solid var(--b)}
h3{font-size:1.1rem;margin:1.75rem 0 .5rem}
h4{font-size:1rem;margin:1.25rem 0 .25rem}
p{margin:.6rem 0}
a{color:var(--a)}
code{font:.9em ui-monospace,Menlo,Consolas,monospace;background:var(--code);padding:.1em .35em;border-radius:3px}
:where(a,button,summary,[tabindex]):focus-visible{outline:2px solid var(--a);outline-offset:2px}
.saut{position:fixed;left:1rem;top:1rem;z-index:20;padding:.45rem .85rem;background:var(--card);
  color:var(--a);border:2px solid var(--a);border-radius:6px;font-weight:700;text-decoration:none}
.saut:not(:focus-visible){position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;
  clip-path:inset(50%);white-space:nowrap;border:0}
.suite{display:flex;align-items:center;justify-content:space-between;gap:.5rem 1rem;flex-wrap:wrap;
  margin:0 0 1rem;padding:0 0 .65rem;border-bottom:1px solid var(--b);font-size:.88rem}
.suite-t{font-weight:700;color:var(--m);letter-spacing:.02em}
.suite ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.35rem}
.suite a{display:inline-block;padding:.28rem .65rem;border:1px solid transparent;border-radius:999px;
  color:var(--m);text-decoration:none;min-height:1.75rem}
.suite a:hover{color:var(--a);border-color:var(--b);background:var(--card)}
.suite a[aria-current=page]{color:var(--a);font-weight:700;border-color:var(--a);background:var(--card)}
.bar{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.btn{font:inherit;font-size:.86rem;font-weight:700;background:var(--a);color:var(--bg);
  border:1px solid var(--a);border-radius:999px;padding:.35rem .95rem;text-decoration:none;white-space:nowrap;display:inline-block}
.btn:hover{opacity:.92}
.btn-sec,#bascule,#theme{font:inherit;font-size:.8rem;letter-spacing:.04em;background:var(--card);border:1px solid var(--b);
  border-radius:999px;padding:.35rem .9rem;cursor:pointer;color:var(--m);text-decoration:none;white-space:nowrap;display:inline-block}
.btn-sec:hover,#bascule:hover,#theme:hover{border-color:var(--a);color:var(--a)}
.btns{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
#theme{min-width:6.5rem;text-align:center}
#theme [data-t]{display:none}
html:not(.t-light):not(.t-dark) #theme [data-t=auto],
html.t-light #theme [data-t=light],
html.t-dark #theme [data-t=dark]{display:inline}
.badge{display:inline-block;font-size:.78rem;padding:.2rem .6rem;border-radius:999px;
  border:1px solid var(--avert-b);background:var(--avert-bg);color:var(--f)}
.m{color:var(--m);font-size:.85rem}
.tw{overflow-x:auto;border:1px solid var(--b);border-radius:6px;background:var(--card)}
table{border-collapse:collapse;width:100%;font-size:.88rem}
th,td{padding:.5rem .7rem;text-align:left;border-bottom:1px solid var(--b);vertical-align:top}
th{background:var(--th);position:sticky;top:0}
td.n,th.n{text-align:right;white-space:nowrap}
tbody tr:hover{background:var(--hover)}
pre{background:var(--code);border:1px solid var(--b);border-radius:6px;padding:.7rem .9rem;
  overflow-x:auto;font-size:.85rem;line-height:1.5}
.tdm{max-width:60rem;width:100%;justify-self:center}
.tdm ul{list-style:none;margin:.5rem 0 0;padding:0;font-size:.85rem}
.tdm li{margin:.15rem 0}
.tdm a{display:block;padding:.25rem .6rem;border-left:2px solid var(--b);
  color:var(--m);text-decoration:none}
.tdm a:hover,.tdm a.on{color:var(--a);border-left-color:var(--a)}
.tdm a.on{font-weight:700}
details{border:1px solid var(--b);border-radius:6px;background:var(--card);margin:.5rem 0;padding:.6rem .9rem}
summary{cursor:pointer;font-weight:700}
#outils article{border-left:3px solid var(--b);padding-left:1rem;margin:1.5rem 0}
#outils .titre{color:var(--m);font-style:italic;margin:.1rem 0 .5rem}
.avert{background:var(--avert-bg);border:1px solid var(--avert-b);border-radius:6px;padding:.25rem 1.25rem 1rem}
footer{margin-top:3.5rem;padding-top:1.25rem;border-top:2px solid var(--b);font-size:.9rem;color:var(--m)}
.sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;
  clip-path:inset(50%);white-space:nowrap;border:0}
.haut{position:fixed;right:1.25rem;bottom:1.25rem;z-index:10;width:2.6rem;height:2.6rem;
  display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:1.1rem;
  background:var(--card);color:var(--m);border:1px solid var(--b);border-radius:999px}
.haut:hover{color:var(--a);border-color:var(--a)}
html.js .haut{opacity:0;visibility:hidden}
html.js .haut.on{opacity:1;visibility:visible}
@media(prefers-reduced-motion:no-preference){
  html{scroll-behavior:smooth}
  .haut{transition:opacity .2s,visibility .2s,color .2s,border-color .2s}
}
@media(forced-colors:active){
  .suite a[aria-current=page],.tdm a.on{outline:2px solid Highlight}
}
html.l-fr [data-l=en],html.l-en [data-l=fr]{display:none}
@media(min-width:${LARGE}){
  .wrap{grid-template-columns:13rem minmax(0,60rem);gap:2.5rem;align-items:start}
  main,.tdm{max-width:none}
  .tdm{position:sticky;top:2rem;border:0;background:none;margin:0;padding:0;
    max-height:calc(100vh - 4rem);overflow:auto}
  .tdm>summary{display:none}
}
`;

// biome-ignore lint/complexity/noUselessStringRaw: parade délibérée
const BOOT = String.raw`
try{
  var r=document.documentElement, c=[];
  var p=localStorage.getItem('jurisLang')||(navigator.language||'fr').slice(0,2);
  c.push(p==='en'?'l-en':'l-fr'); r.lang=(p==='en'?'en':'fr');
  var t=localStorage.getItem('jurisTheme');
  if(t==='light'||t==='dark') c.push('t-'+t);
  r.className=c.join(' ');
}catch(e){}
`;

const JS = `
(function(){
  var d=document, h=d.documentElement;

  var b=d.getElementById('bascule');
  if(b) b.addEventListener('click',function(){
    var nv=h.classList.contains('l-en')?'fr':'en';
    h.classList.toggle('l-fr',nv==='fr'); h.classList.toggle('l-en',nv==='en');
    h.lang=nv;
    try{localStorage.setItem('jurisLang',nv);}catch(e){}
  });

  var tb=d.getElementById('theme');
  if(tb) tb.addEventListener('click',function(){
    var cur=h.classList.contains('t-light')?'light'
           :h.classList.contains('t-dark')?'dark':'auto';
    var nx=cur==='auto'?'light':cur==='light'?'dark':'auto';
    h.classList.remove('t-light'); h.classList.remove('t-dark');
    if(nx!=='auto') h.classList.add('t-'+nx);
    try{
      if(nx==='auto') localStorage.removeItem('jurisTheme');
      else localStorage.setItem('jurisTheme',nx);
    }catch(e){}
  });

  var td=d.querySelector('.tdm');
  if(td){
    try{
      var mq=matchMedia('(min-width:LARGEUR)');
      var sync=function(){td.open=mq.matches;};
      sync();
      if(mq.addEventListener) mq.addEventListener('change',sync);
      else if(mq.addListener) mq.addListener(sync);
    }catch(e){}
    try{
      var liens=[].slice.call(td.querySelectorAll('a'));
      var cibles=liens.map(function(a){return d.getElementById(a.getAttribute('href').slice(1));});
      var io=new IntersectionObserver(function(es){
        for(var n=0;n<es.length;n++){
          if(!es[n].isIntersecting) continue;
          var k=cibles.indexOf(es[n].target); if(k<0) continue;
          for(var j=0;j<liens.length;j++) liens[j].classList.remove('on');
          liens[k].classList.add('on');
        }
      },{rootMargin:'0px 0px -70% 0px'});
      for(var n2=0;n2<cibles.length;n2++) if(cibles[n2]) io.observe(cibles[n2]);
    }catch(e){}
  }

  var ht=d.querySelector('.haut');
  if(ht){
    try{
      h.classList.add('js');
      var seuil=function(){return (window.innerHeight||600)*0.8;};
      var maj=function(){
        var y=window.pageYOffset||d.documentElement.scrollTop||0;
        if(y>seuil()) ht.classList.add('on'); else ht.classList.remove('on');
      };
      maj();
      window.addEventListener('scroll',maj,{passive:true});
    }catch(e){}
  }
})();
`;

function jsClient(): string {
  if (!JS.includes("LARGEUR")) throw new Error("jeton LARGEUR absent du JS client");
  return JS.replace("LARGEUR", LARGE);
}

// ── Assemblage ────────────────────────────────────────────────────────────────

function sautContenu(): string {
  return `<a href="#contenu-principal" class="saut">${bi("Aller au contenu principal", "Skip to main content")}</a>`;
}

function barreSuite(): string {
  return `<nav class="suite" aria-labelledby="suite-t">
<span id="suite-t" class="sr">${bi("Suite Droit civil québécois", "Québec Civil Law suite")}</span>
<span class="suite-t">${bi("Droit civil québécois", "Québec Civil Law")}</span>
<ul>
<li><a href="https://acces.poirierlavoie.ca/">${bi("Accès", "Access")}</a></li>
<li><a href="https://legislation.poirierlavoie.ca/">${bi("Législation", "Legislation")}</a></li>
<li><a href="/" aria-current="page">${bi("Jurisprudence", "Case Law")}</a></li>
<li><a href="https://outils.poirierlavoie.ca/">${bi("Outils", "Tools")}</a></li>
</ul>
</nav>`;
}

function tdm(): string {
  const items = SECTIONS.map((s) => `<li><a href="#${s.id}">${bi(s.fr, s.en)}</a></li>`).join("");
  return `<details class="tdm" open>
<summary id="tdm-t">${bi("Sommaire", "Contents")}</summary>
<nav aria-labelledby="tdm-t"><ul>${items}</ul></nav>
</details>`;
}

function haut(): string {
  return (
    `<a href="#top" class="haut"><span aria-hidden="true">${FLECHE}</span>` +
    `<span class="sr">${bi("Haut de page", "Back to top")}</span></a>`
  );
}

function etat(t: string, fr: string, en: string): string {
  return `<span data-t="${t}">${bi(fr, en)}</span>`;
}

function entete(): string {
  return `<header>
${barreSuite()}
<div class="bar">
<h1>${bi("MCP Jurisprudence — Vérification de citations (CanLII)", EN.titre)}</h1>
<div class="btns">
<button id="theme" type="button" title="Thème / Theme">${etat("auto", "◐ Auto", "◐ Auto")}${etat("light", `${SOLEIL} Clair`, `${SOLEIL} Light`)}${etat("dark", "☾ Sombre", "☾ Dark")}</button>
<button id="bascule" type="button" title="Français / English">FR&nbsp;·&nbsp;EN</button>
</div>
</div>
${biP(
  [
    "Serveur MCP en lecture seule. Il éprouve des citations de jurisprudence contre la " +
      "collection de CanLII.",
  ],
  EN.intro,
)}
<div class="avert">
${biP(
  [
    "Ce connecteur établit l'EXISTENCE et l'IDENTITÉ d'une décision. Il n'établit ni son " +
      "autorité actuelle — aucun historique d'appel, aucun indicateur de traitement, aucun " +
      "pourvoi pendant — ni le contenu de son dispositif. L'API de CanLII ne rend que des " +
      "métadonnées : jamais le texte d'une décision.",
    "Une absence n'est jamais une preuve d'inexistence.",
  ],
  EN.avertissement,
)}
</div>
<p class="btns">
<span class="badge">${bi("Membres du Barreau du Québec · Clé CanLII requise (BYOK)", "Barreau du Québec members · CanLII key required (BYOK)")}</span>
<a class="btn" href="https://acces.poirierlavoie.ca/demande">${bi("Demander l'accès →", "Apply for access →")}</a>
<a class="btn-sec" href="https://acces.poirierlavoie.ca/">${bi("Portail d'accès", "Access portal")}</a>
</p>
</header>`;
}

// ── Les outils, dérivés du REGISTRE ───────────────────────────────────────────

interface Descripteur {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: { readOnlyHint?: boolean; openWorldHint?: boolean };
}

function descripteurs(): Descripteur[] {
  return listToolDescriptors() as unknown as Descripteur[];
}

function marqueurAppel(d: Descripteur): string {
  const ouvert = d.annotations?.openWorldHint === true;
  return `<p class="m"><code>openWorldHint: ${ouvert}</code> — ${bi(
    ouvert
      ? "source distante : la réponse dépend de la collection de CanLII, et peut être servie du cache local."
      : "aucun appel sortant : la réponse est une fonction pure de tables compilées dans le Worker.",
    ouvert
      ? "distant source: the answer depends on CanLII's collection, and may be served from the local cache."
      : "no outbound call: the answer is a pure function of tables compiled into the Worker.",
  )}</p>`;
}

function outils(): string {
  const carte = (d: Descripteur) => {
    const en = OUTILS_EN[d.name];
    return `<article>
<h4><code>${esc(d.name)}</code></h4>
<p class="titre">${bi(d.title, en?.titre ?? d.title)}</p>
${biP([d.description], [en?.texte ?? d.description])}
${marqueurAppel(d)}
</article>`;
  };

  const tous = descripteurs();

  return `<section id="outils">
${h2("outils")}
<h3>${bi("Adossés à CanLII", EN.familleCanlii)}</h3>
${biP(
  [
    "Dix outils dont la réponse se rapporte à la collection de CanLII — la couverture et les " +
      "verdicts en dépendent. NEUF font un appel sortant et sont soumis au quota de l'API ; " +
      "parse_citation, lui, n'appelle rien : il dit seulement quels identifiants " +
      "une citation permettrait de construire. Ses annotations MCP le déclarent.",
    "Les outils hors ligne pour les numéros de dossier de cour et les palais de justice du " +
      "Québec (greffe_*, palais_*) relèvent désormais du connecteur public sans authentification " +
      "« outils ».",
  ],
  EN.familleCanliiTexte,
)}
${tous.map(carte).join("\n")}
</section>`;
}

// ── Les schémas, dérivés du MÊME objet que le validateur applique ─────────────

function contraintes(s: JsonSchema): string {
  const bouts: string[] = [];
  if (s.enum) bouts.push(s.enum.map((v) => `« ${String(v)} »`).join(" · "));
  if (s.minLength !== undefined || s.maxLength !== undefined) {
    bouts.push(`${s.minLength ?? 0}–${s.maxLength ?? "∞"} car.`);
  }
  if (s.minimum !== undefined || s.maximum !== undefined) {
    bouts.push(`${s.minimum ?? "−∞"} – ${s.maximum ?? "∞"}`);
  }
  if (s.minItems !== undefined || s.maxItems !== undefined) {
    bouts.push(`${s.minItems ?? 0}–${s.maxItems ?? "∞"} éléments`);
  }
  return bouts.join(" · ");
}

function schemas(): string {
  const bloc = (d: Descripteur) => {
    const props = d.inputSchema.properties ?? {};
    const requis = new Set(d.inputSchema.required ?? []);
    const noms = Object.keys(props);
    const idTitre = `sc-${esc(d.name)}`;
    if (noms.length === 0) {
      return `<h4 id="${idTitre}"><code>${esc(d.name)}</code></h4>
<p class="m">${bi("Aucun paramètre.", "No parameters.")}</p>`;
    }
    const ligne = (n: string, p: JsonSchema, obligatoire: boolean, sous = false) => {
      const type = p.type === "array" ? `array&lt;${p.items?.type ?? "?"}&gt;` : (p.type ?? "?");
      return `<tr>
<td>${sous ? '<span class="m">· </span>' : ""}<code>${esc(n)}</code>${obligatoire ? ` <span class="m">${bi("requis", EN.requis)}</span>` : ""}</td>
<td><code>${type}</code></td>
<td class="m">${esc(contraintes(p))}</td>
<td class="m">${esc(p.description ?? "")}</td>
</tr>`;
    };
    const lignes = noms
      .flatMap((n) => {
        const p = props[n] as JsonSchema;
        const sortie = [ligne(n, p, requis.has(n))];
        const sousProps = p.items?.properties;
        if (sousProps) {
          const sousRequis = new Set(p.items?.required ?? []);
          for (const [sn, sp] of Object.entries(sousProps)) {
            sortie.push(ligne(`${n}[].${sn}`, sp as JsonSchema, sousRequis.has(sn), true));
          }
        }
        return sortie;
      })
      .join("");
    return `<h4 id="${idTitre}"><code>${esc(d.name)}</code></h4>
<div class="tw" tabindex="0" role="region" aria-labelledby="${idTitre}"><table><thead><tr>
<th scope="col">${bi("Paramètre", EN.colParam)}</th><th scope="col">${bi("Type", EN.colType)}</th>
<th scope="col">${bi("Contraintes", EN.colContrainte)}</th><th scope="col">${bi("Description", EN.colDescription)}</th>
</tr></thead><tbody>${lignes}</tbody></table></div>`;
  };

  return `<section id="schema">
${h2("schema")}
${biP(
  [
    "Chaque outil déclare un schéma FERMÉ : toute propriété non listée est refusée. Ces tables " +
      "sont générées depuis le schéma même que le validateur applique à l'appel — elles ne " +
      "peuvent donc pas diverger de ce que le serveur accepte.",
    "La colonne Description reste en FRANÇAIS dans les deux vues, et c'est délibéré : ces " +
      "phrases sont celles que le modèle reçoit. Elles sont le texte canonique, non son " +
      "rendu. Les traduire ici ferait deux copies d'une même vérité, qui divergeraient — le " +
      "mode de panne contre lequel tout le reste de ce connecteur est bâti. Les mises en " +
      "garde ci-dessus obéissent déjà à cette règle.",
  ],
  EN.schemaTexte,
)}
${descripteurs().map(bloc).join("\n")}
</section>`;
}

function acces(): string {
  return `<section id="acces">
${h2("acces")}
${biP(
  [
    "Ce connecteur est réservé aux membres en règle du Barreau du Québec, selon le principe de " +
      "clé API CanLII personnelle fournie par chaque praticien (coffre chiffré ou en-tête " +
      "X-Clef-CanLII, vérifié avant toute lecture du cache partagé). Deux montages coexistent : " +
      "https://jurisprudence.poirierlavoie.ca/mcp/<secret> ou https://jurisprudence.poirierlavoie.ca/mcp " +
      "(par en-tête d'autorisation, refus 404 sans corps) et https://jurisprudence.poirierlavoie.ca/mcp/oauth " +
      "(OAuth 2.1 PKCE S256 via acces.poirierlavoie.ca). Demandes d'accès et gestion libre-service : " +
      "acces.poirierlavoie.ca/demande et acces.poirierlavoie.ca/moi.",
    "Aucun texte de requête ni citation cherchée n'est journalisé (journaux d'invocation Cloudflare " +
      "désactivés, zéro écriture dans search_log). La fiche publique de découverte (SEP-2127) est " +
      "publiée sans secret sur https://jurisprudence.poirierlavoie.ca/mcp/server-card ; le dépôt " +
      "inclut les manifestes pour Google Antigravity (plugin.json, mcp_config.json) et Gemini CLI " +
      "(gemini-extension.json).",
    "Le code est public sous licence CC BY-NC-SA 4.0 assortie d'une autorisation complémentaire de " +
      "pratique professionnelle du droit pour les membres en règle du Barreau du Québec (voir LICENSE), " +
      "et la suite de tests s'exécute sans clef d'API ni réseau.",
  ],
  EN.acces,
)}
<p><a href="https://acces.poirierlavoie.ca/demande">${bi("Demande d'accès (/demande)", "Apply for access (/demande)")}</a>
 · <a href="https://acces.poirierlavoie.ca/moi">/moi</a>
 · <a href="https://legislation.poirierlavoie.ca/">${bi("Connecteur « lois »", "Connector « lois »")}</a>
 · <a href="https://outils.poirierlavoie.ca/">${bi("Connecteur « outils » (public)", "Connector « outils » (public)")}</a>
 · <a href="${DEPOT_PLUGIN}">droit-civil-quebecois</a>
 · <a href="${DEPOT}">github.com/jpoirierlavoie/MCP-Jurisprudence</a>
 · <a href="mailto:jason@poirierlavoie.ca">jason@poirierlavoie.ca</a></p>
</section>`;
}

function pied(): string {
  return `<footer>
${biP(
  [
    "Jason Poirier Lavoie, avocat (Québec). Données de jurisprudence : CanLII.",
    "Aucun conseil juridique. Cet outil ne remplace ni la vérification à la source, ni le " +
      "jugement professionnel.",
  ],
  EN.pied,
)}
</footer>`;
}

function construireJsonLd(): string {
  const nomsOutils = descripteurs().map((d) => d.name);
  const graphe = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${ORIGINE_SITE}/#site`,
        url: `${ORIGINE_SITE}/`,
        name: ["MCP Jurisprudence — Vérification de citations (CanLII)", EN.titre],
        inLanguage: ["fr-CA", "en-CA"],
        isPartOf: {
          "@type": "SoftwareApplication",
          "@id": `${DEPOT_PLUGIN}#plugin`,
          name: "Droit civil québécois",
          url: DEPOT_PLUGIN,
        },
      },
      {
        "@type": "WebAPI",
        "@id": `${ORIGINE_SITE}/#api`,
        name: "MCP Jurisprudence (juris)",
        url: `${ORIGINE_SITE}/`,
        documentation: `${ORIGINE_SITE}/mcp/server-card`,
        termsOfService: "https://acces.poirierlavoie.ca/cgu",
        license: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
        isAccessibleForFree: true,
        inLanguage: ["fr-CA", "en-CA"],
        description: PUBLIC_DESCRIPTION,
        featureList: nomsOutils,
      },
    ],
  };
  return JSON.stringify(graphe).replace(/</g, "\\u003c");
}

export function renderSite(): string {
  const corps = [entete(), outils(), schemas(), acces(), pied()].join("\n");
  const titrePage = "MCP Jurisprudence — Vérification de citations (collection CanLII)";
  const descMeta =
    "Serveur MCP en lecture seule : vérification déterministe de citations de jurisprudence canadienne contre la collection de CanLII.";

  return `<!doctype html>
<html lang="fr" class="l-fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titrePage)}</title>
<meta name="description" content="${esc(descMeta)}">
<link rel="canonical" href="${ORIGINE_SITE}/">
<link rel="alternate" type="application/mcp-server-card+json" href="${ORIGINE_SITE}/mcp/server-card">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(titrePage)}">
<meta property="og:description" content="${esc(descMeta)}">
<meta property="og:url" content="${ORIGINE_SITE}/">
<meta property="og:locale" content="fr_CA">
<meta property="og:locale:alternate" content="en_CA">
<style>${compacterBloc(CSS)}</style>
<script type="application/ld+json">${construireJsonLd()}</script>
<script>${compacterBloc(BOOT)}</script>
</head>
<body>
${sautContenu()}
<div class="wrap">
${tdm()}
<main id="contenu-principal" tabindex="-1">
${corps}
</main>
</div>
${haut()}
<script>${compacterBloc(jsClient())}</script>
</body>
</html>`;
}

let memo: string | null = null;

export function pagePubliqueHtml(): string {
  if (memo === null) memo = renderSite();
  return memo;
}

// ── Découverte publique (/robots.txt, /sitemap.xml, /llms.txt) ───────────────

export const CHEMINS_DECOUVERTE_PUBLIQUE = ["/robots.txt", "/sitemap.xml", "/llms.txt"] as const;
export type CheminDecouvertePublique = (typeof CHEMINS_DECOUVERTE_PUBLIQUE)[number];

export function estCheminDecouvertePublique(
  pathname: string,
): pathname is CheminDecouvertePublique {
  return (CHEMINS_DECOUVERTE_PUBLIQUE as readonly string[]).includes(pathname);
}

const ROBOTS_TXT = [
  "User-agent: *",
  "Allow: /",
  "Disallow: /mcp",
  `Sitemap: ${ORIGINE_SITE}/sitemap.xml`,
  "",
].join("\n");

const SITEMAP_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  `  <url><loc>${ORIGINE_SITE}/</loc></url>`,
  "</urlset>",
  "",
].join("\n");

let llmsMemo: string | null = null;

function construireLlmsTxt(): string {
  const outilsLignes = descripteurs().map(
    (d) => `- \`${d.name}\` — ${d.title} / ${OUTILS_EN[d.name]?.titre ?? d.title}`,
  );
  return [
    "# MCP Jurisprudence (`juris`) — Vérification de citations (CanLII)",
    "",
    `> ${PUBLIC_DESCRIPTION}`,
    "",
    "## Tools (10 read-only MCP tools, derived from live registry)",
    "",
    ...outilsLignes,
    "",
    "## Québec Civil Law MCP Suite (`droit-civil-quebecois`)",
    "",
    "- [MCP Accès (Admission & OAuth 2.1 Portal)](https://acces.poirierlavoie.ca/): Eligibility (active Barreau du Québec members + individual BYOK CanLII key), `/demande` application, and `/moi` self-service portal.",
    "- [MCP Législation (`lois`)](https://legislation.poirierlavoie.ca/): Official statutes, regulations, court directives, and AMF texts. Server Card: https://legislation.poirierlavoie.ca/mcp/server-card",
    `- [MCP Jurisprudence (\`juris\`)](${ORIGINE_SITE}/): Case-law citation verification & CanLII metadata. Server Card: ${ORIGINE_SITE}/mcp/server-card`,
    "- [MCP Outils (`outils` — Public, no account required)](https://outils.poirierlavoie.ca/): C.C.P. deadlines, art. 1619 C.C.Q. interest, registries, courthouses, RQA addresses, and bijural terminology. Endpoint: `https://outils.poirierlavoie.ca/mcp`",
    `- [Umbrella Plugin Repository](${DEPOT_PLUGIN}) · [Connector Repository](${DEPOT})`,
    "",
  ].join("\n");
}

export function repondreDecouvertePublique(
  chemin: CheminDecouvertePublique,
  method: string,
): Response {
  if (llmsMemo === null) llmsMemo = construireLlmsTxt();
  const { corps, type } =
    chemin === "/robots.txt"
      ? { corps: ROBOTS_TXT, type: "text/plain; charset=utf-8" }
      : chemin === "/sitemap.xml"
        ? { corps: SITEMAP_XML, type: "application/xml; charset=utf-8" }
        : { corps: llmsMemo, type: "text/markdown; charset=utf-8" };

  const headers = {
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "public, max-age=600",
  };

  return method === "HEAD"
    ? new Response(null, { status: 200, headers })
    : new Response(corps, { status: 200, headers });
}
