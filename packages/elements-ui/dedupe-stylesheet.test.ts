import { describe, expect, it } from 'vitest'

import { dedupeStylesheet, topLevelStatements } from './dedupe-stylesheet'

/**
 * The no-build stylesheet's dedupe (`dedupe-stylesheet.ts`): a rule the
 * bundler wrote once per recipe is kept once, where its last copy stood, so
 * the cascade is the one the page had.
 */

describe('topLevelStatements', () => {
  it('splits at the end of each block and at a semicolon outside any block', () => {
    const css =
      '@charset "utf-8";.a{color:red}@media (width<30rem){.a{color:blue}.b{top:0}}.c{top:0}'
    expect(topLevelStatements(css)).toEqual([
      '@charset "utf-8";',
      '.a{color:red}',
      '@media (width<30rem){.a{color:blue}.b{top:0}}',
      '.c{top:0}',
    ])
  })

  it('reads a brace or a semicolon in a string, a comment or an escape as text', () => {
    const css = ".a:after{content:\"}\"}/* } ; */.b\\}{top:0}.c{content:'a;\\'}'}"
    const statements = topLevelStatements(css)
    expect(statements).toEqual([
      '.a:after{content:"}"}',
      '/* } ; */.b\\}{top:0}',
      ".c{content:'a;\\'}'}",
    ])
    expect(statements.join('')).toBe(css)
  })
})

describe('dedupeStylesheet', () => {
  it('keeps the last copy of a repeated rule, so a rule between the copies still loses to it', () => {
    const convention = '.focus:focus-visible{outline:2px solid}'
    const recipe = '.input:focus-visible{outline:none}'
    expect(dedupeStylesheet(`${convention}${recipe}${convention}.b{top:0}`)).toBe(
      `${recipe}${convention}.b{top:0}`,
    )
  })

  it('compares a whole at-rule block, and keeps two blocks that differ', () => {
    const inside = '@container style(--pm-focus-place:inside){.focus{outline-offset:-2px}}'
    const outside = '@container style(--pm-focus-place:outside){.focus{outline-offset:0}}'
    expect(dedupeStylesheet(`${inside}${outside}.a{top:0}${inside}${outside}`)).toBe(
      `.a{top:0}${inside}${outside}`,
    )
  })

  it('leaves a statement and a layer where they first appear', () => {
    const css =
      '@layer base,recipes;@layer base{.a{top:0}}.b{top:0}@layer base,recipes;@layer base{.a{top:0}}'
    expect(dedupeStylesheet(css)).toBe(css)
  })

  it('returns a stylesheet with nothing repeated as it is', () => {
    const css = '.a{top:0}\n.b{top:0}\n'
    expect(dedupeStylesheet(css)).toBe(css)
  })
})
