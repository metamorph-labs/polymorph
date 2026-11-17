import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { FormField } from './FormField'
import { Slider, type SliderProps } from './Slider'
import styles from '@polymorph/recipes/controls/slider.module.css'
import { paintedBackground, tokenBackground, tokenColor, tokenLength } from './token-probe'

/**
 * Slider. The substrate owns the value, and this member owns the dragging state. Radix
 * sets no `data-state`, so `dragging` is this member's own attribute, and every style for
 * a held thumb depends on it.
 */

beforeAll(installTestTheme)

function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

const thumb = () => screen.getByRole('slider')

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<SliderProps>(true)
  })
})

describe('semantics', () => {
  it('is a real slider, named, with the range it was given', () => {
    mount(<Slider defaultValue={40} min={0} max={200} aria-label="Volume" />)
    const control = screen.getByRole('slider', { name: 'Volume' })
    expect(control.getAttribute('aria-valuenow')).toBe('40')
    expect(control.getAttribute('aria-valuemin')).toBe('0')
    expect(control.getAttribute('aria-valuemax')).toBe('200')
  })

  it('announces the formatted value, so "40%" is never read as "40"', () => {
    mount(<Slider defaultValue={40} formatValue={(v) => `${v}%`} aria-label="Opacity" />)
    expect(thumb().getAttribute('aria-valuetext')).toBe('40%')
  })

  it('keeps the readout out of the accessibility tree, because the thumb holds the value', () => {
    mount(<Slider defaultValue={40} showValue formatValue={(v) => `${v}%`} aria-label="Opacity" />)
    const readout = screen.getByText('40%')
    expect(readout.getAttribute('aria-hidden')).toBe('true')
    // One formatter for both.
    expect(thumb().getAttribute('aria-valuetext')).toBe(readout.textContent)
  })

  it('is named by association inside a FormField, not by `for`', () => {
    // A `role="slider"` span is not labelable, so a `<label for>` would render and look
    // right but name nothing.
    render(
      <FormField label="Budget" description="Monthly cap">
        <Slider defaultValue={40} />
      </FormField>,
    )
    const control = screen.getByRole('slider', { name: 'Budget' })
    const describedBy = control.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(describedBy)?.textContent).toBe('Monthly cap')
  })

  it('takes invalid from the field it sits in', () => {
    const field = render(
      <FormField label="Budget" error="Over the cap">
        <Slider defaultValue={90} />
      </FormField>,
    ).container.firstElementChild as HTMLElement

    expect(thumb().getAttribute('aria-invalid')).toBe('true')
    expect(field.querySelector('[data-invalid]')).toBeTruthy()
  })
})

