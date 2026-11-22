import { render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { fixedWidthHost, installTestTheme } from '@polymorph/engine/testing'
import { tokenColor, tokenLength } from '../controls/token-probe'
import { Code, type CodeProps } from './Code'
import { CodeBlock, type CodeBlockProps } from './CodeBlock'
import { Heading, type HeadingProps } from './Heading'
import { Text, type TextProps } from './Text'

/**
 * The text tier: Heading, Text, Code and CodeBlock.
 *
 * One decision each: a Heading is a real heading at its stated level, emphasis
 * takes the primary colour whatever the tone, inline code has one size whatever
 * the text size, and a wide block scrolls inside itself and is reachable by
 * keyboard.
 *
 * Type values are read from the theme, not hard-coded, so the tests check the
 * scale rather than the default system's 20px.
 */

beforeAll(installTestTheme)

function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

/** The four properties a type step decides, as the browser computed them. */
function quartet(element: HTMLElement) {
  const style = getComputedStyle(element)
  return {
    family: style.fontFamily,
    size: style.fontSize,
    weight: style.fontWeight,
    lineHeight: style.lineHeight,
  }
}

/** The same four, resolved straight off the token set for a named step. */
function step(name: string) {
  const probe = document.createElement('div')
  probe.style.fontFamily = `var(--pm-text-${name}-family)`
  probe.style.fontSize = `var(--pm-text-${name}-size)`
  probe.style.fontWeight = `var(--pm-text-${name}-weight)`
  probe.style.lineHeight = `var(--pm-text-${name}-line-height)`
  document.body.append(probe)
  const resolved = quartet(probe)
  probe.remove()
  return resolved
}

describe('the closed surfaces', () => {
  it('leave no way to style any of them from a call site', () => {
    assertGoverned<HeadingProps>(true)
    assertGoverned<TextProps>(true)
    assertGoverned<CodeProps>(true)
    assertGoverned<CodeBlockProps>(true)
  })
})

describe('Heading', () => {
  it('is a real heading, at the level it was asked for', () => {
    render(
      <>
        <Heading>Members</Heading>
        <Heading level={3}>Invited</Heading>
      </>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Members' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Invited' })).toBeTruthy()
  })

  it('renders the element for its level, so the outline matches', () => {
    expect(mount(<Heading>Members</Heading>).tagName).toBe('H2')
    expect(mount(<Heading level={3}>Invited</Heading>).tagName).toBe('H3')
    expect(mount(<Heading level={4}>By email</Heading>).tagName).toBe('H4')
  })

  it('sets level 2 at the text.xl quartet and level 3 at text.lg', () => {
    expect(quartet(mount(<Heading>Members</Heading>))).toEqual(step('xl'))
    expect(quartet(mount(<Heading level={3}>Invited</Heading>))).toEqual(step('lg'))
  })

  it('marks level 4 by weight: body size, xl weight', () => {
    // Matches Text's `strong` cell. Below text.lg the sizes are body sizes, so
    // weight marks the level, and the weight comes from the scale.
    const four = quartet(mount(<Heading level={4}>By email</Heading>))
    expect(four.size).toBe(step('md').size)
    expect(four.weight).toBe(step('xl').weight)
  })

  it('puts its id on the heading element, so a fragment link names the section it opens', () => {
    const heading = mount(<Heading id="members">Members</Heading>)
    expect(heading.tagName).toBe('H2')
    expect(heading.id).toBe('members')
    expect(document.getElementById('members')).toBe(heading)
    expect(mount(<Heading>Invited</Heading>).hasAttribute('id')).toBe(false)
  })

  it('cannot render an h1', () => {
    // @ts-expect-error — PageHeader owns the page title, so a second h1 fails to
    // type-check instead of relying on review.
    const unlawful = <Heading level={1}>Page</Heading>
    expect(unlawful).toBeTruthy()
  })

  it('uses the primary text colour at both levels, so hierarchy comes from size', () => {
    expect(getComputedStyle(mount(<Heading>Members</Heading>)).color).toBe(
      tokenColor('--pm-text-primary'),
    )
    expect(getComputedStyle(mount(<Heading level={3}>Invited</Heading>)).color).toBe(
      tokenColor('--pm-text-primary'),
    )
  })

  it('has no margin, so the surrounding Stack sets the rhythm', () => {
    const style = getComputedStyle(mount(<Heading>Members</Heading>))
    for (const side of ['marginTop', 'marginBottom', 'marginLeft', 'marginRight'] as const) {
      expect(style[side], side).toBe('0px')
    }
  })
})

