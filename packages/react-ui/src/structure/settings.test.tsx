import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { serverPassed } from '@polymorph/conformance/server-passed'
import { assertGoverned } from '@polymorph/react'
import { Button } from '../controls/Button'
import { Checkbox } from '../controls/Checkbox'
import { Input } from '../controls/Input'
import { NumberInput } from '../controls/NumberInput'
import { RadioGroup } from '../controls/Radio'
import { Select } from '../controls/Select'
import { Switch } from '../controls/Switch'
import { Textarea } from '../controls/Textarea'
import { tokenColor } from '../controls/token-probe'
import { ConfirmDialog, type ConfirmDialogProps } from '../overlays/ConfirmDialog'
import { installTestTheme } from '@polymorph/engine/testing'
import { SettingsRow, type SettingsRowProps } from './SettingsRow'
import { Stat, type StatProps } from './Stat'

/**
 * ConfirmDialog, Stat and SettingsRow.
 *
 * Three assemblies that make decisions for the caller. The tests check those
 * decisions, which a caller cannot check.
 */

beforeAll(installTestTheme)

describe('the closed surfaces', () => {
  it('leave no way to style any of them from a call site', () => {
    assertGoverned<ConfirmDialogProps>(true)
    assertGoverned<StatProps>(true)
    assertGoverned<SettingsRowProps>(true)
  })
})

