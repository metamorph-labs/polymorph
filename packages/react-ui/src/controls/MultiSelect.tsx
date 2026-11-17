'use client'

import * as PopoverPrimitive from '@radix-ui/react-popover'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  type UIEvent,
} from 'react'
import { flushSync } from 'react-dom'
import { ListKeyboardDelegate, useFilter, useListBox, useOption } from 'react-aria'
import { Item, useListState, type ListState, type Node } from 'react-stately'

import {
  type ControlSize,
  dataAttrs,
  dataFlag,
  Icon,
  memberAttr,
  useAgentMember,
} from '@polymorph/react'
import { MotionPresence, MotionSurface } from '@polymorph/react/motion'
import { SheetSurface, usePhoneViewport } from '../overlays/sheet'
import { Skeleton } from '../structure/Skeleton'
import styles from '@polymorph/recipes/controls/multi-select.module.css'

/**
 * Picks several values from a filterable closed list (`design/components/multi-select.md`).
 *
 * Typical uses are assignees, labels and watchers. The value type changes (`string` to
 * `string[]`), so this is a separate member and not a Combobox mode.
 *
 * It is not Combobox, which holds one value and resolves free text against it. Here the
 * value is the chips and the input is only a filter. It is not TagInput, which accepts
 * any value. Here every chip comes from an option, unless `allowCustom` enables the mint
 * row. It is not Select, which has no text filter and holds one value.
 *
 * **The focus boundary (`design/components/README-substrates.md`, same as Combobox):** DOM
 * focus stays in the input, and the listbox is driven by `aria-activedescendant`. The
 * popup has no focus scope. React Aria's collection hooks own input semantics, filtering
 * and selection state. The Radix overlay owns position and dismissal. Importing
 * `useOverlay`/`useModal` here is a defect. Combobox uses `useComboBox`, but React Aria's
 * combobox state supports only single selection. So this member uses the lower-level
 * hooks from the same family, `useListState` + `useListBox`/`useOption` with virtual
 * focus, which are designed for building a multi-select listbox.
 */

export interface MultiSelectOption {
  value: string
  label: string
  /** A second line under the label. The check column is unchanged. */
  description?: string
  disabled?: boolean
}

/**
 * Every string this member displays or announces, so apps can localize them, as with
 * `emptyMessage` (WCAG 3.1.2: untranslatable announced text is read in the wrong
 * language). All fields are optional, and an omitted one keeps its English default.
 */
export interface MultiSelectMessages {
  /** The mint row's label (`allowCustom`). Default: `Add "{text}"`. */
  add?: (text: string) => string
  /** Announced when a custom value is added. Default: `{value} added, {count} selected`. */
  added?: (value: string, count: number) => string
  /** Announced on removal from a chip or the list. Default: `{label} removed, {count} selected`. */
  removed?: (label: string, count: number) => string
  /** Announced on Enter for text that `validate` rejected. Default: `Cannot add "{text}"`. */
  refused?: (text: string) => string
  /**
   * Announced on Enter for a value that is already selected.
   * Default: `"{value}" is already selected`.
   */
  alreadySelected?: (value: string) => string
  /** The count description, which states the maximum once it is reached. */
  selected?: (count: number, max: number | undefined) => string
  /** The chevron's accessible name. Default: `Show options`. */
  showOptions?: string
  /** A chip remove button's accessible name. Default: `Remove {label}`. */
  remove?: (label: string) => string
  /** The async status while the list loads. Default: `Loading options…`. */
  loadingOptions?: string
  /** The async status naming the result count. Default: `{count} options`. */
  options?: (count: number) => string
}

const MESSAGES = {
  add: (text: string) => `Add "${text}"`,
  added: (value: string, count: number) => `${value} added, ${count} selected`,
  removed: (label: string, count: number) => `${label} removed, ${count} selected`,
  refused: (text: string) => `Cannot add "${text}"`,
  alreadySelected: (value: string) => `"${value}" is already selected`,
  selected: (count: number, max: number | undefined) =>
    max !== undefined && count >= max ? `Maximum of ${max} selected` : `${count} selected`,
  showOptions: 'Show options',
  remove: (label: string) => `Remove ${label}`,
  loadingOptions: 'Loading options…',
  options: (count: number) => `${count} options`,
} satisfies Required<MultiSelectMessages>

