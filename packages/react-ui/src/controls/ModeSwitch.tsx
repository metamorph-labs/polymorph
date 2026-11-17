'use client'

import { useCallback, useRef } from 'react'

import { setMode, useAgentMember, useMode, type ModePreference } from '@polymorph/react'
import {
  SegmentedControl,
  SegmentedControlMember,
  type SegmentedControlOption,
} from './SegmentedControl'

/**
 * Chooses light, dark or the system's mode (`design/components/mode-switch.md`). It is a
 * SegmentedControl preset: the three segments, their order, their glyphs and the binding to the
 * theme runtime are decided here, so no screen decides them again.
 *
 * It is not a light and dark toggle. Every application that offers the choice offers `system`
 * too, because a reader who set the operating system's mode expects the page to follow it. It is
 * not the place to choose a system or a palette either: those are names an application lists,
 * and a Select or a Menu holds them.
 *
 * Uncontrolled, it shows the document's preference and applies a choice with the runtime's
 * `setMode`. Controlled (`value`), it shows `value`, reports a choice through `onChange` and
 * applies nothing, so an application that saves the choice elsewhere applies it, and puts the
 * old one back if the save fails.
 */

/**
 * The words the member writes itself, localized by passing them (WCAG 3.1.2). Pass every key, so
 * one ModeSwitch never mixes two languages.
 */
export interface ModeSwitchMessages {
  /** The segment that pins the light mode: "Light". */
  light: string
  /** The segment that pins the dark mode: "Dark". */
  dark: string
  /** The segment that follows the operating system's mode: "System". */
  system: string
}

const DEFAULT_MESSAGES: ModeSwitchMessages = { light: 'Light', dark: 'Dark', system: 'System' }

export interface ModeSwitchProps {
  /** The group's accessible name ("Appearance"), because outside a form no FormField names it. */
  label: string
  /**
   * The choice shown, while the application holds it. With it, a choice calls `onChange` and
   * sets no mode. Without it, the ModeSwitch shows the document's preference and sets the mode.
   */
  value?: ModePreference
  /** The reader's choice. Uncontrolled, it is called after the mode is set. */
  onChange?: (value: ModePreference) => void
  /** Omit for the English defaults; a localized application passes every key. */
  messages?: ModeSwitchMessages
  /** SegmentedControl's sizes: it sits in a toolbar, a menu's header or a settings row. */
  size?: 'sm' | 'md'
  disabled?: boolean
}

/** The three choices in reading order: the two the reader pins, then the one that defers. */
const CHOICES: readonly ModePreference[] = ['light', 'dark', 'system']

/** The segment's value as a preference. Every segment is one of the three. */
const chosen = (value: string): ModePreference =>
  value === 'light' || value === 'dark' ? value : 'system'

export function ModeSwitch({
  label,
  value,
  onChange,
  messages = DEFAULT_MESSAGES,
  size = 'md',
  disabled = false,
}: ModeSwitchProps) {
  // The document's preference, which follows every `setMode` and reads `system` on a server.
  const { preference } = useMode()
  const options: SegmentedControlOption[] = CHOICES.map((choice) => ({
    value: choice,
    label: messages[choice],
    icon: `mode-${choice}`,
  }))
  const shown = value ?? preference
  const choose = (next: string) => {
    const picked = chosen(next)
    if (value === undefined) setMode(picked)
    onChange?.(picked)
  }

  // The track is the SegmentedControl's, which hands it back through `SegmentedControlMember`.
  // It names the switch, and the SegmentedControl on it is this member's own part, so the
  // member registers in its place and withholds it. A choice takes the path a person's press
  // takes: uncontrolled, it sets the document's mode, and either way it calls `onChange`.
  const trackRef = useRef<HTMLElement | null>(null)
  const holdTrack = useCallback((track: HTMLElement | null) => {
    trackRef.current = track
  }, [])
  useAgentMember({
    member: 'ModeSwitch',
    element: () => trackRef.current,
    state: () => ({
      value: shown,
      options: options.map((option) => ({ id: option.value, label: option.label })),
      disabled,
    }),
    actions: {
      choose: {
        argument: 'id',
        run: (choice) => {
          if (choice !== shown) choose(choice)
        },
      },
    },
    withholds: () => trackRef.current,
  })

  return (
    <SegmentedControlMember member="ModeSwitch" track={holdTrack}>
      <SegmentedControl
        options={options}
        value={shown}
        onChange={choose}
        label={label}
        size={size}
        disabled={disabled}
      />
    </SegmentedControlMember>
  )
}
