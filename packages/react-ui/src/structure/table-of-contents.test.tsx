import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { tableOfContentsLaw } from '@polymorph/conformance/table-of-contents'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { TableOfContents, type TableOfContentsProps } from './TableOfContents'

/**
 * Which section a TableOfContents marks, and what a click on a link does, is
 * the law every shell runs (`@polymorph/conformance/table-of-contents`). The
 * tests after it are the claims a browser settles for the recipe, which every
 * shell shares: the current link's fill, a subsection's indent in both reading
 * directions, and a long label in a phone's column.
 */

beforeAll(installTestTheme)

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('dir')
})

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<TableOfContentsProps>(true)
  })
})

tableOfContentsLaw({
  shell: 'React',
  async mount({ items, onCurrentChange }) {
    const { rerender, unmount } = render(
      <TableOfContents label="On this page" items={items} onCurrentChange={onCurrentChange} />,
    )
    return {
      set(next) {
        rerender(
          <TableOfContents label="On this page" items={next} onCurrentChange={onCurrentChange} />,
        )
      },
      unmount,
    }
  },
})

const ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'install', label: 'Install' },
  { id: 'npm', label: 'With npm', level: 2 as const },
  { id: 'configure', label: 'Configure' },
]

const link = (name: string) => screen.getByRole('link', { name })

/** Two sections, so the first is current and the list is followed. */
function sections() {
  const box = document.createElement('div')
  box.style.cssText = 'height: 200px; overflow-y: auto'
  for (const id of ['overview', 'install']) {
    const section = document.createElement('section')
    section.id = id
    section.style.height = '300px'
    box.append(section)
  }
  document.body.prepend(box)
  return box
}

describe('the recipe', () => {
  it('draws the current link in the selection colours, and the others without a fill', async () => {
    const box = sections()
    render(<TableOfContents label="On this page" items={ITEMS} />)
    await expect.poll(() => link('Overview').getAttribute('aria-current')).toBe('location')

    const probe = document.createElement('div')
    probe.style.cssText = 'color: var(--pm-selection-text); background: var(--pm-selection-bg)'
    document.body.append(probe)
    const selection = getComputedStyle(probe)
    // The mark arrives after the first render, so the colour feedback's transition runs first.
    await expect
      .poll(() => getComputedStyle(link('Overview')).backgroundColor)
      .toBe(selection.backgroundColor)
    await expect.poll(() => getComputedStyle(link('Overview')).color).toBe(selection.color)
    expect(getComputedStyle(link('Install')).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    probe.remove()
    box.remove()
  })

  it('draws the label above the list as the landmark’s name', () => {
    render(<TableOfContents label="On this page" items={ITEMS} />)
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    const label = screen.getByText('On this page')
    expect(nav.firstElementChild).toBe(label)
    expect(label.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      link('Overview').getBoundingClientRect().top,
    )
  })

  it('draws a subsection one step in from the inline start, in both reading directions', () => {
    render(<TableOfContents label="On this page" items={ITEMS} />)
    const section = link('Install').getBoundingClientRect()
    const subsection = link('With npm').getBoundingClientRect()
    expect(subsection.left).toBeGreaterThan(section.left)
    expect(subsection.right).toBe(section.right)

    document.documentElement.dir = 'rtl'
    const rtlSection = link('Install').getBoundingClientRect()
    const rtlSubsection = link('With npm').getBoundingClientRect()
    expect(rtlSubsection.right).toBeLessThan(rtlSection.right)
    expect(rtlSubsection.left).toBe(rtlSection.left)
  })

  it('wraps a long label in a phone’s column, and does not scroll sideways', () => {
    const label = 'Delegated administration approvals awaiting a second reviewer in every region'
    render(
      <div data-testid="column" style={{ inlineSize: '200px' }}>
        <TableOfContents label="On this page" items={[{ id: 'approvals', label }, ...ITEMS]} />
      </div>,
    )
    const column = screen.getByTestId('column')
    expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth)
    const long = link(label)
    expect(long.getBoundingClientRect().right).toBeLessThanOrEqual(
      column.getBoundingClientRect().right,
    )
    // More than one line: taller than a one-line link.
    expect(long.getBoundingClientRect().height).toBeGreaterThan(
      link('Overview').getBoundingClientRect().height,
    )
  })
})

/**
 * An agent goes to a section through the bridge, as the spec's `agent` fence declares
 * (`design/components/table-of-contents.md`, Agent): its link's press marks the section and
 * reports it, as a person's does.
 */
describe('an agent', () => {
  it('reads the sections and the current one, and goes to another', async () => {
    const box = sections()
    const bridge = createAgentBridge()
    try {
      const onCurrentChange = vi.fn()
      render(
        <TableOfContents label="On this page" items={ITEMS} onCurrentChange={onCurrentChange} />,
      )
      const [contents] = bridge.snapshot().members
      expect(contents).toMatchObject({
        member: 'TableOfContents',
        name: 'On this page',
        state: {
          current: 'overview',
          items: [
            { id: 'overview', label: 'Overview' },
            { id: 'install', label: 'Install' },
            { id: 'npm', label: 'With npm' },
            { id: 'configure', label: 'Configure' },
          ],
        },
      })
      const { results } = await bridge.act([
        { id: contents?.id, action: 'choose', value: 'install' },
      ])
      expect(results[0]).toMatchObject({
        ok: true,
        changed: { current: { from: 'overview', to: 'install' } },
      })
      expect(onCurrentChange).toHaveBeenLastCalledWith('install')
      await expect.poll(() => link('Install').getAttribute('aria-current')).toBe('location')
    } finally {
      bridge.dispose()
      box.remove()
    }
  })
})
