import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { tagOf } from '@polymorph/elements/definition'
import { defaultMembers, VOCABULARY } from '@polymorph/screen/vocabulary'

import { DEFINITIONS } from './src/definitions'
import { ACTION_EVENT, FAULT_EVENT } from './src/screen/events'

/**
 * The laws of the elements' run-time screens that read files and tables, in
 * node. What they draw is held in the browser (`src/screen/*.test.ts`).
 *
 *  - **No markup.** The renderer and `<poly-screen>` build every node with
 *    `createElement` and `createTextNode`, set properties and fill slots. No
 *    module of theirs names an API that parses or writes markup, and no string
 *    in them holds a tag, so nothing a document or a host's data holds is ever
 *    read as HTML.
 *  - **Its own events.** `poly-action` and `poly-fault` are dispatched by
 *    `<poly-screen>` alone, and `poly-error` by an element whose member
 *    throws: no member's callback, and no callback an element completes in a
 *    member's data, dispatches any of them.
 *  - **An element for every member.** Every member and every part a screen
 *    may name, among the members the elements draw, has a definition, so the
 *    renderer has a tag to make for it.
 */

const PACKAGE = import.meta.dirname
const SCREEN = resolve(PACKAGE, 'src/screen')

/** The renderer's modules: every module under `src/screen` but its tests. */
const modules = readdirSync(SCREEN)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map((name) => resolve(SCREEN, name))

/** The APIs that read text as markup, or write it into a document. */
const MARKUP =
  /\b(?:innerHTML|outerHTML|insertAdjacentHTML|DOMParser|parseFromString|createContextualFragment|setHTMLUnsafe|parseHTMLUnsafe|srcdoc|write|writeln)\b/

/** Every string and template a module holds, by its text. */
function literals(path: string): string[] {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ESNext, true)
  const found: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) found.push(node.text)
    else if (ts.isTemplateExpression(node)) {
      found.push(node.head.text, ...node.templateSpans.map((span) => span.literal.text))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

/** Every identifier and property name a module's code uses, outside its comments and strings. */
function names(path: string): string[] {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ESNext, true)
  const found: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) found.push(node.text)
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

describe('the renderer writes no markup', () => {
  it('finds the renderer’s modules', () => {
    expect(modules.map((path) => relative(SCREEN, path)).sort()).toEqual(
      expect.arrayContaining(['draw.ts', 'drawing.ts', 'element.ts', 'index.ts']),
    )
  })

  for (const path of modules) {
    const name = relative(PACKAGE, path)
    it(`${name} names no API that reads or writes markup`, () => {
      expect(names(path).filter((identifier) => MARKUP.test(identifier))).toEqual([])
      // A `<template>` parses its content as markup.
      expect(literals(path).filter((text) => text === 'template')).toEqual([])
    })

    it(`${name} holds no tag in a string`, () => {
      expect(literals(path).filter((text) => /<\/?[a-zA-Z!]/.test(text))).toEqual([])
    })
  }
})

describe('<poly-screen> dispatches events no member dispatches', () => {
  /** Every event a definition names: each callback's, and each completed callback's in its data. */
  const memberEvents = new Set(
    Object.values(DEFINITIONS).flatMap((definition) => [
      ...Object.values(definition.events).map((event) => event.type),
      ...Object.values(definition.callbacks ?? {}).flatMap((callbacks) =>
        callbacks.map((callback) => callback.type),
      ),
    ]),
  )

  it('reads the members’ events', () => {
    expect(memberEvents.size).toBeGreaterThan(20)
    expect(memberEvents.has('poly-click')).toBe(true)
  })

  /** The event every element dispatches when its member throws (`ERROR_EVENT` in the foundation). */
  const errorEvent = /export const ERROR_EVENT = '([^']+)'/.exec(
    readFileSync(resolve(PACKAGE, '../elements/src/events.ts'), 'utf8'),
  )?.[1]

  it('reads the event the foundation dispatches for a member that throws', () => {
    expect(errorEvent).toBe('poly-error')
  })

  for (const type of [ACTION_EVENT, FAULT_EVENT, errorEvent ?? '']) {
    it(`${type} is no member’s`, () => {
      expect(type.startsWith('poly-')).toBe(true)
      expect(memberEvents.has(type)).toBe(false)
    })
  }

  it('is no member’s tag', () => {
    expect(DEFINITIONS['poly-screen']).toBeUndefined()
  })
})

describe('every member a screen may name has an element', () => {
  const drawn = new Set(defaultMembers(VOCABULARY, 'elements'))

  it('reads the members the elements draw', () => {
    expect(drawn.size).toBeGreaterThan(100)
  })

  it('has a definition for each member, each of its parts and each exception primitive', () => {
    const names = [
      ...VOCABULARY.components
        .filter((member) => drawn.has(member.name))
        .flatMap((member) => [
          member.name,
          ...member.parts.map((part) => `${member.name}.${part.name}`),
        ]),
      ...VOCABULARY.exceptions.primitives
        .filter((primitive) => drawn.has(primitive.name))
        .map((primitive) => primitive.name),
    ]
    expect(names.filter((name) => DEFINITIONS[tagOf(name.replace('.', ''))] === undefined)).toEqual(
      [],
    )
  })
})
