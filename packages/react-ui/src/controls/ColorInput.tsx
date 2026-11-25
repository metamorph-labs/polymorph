'use client'

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { useColorArea, useColorSlider, useLocale } from 'react-aria'
import {
  parseColor,
  useColorAreaState,
  useColorSliderState,
  type Color,
  type ColorAreaState,
  type ColorSliderState,
} from 'react-stately'

import {
  COLOR_INPUT_REST,
  composingKey,
  type ControlSize,
  dataAttrs,
  dataFlag,
  memberAttr,
  useAgentMember,
} from '@polymorph/react'
import { Popover, PopoverPanelMember } from '../overlays/Popover'
import { Input } from './Input'
import styles from '@polymorph/recipes/controls/color-input.module.css'

/**
 * A colour field: a swatch, a hex entry and a picker popover
 * (`design/components/color-input.md`). The popover is for choosing visually. It relates to
 * colour as DatePicker relates to Calendar: the field works without the popup, and a keyboard user
 * never has to open the picker plane.
 *
 * React Aria's colour hooks supply the behaviour: the two-channel plane, the channel rails, the
 * colour model, the RTL maths, and every gradient. The gradients follow from the colour model and
 * are not a theme decision. The vocabulary owns the surfaces: edges, radii, rings, the checker,
 * and the current-colour fills it writes through `--pm-color-input-*` (the same approach chart
 * marks use for data colours).
 *
 * The value format is lowercase hex only. A product that uses HSL converts at its own boundary,
 * because display modes in the control would be a product decision made inside the vocabulary.
 */

export interface ColorInputProps {
  /** Lowercase hex: `#rrggbb`, or `#rrggbbaa` with `alpha`. */
  value?: string
  defaultValue?: string
  /** Fires continuously while dragging, as Input does, with no separate commit as on Slider. */
  onChange?: (value: string) => void
  /** Enables the alpha channel: the alpha rail, the eight-digit hex and the checker. */
  alpha?: boolean
  /** Names the swatch button and the popover, for example "Choose accent colour". */
  pickerLabel: string
  size?: ControlSize
  disabled?: boolean
  invalid?: boolean
  id?: string
  /** Serializes the hex through a hidden input. */
  name?: string
  /** Opens the picker on mount, for galleries and tests. Screens let the user open it. */
  defaultOpen?: boolean
  /** Set by FormField. Set it directly only when there is no visible label. */
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
}

/**
 * Parses hex into a `Color`. Accepts three-, six- and eight-digit forms, with `#` optional. It
 * uses HSBA internally, so the hue is kept when the colour passes through black, white or zero
 * saturation during a drag. Returns `null` for invalid input. Callers then revert instead of
 * showing an error, because the previous colour is more useful than an empty error state.
 */