describe('Text', () => {
  it('is a real paragraph', () => {
    expect(mount(<Text>Body</Text>).tagName).toBe('P')
  })

  it('sizes from the scale: md by default, sm on request', () => {
    expect(quartet(mount(<Text>Body</Text>))).toEqual(step('md'))
    expect(quartet(mount(<Text size="sm">Body</Text>))).toEqual(step('sm'))
  })

  it('takes its colour from the tone, with secondary as the lightest', () => {
    expect(getComputedStyle(mount(<Text>Body</Text>)).color).toBe(tokenColor('--pm-text-primary'))
    expect(getComputedStyle(mount(<Text tone="secondary">Body</Text>)).color).toBe(
      tokenColor('--pm-text-secondary'),
    )
  })

  it('gives emphasis a heavier weight and the primary text colour', () => {
    // A bold phrase in secondary text is the most important part of the
    // sentence, and in the paragraph's colour it would only be heavier grey.
    const paragraph = mount(
      <Text size="sm" tone="secondary">
        Deviation is either <strong>impossible</strong> or loud.
      </Text>,
    )
    const emphasis = paragraph.querySelector('strong') as HTMLElement
    const style = getComputedStyle(emphasis)

    expect(style.fontWeight).toBe(step('xl').weight)
    expect(style.fontWeight).not.toBe(getComputedStyle(paragraph).fontWeight)
    expect(style.color).toBe(tokenColor('--pm-text-primary'))
    expect(getComputedStyle(paragraph).color).toBe(tokenColor('--pm-text-secondary'))
  })

  it('carries no margin of its own', () => {
    const style = getComputedStyle(mount(<Text>Body</Text>))
    expect(style.marginTop).toBe('0px')
    expect(style.marginBottom).toBe('0px')
  })
})

describe('Text: lines', () => {
  const LONG =
    'Replies reach the customer by email, stay in the ticket’s history, and are searchable ' +
    'by everyone who can open the ticket in this workspace, whichever team it belongs to.'

  /** A paragraph in a narrow host, so the long text needs several lines. */
  function narrow(node: React.ReactElement): { host: HTMLElement; paragraph: HTMLElement } {
    const host = fixedWidthHost(200)
    const paragraph = render(node, { container: host }).container.firstElementChild as HTMLElement
    return { host, paragraph }
  }

  function lineBox(paragraph: HTMLElement): number {
    const style = getComputedStyle(paragraph)
    return parseFloat(style.lineHeight)
  }

  it('draws one line and cuts the rest, keeping the whole text in the document', () => {
    const { host, paragraph } = narrow(<Text lines={1}>{LONG}</Text>)
    expect(paragraph.dataset['lines']).toBe('1')
    expect(paragraph.getBoundingClientRect().height).toBeCloseTo(lineBox(paragraph), 0)
    expect(paragraph.scrollHeight).toBeGreaterThan(paragraph.clientHeight)
    // A screen reader and a copy get every word.
    expect(paragraph.textContent).toBe(LONG)
    expect(getComputedStyle(paragraph).webkitLineClamp).toBe('1')
    host.remove()
  })

  it('draws as many lines as it is given', () => {
    const { host, paragraph } = narrow(<Text lines={3}>{LONG}</Text>)
    expect(paragraph.getBoundingClientRect().height).toBeCloseTo(3 * lineBox(paragraph), 0)
    expect(paragraph.scrollHeight).toBeGreaterThan(paragraph.clientHeight)
    host.remove()
  })

  it('breaks a word longer than the line, so it never widens what holds it', () => {
    const hash = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
    const { host, paragraph } = narrow(
      <Text size="sm" lines={1}>
        <Code>{hash}</Code>
      </Text>,
    )
    expect(paragraph.getBoundingClientRect().width).toBeLessThanOrEqual(200)
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth)
    // One line: the mono face may set the line a pixel taller than the paragraph's own.
    expect(paragraph.getBoundingClientRect().height).toBeLessThan(2 * lineBox(paragraph))
    expect(paragraph.scrollHeight).toBeGreaterThan(paragraph.clientHeight)
    host.remove()
  })

  it('cuts nothing without lines, below one, or for a value that is not a number', () => {
    for (const lines of [undefined, 0, -1, Number.NaN]) {
      const { host, paragraph } = narrow(<Text lines={lines}>{LONG}</Text>)
      expect(paragraph.hasAttribute('data-lines'), String(lines)).toBe(false)
      expect(paragraph.getAttribute('style'), String(lines)).toBeNull()
      expect(paragraph.scrollHeight, String(lines)).toBe(paragraph.clientHeight)
      host.remove()
    }
  })

  it('reads a count that is not whole as the whole number below it', () => {
    const { host, paragraph } = narrow(<Text lines={2.7}>{LONG}</Text>)
    expect(paragraph.dataset['lines']).toBe('2')
    expect(paragraph.getBoundingClientRect().height).toBeCloseTo(2 * lineBox(paragraph), 0)
    host.remove()
  })
})

