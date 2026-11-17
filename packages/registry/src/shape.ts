/**
 * One description of a document, used for two jobs: validating a value, and
 * emitting the JSON Schema that the value is published against.
 *
 * That is why this file exists instead of a schema validator from npm. The
 * registry promises that it validates against its own **published** schema. A
 * hand-written schema beside a hand-written validator can drift apart. Here
 * `jsonSchema()` and `validate()` read the same object, so a consumer checking
 * the published schema and this repo checking itself always get the same
 * answer.
 *
 * The supported subset is deliberately small: only the shapes a generated
 * catalogue takes. If the registry needs something this cannot express, widen
 * this file. A general-purpose validator would be a dependency that is mostly
 * unused and would have to justify itself. The repo takes mechanics from
 * dependencies but owns its decisions, and a schema is a decision.
 */

export type Shape =
  | { kind: 'string'; description?: string; enum?: readonly string[]; pattern?: string }
  | { kind: 'number'; description?: string; integer?: true }
  | { kind: 'boolean'; description?: string }
  | { kind: 'array'; description?: string; of: Shape }
  | { kind: 'object'; description?: string; fields: Record<string, Shape>; optional?: string[] }
  /** An object whose *keys* are data: a map from a name to a value. */
  | { kind: 'record'; description?: string; of: Shape }
  | { kind: 'nullable'; of: Shape }
  /**
   * One of several shapes. Screen specs need it because a prop value can be a
   * string, a number, a binding, an element or a list of them, and a single
   * object shape cannot express that.
   *
   * The members are expected to be **disjoint**. Every object member of a union
   * in this repository has a required discriminator key, so a mistyped
   * `component` is a hard error instead of a value that silently matches the
   * loosest branch.
   */
  | { kind: 'union'; description?: string; of: Shape[] }
  /**
   * A named shape, resolved against the definitions in scope. Screen specs need
   * it for recursion: an element tree contains element trees, and only a shape
   * that can refer to itself can describe one.
   */
  | { kind: 'ref'; name: string }
  /** Definitions plus the shape that uses them. The root of a recursive schema. */
  | { kind: 'defs'; description?: string; defs: Record<string, Shape>; of: Shape }

/* -------------------------------------------------------------------------- */
/* Constructors — terse enough that a schema reads as the document it describes */
/* -------------------------------------------------------------------------- */

export const str = (
  options: { description?: string; enum?: readonly string[]; pattern?: string } = {},
): Shape => ({ kind: 'string', ...options })

export const num = (options: { description?: string; integer?: true } = {}): Shape => ({
  kind: 'number',
  ...options,
})

export const bool = (options: { description?: string } = {}): Shape => ({
  kind: 'boolean',
  ...options,
})

export const arr = (of: Shape, options: { description?: string } = {}): Shape => ({
  kind: 'array',
  of,
  ...options,
})

export const rec = (of: Shape, options: { description?: string } = {}): Shape => ({
  kind: 'record',
  of,
  ...options,
})

export const nullable = (of: Shape): Shape => ({ kind: 'nullable', of })

export const obj = (
  fields: Record<string, Shape>,
  options: { description?: string; optional?: string[] } = {},
): Shape => ({ kind: 'object', fields, ...options })

export const union = (of: Shape[], options: { description?: string } = {}): Shape => ({
  kind: 'union',
  of,
  ...options,
})

export const ref = (name: string): Shape => ({ kind: 'ref', name })

export const defs = (
  definitions: Record<string, Shape>,
  of: Shape,
  options: { description?: string } = {},
): Shape => ({ kind: 'defs', defs: definitions, of, ...options })

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Returns every way `value` fails `shape`, as sentences with a path.
 *
 * It returns all faults, not only the first, so a generator with three wrong
 * fields learns about all three in one run.
 */
