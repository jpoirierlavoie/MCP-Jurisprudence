/**
 * Amorçage et RÉCONCILIATION du répertoire (spécification §4.3, §14 étape 7).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ CE SCRIPT N'ÉCRIT RIEN EN BASE. Il rafraîchit le répertoire par l'outil       ║
 * ║ `jurisprudence_list_databases`, compare les hypothèses d'amorçage de la migration    ║
 * ║ 0002 aux databaseId RÉELLEMENT renvoyés par CanLII, et produit un RAPPORT     ║
 * ║ plus un fichier SQL de correction — à RELIRE avant de l'exécuter.             ║
 * ║                                                                              ║
 * ║ Le motif de cette prudence est dans §4.3 : les lignes `verified = 0` sont des ║
 * ║ hypothèses, et les identifiants fédéraux composés (caf-fca, cf-fc, cci-tcc)   ║
 * ║ ne sont PAS documentés. Corriger automatiquement une correspondance de        ║
 * ║ tribunal, c'est risquer de figer une erreur en silence — précisément ce que   ║
 * ║ ce connecteur refuse. La spécification interdit de livrer ces lignes sans     ║
 * ║ cette réconciliation.                                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Usage :
 *   node scripts/refresh-databases.mjs --local            # rafraîchit + rapport
 *   node scripts/refresh-databases.mjs --remote --sql     # + écrit reconcile.sql
 */

import { writeFileSync } from "node:fs";

import { redacted, session, texte } from "./mcp-client.mjs";

const args = process.argv.slice(2);
const mode = args.find((a) => a === "--local" || a === "--remote") ?? "--local";
const ecrireSql = args.includes("--sql");

const s = await session(mode);
console.log(`→ ${redacted(s.url)}\n`);

// 1. Rafraîchissement : deux appels sortants (cours + corpus législatifs).
const repertoire = texte(await s.appeler("jurisprudence_list_databases", { refresh: true }));
console.log(repertoire);

// 2. Le rapport de réconciliation est DANS la sortie de l'outil : celui-ci dénonce
//    toute ligne de `court_codes` / `paren_codes` dont le databaseId est absent du
//    répertoire réel.
//
// ⚠ On repère ces lignes par leur FORME (« · CODE -> base »), et non en découpant la
//   sortie sur un marqueur textuel. Un marqueur recopié ici vivrait des deux côtés
//   d'une frontière TypeScript/JavaScript qu'aucun compilateur ne vérifie : le jour
//   où la formulation change côté Worker, ce script annoncerait « aucune
//   correspondance démentie » alors qu'il y en a — un feu vert mensonger sur la
//   seule barrière bloquante de §4.3.
const LIGNE_ECART = /^·\s+.+\s+->\s+\S+/;

// Garde-fou : si la sortie n'a pas la forme attendue, on ne conclut PAS à
// « tout va bien » — un feu vert mensonger est pire qu'une erreur.
if (!repertoire.includes("base(s) au répertoire de CanLII")) {
  console.error(
    "\n❌ Sortie inattendue de jurisprudence_list_databases : impossible de statuer sur la\n" +
      "   réconciliation. NE PAS considérer le répertoire comme livrable.",
  );
  process.exit(2);
}

const lignes = repertoire
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => LIGNE_ECART.test(l));

if (lignes.length === 0) {
  console.log("\n✅ Aucune correspondance démentie : tous les databaseId d'amorçage existent.");
  console.log(
    "   Cela ne les CONFIRME pas pour autant — `verified` ne passe à 1 que sur un appel\n" +
      "   réussi (§6.4). Vérifier une citation par tribunal pour les promouvoir.",
  );
  process.exit(0);
}

console.log("\n── Réconciliation requise ────────────────────────────────────────────");
for (const l of lignes) console.log(`  ${l}`);

console.log(
  "\nChaque ligne ci-dessus est une HYPOTHÈSE démentie par le répertoire réel.\n" +
    "Pour chacune : trouver le databaseId exact dans la liste ci-dessus, puis corriger.\n" +
    "Tant qu'elles subsistent, toute citation employant ces codes est déclarée\n" +
    "INTROUVABLE sans appel sortant (§6.4 point 3) — c'est voulu, mais ce n'est pas\n" +
    "un état de livraison.",
);

if (ecrireSql) {
  const gabarit = [
    "-- Réconciliation du répertoire (§4.3, §14 étape 7).",
    "-- ⚠ GABARIT À RELIRE ET À COMPLÉTER À LA MAIN : les databaseId de remplacement",
    "--   doivent être lus dans la sortie de jurisprudence_list_databases, pas devinés.",
    "--   Ne passer `verified = 1` qu'après un appel RÉUSSI sur une vraie citation.",
    "",
    ...lignes.map((l) => {
      // La ligne a la forme « · CODE -> base (note) » ; on retire la puce avant tout.
      const [gauche, droite] = l
        .replace(/^·\s*/, "")
        .split("->")
        .map((x) => x.trim());
      const code = gauche.split(/\s+/)[0];
      // Un couple entre parenthèses — « (QC CQ) » — vise `paren_codes`, pas
      // `court_codes` : proposer le mauvais UPDATE ferait porter la correction sur
      // une table qui n'a pas la colonne, et l'erreur se verrait à l'exécution.
      const estCouple = gauche.startsWith("(");
      if (estCouple) {
        const [juris, cour] = gauche.replace(/[()]/g, "").trim().split(/\s+/);
        return (
          `-- (${juris} ${cour}) pointe vers « ${droite} », absent du répertoire.\n` +
          `-- UPDATE paren_codes SET database_id = '<A_REMPLIR>', verified = 0\n` +
          `--   WHERE juris_code = '${juris}' AND court_code = '${cour}';`
        );
      }
      return (
        `-- ${code} pointe vers « ${droite} », absent du répertoire.\n` +
        `-- UPDATE court_codes SET database_id = '<A_REMPLIR>', verified = 0,\n` +
        `--   note = 'réconcilié le ${new Date().toISOString().slice(0, 10)}'\n` +
        `--   WHERE code = '${code}';`
      );
    }),
    "",
  ].join("\n");
  writeFileSync("reconcile-court-codes.sql", gabarit, "utf8");
  console.log(
    "\n📝 Gabarit écrit dans `reconcile-court-codes.sql` (gitignoré).\n" +
      "   Le compléter, le relire, puis :\n" +
      `   npx wrangler d1 execute canlii ${mode === "--remote" ? "--remote" : "--local"} --file=reconcile-court-codes.sql`,
  );
}

process.exitCode = 1; // état non livrable tant que la réconciliation n'est pas faite
