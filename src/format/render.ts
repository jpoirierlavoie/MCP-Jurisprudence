/**
 * Gabarits de sortie (spécification annexe A) et MISES EN GARDE du contrat de
 * vérité (§2).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ Les constantes de mise en garde ci-dessous sont IMPOSÉES.                    ║
 * ║                                                                              ║
 * ║ §2 exige qu'elles vivent dans le CORPS DE LA RÉPONSE, et pas seulement dans  ║
 * ║ la description de l'outil : une description n'est lue qu'une fois, une sortie║
 * ║ est lue à chaque appel. Elles sont verrouillées par `test/garde.test.ts`, qui║
 * ║ échoue si une refonte de gabarit les fait disparaître — le mode de panne     ║
 * ║ redouté n'étant pas l'erreur, mais le SILENCE.                               ║
 * ║                                                                              ║
 * ║ Ne pas reformuler. Un vérificateur de citations qui promet plus qu'il ne     ║
 * ║ tient est pire qu'aucun outil : il transforme une incertitude connue en      ║
 * ║ fausse assurance, dans un contexte où la sanction est déontologique.         ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import type { CaseRow } from "../store/cases";
import { dateFr, joindre, motsCles, nombreFr, ou } from "./fr";

// ── Mises en garde imposées (§2) ──────────────────────────────────────────────

/** Pied de `jurisprudence_verify_citations` — annexe A.1, verbatim. */
export const GARDE_VERIFICATION =
  "Établit l'existence et l'identité, jamais l'autorité actuelle (aucun historique\n" +
  "d'appel, aucun indicateur de traitement) ni le contenu du dispositif.";

/** Pied de `jurisprudence_find_case` — annexe A.2, verbatim. */
export const GARDE_RECHERCHE =
  "Recherche sur l'intitulé et les mots-clés uniquement — l'API de CanLII n'expose\n" +
  "pas le texte des décisions.";

/** Tête de `jurisprudence_subsequent_history` — annexe A.3, verbatim. */
export const GARDE_SORTS_TETE = "Sorts ultérieurs — INDICE HEURISTIQUE, à vérifier à la source.";

/** Pied de `jurisprudence_subsequent_history` — annexe A.3, verbatim. */
export const GARDE_SORTS_PIED =
  "Ce résultat n'indique NI le sens du traitement (confirmée, infirmée, distinguée),\n" +
  "NI les pourvois pendants, NI les refus de permission d'appeler. Ce n'est pas un\n" +
  "citateur professionnel.";

/** Pied du citateur (§7.4). */
export const GARDE_CITATEUR =
  "Listes brutes : elles n'indiquent AUCUN sens de traitement (suivi, distingué,\n" +
  "infirmé). Pour les dispositions québécoises, enchaîner avec le connecteur\n" +
  "« Législation du Québec » afin d'en lire le texte officiel.";

