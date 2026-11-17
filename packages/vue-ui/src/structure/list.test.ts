import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'

import { installTestTheme } from '@polymorph/engine/testing'

import Switch from '../controls/Switch.vue'
import { mount } from '../mount'
import Badge from './Badge.vue'
import List from './List.vue'
import ListItem from './ListItem.vue'

/**
 * What the generated List settles in a browser, as the React member's test
 * holds it (`design/components/list.md`): which trailing content takes its own
 * press, and which item may be the current one.
 */

beforeAll(installTestTheme)

describe('a trailing mark that is not a control', () => {
  it('leaves its press to the row', async () => {
    const onNavigate = vi.fn()
    const { host } = await mount(() =>
      h(List, { label: 'Members' }, () => [
        h(
          ListItem,
          { title: 'Ada Okafor', href: '/members/ada', onNavigate },
          { trailing: () => h(Badge, null, () => 'Admin') },
        ),
      ]),
    )
    // Aimed at the Badge's centre through the row: the Badge itself takes no
    // pointer event, so a click addressed to it would never land.
    const item = host.querySelector('li') as HTMLElement
    const row = item.getBoundingClientRect()
    const badge = (
      host.querySelector('[data-member="badge"]') as HTMLElement
    ).getBoundingClientRect()
    await userEvent.click(item, {
      position: {
        x: badge.left + badge.width / 2 - row.left,
        y: badge.top + badge.height / 2 - row.top,
      },
    })
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('/members/ada')
  })
})

describe('a trailing control', () => {
  it('takes its own press, and the row does not', async () => {
    const onNavigate = vi.fn()
    const onCheckedChange = vi.fn()
    const { host } = await mount(() =>
      h(List, { label: 'Notifications' }, () => [
        h(
          ListItem,
          { title: 'Weekly digest', href: '/notifications/digest', onNavigate },
          { trailing: () => h(Switch, { 'aria-label': 'Weekly digest', onCheckedChange }) },
        ),
      ]),
    )
    await userEvent.click(host.querySelector('[role="switch"]') as HTMLElement)
    expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true)
    expect(onNavigate).not.toHaveBeenCalled()
  })
})

describe('an item that is only read', () => {
  it('is never the current item, because it has no link or button to say so', async () => {
    const { host } = await mount(() =>
      h(List, { label: 'Sign-ins' }, () => [
        h(ListItem, { title: 'Ada Okafor', current: true }),
        h(ListItem, { title: 'Bao Tran', href: '#bao', current: true }),
      ]),
    )
    const [read, link] = [...host.querySelectorAll<HTMLElement>('li')] as [HTMLElement, HTMLElement]
    expect(read.hasAttribute('data-current')).toBe(false)
    expect(link.hasAttribute('data-current')).toBe(true)
    expect(link.querySelector('a')?.getAttribute('aria-current')).toBe('page')
  })
})
