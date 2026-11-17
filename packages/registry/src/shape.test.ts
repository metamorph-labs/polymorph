import { describe, expect, it } from 'vitest'

import { arr, defs, jsonSchema, num, obj, rec, ref, str, union, validate } from './shape'

/**
 * The validator reads a document's own keys and nothing else.
 *
 * Every document it checks arrives parsed from JSON, whose objects have only the
 * members written in them. But the value is a JavaScript object, and `in` would
 * also find `toString`, `constructor` and the rest of `Object.prototype`. A
 * closed object that accepted those keys as declared would be open to exactly
 * the keys nobody tests, and a required field with such a name would never be
 * reported missing. These tests pin the own-key reading on both sides of the
 * check, and on the scope a `ref` resolves against.
 */

/** The keys a prototype walk finds on any object literal. */
const PROTOTYPE_KEYS = ['toString', 'constructor', 'hasOwnProperty', 'valueOf']

describe('a closed object rejects keys that exist on Object.prototype', () => {
  const binding = obj({ $: str() })

  it.each(PROTOTYPE_KEYS)('reports an unknown key named %s', (key) => {
    expect(validate(binding, { $: 'onSave', [key]: 'x' })).toEqual([
      `$.${key}: \`${key}\` is not in the schema — the fields here are \`$\``,
    ])
  })

  it('reports an own __proto__ key, the way JSON.parse writes one', () => {
    // An object literal with `__proto__:` sets the prototype. Only a parse
    // produces the own key that a document carries.
    const document: unknown = JSON.parse('{"$": "onSave", "__proto__": "x"}')
    expect(validate(binding, document)).toEqual([
      '$.__proto__: `__proto__` is not in the schema — the fields here are `$`',
    ])
  })
})

describe('a required field named like a prototype member', () => {
  const shape = obj({ toString: str(), valueOf: str() }, { optional: ['valueOf'] })

  it('is missing when the document lacks it', () => {
    expect(validate(shape, {})).toEqual(['$.toString: missing'])
  })

  it('is read as written when the document has it', () => {
    expect(validate(shape, { toString: 'text' })).toEqual([])
    expect(validate(shape, { toString: 1 })).toEqual([
      '$.toString: expected a string, got a number',
    ])
  })

  it('projects to JSON Schema exactly like any other field', () => {
    expect(jsonSchema(shape)).toEqual({
      type: 'object',
      properties: { toString: { type: 'string' }, valueOf: { type: 'string' } },
      required: ['toString'],
      additionalProperties: false,
    })
  })
})

describe('a record keys its values by name, prototype names included', () => {
  const names = rec(str())

  it('reads only the keys the document wrote', () => {
    expect(validate(names, { toString: 'text', constructor: 'text' })).toEqual([])
    expect(validate(names, { toString: 1 })).toEqual([
      '$.toString: expected a string, got a number',
    ])
  })
})

describe('a ref resolves against the definitions, not their prototype', () => {
  it('names the missing definition when only the prototype has the name', () => {
    expect(validate(defs({ Value: str() }, ref('toString')), 'x')).toEqual([
      '$: no definition named toString',
    ])
    expect(validate(defs({ Value: str() }, ref('constructor')), 'x')).toEqual([
      '$: no definition named constructor',
    ])
  })

  it('resolves a definition that shares a prototype name', () => {
    expect(validate(defs({ toString: str() }, ref('toString')), 'x')).toEqual([])
    expect(validate(defs({ toString: str() }, ref('toString')), 1)).toEqual([
      '$: expected a string, got a number',
    ])
  })
})

/**
 * A fault says what its author can act on. A key the schema lacks is reported
 * with the fields the object does have. A value in a union is reported as the
 * form it was written in, where the fewest-faults branch would report an
 * element with one misspelt field as "expected a string".
 */
describe('a fault names what the author wrote', () => {
  const input = obj({ name: str(), type: str(), doc: str() }, { optional: ['doc'] })

  it('lists the fields an object has beside the key it lacks', () => {
    expect(validate(input, { name: 'photo', type: 'string', optional: true })).toEqual([
      '$.optional: `optional` is not in the schema — the fields here are `name`, `type` and `doc`',
    ])
    expect(validate(obj({}), { extra: 1 })).toEqual([
      '$.extra: `extra` is not in the schema — there are no fields here',
    ])
  })

  it('calls an object an object', () => {
    expect(validate(str(), {})).toEqual(['$: expected a string, got an object'])
  })

  const value = defs(
    {
      Value: union([str(), num(), ref('Binding'), ref('Element'), ref('Plain'), arr(ref('Value'))]),
      Binding: obj({ $: str() }),
      Element: obj({ component: str(), children: arr(ref('Value')) }, { optional: ['children'] }),
      Plain: obj({ $object: rec(ref('Value')) }),
    },
    ref('Value'),
  )

  it('judges an object in a union as the member whose required key it has', () => {
    expect(validate(value, { component: 'Text', text: 'Saved' })).toEqual([
      '$.text: `text` is not in the schema — the fields here are `component` and `children`',
    ])
    expect(validate(value, { $: 'count', fallback: 0 })).toEqual([
      '$.fallback: `fallback` is not in the schema — the fields here are `$`',
    ])
    expect(validate(value, { component: 7 })).toEqual([
      '$.component: expected a string, got a number',
    ])
  })

  it('reports a fault inside a nested value at the place it is', () => {
    const tree = { component: 'Stack', children: ['a', { component: 'Text', children: [true] }] }
    expect(validate(value, tree)).toEqual([
      '$.children[1].children[0]: expected a string, got a boolean',
    ])
    expect(validate(value, [1, [{ $object: { label: {} } }]])).toEqual([
      '$[1][0].$object.label: an object here has `$`, `component` or `$object`, and this one has no keys',
    ])
  })

  it('reports an object of no member’s form once, with the keys an object may have', () => {
    expect(validate(value, { label: 'Profile', done: true })).toEqual([
      '$: an object here has `$`, `component` or `$object`, and this one has `label` and `done`',
    ])
  })

  it('reports any other value by the member it nearly matched', () => {
    expect(validate(value, true)).toEqual(['$: expected a string, got a boolean'])
    expect(validate(union([obj({ a: str() }), rec(num())]), { b: 'x' })).toEqual([
      '$.b: expected a number, got a string',
    ])
  })
})