/**
 * Note d'ÉTRANGLEMENT — rendue seulement quand CanLII a effectivement refusé des
 * appels pendant CETTE invocation.
 *
 * ⚠ CE N'EST PAS UNE MISE EN GARDE DE §2, et il ne faut pas la confondre avec une.
 *   Les mises en garde bornent ce qu'un résultat ÉTABLIT ; celle-ci ne dit rien de la
 *   vérité du résultat — les appels étranglés ont été rejoués, et un verdict rendu
 *   reste un verdict rendu. Elle parle de RYTHME.
 *
 *   Elle existe quand même, et pour un motif de §2 : sans elle, un modèle qui voit un
 *   appel lent, ou un résultat partiel, n'a aucun moyen de distinguer « CanLII m'a
 *   demandé de ralentir » de « la collection ne contient rien ». La seconde lecture
 *   est précisément l'erreur que ce connecteur existe pour empêcher. On nomme donc la
 *   cause plutôt que de la laisser deviner.
 *
 *   Muette quand rien n'a été étranglé : une note affichée à chaque appel cesse
 *   d'être lue, et celle-ci doit l'être le jour où elle paraît.
 *
 * ⚠ `resultatComplet` — ajouté le 2026-09-17, après un défaut réel. La phrase de
 *   réassurance (« ni tronqués ni affaiblis ») n'est vraie QUE si les appels étranglés
 *   ont tous été rejoués AVEC SUCCÈS. Servie sous un balayage interrompu ou un budget
 *   épuisé, elle affirme d'un résultat incomplet qu'il ne l'est pas — et elle le fait
 *   à la ligne suivant celle qui vient de dire l'inverse :
 *
 *       Balayage interrompu — CanLII a renvoyé une erreur 200.
 *       CanLII a étranglé 3 appels pendant cet appel (HTTP 429).
 *       Ils ont été rejoués [...] ne sont ni tronqués ni affaiblis par ce fait.
 *
 *   La réserve « par ce fait » portait toute la charge, et aucun lecteur ne la pondère
 *   ainsi : c'est ce voisinage qui a fait lire le 429 comme la cause OPÉRANTE de
 *   l'interruption. Une sortie qui se contredit fait douter de tout le reste.
 *
 *   La PREMIÈRE LIGNE est identique dans les deux modes, délibérément : la cause reste
 *   nommée quoi qu'il arrive (invariant 9(a)).
 */
/**
 * Le corps de la note d'étranglement quand TOUT a été rejoué avec succès.
 *
 * Séparé de la première ligne parce que celle-ci porte un décompte, et qu'un registre de
 * gardes est statique. La coupure tombe exactement là où la phrase cesse de dépendre de
 * l'appel : la cause nommée reste en tête (invariant 9(a)), la portée devient citable.
 */
export const ETRANGLEMENT_SANS_PERTE =
  "Ils ont été rejoués et le rythme a été réduit d'office : les résultats ci-dessus\n" +
  "ne sont ni tronqués ni affaiblis par ce fait. Un lot plus petit, ou repris plus\n" +
  "tard, s'exécutera plus vite.";

/** Le corps de la même note quand le résultat n'est PAS complet. Ajouté après un défaut réel. */
export const ETRANGLEMENT_RESULTAT_PARTIEL =
  "Ils ont été rejoués, mais le résultat ci-dessus n'est PAS complet pour autant :\n" +
  "son étendue réelle n'est pas connue. Reprendre plus tard, ou sur un lot plus petit.";

export function noteEtranglement(etranglements: number, resultatComplet = true): string {
  if (etranglements <= 0) return "";
  const pluriel = etranglements > 1 ? "appels" : "appel";
  const tete = `CanLII a étranglé ${nombreFr(etranglements)} ${pluriel} pendant cet appel (HTTP 429).`;
  return [tete, resultatComplet ? ETRANGLEMENT_SANS_PERTE : ETRANGLEMENT_RESULTAT_PARTIEL].join(
    "\n",
  );
}

/**
 * Les dates d'une fiche LÉGISLATIVE bornent la VERSION que CanLII sert, et non
 * l'instrument.
 *
 * ⚠ Observé en production le 2026-09-17 : `qcs / cqlr-c-ccq-1991` — le Code civil du
 *   Québec — est servi avec `startDate = 2026-02-24`, sous un régime dit
 *   « ENTRY_INTO_FORCE ». Le Code est en vigueur depuis 1994. Les deux lignes étaient
 *   individuellement vraies et se lisaient ensemble comme le contraire de la vérité.
 *
 *   La PREUVE que la fenêtre borne une version est dans `qch / lrq-c-c-24`, abrogé :
 *   1986-12-18 → 1987-12-01. Aucun instrument ne vit onze mois et demi.
 *
 * ⚠ Cette réserve est rendue sous les dates, jamais en pied : une réserve placée sous
 *   une affirmation déjà faite ne corrige pas cette affirmation (invariant 9(c)).
 */
