import { render } from '@testing-library/react'
import { useState } from 'react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { tokenColor, tokenLength } from '../controls/token-probe'
import { commandLaw } from '@polymorph/conformance/command'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { reactAdapter } from '../conformance/react'
import { Command, type CommandItem, type CommandProps } from './Command'

/**
 * The command palette in a real browser.
 *
 * The test covers the composition (`design/components/README-substrates.md`,
 * the command palette): Radix's dialog handles modality and the focus trap,
 * React Aria's collection handles filtering and `aria-activedescendant`, and
 * neither takes over the other's part. Every test below checks that boundary
 * or the recipe on top of it.
 */

const ITEMS: CommandItem[] = [
  { id: 'new', label: 'New ticket', icon: 'add', hint: 'N', onSelect: () => {} },
  { id: 'assign', label: 'Assign to me', icon: 'user', keywords: ['owner'], onSelect: () => {} },
  { id: 'archive', label: 'Archive ticket', icon: 'archive', onSelect: () => {} },
]

const GROUPED: CommandItem[] = [
  { id: 'new', label: 'New ticket', group: 'Tickets', onSelect: () => {} },
  { id: 'assign', label: 'Assign to me', group: 'Tickets', onSelect: () => {} },
  { id: 'theme', label: 'Switch theme', group: 'Workspace', onSelect: () => {} },
]

beforeAll(installTestTheme)

const panel = () => document.querySelector('[role="dialog"]') as HTMLElement | null
const input = () => document.querySelector('[role="combobox"]') as HTMLInputElement
const rows = () => [...document.querySelectorAll('[role="option"]')] as HTMLElement[]
const highlighted = () => rows().find((row) => row.hasAttribute('data-highlighted'))

/** The app's part: the screen decides what opens a palette. */
function Palette(props: Omit<CommandProps, 'open' | 'onOpenChange'> & { onClose?: () => void }) {
  const { onClose, ...palette } = props
  const [open, setOpen] = useState(true)
  return (
    <Command
      {...palette}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onClose?.()
      }}
    />
  )
}

async function openPalette(node: React.ReactElement): Promise<HTMLElement> {
  render(node)
  await vi.waitFor(() => expect(panel()).not.toBeNull())
  return panel() as HTMLElement
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<CommandProps>(true)
  })
})

describe('opening', () => {
  it('is a modal, named, with the caret in its input', async () => {
    const surface = await openPalette(<Palette items={ITEMS} />)
    expect(surface.getAttribute('aria-modal')).toBe('true')
    expect(surface.textContent).toContain('Command palette')
    await vi.waitFor(() => expect(document.activeElement).toBe(input()))
  })

  it('drives its list from the input, without ever focusing it', async () => {
    await openPalette(<Palette items={ITEMS} />)
    expect(input().getAttribute('role')).toBe('combobox')
    expect(rows()).toHaveLength(3)

    await vi.waitFor(() => {
      const active = input().getAttribute('aria-activedescendant')
      expect(active).toBeTruthy()
      expect(rows()[0]?.id).toBe(active)
    })
    expect(highlighted()?.textContent).toContain('New ticket')
    expect(document.activeElement).toBe(input())
  })

  it('shows which key dismisses it', async () => {
    const surface = await openPalette(<Palette items={ITEMS} />)
    expect(surface.querySelector('kbd')?.textContent).toBe('esc')
  })

  it('renders each row’s icon and its hint', async () => {
    await openPalette(<Palette items={ITEMS} />)
    const first = rows()[0] as HTMLElement
    expect(first.querySelector('[data-icon="add"]')).not.toBeNull()
    expect(first.querySelector('kbd')?.textContent).toBe('N')
  })
})

describe('the highlight is a selection, not a hover', () => {
  /**
   * The selection treatment (`design/components/README.md`): the palette's
   * active row is the pending selection, because Enter runs it. So it uses the
   * selection family, while a menu's transient hover keeps the accent wash.
   */
  it('paints the active row from the selection roles', async () => {
    await openPalette(<Palette items={ITEMS} />)
    const active = await vi.waitFor(() => {
      const row = highlighted()
      expect(row).toBeDefined()
      return row as HTMLElement
    })

    // The colours arrive at the end of the row's state-feedback transition,
    // which can take longer than the default second when the whole suite runs.
    await vi.waitFor(
      () => {
        const style = getComputedStyle(active)
        expect(style.backgroundColor).toBe(tokenColor('--pm-selection-bg'))
        expect(style.color).toBe(tokenColor('--pm-selection-text'))
      },
      { timeout: 5_000 },
    )
  })

  it('moves with the arrow keys and leaves the caret alone', async () => {
    await openPalette(<Palette items={ITEMS} />)
    await vi.waitFor(() => expect(highlighted()).toBeDefined())

    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(highlighted()?.textContent).toContain('Assign to me'))
    expect(document.activeElement).toBe(input())
  })
})

