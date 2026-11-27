import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what a TagInput says of its count (`design/components/tag-input.md`,
 * FormField integration and A11y), which every web shell's TagInput test calls
 * with a mount of its own: the count in the field's description, and the
 * removal its live region announces with how many tags remain. The count is
 * visually hidden text that the field's description names, and no contract
 * statement reads a description or the words of an announcement
 * (`docs/conformance.md`). This law reads the sentences a shell says by default
 * and the ones a host passes in `countLabel` and `removedLabel`, with what each
 * is given.
 */

/** What `countLabel` is given: the count, with whether the field is full resolved. */
export interface TagInputCountFacts {
  count: number
  max?: number
  atMax: boolean
}

/** The props the law mounts a TagInput with. A prop the law leaves out is not passed. */
export interface TagInputCountLawProps {
  'aria-label': string
  defaultValue: string[]
  max?: number
  countLabel?: (tags: TagInputCountFacts) => string
  removedLabel?: (tag: string, count: number) => string
}

export interface TagInputCountLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /**
   * Mounts one TagInput with these props, after any the test mounted before
   * it. A prop the law leaves out is not passed.
   */
  mount(props: TagInputCountLawProps): Promise<unknown>
}

/** The TagInput mounted last: a test mounts several, and each mount is added at the end of the body. */
const root = (): HTMLElement => {
  const element = [...document.querySelectorAll<HTMLElement>('[data-member="tag-input"]')].at(-1)
  if (element === undefined) throw new Error('the TagInput rendered nothing')
  return element
}

/** The field: the one text entry, which FormField's label names. */
const field = (): HTMLInputElement => {
  const element = root().querySelector<HTMLInputElement>('input:not([type="hidden"])')
  if (element === null) throw new Error('the TagInput has no field')
  return element
}

/** The field's description: the text of each element its `aria-describedby` names, in order. */
const described = (): string =>
  (field().getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter((id) => id !== '')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

/** What the live region says: the removal announcement. */
const announced = (): string => {
  const region = root().querySelector<HTMLElement>('[aria-live="polite"]')
  if (region === null) throw new Error('the TagInput has no polite live region')
  return (region.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** Presses the remove button of the first chip, as a pointer does. */
const removeFirst = (): void => {
  const remove = root().querySelector<HTMLButtonElement>('li button')
  if (remove === null) throw new Error('the TagInput drew no remove button')
  remove.click()
}

/** A host's sentence in French, and the facts it was given, last call last. */
function french() {
  const given: TagInputCountFacts[] = []
  const countLabel = (tags: TagInputCountFacts) => {
    given.push(tags)
    if (tags.atMax) return `${tags.max} étiquettes au maximum`
    return tags.count === 1 ? '1 étiquette' : `${tags.count} étiquettes`
  }
  return { given, countLabel }
}

/** A host's removal announcement in French, and the tag and count it was given, last call last. */
function frenchRemoval() {
  const given: [string, number][] = []
  const removedLabel = (tag: string, count: number) => {
    given.push([tag, count])
    return `${tag} retirée, il en reste ${count}`
  }
  return { given, removedLabel }
}

export function tagInputCountLaw({ shell, mount }: TagInputCountLaw): void {
  describe(`${shell} TagInput — what it says of its count`, () => {
    beforeAll(installTestTheme)

    it('says how many tags it holds, and the maximum once it holds that many, in English by default', async () => {
      await mount({ 'aria-label': 'Labels', defaultValue: ['billing', 'refund'] })
      expect(described()).toBe('2 added')

      await mount({ 'aria-label': 'Labels', defaultValue: ['billing', 'refund'], max: 3 })
      expect(described()).toBe('2 added')

      await mount({ 'aria-label': 'Labels', defaultValue: ['billing', 'refund', 'vip'], max: 3 })
      expect(described()).toBe('Maximum of 3 added')
    })

    it('says the host’s sentence from countLabel, given the count, the maximum and whether the field is full', async () => {
      const host = french()
      await mount({
        'aria-label': 'Étiquettes',
        defaultValue: ['facturation'],
        countLabel: host.countLabel,
      })
      expect(described()).toBe('1 étiquette')
      expect(host.given.at(-1)).toEqual({ count: 1, atMax: false })

      await mount({
        'aria-label': 'Étiquettes',
        defaultValue: ['facturation', 'remboursement'],
        max: 3,
        countLabel: host.countLabel,
      })
      expect(described()).toBe('2 étiquettes')
      expect(host.given.at(-1)).toEqual({ count: 2, max: 3, atMax: false })

      await mount({
        'aria-label': 'Étiquettes',
        defaultValue: ['facturation', 'remboursement', 'vip'],
        max: 3,
        countLabel: host.countLabel,
      })
      expect(described()).toBe('3 étiquettes au maximum')
      expect(host.given.at(-1)).toEqual({ count: 3, max: 3, atMax: true })
      expect(root().textContent).not.toMatch(/added/)
    })

    it('says the host’s sentence for the count a removal leaves', async () => {
      const host = french()
      await mount({
        'aria-label': 'Étiquettes',
        defaultValue: ['facturation', 'remboursement', 'vip'],
        max: 3,
        countLabel: host.countLabel,
      })
      removeFirst()
      await vi.waitFor(() => expect(described()).toBe('2 étiquettes'))
      expect(host.given.at(-1)).toEqual({ count: 2, max: 3, atMax: false })
    })

    it('announces a removal with how many tags remain, in English by default', async () => {
      await mount({ 'aria-label': 'Labels', defaultValue: ['billing', 'refund', 'vip'] })
      expect(announced()).toBe('')
      removeFirst()
      await vi.waitFor(() => expect(announced()).toBe('billing removed, 2 remain'))
    })

    it('announces the host’s sentence from removedLabel, given the tag and how many remain', async () => {
      const host = frenchRemoval()
      await mount({
        'aria-label': 'Étiquettes',
        defaultValue: ['facturation', 'remboursement', 'vip'],
        removedLabel: host.removedLabel,
      })
      removeFirst()
      await vi.waitFor(() => expect(announced()).toBe('facturation retirée, il en reste 2'))
      expect(host.given.at(-1)).toEqual(['facturation', 2])
      expect(root().textContent).not.toMatch(/removed|remain/)
    })
  })
}
