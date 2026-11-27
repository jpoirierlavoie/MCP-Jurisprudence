import { entier } from "../config";
import { CanliiBudgetError, CanliiError, CanliiTimeoutError } from "./errors";
import type { CanliiErrorBody } from "./types";

const BASE = "https://api.canlii.org/v1";

const RETRIABLE = new Set([429, 500, 502, 503, 504]);

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 500;
const JITTER_MS = 200;

const THROTTLE_BACKOFF_MS = 2000;

const MAX_INTERVAL_MS = 4000;

const PLAFOND_CORPS_CARACTERES = 12_000_000;

export interface CanliiUsage {
  calls: number;
  throttled: number;
}

export interface CanliiClient {
  get<T>(path: string, params?: Record<string, string | number>): Promise<T>;
  callsMade(): number;
  remaining(): number;
  usage(): CanliiUsage;
}

interface ClientConfig {
  apiKey: string;
  minIntervalMs: number;
  maxCalls: number;
  timeoutMs: number;
  corpsMaxChars: number;
}

interface ClientSeams {
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  jitterImpl?: () => number;
}

function configFromEnv(env: Env): ClientConfig {
  return {
    apiKey: env.CANLII_API_KEY ?? "",
    minIntervalMs: entier(env.CANLII_MIN_INTERVAL_MS, 600),
    maxCalls: entier(env.CANLII_MAX_CALLS_PER_INVOCATION, 40),
    timeoutMs: entier(env.CANLII_TIMEOUT_MS, 15000),
    corpsMaxChars: PLAFOND_CORPS_CARACTERES,
  };
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function parseRetryAfter(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - now);
  return null;
}

class Client implements CanliiClient {
  #calls = 0;
  #throttled = 0;
  #lastCallAt = 0;
  #intervalMs: number;

  readonly #cfg: ClientConfig;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #jitter: () => number;

  constructor(cfg: ClientConfig, seams: ClientSeams = {}) {
    this.#cfg = cfg;
    this.#intervalMs = cfg.minIntervalMs;
    this.#fetch = seams.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.#sleep = seams.sleepImpl ?? defaultSleep;
    this.#jitter = seams.jitterImpl ?? (() => Math.random() * JITTER_MS);
  }

  callsMade(): number {
    return this.#calls;
  }

  remaining(): number {
    return Math.max(0, this.#cfg.maxCalls - this.#calls);
  }

  usage(): CanliiUsage {
    return { calls: this.#calls, throttled: this.#throttled };
  }

  #url(
    path: string,
    params: Record<string, string | number>,
    resultCountOverride?: number,
  ): string {
    const clean = path.replace(/^\/+/, "");
    const url = new URL(`${BASE}/${clean}`);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(
        k,
        String(k === "resultCount" && resultCountOverride ? resultCountOverride : v),
      );
    }
    url.searchParams.set("api_key", this.#cfg.apiKey);
    return url.toString();
  }

  async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    if (this.#calls >= this.#cfg.maxCalls) {
      throw new CanliiBudgetError(this.#calls, this.#cfg.maxCalls);
    }

    return await this.#attemptWithHalving<T>(path, params);
  }

  async #attemptWithHalving<T>(path: string, params: Record<string, string | number>): Promise<T> {
    try {
      return await this.#request<T>(path, params);
    } catch (err) {
      const tropGros =
        err instanceof CanliiError &&
        (err.code === "TOO_LONG" || err.code === "CORPS_HORS_PLAFOND");
      const count = Number(params.resultCount);
      if (!tropGros || !Number.isFinite(count) || count <= 1) throw err;
      const halved = Math.max(1, Math.floor(count / 2));
      return await this.#request<T>(path, { ...params, resultCount: halved });
    }
  }

