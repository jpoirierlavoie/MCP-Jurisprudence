import type { JsonSchema } from "@poirierlavoie/mcp-socle";
import { listToolDescriptors, PUBLIC_DESCRIPTION } from "./mcp/registry";
import { EN, OUTILS_EN } from "./site.i18n";

const ORIGINE_SITE = "https://jurisprudence.poirierlavoie.ca";
const DEPOT = "https://github.com/jpoirierlavoie/MCP-Jurisprudence";
const DEPOT_PLUGIN = "https://github.com/jpoirierlavoie/droit-civil-quebecois";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bi(fr: string, en: string): string {
  return `<span data-l="fr">${esc(fr)}</span><span data-l="en" lang="en">${esc(en)}</span>`;
}

function biP(fr: readonly string[], en: readonly string[]): string {
  return (
    `<div data-l="fr">${fr.map((p) => `<p>${esc(p)}</p>`).join("")}</div>\n` +
    `<div data-l="en" lang="en">${en.map((p) => `<p>${esc(p)}</p>`).join("")}</div>`
  );
}

export const SECTIONS = [
  { id: "outils", fr: "Les 12 outils", en: "The 12 tools" },
  { id: "acces", fr: "Accès et installation", en: "Access & setup" },
  { id: "schema", fr: "Les schémas (technique)", en: "The schemas (technical)" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

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

const CLAIR =
  "color-scheme:light;--f:#0f172a;--m:#475569;--b:#cbd5e1;--bi:#64748b;--a:#1d4ed8;--bg:#f8fafc;--card:#fff;" +
  "--th:#f1f5f9;--code:#e2e8f0;--hover:#f1f5f9;--avert-bg:#eff6ff;--avert-b:#93c5fd";

const SOMBRE =
  "color-scheme:dark;--f:#e4e4e7;--m:#a1a1aa;--b:#27272b;--bi:#71717a;--a:#6ea8fe;--bg:#0c0c0e;--card:#141417;" +
  "--th:#1b1b1f;--code:#1c1c21;--hover:#1d1d22;--avert-bg:#15171c;--avert-b:#303642";

const LARGE = "78rem";
const SOLEIL = "☀︎";
const FLECHE = "↑︎";

const CSS = `
:root{${CLAIR}}
@media(prefers-color-scheme:dark){:root{${SOMBRE}}}
html.t-light{${CLAIR}}
html.t-dark{${SOMBRE}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--f);font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:1rem;line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:${LARGE};margin:0 auto;padding:2rem 1.25rem 4rem;display:grid;gap:1rem}
main{min-width:0;max-width:60rem;width:100%;justify-self:center}
section[id]{scroll-margin-top:1.5rem}
#schema{content-visibility:auto;contain-intrinsic-size:auto 40rem}
h1{font-size:clamp(1.45rem,1.2rem + 1vw,1.85rem);line-height:1.25;letter-spacing:-.02em;margin:0;text-wrap:balance}
h2{font-size:1.28rem;line-height:1.3;letter-spacing:-.015em;margin:2.75rem 0 .8rem;padding-bottom:.4rem;border-bottom:1px solid var(--b);text-wrap:balance}
h3{font-size:1.08rem;line-height:1.35;letter-spacing:-.01em;margin:1.75rem 0 .45rem;text-wrap:balance}
#schema h3,h4{font-size:.98rem;line-height:1.4;margin:1.2rem 0 .25rem}
p{margin:.6rem 0;text-wrap:pretty;overflow-wrap:break-word}
li{text-wrap:pretty;overflow-wrap:break-word}
a{color:var(--a);text-underline-offset:.18em;text-decoration-thickness:1px}
a:hover{text-decoration-thickness:2px}
code{font:.88em ui-monospace,'SF Mono','Cascadia Code',Menlo,Consolas,monospace;background:var(--code);padding:.12em .38em;border-radius:4px}
:where(a,button,summary,[tabindex]):focus-visible{outline:2px solid var(--a);outline-offset:2px}
.saut{position:fixed;left:1rem;top:1rem;z-index:20;padding:.45rem .85rem;background:var(--card);
  color:var(--a);border:2px solid var(--a);border-radius:8px;font-weight:700;text-decoration:none}
.saut:not(:focus-visible){position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;
  clip-path:inset(50%);white-space:nowrap;border:0}
.suite{display:flex;align-items:center;justify-content:space-between;gap:.5rem 1rem;flex-wrap:wrap;
  margin:0 0 1.1rem;padding:0 0 .7rem;border-bottom:1px solid var(--b);font-size:.875rem}
.suite-t{font-weight:600;color:var(--f);letter-spacing:-.01em}
.suite ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.35rem}
.suite a{display:inline-block;padding:.3rem .72rem;border:1px solid transparent;border-radius:999px;
  color:var(--m);font-weight:500;text-decoration:none;min-height:1.75rem}
.suite a:hover{color:var(--a);border-color:var(--b);background:var(--card)}
.suite a[aria-current=page]{color:var(--a);font-weight:600;border-color:var(--a);background:var(--card)}
.bar{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.btn{font:inherit;font-size:.86rem;font-weight:600;background:var(--a);color:var(--bg);
  border:1px solid var(--a);border-radius:8px;padding:.4rem 1rem;text-decoration:none;white-space:nowrap;display:inline-block}
.btn:hover{opacity:.92}
.btn-sec,#bascule,#theme{font:inherit;font-size:.82rem;font-weight:500;letter-spacing:.01em;background:var(--card);border:1px solid var(--bi);
  border-radius:999px;padding:.35rem .9rem;cursor:pointer;color:var(--f);text-decoration:none;white-space:nowrap;display:inline-block}
.btn-sec:hover,#bascule:hover,#theme:hover{border-color:var(--a);color:var(--a)}
.btns{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
#theme{min-width:6.5rem;text-align:center}
#theme [data-t]{display:none}
html:not(.t-light):not(.t-dark) #theme [data-t=auto],
html.t-light #theme [data-t=light],
html.t-dark #theme [data-t=dark]{display:inline}
.badge{display:inline-block;font-size:.78rem;font-weight:500;padding:.2rem .65rem;border-radius:999px;
  border:1px solid var(--avert-b);background:var(--avert-bg);color:var(--f)}
.m{color:var(--m);font-size:.875rem}
.tw{overflow-x:auto;border:1px solid var(--b);border-radius:8px;background:var(--card)}
table{border-collapse:collapse;width:100%;font-size:.875rem}
th,td{padding:.55rem .75rem;text-align:left;border-bottom:1px solid var(--b);vertical-align:top}
th{background:var(--th);position:sticky;top:0;font-weight:600;text-wrap:balance}
td.n,th.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
tbody tr:hover{background:var(--hover)}
pre{background:var(--code);border:1px solid var(--b);border-radius:8px;padding:.75rem .95rem;
  overflow-x:auto;font:.84rem/1.5 ui-monospace,'SF Mono','Cascadia Code',Menlo,Consolas,monospace}
.tdm{max-width:60rem;width:100%;justify-self:center}
.tdm ul{list-style:none;margin:.5rem 0 0;padding:0;font-size:.85rem}
.tdm li{margin:.15rem 0}
.tdm a{display:block;padding:.28rem .65rem;border-left:2px solid var(--b);
  color:var(--m);text-decoration:none}
.tdm a:hover,.tdm a.on{color:var(--a);border-left-color:var(--a)}
.tdm a.on{font-weight:600}
details{border:1px solid var(--b);border-radius:8px;background:var(--card);margin:.5rem 0;padding:.65rem .95rem}
summary{cursor:pointer;font-weight:600}
#outils article{border-left:3px solid var(--b);padding-left:1rem;margin:1.5rem 0}
#outils .titre{color:var(--m);font-style:italic;margin:.1rem 0 .5rem}
.avert{background:var(--avert-bg);border:1px solid var(--avert-b);border-radius:8px;padding:.35rem 1.25rem 1rem}
footer{margin-top:3.5rem;padding-top:1.25rem;border-top:1px solid var(--b);font-size:.875rem;color:var(--m)}
.sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;
  clip-path:inset(50%);white-space:nowrap;border:0}
.haut{position:fixed;right:1.25rem;bottom:1.25rem;z-index:10;width:2.6rem;height:2.6rem;
  display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:1.1rem;
  background:var(--card);color:var(--f);border:1px solid var(--bi);border-radius:999px}
.haut:hover{color:var(--a);border-color:var(--a)}
html.js .haut{opacity:0;visibility:hidden}
html.js .haut.on{opacity:1;visibility:visible}
@media(prefers-reduced-motion:no-preference){
  html{scroll-behavior:smooth}
  .haut{transition:opacity .2s,visibility .2s,color .2s,border-color .2s}
}
@media(forced-colors:active){
  .suite a[aria-current=page],.tdm a.on,.btn{outline:2px solid Highlight}
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

const BOOT = `
try{
  var r=document.documentElement, c=[];
  var p=localStorage.getItem('jurisLang')||(navigator.language||'fr').slice(0,2);
  c.push(p==='en'?'l-en':'l-fr'); r.lang=(p==='en'?'en':'fr');
  var t=localStorage.getItem('jurisTheme');
  if(t==='light'||t==='dark') c.push('t-'+t);
  r.className=c.join(' ');
  var ti=document.querySelector&&document.querySelector('title[data-en]');
  if(ti&&p==='en') document.title=ti.getAttribute('data-en');
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
    var ti=d.querySelector('title[data-en]');
    if(ti) d.title=ti.getAttribute(nv==='en'?'data-en':'data-fr')||d.title;
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
    "Connecteur gratuit permettant à votre assistant IA (Claude, ChatGPT, Gemini, Antigravity) de vérifier vos références de jurisprudence dans CanLII, d'obtenir la fiche officielle d'une décision et de consulter les listes d'autorités dispensées de reproduction — au lieu d'inventer des arrêts.",
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
<span class="badge">${bi("Membres du Barreau du Québec · Votre clé CanLII requise", "Barreau du Québec members · Your CanLII key required")}</span>
<a class="btn" href="https://acces.poirierlavoie.ca/demande">${bi("Demander l'accès →", "Apply for access →")}</a>
<a class="btn-sec" href="https://acces.poirierlavoie.ca/">${bi("Portail d'accès", "Access portal")}</a>
</p>
</header>`;
}

export const RESUME_OUTILS_FR: Readonly<Record<string, readonly string[]>> = {
  verify_citations: [
    "Vérifie si une ou plusieurs citations existent dans CanLII et concordent avec les noms des parties et l'année attendus — idéal pour contrôler les références d'un projet d'acte, d'une note ou d'une réponse d'IA.",
    "Rend un verdict clair (CONFIRMÉE, DISCORDANTE, INTROUVABLE, NON CONSTRUCTIBLE, ILLISIBLE ou INDÉTERMINÉE si CanLII est injoignable) et le lien direct canlii.ca. La confirmation prouve l'existence de la décision ; il faut toujours en lire le texte intégral et vérifier son sort ultérieur.",
  ],
  find_case: [
    "Retrouve une décision à partir des noms des parties (avec tribunal et années en option) lorsqu'on ne dispose que d'une référence de recueil (R.C.S., R.J.Q., C.A.), d'un identifiant d'éditeur (J.E., EYB, AZ) ou des noms des parties.",
    "Cherche uniquement dans les intitulés et mots-clés : l'API de CanLII ne permet pas de chercher dans le texte intégral des jugements.",
  ],
  get_case: [
    "Obtient la fiche officielle d'une décision sur CanLII : intitulé, citation neutre, date, numéro de dossier, mots-clés et hyperlien canlii.ca pour lire le jugement.",
    "Ne renvoie pas le texte de la décision et ne vérifie pas si une citation correspond à l'intitulé attendu (pour cela, votre assistant emploie verify_citations).",
  ],
  citator: [
    "Affiche les décisions citées par un jugement, celles qui le citent et les lois qu'il mentionne, selon l'index de CanLII.",
    "Listes brutes seulement : n'indique pas si une décision a été suivie, distinguée ou écartée. Pour lire les lois québécoises citées, l'assistant passe par le connecteur « lois ».",
  ],
  subsequent_history: [
    "Signale les décisions de tribunaux supérieurs présentes dans CanLII qui citent le jugement de départ sous un intitulé semblable — un premier indice utile pour repérer un appel éventuel.",
    "Simple indice approximatif : ne remplace pas un citateur professionnel et ne détecte ni les appels pendants, ni les permissions refusées, ni les désistements.",
  ],
  browse_cases: [
    "Parcourt les décisions récentes d'un tribunal dans CanLII, filtrables par date de décision ou de publication — pratique pour la veille ou pour vérifier l'étendue de la collection.",
  ],
  list_databases: [
    "Répertorie les tribunaux et recueils législatifs disponibles sur CanLII avec leurs identifiants, afin que l'assistant cible la bonne base.",
  ],
  browse_legislation: [
    "Liste les lois et règlements d'une base législative de CanLII (utile notamment pour consulter les titres des lois fédérales ou d'autres provinces).",
  ],
  get_legislation: [
    "Affiche la fiche CanLII d'une loi ou d'un règlement (titre, mention d'abrogation et dates de la copie hébergée par CanLII, qui ne datent pas l'entrée en vigueur d'origine). Pour lire le texte officiel des lois du Québec et des principales lois fédérales, votre assistant utilise « lois ».",
  ],
  parse_citation: [
    "Analyse hors ligne la forme d'une citation (citation neutre, recueil ou identifiant d'éditeur) sans consommer votre quota CanLII. Vérifie uniquement le format, jamais l'existence réelle du jugement.",
  ],
  list_exempt_cases: [
    "Consulte et recherche hors ligne les 27 listes compilées d'autorités dispensées de reproduction devant 9 tribunaux canadiens et québécois (QCCA, QCCS, QCCQ, TAT, TDP, TP, TMF, CF et COMC), enrichies des métadonnées et mots-clés compilés depuis CanLII.",
    "Fonctionne strictement hors ligne sans consommer votre quota CanLII ; n'établit ni l'autorité actuelle des décisions ni le contenu de leur dispositif.",
  ],
  check_exempt_cases: [
    "Vérifie un lot d'au plus 50 citations contre les listes d'autorités dispensées d'un tribunal ou d'une sous-liste précise, en rendant l'un des cinq verdicts : DISPENSÉE, À VÉRIFIER, NON LISTÉE, ILLISIBLE ou INDÉTERMINÉE (qui ne vaut jamais ni absence de la liste ni dispense).",
    "L'appariement hors ligne s'exécute en premier ; un repli vers CanLII n'intervient que si resolve_canlii est activé pour résoudre une citation parallèle ou une entrée non indexée. Pour éprouver l'existence générale d'une citation hors liste, votre assistant utilise verify_citations.",
  ],
};

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
      ? "interroge CanLII (ou le cache local déjà constitué)."
      : "aucun appel externe : analyse locale hors ligne, sans utiliser le quota CanLII.",
    ouvert
      ? "queries CanLII (or the local cache)."
      : "no outbound call: offline local check, using no CanLII quota.",
  )}</p>`;
}

function outils(): string {
  const carte = (d: Descripteur) => {
    const en = OUTILS_EN[d.name];
    const resumeFr = RESUME_OUTILS_FR[d.name] ?? [d.description];
    const resumeEn = en?.resume ?? [en?.texte ?? d.description];
    return `<article>
<h4><code>${esc(d.name)}</code></h4>
<p class="titre">${bi(d.title, en?.titre ?? d.title)}</p>
${biP(resumeFr, resumeEn)}
<details>
<summary>${bi("Instruction exacte transmise à l'assistant IA", "Exact prompt sent to the AI assistant")}</summary>
${biP([d.description], [en?.texte ?? d.description])}
${marqueurAppel(d)}
</details>
</article>`;
  };

  const tous = descripteurs();

  return `<section id="outils">
${h2("outils")}
<h3>${bi("Adossés à CanLII", EN.familleCanlii)}</h3>
${biP(
  [
    "Vous n'avez jamais à lancer ces fonctions vous-même : votre assistant IA les appelle automatiquement en arrière-plan pour vérifier les arrêts, consulter les listes d'autorités dispensées ou retrouver une décision.",
    "Dix outils peuvent interroger l'API de CanLII (sur le quota de votre clé personnelle) ; " +
      "parse_citation et list_exempt_cases fonctionnent entièrement hors ligne sans " +
      "consommer votre quota CanLII (check_exempt_cases permet aussi un mode strictement " +
      "hors ligne avec resolve_canlii=false). " +
      "Les outils hors ligne pour les numéros de dossier de cour et les palais de justice du " +
      "Québec (greffe_*, palais_*) relèvent du connecteur public sans authentification " +
      "« outils ».",
  ],
  EN.familleCanliiTexte,
)}
${tous.map(carte).join("\n")}
</section>`;
}

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
    return `<h3 id="${idTitre}"><code>${esc(d.name)}</code></h3>
<div class="tw" tabindex="0" role="region" aria-labelledby="${idTitre}"><table><thead><tr>
<th scope="col">${bi("Paramètre", EN.colParam)}</th><th scope="col">${bi("Type", EN.colType)}</th>
<th scope="col">${bi("Contraintes", EN.colContrainte)}</th><th scope="col">${bi("Description", EN.colDescription)}</th>
</tr></thead><tbody>${lignes}</tbody></table></div>`;
  };

  return `<section id="schema">
${h2("schema")}
${biP(
  [
    "Référence technique pour les développeurs et scripts : chaque outil n'accepte que les paramètres listés ci-dessous, générés directement à partir des règles de validation du serveur.",
    "La colonne Description reste en français dans les deux vues, car ces phrases sont le texte " +
      "exact reçu par l'assistant.",
  ],
  EN.schemaTexte,
)}
<details>
<summary>${bi("Afficher les tables de paramètres des 12 outils (référence technique)", EN.schemaResume)}</summary>
${descripteurs().map(bloc).join("\n")}
</details>
</section>`;
}

