import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  appendThemeCSS,
  composeTheme,
  emitThemeCSS,
  exampleQuietSystem,
  exampleVioletPalette,
  resolveTheme,
} from '@polymorph/engine'
import { installTestTheme } from '@polymorph/engine/testing'
import { Avatar } from './Avatar'
import { Heading } from './Heading'
import { Hero } from './Hero'
import { Text } from './Text'

/**
 * The heading slot, as the browser draws it. A system that states a heading
 * face draws every Heading level in it, level 4 included, which is `text.md`
 * sized and takes `text.xl`'s family with its weight. A paragraph stays in the
 * body face, and so do the two parts at `text.lg` that are not headings:
 * Hero's lede and Avatar's `lg` initials.
 */

beforeAll(installTestTheme)

/** A family list as the browser computed it, without the optional quotes WebKit drops. */
const families = (list: string) => list.replaceAll('"', '').trim()

/** A host wearing the quiet example with a serif heading face over its sans body. */
function headedHost(): HTMLElement {
  const theme = resolveTheme(
    composeTheme(
      {
        ...exampleQuietSystem,
        name: 'example-heading-face',
        fonts: {
          ...exampleQuietSystem.fonts,
          heading: { family: 'Source Serif 4 Variable', fallback: 'serif' },
        },
      },
      exampleVioletPalette,
    ),
  )
  appendThemeCSS(emitThemeCSS(theme), theme.name)
  const host = document.createElement('div')
  host.setAttribute('data-system', theme.system)
  host.setAttribute('data-palette', theme.palette)
  host.setAttribute('data-mode', 'light')
  document.body.append(host)
  return host
}

describe('Heading in a system with a heading face', () => {
  it('draws every level in the heading slot and a paragraph in the body slot', () => {
    const host = headedHost()
    const { container } = render(
      <>
        <Heading level={2}>Members</Heading>
        <Heading level={3}>Invited</Heading>
        <Heading level={4}>By email</Heading>
        <Text>Everyone who can open the workspace.</Text>
      </>,
      { container: host },
    )
    const root = getComputedStyle(host)
    const heading = families(root.getPropertyValue('--pm-font-heading'))
    const body = families(root.getPropertyValue('--pm-font-body'))
    expect(heading.startsWith('Source Serif 4 Variable, ui-serif')).toBe(true)
    expect(heading).not.toBe(body)

    const levels = ['h2', 'h3', 'h4'].map((tag) => container.querySelector(tag) as HTMLElement)
    for (const level of levels) {
      expect(families(getComputedStyle(level).fontFamily), level.tagName).toBe(heading)
    }
    const paragraph = container.querySelector('p') as HTMLElement
    expect(families(getComputedStyle(paragraph).fontFamily)).toBe(body)

    // Level 4 is still the paragraph's size, at level 2's weight.
    const [two, , four] = levels as [HTMLElement, HTMLElement, HTMLElement]
    expect(getComputedStyle(four).fontSize).toBe(getComputedStyle(paragraph).fontSize)
    expect(getComputedStyle(four).fontWeight).toBe(getComputedStyle(two).fontWeight)
    host.remove()
  })

  it('keeps Hero’s lede and Avatar’s large initials in the body slot', () => {
    const host = headedHost()
    const { container } = render(
      <>
        <Hero title="One vocabulary" lede="Every decision is made once." />
        <Avatar name="Ada Lovelace" size="lg" />
      </>,
      { container: host },
    )
    const body = families(getComputedStyle(host).getPropertyValue('--pm-font-body'))
    const lede = container.querySelector('p') as HTMLElement
    const avatar = container.querySelector('[data-member="avatar"]') as HTMLElement
    expect(families(getComputedStyle(lede).fontFamily)).toBe(body)
    expect(families(getComputedStyle(avatar).fontFamily)).toBe(body)
    host.remove()
  })
})

describe('Heading in a system with no heading face', () => {
  it('draws every level in the body slot, as the heading slot is the body slot', () => {
    const { container } = render(
      <>
        <Heading level={2}>Members</Heading>
        <Heading level={4}>By email</Heading>
      </>,
    )
    const root = getComputedStyle(document.documentElement)
    expect(root.getPropertyValue('--pm-font-heading').trim()).toBe(
      root.getPropertyValue('--pm-font-body').trim(),
    )
    for (const tag of ['h2', 'h4']) {
      const level = container.querySelector(tag) as HTMLElement
      expect(families(getComputedStyle(level).fontFamily)).toBe(
        families(root.getPropertyValue('--pm-font-body')),
      )
    }
  })
})
