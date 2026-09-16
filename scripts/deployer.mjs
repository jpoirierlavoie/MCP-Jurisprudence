#!/usr/bin/env node
/**
 * Déploiement de production — migrations D'ABORD, puis le Worker (§12).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ POURQUOI UN SCRIPT PLUTÔT QU'UNE LIGNE DE `package.json`.                    ║
 * ║                                                                              ║
 * ║ Trois raisons, et chacune a suffi à elle seule.                              ║
 * ║                                                                              ║
 * ║ 1. L'ORDRE. Jusqu'au 2026-09-16, `npm run deploy` valait `wrangler deploy`   ║
 * ║    tout court — le déploiement SANS les migrations, c'est-à-dire l'ordre que ║
 * ║    §12 interdit, sous le nom le plus naturel du dépôt. L'invariant était     ║
 * ║    écrit dans deux fichiers de documentation et dans un workflow qui ne      ║
 * ║    s'exécutait pas, pendant que la commande réelle faisait l'inverse.        ║
 * ║                                                                              ║
 * ║ 2. L'ARBRE PROPRE. Le Worker annonce désormais son commit sur `/health`.     ║
 * ║    Déployer un arbre modifié ferait ANNONCER un commit qui ne correspond pas ║
 * ║    au code en ligne — un mensonge silencieux, et précisément le mode de      ║
 * ║    panne que ce dépôt combat partout ailleurs. On refuse plutôt que de       ║
 * ║    publier une correspondance fausse.                                        ║
 * ║                                                                              ║
 * ║ 3. WINDOWS. `git rev-parse` dans un script npm ne s'évalue pas : npm passe   ║
 * ║    par `cmd.exe`, qui ignore `$(…)`. Le praticien travaille sous Windows ;   ║
 * ║    une recette qui ne marche que sous bash n'est pas une recette.            ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Le jeton n'est JAMAIS lu par ce script, ni affiché, ni passé en argument : il est
 * attendu dans `CLOUDFLARE_API_TOKEN`, et `wrangler` le lit lui-même. Un argument de
 * ligne de commande est visible dans la liste des processus ; une variable
 * d'environnement ne l'est pas.
 *
 *     $env:CLOUDFLARE_API_TOKEN = (Get-Content cf.token -Raw).Trim()   # PowerShell
 *     npm run deploy
 */
import { execFileSync, spawnSync } from "node:child_process";

/** Sortie d'une commande git, sans bruit. */
function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function echouer(titre, ...details) {
  console.error(`\n✘ ${titre}`);
  for (const d of details) console.error(`  ${d}`);
  console.error("");
  process.exit(1);
}

// ── 1. L'arbre doit être propre ───────────────────────────────────────────────
//
// `--porcelain` couvre l'indexé comme le non indexé. Les fichiers non suivis en font
// partie et c'est voulu : un fichier oublié qui deviendra du code au prochain commit
// rendrait l'annonce de `/health` fausse dès ce moment-là.
const sale = git("status", "--porcelain");
if (sale) {
  echouer(
    "L'arbre de travail n'est pas propre — déploiement refusé.",
    "Le Worker annonce son commit sur /health. Déployer un arbre modifié ferait",
    "annoncer un commit qui ne décrit pas le code en ligne.",
    "",
    ...sale.split("\n").slice(0, 10).map((l) => `    ${l}`),
  );
}

const commit = git("rev-parse", "--short", "HEAD");
const branche = git("rev-parse", "--abbrev-ref", "HEAD");
if (branche !== "main") {
  console.warn(`⚠ Branche « ${branche} » et non « main » — le contrôle de dérive comparera`);
  console.warn("  la production au dernier commit de main, et signalera donc un écart.\n");
}

if (!process.env.CLOUDFLARE_API_TOKEN) {
  echouer(
    "CLOUDFLARE_API_TOKEN est absent de l'environnement.",
    "PowerShell : $env:CLOUDFLARE_API_TOKEN = (Get-Content cf.token -Raw).Trim()",
    "bash       : export CLOUDFLARE_API_TOKEN=\"$(tr -d '\\r\\n' < cf.token)\"",
    "Le jeton ne se passe pas en argument : la liste des processus est lisible.",
  );
}

/** Exécute une commande en héritant du terminal ; rend son code de sortie. */
function lancer(etape, cmd, args) {
  console.log(`\n── ${etape}\n   ${cmd} ${args.join(" ")}\n`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  return r.status ?? 1;
}

// ── 2. Les migrations, D'ABORD ────────────────────────────────────────────────
//
// L'ordre inverse met en ligne du code qui lit des colonnes inexistantes — et un
// connecteur juridique qui échoue en silence sur une colonne manquante est exactement
// le défaut que ce dépôt cherche à rendre impossible. Un échec ici ARRÊTE tout : le
// déploiement n'est pas tenté.
if (lancer("Migrations D1 (production)", "npx", ["wrangler", "d1", "migrations", "apply", "canlii", "--remote"]) !== 0) {
  echouer(
    "Les migrations ont échoué — le Worker n'a PAS été déployé.",
    "C'est le comportement voulu (§12) : on ne met pas en ligne du code dont le",
    "schéma n'a pas suivi. Corriger la migration, puis relancer.",
  );
}

// ── 3. Le Worker, avec son commit ─────────────────────────────────────────────
if (lancer(`Déploiement du Worker (commit ${commit})`, "npx", ["wrangler", "deploy", "--var", `COMMIT:${commit}`]) !== 0) {
  echouer(
    "Le déploiement a échoué APRÈS des migrations réussies.",
    "État à connaître : le schéma est en avance sur le code en ligne. C'est le sens",
    "sûr de l'écart — l'ancien code ignore une colonne nouvelle — mais il ne doit",
    "pas durer. Relancer.",
  );
}

console.log(`\n✔ En ligne : commit ${commit}.`);
console.log("  Vérifier : curl -s https://jurisprudence.poirierlavoie.ca/health");
console.log("  Le contrôle de dérive (.github/workflows/verifier-deploiement.yml) le");
console.log("  confrontera chaque jour au dernier commit de main.\n");
