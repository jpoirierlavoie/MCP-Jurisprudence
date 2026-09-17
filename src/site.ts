/**
 * Page publique du connecteur (§18) — `GET /`.
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
 * TOUT LE CONTENU DÉRIVE DES DONNÉES VIVES : les outils viennent du registre, les
 * schémas du même `inputSchema` que le validateur applique, les issues d'analyse du
 * VRAI parseur exécuté au rendu, les palais des tables de `src/qc/`. Une page qui
 * recopierait ces valeurs deviendrait fausse sans que rien n'échoue — c'est le mode
 * de panne que ce dépôt combat partout ailleurs.
 *
 * Aucune dépendance, aucune requête tierce : ni police distante, ni CDN, ni image.
 * Sans JavaScript, le FRANÇAIS s'affiche et tout le contenu reste lisible.
 */

import { GARDE_DOSSIER, GARDE_PALAIS, GARDE_SANS_ADRESSE } from "./format/render";
import { listToolDescriptors } from "./mcp/registry";
import type { JsonSchema } from "./mcp/validate";
import { analyserNumeroDossier } from "./qc/dossier";
import { GREFFES } from "./qc/greffes";
import { JURIDICTIONS, LIBELLE_TYPE_GREFFE } from "./qc/juridictions";
import { MJQ_MAJ } from "./qc/lieux";
import { adresseDuGreffe, listerDistricts, localitesItinerantes, siegeFixe } from "./qc/lookup";
import { RELEVE_LE } from "./qc/palais";
import { EN, OUTILS_EN } from "./site.i18n";

/** Échappement HTML. Appliqué à TOUTE valeur interpolée, sans exception. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Bloc bilingue : les DEUX langues sont émises, une règle CSS n'en montre qu'une.
 *
 * Ni deux routes, ni un paramètre, ni une négociation `Accept-Language` : le choix
 * est fait dans le navigateur, avant le premier rendu, et sans requête.
 */
export function bi(fr: string, en: string): string {
  return `<span data-l="fr">${esc(fr)}</span><span data-l="en">${esc(en)}</span>`;
}

/** Suite de paragraphes bilingues. */
export function biP(fr: readonly string[], en: readonly string[]): string {
  return (
    `<div data-l="fr">${fr.map((p) => `<p>${esc(p)}</p>`).join("")}</div>` +
    `<div data-l="en">${en.map((p) => `<p>${esc(p)}</p>`).join("")}</div>`
  );
}

/**
 * Les sections, en UN SEUL endroit : le sommaire et les `<h2>` en découlent tous
 * deux. Deux listes divergeraient — un sommaire qui renvoie à une ancre disparue est
 * un défaut silencieux.
 */
