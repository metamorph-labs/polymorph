import { describe, expect, it } from 'vitest'

import { REGISTRY } from '../registry'
import { BLURBS } from './blurbs'

const registered = REGISTRY.components.map((component) => component.name)
const written = Object.keys(BLURBS)

/** The first word of a line, without the punctuation around it. */
function firstWord(line: string): string {
  return (line.split(/\s+/)[0] ?? '').replace(/[^\p{L}\p{N}]/gu, '')
}

describe('the index line for each component', () => {
  it('gives every component in the registry a line', () => {
    expect(registered.filter((name) => !written.includes(name))).toEqual([])
  })

  it('has no line for a name the registry lacks', () => {
    expect(written.filter((name) => !registered.includes(name))).toEqual([])
  })

  it('writes each line as a sentence of 30 to 100 characters', () => {
    for (const [name, line] of Object.entries(BLURBS)) {
      expect(line.length, name).toBeGreaterThanOrEqual(30)
      expect(line.length, name).toBeLessThanOrEqual(100)
      expect(line, name).toMatch(/^\p{Lu}/u)
      expect(line, name).toMatch(/\.$/)
    }
  })

  it('writes no markup, because the card shows the line as plain text', () => {
    for (const [name, line] of Object.entries(BLURBS)) {
      expect(line, name).not.toMatch(/[`*]/)
    }
  })

  it('does not open with the component’s own name, which the card already shows', () => {
    for (const [name, line] of Object.entries(BLURBS)) {
      expect(firstWord(line).toLowerCase(), name).not.toBe(name.toLowerCase())
    }
  })
})
