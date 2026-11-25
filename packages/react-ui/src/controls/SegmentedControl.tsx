'use client'

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { Icon, type IconRole, memberAttr, useAgentMember, useDirection } from '@polymorph/react'
import { useArrowSelection } from './radio-arrows'
import styles from '@polymorph/recipes/controls/segmented-control.module.css'

/**
 * A joined row of segments that always holds one value (`design/components/segmented-control.md`).
 *
 * It picks one of a few options where the choice applies. It is not Tabs: it never shows
 * or hides a panel, it sets a value (a period, a scope, a mode). If choosing changes which
 * content region is visible, use Tabs. It is not RadioGroup, which has the same semantics
 * (one of a few, all visible) but a different use. RadioGroup is a form list, wired by
 * FormField, and may render with nothing chosen. This is a toolbar control that applies
 * immediately and is never empty. So an uncontrolled one with no `defaultValue` selects
 * the first option (Tabs' default, for the same reason).
 *
 * There is no `name`, because this control acts immediately and is not submitted. For a
 * single choice in a form, use RadioGroup. It is horizontal only, because a vertical stack
 * of joined segments would just be RadioGroup with different styling.
 */

export interface SegmentedControlOption {
  value: string
  label: string
  icon?: IconRole
  disabled?: boolean
}

export type SegmentedControlSize = 'sm' | 'md'

export interface SegmentedControlProps {
  /** Items render from data, because free-form children invite ad hoc layouts (Radio's law). */
  options: SegmentedControlOption[]
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  /**
   * There is no `lg`, on purpose. A segmented control is an inline control used in
   * toolbars, page headers and filter rows next to `sm`/`md` controls. A form-sized single
   * choice is RadioGroup in a FormField, not this at 44px.
   */
  size?: SegmentedControlSize
  /** The group's accessible name, because outside a form there is no FormField to name it. */
  label: string
  /** Disables the whole group. Use `disabled` in `options` for single options. */
  disabled?: boolean
}

/**
 * The composition seam for the identity attribute (`data-member`), as Dialog's
 * `DialogPanelMember` is. ModeSwitch is a preset with no track of its own: the
 * track below is its track. So it renders under this provider, and the track
 * carries `mode-switch` instead of `segmented-control`. It is context rather
 * than a prop, because the member a track belongs to is not the caller's
 * decision.
 */
const TrackMember = createContext('SegmentedControl')

/**
 * Where the member that lends this track its identity reads the track, when it asks to:
 * ModeSwitch's agent handle names the track and withholds the SegmentedControl on it, as
 * ConfirmDialog reads its Dialog's panel through `DialogPanelMember`.
 */
const LentTrack = createContext<((track: HTMLElement | null) => void) | null>(null)

export function SegmentedControlMember({
  member,
  track = null,
  children,
}: {
  member: string
  /** Called with the track when it mounts, and with `null` when it unmounts. */
  track?: ((track: HTMLElement | null) => void) | null
  children: ReactNode
}) {
  return (
    <TrackMember value={member}>
      <LentTrack value={track}>{children}</LentTrack>
    </TrackMember>
  )
}

export function SegmentedControl({
  options,
  value,
  defaultValue,
  onChange,
  size = 'md',
  label,
  disabled = false,
}: SegmentedControlProps) {
  const member = useContext(TrackMember)
  const lentTrack = useContext(LentTrack)
  // The direction of the place the member is in, which Radix would otherwise take to be
  // left-to-right.
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dir = useDirection(trackRef)
  // Arrow-key selection that also works for a quick tap (`radio-arrows.ts`).
  const arrows = useArrowSelection()

  // The member holds the value, and Radix is always controlled by it: by `value` when the caller
  // gives it, and by the member's own state when not, seeded with the first option because the
  // control is never empty. So one setter changes the value in both forms, for a person's press
  // through Radix and for an agent's choice, and `onChange` reports both the same way.
  const [own, setOwn] = useState<string | undefined>(defaultValue ?? options[0]?.value)
  const current = value ?? own
  const change = (next: string) => {
    if (next === current) return
    if (value === undefined) setOwn(next)
    onChange?.(next)
  }

  const holdTrack = useCallback(
    (track: HTMLDivElement | null) => {
      trackRef.current = track
      lentTrack?.(track)
    },
    [lentTrack],
  )
  useAgentMember({
    member: 'SegmentedControl',
    element: () => trackRef.current,
    state: () => ({
      value: current ?? null,
      options: options.map((option) => ({
        id: option.value,
        label: option.label,
        ...(option.disabled === true ? { disabled: true } : {}),
      })),
      disabled,
    }),
    actions: { choose: { argument: 'id', run: (choice) => change(choice) } },
  })

  return (
    <RadioGroupPrimitive.Root
      ref={holdTrack}
      dir={dir}
      className={styles.track}
      value={current ?? null}
      // The control always renders with a value. An empty state with nothing chosen
      // belongs to RadioGroup, not this member.
      defaultValue={defaultValue ?? options[0]?.value}
      onValueChange={change}
      disabled={disabled}
      aria-label={label}
      // Radix writes `data-disabled` on the root. `data-size` is this member's.
      // There is no `orientation`, because the control is always horizontal. Leaving
      // Radix's roving focus without an orientation lets all four arrow keys move the
      // selection, which is the native radio behaviour WAI-APG requires.
      data-size={size}
      {...memberAttr(member)}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          className={styles.segment}
          value={option.value}
          disabled={option.disabled}
          {...arrows}
        >
          {/* The chip surface, only when checked. Radix mounts it with the state and
              the stylesheet gives it no entrance animation, so chip, seat and text change
              in the same frame. This is the spec's Motion rule: selection changes
              instantly, because a value change should not draw attention. Decorative,
              because the state is in `aria-checked`. */}
          <RadioGroupPrimitive.Indicator className={styles.chip} />
          {option.icon === undefined ? null : (
            <span className={styles.glyph}>
              <Icon name={option.icon} size={size} />
            </span>
          )}
          <span className={styles.label}>{option.label}</span>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  )
}