describe('filtering', () => {
  it('narrows as you type', async () => {
    await openPalette(<Palette items={ITEMS} />)
    await userEvent.keyboard('arch')
    await vi.waitFor(() => expect(rows()).toHaveLength(1))
    expect(rows()[0]?.textContent).toContain('Archive ticket')
  })

  it('matches on hidden keywords', async () => {
    await openPalette(<Palette items={ITEMS} />)
    await userEvent.keyboard('owner')
    await vi.waitFor(() => expect(rows()).toHaveLength(1))
    const [row] = rows()
    expect(row?.textContent).toContain('Assign to me')
    expect(row?.textContent).not.toContain('owner')
  })

  it('keeps a result highlighted, so Enter always has a target', async () => {
    await openPalette(<Palette items={ITEMS} />)
    await userEvent.keyboard('ticket')
    await vi.waitFor(() => expect(rows()).toHaveLength(2))
    await vi.waitFor(() => expect(highlighted()?.textContent).toContain('New ticket'))
  })

  it('leaves the list alone when the app owns the query', async () => {
    await openPalette(<Palette filter={false} items={ITEMS} />)
    await userEvent.keyboard('nothing matches this')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(rows()).toHaveLength(3)
  })
})

describe('groups', () => {
  it('partitions in the order it was given, and names each partition', async () => {
    const surface = await openPalette(<Palette items={GROUPED} />)
    const groups = [...surface.querySelectorAll('[role="group"]')] as HTMLElement[]
    expect(groups).toHaveLength(2)

    const labels = groups.map((group) => {
      const id = group.getAttribute('aria-labelledby') as string
      return document.getElementById(id)?.textContent
    })
    expect(labels).toEqual(['Tickets', 'Workspace'])
    expect(groups[0]?.querySelectorAll('[role="option"]')).toHaveLength(2)
  })
})

describe('running a command', () => {
  it('runs the highlighted command on Enter and closes', async () => {
    const run = vi.fn()
    const closed = vi.fn()
    await openPalette(
      <Palette
        onClose={closed}
        items={[{ id: 'new', label: 'New ticket', onSelect: run }, ...ITEMS.slice(1)]}
      />,
    )
    await vi.waitFor(() => expect(highlighted()).toBeDefined())
    await userEvent.keyboard('{Enter}')

    expect(run).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(panel()).toBeNull())
    expect(closed).toHaveBeenCalledWith()
  })

  it('runs one on a click, too', async () => {
    const run = vi.fn()
    await openPalette(<Palette items={[{ id: 'a', label: 'Archive ticket', onSelect: run }]} />)
    await userEvent.click(rows()[0] as HTMLElement)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('stays open for a palette that chains', async () => {
    const run = vi.fn()
    await openPalette(
      <Palette closeOnSelect={false} items={[{ id: 'a', label: 'Assign to me', onSelect: run }]} />,
    )
    await vi.waitFor(() => expect(highlighted()).toBeDefined())
    await userEvent.keyboard('{Enter}')

    expect(run).toHaveBeenCalledTimes(1)
    expect(panel()).not.toBeNull()
    // The list still responds.
    await vi.waitFor(() => expect(highlighted()).toBeDefined())
  })

  it('will not run a disabled command', async () => {
    const run = vi.fn()
    await openPalette(
      <Palette
        items={[
          { id: 'new', label: 'New ticket', onSelect: () => {} },
          { id: 'merge', label: 'Merge tickets', disabled: true, onSelect: run },
        ]}
      />,
    )
    const merge = rows().find((row) => row.textContent?.includes('Merge')) as HTMLElement
    expect(merge.dataset['disabled']).toBe('')
    expect(getComputedStyle(merge).color).toBe(tokenColor('--pm-text-disabled'))

    merge.click()
    expect(run).not.toHaveBeenCalled()
  })
})

describe('escape, in APG order', () => {
  it('clears a non-empty query and keeps the palette open', async () => {
    await openPalette(<Palette items={ITEMS} />)
    await userEvent.keyboard('arch')
    await vi.waitFor(() => expect(input().value).toBe('arch'))

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(input().value).toBe(''))
    expect(panel(), 'the first Escape closed the palette').not.toBeNull()
    // The full list returns too.
    await vi.waitFor(() => expect(rows()).toHaveLength(3))
  })

  it('closes when there is nothing left to clear', async () => {
    await openPalette(<Palette items={ITEMS} />)
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(panel()).toBeNull())
  })
})