describe('the value', () => {
  it('moves by the step, from the keyboard', async () => {
    const onChange = vi.fn()
    mount(<Slider defaultValue={40} step={10} onChange={onChange} aria-label="Volume" />)
    thumb().focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith(50)
    expect(thumb().getAttribute('aria-valuenow')).toBe('50')
  })

  it('commits separately from changing, so the expensive callback fires once', async () => {
    const onCommit = vi.fn()
    mount(<Slider defaultValue={40} onCommit={onCommit} aria-label="Volume" />)
    thumb().focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onCommit).toHaveBeenCalledWith(41)
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('stays where a controlled caller puts it', async () => {
    const onChange = vi.fn()
    mount(<Slider value={40} onChange={onChange} aria-label="Volume" />)
    thumb().focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith(41)
    // The caller did not re-render with the new value, so the slider did not move.
    expect(thumb().getAttribute('aria-valuenow')).toBe('40')
  })

  it('does not move when disabled', async () => {
    const onChange = vi.fn()
    mount(<Slider defaultValue={40} disabled onChange={onChange} aria-label="Volume" />)
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('dragging, the attribute Radix does not set', () => {
  it('is absent at rest, and present while a key moves the thumb', async () => {
    mount(<Slider defaultValue={40} aria-label="Volume" />)
    expect(thumb().dataset['state']).toBeUndefined()

    thumb().focus()
    await userEvent.keyboard('{ArrowRight>}') // held
    expect(thumb().dataset['state']).toBe('dragging')

    await userEvent.keyboard('{/ArrowRight}') // released
    expect(thumb().dataset['state']).toBeUndefined()
  })

  it('ignores keys that do not move the value', async () => {
    mount(<Slider defaultValue={40} aria-label="Volume" />)
    thumb().focus()
    await userEvent.keyboard('{Shift>}')
    expect(thumb().dataset['state']).toBeUndefined()
    await userEvent.keyboard('{/Shift}')
  })

  it('never sets dragging on a disabled slider', async () => {
    mount(<Slider defaultValue={40} disabled aria-label="Volume" />)
    thumb().focus()
    await userEvent.keyboard('{ArrowRight>}')
    expect(thumb().dataset['state']).toBeUndefined()
    await userEvent.keyboard('{/ArrowRight}')
  })

  it('grows the thumb while held, and only then', async () => {
    mount(<Slider defaultValue={40} aria-label="Volume" />)
    const rest = thumb().getBoundingClientRect().width

    thumb().focus()
    await userEvent.keyboard('{ArrowRight>}')
    await vi.waitFor(() => {
      expect(thumb().getBoundingClientRect().width).toBeGreaterThan(rest)
    })

    await userEvent.keyboard('{/ArrowRight}')
    await vi.waitFor(() => {
      expect(thumb().getBoundingClientRect().width).toBeCloseTo(rest, 1)
    })
  })
})

/**
 * Finds parts by their class rather than by DOM position. `composes` turns a module's
 * export into a list of class names, so the selector includes all of them.
 */
const partOf = (root: HTMLElement, part: string) =>
  root.querySelector(`.${part.split(' ').join('.')}`) as HTMLElement

describe('recipe', () => {
  it('uses Progress’s track and fills it from the accent gradient role', () => {
    const root = mount(<Slider defaultValue={40} aria-label="Volume" />)
    expect(getComputedStyle(partOf(root, styles.track as string)).backgroundColor).toBe(
      tokenColor('--pm-bg-subtle'),
    )
    // `accent.gradient` is a real gradient in a gradient system and a solid colour in a
    // system without a partner hue. The recipe works the same either way.
    expect(paintedBackground(partOf(root, styles.range as string))).toBe(
      tokenBackground('--pm-accent-gradient'),
    )
  })

  it('keeps the pill shape on track and thumb, whatever the geometry axis', () => {
    const root = mount(<Slider defaultValue={40} aria-label="Volume" />)
    for (const part of [partOf(root, styles.track as string), thumb()]) {
      const radius = Number.parseFloat(getComputedStyle(part).borderTopLeftRadius)
      expect(radius).toBeGreaterThanOrEqual(part.getBoundingClientRect().height / 2)
    }
  })

  it('shows the error on the thumb and leaves the fill unchanged', () => {
    const invalid = mount(<Slider defaultValue={90} invalid aria-label="Budget" />)
    const plain = mount(<Slider defaultValue={90} aria-label="Budget" />)

    expect(getComputedStyle(partOf(invalid, styles.thumb as string)).borderTopColor).toBe(
      tokenColor('--pm-danger-border'),
    )
    // A red fill would look like a danger level rather than an invalid value.
    expect(paintedBackground(partOf(invalid, styles.range as string))).toBe(
      paintedBackground(partOf(plain, styles.range as string)),
    )
  })

  it('greys the fill when disabled and removes the thumb’s seat shadow', () => {
    const root = mount(<Slider defaultValue={40} disabled aria-label="Locked" />)
    expect(paintedBackground(partOf(root, styles.range as string))).toBe(
      tokenColor('--pm-border-default'),
    )
    expect(getComputedStyle(thumb()).boxShadow).toBe('none')
    expect(getComputedStyle(thumb()).borderTopColor).toBe(tokenColor('--pm-border-subtle'))
  })

  it('draws the ring on the thumb, not on the row', () => {
    const root = mount(<Slider defaultValue={40} aria-label="Volume" />)
    thumb().focus({ focusVisible: true } as FocusOptions)
    expect(getComputedStyle(thumb()).outlineStyle).toBe('solid')
    expect(getComputedStyle(root).outlineStyle).toBe('none')
  })
})

describe('the minimum target size', () => {
  it('makes the whole row the pointer target, though the track is 4px', () => {
    const root = mount(<Slider defaultValue={40} aria-label="Volume" />)
    expect(
      partOf(root, styles.control as string).getBoundingClientRect().height,
    ).toBeGreaterThanOrEqual(Number.parseFloat(tokenLength('--pm-control-height-sm')))
    expect(partOf(root, styles.track as string).getBoundingClientRect().height).toBeLessThan(8)
  })
})

describe('range', () => {
  const thumbs = () => screen.getAllByRole('slider')

  it('is two thumbs and two tab stops, low first', () => {
    mount(<Slider range defaultValue={[20, 60]} aria-label="Price" />)
    const pair = thumbs()
    expect(pair).toHaveLength(2)
    expect(pair[0]?.getAttribute('aria-valuenow')).toBe('20')
    expect(pair[1]?.getAttribute('aria-valuenow')).toBe('60')

    // Two real tab stops, so the keyboard reaches each end separately.
    ;(pair[0] as HTMLElement).focus()
    expect(document.activeElement).toBe(pair[0])
    ;(pair[1] as HTMLElement).focus()
    expect(document.activeElement).toBe(pair[1])
  })

  it('spans the fill from thumb to thumb, wherever it starts', () => {
    const root = mount(<Slider range defaultValue={[25, 75]} aria-label="Price" />)
    const fill = partOf(root, styles.range as string).getBoundingClientRect()
    const [low, high] = thumbs().map((node) => node.getBoundingClientRect())

    // The fill begins around the low thumb and ends around the high one, not
    // at the track's own start.
    expect(fill.left).toBeGreaterThan((low as DOMRect).left - (low as DOMRect).width)
    expect(fill.right).toBeLessThan((high as DOMRect).right + (high as DOMRect).width)
    expect(fill.left).toBeGreaterThan(
      partOf(root, styles.track as string).getBoundingClientRect().left + 10,
    )
  })

  it('cannot cross, so the pair stays low-first through a collision', async () => {
    const onChange = vi.fn()
    mount(<Slider range defaultValue={[50, 52]} onChange={onChange} aria-label="Price" />)
    const [, high] = thumbs()
    ;(high as HTMLElement).focus()
    // Step the high thumb down through the low one. The substrate never lets the
    // reported pair invert. Past the collision it moves the other thumb instead of
    // crossing, so every report is still `[low, high]`.
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}')
    expect(onChange).toHaveBeenCalled()
    for (const call of onChange.mock.calls) {
      const [pair] = call as [[number, number]]
      expect(pair[0]).toBeLessThanOrEqual(pair[1])
    }
    // The collision did happen: the values passed through [50, 50].
    expect(onChange.mock.calls.some(([pair]) => pair[0] === 50 && pair[1] === 50)).toBe(true)
  })

  it('reports the pair to onChange and onCommit', async () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    mount(
      <Slider
        range
        defaultValue={[20, 60]}
        onChange={onChange}
        onCommit={onCommit}
        aria-label="Price"
      />,
    )
    ;(thumbs()[0] as HTMLElement).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith([21, 60])
    expect(onCommit).toHaveBeenCalledWith([21, 60])
  })

  it('announces each thumb through the same formatter, and shows both joined by an en dash', () => {
    const root = mount(
      <Slider
        range
        defaultValue={[20, 60]}
        showValue
        formatValue={(v) => `$${v}`}
        aria-label="Price"
      />,
    )
    const pair = thumbs()
    expect(pair[0]?.getAttribute('aria-valuetext')).toBe('$20')
    expect(pair[1]?.getAttribute('aria-valuetext')).toBe('$60')
    expect(partOf(root, styles.readout as string).textContent).toBe('$20–$60')
  })

  it('grows only the held thumb', async () => {
    mount(<Slider range defaultValue={[20, 60]} aria-label="Price" />)
    const [low, high] = thumbs()
    ;(high as HTMLElement).focus()
    await userEvent.keyboard('{ArrowRight>}')
    expect((high as HTMLElement).dataset['state']).toBe('dragging')
    expect((low as HTMLElement).dataset['state']).toBeUndefined()
    await userEvent.keyboard('{/ArrowRight}')
    expect((high as HTMLElement).dataset['state']).toBeUndefined()
  })

  it('keeps the single slider’s value a number, not a one-item pair', () => {
    // @ts-expect-error — only `range` accepts a pair.
    const bad = <Slider defaultValue={[20, 60]} aria-label="Price" />
    expect(bad).toBeTruthy()
  })
})

/**
 * An agent moves a Slider's thumbs as a pointer does, as its spec's `agent` fence declares
 * (`design/components/slider.md`, Agent): the number snaps to the step and stays within the
 * range and the other thumb, and `onChange` and then `onCommit` report it in both forms.
 */
describe('an agent', () => {
  it('sets an uncontrolled slider, snapped to its step and held within its range', async () => {
    const bridge = createAgentBridge()
    try {
      const calls: string[] = []
      mount(
        <Slider
          defaultValue={40}
          step={10}
          onChange={(value) => calls.push(`change ${value}`)}
          onCommit={(value) => calls.push(`commit ${value}`)}
          aria-label="Volume"
        />,
      )
      const [member] = bridge.snapshot().members
      expect(member).toMatchObject({
        member: 'Slider',
        name: 'Volume',
        state: { value: 40, high: null },
      })
      const { results } = await bridge.act([
        { id: member?.id, action: 'set', value: 63 },
        { id: member?.id, action: 'set', value: 140 },
      ])
      expect(results).toMatchObject([
        { ok: true, changed: { value: { from: 40, to: 60 } } },
        { ok: true, changed: { value: { from: 60, to: 100 } } },
      ])
      expect(calls).toEqual(['change 60', 'commit 60', 'change 100', 'commit 100'])
      expect(thumb().getAttribute('aria-valuenow')).toBe('100')

      const high = await bridge.act([{ id: member?.id, action: 'set-high', value: 50 }])
      expect(high.results[0]).toMatchObject({
        ok: false,
        error: { code: 'failed', message: expect.stringContaining('one value') },
      })
    } finally {
      bridge.dispose()
    }
  })

  it('moves each end of a range, which stops at the other', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      mount(<Slider range defaultValue={[20, 60]} onChange={onChange} aria-label="Price" />)
      const [member] = bridge.snapshot().members
      expect(member?.state).toMatchObject({ value: 20, high: 60 })
      const { results } = await bridge.act([
        { id: member?.id, action: 'set', value: 80 },
        { id: member?.id, action: 'set-high', value: 90 },
        { id: member?.id, action: 'set-high', value: 10 },
      ])
      expect(results).toMatchObject([
        { ok: true, changed: { value: { from: 20, to: 60 } } },
        { ok: true, changed: { high: { from: 60, to: 90 } } },
        { ok: true, changed: { high: { from: 90, to: 60 } } },
      ])
      expect(onChange.mock.calls).toEqual([[[60, 60]], [[60, 90]], [[60, 60]]])
    } finally {
      bridge.dispose()
    }
  })

  it('sets a controlled slider through the caller, and reads what the caller keeps', async () => {
    const bridge = createAgentBridge()
    try {
      function Held() {
        const [value, setValue] = useState(10)
        return <Slider value={value} onChange={setValue} aria-label="Held" />
      }
      const kept = vi.fn()
      render(
        <>
          <Held />
          <Slider value={30} onChange={kept} aria-label="Kept" />
        </>,
      )
      const [held, fixed] = bridge.snapshot().members
      const moved = await bridge.act([{ id: held?.id, action: 'set', value: 25 }])
      expect(moved.results[0]).toMatchObject({ ok: true, changed: { value: { from: 10, to: 25 } } })
      const stayed = await bridge.act([{ id: fixed?.id, action: 'set', value: 35 }])
      expect(stayed.results[0]).toEqual({ ok: true, id: fixed?.id, changed: {} })
      expect(kept).toHaveBeenCalledWith(35)
    } finally {
      bridge.dispose()
    }
  })
})
