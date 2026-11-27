import { beforeAll, describe, expect, it } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what a Stat's delta says (`design/components/stat.md`, A11y),
 * which every web shell's Stat test calls with a mount of its own. The
 * delta's sentence is visually hidden text in an element with no role, so no
 * contract statement reads it (`docs/conformance.md`). This law reads the
 * sentence a shell speaks by default and the one a host passes in
 * `deltaLabel`, with what `deltaLabel` is given.
 */

/** What `deltaLabel` is given: the delta, with its sentiment resolved. */
export interface StatDeltaFacts {
  value: string
  direction: 'up' | 'down'
  positive: boolean
}

/** The props the law mounts a Stat with. */
export interface StatLawProps {
  label: string
  value: string
  delta?: { value: string; direction: 'up' | 'down'; positive?: boolean }
  deltaLabel?: (delta: StatDeltaFacts) => string
  loading?: boolean
}

export interface StatLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /**
   * Mounts one Stat with these props, after any the test mounted before it. A
   * prop the law leaves out is not passed.
   */
  mount(props: StatLawProps): Promise<unknown>
}

/** The Stat mounted last: a test mounts several, and each mount is added at the end of the body. */
const root = (): HTMLElement => {
  const element = [...document.querySelectorAll<HTMLElement>('[data-member="stat"]')].at(-1)
  if (element === undefined) throw new Error('the Stat rendered nothing')
  return element
}

/** The delta, the element that carries its direction, or `null`. */
const delta = (): HTMLElement | null => root().querySelector<HTMLElement>('[data-direction]')

/** The text under `node` that a screen reader hears: none of it inside `aria-hidden`. */
const heard = (node: Node): string =>
  [...node.childNodes]
    .map((child) => {
      if (child.nodeType === Node.TEXT_NODE) return child.textContent ?? ''
      if (child instanceof Element && child.getAttribute('aria-hidden') !== 'true') {
        return heard(child)
      }
      return ''
    })
    .join('')

/** What the delta says: its value is drawn hidden, so this is the sentence alone. */
const spoken = (): string => {
  const element = delta()
  if (element === null) throw new Error('the Stat drew no delta')
  return heard(element).replace(/\s+/g, ' ').trim()
}

/** A host's sentence in French, and the facts it was given, last call last. */
function french() {
  const given: StatDeltaFacts[] = []
  const deltaLabel = (facts: StatDeltaFacts) => {
    given.push(facts)
    const moved = facts.direction === 'down' ? 'en baisse' : 'en hausse'
    return `${moved} de ${facts.value}, ${facts.positive ? 'favorable' : 'défavorable'}`
  }
  return { given, deltaLabel }
}

export function statLaw({ shell, mount }: StatLaw): void {
  describe(`${shell} Stat — what its delta says`, () => {
    beforeAll(installTestTheme)

    it('speaks the direction, the value and the sentiment, in English by default', async () => {
      await mount({ label: 'Resolved', value: '342', delta: { value: '12%', direction: 'up' } })
      expect(spoken()).toBe('up 12% — positive')

      await mount({
        label: 'Open tickets',
        value: '128',
        delta: { value: '8%', direction: 'down', positive: true },
      })
      expect(spoken()).toBe('down 8% — positive')

      await mount({
        label: 'Satisfaction',
        value: '91%',
        delta: { value: '3pts', direction: 'down' },
      })
      expect(spoken()).toBe('down 3pts — negative')
    })

    it('speaks the host’s sentence from deltaLabel, given the value, the direction and the resolved sentiment', async () => {
      const host = french()
      await mount({
        label: 'Satisfaction',
        value: '91 %',
        delta: { value: '3 pts', direction: 'down' },
        deltaLabel: host.deltaLabel,
      })
      expect(spoken()).toBe('en baisse de 3 pts, défavorable')
      expect(host.given.at(-1)).toEqual({ value: '3 pts', direction: 'down', positive: false })
      expect(root().textContent).not.toMatch(/negative|positive/)

      // Direction is not sentiment: the host hears the sentiment the caller set.
      await mount({
        label: 'Tickets ouverts',
        value: '128',
        delta: { value: '8 %', direction: 'down', positive: true },
        deltaLabel: host.deltaLabel,
      })
      expect(spoken()).toBe('en baisse de 8 %, favorable')
      expect(host.given.at(-1)).toEqual({ value: '8 %', direction: 'down', positive: true })
    })

    it('says nothing of a delta that has not arrived, in the host’s words or its own', async () => {
      const host = french()
      await mount({
        label: 'Résolus',
        value: '342',
        delta: { value: '12 %', direction: 'up' },
        deltaLabel: host.deltaLabel,
        loading: true,
      })
      expect(delta()).toBeNull()
      expect(root().textContent).not.toMatch(/en hausse|positive/)
    })
  })
}