export const GARDE_VERSION_LEGISLATIVE =
  "⚠ Ces dates bornent la VERSION que CanLII sert, et non l'instrument : elles ne\n" +
  "datent ni son entrée en vigueur, ni son abrogation. Un texte en vigueur depuis des\n" +
  "décennies peut porter une date de début toute récente.";

/** Rappel du délai de diffusion, employé par `jurisprudence_browse_cases` (§7.6). */
export const GARDE_DIFFUSION =
  "La diffusion sur CanLII connaît un délai : prévoir un jeu de deux jours sur les\n" +
  "filtres de date de diffusion.";

/**
 * Marqueur de la réconciliation exigée par §4.3.
 *
 * ⚠ CE COMMENTAIRE AFFIRMAIT LE CONTRAIRE DE LA VÉRITÉ, jusqu'au 2026-09-16. Il disait
 *   que `scripts/refresh-databases.mjs` cherche cette chaîne pour décider si le répertoire
 *   est livrable, et qu'un test l'épingle. Ni l'un ni l'autre : le script ne la mentionne
 *   NULLE PART (`grep` : zéro occurrence), et aucun test ne la nomme. Un lecteur pressé
 *   aurait donc cru cette constante intouchable, et surtout aurait cru le script protégé
 *   alors qu'il ne l'est pas par elle.
 *
 * ⚠ LA VRAIE chaîne de couplage est l'en-tête « base(s) au répertoire de CanLII », rendu
 *   par `src/mcp/handlers/listDatabases.ts` : c'est SUR ELLE que le script pose son
 *   garde-fou (`refresh-databases.mjs`, `includes(...)`), et la modifier sans le prévenir
 *   le fait sortir en code 2 — refus de statuer — plutôt que conclure de travers. C'est
 *   donc CELLE-LÀ qu'il faut propager, et non celle-ci.
 *
 *   Ce qui reste vrai de cette constante : elle porte la barrière que §4.3 qualifie de
 *   bloquante, elle paraît dans le CORPS de la réponse, et le script repère les écarts
 *   par leur FORME plutôt que par un marqueur recopié — délibérément, car un marqueur
 *   vivrait des deux côtés d'une frontière TypeScript/JavaScript qu'aucun compilateur
 *   ne vérifie.
 */
export const MARQUEUR_RECONCILIATION = "⚠ RÉCONCILIATION REQUISE";

/** Explications concurrentes d'un INTROUVABLE (§2, conséquence n° 2). */
export const EXPLICATIONS_INTROUVABLE =
  "Explications possibles : numéro erroné · décision hors de la collection ·\n" +
  "diffusion récente (prévoir un jeu de 2 jours).";

/**
 * Le PENDANT d'`EXPLICATIONS_INTROUVABLE`, pour un échec qui n'est PAS une absence.
 *
 * ⚠ Ces deux constantes ne sont pas interchangeables, et les confondre est le défaut
 *   que l'invariant 9 nomme. `EXPLICATIONS_INTROUVABLE` énumère des causes d'ABSENCE —
 *   numéro erroné, décision hors collection, diffusion récente. Servie sur un 401, un
 *   429 ou une expiration, elle fait conclure à l'inexistence d'une décision que
 *   personne n'a cherchée : CanLII n'a simplement pas répondu. Celle-ci dit l'inverse,
 *   et le dit en toutes lettres plutôt que de laisser le lecteur l'inférer.
 *
 *   Elle vit en UN SEUL exemplaire pour la même raison que la boucle d'auto-correction
 *   (invariant 6) : deux formulations de la même réserve divergeraient, et l'une
 *   finirait par être affaiblie sans que l'autre le soit.
 */
export const EXPLICATION_INDETERMINEE =
  "AUCUN constat n'a été fait : ce n'est PAS un constat d'absence. Réessayer plus tard.";