describe('Code', () => {
  function chip(node: React.ReactElement): HTMLElement {
    return render(node).container.querySelector('code') as HTMLElement
  }

  it('is a real <code>, so it has code semantics natively', () => {
    expect(chip(<Code>pm-system</Code>).tagName).toBe('CODE')
  })

  it('uses the theme’s mono font on the subtle fill', () => {
    const style = getComputedStyle(chip(<Code>pm-system</Code>))
    const mono = getComputedStyle(document.documentElement)
      .getPropertyValue('--pm-font-mono')
      .trim()

    // Compared without quotes. Quotes around a family name are optional CSS
    // syntax, and WebKit's computed serialization drops the ones the token writes.
    const families = (list: string) => list.replaceAll('"', '')
    expect(families(style.fontFamily)).toBe(families(mono))
    expect(style.backgroundColor).toBe(tokenColor('--pm-bg-subtle'))
    expect(style.color).toBe(tokenColor('--pm-text-primary'))
    expect(style.borderTopLeftRadius).toBe(tokenLength('--pm-radius-sm'))
  })

  it('has one mono size on a page, whatever the surrounding text size', () => {
    // Fixed at `sm`, not relative. Otherwise a page with both text sizes would
    // have two mono sizes that nobody chose.
    const inMedium = chip(
      <Text>
        Set <Code>pm-system</Code>
      </Text>,
    )
    const inSmall = chip(
      <Text size="sm">
        Set <Code>pm-system</Code>
      </Text>,
    )

    expect(getComputedStyle(inMedium).fontSize).toBe(step('sm').size)
    expect(getComputedStyle(inSmall).fontSize).toBe(getComputedStyle(inMedium).fontSize)
  })

  it('pads the inline axis only, so a sentence containing one is not taller', () => {
    const style = getComputedStyle(chip(<Code>pm-system</Code>))
    expect(style.paddingTop).toBe('0px')
    expect(style.paddingBottom).toBe('0px')
    expect(style.paddingLeft).toBe(tokenLength('--pm-space-1'))
  })
})

describe('CodeBlock', () => {
  const COMMAND = 'pnpm install\npnpm dev'
  const WIDE = `polymorph add ${'button dialog drawer command popover menu tabs '.repeat(6)}`

  it('is a <pre> wrapping a <code>, with the whitespace kept', () => {
    const block = mount(<CodeBlock>{COMMAND}</CodeBlock>)
    expect(block.tagName).toBe('PRE')
    expect((block.firstElementChild as HTMLElement).tagName).toBe('CODE')
    expect(getComputedStyle(block).whiteSpace).toBe('pre')
    expect(block.textContent).toBe(COMMAND)
  })

  it('uses the mono font on a bordered subtle surface', () => {
    const style = getComputedStyle(mount(<CodeBlock>{COMMAND}</CodeBlock>))
    expect(style.backgroundColor).toBe(tokenColor('--pm-bg-subtle'))
    expect(style.borderTopColor).toBe(tokenColor('--pm-border-subtle'))
    expect(style.borderTopWidth).toBe('1px')
    expect(style.borderTopLeftRadius).toBe(tokenLength('--pm-radius-md'))
    expect(style.paddingTop).toBe(tokenLength('--pm-space-4'))
  })

  it('is not a tab stop while everything fits', async () => {
    const block = mount(<CodeBlock>{COMMAND}</CodeBlock>)
    await vi.waitFor(() => expect(block.hasAttribute('data-overflowing')).toBe(false))
    expect(block.hasAttribute('tabindex')).toBe(false)
    expect(block.hasAttribute('role')).toBe(false)
    expect(block.hasAttribute('aria-label')).toBe(false)
  })

  it('scrolls inside itself and becomes a named tab stop once it overflows', async () => {
    const host = fixedWidthHost(240)
    render(<CodeBlock>{WIDE}</CodeBlock>, { container: host })
    const block = host.firstElementChild as HTMLElement

    await vi.waitFor(() => expect(block.tabIndex).toBe(0))
    expect(block.dataset['overflowing']).toBe('')
    expect(block.getAttribute('role')).toBe('region')
    expect(block.getAttribute('aria-label')).toBe('Code block')

    // The main point: the block scrolls internally, and the page gets no wider.
    expect(block.scrollWidth).toBeGreaterThan(block.clientWidth)
    expect(getComputedStyle(block).overflowX).toBe('auto')
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    )

    host.remove()
  })

  it('takes the region’s name from the call site when one is given', async () => {
    // The content identifies the region but not the language to announce it in,
    // and every other string this vocabulary announces comes from the app.
    const host = fixedWidthHost(240)
    render(<CodeBlock label="Bloc de code">{WIDE}</CodeBlock>, { container: host })
    const block = host.firstElementChild as HTMLElement

    await vi.waitFor(() => expect(block.tabIndex).toBe(0))
    expect(block.getAttribute('aria-label')).toBe('Bloc de code')

    host.remove()
  })

  it('re-measures when the code changes, not only when the box does', async () => {
    const host = fixedWidthHost(240)
    const { rerender } = render(<CodeBlock>{COMMAND}</CodeBlock>, { container: host })
    const block = host.firstElementChild as HTMLElement
    await vi.waitFor(() => expect(block.hasAttribute('tabindex')).toBe(false))

    rerender(<CodeBlock>{WIDE}</CodeBlock>)
    await vi.waitFor(() => expect(block.tabIndex).toBe(0))

    host.remove()
  })
})

