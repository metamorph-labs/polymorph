'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { flushSync } from 'react-dom'

import {
  composingKey,
  type ControlKind,
  type ControlSize,
  dataAttrs,
  dataFlag,
  holdFieldEscape,
  Icon,
  lineStartKey,
  memberAttr,
  useAgentMember,
} from '@polymorph/react'
import { MotionPresence, MotionSurface } from '@polymorph/react/motion'
import styles from '@polymorph/recipes/controls/tag-input.module.css'

/**
 * Free-text tags (`design/components/tag-input.md`).
 *
 * It takes several values, each typed and shown as a chip. Typical uses are emails to invite
 * and labels to attach. There is no substrate: it is an Input-styled container holding a list
 * of chips and one real `<input>`. The component is mostly its commit rules (what counts as a
 * tag, what happens to a duplicate, what Backspace removes). Those are design decisions, not
 * behaviour a library could supply.
 *
 * Choosing from a closed list is Combobox's job. This member never suggests values.
 * Every value in it was typed.
 */

/** Enter and comma commit. Paste splits on commas and newlines. */
const SEPARATORS = /[\n,]+/

/** The default normalize-or-reject policy: trim, and reject the empty string. */
function trimNonEmpty(raw: string): string | null {
  const tag = raw.trim()
  return tag === '' ? null : tag
}

/**
 * The count sentence, given how many tags the field holds, its `max`, and whether it holds
 * that many (`atMax`, resolved by the member). A function, not two words, because the plural
 * and the order of the words belong to the catalog.
 */
export type TagInputCountLabel = (tags: { count: number; max?: number; atMax: boolean }) => string

export interface TagInputProps {
  value?: string[]
  defaultValue?: string[]
  onChange?: (values: string[]) => void
  /** Shown only while empty. The chips are the value, and a placeholder beside them is clutter. */
  placeholder?: string
  /**
   * Normalize or reject: return the tag as it should be stored, or `null` to reject it.
   * A rejection flashes the container and shows no message. Persistent written errors
   * come from FormField.
   */
  validate?: (raw: string) => string | null
  /**
   * At the maximum the field is read-only, not removed and not disabled. A full field is
   * still what FormField's label points at, and keyboard users can still reach it. It
   * blocks typing, not access.
   */
  max?: number
  size?: ControlSize
  /**
   * Fires when focus leaves the whole field, for touched validation. Chips and input are
   * one control, so moving focus between them is not a blur. Only leaving the field is.
   */
  onBlur?: (event: FocusEvent<HTMLDivElement>) => void
  disabled?: boolean
  invalid?: boolean
  /** Serialises comma-joined into a hidden input, for a native form post. */
  name?: string
  id?: string
  /**
   * The accessible name of a chip's remove button. It is a function because the tag is
   * data and the text around it comes from the app's message catalog. Defaults to
   * `Remove {tag}`.
   */
  removeLabel?: (tag: string) => string
  /**
   * The count sentence in the host's words, part of the field's description, the localization
   * seam; the default is `{count} added`, or `Maximum of {max} added` at the maximum.
   */
  countLabel?: TagInputCountLabel
  /** Wired by FormField; set directly only when there is no visible label. */
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
}

const defaultRemoveLabel = (tag: string) => `Remove ${tag}`

const defaultCountLabel: TagInputCountLabel = ({ count, max, atMax }) =>
  atMax ? `Maximum of ${max} added` : `${count} added`

