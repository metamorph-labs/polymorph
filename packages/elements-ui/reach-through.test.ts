import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  reachThrough,
  reachThroughCss,
  reachThroughPlugin,
  splitList,
  transformList,
} from './reach-through'

/**
 * The reach-through transform (`reach-through.ts`): the forms it adds to a
 * recipe selector so it also matches through a host that draws no box. The
 * browser half, that a recipe through a host lays out as it does without one,
 * is the parity law's box comparison (`src/parity.test.ts`).
 */

const HOST = ':where(:state(poly-host))'

/**
 * A selector's specificity as `[ids, classes, types]`: `:where()` counts
 * nothing, and `:is()`, `:not()` and `:has()` count their most specific
 * argument, as Selectors Level 4 counts them.
 */
function specificity(selector: string): [number, number, number] {
  let ids = 0
  let classes = 0
  let types = 0
  let index = 0
  const text = selector
  while (index < text.length) {
    const char = text[index] as string
    if (char === '#') {
      ids++
      index++
      while (index < text.length && /[-\w]/.test(text[index] as string)) index++
    } else if (char === '.') {
      classes++
      index++
      while (index < text.length && /[-\w]/.test(text[index] as string)) index++
    } else if (char === '[') {
      classes++
      index = text.indexOf(']', index) + 1
    } else if (char === ':') {
      const element = text[index + 1] === ':'
      index += element ? 2 : 1
      const start = index
      while (index < text.length && /[-\w]/.test(text[index] as string)) index++
      const name = text.slice(start, index)
      let argument: string | null = null
      if (text[index] === '(') {
        let depth = 0
        const open = index
        for (; index < text.length; index++) {
          if (text[index] === '(') depth++
          else if (text[index] === ')' && --depth === 0) break
        }
        argument = text.slice(open + 1, index)
        index++
      }
      if (element) types++
      else if (name === 'where') continue
      else if (['is', 'not', 'has'].includes(name) && argument !== null) {
        const inner = splitList(argument)
          .map((part) => specificity(part.replace(/^\s*[>+~]/, '')))
          .sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0] ?? [0, 0, 0]
        ids += inner[0]
        classes += inner[1]
        types += inner[2]
      } else classes++
    } else if (/[a-z]/i.test(char)) {
      types++
      while (index < text.length && /[-\w]/.test(text[index] as string)) index++
    } else index++
  }
  return [ids, classes, types]
}

describe('a selector that relates an element to its parent or its siblings also matches through a host', () => {
  it('reaches a child through a host', () => {
    expect(reachThrough('.grid > *')).toEqual([`.grid > ${HOST} > *`])
  })

  it('reads a sibling through either host, or both', () => {
    expect(reachThrough('.row + .row')).toEqual([
      `${HOST}:has(> .row:where(:last-child)) + .row`,
      `.row + ${HOST} > .row:where(:first-child)`,
      `${HOST}:has(> .row:where(:last-child)) + ${HOST} > .row:where(:first-child)`,
    ])
    expect(reachThrough('.head ~ *')).toContain(`${HOST}:has(> .head) ~ ${HOST} > *`)
  })

  it('reads a position among siblings as the host’s position', () => {
    expect(reachThrough('.item:first-child')).toEqual([
      `${HOST}:first-child > .item:where(:first-child)`,
    ])
    expect(reachThrough('.navGroup:first-child .label')).toEqual([
      `${HOST}:first-child > .navGroup:where(:first-child) .label`,
    ])
    expect(reachThrough('.step:last-child')).toEqual([
      `${HOST}:last-child > .step:where(:last-child)`,
    ])
    expect(reachThrough('.item:not(:first-child, :last-child)')).toEqual([
      `${HOST}:not(:first-child, :last-child) > .item`,
    ])
  })

  it('reads a relative selector inside :has(), :is() and :where()', () => {
    expect(reachThrough('.cell:has(> .label)')).toEqual([`.cell:has(> .label, > ${HOST} > .label)`])
    expect(reachThrough('tbody:has(+ .foot)')).toEqual([
      `tbody:has(+ .foot, + ${HOST} > .foot:where(:first-child))`,
    ])
  })

  it('keeps a pseudo-element last', () => {
    expect(reachThrough('.row + .row::before')).toContain(
      `.row + ${HOST} > .row:where(:first-child)::before`,
    )
  })

  it('adds nothing to a selector a host cannot stand in', () => {
    expect(reachThrough('.card .title')).toEqual([])
    expect(reachThrough('.button[data-loading]:hover')).toEqual([])
    // A host's tag is not its member's, so a position among one tag has no form through it.
    expect(reachThrough('.cell:first-of-type')).toEqual([])
  })

  it('keeps every form’s specificity the original’s', () => {
    const selectors = [
      '.grid > *',
      '.row + .row',
      '.item:first-child',
      '.navGroup:first-child .label',
      '.item > * + *',
      'tbody:has(+ .foot) .row:last-child .cell',
      '.item:has(.crumb):not(:first-child, :last-child)',
      ".root[data-orientation='horizontal'] > * > .indicator",
    ]
    // A host's mark outside `:where()` would weigh one more class.
    expect(specificity(`.grid > :state(poly-host) > *`)).not.toEqual(specificity('.grid > *'))
    for (const selector of selectors) {
      for (const form of reachThrough(selector)) {
        expect(specificity(form), `${selector} → ${form}`).toEqual(specificity(selector))
      }
    }
  })

  it('writes each form after the selector it comes from, in a list', () => {
    expect(transformList('.a > .b, .c')).toBe(`.a > .b, .a > ${HOST} > .b, .c`)
  })
})

