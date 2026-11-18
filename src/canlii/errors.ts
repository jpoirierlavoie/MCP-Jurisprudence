/**
 * Erreurs du client CanLII (spécification §5).
 *
 * Règle absolue (§5.3) : LA CLEF D'API NE DOIT JAMAIS QUITTER LE PROCESSUS.
 * Tout ce qui peut être journalisé passe par `redactUrl`, y compris les messages
 * d'erreur — une exception dont le `message` contient l'URL brute finirait dans
 * une trace `wrangler tail`, ce qui est exactement la fuite qu'on prétend éviter.
 */

/**
 * Remplace la clef d'API par `***` dans une URL.
 *
 * ⚠ Fonction de sécurité verrouillée par un test de non-régression
 *   (`test/client.test.ts`). Ne pas modifier sans le lire.
 */
export function redactUrl(u: string): string {
  try {
    const url = new URL(u);
    if (url.searchParams.has("api_key")) url.searchParams.set("api_key", "***");
    return url.toString();
  } catch {
    // Une chaîne qui n'est pas une URL valide ne doit surtout pas être renvoyée
    // telle quelle « au cas où » : elle pourrait être une URL presque valide
    // portant la clef. On préfère perdre l'information de diagnostic.
    return "<url illisible — redactée>";
  }
}

/** Tronque un corps de réponse pour la journalisation (§5.3 : 512 caractères). */
export function truncateBody(body: string, max = 512): string {
  return body.length <= max ? body : `${body.slice(0, max)}… (tronqué)`;
}

/** Échec d'un appel sortant vers l'API de CanLII. */
export class CanliiError extends Error {
  readonly status: number;
  /** Code applicatif renvoyé par l'API, p. ex. `TOO_LONG`. */
  readonly code: string | null;
  /** URL REDACTÉE — jamais l'URL brute. */
  readonly url: string;
  readonly body: string;

  constructor(status: number, url: string, body: string, code: string | null = null) {
    const redacted = redactUrl(url);
    super(`CanLII ${status} sur ${redacted}`);
    this.name = "CanliiError";
    this.status = status;
    this.code = code;
    this.url = redacted;
    this.body = truncateBody(body);
  }
}

/**
 * Plafond d'appels sortants atteint pour cette invocation d'outil.
 *
 * N'est PAS une erreur d'exécution rendue à l'usager : le gestionnaire l'attrape et
 * renvoie les résultats PARTIELS déjà obtenus, assortis d'une mention explicite
 * (§5.2). Une erreur sèche perdrait un travail déjà payé en appels réseau.
 */
export class CanliiBudgetError extends Error {
  readonly callsMade: number;
  readonly budget: number;

  constructor(callsMade: number, budget: number) {
    super(`Budget d'appels épuisé (${callsMade}/${budget}).`);
    this.name = "CanliiBudgetError";
    this.callsMade = callsMade;
    this.budget = budget;
  }
}

/** Délai d'expiration dépassé sur un appel sortant. */
export class CanliiTimeoutError extends Error {
  readonly url: string;

  constructor(url: string, ms: number) {
    super(`Délai d'expiration dépassé (${ms} ms) sur ${redactUrl(url)}`);
    this.name = "CanliiTimeoutError";
    this.url = redactUrl(url);
  }
}

/**
 * Interruption de gouverne levée par l'enveloppe d'exécution du Worker (`QUOTA_SORTANT_EPUISE`,
 * `CLEF_REFUSEE_AMONT`). Ne doit jamais être avalée ni convertie en `INDÉTERMINÉE` par un
 * gestionnaire d'outil : elle remonte directement au répartiteur afin d'avorter immédiatement
 * le lot en cours sans émettre d'appels supplémentaires vers CanLII.
 */
export class InterruptionGouverneError extends Error {
  readonly motif: "QUOTA_SORTANT_EPUISE" | "CLEF_REFUSEE_AMONT";

  constructor(motif: "QUOTA_SORTANT_EPUISE" | "CLEF_REFUSEE_AMONT") {
    super(motif);
    this.name = "InterruptionGouverneError";
    this.motif = motif;
  }
}

export function relancerSiInterruptionGouverne(err: unknown): void {
  if (err instanceof InterruptionGouverneError) {
    throw err;
  }
}
