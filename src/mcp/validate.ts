/**
 * Validateur JSON-Schema en SOUS-ENSEMBLE (spécification §8).
 *
 * Port TypeScript de `validate_args` (athena/mcp/tools.py:110-205) : même
 * sous-ensemble de mots-clefs, mêmes messages, traduits en français.
 *
 * Mots-clefs pris en charge : `type` (object, string, integer, number, boolean,
 * array), `properties`, `required`, `enum`, `minimum`, `maximum`, `minLength`,
 * `maxLength`, `minItems`, `maxItems`, `items`, `additionalProperties: false`.
 *
 * ⚠ `items` était annoncé « un niveau » ; il est en réalité RÉCURSIF sans borne —
 *   `validateValue` se rappelle sur chaque élément, et un élément objet fait à son tour
 *   valider ses propriétés. C'est ce qui permet aux vingt-cinq entrées de
 *   `jurisprudence_verify_citations` d'être validées champ par champ. La mention « un
 *   niveau » sous-estimait donc le validateur, et aurait pu faire renoncer à un schéma
 *   imbriqué parfaitement supporté. Corrigé le 2026-09-16.
 *
 * ⚠ CE QU'IL NE SAIT PAS IMPOSER, et qu'il ne faut donc pas déclarer : `pattern`,
 *   `oneOf`/`anyOf`, `format`, et toute contrainte ENTRE champs — `validateValue` ne
 *   voit jamais le parent. `JsonSchema` est une interface FERMÉE : déclarer un mot-clef
 *   non implémenté ne compile pas, et c'est délibéré. Les règles hors de portée
 *   s'écrivent dans la `description` du paramètre (§8).
 *
 * ⚠ ASYMÉTRIE ASSUMÉE : `minLength` compte les caractères NON BLANCS (un titre fait
 *   d'espaces doit échouer au schéma, non plus bas dans un message qui a l'air d'une
 *   panne), là où `maxLength` compte la chaîne BRUTE. Ce n'est pas un oubli.
 *
 * Un tableau vide = valide. Écrire un validateur plutôt que d'ajouter une
 * dépendance est cohérent avec D2 (zéro dépendance d'exécution) : le sous-ensemble
 * couvre tous les schémas de §7, et rien de plus n'est nécessaire.
 */

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  items?: JsonSchema;
  additionalProperties?: boolean;
  description?: string;
  default?: unknown;
}

function typeOk(expected: string, value: unknown): boolean {
  switch (expected) {
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    default:
      return true;
  }
}

const NOM_TYPE: Record<string, string> = {
  object: "un objet",
  string: "une chaîne de caractères",
  integer: "un entier",
  number: "un nombre",
  boolean: "un booléen",
  array: "un tableau",
};

function validateValue(schema: JsonSchema, value: unknown, nom: string): string[] {
  const erreurs: string[] = [];

  if (schema.type !== undefined && !typeOk(schema.type, value)) {
    if (schema.type === "integer" && schema.minimum !== undefined && schema.maximum !== undefined) {
      erreurs.push(
        `« ${nom} » doit être un entier compris entre ${schema.minimum} et ${schema.maximum}.`,
      );
    } else {
      erreurs.push(`« ${nom} » doit être ${NOM_TYPE[schema.type] ?? schema.type}.`);
    }
    return erreurs;
  }

  if (schema.enum !== undefined && !schema.enum.includes(value as never)) {
    const permis = schema.enum.map((v) => JSON.stringify(v)).join(", ");
    erreurs.push(`« ${nom} » doit valoir l'une de ces valeurs : ${permis}.`);
    return erreurs;
  }

  // Un booléen est un cas clos : ni bornes, ni longueur, ni éléments.
  if (typeof value === "boolean") return erreurs;

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      erreurs.push(`« ${nom} » doit être supérieur ou égal à ${schema.minimum}.`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      erreurs.push(`« ${nom} » doit être inférieur ou égal à ${schema.maximum}.`);
    }
  }

  if (typeof value === "string") {
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      erreurs.push(`« ${nom} » doit compter au plus ${schema.maxLength} caractères.`);
    }
    if (schema.minLength !== undefined && value.trim().length < schema.minLength) {
      // Sur la longueur MINIMALE on compte les caractères non blancs : sinon un titre
      // fait d'espaces passe le schéma et échoue plus bas, dans un message qui a l'air
      // d'une panne du serveur.
      erreurs.push(`« ${nom} » doit compter au moins ${schema.minLength} caractères non blancs.`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      erreurs.push(`« ${nom} » doit contenir au moins ${schema.minItems} élément(s).`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      erreurs.push(`« ${nom} » doit contenir au plus ${schema.maxItems} élément(s).`);
    }
    if (schema.items !== undefined) {
      value.forEach((item, i) => {
        erreurs.push(...validateValue(schema.items!, item, `${nom}[${i}]`));
      });
    }
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const props = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const clef of Object.keys(obj)) {
        if (!(clef in props)) erreurs.push(`« ${clef} » n'est pas un argument reconnu.`);
      }
    }
    for (const clef of schema.required ?? []) {
      if (!(clef in obj)) erreurs.push(`« ${clef} » est obligatoire.`);
    }
    for (const [clef, sous] of Object.entries(props)) {
      if (clef in obj) erreurs.push(...validateValue(sous, obj[clef], clef));
    }
  }

  return erreurs;
}

/** Valide `args` contre `schema`. Tableau vide = valide. */
export function validateArgs(schema: JsonSchema, args: unknown): string[] {
  return validateValue(schema, args, "arguments");
}