  async #request<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const url = this.#url(path, params);
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (this.#calls >= this.#cfg.maxCalls) {
        throw new CanliiBudgetError(this.#calls, this.#cfg.maxCalls);
      }
      await this.#throttle();

      let response: Response;
      this.#calls++;
      this.#lastCallAt = Date.now();
      try {
        response = await this.#fetch(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(this.#cfg.timeoutMs),
        });
      } catch (err) {
        lastError =
          err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")
            ? new CanliiTimeoutError(url, this.#cfg.timeoutMs)
            : err;
        if (attempt === MAX_ATTEMPTS - 1) throw lastError;
        await this.#backoff(attempt, null);
        continue;
      }

      if (response.status === 429) {
        this.#throttled++;
        this.#intervalMs = Math.min(this.#intervalMs * 2, MAX_INTERVAL_MS);
      }

      if (RETRIABLE.has(response.status)) {
        const body = (await this.#corps(response)) ?? "";
        lastError = new CanliiError(response.status, url, body);
        if (attempt === MAX_ATTEMPTS - 1) throw lastError;
        await this.#backoff(
          attempt,
          parseRetryAfter(response.headers.get("Retry-After")),
          response.status === 429,
        );
        continue;
      }

      if (!response.ok) {
        const body = (await this.#corps(response)) ?? "";
        throw new CanliiError(response.status, url, body, extractErrorCode(body));
      }

      const text = await this.#corps(response);
      if (text === null) {
        throw new CanliiError(response.status, url, "", "CORPS_INTERROMPU");
      }
      if (text.length > this.#cfg.corpsMaxChars) {
        throw new CanliiError(response.status, url, "", "CORPS_HORS_PLAFOND");
      }
      const parsed = safeJson(text);
      if (parsed === undefined) {
        throw new CanliiError(response.status, url, text, "REPONSE_ILLISIBLE");
      }
      const code = errorCodeOf(parsed);
      if (code) throw new CanliiError(response.status, url, text, code);
      return parsed as T;
    }

    throw lastError ?? new CanliiError(0, url, "échec inconnu");
  }

  async #throttle(): Promise<void> {
    if (this.#lastCallAt === 0) return;
    const waited = Date.now() - this.#lastCallAt;
    if (waited < this.#intervalMs) {
      await this.#sleep(this.#intervalMs - waited);
    }
  }

  async #backoff(attempt: number, retryAfterMs: number | null, etrangle = false): Promise<void> {
    const base = etrangle ? THROTTLE_BACKOFF_MS : BACKOFF_BASE_MS;
    const ms = retryAfterMs !== null ? retryAfterMs : base * 2 ** attempt + this.#jitter();
    await this.#sleep(ms);
  }

  async #corps(response: Response): Promise<string | null> {
    try {
      return await response.text();
    } catch {
      return null;
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function errorCodeOf(parsed: unknown): string | null {
  if (parsed && typeof parsed === "object") {
    const err = (parsed as CanliiErrorBody).error;
    if (typeof err === "string" && err.length > 0) return err;
  }
  return null;
}

function extractErrorCode(body: string): string | null {
  return errorCodeOf(safeJson(body));
}

function jetonApplicatif(code: string | null): string | null {
  if (!code) return null;
  return /^[A-Z][A-Z0-9_]{0,39}$/.test(code) ? code : null;
}

export function createClient(
  env: Env,
  seams: ClientSeams = {},
  overrides: Partial<ClientConfig> = {},
): CanliiClient {
  return new Client({ ...configFromEnv(env), ...overrides }, seams);
}

type CauseCanlii =
  | "AUTHENTIFICATION_REFUSEE"
  | "ETRANGLEMENT"
  | "EXPIRATION"
  | "PANNE_AMONT"
  | "REPONSE_TROP_VOLUMINEUSE"
  | "REPONSE_INEXPLOITABLE"
  | "BUDGET_EPUISE"
  | "INTROUVABLE_404";

interface ErreurDecrite {
  readonly cause: CauseCanlii;
  readonly phrase: string;
}

const PHRASE_ILLISIBLE =
  "CanLII a répondu (HTTP 200) mais son corps n'est pas du JSON : la réponse n'a pas pu " +
  "être LUE, et rien n'en a donc été constaté. Réessayer plus tard.";

const PHRASE_INTERROMPU =
  "La lecture de la réponse de CanLII a été INTERROMPUE avant la fin : la réponse reçue " +
  "est incomplète et n'a pas pu être analysée. Rien n'en a été constaté. Réessayer plus tard.";

const PHRASE_HORS_PLAFOND =
  "Réponse de CanLII au-delà du plafond de sécurité du connecteur (12 Mo ; l'API en " +
  "annonce 10) : elle a été REFUSÉE en entier plutôt que tronquée, une réponse coupée " +
  "n'étant plus analysable. Resserrer la demande si l'outil offre une pagination.";

const PHRASE_TOO_LONG =
  "CanLII a refusé de servir cette réponse : elle dépasse son plafond de charge utile de " +
  "10 Mo (« TOO_LONG »). Resserrer la demande — fenêtre de dates plus étroite, ou " +
  "pagination plus petite lorsque l'outil en offre une.";

const phraseCodeConnu = (jeton: string) =>
  `CanLII a répondu (HTTP 200) en signalant l'erreur applicative « ${jeton} » : aucune ` +
  "donnée n'accompagne ce signalement, et rien n'a donc été constaté. Réessayer plus tard.";

const PHRASE_CODE_INCONNU =
  "CanLII a répondu (HTTP 200) en signalant une erreur applicative que ce connecteur ne " +
  "sait pas nommer. Aucune donnée n'a été rendue, et rien n'a donc été constaté. " +
  "Réessayer plus tard.";

const PHRASE_SANS_REPONSE =
  "Aucune réponse de CanLII après trois tentatives : le service n'a rien renvoyé. " +
  "Réessayer plus tard.";

export function analyserErreur(err: unknown): ErreurDecrite {
  if (err instanceof CanliiBudgetError) {
    return {
      cause: "BUDGET_EPUISE",
      phrase: `Budget d'appels épuisé (${err.callsMade}/${err.budget}) — résultat partiel.`,
    };
  }
  if (err instanceof CanliiTimeoutError) {
    return {
      cause: "EXPIRATION",
      phrase: "Délai d'expiration dépassé en interrogeant CanLII. Réessayer plus tard.",
    };
  }
  if (err instanceof CanliiError) {
    switch (err.code) {
      case "TOO_LONG":
        return { cause: "REPONSE_TROP_VOLUMINEUSE", phrase: PHRASE_TOO_LONG };
      case "CORPS_HORS_PLAFOND":
        return { cause: "REPONSE_TROP_VOLUMINEUSE", phrase: PHRASE_HORS_PLAFOND };
      case "REPONSE_ILLISIBLE":
        return { cause: "REPONSE_INEXPLOITABLE", phrase: PHRASE_ILLISIBLE };
      case "CORPS_INTERROMPU":
        return { cause: "REPONSE_INEXPLOITABLE", phrase: PHRASE_INTERROMPU };
    }

    switch (err.status) {
      case 401:
      case 403:
        return {
          cause: "AUTHENTIFICATION_REFUSEE",
          phrase:
            "CanLII a refusé la clef d'API (401/403). Mettre à jour la clef dans https://acces.poirierlavoie.ca/moi ou vérifier l'en-tête X-Clef-CanLII.",
        };
      case 404:
        return {
          cause: "INTROUVABLE_404",
          phrase: "Aucune fiche à cette adresse dans la collection de CanLII (404).",
        };
      case 429:
        return {
          cause: "ETRANGLEMENT",
          phrase: "CanLII a étranglé les appels (429). Réessayer plus tard.",
        };
      default:
        if (err.status >= 200 && err.status < 300) {
          const jeton = jetonApplicatif(err.code);
          return {
            cause: "REPONSE_INEXPLOITABLE",
            phrase: jeton ? phraseCodeConnu(jeton) : PHRASE_CODE_INCONNU,
          };
        }
        if (err.status === 0) {
          return { cause: "PANNE_AMONT", phrase: PHRASE_SANS_REPONSE };
        }
        return { cause: "PANNE_AMONT", phrase: `CanLII a renvoyé une erreur ${err.status}.` };
    }
  }
  return { cause: "PANNE_AMONT", phrase: "Erreur inattendue en interrogeant CanLII." };
}

export function describeError(err: unknown): string {
  return analyserErreur(err).phrase;
}
