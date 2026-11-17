import { describe, expect, it } from 'vitest'

import { markupTags, vueTagName, writtenAttribute } from './markup.js'

/**
 * The tag reader the inventory and the Angular module read share
 * (`markup.js`). What it must get right is which text is an attribute's name
 * and which is a value, because both readers ask what a boundary names.
 */

const only = (markup: string) => {
  const [tag] = markupTags(markup)
  if (tag === undefined) throw new Error(`no tag in ${markup}`)
  return tag
}

describe('the tags of a template', () => {
  it('reads each attribute by its own name and value', () => {
    const tag = only(`<ThirdParty library="leaflet" reason='depot map' open :value="a > b" />`)
    expect(tag.name).toBe('ThirdParty')
    expect(tag.selfClosing).toBe(true)
    expect(tag.attributes).toEqual([
      { name: 'library', value: 'leaflet', braced: false },
      { name: 'reason', value: 'depot map', braced: false },
      { name: 'open', value: null, braced: false },
      { name: ':value', value: 'a > b', braced: false },
    ])
  })

  it('never reads a value as an attribute', () => {
    const tag = only(`<pm-third-party reason="see library='recharts'" data-library="recharts">`)
    expect(tag.attributes.map(({ name }) => name)).toEqual(['reason', 'data-library'])
    expect(writtenAttribute(tag, 'library', 'angular')).toBeNull()
  })

  it('reads Svelte’s braces whole, with the braces and quotes inside them', () => {
    const tag = only(`<Stack patch={{ gap: 2 }} title={on ? '}' : "{"} {...rest}>`)
    expect(tag.attributes).toEqual([
      { name: 'patch', value: '{ gap: 2 }', braced: true },
      { name: 'title', value: `on ? '}' : "{"`, braced: true },
      { name: '{...rest}', value: null, braced: true },
    ])
  })

  it('gives the end tags, and where each tag is', () => {
    const markup = '<Bespoke reason="a"><p>x</p></Bespoke>'
    const tags = markupTags(markup)
    expect(tags.map(({ name, close }) => `${close ? '/' : ''}${name}`)).toEqual([
      'Bespoke',
      'p',
      '/p',
      '/Bespoke',
    ])
    const last = tags.at(-1)
    expect(markup.slice(last?.start, last?.end)).toBe('</Bespoke>')
  })

  it('skips a comment, text with a `<` in it, and a tag the text ends inside', () => {
    expect(markupTags('<!-- <Bespoke reason="x"> -->{a<b}<p>1 < 2</p>').map((t) => t.name)).toEqual(
      ['p', 'p'],
    )
    expect(markupTags('<p></p><Bespoke reason="unclosed')).toHaveLength(2)
  })
})

describe('what a tag writes out for an attribute', () => {
  it('is the text of a static attribute', () => {
    expect(writtenAttribute(only('<ThirdParty library="leaflet">'), 'library', 'vue')).toBe(
      'leaflet',
    )
    expect(writtenAttribute(only('<ThirdParty library=leaflet>'), 'library', 'svelte')).toBe(
      'leaflet',
    )
  })

  it('is nothing for a bound or interpolated one, in each syntax', () => {
    const computed: [string, 'vue' | 'svelte' | 'angular'][] = [
      ['<ThirdParty :library="name">', 'vue'],
      ['<ThirdParty v-bind:library="name">', 'vue'],
      ['<ThirdParty library={name}>', 'svelte'],
      [`<ThirdParty library={'leaflet'}>`, 'svelte'],
      ['<ThirdParty library="{name}">', 'svelte'],
      ['<pm-third-party [library]="name">', 'angular'],
      ['<pm-third-party library="{{ name }}">', 'angular'],
      ['<ThirdParty library>', 'vue'],
      ['<ThirdParty reason="map">', 'vue'],
    ]
    for (const [markup, syntax] of computed) {
      expect(writtenAttribute(only(markup), 'library', syntax), markup).toBeNull()
    }
  })
})

describe('the name a Vue tag is resolved by', () => {
  const imports = new Set(['Bespoke', 'Button', 'Card'])

  it('is PascalCase for a tag with a hyphen, whatever the script imports', () => {
    expect(vueTagName('third-party', imports)).toBe('ThirdParty')
    expect(vueTagName('density-scope', new Set())).toBe('DensityScope')
  })

  it('is the import a lowercase tag resolves to', () => {
    expect(vueTagName('bespoke', imports)).toBe('Bespoke')
    expect(vueTagName('card', imports)).toBe('Card')
  })

  it('is the tag as written for a native element, an unimported name and any other spelling', () => {
    // `<button>` is the HTML element even where `Button` is imported.
    expect(vueTagName('button', imports)).toBe('button')
    expect(vueTagName('bespoke', new Set(['Card']))).toBe('bespoke')
    expect(vueTagName('Bespoke', new Set())).toBe('Bespoke')
    expect(vueTagName('Table.Row', imports)).toBe('Table.Row')
  })
})
