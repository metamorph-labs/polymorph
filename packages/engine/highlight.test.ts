import { describe, expect, it } from 'vitest'

import { highlightRuns, type HighlightRun } from './src/conventions/highlight'

/**
 * Highlight's runs: what a query marks and how a search engine's ranges are
 * read. It lives at the package root, not in `src/`, because `src/**` is the
 * engine's browser project and this function reads no document.
 */

/** The runs as one string, each mark in brackets. */
const spell = (runs: readonly HighlightRun[]): string =>
  runs.map((run) => (run.marked ? `[${run.text}]` : run.text)).join('')

describe('a query', () => {
  it('marks every occurrence of a term, as written', () => {
    expect(spell(highlightRuns('Invoice 2026, invoice 2025', { query: 'invoice' }))).toBe(
      '[Invoice] 2026, [invoice] 2025',
    )
  })

  it('is never a pattern', () => {
    expect(spell(highlightRuns('a.b and axb', { query: 'a.b' }))).toBe('[a.b] and axb')
    expect(spell(highlightRuns('(x) [y]', { query: '[y]' }))).toBe('(x) [[y]]')
  })

  it('marks each term of several, and joins the marks that overlap or touch', () => {
    expect(spell(highlightRuns('lodestone cloud', { query: ['lode', 'stone', 'cloud'] }))).toBe(
      '[lodestone] [cloud]',
    )
    expect(spell(highlightRuns('abcdef', { query: ['abc', 'bcd'] }))).toBe('[abcd]ef')
  })

  it('trims each term and marks nothing for an empty one', () => {
    expect(spell(highlightRuns('pay the invoice', { query: '  invoice ' }))).toBe(
      'pay the [invoice]',
    )
    expect(highlightRuns('pay the invoice', { query: ['', '   '] })).toEqual([
      { text: 'pay the invoice', marked: false },
    ])
  })

  it('folds case in the locale it is given', () => {
    // In Turkish, `I` folds to the dotless `ı`, so `ı` matches it and `i` does not.
    expect(spell(highlightRuns('ISTANBUL', { query: 'ıstanbul', locale: 'tr' }))).toBe('[ISTANBUL]')
    expect(spell(highlightRuns('ISTANBUL', { query: 'istanbul', locale: 'tr' }))).toBe('ISTANBUL')
    expect(spell(highlightRuns('ISTANBUL', { query: 'istanbul', locale: 'en' }))).toBe('[ISTANBUL]')
  })

  it('marks whole characters of the text when folding changes a length', () => {
    // `ß` folds to `ss`, and `İ` to `i` and a combining dot, in English.
    expect(spell(highlightRuns('Straße 4', { query: 'STRASSE' }))).toBe('[Straße] 4')
    expect(spell(highlightRuns('Straße 4', { query: 'ss' }))).toBe('Stra[ß]e 4')
    expect(spell(highlightRuns('İzmir', { query: 'i', locale: 'en' }))).toBe('[İ]zm[i]r')
  })

  it('folds the forms lower case alone keeps apart', () => {
    // Greek's final sigma `ς` and `σ` are one letter.
    expect(spell(highlightRuns('ΟΔΟΣ', { query: 'οδος' }))).toBe('[ΟΔΟΣ]')
    expect(spell(highlightRuns('οδος', { query: 'ΟΔΟΣ' }))).toBe('[οδος]')
  })

  it('reads a locale the runtime cannot as the root locale', () => {
    expect(spell(highlightRuns('Invoice', { query: 'INV', locale: 'not a locale' }))).toBe(
      '[Inv]oice',
    )
  })

  it('leaves a text with no match as one plain run', () => {
    expect(highlightRuns('nothing here', { query: 'invoice' })).toEqual([
      { text: 'nothing here', marked: false },
    ])
    expect(highlightRuns('nothing here')).toEqual([{ text: 'nothing here', marked: false }])
  })

  it('has no runs for an empty text', () => {
    expect(highlightRuns('', { query: 'x' })).toEqual([])
  })
})

describe('ranges', () => {
  it('marks the ranges, end exclusive', () => {
    expect(spell(highlightRuns('pay the invoice', { ranges: [[8, 15]] }))).toBe('pay the [invoice]')
  })

  it('takes the place of a query', () => {
    expect(spell(highlightRuns('running runner', { query: 'runner', ranges: [[0, 7]] }))).toBe(
      '[running] runner',
    )
    // An empty list of ranges is an engine saying nothing matched.
    expect(spell(highlightRuns('running runner', { query: 'runner', ranges: [] }))).toBe(
      'running runner',
    )
  })

  it('joins ranges that overlap or touch, in any order', () => {
    expect(
      spell(
        highlightRuns('abcdefghij', {
          ranges: [
            [6, 8],
            [0, 3],
            [2, 5],
            [8, 9],
          ],
        }),
      ),
    ).toBe('[abcde]f[ghi]j')
  })

  it('cuts a range at the text’s ends and drops one that is empty, reversed or not a number', () => {
    expect(
      spell(
        highlightRuns('abc', {
          ranges: [
            [-4, 1],
            [2, 99],
          ],
        }),
      ),
    ).toBe('[a]b[c]')
    expect(
      spell(
        highlightRuns('abc', {
          ranges: [
            [1, 1],
            [2, 1],
            [Number.NaN, 2],
            [5, 9],
          ],
        }),
      ),
    ).toBe('abc')
    expect(spell(highlightRuns('abc', { ranges: [[1, Infinity]] }))).toBe('a[bc]')
  })

  it('reads an end that is not whole as the whole number below it', () => {
    expect(spell(highlightRuns('abcdef', { ranges: [[1.9, 3.2]] }))).toBe('a[bc]def')
  })

  it('never splits a character that takes two code units', () => {
    // `𝔸` is one code point and two code units, at offsets 1 and 2.
    expect(spell(highlightRuns('a𝔸b', { ranges: [[2, 3]] }))).toBe('a[𝔸]b')
    expect(spell(highlightRuns('a𝔸b', { ranges: [[0, 2]] }))).toBe('[a𝔸]b')
  })
})
