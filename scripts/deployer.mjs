#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function echouer(titre, ...details) {
  console.error(`\n✘ ${titre}`);
  for (const d of details) console.error(`  ${d}`);
  console.error("");
  process.exit(1);
}

const sale = git("status", "--porcelain");
if (sale) {
  echouer(
    "L'arbre de travail n'est pas propre — déploiement refusé.",
    "Le Worker annonce son commit sur /health. Déployer un arbre modifié ferait",
    "annoncer un commit qui ne décrit pas le code en ligne.",
    "",
    ...sale
      .split("\n")
      .slice(0, 10)
      .map((l) => `    ${l}`),
  );
}

const commit = git("rev-parse", "--short", "HEAD");
const branche = git("rev-parse", "--abbrev-ref", "HEAD");
const surMain = branche === "main" || process.env.GITHUB_REF === "refs/heads/main";
if (!surMain) {
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

function lancer(etape, cmd, args) {
  console.log(`\n── ${etape}\n   ${cmd} ${args.join(" ")}\n`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  return r.status ?? 1;
}

if (
  lancer("Migrations D1 (production)", "npx", [
    "wrangler",
    "d1",
    "migrations",
    "apply",
    "canlii",
    "--remote",
  ]) !== 0
) {
  echouer(
    "Les migrations ont échoué — le Worker n'a PAS été déployé.",
    "C'est le comportement voulu (§12) : on ne met pas en ligne du code dont le",
    "schéma n'a pas suivi. Corriger la migration, puis relancer.",
  );
}

if (
  lancer(`Déploiement du Worker (commit ${commit})`, "npx", [
    "wrangler",
    "deploy",
    "--var",
    `COMMIT:${commit}`,
  ]) !== 0
) {
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