export function validate(
  shape: Shape,
  value: unknown,
  path = '$',
  scope: Record<string, Shape> = {},
): string[] {
  switch (shape.kind) {
    case 'nullable':
      return value === null ? [] : validate(shape.of, value, path, scope)

    case 'defs':
      return validate(shape.of, value, path, { ...scope, ...shape.defs })

    case 'ref': {
      // Own definitions only: `scope` is a plain object, so a `ref` named
      // `toString` would otherwise resolve to the prototype's function.
      const target = Object.hasOwn(scope, shape.name) ? scope[shape.name] : undefined
      if (!target) return [`${path}: no definition named ${shape.name}`]
      return validate(target, value, path, scope)
    }

    /*
     * Returns the faults of one branch only. Otherwise a union of five shapes
     * would report one typo as five contradictory faults.
     *
     * The branch is the one the value was written as. An object is judged as
     * the object member whose required keys it has, and a list as the list
     * member, so the faults are about what the author wrote: an element with a
     * misspelt field is reported at that field. An object that has no member's
     * required key is reported once, with the keys an object may have here.
     * Any other value is reported by the branch with the fewest faults.
     */
    case 'union': {
      const attempts = shape.of.map((member) => validate(member, value, path, scope))
      if (attempts.some((faults) => faults.length === 0)) return []
      const kinds = shape.of.map((member) => resolved(member, scope))
      const fewest = (candidates: string[][]) =>
        [...candidates].sort((a, b) => a.length - b.length)[0]
      const ofKind = (kind: Shape['kind']) =>
        attempts.filter((_, index) => kinds[index]?.kind === kind)

      if (isPlainObject(value) && ofKind('record').length === 0) {
        const objects = kinds.flatMap((member, index) =>
          member?.kind === 'object'
            ? [{ keys: requiredKeys(member), faults: attempts[index] }]
            : [],
        )
        const written = objects.filter(({ keys }) => keys.some((key) => Object.hasOwn(value, key)))
        const faults = fewest(written.flatMap((member) => (member.faults ? [member.faults] : [])))
        if (faults !== undefined) return faults
        if (objects.length > 0) {
          const own = Object.keys(value)
          return [
            `${path}: an object here has ${listed(
              objects.map(({ keys }) => keys.join('` and `')),
              'or',
            )}, ` + `and this one has ${own.length === 0 ? 'no keys' : listed(own, 'and')}`,
          ]
        }
      }
      if (Array.isArray(value)) {
        const faults = fewest(ofKind('array'))
        if (faults !== undefined) return faults
      }
      return fewest(attempts) ?? [`${path}: matches none of the allowed shapes`]
    }

    case 'string': {
      if (typeof value !== 'string') return [`${path}: expected a string, got ${typeOf(value)}`]
      if (shape.enum && !shape.enum.includes(value)) {
        return [`${path}: "${value}" is not one of ${shape.enum.join(' | ')}`]
      }
      if (shape.pattern !== undefined && !new RegExp(shape.pattern).test(value)) {
        return [`${path}: "${value}" does not match /${shape.pattern}/`]
      }
      return []
    }

    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return [`${path}: expected a number, got ${typeOf(value)}`]
      }
      if (shape.integer === true && !Number.isInteger(value)) {
        return [`${path}: expected an integer, got ${value}`]
      }
      return []
    }

    case 'boolean':
      return typeof value === 'boolean' ? [] : [`${path}: expected a boolean, got ${typeOf(value)}`]

    case 'array': {
      if (!Array.isArray(value)) return [`${path}: expected an array, got ${typeOf(value)}`]
      return value.flatMap((item, index) => validate(shape.of, item, `${path}[${index}]`, scope))
    }

    case 'record': {
      if (!isPlainObject(value)) return [`${path}: expected an object, got ${typeOf(value)}`]
      return Object.entries(value).flatMap(([key, item]) =>
        validate(shape.of, item, `${path}.${key}`, scope),
      )
    }

    case 'object': {
      if (!isPlainObject(value)) return [`${path}: expected an object, got ${typeOf(value)}`]
      const optional = new Set(shape.optional ?? [])
      const faults: string[] = []

      // Both checks read own keys only. A JSON object's members are its own keys,
      // and nothing in a document lives on the prototype. `in` would walk the
      // prototype, so a document key named `toString` or `constructor` would count
      // as declared, and a schema field with such a name would count as present
      // when it is absent.
      for (const [key, field] of Object.entries(shape.fields)) {
        if (!Object.hasOwn(value, key)) {
          if (!optional.has(key)) faults.push(`${path}.${key}: missing`)
          continue
        }
        faults.push(...validate(field, value[key], `${path}.${key}`, scope))
      }

      // Unknown keys are a fault. Agents read the registry and trust every field
      // in it, and a field the schema does not describe carries no promise that
      // it will stay. The fault names the fields the object does have, so
      // its author can tell which one was meant.
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(shape.fields, key)) {
          const fields = Object.keys(shape.fields)
          faults.push(
            `${path}.${key}: \`${key}\` is not in the schema — ` +
              (fields.length === 0
                ? 'there are no fields here'
                : `the fields here are ${listed(fields, 'and')}`),
          )
        }
      }
      return faults
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  return typeof value === 'object' ? 'an object' : `a ${typeof value}`
}