function acces(): string {
  return `<section id="acces">
${h2("acces")}
${biP(
  [
    "Accès gratuit réservé aux membres actifs en règle du Barreau du Québec.",
    "1. Déposez une demande une seule fois sur https://acces.poirierlavoie.ca/demande avec votre numéro du Barreau et votre propre clé API CanLII (elle est conservée chiffrée sur le portail et utilise votre propre quota CanLII).",
    "2. Installez le greffon droit-civil-quebecois dans Claude, ChatGPT, Gemini ou Antigravity — ou ajoutez https://jurisprudence.poirierlavoie.ca/mcp/oauth dans les réglages de connecteurs — puis cliquez sur « Connecter » pour autoriser l'accès dans votre navigateur (aucune clé technique à copier).",
    "Vos citations et requêtes ne sont jamais journalisées. Gérez votre clé CanLII ou votre compte à tout moment sur https://acces.poirierlavoie.ca/moi.",
  ],
  EN.acces,
)}
<details>
<summary>${bi("Détails techniques (scripts, ligne de commande et découverte MCP)", EN.accesTechniqueTitre)}</summary>
${biP(
  [
    "Connexion OAuth 2.1 par navigateur : https://jurisprudence.poirierlavoie.ca/mcp/oauth. Un accès direct par jeton individuel (https://jurisprudence.poirierlavoie.ca/mcp ou https://jurisprudence.poirierlavoie.ca/mcp/<secret>, avec en-tête optionnel X-Clef-CanLII) demeure disponible pour les scripts, la ligne de commande et l'API Gemini Deep Research.",
    "La fiche publique de découverte MCP sans secret est publiée sur https://jurisprudence.poirierlavoie.ca/mcp/server-card ; le dépôt inclut aussi les manifestes autonomes pour Google Antigravity et Gemini CLI.",
    "Le code est libre et gratuit sous licence Apache-2.0 (voir LICENSE), avec un fichier NOTICE reconnaissant les conditions d'utilisation de CanLII sans aucune revendication sur ses données ni décisions.",
  ],
  EN.accesTechnique,
)}
</details>
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
        license: "https://www.apache.org/licenses/LICENSE-2.0",
        isAccessibleForFree: true,
        inLanguage: ["fr-CA", "en-CA"],
        description: PUBLIC_DESCRIPTION,
        featureList: nomsOutils,
      },
    ],
  };
  return JSON.stringify(graphe).replace(/</g, "\\u003c");
}

function renderSite(): string {
  const corps = [entete(), outils(), acces(), schemas(), pied()].join("\n");
  const titrePage = "MCP Jurisprudence — Vérification de citations (CanLII)";
  const descMeta =
    "Serveur MCP en lecture seule : vérification déterministe de citations de jurisprudence canadienne (CanLII) et 27 listes d'autorités dispensées.";

  return `<!doctype html>
<html lang="fr" class="l-fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title data-fr="${esc(titrePage)}" data-en="${esc(EN.titre)}">${esc(titrePage)}</title>
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

const CHEMINS_DECOUVERTE_PUBLIQUE = ["/robots.txt", "/sitemap.xml", "/llms.txt"] as const;
type CheminDecouvertePublique = (typeof CHEMINS_DECOUVERTE_PUBLIQUE)[number];

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
    "## Tools (12 read-only MCP tools, derived from live registry)",
    "",
    ...outilsLignes,
    "",
    "## Québec Civil Law MCP Suite (`droit-civil-quebecois`)",
    "",
    "- [MCP Accès (Admission & OAuth 2.1 Portal)](https://acces.poirierlavoie.ca/): Eligibility (active Barreau du Québec members + individual BYOK CanLII key), `/demande` application, and `/moi` self-service portal.",
    "- [MCP Législation (`lois`)](https://legislation.poirierlavoie.ca/): Official statutes, regulations, court directives, and AMF texts. Server Card: https://legislation.poirierlavoie.ca/mcp/server-card",
    `- [MCP Jurisprudence (\`juris\`)](${ORIGINE_SITE}/): Case-law citation verification, CanLII metadata, and 27 exempt-authorities lists across 9 courts/tribunals (12 tools). Server Card: ${ORIGINE_SITE}/mcp/server-card`,
    "- [MCP Outils (`outils` — Public, no account required)](https://outils.poirierlavoie.ca/): 15 tools across 6 families — C.C.P. deadlines, art. 1619 C.C.Q. interest, registries & GLEIF snapshots, courthouses, RQA addresses, bijural terminology, Bank of Canada rates, StatCan CPI, and TAL/CMHC rents. Endpoint: `https://outils.poirierlavoie.ca/mcp`",
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
