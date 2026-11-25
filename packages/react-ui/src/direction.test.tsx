import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { directionLaw } from '@polymorph/conformance/direction'
import { installTestTheme } from '@polymorph/engine/testing'

import { reactAdapter } from './conformance/react'
import { Rating } from './controls/Rating'
import { GALLERIES } from './galleries'
import { Tabs } from './overlays/Tabs'

/**
 * The reading-direction law for the React shell, as
 * `@polymorph/conformance/direction` states it for every shell: no member
 * says left-to-right in a right-to-left document, and Tabs turns with it.
 */
directionLaw({ shell: 'React', adapter: reactAdapter, galleries: GALLERIES })

/**
 * A section of a left-to-right page that says `dir="rtl"` (`readDirection` in `@polymorph/engine`):
 * a member inside it reads the direction of the place it is mounted in, so its row starts at the
 * right and the arrow that points left moves to the next item.
 */
describe('reading direction — a right-to-left section of a left-to-right page', () => {
  beforeAll(installTestTheme)

  function inSection(node: React.ReactElement) {
    const section = document.createElement('section')
    section.setAttribute('dir', 'rtl')
    document.body.append(section)
    const view = render(node, { container: section })
    return { ...view, section }
  }

  afterEach(() => {
    cleanup()
    for (const section of document.querySelectorAll('section[dir]')) section.remove()
  })

  it('turns Tabs: the arrow that points left moves to the next tab', async () => {
    inSection(
      <Tabs
        tabs={[
          { value: 'one', label: 'One' },
          { value: 'two', label: 'Two' },
          { value: 'three', label: 'Three' },
        ]}
      >
        <Tabs.Content value="one">First</Tabs.Content>
        <Tabs.Content value="two">Second</Tabs.Content>
        <Tabs.Content value="three">Third</Tabs.Content>
      </Tabs>,
    )
    const [one, two] = screen.getAllByRole('tab') as [HTMLElement, HTMLElement]
    await vi.waitFor(() => expect(one.closest('[dir]')?.getAttribute('dir')).toBe('rtl'))
    one.focus()
    await userEvent.keyboard('{ArrowLeft}')
    await vi.waitFor(() => expect(document.activeElement).toBe(two))
  })

  it('turns Rating: the arrow that points left moves to the next mark', async () => {
    inSection(<Rating label="Rate this answer" value={1} onChange={() => {}} />)
    const marks = screen.getAllByRole('radio')
    ;(marks[0] as HTMLElement).focus()
    await userEvent.keyboard('{ArrowLeft}')
    await vi.waitFor(() => expect(document.activeElement).toBe(marks[1]))
  })

  it('follows a section whose direction changes while the member is on the page', async () => {
    const { section } = inSection(
      <Tabs
        tabs={[
          { value: 'one', label: 'One' },
          { value: 'two', label: 'Two' },
        ]}
      >
        <Tabs.Content value="one">First</Tabs.Content>
        <Tabs.Content value="two">Second</Tabs.Content>
      </Tabs>,
    )
    const root = () => document.querySelector('[data-member="tabs"]') as HTMLElement
    await vi.waitFor(() => expect(root().getAttribute('dir')).toBe('rtl'))
    section.setAttribute('dir', 'ltr')
    await vi.waitFor(() => expect(root().getAttribute('dir')).toBe('ltr'))
  })
})