describe('ConfirmDialog', () => {
  function confirm(props: Partial<ConfirmDialogProps> = {}) {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open
        trigger={<Button variant="ghost" tone="neutral" label="Delete" />}
        title="Delete 3 tickets?"
        description="They leave the inbox and the archive. This cannot be undone."
        confirmLabel="Delete 3 tickets"
        onConfirm={onConfirm}
        {...props}
      />,
    )
    return onConfirm
  }

  it('requires the caller to supply the action verb', () => {
    // No default for `confirmLabel`: "Confirm" hides what is about to happen, and
    // the pause exists to show it.
    // @ts-expect-error — a confirm needs a verb.
    const bad: ConfirmDialogProps = { title: 'x', description: 'y', onConfirm: () => {} }
    expect(bad.title).toBe('x')
  })

  it('uses the alertdialog role for a destructive action', () => {
    confirm()
    expect(screen.getByRole('alertdialog', { name: 'Delete 3 tickets?' })).toBeTruthy()
  })

  it('is an ordinary dialog for a non-destructive action', () => {
    confirm({ tone: 'accent', confirmLabel: 'Publish' })
    expect(screen.getByRole('dialog', { name: 'Delete 3 tickets?' })).toBeTruthy()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('opens with focus on Cancel, so a repeated Enter destroys nothing', async () => {
    confirm()
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' })),
    )
  })

  it('opens with focus on the action when the action is safe', async () => {
    confirm({ tone: 'accent', confirmLabel: 'Publish' })
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Publish' })),
    )
  })

  it('uses danger for the destructive button and outline for Cancel', () => {
    confirm()
    expect(screen.getByRole('button', { name: 'Delete 3 tickets' }).dataset['tone']).toBe('danger')
    expect(screen.getByRole('button', { name: 'Cancel' }).dataset['variant']).toBe('outline')
  })

  it('runs the confirm and closes', async () => {
    const onOpenChange = vi.fn()
    const onConfirm = confirm({ onOpenChange })
    await userEvent.click(screen.getByRole('button', { name: 'Delete 3 tickets' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes itself when uncontrolled', async () => {
    /*
     * Dialog manages its own `open` when it is undefined, but Cancel and
     * Confirm live here, so calling only `onOpenChange` would leave an
     * uncontrolled ConfirmDialog open with dead buttons. Uncontrolled is the
     * common first use.
     */
    render(
      <ConfirmDialog
        trigger={<Button variant="ghost" tone="neutral" label="Delete" />}
        title="Delete 3 tickets?"
        description="This cannot be undone."
        confirmLabel="Delete 3 tickets"
        onConfirm={() => {}}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('cannot be dismissed while the confirm action is running', async () => {
    // Dismissing mid-action would leave the reader unsure whether it happened.
    const onOpenChange = vi.fn()
    confirm({ onConfirm: () => new Promise<void>(() => {}), onOpenChange })

    await userEvent.click(screen.getByRole('button', { name: 'Delete 3 tickets' }))
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete 3 tickets' }).dataset['state']).toBe(
        'loading',
      ),
    )
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveProperty('disabled', true)

    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})

describe('ConfirmDialog — the typed confirmation', () => {
  const PHRASE = 'acme-billing'
  const LABEL = `Type ${PHRASE} to confirm`

  function typed(props: Partial<ConfirmDialogProps> = {}) {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open
        trigger={<Button variant="ghost" tone="neutral" label="Delete project" />}
        title="Delete the acme-billing project?"
        description="Its tickets, members and settings are deleted with it."
        confirmLabel="Delete project"
        confirmWith={PHRASE}
        onConfirm={onConfirm}
        {...props}
      />,
    )
    return onConfirm
  }

  const field = () => screen.getByRole('textbox', { name: LABEL })
  // The trigger has the same name, and the open modal hides it from the tree.
  const confirmButton = () =>
    screen.getByRole<HTMLButtonElement>('button', { name: 'Delete project' })

  it('draws one field, labelled with the phrase', () => {
    typed()
    expect(field()).toBeTruthy()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
  })

  it('takes the phrase as typed: no correction, capitals or spell check', () => {
    typed()
    expect(field().getAttribute('autocorrect')).toBe('off')
    expect(field().getAttribute('autocapitalize')).toBe('off')
    expect(field()).toHaveProperty('spellcheck', false)
  })

  it('has no field without a phrase', () => {
    typed({ confirmWith: undefined })
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('starts with focus on the field, in a danger confirm too', async () => {
    typed()
    await vi.waitFor(() => expect(document.activeElement).toBe(field()))
  })

  it('keeps the confirm disabled until the field holds the phrase', async () => {
    const onConfirm = typed()
    expect(confirmButton().disabled).toBe(true)
    await userEvent.type(field(), 'acme-bil')
    expect(confirmButton().disabled).toBe(true)
    await userEvent.type(field(), 'ling')
    expect(confirmButton().disabled).toBe(false)
    await userEvent.click(confirmButton())
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('ignores letter case and the spaces around the text', async () => {
    typed()
    await userEvent.type(field(), ' ACME-Billing ')
    expect(confirmButton().disabled).toBe(false)
  })

  it('shows the error at the first character that cannot lead to the phrase, and not before', async () => {
    typed()
    await userEvent.type(field(), 'acme-b')
    expect(screen.queryByText('The text does not match')).toBeNull()
    expect(field().getAttribute('aria-invalid')).toBeNull()

    await userEvent.type(field(), 'u')
    expect(screen.getByText('The text does not match')).toBeTruthy()
    expect(field().getAttribute('aria-invalid')).toBe('true')

    await userEvent.keyboard('{Backspace}')
    await vi.waitFor(() => expect(screen.queryByText('The text does not match')).toBeNull())
  })

  it('confirms nothing on Enter in the field, even when it holds the phrase', async () => {
    const onConfirm = typed()
    await userEvent.type(field(), PHRASE)
    await userEvent.keyboard('{Enter}')
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })

  it('takes a localized label and error', async () => {
    typed({
      confirmWithLabel: 'Saisissez acme-billing',
      confirmWithError: 'Cela ne correspond pas',
    })
    const localized = screen.getByRole('textbox', { name: 'Saisissez acme-billing' })
    await userEvent.type(localized, 'x')
    expect(screen.getByText('Cela ne correspond pas')).toBeTruthy()
  })

  it('locks the field while the confirm runs', async () => {
    typed({ onConfirm: () => new Promise<void>(() => {}) })
    await userEvent.type(field(), PHRASE)
    await userEvent.click(confirmButton())
    await vi.waitFor(() => expect(field()).toHaveProperty('disabled', true))
  })

  it('empties the field each time it opens', async () => {
    render(
      <ConfirmDialog
        trigger={<Button variant="ghost" tone="neutral" label="Delete" />}
        title="Delete the acme-billing project?"
        description="Its tickets, members and settings are deleted with it."
        confirmLabel="Delete project"
        confirmWith={PHRASE}
        onConfirm={() => {}}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.type(field(), 'acme')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(field()).toHaveProperty('value', '')
  })
})

describe('Stat', () => {
  function stat(props: Partial<StatProps> = {}) {
    const { container } = render(<Stat label="Open tickets" value="128" {...props} />)
    return container.firstElementChild as HTMLElement
  }

  it('uses tabular numerals, so a column of numbers aligns', () => {
    const root = stat()
    const value = root.querySelector('[data-numeric]') as HTMLElement
    expect(getComputedStyle(value).fontVariantNumeric).toBe('tabular-nums')
  })

  it('leaves a non-numeric value without tabular numerals', () => {
    expect(stat({ value: 'Email', numeric: false }).querySelector('[data-numeric]')).toBeNull()
  })

  /**
   * The decision this component holds: direction and sentiment are separate.
   * Open tickets going *down* is good news, and assuming otherwise would colour
   * half a dashboard wrongly.
   */
  it('treats up as good by default', () => {
    const delta = stat({ delta: { value: '12%', direction: 'up' } }).querySelector(
      '[data-direction]',
    ) as HTMLElement
    expect(delta.dataset['positive']).toBe('')
    expect(getComputedStyle(delta).color).toBe(tokenColor('--pm-success-text'))
  })

  it('lets down be good when the caller says so', () => {
    const delta = stat({
      delta: { value: '8%', direction: 'down', positive: true },
    }).querySelector('[data-direction="down"]') as HTMLElement
    expect(delta.dataset['positive']).toBe('')
    expect(getComputedStyle(delta).color).toBe(tokenColor('--pm-success-text'))
  })

  it('lets up be bad when the caller says so', () => {
    const delta = stat({
      delta: { value: '4', direction: 'up', positive: false },
    }).querySelector('[data-direction="up"]') as HTMLElement
    expect(delta.dataset['positive']).toBeUndefined()
    expect(getComputedStyle(delta).color).toBe(tokenColor('--pm-danger-text'))
  })

  it('announces the direction and the sentiment to screen readers', () => {
    // Colour and an arrow carry them visually, and neither is read aloud.
    stat({ delta: { value: '8%', direction: 'down', positive: true } })
    expect(screen.getByText('down 8% — positive')).toBeTruthy()
  })

  it('shows a description only when there is no delta', () => {
    expect(screen.queryByText('vs last week')).toBeNull()
    stat({ description: 'vs last week' })
    expect(screen.getByText('vs last week')).toBeTruthy()

    stat({ description: 'vs last week', delta: { value: '12%', direction: 'up' } })
    expect(screen.getAllByText('vs last week')).toHaveLength(1)
  })

  it('never lets the spark shrink beside a long value', () => {
    // The spark is `flex: none`: the number may wrap or overflow, but a squashed
    // trend would be a different shape, and the shape is the information.
    const TREND = [42, 40, 41, 38, 35, 36, 33, 31, 32, 29, 27, 26]
    const sparkWidth = (root: Element) =>
      (root.querySelector('[role="img"]') as HTMLElement).getBoundingClientRect().width

    const { container: roomy } = render(<Stat label="Open tickets" value="128" spark={TREND} />)
    const { container: crowded } = render(
      <div style={{ inlineSize: '160px' }}>
        <Stat label="Open tickets" value="1,284,905,113" spark={TREND} />
      </div>,
    )
    expect(sparkWidth(crowded)).toBeCloseTo(sparkWidth(roomy), 0)
  })

  /**
   * The dashboard block's card: the trend chip and the two-line footer.
   *
   * `trend` says the number moved, and `delta` says whether that is good news.
   * That difference is why `trend` is its own prop.
   */
  describe('trend and footer', () => {
    it('draws the movement as a neutral outline chip with no sentiment', () => {
      const root = stat({ trend: { direction: 'up', label: '+12.5%' } })
      const chip = root.querySelector('[data-variant="outline"]') as HTMLElement

      expect(chip.dataset['tone']).toBe('neutral')
      expect(chip.textContent).toContain('+12.5%')
      // A trend makes no claim about sentiment, so it uses neither status colour.
      // That is what distinguishes it from a delta.
      const colour = getComputedStyle(chip).color
      expect(colour).not.toBe(tokenColor('--pm-success-text'))
      expect(colour).not.toBe(tokenColor('--pm-danger-text'))
    })

    it('uses the closest glyph, because the icon set has no trending role', () => {
      const up = stat({ trend: { direction: 'up', label: '+1%' } })
      expect(up.querySelector('svg')?.dataset['icon']).toBe('up')

      const down = stat({ trend: { direction: 'down', label: '−1%' } })
      expect(down.querySelector('svg')?.dataset['icon']).toBe('down')
    })

    it('places the chip at the end of the label row', () => {
      const root = stat({ trend: { direction: 'up', label: '+12.5%' } })
      const label = screen.getByText('Open tickets')
      const chip = root.querySelector('[data-variant="outline"]') as HTMLElement

      // Centres, not tops. The chip is taller than the overline beside it, and
      // the row centres them, which is what this asserts.
      const centre = (node: Element) => {
        const box = node.getBoundingClientRect()
        return box.top + box.height / 2
      }
      expect(centre(chip)).toBeCloseTo(centre(label), 0)
      expect(chip.getBoundingClientRect().left).toBeGreaterThan(label.getBoundingClientRect().right)
    })

    it('ends with two footer lines that differ by colour, not weight', () => {
      stat({ footer: { primary: 'Trending up this month', secondary: 'Over the last six' } })
      const primary = getComputedStyle(screen.getByText('Trending up this month'))
      const secondary = getComputedStyle(screen.getByText('Over the last six'))

      expect(primary.color).toBe(tokenColor('--pm-text-primary'))
      expect(secondary.color).toBe(tokenColor('--pm-text-muted'))
      // Emphasis comes from case and tracking (`design/components/README.md`,
      // "Type usage"), not an extra weight, which would break the type scale.
      expect(secondary.fontWeight).toBe(primary.fontWeight)
      expect(secondary.fontSize).toBe(primary.fontSize)
    })

    it('derives the footer’s glyph from the trend, so the two cannot disagree', () => {
      const withTrend = stat({
        trend: { direction: 'down', label: '−18%' },
        footer: { primary: 'Faster than last week', secondary: 'Across every queue' },
      })
      // Two glyphs, both `down`: the chip's and the line's.
      const icons = [...withTrend.querySelectorAll('svg')].map((svg) => svg.dataset['icon'])
      expect(icons).toEqual(['down', 'down'])

      // No arrow when there is no trend for it to show.
      const bare = stat({ footer: { primary: 'Steady all week', secondary: 'Nothing waiting' } })
      expect(bare.querySelectorAll('svg')).toHaveLength(0)
    })

    it('separates the footer from the value more than the rows above', () => {
      const root = stat({
        trend: { direction: 'up', label: '+12.5%' },
        footer: { primary: 'Trending up this month', secondary: 'Over the last six' },
      })
      const value = root.querySelector('[data-numeric]') as HTMLElement
      const primary = screen.getByText('Trending up this month')

      // The label, value and delta form one unit. The footer comments on it, and
      // one extra space step separates them.
      const gap = primary.getBoundingClientRect().top - value.getBoundingClientRect().bottom
      expect(gap).toBeGreaterThan(Number.parseFloat(getComputedStyle(root).rowGap))
    })
  })

  /**
   * The number has not arrived (`stat.md`, Loading). The label row is known
   * before it, and every part that states the number is a Skeleton of that
   * part's size.
   */
  describe('loading', () => {
    const FULL: Partial<StatProps> = {
      value: '1,204',
      trend: { direction: 'up', label: '+12.5%' },
      spark: [180, 195, 190, 210, 220, 216, 240, 251, 248, 262, 270, 284],
      footer: { primary: 'Trending up this month', secondary: 'Against the same week' },
    }

    it('keeps the label row and says the stat is busy', () => {
      const root = stat({ icon: 'time', loading: true })
      expect(root.getAttribute('aria-busy')).toBe('true')
      expect(root.dataset['loading']).toBe('')
      expect(screen.getByText('Open tickets')).toBeTruthy()
      // The label row's glyph is the caller's icon, known before the number.
      expect(root.querySelector('svg')?.dataset['icon']).toBe('time')
    })

    it('puts one named placeholder in the value’s place and hides the rest', () => {
      const root = stat({ ...FULL, delta: { value: '12%', direction: 'up' }, loading: true })
      expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy()
      const placeholders = [...root.querySelectorAll('[data-member="skeleton"]')]
      // The value, the chip, the spark, the delta and the footer's two lines.
      expect(placeholders).toHaveLength(6)
      expect(
        placeholders.filter((node) => node.getAttribute('aria-hidden') === 'true'),
      ).toHaveLength(5)
    })

    it('draws nothing it was given about the number', () => {
      const root = stat({
        ...FULL,
        value: '342',
        delta: { value: '12%', direction: 'up' },
        loading: true,
      })
      const text = root.textContent ?? ''
      for (const words of ['342', '12%', 'positive', '+12.5%', 'Trending up', 'Against the']) {
        expect(text, words).not.toContain(words)
      }
      // No sentiment, no chip, no spark and so no sparkline name.
      expect(root.querySelector('[data-direction]')).toBeNull()
      expect(root.querySelector('[data-member="badge"]')).toBeNull()
      expect(screen.queryByRole('img')).toBeNull()
      expect(root.querySelector('[data-numeric]')).toBeNull()

      const described = stat({ description: 'vs last week', loading: true })
      expect(described.textContent).not.toContain('vs last week')
    })

    it('draws no placeholder for a part the caller did not pass', () => {
      const root = stat({ loading: true })
      // The value's alone: a delta, a chip, a spark or a footer would be invented.
      expect(root.querySelectorAll('[data-member="skeleton"]')).toHaveLength(1)
    })

    it('keeps the card’s height when the number arrives', () => {
      const cards: Partial<StatProps>[] = [
        { icon: 'time' },
        { delta: { value: '12%', direction: 'up' } },
        { description: 'vs last week' },
        FULL,
        { ...FULL, delta: { value: '12%', direction: 'up' } },
      ]
      for (const props of cards) {
        const { container, rerender } = render(
          <div style={{ inlineSize: '360px' }}>
            <Stat label="Solved this week" value="1,204" {...props} loading />
          </div>,
        )
        const root = container.querySelector('[data-member="stat"]') as HTMLElement
        const loading = root.getBoundingClientRect().height
        const row = (root.firstElementChild as HTMLElement).getBoundingClientRect().height

        rerender(
          <div style={{ inlineSize: '360px' }}>
            <Stat label="Solved this week" value="1,204" {...props} />
          </div>,
        )
        const loaded = container.querySelector('[data-member="stat"]') as HTMLElement
        expect(loaded.querySelector('[data-member="skeleton"]')).toBeNull()
        expect(loaded.getBoundingClientRect().height, JSON.stringify(props)).toBe(loading)
        // The label row too, which holds the chip.
        expect(
          (loaded.firstElementChild as HTMLElement).getBoundingClientRect().height,
          JSON.stringify(props),
        ).toBe(row)
      }
    })
  })
})

describe('SettingsRow', () => {
  it('labels the control from the row through one mechanism', () => {
    // FormField is not used inside, because two labelling systems on one control
    // would announce it twice.
    render(
      <SettingsRow.Group title="Notifications">
        <SettingsRow
          label="Daily digest"
          description="One summary each morning."
          control={<Switch />}
        />
      </SettingsRow.Group>,
    )
    const control = screen.getByRole('switch', {
      name: 'Daily digest',
      description: 'One summary each morning.',
    })
    expect(control).toBeTruthy()
  })

  it('names a control that has no description too', () => {
    render(
      <SettingsRow.Group title="Appearance">
        <SettingsRow label="Reduce motion" control={<Switch />} />
      </SettingsRow.Group>,
    )
    const control = screen.getByRole('switch', { name: 'Reduce motion' })
    expect(control.getAttribute('aria-describedby')).toBeNull()
  })

  it('names a control a server component passed', () => {
    // A client member receives such an element as a lazy reference, which has
    // no props to clone until it is read (`useSupplied`).
    render(
      <SettingsRow
        label="Daily digest"
        description="One summary each morning."
        control={serverPassed(<Switch />)}
      />,
    )
    const control = screen.getByRole('switch', {
      name: 'Daily digest',
      description: 'One summary each morning.',
    })
    expect(control).toBeTruthy()
  })

  it('gives the group a real heading, not a styled span', () => {
    // The section-heading recipe that settings screens would otherwise invent,
    // as a real heading that can be navigated to.
    render(
      <SettingsRow.Group title="Notifications">
        <SettingsRow label="Daily digest" control={<Switch />} />
      </SettingsRow.Group>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Notifications' })).toBeTruthy()
  })

  it('draws rules between rows, not around them', () => {
    // The Card's own border is the outer boundary; a rule above the first row
    // would double it.
    render(
      <SettingsRow.Group title="Notifications">
        <SettingsRow label="Daily digest" control={<Switch />} />
        <SettingsRow label="Mentions" control={<Switch />} />
      </SettingsRow.Group>,
    )
    const rows = screen
      .getAllByRole('switch')
      .map((control) => control.closest('div')?.parentElement)
    expect(getComputedStyle(rows[0] as HTMLElement).borderTopWidth).toBe('0px')
    expect(getComputedStyle(rows[1] as HTMLElement).borderTopWidth).toBe('1px')
  })

  /**
   * An easy bug to ship: a control drops a prop it does not expect, so the
   * row's label names nothing. Label and control both render, and only a screen
   * reader notices. So every control a row can hold is checked by name.
   */
  describe('names every control a row can hold', () => {
    const CONTROLS = [
      { name: 'Switch', role: 'switch', control: <Switch /> },
      { name: 'Checkbox', role: 'checkbox', control: <Checkbox /> },
      {
        name: 'Select',
        role: 'combobox',
        control: <Select options={[{ value: 'a', label: 'A' }]} />,
      },
      { name: 'Input', role: 'textbox', control: <Input /> },
      { name: 'Textarea', role: 'textbox', control: <Textarea /> },
      {
        name: 'Button',
        role: 'button',
        control: <Button variant="outline" tone="neutral" label="Do it" />,
      },
      {
        name: 'RadioGroup',
        role: 'radiogroup',
        control: <RadioGroup options={[{ value: 'a', label: 'A' }]} />,
      },
    ]

    for (const { name, role, control } of CONTROLS) {
      it(`${name}`, () => {
        render(
          <SettingsRow.Group title="Group">
            <SettingsRow label="Daily digest" control={control} />
          </SettingsRow.Group>,
        )
        expect(screen.getByRole(role, { name: 'Daily digest' })).toBeTruthy()
      })
    }
  })

  it('keeps the control from growing into the text column', () => {
    render(
      <SettingsRow.Group title="Data">
        <SettingsRow
          label="Export your data"
          description="A zip of every ticket you can see."
          control={<Button variant="outline" tone="neutral" size="sm" label="Request export" />}
        />
      </SettingsRow.Group>,
    )
    const control = screen.getByRole('button', { name: 'Export your data' }).parentElement
    expect(getComputedStyle(control as HTMLElement).flexGrow).toBe('0')
  })

  /**
   * The group's width inside a SettingsPage on a 375px phone. A NumberInput with a suffix is
   * wider than the row, and a row that keeps it beside the text leaves the text no width: the
   * label is drawn one letter to a line and the control crosses the Card's edge.
   */
  describe('in a narrow group', () => {
    const NARROW = 325

    function narrowGroup() {
      render(
        <div style={{ inlineSize: `${NARROW}px` }}>
          <SettingsRow.Group title="Plan">
            <SettingsRow
              label="Seats"
              description="Everyone who can sign in to this workspace, billed at $12 each per month."
              control={<NumberInput defaultValue={24} suffix="seats" />}
            />
            <SettingsRow
              label="Email a receipt every month"
              description="For whoever files the expenses."
              control={<Switch />}
            />
          </SettingsRow.Group>
        </div>,
      )
      const wide = screen.getByRole('textbox', { name: 'Seats' }).closest('[data-member]')
      const small = screen.getByRole('switch', { name: 'Email a receipt every month' })
      return {
        wide: (wide as HTMLElement).parentElement as HTMLElement,
        small: small.closest('[data-member="settings-row"] > :last-child') as HTMLElement,
      }
    }

    it('moves a control too wide to share the line under the text, and keeps it inside the row', () => {
      const { wide } = narrowGroup()
      const row = wide.parentElement as HTMLElement
      const text = row.firstElementChild as HTMLElement
      const label = screen.getByText('Seats')

      // The label is one word, so it is one line tall when the text column has any width.
      const line = Number.parseFloat(getComputedStyle(label).lineHeight)
      expect(label.getBoundingClientRect().height).toBeCloseTo(line, 0)

      expect(wide.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        text.getBoundingClientRect().bottom,
      )
      const padding = Number.parseFloat(getComputedStyle(row).paddingInlineEnd)
      expect(wide.getBoundingClientRect().right).toBeLessThanOrEqual(
        row.getBoundingClientRect().right - padding,
      )
      expect(row.scrollWidth).toBe(row.clientWidth)
    })

    it('keeps a small control beside its text', () => {
      const { small } = narrowGroup()
      const text = (small.parentElement as HTMLElement).firstElementChild as HTMLElement

      expect(small.getBoundingClientRect().top).toBeLessThan(text.getBoundingClientRect().bottom)
      expect(small.getBoundingClientRect().left).toBeGreaterThanOrEqual(
        text.getBoundingClientRect().right,
      )
    })
  })
})
