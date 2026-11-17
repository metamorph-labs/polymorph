'use client'

import * as SliderPrimitive from '@radix-ui/react-slider'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import {
  type ControlKind,
  dataAttrs,
  memberAttr,
  useAgentMember,
  useDirection,
} from '@polymorph/react'
import styles from '@polymorph/recipes/controls/slider.module.css'

/**
 * Value selection from a numeric range (`design/components/slider.md`).
 *
 * `@radix-ui/react-slider` supplies the behaviour (the `role="slider"` semantics, the
 * arrow/Home/End/Page keys, RTL, the value mapping). This file owns all the visuals, plus
 * **one attribute Radix does not set**. `data-state="dragging"` exists because a held
 * thumb is a visible state with its own styles (it grows and lights up), and the
 * substrate exposes nothing to style it from. So this member sets it from the pointer
 * and keyboard events it already handles.
 *
 * `range`: the substrate already supports two thumbs, so a range only changes the value
 * type, and `[number, number]` is opted into explicitly. Two thumbs are two tab stops,
 * and the substrate keeps each from passing the other. The fill spans from thumb to thumb
 * because Radix draws it that way, and the recipe does not depend on where it starts.
 */

/** The keys Radix moves the value with, which count as dragging from the keyboard. */
const STEP_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
])

interface SliderBaseProps {
  min?: number
  max?: number
  step?: number
  /** Shows the current value at the row's end. Decorative, because the thumb announces it. */
  showValue?: boolean
  /** Formats both the readout and `aria-valuetext`. */
  formatValue?: (value: number) => string
  disabled?: boolean
  invalid?: boolean
  /** Wired by FormField; set directly only when there is no visible label. */
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
}

export interface SingleSliderProps extends SliderBaseProps {
  range?: false
  value?: number
  defaultValue?: number
  onChange?: (value: number) => void
  /**
   * Fires on release. Use it for expensive side effects instead of debouncing
   * `onChange`. Radix commits on pointer release and on each keyboard step, so a
   * blurred slider never holds an uncommitted value.
   */
  onCommit?: (value: number) => void
}

export interface RangeSliderProps extends SliderBaseProps {
  /** Two thumbs on one track. The pair is `[low, high]` and the thumbs cannot cross. */
  range: true
  value?: [number, number]
  defaultValue?: [number, number]
  onChange?: (value: [number, number]) => void
  onCommit?: (value: [number, number]) => void
}

export type SliderProps = SingleSliderProps | RangeSliderProps

/** The value in Radix's format: always an array, one entry per thumb. */
function asThumbs(value: number | [number, number] | undefined): number[] | undefined {
  if (value === undefined) return undefined
  return typeof value === 'number' ? [value] : [...value]
}

