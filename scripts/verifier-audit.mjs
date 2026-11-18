import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CHEMIN_COURANT = fileURLToPath(import.meta.url);
const RACINE = resolve(dirname(CHEMIN_COURANT), "..");
const CHEMIN_OSV = resolve(RACINE, "osv-scanner.toml");

export function lireExemptionsOsvToml(contenuToml) {
  const exemptions = new Map();
  const blocs = contenuToml.split(/\[\[\s*IgnoredVulns\s*\]\]/g).slice(1);
  for (const bloc of blocs) {
    const sansCommentaires = bloc
      .split(/\r?\n/)
      .filter((l) => !/^\s*#/.test(l))
      .map((l) => l.trim())
      .join("\n");
    const mId = /(?:^|\n)id\s*=\s*"([^"]+)"/.exec(sansCommentaires);
    const mRaison = /(?:^|\n)reason\s*=\s*"([^"]+)"/.exec(sansCommentaires);
    const id = mId?.[1]?.trim() ?? "";
    const raison = mRaison?.[1]?.trim() ?? "";
    if (!/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(id)) {
      throw new Error(`Exemption osv-scanner.toml invalide (GHSA minuscule attendu) : « ${id} ».`);
    }
    if (exemptions.has(id)) {
      throw new Error(`Exemption dupliquée dans osv-scanner.toml : « ${id} ».`);
    }
    if (!/^\d{4}-\d{2}-\d{2}\s*:/.test(raison) || raison.length < 20) {
      throw new Error(
        `Exemption ${id} dans osv-scanner.toml sans date AAAA-MM-JJ ni motif explicite.`,
      );
    }
    exemptions.set(id, raison);
  }
  return exemptions;
}

export function extraireAvisDirects(rapport) {
  const avis = new Map();
  const vulns = rapport.vulnerabilities ?? {};
  for (const [paquet, detail] of Object.entries(vulns)) {
    const via = Array.isArray(detail?.via) ? detail.via : [];
    for (const entree of via) {
      if (typeof entree !== "object" || entree === null) continue;
      const url = typeof entree.url === "string" ? entree.url : "";
      const mGhsa = /\b(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})\b/.exec(url);
      const cle = mGhsa ? mGhsa[1] : `${paquet}:${entree.source ?? entree.title ?? "inconnu"}`;
      avis.set(cle, {
        id: cle,
        paquet,
        severite: entree.severity ?? detail.severity ?? "inconnue",
        titre: entree.title ?? "sans titre",
        plage: entree.range ?? "*",
        url,
      });
    }
  }
  return avis;
}

export function evaluerConformiteAudit(rapportProd, rapportComplet, contenuOsvToml) {
  const erreurs = [];
  const totalProd = rapportProd.metadata?.vulnerabilities?.total ?? 0;
  if (totalProd > 0) {
    erreurs.push(`${totalProd} vulnérabilité(s) d'exécution détectée(s) par npm audit --omit=dev.`);
  }

  const exemptions = lireExemptionsOsvToml(contenuOsvToml);
  const avisDirects = extraireAvisDirects(rapportComplet);

  for (const [id, info] of avisDirects.entries()) {
    if (!exemptions.has(id)) {
      erreurs.push(
        `Vulnérabilité non exemptée : ${id} (${info.paquet} ${info.plage}, ${info.severite}) — ${info.titre}`,
      );
    }
  }

  const orphelines = [...exemptions.keys()].filter((id) => !avisDirects.has(id));
  if (orphelines.length > 0) {
    erreurs.push(
      `Exemption(s) orpheline(s) dans osv-scanner.toml (à retirer dès correction amont) : ${orphelines.join(", ")}`,
    );
  }

  return { conforme: erreurs.length === 0, erreurs, nbAvisTries: avisDirects.size };
}

