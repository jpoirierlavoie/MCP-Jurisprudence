/**
 * Enrichissement incrémental de `data/autorites-enrichies.json` depuis l'API REST de CanLII.
 *
 * Usage (clé personnelle CanLII dans `CANLII_API_KEY` ou `.dev.vars`) :
 *   node --env-file=.dev.vars scripts/enrich-authorities.mjs
 *   node scripts/enrich-authorities.mjs --force
 *
 * Politique de sobriété (§5, §16.2) :
 *   - 650 ms minimum entre deux appels CanLII, réessai exponentiel sur 429/5xx ;
 *   - ne journalise jamais `CANLII_API_KEY` (toute URL passe par `redactUrl`) ;
 *   - sauvegarde incrémentale après chaque décision pour reprise sans perte.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extraireFormesEtClef,
  parseAutoritesMarkdown,
  RACINE_DEPOT,
} from "./lib/parse-autorites-md.mjs";

export const CHEMIN_ENRICHIES = resolve(RACINE_DEPOT, "data/autorites-enrichies.json");

const BASE_API = "https://api.canlii.org/v1";
const MIN_INTERVAL_MS = 650;

const PAREN_VERS_DB = {
  "CA/CSC": "csc-scc",
  "CA/SCC": "csc-scc",
  "CA/CAF": "fca",
  "CA/FCA": "fca",
  "CA/FCTAD": "fca",
  "CA/CF": "fct",
  "CA/FC": "fct",
  "CA/FCT": "fct",
  "CA/FCTTD": "fct",
  "CA/CFPI": "fct",
  "QC/CA": "qcca",
  "QC/CS": "qccs",
  "QC/CQ": "qccq",
  "QC/TDP": "qctdp",
  "QC/TP": "qctp",
  "BC/CA": "bcca",
  "YK/CA": "ykca",
  "UK/JCPC": "ukpc",
};

const NEUTRE_VERS_CANLII = {
  CSC: { db: "csc-scc", frag: "scc" },
  SCC: { db: "csc-scc", frag: "scc" },
  CAF: { db: "fca", frag: "caf" },
  FCA: { db: "fca", frag: "fca" },
  CF: { db: "fct", frag: "cf" },
  FC: { db: "fct", frag: "fc" },
  FCT: { db: "fct", frag: "fct" },
  CFPI: { db: "fct", frag: "cfpi" },
  QCCA: { db: "qcca", frag: "qcca" },
  QCCS: { db: "qccs", frag: "qccs" },
  QCCQ: { db: "qccq", frag: "qccq" },
  QCTP: { db: "qctp", frag: "qctp" },
  QCTDP: { db: "qctdp", frag: "qctdp" },
  QCCLP: { db: "qcclp", frag: "qcclp" },
  QCCRT: { db: "qccrt", frag: "qccrt" },
  QCBDRVM: { db: "qcbdrvm", frag: "qcbdrvm" },
  QCBDR: { db: "qcbdrvm", frag: "qcbdr" },
  QCTMF: { db: "qcbdrvm", frag: "qctmf" },
  BCCA: { db: "bcca", frag: "bcca" },
  YKCA: { db: "ykca", frag: "ykca" },
};

const URL_CANLII_SEG =
  /canlii\.org\/(?:fr|en)\/([a-z]{2})\/([a-z0-9-]+)\/doc\/\d{4}\/(\d{4}[a-z0-9-]+)\//i;

function redactUrl(url) {
  return String(url).replace(/([?&]api_key=)[^&\s]+/gi, "$1***");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extraireIdDeUrl(url) {
  const m = URL_CANLII_SEG.exec(url);
  if (!m) return null;
  const [, juris, seg, caseId] = m;
  const map = {
    "ca/csc": "csc-scc",
    "ca/scc": "csc-scc",
    "ca/caf": "fca",
    "ca/fca": "fca",
    "ca/fct": "fct",
    "ca/cf": "fct",
    "ca/cfpi": "fct",
    "qc/qcca": "qcca",
    "qc/qccs": "qccs",
    "qc/qccq": "qccq",
    "qc/qctdp": "qctdp",
    "qc/qctp": "qctp",
    "bc/bcca": "bcca",
    "yk/ykca": "ykca",
  };
  const db = map[`${juris.toLowerCase()}/${seg.toLowerCase()}`];
  return db ? { db, caseId: caseId.toLowerCase() } : null;
}

class ClientDirect {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.lastAt = 0;
    this.intervalMs = MIN_INTERVAL_MS;
  }

  async get(path, params = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    qs.set("api_key", this.apiKey);
    const url = `${BASE_API}/${path}?${qs.toString()}`;

    for (let essai = 1; essai <= 4; essai++) {
      const wait = this.intervalMs - (Date.now() - this.lastAt);
      if (wait > 0) await sleep(wait);
      this.lastAt = Date.now();
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) {
        this.intervalMs = Math.min(4000, this.intervalMs * 2);
        await sleep(2000 * essai);
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} sur ${redactUrl(url)}`);
      }
      return await res.json();
    }
    throw new Error(`Échec après réessais sur ${redactUrl(url)}`);
  }
}

function normaliserKeywords(kw) {
  if (!kw) return null;
  if (Array.isArray(kw)) {
    return kw
      .map((s) => String(s).trim())
      .filter(Boolean)
      .join(" — ");
  }
  return String(kw).trim() || null;
}

function construireFiche(key, metaFr, metaEn, db, cid) {
  const titreFr = metaFr?.title ?? null;
  const titreEn = metaEn?.title ?? null;
  const citationFr = metaFr?.citation ?? null;
  const citationEn = metaEn?.citation ?? null;

  const neutresFr = citationFr ? extraireFormesEtClef(citationFr).neutralMatches : [];
  const neutresEn = citationEn ? extraireFormesEtClef(citationEn).neutralMatches : [];
  const canliiFr = citationFr ? extraireFormesEtClef(citationFr).canliiMatches : [];
  const canliiEn = citationEn ? extraireFormesEtClef(citationEn).canliiMatches : [];
  const repAll = [
    ...(citationFr ? extraireFormesEtClef(citationFr).reporterMatches : []),
    ...(citationEn ? extraireFormesEtClef(citationEn).reporterMatches : []),
  ];
  const pubAll = [
    ...(citationFr ? extraireFormesEtClef(citationFr).publisherMatches : []),
    ...(citationEn ? extraireFormesEtClef(citationEn).publisherMatches : []),
  ];

  return {
    key,
    status: "canlii",
    database_id: db,
    case_id: cid,
    decision_date: metaFr?.decisionDate ?? metaEn?.decisionDate ?? null,
    docket_number: metaFr?.docketNumber ?? metaEn?.docketNumber ?? null,
    title_fr: titreFr,
    title_en: titreEn,
    url_fr: metaFr?.url ?? null,
    url_en: metaEn?.url ?? null,
    citation_fr: citationFr,
    citation_en: citationEn,
    neutral_fr: neutresFr[0]?.raw ?? null,
    neutral_en: neutresEn[0]?.raw ?? null,
    canlii_cite: canliiFr[0]?.raw ?? canliiEn[0]?.raw ?? null,
    reporters: [...new Set(repAll.map((r) => r.raw))],
    publishers: [...new Set(pubAll.map((p) => p.raw))],
    keywords_fr: normaliserKeywords(metaFr?.keywords),
    keywords_en: normaliserKeywords(metaEn?.keywords),
  };
}

function lireSidecar() {
  if (!existsSync(CHEMIN_ENRICHIES)) {
    return { generatedAt: new Date().toISOString().slice(0, 10), decisions: {} };
  }
  return JSON.parse(readFileSync(CHEMIN_ENRICHIES, "utf8"));
}

function sauverSidecar(data) {
  data.generatedAt = new Date().toISOString().slice(0, 10);
  const trie = {};
  for (const k of Object.keys(data.decisions).sort()) {
    trie[k] = data.decisions[k];
  }
  data.decisions = trie;
  writeFileSync(CHEMIN_ENRICHIES, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function executer() {
  const force = process.argv.includes("--force");
  const apiKey = (process.env.CANLII_API_KEY ?? "").trim();
  if (!apiKey) {
    console.error("CANLII_API_KEY absente de l'environnement (.dev.vars ou export).");
    process.exit(1);
  }

  const client = new ClientDirect(apiKey);
  const { lists } = parseAutoritesMarkdown();
  const sidecar = lireSidecar();

  const cibles = new Map();
  for (const l of lists) {
    for (const e of l.entries) {
      if (!cibles.has(e.decisionKey)) {
        cibles.set(e.decisionKey, {
          key: e.decisionKey,
          text: e.cleanText,
          formes: e.formes,
          urls: e.sourceUrls,
        });
      }
      if (e.affirming && !cibles.has(e.affirming.decisionKey)) {
        cibles.set(e.affirming.decisionKey, {
          key: e.affirming.decisionKey,
          text: e.affirming.rawText,
          formes: e.affirming.formes,
          urls: e.sourceUrls,
        });
      }
    }
  }

  let ajouts = 0;
  for (const [key, item] of cibles.entries()) {
    if (!force && sidecar.decisions[key]?.status === "canlii") continue;

    // 1. Hors juridiction canadienne (Cour suprême des États-Unis)
    if (item.formes.reporterMatches.some((r) => /U\.?\s*S\.?/i.test(r.reporter))) {
      sidecar.decisions[key] = {
        key,
        status: "hors_juridiction",
        database_id: null,
        case_id: null,
        decision_date: null,
        docket_number: null,
        title_fr: null,
        title_en: item.text.split(",")[0]?.trim() ?? null,
        url_fr: null,
        url_en: null,
        citation_fr: null,
        citation_en: item.text,
        neutral_fr: null,
        neutral_en: null,
        canlii_cite: null,
        reporters: item.formes.reporterMatches.map((r) => r.raw),
        publishers: [],
        keywords_fr: null,
        keywords_en: null,
      };
      sauverSidecar(sidecar);
      continue;
    }

    let cible = null;
    for (const u of item.urls) {
      const extr = extraireIdDeUrl(u);
      if (extr) {
        cible = extr;
        break;
      }
    }

    if (!cible && item.formes.neutralMatches.length > 0) {
      const n = item.formes.neutralMatches[0];
      const map = NEUTRE_VERS_CANLII[n.code];
      if (map) {
        cible = { db: map.db, caseId: `${n.year}${map.frag}${n.number}` };
      }
    }

    if (!cible && item.formes.canliiMatches.length > 0) {
      const c = item.formes.canliiMatches[0];
      const mParen = /\(\s*([A-Z]{2})\s+([A-Z.]+)\s*\)/i.exec(c.raw);
      if (mParen) {
        const db =
          PAREN_VERS_DB[`${mParen[1].toUpperCase()}/${mParen[2].replace(/\./g, "").toUpperCase()}`];
        if (db) cible = { db, caseId: `${c.year}canlii${c.number}` };
      }
    }

    if (!cible) {
      console.log(`À résoudre manuellement / par balayage : ${key} — ${item.text}`);
      continue;
    }

    const [metaFr, metaEn] = [
      await client.get(`caseBrowse/fr/${cible.db}/${cible.caseId}/`),
      await client.get(`caseBrowse/en/${cible.db}/${cible.caseId}/`),
    ];
    if (!metaFr && !metaEn) {
      console.log(`404 sur ${cible.db}/${cible.caseId} pour ${key}`);
      continue;
    }

    sidecar.decisions[key] = construireFiche(key, metaFr, metaEn, cible.db, cible.caseId);
    sauverSidecar(sidecar);
    ajouts++;
    console.log(`[${ajouts}] ${key} -> ${cible.db}/${cible.caseId}`);
  }

  console.log(`Enrichissement terminé : ${ajouts} fiche(s) ajoutée(s) ou mise(s) à jour.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  executer().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