export function Slider(props: SliderProps) {
  // The document's direction, which Radix would otherwise take to be left-to-right.
  const dir = useDirection()
  const {
    min = 0,
    max = 100,
    step = 1,
    showValue = false,
    formatValue = String,
    disabled = false,
    invalid = false,
    'aria-label': ariaLabel,
    'aria-labelledby': labelledBy,
    'aria-describedby': describedBy,
    'aria-required': required,
  } = props
  const range = props.range === true

  // Held while the caller does not hold it, as in Checkbox. Radix is always controlled, by
  // the caller's value or by this copy, so an agent's set moves the thumb in both forms, and
  // the readout and `aria-valuetext` show the value in an uncontrolled slider too.
  const [mirror, setMirror] = useState<number[]>(
    () => asThumbs(props.defaultValue) ?? (range ? [min, min] : [min]),
  )
  const thumbs = asThumbs(props.value) ?? mirror

  const [dragging, setDragging] = useState(false)
  /**
   * Which thumb is being dragged. Radix focuses the thumb it moves (on a track press, the
   * nearest one), so focus events tell which thumb should grow. A single slider only
   * uses index 0.
   */
  const [active, setActive] = useState(0)

  /*
   * The pointer side of dragging. Radix captures the pointer on the thumb, so the release
   * can happen anywhere, including outside the window, and only a window listener
   * receives all of them. The listeners are added while dragging and removed after, so
   * idle sliders hold no listeners.
   */
  useEffect(() => {
    if (!dragging) return
    const release = () => setDragging(false)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    return () => {
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
    }
  }, [dragging])

  function report(next: number[], callback: 'onChange' | 'onCommit') {
    if (props.range === true) {
      const handler = props[callback]
      handler?.([next[0] ?? min, next[1] ?? min])
      return
    }
    const handler = props[callback]
    const value = next[0]
    if (value !== undefined) handler?.(value)
  }

  /*
   * An agent moves one thumb as a pointer does: the number snaps to the step and stays within
   * `min` and `max`, and under `range` each end stops at the other. It reports `onChange` and
   * then `onCommit`, because a set is a whole gesture, as a key press is, and only when the
   * thumb moves.
   */
  function place(index: number, next: number) {
    const decimals = (String(step).split('.')[1] ?? '').length
    const snapped = Number((min + Math.round((next - min) / step) * step).toFixed(decimals))
    const floor = index === 1 ? (thumbs[0] ?? min) : min
    const ceiling = index === 0 && range ? (thumbs[1] ?? max) : max
    const moved = [...thumbs]
    moved[index] = Math.min(Math.max(snapped, floor), ceiling)
    if (moved[index] === thumbs[index]) return
    setMirror(moved)
    report(moved, 'onChange')
    report(moved, 'onCommit')
  }
  const rootRef = useRef<HTMLDivElement>(null)
  useAgentMember({
    member: 'Slider',
    element: () => rootRef.current?.querySelector('[role="slider"]'),
    state: () => ({
      value: thumbs[0] ?? min,
      high: range ? (thumbs[1] ?? min) : null,
      disabled,
      invalid,
    }),
    actions: {
      set: { argument: 'number', run: (next) => place(0, next) },
      'set-high': {
        argument: 'number',
        run: (next) => {
          if (!range) throw new Error('A single slider has one value, which set moves.')
          place(1, next)
        },
      },
    },
  })

  const spoken = thumbs.map(formatValue)
  // The readout: both values joined by an en dash.
  const text = spoken.join('–')

  return (
    <div
      ref={rootRef}
      className={styles.root}
      {...dataAttrs({ disabled, invalid })}
      // Horizontal only. A vertical slider would need a different recipe and reading
      // order, not a prop. The attribute is set anyway so the CSS can branch on it if
      // a vertical slider is ever specified.
      data-orientation="horizontal"
      {...memberAttr('Slider')}
    >
      {showValue ? (
        // `aria-hidden`, because the thumbs' `aria-valuetext` is the accessible value,
        // and screen readers would otherwise announce it twice.
        <span className={styles.readout} aria-hidden="true">
          {text}
        </span>
      ) : null}

      <SliderPrimitive.Root
        dir={dir}
        className={styles.control}
        value={thumbs}
        onValueChange={(next) => {
          setMirror(next)
          report(next, 'onChange')
        }}
        onValueCommit={(next) => report(next, 'onCommit')}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        // A press anywhere on the track starts a drag. Radix moves the nearest thumb to
        // the press and gives it the pointer, so the state starts here rather than on the
        // thumb. The focus that follows tells which thumb is held.
        onPointerDown={() => {
          if (!disabled) setDragging(true)
        }}
        onKeyDown={(event: KeyboardEvent) => {
          if (!disabled && STEP_KEYS.has(event.key)) setDragging(true)
        }}
        onKeyUp={() => setDragging(false)}
        // Focus can leave during a press (for example when the window loses focus), and a
        // thumb left enlarged would wrongly look held.
        onBlur={() => setDragging(false)}
      >
        <SliderPrimitive.Track className={styles.track}>
          <SliderPrimitive.Range className={styles.range} />
        </SliderPrimitive.Track>

        {thumbs.map((_, index) => (
          <SliderPrimitive.Thumb
            key={index}
            className={styles.thumb}
            // Radix spreads the caller's props after its own attributes, so these values
            // reach the DOM. Only the held thumb grows.
            data-state={dragging && active === index ? 'dragging' : undefined}
            onFocus={() => setActive(index)}
            aria-label={ariaLabel}
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            aria-required={required}
            aria-invalid={invalid ? true : undefined}
            // Each thumb announces its own formatted value, using the same formatter as
            // the readout, so "40%" is never read as "40".
            aria-valuetext={spoken[index]}
          />
        ))}
      </SliderPrimitive.Root>
    </div>
  )
}

/**
 * Named by association, not by `for`. A `role="slider"` span is not a labelable element,
 * so a `<label for>` would render and look right but name nothing. `ControlKind` exists
 * to record this difference. FormField points its label at the thumb with
 * `aria-labelledby` instead.
 */
Slider.controlKind = 'group' satisfies ControlKind
