export function redactUrl(u: string): string {
  try {
    const url = new URL(u);
    if (url.searchParams.has("api_key")) url.searchParams.set("api_key", "***");
    return url.toString();
  } catch {
    return "<url illisible — redactée>";
  }
}

function truncateBody(body: string, max = 512): string {
  return body.length <= max ? body : `${body.slice(0, max)}… (tronqué)`;
}

export class CanliiError extends Error {
  readonly status: number;
  readonly code: string | null;
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

export class CanliiTimeoutError extends Error {
  readonly url: string;

  constructor(url: string, ms: number) {
    super(`Délai d'expiration dépassé (${ms} ms) sur ${redactUrl(url)}`);
    this.name = "CanliiTimeoutError";
    this.url = redactUrl(url);
  }
}

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