// ── Mises en garde des tables du Québec (§17) ─────────────────────────────────
//
// Les trois constantes ci-dessous obéissent à la MÊME règle que celles de CanLII
// ci-dessus, pour une raison différente : les tables `src/qc/` ne viennent PAS de
// CanLII, elles sont un relevé daté du ministère de la Justice du Québec. Leur
// mode de panne n'est pas l'absence mais la PÉREMPTION — une adresse juste hier,
// fausse aujourd'hui, et rendue avec le même aplomb dans les deux cas.

/**
 * Pied imposé de toute sortie `palais_*`. Porte la DATE du relevé : sans elle, le
 * lecteur ne peut pas juger du risque qu'il prend.
 */
/**
 * Les réserves PERMANENTES restées littérales jusqu'au 2026-09-17.
 *
 * Chacune était écrite dans son gestionnaire, servie à CHAQUE sortie réussie de son outil.
 * Elles montent ici pour une seule raison : le registre de gardes (`src/gardes.ts`) importe
 * ses textes au lieu de les recopier, de sorte que la prose servie et la réserve structurée
 * sont le même objet. Une réserve anonyme ne peut pas être importée.
 *
 * ⚠ AUCUN CARACTÈRE N'A CHANGÉ au passage. Déplacement, jamais réécriture : réécrire une
 *   réserve est une décision éditoriale, donc de l'avocat (invariant 16).
 */

/** `jurisprudence_browse_cases` — pied inconditionnel. */
export const LISTES_SANS_FICHE =
  "Les listes de CanLII ne portent ni date de décision, ni numéro de dossier, ni\n" +
  "hyperlien : pour la fiche complète d'une décision, employer jurisprudence_get_case.";

/** `jurisprudence_get_case` — servie avec toute fiche. */
export const TEXTE_NON_EXPOSE =
  "Le TEXTE de la décision n'est pas exposé par l'API de CanLII : suivre l'hyperlien.";

/** `jurisprudence_get_legislation` — pied. */
export const LEGISLATION_METADONNEES =
  "Métadonnées seulement — l'API de CanLII ne rend pas le texte. Pour le TEXTE d'une\n" +
  "loi ou d'un règlement du Québec, employer le connecteur « Législation du Québec »,\n" +
  "qui rend le texte officiel verbatim.";

/** `jurisprudence_browse_legislation` — pied. Texte VOISIN du précédent, et distinct. */
export const LEGISLATION_METADONNEES_LISTE =
  "Métadonnées seulement. Pour le TEXTE d'une loi ou d'un règlement du Québec,\n" +
  "employer le connecteur « Législation du Québec », qui rend le texte officiel verbatim.";

/** `jurisprudence_parse_citation` — pied inconditionnel. */
export const DIAGNOSTIC_SEULEMENT =
  "Outil de diagnostic : il n'établit RIEN sur l'existence de la décision. " +
  "Pour l'éprouver réellement, utiliser jurisprudence_verify_citations.";

/** `greffe_parse_court_file_number` — pied du numéro judiciaire. */
export const SANS_PLUMITIF =
  "Ce connecteur ne consulte AUCUN registre de dossiers : il n'a pas accès au plumitif.";

export const GARDE_PALAIS =
  "Adresses relevées auprès du ministère de la Justice du Québec le 2026-07-15.\n" +
  "Les palais de justice déménagent : VÉRIFIER la liste officielle du Ministère\n" +
  "avant toute signification ou tout dépôt.";

/**
 * Adresse absente — le pendant exact de la règle INTROUVABLE de §2.
 *
 * ⚠ « Aucune adresse publiée » n'est PAS « il n'existe pas d'adresse ». Six greffes
 *   sont concernés, dont quatre cours itinérantes qui siègent là où la cour se
 *   déplace. Formuler l'inconnu comme une absence ferait renoncer un praticien à
 *   une démarche possible.
 */
export const GARDE_SANS_ADRESSE =
  "Cela n'établit PAS qu'il n'en existe aucune : ce greffe siège en cour itinérante,\n" +
  "ou son adresse n'a pas été relevée. La demander au ministère de la Justice.";

