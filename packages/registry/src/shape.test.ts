import { describe, expect, it } from 'vitest'

import { defs, jsonSchema, obj, rec, ref, str, validate } from './shape'

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
    expect(validate(binding, { $: 'onSave', [key]: 'x' })).toEqual([`$.${key}: not in the schema`])
  })

  it('reports an own __proto__ key, the way JSON.parse writes one', () => {
    // An object literal with `__proto__:` sets the prototype. Only a parse
    // produces the own key that a document carries.
    const document: unknown = JSON.parse('{"$": "onSave", "__proto__": "x"}')
    expect(validate(binding, document)).toEqual(['$.__proto__: not in the schema'])
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