describe('CodeBlock: the copy control', () => {
  const COMMAND = 'pnpm add @polymorph/react-ui'

  /** A stubbed clipboard, because a test cannot assume headless permission grants. */
  function stubClipboard() {
    const writeText = vi.fn(() => Promise.resolve())
    const original = navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    return {
      writeText,
      restore: () => {
        Object.defineProperty(navigator, 'clipboard', { value: original, configurable: true })
      },
    }
  }

  it('renders a plain block with no wrapper and no control', () => {
    const block = mount(<CodeBlock>{COMMAND}</CodeBlock>)
    expect(block.tagName).toBe('PRE')
    expect(document.querySelector('button')).toBeNull()
  })

  it('draws a real, named Button as the corner control', () => {
    const root = mount(<CodeBlock copyable>{COMMAND}</CodeBlock>)
    const control = screen.getByRole('button', { name: 'Copy' })
    expect(control.dataset['variant']).toBe('ghost')
    expect(control.dataset['tone']).toBe('neutral')
    expect(control.dataset['iconOnly']).toBe('')
    expect(control.querySelector('svg')?.getAttribute('data-icon')).toBe('copy')

    // Outside the scroll region, so it is reachable whether or not the block
    // scrolls. The pre is a sibling, not an ancestor.
    expect(root.querySelector('pre')?.contains(control)).toBe(false)
  })

  it('localizes through copyLabel, as label does', () => {
    mount(
      <CodeBlock copyable copyLabel="Copier">
        {COMMAND}
      </CodeBlock>,
    )
    expect(screen.getByRole('button', { name: 'Copier' })).toBeTruthy()
  })

  it('reserves the corner while copyable, so the longest line scrolls clear of the control', () => {
    const bare = mount(<CodeBlock>{COMMAND}</CodeBlock>)
    const room = Number.parseFloat(getComputedStyle(bare).paddingInlineEnd)

    const copyable = mount(<CodeBlock copyable>{COMMAND}</CodeBlock>).querySelector(
      'pre',
    ) as HTMLElement
    // The button, the block's own padding beyond it, and the gap that keeps the
    // code off the button.
    expect(Number.parseFloat(getComputedStyle(copyable).paddingInlineEnd)).toBeCloseTo(
      room +
        Number.parseFloat(tokenLength('--pm-control-height-sm')) +
        Number.parseFloat(tokenLength('--pm-space-2')),
      1,
    )
  })

  it('paints the block’s surface over the reserved corner, inside the border', () => {
    const LONG = `pnpm add ${'@polymorph/react-ui '.repeat(40)}`
    for (const code of [LONG, `${LONG}\n${LONG}\n${LONG}\n${LONG}`]) {
      const root = mount(<CodeBlock copyable>{code}</CodeBlock>)
      const pre = root.querySelector('pre') as HTMLElement
      const control = within(root).getByRole('button', { name: 'Copy' })
        .parentElement as HTMLElement
      const reserve = Number.parseFloat(getComputedStyle(pre).paddingInlineEnd)
      const block = pre.getBoundingClientRect()
      const corner = control.getBoundingClientRect()

      // Opaque, in the block's own colour, so a line under it does not show.
      expect(getComputedStyle(control).backgroundColor).toBe(getComputedStyle(pre).backgroundColor)
      // It starts where the reserved room starts, so a line scrolled to its end
      // is clear of it, and it ends inside the border.
      expect(block.right - corner.left).toBeCloseTo(reserve, 0)
      expect(corner.right).toBeLessThan(block.right)
      expect(corner.top).toBeGreaterThan(block.top)
      // A one-line block is shorter than the control wants to be. It stays inside.
      expect(corner.bottom).toBeLessThan(block.bottom)
    }
  })

  it('keeps the control inside a one-line block that a row stretches', () => {
    // A row stretches the wrapper to its tallest cell. The block fills the
    // wrapper, so the control is still measured against the block.
    const row = mount(
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', inlineSize: 600 }}>
        <div style={{ blockSize: 200 }} />
        <CodeBlock copyable>{COMMAND}</CodeBlock>
      </div>,
    )
    const root = row.querySelector('pre')!.parentElement as HTMLElement
    const pre = root.querySelector('pre') as HTMLElement
    const control = within(root).getByRole('button', { name: 'Copy' }).parentElement as HTMLElement

    expect(root.getBoundingClientRect().height).toBeCloseTo(200, 0)
    expect(pre.getBoundingClientRect().height).toBeCloseTo(root.getBoundingClientRect().height, 0)
    expect(control.getBoundingClientRect().bottom).toBeLessThan(pre.getBoundingClientRect().bottom)
    // A long line still scrolls inside the block and does not widen the cell.
    const wide = mount(
      <CodeBlock copyable>{`pnpm add ${'@polymorph/react-ui '.repeat(40)}`}</CodeBlock>,
    )
    const block = wide.querySelector('pre') as HTMLElement
    expect(block.scrollWidth).toBeGreaterThan(block.clientWidth)
    expect(block.getBoundingClientRect().width).toBeCloseTo(wide.getBoundingClientRect().width, 0)
  })

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  it('copies verbatim, confirms, announces politely, and reverts after the delay', async () => {
    const clipboard = stubClipboard()
    try {
      const root = mount(<CodeBlock copyable>{COMMAND}</CodeBlock>)
      const control = screen.getByRole('button', { name: 'Copy' })

      control.click()
      expect(clipboard.writeText).toHaveBeenCalledWith(COMMAND)
      // State on the root, `confirm` instead of `copy`, and the result announced
      // politely, because a copy never justifies an interruption.
      await vi.waitFor(() => expect(root.dataset['state']).toBe('copied'))
      expect(control.querySelector('svg')?.getAttribute('data-icon')).toBe('confirm')
      const region = root.querySelector('[aria-live="polite"]') as HTMLElement
      expect(region.textContent).toBe('Copied')

      // The delay is 2000ms (`COPY_FEEDBACK_MS`, shared with copy-button.md),
      // checked well inside it and just after it rather than at the exact edge.
      await sleep(1200)
      expect(root.dataset['state']).toBe('copied')
      await vi.waitFor(() => expect(root.dataset['state']).toBeUndefined(), { timeout: 1500 })
      expect(control.querySelector('svg')?.getAttribute('data-icon')).toBe('copy')
      expect(region.textContent).toBe('')
    } finally {
      clipboard.restore()
    }
  })

  it('restarts the delay on each press, so the last copy sets the timer', async () => {
    const clipboard = stubClipboard()
    try {
      const root = mount(<CodeBlock copyable>{COMMAND}</CodeBlock>)
      const control = screen.getByRole('button', { name: 'Copy' })

      control.click()
      await vi.waitFor(() => expect(root.dataset['state']).toBe('copied'))
      await sleep(1400)
      control.click()
      await vi.waitFor(() => expect(clipboard.writeText).toHaveBeenCalledTimes(2))

      // Past the first press's deadline but inside the second's, it still
      // confirms, because the second copy reset the timer instead of adding one.
      await sleep(1000)
      expect(root.dataset['state']).toBe('copied')
      await vi.waitFor(() => expect(root.dataset['state']).toBeUndefined(), { timeout: 2000 })
    } finally {
      clipboard.restore()
    }
  })
})