describe('a stylesheet keeps everything but its selectors as it is', () => {
  it('transforms rules, and rules inside a grouping at-rule', () => {
    const css = '@media (width >= 48rem) {\n  .a > .b { color: red; }\n}\n.c + .d{margin:0}'
    const out = reachThroughCss(css)
    expect(out).toContain('@media (width >= 48rem) {')
    expect(out).toContain(`.a > .b, .a > ${HOST} > .b { color: red; }`)
    expect(out).toContain(`.c + ${HOST} > .d:where(:first-child)`)
    expect(out).toContain('{margin:0}')
  })

  it('reads a comment before a rule as a comment, whatever it holds', () => {
    const css = '/* `{tone}.text`, the wash */\n.row > .marker { color: red; }'
    expect(reachThroughCss(css)).toBe(
      `/* \`{tone}.text\`, the wash */\n.row > .marker, .row > ${HOST} > .marker { color: red; }`,
    )
  })

  it('leaves comments, strings, declarations and keyframes alone', () => {
    const css =
      "/* .x > .y { } */\n@keyframes k { from { opacity: 0 } 50% { opacity: 1 } }\n.d { content: 'a > b {'; }"
    expect(reachThroughCss(css)).toBe(css)
  })

  it('reads every recipe, and each one’s declarations come through unchanged', () => {
    const root = resolve(import.meta.dirname, '../recipes/src')
    const files: string[] = []
    const visit = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) visit(path)
        else if (name.endsWith('.css')) files.push(path)
      }
    }
    visit(root)
    expect(files.length).toBeGreaterThan(0)
    const declarations = (css: string) =>
      [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\{([^{}]*)\}/g)].map((match) =>
        (match[1] ?? '').trim(),
      )
    for (const file of files) {
      const css = readFileSync(file, 'utf8')
      const out = reachThroughCss(css)
      expect(declarations(out), file).toEqual(declarations(css))
    }
  })
})

describe('the transform as a plugin', () => {
  it('transforms the recipes’ stylesheets and nothing else', () => {
    const plugin = reachThroughPlugin()
    expect(plugin.enforce).toBe('pre')
    expect(
      plugin.transform('.grid > * {}', '/repo/packages/recipes/src/layout/layout.module.css'),
    ).toBe(`.grid > *, .grid > ${HOST} > * {}`)
    expect(
      plugin.transform('.grid > * {}', '/repo/packages/recipes/src/base.css?direct'),
    ).not.toBeNull()
    expect(plugin.transform('.grid > * {}', '/repo/apps/workbench/src/app.css')).toBeNull()
  })
})