function executerNpmAudit(argsSupplementaires) {
  const estWindows = process.platform === "win32";
  const commande = estWindows ? "cmd.exe" : "npm";
  const args = estWindows
    ? ["/d", "/s", "/c", "npm.cmd", "audit", "--json", ...argsSupplementaires]
    : ["audit", "--json", ...argsSupplementaires];

  const envPropre = {};
  for (const [cle, valeur] of Object.entries(process.env)) {
    if (/^npm_config_/i.test(cle)) continue;
    if (valeur !== undefined) envPropre[cle] = valeur;
  }

  const res = spawnSync(commande, args, {
    cwd: RACINE,
    env: envPropre,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });

  if (res.error) {
    throw res.error;
  }
  const texte = (res.stdout ?? "").trim();
  if (texte.length === 0) {
    throw new Error(`Sortie vide de npm audit (${res.stderr ?? "sans stderr"}).`);
  }
  const rapport = JSON.parse(texte);
  if (rapport.error) {
    throw new Error(`Erreur réseau/registre lors de npm audit : ${JSON.stringify(rapport.error)}`);
  }
  return rapport;
}

export function autoVerifierLogiqueAudit() {
  const rapportSain = { metadata: { vulnerabilities: { total: 0 } }, vulnerabilities: {} };
  const rapportUnAvis = {
    metadata: { vulnerabilities: { total: 1 } },
    vulnerabilities: {
      picomatch: {
        severity: "high",
        via: [
          {
            source: 1,
            title: "ReDoS",
            url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
            severity: "high",
            range: "<=4.0.7",
          },
        ],
      },
    },
  };
  const tomlValide = `[[IgnoredVulns]]\nid = "GHSA-fc5q-39xc-vjpf"\nreason = "2026-11-18 : motif complet suffisamment detaille pour le controle."\n`;

  if (!evaluerConformiteAudit(rapportSain, rapportUnAvis, tomlValide).conforme) {
    throw new Error("Autotest audit : cas conforme rejeté à tort.");
  }
  if (
    evaluerConformiteAudit(
      { metadata: { vulnerabilities: { total: 1 } }, vulnerabilities: {} },
      rapportUnAvis,
      tomlValide,
    ).conforme
  ) {
    throw new Error("Autotest audit : vulnérabilité de production non bloquée.");
  }
  if (evaluerConformiteAudit(rapportSain, rapportUnAvis, "").conforme) {
    throw new Error("Autotest audit : GHSA non trié non bloqué.");
  }
  if (evaluerConformiteAudit(rapportSain, rapportSain, tomlValide).conforme) {
    throw new Error("Autotest audit : exemption orpheline non bloquée.");
  }
  for (const tomlInvalide of [
    `[[IgnoredVulns]]\nid = "CVE-2026-0001"\nreason = "2026-11-18 : alias CVE interdit par regle du depot."\n`,
    `[[IgnoredVulns]]\nid = "GHSA-FC5Q-39XC-VJPF"\nreason = "2026-11-18 : casse majuscule invalide pour OSV."\n`,
    `[[IgnoredVulns]]\nid = "GHSA-fc5q-39xc-vjpf"\nreason = "Sans date ISO en tete."\n`,
  ]) {
    let aLeve = false;
    try {
      lireExemptionsOsvToml(tomlInvalide);
    } catch {
      aLeve = true;
    }
    if (!aLeve) {
      throw new Error("Autotest audit : format osv-scanner.toml invalide non rejeté.");
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === CHEMIN_COURANT) {
  autoVerifierLogiqueAudit();
  const rapportProd = executerNpmAudit(["--omit=dev"]);
  const rapportComplet = executerNpmAudit([]);
  const contenuOsv = readFileSync(CHEMIN_OSV, "utf8");
  const verdict = evaluerConformiteAudit(rapportProd, rapportComplet, contenuOsv);

  if (!verdict.conforme) {
    for (const err of verdict.erreurs) {
      console.error(`ÉCHEC : ${err}`);
    }
    process.exit(1);
  }

  console.log(
    `Audit npm conforme : 0 vulnérabilité d'exécution ; ${verdict.nbAvisTries} avis devDependencies trié(s) en parité avec osv-scanner.toml.`,
  );
}
