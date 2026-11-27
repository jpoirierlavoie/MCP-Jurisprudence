interface BornesListe {
  readonly defaut: number;
  readonly max: number;
}

export const LIMITES = {
  find_case: { defaut: 10, max: 25 },
  citator: { defaut: 50, max: 100 },
  subsequent_history: { defaut: 20, max: 50 },
  browse_cases: { defaut: 25, max: 100 },
  browse_legislation: { defaut: 50, max: 100 },
  list_exempt_cases: { defaut: 50, max: 150 },
} as const satisfies Record<string, BornesListe>;

export const OFFSET_DEFAUT = 0;
export const OFFSET_MAX = 100000;