/** The shape a union member stands for: a reference followed, and `nullable` and `defs` opened. */
function resolved(shape: Shape, scope: Record<string, Shape>): Shape | undefined {
  switch (shape.kind) {
    case 'ref': {
      const target = Object.hasOwn(scope, shape.name) ? scope[shape.name] : undefined
      return target === undefined ? undefined : resolved(target, scope)
    }
    case 'nullable':
      return resolved(shape.of, scope)
    case 'defs':
      return resolved(shape.of, { ...scope, ...shape.defs })
    default:
      return shape
  }
}

/** The keys an object shape cannot be without. */
function requiredKeys(shape: Extract<Shape, { kind: 'object' }>): string[] {
  const optional = new Set(shape.optional ?? [])
  return Object.keys(shape.fields).filter((key) => !optional.has(key))
}

/** `a`, `b` and `c`, each as code. */
function listed(names: readonly string[], joiner: 'and' | 'or'): string {
  const quoted = names.map((name) => `\`${name}\``)
  const last = quoted.pop() ?? ''
  return quoted.length === 0 ? last : `${quoted.join(', ')} ${joiner} ${last}`
}

/* -------------------------------------------------------------------------- */
/* Projection to JSON Schema                                                  */
/* -------------------------------------------------------------------------- */

export interface JsonSchema {
  [key: string]: unknown
}

/**
 * The same shape as JSON Schema 2020-12. It is published beside the registry
 * so a consumer can check it with whatever validator they already have.
 *
 * Every object gets `additionalProperties: false`, matching the unknown-key
 * fault above. Both checks must agree on whether a document is lawful.
 * Otherwise the published schema would give a different answer from `validate`.
 */
export function jsonSchema(shape: Shape): JsonSchema {
  switch (shape.kind) {
    case 'nullable': {
      const inner = jsonSchema(shape.of)
      return { anyOf: [inner, { type: 'null' }] }
    }
    case 'string':
      return {
        type: 'string',
        ...described(shape.description),
        ...(shape.enum ? { enum: [...shape.enum] } : {}),
        ...(shape.pattern === undefined ? {} : { pattern: shape.pattern }),
      }
    case 'number':
      return {
        type: shape.integer === true ? 'integer' : 'number',
        ...described(shape.description),
      }
    case 'boolean':
      return { type: 'boolean', ...described(shape.description) }
    case 'array':
      return { type: 'array', ...described(shape.description), items: jsonSchema(shape.of) }
    case 'record':
      return {
        type: 'object',
        ...described(shape.description),
        additionalProperties: jsonSchema(shape.of),
      }
    case 'object': {
      const optional = new Set(shape.optional ?? [])
      const keys = Object.keys(shape.fields)
      return {
        type: 'object',
        ...described(shape.description),
        properties: Object.fromEntries(
          keys.map((key) => [key, jsonSchema(shape.fields[key] as Shape)]),
        ),
        required: keys.filter((key) => !optional.has(key)),
        additionalProperties: false,
      }
    }

    case 'union':
      return { ...described(shape.description), anyOf: shape.of.map(jsonSchema) }

    // `$defs` and `$ref` are JSON Schema's own names for the same idea, so a
    // consumer's validator resolves a recursive spec without extra support.
    case 'ref':
      return { $ref: `#/$defs/${shape.name}` }

    case 'defs':
      return {
        ...described(shape.description),
        ...jsonSchema(shape.of),
        $defs: Object.fromEntries(
          Object.entries(shape.defs).map(([name, definition]) => [name, jsonSchema(definition)]),
        ),
      }
  }
}

function described(description: string | undefined): JsonSchema {
  return description === undefined ? {} : { description }
}