/** Pied imposé de `greffe_parse_court_file_number`. */
export const GARDE_DOSSIER =
  "Cet outil lit une NOMENCLATURE : il n'établit pas que ce dossier existe, ni qu'il\n" +
  "est actif. Les positions 7 et suivantes (séquence et contrôle) ne sont pas\n" +
  "analysées — aucune somme de contrôle n'est vérifiée.";

// ── Rendu d'une fiche ─────────────────────────────────────────────────────────

/**
 * Hyperlien public. On ne rend JAMAIS d'URL `api.canlii.org` (§5.3) : uniquement
 * l'hyperlien `canlii.ca` que l'API fournit.
 */
export function lien(row: { url: string | null }): string | null {
  const u = (row.url ?? "").trim();
  if (u.length === 0) return null;
  return u.includes("api.canlii.org") ? null : u;
}

/**
 * Bloc d'identité d'une décision, tel qu'à l'annexe A.1 :
 *
 *   Dunsmuir c. Nouveau-Brunswick
 *   [2008] 1 RCS 190, 2008 CSC 9 (CanLII) · csc-scc · 2008-03-07
 *   N° de dossier : 31459
 *   Mots-clés : équité procédurale — raisonnabilité — …
 *   https://canlii.ca/t/1vxsn
 */
export function ficheDecision(row: CaseRow, options: { avecIds?: boolean } = {}): string {
  const lignes: string[] = [row.title];
  lignes.push(
    joindre([
      ou(row.citation, row.neutral_cite ?? "—"),
      row.database_id,
      dateFr(row.decision_date),
    ]),
  );
  if (options.avecIds) lignes.push(`Identifiants : ${row.database_id} / ${row.case_id}`);
  if (row.docket_number) lignes.push(`N° de dossier : ${row.docket_number}`);
  const mc = motsCles(row.keywords);
  if (mc) lignes.push(`Mots-clés : ${mc}`);
  const l = lien(row);
  if (l) lignes.push(l);
  return lignes.join("\n");
}

/** Ligne compacte d'une décision dans une liste de candidats (annexe A.2). */
export function ligneCandidat(row: CaseRow): string {
  const lignes: string[] = [row.title];
  lignes.push(
    joindre([
      ou(row.citation, row.neutral_cite ?? "—"),
      dateFr(row.decision_date),
      `${row.database_id}/${row.case_id}`,
    ]),
  );
  const l = lien(row);
  if (l) lignes.push(l);
  return lignes.join("\n");
}

/** Numérote un bloc et indente ses lignes de continuation (annexe A). */
export function numeroter(index: number, bloc: string): string {
  const lignes = bloc.split("\n");
  const tete = `${index}. ${lignes[0] ?? ""}`;
  const suite = lignes.slice(1).map((l) => (l.length > 0 ? `   ${l}` : l));
  return [tete, ...suite].join("\n");
}

/** Assemble un document : titre, blocs numérotés, pied de mise en garde. */
export function document(entete: string, blocs: string[], pied?: string | null): string {
  const corps = blocs.map((b, i) => numeroter(i + 1, b)).join("\n\n");
  return [entete, corps, pied ?? ""].filter((s) => s.trim().length > 0).join("\n\n");
}

/** Mention de provenance et de coût d'un balayage (annexe A.2). */
export function provenance(opts: {
  locales: number;
  appels: number;
  parcourues: number;
  persistees: boolean;
}): string {
  if (opts.appels === 0) {
    return `Provenance : index local (${nombreFr(opts.locales)} fiche(s)), aucun appel à CanLII.`;
  }
  const persist = opts.persistees ? ", persistées" : "";
  return (
    `Provenance : index local (${nombreFr(opts.locales)} fiche(s)) + balayage vif ` +
    `(${nombreFr(opts.appels)} appel(s), ${nombreFr(opts.parcourues)} fiche(s) parcourues${persist}).`
  );
}
