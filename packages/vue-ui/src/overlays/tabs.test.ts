import { cdp, userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'

import { NO_MEDIA_EMULATION } from '@polymorph/conformance/engines'
import { tabsOverflowLaw } from '@polymorph/conformance/tabs-overflow'
import { installTestTheme } from '@polymorph/engine/testing'

import { vueAdapter } from '../conformance/vue'
import { mount } from '../mount'
import Tabs from './Tabs.vue'
import TabsContent from './TabsContent.vue'

/**
 * Tabs' indicator in the Vue shell (`design/components/tabs.md`, Motion). Zag
 * slides the rule between tabs with a CSS transition it writes inline; the
 * recipe gives that transition the motion tokens' duration and curve, so the
 * slide follows the temperament, and reduced motion and `none` make it a jump.
 */

beforeAll(installTestTheme)

const TABS = [
  { value: 'open', label: 'Open' },
  { value: 'solved', label: 'Solved' },
]

const indicator = () =>
  document.querySelector<HTMLElement>('[data-member="tabs"] [data-part="indicator"]') as HTMLElement

/**
 * Chromium's DevTools session, which the Playwright provider hands a test; its
 * type comes with the provider's Node types, which this package does not load.
 */
const devtools = () =>
  cdp() as unknown as { send(method: string, params: Record<string, unknown>): Promise<unknown> }

/** A duration as the browser computes it (`0.22s`), in milliseconds. */
const milliseconds = (value: string) =>
  value.trim().endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000

/**
 * Tabs, mounted, with the second tab chosen: the rule's computed transition
 * duration and property, and the surface token, while the machine slides it. The machine
 * writes its transition inline for the slide and clears it after, so the
 * style is read when that inline write lands; a later read could find the
 * slide over when the whole suite runs.
 */
async function slide(): Promise<{ duration: string; property: string; token: string }> {
  await mount(() =>
    h(Tabs, { tabs: TABS }, () =>
      TABS.map((tab) => h(TabsContent, { value: tab.value }, () => [h('p', tab.label)])),
    ),
  )
  await vi.waitFor(() => expect(indicator()).not.toBeNull())
  const second = document.querySelectorAll('[data-tabs-part="tab"]')[1] as Element
  const sliding = new Promise<{ duration: string; property: string; token: string }>((resolve) => {
    const observer = new MutationObserver(() => {
      const rule = indicator()
      const property = rule?.style.transitionProperty ?? ''
      if (rule === null || property === '' || property === 'none') return
      observer.disconnect()
      const style = getComputedStyle(rule)
      resolve({
        duration: style.transitionDuration,
        property: style.transitionProperty,
        token: style.getPropertyValue('--pm-motion-duration-surface'),
      })
    })
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style'] })
  })
  await userEvent.click(second)
  return sliding
}

describe('the indicator slides with the motion tokens', () => {
  it('takes the surface duration, not the machine’s own', async () => {
    const { duration, token } = await slide()
    expect(milliseconds(token)).toBeGreaterThan(0)
    expect(milliseconds(duration)).toBe(milliseconds(token))
  })

  it('jumps at `none`, where the tokens are 0ms', async () => {
    document.documentElement.setAttribute('data-motion', 'none')
    try {
      expect(milliseconds((await slide()).duration)).toBe(0)
    } finally {
      document.documentElement.removeAttribute('data-motion')
    }
  })

  it.skipIf(NO_MEDIA_EMULATION)('jumps under reduced motion', async () => {
    await devtools().send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    })
    try {
      expect((await slide()).property).toBe('none')
    } finally {
      await devtools().send('Emulation.setEmulatedMedia', { features: [] })
    }
  })
})

/*
 * A strip wider than its container (`design/components/tabs.md`, Overflow), as
 * `@polymorph/conformance/tabs-overflow` states it for every generated shell.
 */
tabsOverflowLaw({ shell: 'Vue', adapter: vueAdapter })