export interface MultiSelectProps {
  /** The current list, shaped as in Combobox. With async loading the app supplies it per query. */
  options: MultiSelectOption[]
  /**
   * **Always in options order**: the reported array and the chips follow `options`,
   * not click order. A selection is a set, so the same choices always give the same value.
   */
  value?: string[]
  defaultValue?: string[]
  onChange?: (values: string[]) => void
  /**
   * Allows values outside `options` (the spec's boundary with TagInput). Typed text that
   * matches no option and passes `validate` appears as an extra last row, `Add "{text}"`,
   * and choosing it adds a chip. The row is removed, not disabled, when the text is empty
   * or rejected, matches an option, is already selected, or the field is full.
   */
  allowCustom?: boolean
  /**
   * Normalizes or rejects custom text, as in TagInput. Return the normalized value, or
   * `null` to reject it, which hides the mint row. Options chosen from the list skip it.
   */
  validate?: (raw: string) => string | null
  /**
   * `true` filters with the locale-aware contains check (`useFilter`, based on Intl), as in
   * Combobox. `false` means **the app filtered** (async), so server results are not
   * filtered again. The mint row is never filtered out, because it is built from the text.
   */
  filter?: boolean
  /** Async loading, as in Combobox, with the same loading and empty recipes. */
  loading?: boolean
  /**
   * Paging, as in Combobox. Fires when the highlight reaches the last real row or the open
   * listbox scrolls to its end, while `loading` is false, at most once per `options`
   * length. The app then appends the next page and sets `loading`. The highlight trigger is
   * the primary one (WCAG 2.1.1), because keyboard users cannot reach a scroll edge when the
   * page fits the panel. The mint row does not count as the last real row.
   */
  onLoadMore?: () => void
  /** The member's strings. See `MultiSelectMessages`. */
  messages?: MultiSelectMessages
  /** The empty-results text, passed in so apps can localize it (as in Combobox). */
  emptyMessage?: string
  /**
   * The maximum number of values, with TagInput's at-max rule. At the maximum the input
   * becomes read-only but stays focusable, labelled and announced as read-only. Backspace
   * still removes the last chip, and chips stay removable. Unchecked options are disabled.
   * Checked options stay active.
   */
  max?: number
  /**
   * Fires when focus leaves the whole field, for touched validation (as in TagInput).
   * Chips, input and chevron are one control, so moving focus between them is not a blur.
   */
  onBlur?: (event: FocusEvent<HTMLDivElement>) => void
  /** Shown only while there are no chips, because the chips are the value (as in TagInput). */
  placeholder?: string
  size?: ControlSize
  disabled?: boolean
  invalid?: boolean
  /** Serializes as in TagInput: a comma-joined hidden input, disabled with the field. */
  name?: string
  id?: string
  /** Opens on mount. For galleries and tests; screens let the user open it. */
  defaultOpen?: boolean
  /**
   * The initial filter text, for galleries and tests, like `defaultOpen`. The spec's
   * States table includes "open filtered", and a fixture cannot type.
   */
  defaultInputValue?: string
  /**
   * The controlled filter text, which async apps use to run their queries (as in
   * Combobox). It is implemented here by hand because this member uses the lower-level
   * collection hooks.
   */
  inputValue?: string
  onInputChange?: (value: string) => void
  /** Wired by FormField; set directly only when there is no visible label. */
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
  /**
   * As in Combobox (`combobox.md`; the conventions' sheet presentation). `'auto'` shows the
   * popup as a sheet below `30rem`, and `'popover'` keeps the popper at every width. There
   * is no always-sheet option.
   */
  presentation?: 'auto' | 'popover'
}

/** Three rows at option height, as in Combobox, so the panel keeps its size. */
const SKELETON_ROWS = [0, 1, 2]

/**
 * How close to the end counts as scrolled to the end, allowing for a wheel's last notch
 * (as in Combobox).
 */
const LOAD_MORE_EDGE_PX = 32

