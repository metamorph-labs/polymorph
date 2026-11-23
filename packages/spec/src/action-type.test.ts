import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { buildRegistry } from '@polymorph/registry'
import { unionParts } from '@polymorph/registry/frameworks'
import { describe, expect, it } from 'vitest'

import { EVENT_HANDLER_ALIAS, isActionType } from './action-type'

/**
 * `isActionType` reads a type's text in time linear in its length, and gives
 * the answer it gave when it unwrapped one pair of parentheses at a time.
 *
 * A screen a model writes declares its input types, so the text is not the
 * registry's own: a type of nested parentheses must not cost the square of
 * its length. The reference below is the earlier reading, kept to hold the
 * faster one to every answer it gave.
 */

const ROOT = resolve(import.meta.dirname, '../../..')

/** The earlier reading: one scan per pair of parentheses. */
const reference = (() => {
  const closingParen = (text: string): number => {
    let depth = 0
    for (let at = 0; at < text.length; at += 1) {
      const char = text[at] as string
      if ('(<{['.includes(char)) depth += 1
      else if (')}]'.includes(char) || (char === '>' && text[at - 1] !== '=')) {
        depth -= 1
        if (depth === 0) return at
      }
    }
    return -1
  }
  const unwrap = (text: string): string => {
    let inner = text.trim()
    while (inner.startsWith('(') && closingParen(inner) === inner.length - 1) {
      inner = inner.slice(1, -1).trim()
    }
    return inner
  }
  const isFunctionText = (part: string): boolean => {
    let text = unwrap(part)
    if (text.startsWith('<')) {
      const end = closingParen(text)
      if (end === -1) return false
      text = text.slice(end + 1).trim()
    }
    if (!text.startsWith('(')) return false
    const end = closingParen(text)
    return (
      end !== -1 &&
      text
        .slice(end + 1)
        .trim()
        .startsWith('=>')
    )
  }
  return (type: string): boolean => {
    if (isFunctionText(type)) return true
    const solid = unionParts(type).filter((part) => part !== 'null')
    return (
      solid.length > 0 &&
      solid.every((part) => isFunctionText(part) || EVENT_HANDLER_ALIAS.test(unwrap(part)))
    )
  }
})()

// Built once for the file, as the other laws here build it, outside any test's time limit.
const registry = buildRegistry(ROOT)

/** Every type the registry prints, and every input type a screen in `design/screens/` declares. */
function realTypes(): string[] {
  const types = new Set<string>()
  for (const member of [...registry.components, ...registry.exceptions.primitives]) {
    for (const prop of member.props) types.add(prop.type)
    for (const part of 'parts' in member ? member.parts : []) {
      for (const prop of part.props) types.add(prop.type)
    }
  }
  for (const type of registry.dataTypes) for (const field of type.fields) types.add(field.type)
  const screens = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) screens(path)
      else if (entry.name.endsWith('.json')) {
        const document = JSON.parse(readFileSync(path, 'utf8')) as { inputs?: { type?: unknown }[] }
        for (const input of document.inputs ?? []) {
          if (typeof input.type === 'string') types.add(input.type)
        }
      }
    }
  }
  screens(resolve(ROOT, 'design/screens'))
  return [...types]
}

describe('isActionType', () => {
  it('answers as the earlier reading did for every type the registry and the screens hold', () => {
    const types = realTypes()
    expect(types.length).toBeGreaterThan(300)
    expect(types.filter((type) => isActionType(type)).length).toBeGreaterThan(50)
    for (const type of types) expect(isActionType(type), type).toBe(reference(type))
  })

  it('answers as the earlier reading did for text of brackets, arrows and space in any order', () => {
    // A fixed sequence, so a failure is the same failure on the next run.
    let seed = 7
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
      return seed / 2_147_483_648
    }
    const tokens = [
      '(',
      ')',
      '<',
      '>',
      '{',
      '}',
      '[',
      ']',
      '=>',
      '=',
      ' ',
      ' | ',
      'a',
      'void',
      '\n',
    ]
    for (let round = 0; round < 20_000; round += 1) {
      let type = ''
      const length = Math.floor(next() * 24)
      for (let at = 0; at < length; at += 1) type += tokens[Math.floor(next() * tokens.length)]
      expect(isActionType(type), JSON.stringify(type)).toBe(reference(type))
    }
  })

  it('reads nested parentheses in time linear in their number', () => {
    const nested = (pairs: number) => `${'('.repeat(pairs)}() => void${')'.repeat(pairs)}`
    const time = (pairs: number) => {
      const type = nested(pairs)
      let best = Infinity
      for (let round = 0; round < 3; round += 1) {
        const start = performance.now()
        expect(isActionType(type)).toBe(true)
        best = Math.min(best, performance.now() - start)
      }
      return best
    }
    time(1_000)
    // Four times the pairs: linear work takes about four times as long, the square sixteen.
    const ratio = time(40_000) / Math.max(time(10_000), 0.05)
    expect(ratio).toBeLessThan(9)
  })
})