function parseHex(text: string, alpha: boolean): Color | null {
  const bare = text.trim().replace(/^#/, '')
  if (!/^([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(bare)) return null
  const parsed = parseColor(`#${bare}`).toFormat('hsba')
  return alpha ? parsed : parsed.withChannelValue('alpha', 1)
}

function formatHex(color: Color, alpha: boolean): string {
  return color.toString(alpha ? 'hexa' : 'hex').toLowerCase()
}

export function ColorInput({
  value,
  defaultValue,
  onChange,
  alpha = false,
  pickerLabel,
  size = 'md',
  disabled = false,
  invalid = false,
  id,
  name,
  defaultOpen,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
}: ColorInputProps) {
  const { locale } = useLocale()

  // A mirror of the value, not its owner, as in Slider, with one colour-specific difference. A
  // controlled `value` that converts to the same hex defers to the mirror, because the mirror keeps
  // the hue that hex loses. Otherwise a parent echoing `#000000` back mid-drag would snap the plane
  // to red.
  const [mirror, setMirror] = useState<Color>(
    // The engine's rest value, a neutral grey every framework's ColorInput starts from.
    () =>
      parseHex(defaultValue ?? COLOR_INPUT_REST, alpha) ??
      parseColor(COLOR_INPUT_REST).toFormat('hsba'),
  )
  const controlled = useMemo(
    () => (value === undefined ? null : parseHex(value, alpha)),
    [value, alpha],
  )
  const color =
    controlled !== null && formatHex(controlled, alpha) !== formatHex(mirror, alpha)
      ? controlled
      : mirror
  const hex = formatHex(color, alpha)

  function setColor(next: Color) {
    const normalized = next.toFormat('hsba')
    setMirror(normalized)
    onChange?.(formatHex(normalized, alpha))
  }

  /**
   * The hex draft: text the user has typed but not committed. It is local and nullable rather
   * than the value itself, so the field can hold "88" without the swatch turning grey. Blur or
   * Enter commits it, and invalid text reverts.
   */
  const [draft, setDraft] = useState<string | null>(null)

  function commitDraft() {
    if (draft === null) return
    const next = parseHex(draft, alpha)
    setDraft(null)
    if (next !== null) setColor(next)
  }

  function onFieldKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    // The Enter that confirms an input method's candidate is the input method's (`composingKey`).
    if (event.key === 'Enter' && !composingKey(event.nativeEvent)) commitDraft()
  }

  // The member registers its hex field and withholds the Input it draws. The picker's Popover is
  // a part of this member: it registers nothing, and its panel, which portals out of the root,
  // is withheld as a second region. An agent's set commits a hex as the field's commit does, and
  // refuses text the field would revert.
  const rootRef = useRef<HTMLSpanElement>(null)
  const fieldRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const holdPanel = useCallback((panel: HTMLElement | null) => {
    panelRef.current = panel
  }, [])
  useAgentMember({
    member: 'ColorInput',
    element: () => fieldRef.current,
    state: () => ({ value: hex, disabled, invalid }),
    actions: {
      set: {
        argument: 'text',
        run: (text) => {
          const next = parseHex(text, alpha)
          if (next === null) throw new Error(`"${text}" is not a hex colour.`)
          setDraft(null)
          setColor(next)
        },
      },
    },
    withholds: () => [rootRef.current, panelRef.current],
  })

  const swatch = (
    <button type="button" className={styles.swatch} disabled={disabled} aria-label={pickerLabel}>
      <span
        className={styles.swatchFill}
        style={{ '--pm-color-input-swatch': color.toString('css') } as CSSProperties}
      />
    </button>
  )

  return (
    <span
      ref={rootRef}
      className={styles.root}
      {...dataAttrs({ size, disabled, invalid })}
      {...dataFlag('alpha', alpha)}
      {...memberAttr('ColorInput')}
    >
      <PopoverPanelMember panel={holdPanel}>
        <Popover label={pickerLabel} trigger={swatch} defaultOpen={defaultOpen} align="start">
          <Picker
            color={color}
            onChange={setColor}
            alpha={alpha}
            disabled={disabled}
            locale={locale}
          />
        </Popover>
      </PopoverPanelMember>

      {/* The primary input, using Input unchanged. `#` is the prefix, so the value is digits only
          and a pasted "#8864f0" still works. */}
      <span className={styles.field} onKeyDown={onFieldKeyDown}>
        <Input
          value={draft ?? hex.replace(/^#/, '')}
          onChange={(next) =>
            // Sanitized here rather than by `maxLength`, because a native cap would truncate a
            // pasted "#8864f0" before the # could be removed.
            setDraft(
              next
                .replace(/#/g, '')
                .trim()
                .slice(0, alpha ? 8 : 6),
            )
          }
          onBlur={commitDraft}
          controlRef={fieldRef}
          prefix="#"
          size={size}
          disabled={disabled}
          invalid={invalid}
          id={id}
          autoComplete="off"
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-required={required}
        />
      </span>

      {name === undefined ? null : <input type="hidden" name={name} value={hex} />}
    </span>
  )
}

/** The popover content: the plane above, the rails below. */
interface PickerProps {
  color: Color
  onChange: (next: Color) => void
  alpha: boolean
  disabled: boolean
  locale: string
}

function Picker({ color, onChange, alpha, disabled, locale }: PickerProps) {
  const areaState = useColorAreaState({
    value: color,
    onChange,
    xChannel: 'saturation',
    yChannel: 'brightness',
  })
  const hueState = useColorSliderState({ channel: 'hue', value: color, onChange, locale })
  const alphaState = useColorSliderState({ channel: 'alpha', value: color, onChange, locale })

  return (
    <div className={styles.picker}>
      <Plane state={areaState} disabled={disabled} />
      <Rail state={hueState} channel="hue" disabled={disabled} />
      {alpha ? <Rail state={alphaState} channel="alpha" checker disabled={disabled} /> : null}
    </div>
  )
}

/**
 * The saturation × brightness plane. React Aria returns the gradient, the thumb position and the
 * RTL maths in its style props. The two hidden range inputs are its accessibility model: one tab
 * stop per channel, with arrows moving both axes from either. The composite-field selector draws
 * the ring on the thumb when either input has focus.
 */
function Plane({ state, disabled }: { state: ColorAreaState; disabled: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputXRef = useRef<HTMLInputElement>(null)
  const inputYRef = useRef<HTMLInputElement>(null)
  const { colorAreaProps, thumbProps, xInputProps, yInputProps } = useColorArea(
    { containerRef, inputXRef, inputYRef, isDisabled: disabled },
    state,
  )

  return (
    <div
      {...colorAreaProps}
      ref={containerRef}
      className={styles.plane}
      style={colorAreaProps.style}
    >
      <span
        {...thumbProps}
        className={styles.thumb}
        {...dataAttrs({ state: state.isDragging ? 'dragging' : undefined })}
        style={
          {
            ...thumbProps.style,
            '--pm-color-input-thumb': state.value.toString('css'),
          } as CSSProperties
        }
      >
        <input ref={inputXRef} {...xInputProps} />
        <input ref={inputYRef} {...yInputProps} />
      </span>
    </div>
  )
}

/**
 * One channel as a rail: hue, or alpha over the checker. React Aria's track style carries the
 * gradient. It is moved onto an inner layer so the checker, which the theme owns, can sit beneath
 * the fade, which the colour model owns.
 */
function Rail({
  state,
  channel,
  checker = false,
  disabled,
}: {
  state: ColorSliderState
  channel: 'hue' | 'alpha'
  checker?: boolean
  disabled: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { trackProps, thumbProps, inputProps } = useColorSlider(
    { channel, trackRef, inputRef, isDisabled: disabled },
    state,
  )
  const { background, ...trackStyle } = (trackProps.style ?? {}) as CSSProperties

  return (
    <div
      {...trackProps}
      ref={trackRef}
      className={styles.rail}
      {...dataFlag('checker', checker)}
      style={trackStyle}
    >
      <span className={styles.railFill} style={{ background }} aria-hidden="true" />
      <span
        {...thumbProps}
        className={styles.thumb}
        {...dataAttrs({ state: state.isDragging ? 'dragging' : undefined })}
        style={
          {
            ...thumbProps.style,
            '--pm-color-input-thumb': state.getDisplayColor().toString('css'),
          } as CSSProperties
        }
      >
        <input ref={inputRef} {...inputProps} />
      </span>
    </div>
  )
}