describe('async states', () => {
  it('holds its size with three skeleton rows', async () => {
    const surface = await openPalette(<Palette loading items={[]} />)
    expect(surface.dataset['loading']).toBe('')
    expect(surface.querySelectorAll('[data-shape="text"]')).toHaveLength(3)
    expect(surface.querySelector('[role="status"]')?.textContent).toBe('Loading commands…')
  })

  it('announces once when nothing matches', async () => {
    const surface = await openPalette(<Palette items={[]} emptyMessage="No commands" />)
    const empty = surface.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(surface.textContent).toContain('No commands')
    expect(empty).not.toBeNull()
    expect(surface.querySelector('[role="status"]')?.textContent).toBe('No commands')
  })

  it('announces the result count', async () => {
    const surface = await openPalette(<Palette items={ITEMS} />)
    await vi.waitFor(() =>
      expect(surface.querySelector('[role="status"]')?.textContent).toBe('3 commands'),
    )
  })
})

/**
 * The palette below 30rem uses Dialog's full-screen rule, with no
 * `presentation` prop, because a palette has no compact phone form. The tests
 * cross the threshold by setting the viewport explicitly.
 */
describe('the palette below 30rem', () => {
  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  it('fills the screen: zero offset on both axes, no frame, the listbox as flex fill', async () => {
    await page.viewport(420, 800)
    const surface = await openPalette(<Palette items={ITEMS} />)

    await vi.waitFor(() => {
      const box = surface.getBoundingClientRect()
      expect(box.top).toBeCloseTo(0, 0)
      expect(box.width).toBeCloseTo(window.innerWidth, 0)
      expect(box.height).toBeCloseTo(window.innerHeight, 0)
    })

    const style = getComputedStyle(surface)
    expect(style.borderTopLeftRadius).toBe('0px')
    expect(style.borderTopWidth).toBe('0px')

    // The min(60vh, …) cap gives way to the flex fill: the list is the panel's
    // body and scrolls below the fixed search row, as above the threshold.
    const listbox = surface.querySelector('[role="listbox"]') as HTMLElement
    expect(getComputedStyle(listbox).maxBlockSize).toBe('none')
    const search = input().closest('div') as HTMLElement
    const listBottom = listbox.getBoundingClientRect()
    expect(search.getBoundingClientRect().top).toBeLessThan(listBottom.top)
    expect(listBottom.bottom).toBeCloseTo(window.innerHeight, 0)

    // The input takes the text-entry floor's size below the line (conventions §13).
    expect(getComputedStyle(input()).fontSize).toBe(tokenLength('--pm-text-entry-size'))
  })

  it('keeps filtering, arrow keys and Enter unchanged', async () => {
    await page.viewport(420, 800)
    const onSelect = vi.fn()
    await openPalette(
      <Palette
        items={[
          { id: 'new', label: 'New ticket', onSelect: () => {} },
          { id: 'assign', label: 'Assign to me', onSelect },
        ]}
      />,
    )

    await userEvent.keyboard('assign')
    await vi.waitFor(() => expect(rows()).toHaveLength(1))
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('keeps a list longer than the window inside it, and scrolls the list', async () => {
    // A phone held upright, with more rows than it can show. The panel is
    // stretched to the window, so the list is what gives way and scrolls.
    await page.viewport(375, 600)
    const many = Array.from({ length: 60 }, (_, at) => ({
      id: `command-${at + 1}`,
      label: `Command ${at + 1}`,
      onSelect: () => {},
    }))
    const surface = await openPalette(<Palette items={many} />)
    await vi.waitFor(() => expect(rows()).toHaveLength(60))

    await vi.waitFor(() => {
      const box = surface.getBoundingClientRect()
      expect(box.top).toBeGreaterThanOrEqual(-0.5)
      expect(box.bottom, 'the panel runs past the window').toBeLessThanOrEqual(
        window.innerHeight + 0.5,
      )
    })
    const search = input().closest('div') as HTMLElement
    expect(search.getBoundingClientRect().top).toBeGreaterThanOrEqual(-0.5)
    const listbox = surface.querySelector('[role="listbox"]') as HTMLElement
    expect(listbox.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight + 0.5)
    expect(listbox.scrollHeight, 'the list does not scroll').toBeGreaterThan(listbox.clientHeight)
  })

  it('returns to the high card above 30rem', async () => {
    const surface = await openPalette(<Palette items={ITEMS} />)
    const box = surface.getBoundingClientRect()
    expect(box.top).toBeGreaterThan(0)
    expect(box.width).toBeLessThan(window.innerWidth)
  })
})

/**
 * An agent runs a command through the bridge, as the spec's `agent` fence declares
 * (`design/components/command.md`, Agent): by its id, while the palette is open and listed,
 * running its own `onSelect`, and closing the palette as a person's choice does, unless it
 * chains.
 */
describe('an agent', () => {
  it('lists no closed palette, and runs none of its commands', async () => {
    const bridge = createAgentBridge()
    try {
      const archive = vi.fn()
      const onOpenChange = vi.fn()
      render(
        <Command
          open={false}
          onOpenChange={onOpenChange}
          items={[{ id: 'archive', label: 'Archive ticket', onSelect: archive }]}
        />,
      )
      // A closed palette has no panel, so the bridge lists nothing for it.
      expect(bridge.snapshot().members.filter((member) => member.member === 'Command')).toEqual([])
      const ran = await bridge.act([
        { target: { member: 'Command' }, action: 'choose', value: 'archive' },
      ])
      expect(ran.results[0]).toMatchObject({ ok: false, error: { code: 'unknown-member' } })
      expect(archive).not.toHaveBeenCalled()
      expect(onOpenChange).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })

  it('refuses a disabled command of an open palette', async () => {
    const bridge = createAgentBridge()
    try {
      const archive = vi.fn()
      render(
        <Command
          open
          onOpenChange={() => {}}
          items={[
            { id: 'archive', label: 'Archive ticket', onSelect: archive },
            { id: 'merge', label: 'Merge tickets', disabled: true, onSelect: archive },
          ]}
        />,
      )
      await vi.waitFor(() =>
        expect(bridge.snapshot().members.some((member) => member.member === 'Command')).toBe(true),
      )
      const member = bridge.snapshot().members.find((each) => each.member === 'Command')
      expect(member?.state).toMatchObject({
        open: true,
        items: [
          { id: 'archive', label: 'Archive ticket' },
          { id: 'merge', label: 'Merge tickets', disabled: true },
        ],
      })
      const refused = await bridge.act([{ id: member?.id, action: 'choose', value: 'merge' }])
      expect(refused.results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
      expect(archive).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })

  it('reads the query a person typed, and closes an open palette after a command', async () => {
    const bridge = createAgentBridge()
    try {
      const assign = vi.fn()
      const closed = vi.fn()
      await openPalette(
        <Palette
          label="Once"
          items={[{ id: 'assign', label: 'Assign', onSelect: assign }]}
          onClose={closed}
        />,
      )
      await vi.waitFor(() => expect(document.activeElement).toBe(input()))
      await userEvent.keyboard('Ass')
      const palette = () => bridge.snapshot().members.find((each) => each.member === 'Command')
      await vi.waitFor(() => expect(palette()?.state['query']).toBe('Ass'))
      const member = palette()
      expect(member?.name).toBe('Once')
      const { results } = await bridge.act([{ id: member?.id, action: 'choose', value: 'assign' }])
      expect(results[0]).toMatchObject({ ok: true, changed: { open: { from: true, to: false } } })
      expect(assign).toHaveBeenCalledOnce()
      expect(closed).toHaveBeenCalledOnce()
    } finally {
      bridge.dispose()
    }
  })

  it('keeps a chaining palette open after a command', async () => {
    const bridge = createAgentBridge()
    try {
      const assign = vi.fn()
      await openPalette(
        <Palette
          closeOnSelect={false}
          items={[{ id: 'assign', label: 'Assign', onSelect: assign }]}
        />,
      )
      const member = bridge.snapshot().members.find((each) => each.member === 'Command')
      const { results } = await bridge.act([{ id: member?.id, action: 'choose', value: 'assign' }])
      expect(results[0]).toEqual({ ok: true, id: member?.id, changed: {} })
      expect(assign).toHaveBeenCalledOnce()
      expect(panel()).not.toBeNull()
    } finally {
      bridge.dispose()
    }
  })
})

/**
 * What the status region says, by default and in a host's words from
 * `spoken`, is the law every shell runs (`@polymorph/conformance/command`).
 */
commandLaw({ shell: 'React', adapter: reactAdapter })