export function TagInput({
  value,
  defaultValue,
  onChange,
  placeholder,
  validate = trimNonEmpty,
  max,
  size = 'md',
  onBlur,
  disabled = false,
  invalid = false,
  name,
  id,
  removeLabel = defaultRemoveLabel,
  countLabel = defaultCountLabel,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
}: TagInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const removeRefs = useRef(new Map<string, HTMLButtonElement | null>())
  const generatedId = useId()

  const [uncontrolled, setUncontrolled] = useState<string[]>(defaultValue ?? [])
  const values = value ?? uncontrolled
  const [text, setText] = useState('')

  /** The chip that matches a duplicate entry, and whether the last entry was rejected. */
  const [flashing, setFlashing] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  /** Set before the removal commits, so the leaving chip is marked. */
  const [removing, setRemoving] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const atMax = max !== undefined && values.length >= max
  const countId = `${id ?? generatedId}-count`

  function commit(next: string[]) {
    setUncontrolled(next)
    onChange?.(next)
  }

  /*
   * Escape clears uncommitted text, and that Escape is the field's: a Dialog around the field
   * stays open (`holdFieldEscape`). With no text left, Escape is the Dialog's again.
   */
  const clearable = text !== ''
  useEffect(() => {
    const element = inputRef.current
    if (!clearable || element === null) return
    return holdFieldEscape(element)
  }, [clearable])

  /** Adds what it can, and flags rejected entries and duplicates. */
  function add(raws: string[]): void {
    const next = [...values]
    let refusal = false
    let duplicate: string | null = null

    for (const raw of raws) {
      if (max !== undefined && next.length >= max) break
      const tag = validate(raw)
      if (tag === null) {
        refusal = true
        continue
      }
      // Duplicates are never added. The existing chip flashes instead.
      if (next.includes(tag)) {
        duplicate = tag
        continue
      }
      next.push(tag)
    }

    setRefused(refusal)
    setFlashing(duplicate)
    if (next.length !== values.length) commit(next)
  }

  /*
   * An agent commits one tag as Enter does, through `add`, and refuses what Enter would not
   * add: a refused or duplicate tag, a field at the maximum, and text a person's comma or line
   * break would split. `clear` removes every chip at once, with one `onChange`.
   */
  useAgentMember({
    member: 'TagInput',
    element: () => inputRef.current,
    state: () => ({ value: values, disabled, invalid }),
    actions: {
      add: {
        argument: 'text',
        run: (raw) => {
          if (SEPARATORS.test(raw)) {
            throw new Error('A tag holds no comma or line break: add each tag on its own.')
          }
          if (atMax) throw new Error(`The field holds its maximum of ${max} tags.`)
          const tag = validate(raw)
          if (tag === null) throw new Error(`The field refuses "${raw}" as a tag.`)
          if (values.includes(tag)) throw new Error(`The field already holds "${tag}".`)
          add([raw])
        },
      },
      clear: () => {
        if (values.length > 0) commit([])
      },
    },
  })

  function remove(tag: string): void {
    const index = values.indexOf(tag)

    /*
     * Two renders on purpose, as in the toast stack. The first marks the chip as leaving,
     * so the node the exit animation takes over already has `data-removing`. The second
     * removes it. If they were batched into one, which React does without the flush, the
     * chip would leave the list without ever being marked, and the motion engine would
     * animate a node whose last props did not include the flag.
     */
    flushSync(() => setRemoving(tag))
    setRemoving(null)
    commit(values.filter((value) => value !== tag))
    setAnnouncement(`${tag} removed, ${values.length - 1} remain`)

    // Focus moves to the chip that took its place, or back to the field. Never to
    // `<body>`, which is where focus goes by default when a focused button is removed.
    const next = values[index + 1]
    const target = next === undefined ? null : (removeRefs.current.get(next) ?? null)
    if (target) target.focus()
    else inputRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    // Every key an input method is handling is its own: the Enter that confirms a candidate
    // commits no half-typed tag, and Backspace edits the composition, not the chips.
    if (composingKey(event.nativeEvent)) return
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      add([text])
      setText('')
      return
    }
    if (event.key === 'Escape' && text !== '') {
      // Clears uncommitted text only. Inside a Dialog, Escape still closes it once
      // there is no text left to clear.
      event.preventDefault()
      setText('')
      return
    }
    if (event.key === 'Backspace' && text === '') {
      const last = values[values.length - 1]
      if (last !== undefined) remove(last)
      return
    }
    // The chips come before the field in reading order, so the key toward the line's start
    // moves into them: ← left to right, → right to left. The direction is a computed style, read
    // only for an arrow, so a typed character does not read it.
    if (
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
      event.key === lineStartKey(event.currentTarget) &&
      event.currentTarget.selectionStart === 0
    ) {
      const last = values[values.length - 1]
      if (last !== undefined) removeRefs.current.get(last)?.focus()
    }
  }

  /**
   * Chip navigation: the key toward the line's start moves to the previous chip, the other to
   * the next, and past the last one returns to the field. ← is toward the start left to right,
   * and → right to left.
   */
  function handleChipKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const tag = values[index]
    if (tag === undefined) return

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      remove(tag)
      return
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const step = event.key === lineStartKey(event.currentTarget) ? -1 : 1
      const neighbour = values[index + step]
      if (neighbour === undefined) {
        if (step === 1) inputRef.current?.focus()
        return
      }
      removeRefs.current.get(neighbour)?.focus()
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>): void {
    const pasted = event.clipboardData.getData('text')
    if (!SEPARATORS.test(pasted)) return
    // Only a list is intercepted. Pasting one value still goes into the field, where it
    // can be edited before it commits.
    event.preventDefault()
    add(pasted.split(SEPARATORS))
    setText('')
  }

  /** Clicking the container focuses the field, except on parts that are controls themselves. */
  function handleMouseDown(event: MouseEvent<HTMLDivElement>): void {
    if ((event.target as HTMLElement).closest('button, input')) return
    event.preventDefault()
    inputRef.current?.focus()
  }

  /**
   * The container's blur, not the input's. React's `onBlur` uses `focusout`, so focus
   * leaving any part bubbles here, and `relatedTarget` tells where focus went. Moving
   * within the field (between chips, or pressing a remove button) is not a blur. Only
   * leaving the whole control is.
   */
  function handleBlur(event: FocusEvent<HTMLDivElement>): void {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    onBlur?.(event)
  }

  return (
    <div
      className={styles.container}
      onMouseDown={handleMouseDown}
      onBlur={handleBlur}
      {...dataAttrs({ size, disabled, invalid, state: atMax ? 'at-max' : undefined })}
      // The refusal flash. It shows the danger border without toggling `data-invalid`,
      // because that attribute is the field's steady state, and a flashing value would
      // mislead every fixture and law that reads it.
      {...dataFlag('refused', refused)}
      /*
       * Both flashes end here. `animationend` bubbles, so the container receives both its
       * own refusal flash and a chip's duplicate flash, and either way the flash is over.
       * It is also the only place that can receive the chip's event. A chip is a motion
       * surface whose props belong to the motion engine, and animation events are not
       * among them.
       *
       * The engine's own animations do not trigger this. `motion` uses WAAPI, which
       * finishes on an `Animation` object rather than firing a CSS `animationend` on the
       * element.
       */
      onAnimationEnd={() => {
        setRefused(false)
        setFlashing(null)
      }}
      {...memberAttr('TagInput')}
    >
      <ul className={styles.chips}>
        <MotionPresence>
          {values.map((tag, index) => (
            <MotionSurface
              key={tag}
              as="li"
              binding="taginput.chip"
              layoutBinding="taginput.reflow"
              className={styles.chip}
              {...dataFlag('removing', removing === tag)}
              {...dataFlag('flash', flashing === tag)}
            >
              <span className={styles.label}>{tag}</span>

              {disabled ? null : (
                <button
                  ref={(node) => {
                    removeRefs.current.set(tag, node)
                  }}
                  type="button"
                  className={styles.remove}
                  aria-label={removeLabel(tag)}
                  onClick={() => remove(tag)}
                  onKeyDown={(event) => handleChipKeyDown(event, index)}
                >
                  <Icon name="close" size="sm" />
                </button>
              )}
            </MotionSurface>
          ))}
        </MotionPresence>
      </ul>

      {/*
       * Always mounted, and read-only at the maximum rather than removed or disabled.
       *
       * This input is the field. It holds the id that FormField's `<label for>` points at,
       * the description, the required flag and the invalid state. A full TagInput that
       * unmounted it would leave a visible label that names nothing and lose all four
       * associations.
       *
       * Disabling it only half solves that. A disabled input is out of the tab order and
       * the focusable set, so a full field would have a label whose target cannot be
       * reached. Keyboard users tabbing through the form would reach the chips' remove
       * buttons with nothing before them to say what they belong to. `readOnly` is the
       * HTML state for "this is the field, and it takes no text": focusable, labelled,
       * announced as read-only, and it still handles Backspace, so a full field can be
       * changed without a mouse. The visual cues match (no text cursor,
       * `data-state="at-max"` on the container), and the description below explains why.
       */}
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        // A half-typed tag is not a value. Committing on blur would add unfinished tags,
        // and silently discarding the text is less surprising.
        placeholder={values.length === 0 ? placeholder : undefined}
        readOnly={atMax}
        disabled={disabled}
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        // The count is added to the field's description rather than replacing it,
        // because the number of values is part of describing this field.
        aria-describedby={[describedBy, countId].filter(Boolean).join(' ')}
        aria-required={required}
        aria-invalid={invalid ? true : undefined}
      />

      {/*
       * The count, and at the maximum the reason. One element rather than two, because
       * it is one sentence answering one question: how many values there are. A second
       * description id that appeared only at the maximum would change the field's
       * associations while a screen-reader user is in it.
       *
       * `Maximum of N added` is derived from `max`, so the announced number is the number
       * the field enforces. There is no second copy of the maximum to go out of sync. The
       * words are the host's from `countLabel`.
       */}
      <span className={styles.reader} id={countId}>
        {countLabel({ count: values.length, max, atMax })}
      </span>

      {/* Removals are announced because screen-reader users cannot see them happen:
          the chip is gone, and so is the focus that was on it. */}
      <span className={styles.reader} aria-live="polite">
        {announcement}
      </span>

      {/* Disabled with the component, because a disabled field posts nothing. The
          hidden input carries the field's value and follows the control's state. */}
      {name === undefined ? null : (
        <input type="hidden" name={name} value={values.join(',')} disabled={disabled} />
      )}
    </div>
  )
}

TagInput.controlKind = 'field' satisfies ControlKind