export const SECTIONS = [
  { id: "outils", fr: "Les outils", en: "The tools" },
  { id: "schema", fr: "Les schémas", en: "The schemas" },
  { id: "dossier", fr: "Numéro de dossier", en: "Court file numbers" },
  { id: "greffes", fr: "Greffes et palais", en: "Registries and courthouses" },
  { id: "acces", fr: "Accès", en: "Access" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

const TITRE_SECTION = new Map<SectionId, { fr: string; en: string }>(
  SECTIONS.map((s) => [s.id, { fr: s.fr, en: s.en }]),
);

function h2(id: SectionId): string {
  const t = TITRE_SECTION.get(id)!;
  return `<h2 id="${id}">${bi(t.fr, t.en)}</h2>`;
}

// ── Thème ─────────────────────────────────────────────────────────────────────
//
// Deux jeux de variables, et RIEN d'autre : aucune couleur en dur ailleurs dans le
// CSS. Une `rgba(0,0,0,.25)` d'ombre, par exemple, ne bascule pas et devient
// invisible en sombre. Un test balaie le CSS et échoue s'il en trouve une.
//
// Les deux jeux doivent déclarer EXACTEMENT les mêmes variables — un test le vérifie
// aussi, faute de quoi le mode sombre hériterait en silence d'une valeur claire.

// ⚠ IDENTIQUES À CELLES DU CONNECTEUR JUMEAU « Législation du Québec ». Les deux
//   sites appartiennent au même praticien, portent le même genre de réserve et se
//   consultent l'un après l'autre : une divergence de teinte ou de police les ferait
//   passer pour deux outils sans rapport. Toute retouche ici doit être portée là-bas,
//   et réciproquement.
const CLAIR =
  "--f:#111;--m:#666;--b:#e2e0da;--a:#7a2e1d;--bg:#fdfcfa;--card:#fff;" +
  "--th:#f7f5f1;--code:#f2efe9;--hover:#faf8f4;--avert-bg:#fbf7f1;--avert-b:#e6d9c6";

const SOMBRE =
  "--f:#e8e6e1;--m:#a09a90;--b:#3a372f;--a:#e08b6a;--bg:#16150f;--card:#1e1c16;" +
  "--th:#252219;--code:#252219;--hover:#242118;--avert-bg:#211d15;--avert-b:#3d3527";

// Point de rupture de la barre latérale : 13rem + 2.5rem de gouttière + 60rem de
// colonne de texte + 2.5rem de marge intérieure = 78rem. En deçà, une seule colonne.
const LARGE = "78rem";

// U+FE0E force la présentation TEXTE : sans lui, ☀ et ↑ basculent en émoji couleur sur
// plusieurs plateformes et détonnent au milieu d'une page en serif. ◐ et ☾ n'ont pas de
// variante émoji.
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
h1{font-size:1.6rem;margin:0}
h2{font-size:1.35rem;margin:2.75rem 0 .75rem;padding-bottom:.3rem;border-bottom:2px solid var(--b)}
h3{font-size:1.1rem;margin:1.75rem 0 .5rem}
h4{font-size:1rem;margin:1.25rem 0 .25rem}
p{margin:.6rem 0}
a{color:var(--a)}
code{font:.9em ui-monospace,Menlo,Consolas,monospace;background:var(--code);padding:.1em .35em;border-radius:3px}

/* En-tête : le titre à gauche, les deux bascules à DROITE. */
.bar{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.btns{display:flex;gap:.5rem;flex-wrap:wrap}
#bascule,#theme{font:inherit;font-size:.8rem;letter-spacing:.05em;background:none;border:1px solid var(--b);
  border-radius:999px;padding:.35rem .9rem;cursor:pointer;color:var(--m);white-space:nowrap}
#bascule:hover,#theme:hover{border-color:var(--a);color:var(--a)}
/* Largeur figée : les trois libellés n'ont pas la même longueur, le bouton sauterait à chaque clic. */
#theme{min-width:6.5rem;text-align:center}
#theme [data-t]{display:none}
html:not(.t-light):not(.t-dark) #theme [data-t=auto],
html.t-light #theme [data-t=light],
html.t-dark #theme [data-t=dark]{display:inline}

.ctl{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin:1rem 0}
.ctl input,.ctl select{font:inherit;font-size:.9rem;padding:.4rem .6rem;border:1px solid var(--b);
  border-radius:4px;background:var(--card);color:var(--f)}
.ctl input{flex:1;min-width:10rem}
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

/* Libellé réservé aux lecteurs d'écran : retiré de l'affichage sans display:none, qui le
   retirerait AUSSI de l'arbre d'accessibilité — la pastille redeviendrait un lien anonyme. */
.sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;
  clip-path:inset(50%);white-space:nowrap;border:0}
.haut{position:fixed;right:1.25rem;bottom:1.25rem;z-index:10;width:2.6rem;height:2.6rem;
  display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:1.1rem;
  background:var(--card);color:var(--m);border:1px solid var(--b);border-radius:999px}
.haut:hover{color:var(--a);border-color:var(--a)}
/* Sans JavaScript la classe js n'est jamais posée : la pastille reste simplement visible.
   Le masquage et le code qui démasque vivent dans le MÊME script (voir JS). */
html.js .haut{opacity:0;visibility:hidden}
html.js .haut.on{opacity:1;visibility:visible}
@media(prefers-reduced-motion:no-preference){
  html{scroll-behavior:smooth}
  .haut{transition:opacity .2s,visibility .2s,color .2s,border-color .2s}
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

/**
 * Script de tête, SYNCHRONE : il applique langue et thème AVANT le premier rendu.
 * Sans lui, la page clignoterait du français au anglais, ou du clair au sombre.
 *
 * ⚠ Il COMPOSE les deux classes en un seul tableau. Écrire `className` en bloc dans
 *   l'un des deux gestionnaires effacerait l'autre classe EN SILENCE — le connecteur
 *   jumeau s'y est fait prendre. Les gestionnaires n'emploient donc que `classList`.
 */
// La balise String.raw est une PARADE, pas un ornement. Ce bloc-ci n'a pas
// d'échappement AUJOURD'HUI — d'où l'avertissement de Biome — mais le jour où
// quelqu'un y écrit une classe de caractères ou un « \d », un littéral non balisé
// mangerait l'antislash EN SILENCE et le script cesserait de faire ce qu'il dit.
// La retirer parce qu'elle « ne sert pas encore » rouvrirait exactement ce défaut.
// biome-ignore lint/complexity/noUselessStringRaw: parade délibérée, voir ci-dessus
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

/**
 * JS client, en fin de corps.
 *
 * ⚠ PIÈGE D'ÉCRITURE : dans un littéral de gabarit NON balisé, `\d` devient `d` en
 *   silence. Ce bloc est donc écrit en `String.raw` — et ne doit contenir NI backtick
 *   NI `${`, puisque `String.raw` interpole quand même. Le point de rupture voyage
 *   donc comme un jeton textuel, substitué par `jsClient()` sous garde.
 */
const JS = String.raw`
(function(){
  var d=document, h=d.documentElement;

  var b=d.getElementById('bascule');
  if(b) b.addEventListener('click',function(){
    var nv=h.classList.contains('l-en')?'fr':'en';
    h.classList.toggle('l-fr',nv==='fr'); h.classList.toggle('l-en',nv==='en');
    h.lang=nv;
    try{localStorage.setItem('jurisLang',nv);}catch(e){}
  });

  // Trois etats en cycle : auto -> clair -> sombre -> auto. « auto » n'est pas une
  // classe mais l'ABSENCE des deux autres, pour que la media query reprenne la main.
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

  // Table des matieres. Le balisage porte deja open : c'est ICI seulement qu'elle se
  // replie sous le point de rupture. La ligne courante se marque par observation.
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

  // Pastille de retour en haut. La classe 'js' est posee ICI et pas dans BOOT : c'est
  // elle qui AUTORISE le masquage, et si ce script ne s'executait jamais (throw en
  // amont), une classe posee dans BOOT masquerait la pastille pour toujours, sans
  // erreur visible.
  //
  // if(ht){...} et JAMAIS if(!ht) return; — un return sortirait de toute l'IIFE et
  // emporterait le filtre et le compteur du tableau.
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

  var q=d.getElementById('q'), sel=d.getElementById('dist'), tb2=d.getElementById('tgreffes');
  if(q&&sel&&tb2){
    var corps=tb2.tBodies[0], rangs=[].slice.call(corps.rows);
    var cpt=d.getElementById('compte');
    // Pliage des diacritiques : "quebec" doit trouver "Quebec".
    //
    // Ce bloc est en String.raw et reste donc en ASCII PUR, commentaires compris :
    // une lettre accentuee y survivrait, mais l'echappement d'une classe de
    // caracteres, lui, ne survit pas a une relecture distraite. La classe des
    // marques combinantes est ecrite en echappement (u0300 a u036f) : String.raw la
    // laisse passer telle quelle, et c'est le moteur d'expression reguliere du
    // NAVIGATEUR qui l'interprete. Ecrire les caracteres combinants en clair
    // marcherait aussi, mais ils sont invisibles a l'oeil et invisibles en revue.
    var plier=function(s){
      return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    };
    var filtrer=function(){
      var t=plier(q.value.trim()), dd=sel.value, n=0;
      for(var i=0;i<rangs.length;i++){
        var r=rangs[i];
        var okd=(dd===''||r.getAttribute('data-d')===dd);
        var okt=(t===''||plier(r.textContent).indexOf(t)>=0);
        var vu=okd&&okt;
        r.style.display=vu?'':'none';
        if(vu) n++;
      }
      if(cpt) cpt.textContent=n+' / '+rangs.length;
    };
    q.addEventListener('input',filtrer);
    sel.addEventListener('change',filtrer);
    filtrer();
  }
})();
`;

/**
 * Substitue le point de rupture, sous garde : si le jeton disparaissait d'une
 * réécriture, on préfère un échec bruyant à un CSS muet.
 */
function jsClient(): string {
  if (!JS.includes("plier")) throw new Error("JS client tronqué : « plier » absent");
  // Le point de rupture ne peut pas être interpolé : `String.raw` interpole `${…}`
  // malgré la balise, ce qui rouvrirait le piège d'échappement. Il voyage donc comme
  // un JETON textuel, substitué ici — sous garde, pour qu'une réécriture qui le
  // perdrait échoue bruyamment plutôt que de laisser un `matchMedia` inopérant.
  if (!JS.includes("LARGEUR")) throw new Error("jeton LARGEUR absent du JS client");
  return JS.replace("LARGEUR", LARGE);
}

// ── Assemblage ────────────────────────────────────────────────────────────────

/**
 * Table des matières — un `<details>` : déplié en barre latérale COLLANTE au-delà du
 * point de rupture, repliable en « Sommaire » en deçà. L'attribut `open` est dans le
 * balisage pour que le rendu SANS JavaScript reste utilisable ; seul le script la
 * replie sur écran étroit.
 */
function tdm(): string {
  const items = SECTIONS.map((s) => `<li><a href="#${s.id}">${bi(s.fr, s.en)}</a></li>`).join("");
  return `<details class="tdm" open>
<summary>${bi("Sommaire", "Contents")}</summary>
<nav><ul>${items}</ul></nav>
</details>`;
}

/**
 * Pastille de retour en haut, dernier enfant de `<body>`.
 *
 * `href="#top"` est le repli SPÉCIFIÉ par HTML : sans élément portant cet id, le
 * fragment « top » désigne le haut du document. Le lien fonctionne donc sans une seule
 * ligne de JavaScript — celui-ci ne fait que le masquer tant qu'on n'a pas défilé.
 *
 * La flèche est `aria-hidden` et le nom accessible vient du libellé `.sr` : pour un
 * `<a>`, le CONTENU prime sur `title` dans le calcul du nom, donc une flèche seule
 * donnerait un lien non étiqueté.
 */
function haut(): string {
  return (
    `<a href="#top" class="haut"><span aria-hidden="true">${FLECHE}</span>` +
    `<span class="sr">${bi("Haut de page", "Back to top")}</span></a>`
  );
}

/**
 * Un état du bouton de thème. L'état est porté par `data-t` sur un span EXTÉRIEUR, la
 * langue par `data-l` sur les spans intérieurs : deux dimensions, deux éléments, donc
 * aucune collision de spécificité avec la règle de masquage bilingue.
 */
function etat(t: string, fr: string, en: string): string {
  return `<span data-t="${t}">${bi(fr, en)}</span>`;
}

function entete(): string {
  return `<header>
<div class="bar">
<h1>${bi("MCP Jurisprudence", EN.titre)}</h1>
<div class="btns">
<button id="theme" type="button" title="Thème / Theme">${etat("auto", "◐ Auto", "◐ Auto")}${etat("light", `${SOLEIL} Clair`, `${SOLEIL} Light`)}${etat("dark", "☾ Sombre", "☾ Dark")}</button>
<button id="bascule" type="button" title="Français / English">FR&nbsp;·&nbsp;EN</button>
</div>
</div>
${biP(
  [
    "Serveur MCP en lecture seule. Il éprouve des citations de jurisprudence contre la " +
      "collection de CanLII, et lit la nomenclature judiciaire québécoise — numéros de " +
      "dossier, greffes, palais de justice.",
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
</header>`;
}

// ── Les outils, dérivés du REGISTRE ───────────────────────────────────────────
//
// `listToolDescriptors()` est la même fonction que sert `tools/list`. La page ne peut
// donc pas prendre de retard sur le registre : il n'y a pas de seconde copie.

interface Descripteur {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  /**
   * ⚠ Ce champ était ABSENT de l'interface, et le `as unknown as` le jetait en
   *   silence. La page affirmait pourtant « ses annotations MCP le déclarent » — une
   *   prose RECOPIÉE, qui serait restée vraie d'apparence si l'on basculait un outil
   *   de DISTANT à LOCAL sans qu'un octet de la page ne change. C'est exactement ce
   *   que l'invariant 19 interdit : la page DÉRIVE, elle ne recopie pas. 2026-09-16.
   */
  annotations?: { readOnlyHint?: boolean; openWorldHint?: boolean };
}

function descripteurs(): Descripteur[] {
  return listToolDescriptors() as unknown as Descripteur[];
}

/**
 * Le marqueur d'appel sortant, DÉRIVÉ de `openWorldHint`.
 *
 * ⚠ Formulation load-bearing. `openWorldHint: true` dit que la SOURCE DE VÉRITÉ est
 *   distante — PAS qu'un appel part à chaque invocation. `jurisprudence_get_case` sert
 *   sa fiche depuis D1 sans aucun appel dès qu'une ligne fraîche existe, et
 *   `jurisprudence_list_databases` ne rafraîchit qu'au bout de sept jours. Écrire
 *   « Appel sortant à CanLII » serait donc faux dans le cas le plus courant, et faux
 *   avec l'aplomb d'une valeur dérivée. On annonce la SOURCE, pas le trafic.
 */
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

function estLocal(nom: string): boolean {
  return nom.startsWith("greffe_") || nom.startsWith("palais_");
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
  const canlii = tous.filter((d) => !estLocal(d.name));
  const locaux = tous.filter((d) => estLocal(d.name));

  return `<section id="outils">
${h2("outils")}
<h3>${bi("Adossés à CanLII", EN.familleCanlii)}</h3>
${biP(
  [
    "Dix outils dont la réponse vient de la collection de CanLII — la couverture et les " +
      "verdicts en dépendent. NEUF font un appel sortant et sont soumis au quota de l'API ; " +
      "jurisprudence_parse_citation, lui, n'appelle rien : il dit seulement quels identifiants " +
      "une citation permettrait de construire. Ses annotations MCP le déclarent.",
  ],
  EN.familleCanliiTexte,
)}
${canlii.map(carte).join("\n")}
<h3>${bi("Tables locales du Québec — aucun appel, jamais", EN.familleQc)}</h3>
${biP(
  [
    "Trois outils qui lisent des tables de référence compilées dans le Worker, relevées auprès " +
      "du ministère de la Justice du Québec. Ils ne font aucune requête sortante et n'écrivent rien.",
    "La source est nommée dans la description de chaque outil, et non plus par son préfixe : " +
      "un préfixe ne sait pas porter une réserve, il n'en donne que l'illusion. Le préfixe, lui, " +
      "partitionne toujours les deux familles — ranger une adresse de palais du côté de CanLII " +
      "attribuerait au tiers une donnée dont il n'est pas la source. La scission est vérifiée " +
      "par des tests, dans les deux langues, et non seulement documentée.",
  ],
  EN.familleQcTexte,
)}
${locaux.map(carte).join("\n")}
</section>`;
}

// ── Les schémas, dérivés du MÊME objet que le validateur applique ─────────────

/** Rend les contraintes d'un schéma en une phrase compacte. */
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
    if (noms.length === 0) {
      return `<h4><code>${esc(d.name)}</code></h4>
<p class="m">${bi("Aucun paramètre.", "No parameters.")}</p>`;
    }
    // Une ligne par paramètre — et, pour un tableau d'objets, une ligne par PROPRIÉTÉ
    // de ses éléments. Sans ce dépliage, `citations` se rendait « array<object> » et
    // les trois entrées de l'outil PIVOT (citation, expected_title, expected_year)
    // n'apparaissaient nulle part : le plus important des treize était celui que la
    // page documentait le moins. 2026-09-16.
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
    return `<h4><code>${esc(d.name)}</code></h4>
<div class="tw"><table><thead><tr>
<th>${bi("Paramètre", EN.colParam)}</th><th>${bi("Type", EN.colType)}</th>
<th>${bi("Contraintes", EN.colContrainte)}</th><th>${bi("Description", EN.colDescription)}</th>
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

// ── Numéro de dossier : les issues, PRODUITES PAR LE VRAI PARSEUR ─────────────

const EXEMPLES = [
  "500-05-123456-241",
  "TAL-594531",
  "C.F.-T-1234-26",
  "XYZ-9999",
  "999-99-123456",
  "500 - 05 - 123456",
] as const;

/** Résume en une ligne ce que le parseur a rendu. Aucune issue n'est réécrite. */
function issue(entree: string): string {
  const r = analyserNumeroDossier(entree);
  if (r.parse_error) return `⚠ ${r.parse_error}`;
  if (r.forum) {
    return `${r.forum.name} (${r.forum.abbr}) — ${
      r.is_administrative ? "tribunal administratif" : "cour fédérale"
    }`;
  }
  if (r.is_administrative && !r.greffe_number) {
    return "Préfixe alphabétique non répertorié — aucun tribunal deviné, et ce n'est pas une erreur.";
  }
  const bouts = [
    r.greffe ? `greffe ${r.greffe_number} · ${r.greffe.palais_de_justice}` : null,
    r.greffe ? `district de ${r.greffe.district_judiciaire}` : null,
    r.juridiction ? `${r.juridiction.tribunal} · ${r.juridiction.competence}` : null,
  ].filter((b): b is string => b !== null);
  return bouts.join(" · ");
}

function dossier(): string {
  const lignes = EXEMPLES.map(
    (e) => `<tr><td><code>${esc(e)}</code></td><td class="m">${esc(issue(e))}</td></tr>`,
  ).join("");

  const jur = Object.entries(JURIDICTIONS)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([code, j]) => `<tr><td><code>${esc(code)}</code></td><td>${esc(j.tribunal)}</td>
<td>${esc(j.competence)}</td><td class="m">${esc(LIBELLE_TYPE_GREFFE[j.greffe_type])}</td></tr>`,
    )
    .join("");

  return `<section id="dossier">
${h2("dossier")}
${biP(
  [
    "Un numéro de dossier judiciaire québécois se lit NNN-NN-NNNNNN-NNN. Les positions 1 à 3 " +
      "sont le greffe — palais de justice et district judiciaire. Les positions 5 et 6 sont la " +
      "juridiction — tribunal, compétence, type de greffe. Le reste est une séquence et des " +
      "chiffres de contrôle.",
    "Les positions 7 et suivantes ne sont PAS analysées, et aucune somme de contrôle n'est " +
      "vérifiée : il n'y en a pas. En inventer une rejetterait des numéros valides, ce qui est " +
      "le pire des deux défauts.",
    "Un préfixe alphabétique court-circuite tout cela : TAL-, TAQ-, C.F.- et leurs pareils " +
      "nomment un corps qui numérote ses dossiers lui-même. Le préfixe EST la réponse à " +
      "« quel tribunal ».",
  ],
  EN.dossierTexte,
)}
<h3>${bi("Les issues, rendues par le vrai parseur", EN.dossierExemples)}</h3>
${biP(
  [
    "Les exemples ci-dessous ne sont pas transcrits : la page exécute le parseur au moment du " +
      "rendu et affiche ce qu'il renvoie. Cette documentation ne peut donc pas diverger du " +
      "comportement.",
  ],
  EN.dossierExemplesTexte,
)}
<div class="tw"><table><thead><tr>
<th>${bi("Entrée", EN.colEntree)}</th><th>${bi("Issue", EN.colIssue)}</th>
</tr></thead><tbody>${lignes}</tbody></table></div>
<div class="avert"><p>${bi(GARDE_DOSSIER, GARDE_DOSSIER)}</p></div>
<h3>${bi("Codes de juridiction", EN.juridictionsTitre)}</h3>
${biP(
  [
    "Le code à deux chiffres des positions 5 et 6. Le tiret cadratin des codes 46, 72 et 73 est " +
      "une valeur RÉELLE : ces séries ne relèvent d'aucun tribunal nommé.",
  ],
  EN.juridictionsTexte,
)}
<div class="tw"><table><thead><tr>
<th>${bi("Code", EN.colCode)}</th><th>${bi("Tribunal", EN.colTribunal)}</th>
<th>${bi("Compétence", EN.colCompetence)}</th><th>${bi("Type de greffe", EN.colGreffeType)}</th>
</tr></thead><tbody>${jur}</tbody></table></div>
</section>`;
}

// ── Greffes et palais ─────────────────────────────────────────────────────────

function greffes(): string {
  const districts = listerDistricts();
  const options = districts.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join("");

  const lignes = Object.keys(GREFFES)
    .sort()
    .map((numero) => {
      const g = GREFFES[numero]!;
      const adresse = adresseDuGreffe(numero);
      const siege = g.palais_key ? null : siegeFixe(numero);
      const localites = localitesItinerantes(numero);

      const cellAdresse = adresse
        ? `${esc(adresse.street)}${adresse.unit ? `, ${esc(adresse.unit)}` : ""}<br>` +
          `${esc(adresse.city)} (Québec) ${esc(adresse.postal_code)}` +
          (siege
            ? `<br><span class="m">${bi(
                `Siège fixe : ${siege.palais.name}, rattaché par le relevé du Ministère`,
                `Fixed seat: ${siege.palais.name}, attached by the Ministry's listing`,
              )}</span>`
            : "")
        : `<span class="m">${bi("aucune adresse publiée", EN.sansAdresse)}</span>`;

      const types = [
        g.point_de_service
          ? `<span class="m">${bi("cour itinérante", EN.typeItinerant)}</span>`
          : null,
        localites.length > 0 ? `<span class="m">${esc(localites.join(", "))}</span>` : null,
      ]
        .filter((t): t is string => t !== null)
        .join("<br>");

      return `<tr data-d="${esc(g.district_judiciaire)}">
<td><code>${esc(numero)}</code></td>
<td>${esc(g.palais_de_justice)}</td>
<td>${esc(g.district_judiciaire)}</td>
<td>${cellAdresse}</td>
<td>${types}</td>
</tr>`;
    })
    .join("");

  return `<section id="greffes">
${h2("greffes")}
${biP(
  [
    "Les greffes du Québec, cléés sur le numéro à trois chiffres par lequel commence un numéro " +
      "de dossier. Un greffe est un REGISTRE ; un palais est un BÂTIMENT — la relation n'est ni " +
      "bijective ni totale, et un greffe dessert souvent plusieurs lieux.",
  ],
  EN.greffesTexte,
)}
<div class="ctl">
<input id="q" type="search" placeholder="Filtrer…" aria-label="Filtrer">
<select id="dist" aria-label="District"><option value="">${bi("Tous les districts", EN.tousDistricts)}</option>${options}</select>
<span class="m" id="compte"></span>
</div>
<div class="tw"><table id="tgreffes"><thead><tr>
<th>${bi("Greffe", EN.colGreffe)}</th><th>${bi("Palais", EN.colPalais)}</th>
<th>${bi("District judiciaire", EN.colDistrict)}</th><th>${bi("Adresse", EN.colAdresse)}</th>
<th>${bi("Type", EN.colTypeLieu)}</th>
</tr></thead><tbody>${lignes}</tbody></table></div>

<div class="avert">
<p>${bi(GARDE_SANS_ADRESSE, GARDE_SANS_ADRESSE)}</p>
</div>

<h3>${bi("Aucune coordonnée", EN.aucuneCoordonnee)}</h3>
<div class="avert">
${biP(
  [
    "Ce connecteur ne porte AUCUN numéro de téléphone, aucun courriel et aucune heure " +
      "d'ouverture — pour aucun palais. C'est une propriété de la donnée, non un échec de la page.",
    "Les numéros des greffes sont publiés par chambre (Montréal en publie au moins quatre), sur " +
      "le site du Ministère. Les y obtenir.",
  ],
  EN.aucuneCoordonneeTexte,
)}
<p><a href="https://www.justice.gouv.qc.ca/nous-joindre/trouver-un-palais-de-justice/">justice.gouv.qc.ca</a></p>
</div>

<div class="avert">
<p>${bi(GARDE_PALAIS, GARDE_PALAIS)}</p>
<p class="m">${bi(
    `Adresses relevées le ${RELEVE_LE} · rattachements des greffes selon le relevé du Ministère mis à jour le ${MJQ_MAJ}.`,
    `Addresses surveyed ${RELEVE_LE} · registry attachments per the Ministry's listing updated ${MJQ_MAJ}.`,
  )}</p>
</div>
</section>`;
}

function acces(): string {
  return `<section id="acces">
${h2("acces")}
${biP(
  [
    "Instance privée, exploitée par un avocat du Québec pour sa propre pratique. Le point " +
      "d'entrée a la forme https://jurisprudence.poirierlavoie.ca/mcp/<secret> — le secret " +
      "n'apparaît nulle part sur cette page, et n'y apparaîtra jamais.",
    "Le code est public et la suite de tests s'exécute sans clef d'API ni réseau.",
  ],
  EN.acces,
)}
<p><a href="https://github.com/jpoirierlavoie/MCP-Jurisprudence-Quebec">github.com/jpoirierlavoie/MCP-Jurisprudence-Quebec</a>
 · <a href="mailto:jason@poirierlavoie.ca">jason@poirierlavoie.ca</a></p>
</section>`;
}

function pied(): string {
  return `<footer>
${biP(
  [
    "Jason Poirier Lavoie, avocat (Québec). Données de jurisprudence : CanLII. Données " +
      "des greffes et palais : ministère de la Justice du Québec.",
    "Aucun conseil juridique. Cet outil ne remplace ni la vérification à la source, ni le " +
      "jugement professionnel.",
  ],
  EN.pied,
)}
</footer>`;
}

/**
 * Rend la page entière. PURE : aucune E/S, aucune lecture de `env`, aucun accès au
 * `Request`. C'est ce qui permet de la mémoïser sans risque de fuite entre requêtes.
 */
export function renderSite(): string {
  const corps = [entete(), outils(), schemas(), dossier(), greffes(), acces(), pied()].join("\n");

  return `<!doctype html>
<html lang="fr" class="l-fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MCP Jurisprudence — jurisprudence canadienne et greffes du Québec</title>
<meta name="description" content="Serveur MCP en lecture seule : vérification de citations de jurisprudence contre la collection de CanLII, et nomenclature judiciaire québécoise (numéros de dossier, greffes, palais de justice).">
<style>${CSS}</style>
<script>${BOOT}</script>
</head>
<body>
<div class="wrap">
${tdm()}
<main>
${corps}
</main>
</div>
${haut()}
<script>${jsClient()}</script>
</body>
</html>`;
}

/**
 * Mémoïsation par isolat. Le rendu est de la concaténation de chaînes sur des tables
 * en mémoire — mais il est inutile de le refaire à chaque requête.
 *
 * ⚠ On ne met PAS la page en cache d'arête avec un `s-maxage` long, contrairement au
 *   connecteur jumeau : lui interroge D1 à chaque rendu et devait s'en protéger, au
 *   prix d'un défaut connu — un déploiement ne rafraîchit pas la page. Ici le rendu
 *   ne coûte rien, et un isolat neuf suit le déploiement.
 */
let memo: string | null = null;

export function pagePubliqueHtml(): string {
  if (memo === null) memo = renderSite();
  return memo;
}
