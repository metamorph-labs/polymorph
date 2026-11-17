import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { tabsOverflowLaw } from '@polymorph/conformance/tabs-overflow'
import { installTestTheme } from '@polymorph/engine/testing'

import { solidAdapter } from '../conformance/solid'
import { mount } from '../mount'
import Tabs from './Tabs'
import TabsContent from './TabsContent'

/**
 * Tabs in the Solid shell: a panel follows the current tab. A Solid component
 * runs once, so a panel whose whole rendering is a condition (`Tabs.Content`
 * renders while its tab is current) renders it as a fragment Solid reads again
 * (`packages/shells/src/solid.ts`); this checks that it does.
 */

beforeAll(installTestTheme)

const TABS = [
  { value: 'open', label: 'Open' },
  { value: 'solved', label: 'Solved' },
]

const panels = () =>
  [...document.querySelectorAll<HTMLElement>('[data-tabs-part="tabpanel"]')].map(
    (panel) => panel.textContent,
  )

describe('Tabs shows the current tab’s panel', () => {
  it('replaces the panel when another tab is chosen', async () => {
    await mount(() => (
      <Tabs tabs={TABS}>
        <TabsContent value="open">
          <p>Open tickets</p>
        </TabsContent>
        <TabsContent value="solved">
          <p>Solved tickets</p>
        </TabsContent>
      </Tabs>
    ))
    expect(panels()).toEqual(['Open tickets'])
    await userEvent.click(
      document.querySelector('[data-tabs-part="tab"]:nth-of-type(2)') as HTMLElement,
    )
    await vi.waitFor(() => expect(panels()).toEqual(['Solved tickets']))
  })
})

/*
 * A strip wider than its container (`design/components/tabs.md`, Overflow), as
 * `@polymorph/conformance/tabs-overflow` states it for every generated shell.
 */
tabsOverflowLaw({ shell: 'Solid', adapter: solidAdapter })