export function MultiSelect({
  options,
  value,
  defaultValue,
  onChange,
  allowCustom = false,
  validate,
  filter = true,
  loading = false,
  onLoadMore,
  messages,
  emptyMessage = 'No results',
  max,
  onBlur,
  placeholder,
  size = 'md',
  disabled = false,
  invalid = false,
  name,
  id,
  defaultOpen,
  defaultInputValue,
  inputValue,
  onInputChange,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
  presentation = 'auto',
}: MultiSelectProps) {
  const fieldRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listBoxRef = useRef<HTMLUListElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const removeRefs = useRef(new Map<string, HTMLButtonElement | null>())

  const generatedId = useId()
  const inputId = id ?? generatedId
  const listboxId = `${generatedId}-listbox`
  const countId = `${generatedId}-count`

  const [uncontrolled, setUncontrolled] = useState<string[]>(defaultValue ?? [])
  const values = value ?? uncontrolled
  const [uncontrolledText, setUncontrolledText] = useState(defaultInputValue ?? '')
  const text = inputValue ?? uncontrolledText
  const [open, setOpen] = useState(defaultOpen ?? false)
  /** Set before a removal commits, so the leaving chip is marked (as in TagInput). */
  const [removing, setRemoving] = useState<string | null>(null)
  /** The refusal flash (as in TagInput), cleared by its own `animationend`. */
  const [refused, setRefused] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  /** The member's strings, each replaceable for localization (the spec's messages cell). */
  const say = { ...MESSAGES, ...messages }

  const atMax = max !== undefined && values.length >= max
  const selected = new Set(values)

  /**
   * Always in options order. A selected value can be missing from the current `options`,
   * for example after an async list narrows. It keeps its chip, because the selection did
   * not change, and it goes after the ordered ones, labelled by its value.
   */
  const labels = new Map(options.map((option) => [option.value, option.label]))
  const ordered = (next: ReadonlySet<string>): string[] => [
    ...options.filter((option) => next.has(option.value)).map((option) => option.value),
    ...[...next].filter((entry) => !options.some((option) => option.value === entry)),
  ]

  // Locale-aware (based on Intl), the same check as Combobox.
  const { contains } = useFilter({ sensitivity: 'base' })
  /** Equality by the same check, as mutual containment, so "Aña" matches "ana". */
  const sameText = (a: string, b: string) => contains(a, b) && contains(b, a)

  /**
   * The custom value (the spec's boundary with TagInput) that `allowCustom` may add for
   * this text. It is `null` when the text is empty or rejected, matches an option by value
   * or label, is already selected, or the field is full. Then no row appears at all.
   */
  const normalize =
    validate ??
    ((raw: string) => {
      const trimmed = raw.trim()
      return trimmed === '' ? null : trimmed
    })
  const normalized = allowCustom && !atMax ? normalize(text) : null
  const mint =
    normalized !== null &&
    !selected.has(normalized) &&
    !options.some((option) => option.value === normalized || sameText(option.label, normalized))
      ? normalized
      : null

  /**
   * At the maximum, unchecked options are disabled. They use the disabled recipe, ignore
   * toggles, and keyboard navigation skips them (the conventions' disabled rule). Checked
   * options stay active, because unchecking is how a full field removes a value.
   */
  const disabledKeys = [
    ...options.filter((option) => option.disabled === true).map((option) => option.value),
    ...(atMax
      ? options.filter((option) => !selected.has(option.value)).map((option) => option.value)
      : []),
  ]

  const state = useListState<MultiSelectOption>({
    // The mint row is a real row in the collection. It is navigated, highlighted and
    // toggled like any other, and its label is the `Add` text. The chip it creates is
    // labelled by the value, because `labels` has no entry and the fallback is the value.
    // Its key is the value, so ordered() puts it last, like any value not in the options.
    items: mint === null ? options : [...options, { value: mint, label: say.add(mint) }],
    selectionMode: 'multiple',
    selectedKeys: values,
    disabledKeys,
    onSelectionChange: (keys) => {
      // 'all' cannot happen, because the listbox never holds DOM focus and so its
      // select-all shortcut cannot fire. It is handled anyway. Keys are the option
      // values, which are strings by this member's type.
      const next = ordered(
        keys === 'all'
          ? new Set(options.map((option) => option.value))
          : new Set([...keys].map(String)),
      )
      const dropped = values.filter((entry) => !next.includes(entry))
      commit(next)
      // Adding a custom value clears the filter text. It is announced in the same form
      // as a removal (the spec's a11y cell).
      if (mint !== null && next.includes(mint) && !values.includes(mint)) {
        commitText('')
        setAnnouncement(say.added(mint, next.length))
        return
      }
      // Unchecking an option and pressing a chip's remove are the same removal, with
      // the same announcement (the spec's single sentence).
      if (dropped.length > 0 && next.length < values.length) {
        setAnnouncement(say.removed(labels.get(dropped[0] ?? '') ?? dropped[0] ?? '', next.length))
      }
    },
    // `filter` narrows only the visible rows. The selection state uses the full list.
    // The mint row is never filtered out, because it is built from the text, and its
    // "Add" label might not contain the untrimmed text.
    ...(filter && text !== ''
      ? {
          filter: (nodes: Iterable<Node<MultiSelectOption>>) =>
            [...nodes].filter(
              (node) => String(node.key) === mint || contains(node.textValue, text),
            ),
        }
      : {}),
    children: (option: MultiSelectOption) => (
      <Item key={option.value} textValue={option.label}>
        {option.label}
      </Item>
    ),
  })
  const manager = state.selectionManager

  function commit(next: string[]) {
    setUncontrolled(next)
    onChange?.(next)
  }

  /** The text counterpart of `commit`. One writer, so the controlled pair sees every change. */
  function commitText(next: string) {
    setUncontrolledText(next)
    onInputChange?.(next)
  }

  /** Keyboard navigation over the visible rows, skipping disabled keys. */
  const delegate = new ListKeyboardDelegate({
    collection: state.collection,
    disabledKeys: state.disabledKeys,
    ref: listBoxRef,
  })

  function close() {
    setOpen(false)
    manager.setFocusedKey(null)
    manager.setFocused(false)
  }

  function openPopup(strategy?: 'first' | 'last') {
    setOpen(true)
    if (strategy === undefined) return
    manager.setFocused(true)
    manager.setFocusedKey(strategy === 'first' ? delegate.getFirstKey() : delegate.getLastKey())
  }

  /**
   * When the query changes, the highlight moves to the first visible option, as the APG
   * specifies. This makes "open filtered, first highlighted" true from the first frame.
   * The effect checks the text, so arrow-key movement (which does not change it) is not
   * reset. `state` is in the dependency list because the first key must come from the
   * collection this render built. The text check makes the extra runs do nothing.
   */
  const aimed = useRef<string | null>(null)
  useEffect(() => {
    if (!open || aimed.current === text) return
    aimed.current = text
    manager.setFocused(true)
    manager.setFocusedKey(delegate.getFirstKey())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the delegate and manager are remade per render; the text guard above is the real dependency
  }, [open, text, state])

  function remove(entry: string): void {
    const current = ordered(selected)
    const index = current.indexOf(entry)

    // Two renders on purpose, as in TagInput. The first marks the chip as leaving so
    // the motion engine animates a node whose props say so. The second removes it.
    flushSync(() => setRemoving(entry))
    setRemoving(null)
    const next = current.filter((held) => held !== entry)
    commit(next)
    setAnnouncement(say.removed(labels.get(entry) ?? entry, next.length))

    const following = current[index + 1]
    const target = following === undefined ? null : (removeRefs.current.get(following) ?? null)
    if (target) target.focus()
    else inputRef.current?.focus()
  }

  function toggle(key: string): void {
    if (state.disabledKeys.has(key)) return
    manager.toggleSelection(key)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const edge = event.key === 'ArrowDown' ? 'first' : 'last'
      if (!open) {
        openPopup(edge)
        return
      }
      const from = manager.focusedKey
      const next =
        from === null
          ? edge === 'first'
            ? delegate.getFirstKey()
            : delegate.getLastKey()
          : event.key === 'ArrowDown'
            ? delegate.getKeyBelow(from)
            : delegate.getKeyAbove(from)
      if (next !== null && next !== undefined) {
        manager.setFocused(true)
        manager.setFocusedKey(next)
      }
      return
    }
    if (event.key === 'Enter') {
      if (!open) return
      // Selecting does not close the popup, as with Menu's checkbox items, because
      // people usually pick several values in a row. Enter with no highlighted option
      // does nothing, because only listed values can be chosen. Under `allowCustom` the
      // mint row is in the list and is highlighted like any row, so Enter adds the
      // custom value through the same toggle.
      event.preventDefault()
      if (manager.focusedKey !== null) {
        toggle(String(manager.focusedKey))
        return
      }
      // Enter on text that cannot be added ("Refusal is answered"). The field offers
      // custom values, so it must respond. The flash shows where, and the announcement
      // says why.
      if (allowCustom && text.trim() !== '') {
        setRefused(true)
        setAnnouncement(
          normalized !== null && selected.has(normalized)
            ? say.alreadySelected(normalized)
            : say.refused(text.trim()),
        )
      }
      return
    }
    if (event.key === 'Escape') {
      // The APG order, as in Combobox: close first, then clear the filter text.
      if (open) {
        event.preventDefault()
        close()
        return
      }
      if (text !== '') {
        event.preventDefault()
        commitText('')
      }
      return
    }
    if (event.key === 'Backspace' && text === '') {
      const last = ordered(selected)[values.length - 1]
      if (last !== undefined) remove(last)
      return
    }
    if (event.key === 'ArrowLeft' && inputRef.current?.selectionStart === 0) {
      const last = ordered(selected)[values.length - 1]
      if (last !== undefined) removeRefs.current.get(last)?.focus()
    }
  }

  /** Chip navigation, as in TagInput: ←/→ between chips, and → past the last returns to the input. */
  function handleChipKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const current = ordered(selected)
    const entry = current[index]
    if (entry === undefined) return

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      remove(entry)
      return
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const step = event.key === 'ArrowLeft' ? -1 : 1
      const neighbour = current[index + step]
      if (neighbour === undefined) {
        if (step === 1) inputRef.current?.focus()
        return
      }
      removeRefs.current.get(neighbour)?.focus()
    }
  }

  /** Clicking the container focuses the input, except on parts that are controls themselves. */
  function handleMouseDown(event: MouseEvent<HTMLDivElement>): void {
    if ((event.target as HTMLElement).closest('button, input')) return
    event.preventDefault()
    inputRef.current?.focus()
  }

  /**
   * The container's blur, as in TagInput, but the portalled panel counts as inside. The
   * panel belongs to this control, so a press in it does not leave the field. Only leaving
   * both closes the popup and calls `onBlur`.
   */
  function handleBlur(event: FocusEvent<HTMLDivElement>): void {
    const landed = event.relatedTarget as globalThis.Node | null
    if (event.currentTarget.contains(landed)) return
    if (landed !== null && popoverRef.current?.contains(landed)) return
    close()
    onBlur?.(event)
  }

  function handleChevron(): void {
    if (disabled) return
    if (open) close()
    else openPopup()
    inputRef.current?.focus()
  }

  /**
   * Paging, as in Combobox. It fires once per `options` length and resets when the app
   * appends. So a list scrolled to the bottom, or a highlight on the last row, does not
   * request the same page again while it loads.
   */
  const loadMoreFiredAt = useRef(-1)
  function requestMore() {
    if (onLoadMore === undefined || loading) return
    if (loadMoreFiredAt.current === options.length) return
    loadMoreFiredAt.current = options.length
    onLoadMore()
  }
  function handleListScroll(event: UIEvent<HTMLUListElement>) {
    const list = event.currentTarget
    if (list.scrollHeight - list.scrollTop - list.clientHeight > LOAD_MORE_EDGE_PX) return
    requestMore()
  }

  /**
   * The highlight trigger, which is the primary one (the spec's a11y correction). When the
   * highlight reaches the last navigable row, the next page is requested. This is the only
   * way keyboard and assistive-tech users reach paging, because there is no scroll edge
   * when the page fits the panel and a virtual cursor may never scroll. The last row comes
   * from the delegate, not the collection, because the highlight can never land on a
   * trailing disabled row. The mint row is excluded, because highlighting it is not a
   * request for more options. There is no dependency list on purpose: the checks inside
   * are the dependency, and the ref makes a repeat run do nothing. The delegate is asked
   * inside the effect, not while rendering: it reads the list's elements to walk a row
   * up, and a render on a server has none.
   */
  useEffect(() => {
    if (!open || manager.focusedKey === null) return
    const walkLast = delegate.getLastKey()
    const lastRealKey =
      walkLast !== null && String(walkLast) === mint ? delegate.getKeyAbove(walkLast) : walkLast
    if (lastRealKey === null || lastRealKey === undefined) return
    if (manager.focusedKey !== lastRealKey) return
    requestMore()
  })

  const count = state.collection.size
  const showEmpty = open && !loading && count === 0
  const orderedValues = ordered(selected)

  /*
   * An agent sets the whole selection by ids, through the member's own value, so `onChange`
   * reports it in options order as it reports a person's toggle, controlled or not. At the maximum
   * an unchosen option is disabled, as a person sees it, and a set larger than the maximum is
   * refused. A chosen value no option carries (a minted one) is a choice labelled by itself, so a
   * set can keep it. The agent sets the filter text as the member's one writer does, which
   * `onInputChange` reports, and opens and closes the list. It mints no value.
   */
  useAgentMember({
    member: 'MultiSelect',
    element: () => inputRef.current,
    state: () => ({
      value: orderedValues,
      options: [
        ...options.map((option) => ({
          id: option.value,
          label: option.label,
          ...(option.disabled === true || (atMax && !selected.has(option.value))
            ? { disabled: true }
            : {}),
        })),
        ...orderedValues
          .filter((entry) => !labels.has(entry))
          .map((entry) => ({ id: entry, label: entry })),
      ],
      'input-value': text,
      open,
      disabled,
      invalid,
    }),
    actions: {
      choose: {
        argument: 'ids',
        run: (ids) => {
          const next = ordered(new Set(ids))
          if (max !== undefined && next.length > max) {
            throw new Error(`The field holds at most ${max} values.`)
          }
          if (
            next.length === orderedValues.length &&
            next.every((entry, at) => entry === orderedValues[at])
          )
            return
          commit(next)
        },
      },
      fill: {
        argument: 'text',
        run: (next) => {
          if (atMax) throw new Error('The field is full, so its text is read-only.')
          commitText(next)
        },
      },
      open: () => setOpen(true),
      close: () => close(),
    },
  })
  const focusedItem =
    open && manager.focusedKey !== null ? state.collection.getItem(manager.focusedKey) : null

  /**
   * The sheet breakpoint, resolved once (the spec's sheet cell, as in Combobox). Under
   * `'auto'` the popup moves into the shared sheet below `30rem`. `'popover'` keeps the
   * popper at every width. The field stays in the page and only the popup moves.
   */
  const phone = usePhoneViewport()
  const sheeting = presentation === 'auto' && phone

  /**
   * One live region for async status, in the field rather than the panel, as in Combobox.
   * Loading, the result count and the empty message are all announced here, so the
   * visible rows are `aria-hidden`.
   */
  const status = !open
    ? ''
    : loading
      ? say.loadingOptions
      : count === 0
        ? emptyMessage
        : say.options(count)

  /** One popup content for both containers, as in Combobox, so the rows work the same in each. */
  const popup = (
    <>
      <MultiSelectListBox
        state={state}
        listBoxRef={listBoxRef}
        listboxId={listboxId}
        label={ariaLabel}
        labelledBy={labelledBy}
        mintKey={mint}
        onScroll={onLoadMore === undefined ? undefined : handleListScroll}
      />

      {loading ? (
        <div className={styles.rows} aria-hidden="true">
          {SKELETON_ROWS.map((row) => (
            <div key={row} className={styles.row}>
              <Skeleton textStep="sm" />
            </div>
          ))}
        </div>
      ) : null}

      {showEmpty ? (
        <div className={styles.empty} aria-hidden="true">
          {emptyMessage}
        </div>
      ) : null}
    </>
  )

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <PopoverPrimitive.Anchor asChild>
        <div
          ref={fieldRef}
          className={styles.field}
          onMouseDown={handleMouseDown}
          onBlur={handleBlur}
          /*
           * The refusal flash ends here (as in TagInput). The chevron glyph also
           * animates, and its `animationend` bubbles up to this element too. So the
           * flash is cleared by animation name, not by any animation that finishes.
           */
          onAnimationEnd={(event) => {
            if (event.animationName.includes('refusal')) setRefused(false)
          }}
          {...dataAttrs({ size, disabled, invalid, state: open ? 'open' : 'closed' })}
          {...dataFlag('loading', loading)}
          // The refusal flash has its own flag (TagInput's rule). Putting a momentary
          // flash on a steady state attribute would mislead fixtures and laws that read it.
          {...dataFlag('refused', refused)}
          // A separate presence attribute next to `data-state`, on purpose. The field can
          // be open and full at once, and `data-state` already holds open or closed. Two
          // facts need two attributes (the spec's rule).
          {...dataFlag('at-max', atMax)}
          // The same reasoning. While the popup is a sheet, the field is half of a
          // portalled composite, and the CSS that raises it above the scrim reads this flag.
          {...dataFlag('sheeting', sheeting && open)}
          {...memberAttr('MultiSelect')}
        >
          <ul className={styles.chips}>
            <MotionPresence>
              {orderedValues.map((entry, index) => (
                <MotionSurface
                  key={entry}
                  as="li"
                  binding="taginput.chip"
                  layoutBinding="taginput.reflow"
                  className={styles.chip}
                  {...dataFlag('removing', removing === entry)}
                >
                  <span className={styles.label}>{labels.get(entry) ?? entry}</span>

                  {disabled ? null : (
                    <button
                      ref={(node) => {
                        removeRefs.current.set(entry, node)
                      }}
                      type="button"
                      className={styles.remove}
                      aria-label={say.remove(labels.get(entry) ?? entry)}
                      onClick={() => remove(entry)}
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
           * Always mounted, and read-only at the maximum, as in TagInput, because this
           * input is the field. It holds the id that FormField's label points at, the
           * description, the required flag and the invalid state. When full it still
           * handles Backspace, so keyboard users can remove a value.
           */}
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            role="combobox"
            value={text}
            onChange={(event) => {
              commitText(event.target.value)
              if (!open) setOpen(true)
            }}
            onKeyDown={handleKeyDown}
            placeholder={values.length === 0 ? placeholder : undefined}
            readOnly={atMax}
            disabled={disabled}
            id={inputId}
            autoComplete="off"
            spellCheck={false}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            aria-activedescendant={
              focusedItem === null ? undefined : `${listboxId}-opt-${focusedItem.index}`
            }
            aria-label={ariaLabel}
            aria-labelledby={labelledBy}
            aria-describedby={[describedBy, countId].filter(Boolean).join(' ')}
            aria-required={required}
            aria-invalid={invalid ? true : undefined}
          />

          {/* A real, clickable button, as in Combobox. It is out of the tab order
              because the input is the field's only tab stop. While loading, the
              spinning loading glyph replaces the chevron, like Button's spinner. */}
          <button
            type="button"
            tabIndex={-1}
            className={styles.chevron}
            aria-label={say.showOptions}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            disabled={disabled}
            onMouseDown={(event) => {
              event.preventDefault()
              handleChevron()
            }}
            onClick={(event) => {
              // Keyboard activation only, because the pointer already acted on mousedown.
              if (event.detail === 0) handleChevron()
            }}
          >
            {loading ? (
              <span className={styles.spinner}>
                <Icon name="loading" size={size} />
              </span>
            ) : (
              <Icon name="expand" size={size} />
            )}
          </button>

          {/* The count, and at the maximum the reason, in one element and one
              sentence, as in TagInput. `Maximum of {max} selected` comes from the
              prop the field enforces. */}
          <span className={styles.reader} id={countId}>
            {say.selected(values.length, max)}
          </span>

          {/* Removals are announced because screen-reader users cannot see them happen. */}
          <span className={styles.reader} aria-live="polite">
            {announcement}
          </span>

          <div role="status" aria-live="polite" className={styles.status}>
            {status}
          </div>

          {name === undefined ? null : (
            <input type="hidden" name={name} value={orderedValues.join(',')} disabled={disabled} />
          )}
        </div>
      </PopoverPrimitive.Anchor>

      {sheeting ? (
        /*
          The sheet (the spec's cell; the conventions' sheet presentation), without a
          focus scope. DOM focus stays in the input in the page, the listbox uses
          `aria-activedescendant`, and the scrim dismisses without trapping focus. So the
          focus boundary still holds in the sheet. Selecting still does not close the
          popup, which suits a sheet: several picks for one open. Escape is still the
          input's two-stage handler. `popoverRef` moves with the popup, so the container
          blur check treats the current surface as inside.
        */
        <SheetSurface containFocus={false} open={open} onDismiss={close}>
          <div
            ref={popoverRef}
            className={styles.sheetBody}
            data-size={size}
            {...memberAttr('MultiSelect')}
          >
            {popup}
          </div>
        </SheetSurface>
      ) : (
        <PopoverPrimitive.Portal>
          {/*
            Only positioning and dismissal, as in Combobox's panel. `role` is cleared
            because a listbox popup is not a dialog. Both auto-focus handlers are
            prevented because focus stays in the input. Escape is handled in the input,
            in the APG order. `onFocusOutside` is prevented for the reason Combobox
            records: virtual focus sends real focus events to options, so two open
            fields would close each other.

            `onPointerDownOutside` ignores presses on the field. The field is the other
            half of this control, and a press on it (the chevron toggle, a chip's
            remove) must not dismiss before the toggle runs. Radix Popover does the
            same for its own Trigger, and this field acts as that trigger.
          */}
          <PopoverPrimitive.Content
            ref={popoverRef}
            className={styles.content}
            data-size={size}
            role={undefined}
            side="bottom"
            align="start"
            sideOffset={2}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => event.preventDefault()}
            onFocusOutside={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => {
              if (fieldRef.current?.contains(event.target as globalThis.Node))
                event.preventDefault()
            }}
            {...memberAttr('MultiSelect')}
          >
            {popup}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      )}
    </PopoverPrimitive.Root>
  )
}

/**
 * The listbox, mounted with the panel, split out as in Combobox. `useListBox`'s mount
 * effects must run when the popup exists, not once while the field is closed.
 */
function MultiSelectListBox({
  state,
  listBoxRef,
  listboxId,
  label,
  labelledBy,
  mintKey,
  onScroll,
}: {
  state: ListState<MultiSelectOption>
  listBoxRef: RefObject<HTMLUListElement | null>
  listboxId: string
  label: string | undefined
  labelledBy: string | undefined
  mintKey: string | null
  onScroll?: (event: UIEvent<HTMLUListElement>) => void
}) {
  const { listBoxProps } = useListBox(
    {
      id: listboxId,
      shouldUseVirtualFocus: true,
      // Escape belongs to the input's two-stage handler, never to selection.
      escapeKeyBehavior: 'none',
      /*
       * Mouse selection happens on release, not on press. By default React Aria selects
       * a row on pointerdown and keeps DOM focus off it by cancelling the following
       * mousedown in the row's own handler. Selecting the mint row unmounts it (the text
       * clears and the row goes), so that mousedown arrives after the row is gone.
       * Chromium retargets it to the listbox, whose handler cancels it. WebKit delivers
       * it to the detached row, where nothing can cancel it, and its default action
       * clears focus: the input blurs to `<body>` mid-press. A document-level probe in
       * WebKit confirms that no mousedown reaches the document. On release the row still
       * exists to cancel the mousedown, and selection matches the click's timing. React
       * Aria documents this option for rows that disappear when selected.
       */
      shouldSelectOnPressUp: true,
      'aria-label': label,
      'aria-labelledby': labelledBy,
    },
    state,
    listBoxRef,
  )

  return (
    <ul {...listBoxProps} ref={listBoxRef} className={styles.listbox} onScroll={onScroll}>
      {[...state.collection].map((node) => (
        <MultiSelectItem
          key={node.key}
          node={node}
          state={state}
          listboxId={listboxId}
          mint={String(node.key) === mintKey}
        />
      ))}
    </ul>
  )
}

/**
 * One option row, as in Combobox, with the check column always present.
 * `data-highlighted` is the transient tint for both virtual focus and pointer hover.
 * `data-state="checked"` is the selection, and the check glyph shows it, so the two
 * cannot be confused.
 */
function MultiSelectItem({
  node,
  state,
  listboxId,
  mint,
}: {
  node: Node<MultiSelectOption>
  state: ListState<MultiSelectOption>
  listboxId: string
  mint: boolean
}) {
  const ref = useRef<HTMLLIElement>(null)
  const { optionProps, labelProps, descriptionProps, isSelected, isFocused, isDisabled } =
    useOption({ key: node.key }, state, ref)
  const option = node.value

  return (
    <li
      {...optionProps}
      // The member's own id, which the input's `aria-activedescendant` also uses. Both
      // sides derive it the same way, instead of relying on the library's private format.
      id={`${listboxId}-opt-${node.index}`}
      ref={ref}
      className={styles.option}
      data-state={isSelected ? 'checked' : 'unchecked'}
      data-highlighted={isFocused ? '' : undefined}
      data-disabled={isDisabled ? '' : undefined}
      data-mint={mint ? '' : undefined}
    >
      {/* Reserved whether or not this row is checked (Select's law). The mint row's
          `add` glyph stays muted, never the check's accent colour, because it is an
          offer and not a selection (the spec's mint cell). */}
      <span className={styles.check}>
        {mint ? (
          <Icon name="add" size="sm" />
        ) : isSelected ? (
          <Icon name="confirm" size="sm" />
        ) : null}
      </span>
      <span className={styles.text}>
        <span {...labelProps} className={styles.optionLabel}>
          {option?.label ?? node.textValue}
        </span>
        {option?.description === undefined ? null : (
          <span {...descriptionProps} className={styles.description}>
            {option.description}
          </span>
        )}
      </span>
    </li>
  )
}
