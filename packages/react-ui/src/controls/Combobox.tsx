'use client'

import * as PopoverPrimitive from '@radix-ui/react-popover'
import { useEffect, useRef, type FocusEvent, type RefObject, type UIEvent } from 'react'
import { useButton, useComboBox, useFilter, useListBox, useOption } from 'react-aria'
import { Item, useComboBoxState, type ComboBoxState, type Node } from 'react-stately'

import {
  agentFill,
  type ControlSize,
  dataAttrs,
  dataFlag,
  Icon,
  memberAttr,
  useAgentMember,
} from '@polymorph/react'
import { SheetSurface, usePhoneViewport } from '../overlays/sheet'
import { Skeleton } from '../structure/Skeleton'
import styles from '@polymorph/recipes/controls/combobox.module.css'

/**
 * Filtered single choice (`design/components/combobox.md`).
 *
 * Two libraries each do one job, and the boundary between them defines the design (the focus
 * boundary in `design/components/README-substrates.md`). **React Aria owns the collection**:
 * input semantics, filtering, selection, the listbox's roles and the `aria-activedescendant` that
 * drives it. **Radix owns the overlay**, which here means positioning and dismissal only. A
 * combobox popup needs no focus scope, because DOM focus never leaves the input, so there is
 * nothing to trap. So the Radix panel has its `dialog` role removed and does not move focus on
 * open or close. A `useOverlay`/`useModal`/`usePopover` import in this file is a defect, not a
 * refactor.
 *
 * `options` is a flat data prop, like Select's and Menu's. A generating agent can produce data
 * without knowing a component structure, and every dropdown in the product is built the same way.
 */

export interface ComboboxOption {
  value: string
  label: string
  /** A second line under the label. The check column is unchanged. */
  description?: string
  disabled?: boolean
}

/**
 * `false` means **the app has already filtered**, as in the async case. The member must not
 * re-filter server results, because that makes a remote search appear to lose rows.
 */
export type ComboboxFilter = 'contains' | 'startsWith' | false

/**
 * The member's other strings, which callers localize by passing them. This extends the
 * `emptyMessage` approach (WCAG 3.1.2: announced text a product cannot translate is announced in
 * the wrong language). Partial: an omitted string keeps its English default.
 */
export interface ComboboxMessages {
  /** The chevron's accessible name. Default: `Show options`. */
  showOptions?: string
  /** The clear button's accessible name. Default: `Clear`. */
  clear?: string
  /** The async status while the list loads. Default: `Loading options…`. */
  loadingOptions?: string
  /** The async status naming the result count. Default: `{count} options`, `1 option` for one. */
  options?: (count: number) => string
  /**
   * The list's accessible name, followed by the field's label where `aria-labelledby` names the
   * field. Default: `Suggestions`, which React Aria says in the page's locale.
   */
  list?: string
}

/** Every default but `list`'s, which is React Aria's word in the page's locale. */
const MESSAGES = {
  showOptions: 'Show options',
  clear: 'Clear',
  loadingOptions: 'Loading options…',
  options: (count: number) => (count === 1 ? '1 option' : `${count} options`),
} satisfies Required<Omit<ComboboxMessages, 'list'>>

export interface ComboboxProps {
  /** The *current* list. In async use, the app supplies a new list for each query. */
  options: ComboboxOption[]
  /**
   * Selection only by default. Free text that matches nothing resolves to `null` on blur, and the
   * input restores the selected label. `allowsCustomValue` below is the explicit opt-in, not a
   * hidden mode of this pair.
   */
  value?: string | null
  defaultValue?: string | null
  onChange?: (value: string | null) => void
  /** The controlled input text, which async apps use to drive their queries. */
  inputValue?: string
  onInputChange?: (value: string) => void
  /**
   * Keeps free text. Blur keeps the draft instead of restoring the selected label. A commit that
   * matches nothing sets the *selection* to `null` and keeps the text, which the app reads through
   * the controlled `inputValue` pair (React Aria's semantics, passed through). `name` then
   * serializes the typed text whenever no option is selected.
   */
  allowsCustomValue?: boolean
  filter?: ComboboxFilter
  /** Async loading state: skeleton rows in the panel and a spinning glyph in the field. */
  loading?: boolean
  /**
   * Requests the next page. Fires when the highlight reaches the last row or the open listbox is
   * scrolled to its end, while `loading` is false, at most once per `options` length. The app
   * appends the next page and sets `loading`, and the skeleton rows appear below the existing
   * rows. The highlight trigger is the primary one (WCAG 2.1.1), because keyboard navigation
   * cannot reach a scroll edge when the page fits the panel.
   */
  onLoadMore?: () => void
  /** The member's strings. See `ComboboxMessages`. */
  messages?: ComboboxMessages
  /** Apps localize by passing it. An empty dropdown shows one line of text, not an illustration. */
  emptyMessage?: string
  /** Input's clear button. Clearing reports `onChange(null)`. */
  clearable?: boolean
  /**
   * For touched validation. Fires after the blur has been resolved: free text that matched nothing
   * is already `null`, and the input shows the selected label again. So a check on leave reads the
   * resolved value, never the abandoned draft.
   */
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void
  size?: ControlSize
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  /** Serializes the *selected value*, not the typed text. */
  name?: string
  id?: string
  /** Opens on mount, for galleries and tests. Screens let the user open it. */
  defaultOpen?: boolean
  /** Set by FormField. Set it directly only when there is no visible label. */
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
  /**
   * `'auto'` shows the popup as a sheet below `30rem` (the conventions' sheet presentation).
   * `'popover'` keeps the popover at every width. There is no always-sheet value, because the
   * closed union does not allow one (`docs/layout.md`).
   */
  presentation?: 'auto' | 'popover'
}

/** Three rows at option height, so the panel keeps its size and results do not jump. */
const SKELETON_ROWS = [0, 1, 2]

/** The "scrolled to its end" margin. It allows for a wheel's last notch, about one option row. */
const LOAD_MORE_EDGE_PX = 32

export function Combobox({
  options,
  value,
  defaultValue,
  onChange,
  inputValue,
  onInputChange,
  allowsCustomValue = false,
  filter = 'contains',
  loading = false,
  onLoadMore,
  messages,
  emptyMessage = 'No results',
  clearable = false,
  onBlur,
  size = 'md',
  placeholder,
  disabled = false,
  invalid = false,
  name,
  id,
  defaultOpen,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
  presentation = 'auto',
}: ComboboxProps) {
  /** The member's strings, each localizable by passing it (the spec's messages cell). */
  const say = { ...MESSAGES, ...messages }

  const inputRef = useRef<HTMLInputElement>(null)
  const listBoxRef = useRef<HTMLUListElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  /**
   * The sheet breakpoint, resolved once (combobox.md's sheet cell). Under `'auto'`, the popup moves
   * into the shared sheet below `30rem`. `'popover'` keeps the popover at every width. The field
   * does not move or change. Only the popup changes container, and the collection hooks are
   * unaffected.
   */
  const phone = usePhoneViewport()
  const sheeting = presentation === 'auto' && phone

  // Locale-aware (Intl rules). `useFilter` compares strings the way the user's language sorts them,
  // not by ASCII. `false` means the app filters, and the collection is left alone.
  const { contains, startsWith } = useFilter({ sensitivity: 'base' })
  const defaultFilter =
    filter === 'contains' ? contains : filter === 'startsWith' ? startsWith : undefined

  const shared = {
    disabledKeys: options
      .filter((option) => option.disabled === true)
      .map((option) => option.value),
    value,
    defaultValue,
    onChange: (next: string | number | null) => onChange?.(next === null ? null : String(next)),
    inputValue,
    onInputChange,
    allowsCustomValue,
    isDisabled: disabled,
    isInvalid: invalid,
    isRequired: required,
    placeholder,
    id,
    'aria-label': ariaLabel,
    'aria-labelledby': labelledBy,
    'aria-describedby': describedBy,
  }

  const state = useComboBoxState({
    ...shared,
    /*
     * `items` and `defaultItems` take the same list but behave differently. React Aria reads a
     * *controlled* `items` as "the app already filtered" and leaves the collection alone. That is
     * right for `filter={false}` and wrong for the other two, where the member owns the
     * predicate. Both keep the collection updated when `options` changes.
     */
    ...(filter === false ? { items: options } : { defaultItems: options }),
    // The panel stays open when it is empty, so the empty state is shown instead of the panel
    // disappearing.
    allowsEmptyCollection: true,
    ...(defaultFilter ? { defaultFilter } : {}),
    children: (option: ComboboxOption) => (
      <Item key={option.value} textValue={option.label}>
        {option.label}
      </Item>
    ),
  })

  /**
   * `defaultOpen` is this repo's prop, not React Aria's. The state has an imperative `open()` and
   * no initial-open prop. A ref guards it rather than an empty dependency list. The state object
   * is new on every render, so the effect re-runs, and the ref makes its body run once.
   *
   * It opens as `'input'` rather than `'manual'`. React Aria treats a *manual* open, such as a
   * chevron press, as "show everything" and ignores the query while it is open. That is right for
   * the button but wrong here, where an already-open field should show what a typed query leaves.
   */
  const openOnMount = useRef(defaultOpen === true)
  useEffect(() => {
    if (!openOnMount.current) return
    openOnMount.current = false
    state.open(null, 'input')
  }, [state])

  const { inputProps, listBoxProps, buttonProps } = useComboBox(
    { ...shared, inputRef, listBoxRef, popoverRef, buttonRef },
    state,
  )
  const { buttonProps: chevronProps } = useButton(buttonProps, buttonRef)

  const count = state.collection.size
  const showClear = clearable && state.inputValue !== '' && !disabled
  const showEmpty = state.isOpen && !loading && count === 0

  /**
   * One live region, in the field rather than in the panel, because a region that mounts with its
   * content already present announces no change. Loading, the result count and the empty message
   * are all announced here. So the visible empty row is `aria-hidden`, or it would be heard twice.
   */
  const announcement = !state.isOpen
    ? ''
    : loading
      ? say.loadingOptions
      : count === 0
        ? emptyMessage
        : say.options(count)

  function handleClear() {
    state.setValue(null)
    state.setInputValue('')
    inputRef.current?.focus()
  }

  /*
   * An agent chooses an option by its id, among every option the app passed and not only the
   * ones the typed text leaves, through React Aria's own value, so `onChange` reports it as it
   * reports a person's pick and the field shows the option's label. It types into the field
   * through `agentFill`, so `onInputChange` reports the text as it reports typing, and it clears
   * the choice and the text as the clear button does. Opening shows every option, as the
   * chevron does. Each option's id is its `value`.
   */
  const chosen = state.value === null ? null : String(state.value)
  useAgentMember({
    member: 'Combobox',
    element: () => inputRef.current,
    state: () => ({
      value: chosen,
      options: options.map((option) => ({
        id: option.value,
        label: option.label,
        ...(option.disabled === true ? { disabled: true } : {}),
      })),
      'input-value': state.inputValue,
      open: state.isOpen,
      disabled,
      invalid,
    }),
    actions: {
      choose: {
        argument: 'id',
        run: (choice) => {
          // As in React Aria, choosing the chosen option reports no change.
          if (choice !== chosen) state.setValue(choice)
        },
      },
      fill: { argument: 'text', run: (text) => agentFill(inputRef.current, text) },
      clear: () => {
        state.setValue(null)
        state.setInputValue('')
      },
      open: () => state.open(null, 'manual'),
      close: () => state.close(),
    },
  })

  /**
   * Paging fires once per `options` length and resets when the app appends. A wheel held at the
   * bottom, or a highlight resting on the last row, keeps triggering it. Firing on every event
   * would request the same page repeatedly until it arrived.
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
   * The highlight trigger, which is the primary one (the spec's accessibility correction). When
   * the highlight reaches the last reachable row, the next page is requested. This is how keyboard
   * and assistive technology users reach paging at all, because there is no scroll edge when the
   * page fits the panel, and a virtual cursor may never scroll. It uses the last *reachable* row
   * because the highlight can never land on a trailing disabled option. There is deliberately no
   * dependency list. The guard does that job, and the ref makes a re-run do nothing.
   */
  useEffect(() => {
    if (!state.isOpen) return
    const focused = state.selectionManager.focusedKey
    if (focused === null) return
    let walkLast: typeof focused | null = null
    for (const node of state.collection) {
      if (!state.selectionManager.isDisabled(node.key)) walkLast = node.key
    }
    if (walkLast === null || focused !== walkLast) return
    requestMore()
  })

  /**
   * One popup, two containers. The listbox and the async rows are the same JSX in both, because
   * only the anchoring differs. The semantics belong to the collection and move with it (the
   * spec's cell: "the collection hooks never notice").
   */
  const popup = (
    <>
      <ComboboxListBox
        options={
          say.list === undefined ? listBoxProps : { ...listBoxProps, 'aria-label': say.list }
        }
        state={state}
        listBoxRef={listBoxRef}
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
      open={state.isOpen}
      onOpenChange={(next) => {
        if (!next) state.close()
      }}
    >
      <PopoverPrimitive.Anchor asChild>
        <div
          className={styles.field}
          {...dataAttrs({ size, disabled, invalid, state: state.isOpen ? 'open' : 'closed' })}
          {...dataFlag('loading', loading)}
          // While the popup is a sheet, the field is one half of a composite whose other half is
          // portalled. This describes the pair, not the presentation, so it has its own flag (as
          // with at-max: two facts, two attributes). The sheet uses it to raise the field above
          // the scrim.
          {...dataFlag('sheeting', sheeting && state.isOpen)}
          {...memberAttr('Combobox')}
        >
          <input
            {...inputProps}
            ref={inputRef}
            className={styles.input}
            /*
             * React Aria's handler runs first. It resolves the blur: commit or restore, then close
             * the popup. The app gets the blur *after that finishes* (the spec's
             * touched-validation cell). The resolution is a state update, and React flushes a
             * discrete event's updates synchronously before the task ends. A microtask runs after
             * the task's synchronous work, so when the callback reads the field, the abandoned
             * draft has already been replaced by the restored value. React 19 does not pool
             * events, so holding one is safe.
             */
            onBlur={(event) => {
              inputProps.onBlur?.(event)
              if (onBlur) queueMicrotask(() => onBlur(event))
            }}
          />

          {name === undefined ? null : (
            <input
              type="hidden"
              name={name}
              // The selected value. Under `allowsCustomValue`, the typed text *is* the value
              // whenever no option is selected (the spec's serialization cell).
              value={
                state.value !== null
                  ? String(state.value)
                  : allowsCustomValue
                    ? state.inputValue
                    : ''
              }
              disabled={disabled || undefined}
            />
          )}

          {showClear ? (
            <button
              type="button"
              className={styles.clear}
              aria-label={say.clear}
              onClick={handleClear}
            >
              <Icon name="clear" size={size} />
            </button>
          ) : null}

          {/* A real, clickable, labelled button. The loading glyph replaces the chevron instead
              of appearing beside it, because one field should not show both. The chevron returns
              when the query does. The glyph spins with the ambient pattern, as in MultiSelect. */}
          <button
            {...chevronProps}
            ref={buttonRef}
            className={styles.chevron}
            aria-label={say.showOptions}
          >
            {loading ? (
              <span className={styles.spinner}>
                <Icon name="loading" size={size} />
              </span>
            ) : (
              <Icon name="expand" size={size} />
            )}
          </button>

          {/* `useComboBox` hides everything outside the field's input and the popup from
              assistive technology while the popup is open, and this region is beside the input.
              React Aria leaves an element marked `data-live-announcer` visible, so the loading
              and no-results messages are heard while the list is up, when they are said. */}
          <div
            role="status"
            aria-live="polite"
            data-live-announcer="true"
            className={styles.status}
          >
            {announcement}
          </div>
        </div>
      </PopoverPrimitive.Anchor>

      {sheeting ? (
        /*
          The sheet (combobox.md's cell, using the conventions' sheet presentation). The popup uses
          the shared bottom-sheet anatomy without a focus scope. The focus boundary still holds
          after re-anchoring. DOM focus never leaves the input in the page, the listbox is still
          driven by `aria-activedescendant`, and the scrim is only a dismiss target. It never
          blocks focus between the user and the field they are typing in. Escape stays with the
          input, per the APG order (close, then clear). A scrim press that blurs the input closes
          the popup through React Aria's `shouldCloseOnBlur` first, as an outside press does next
          to the popover. `popoverRef` moves with the popup, so React Aria's is-inside checks read
          the surface that is rendered.
        */
        <SheetSurface containFocus={false} open={state.isOpen} onDismiss={() => state.close()}>
          <div
            ref={popoverRef}
            className={styles.sheetBody}
            data-size={size}
            {...memberAttr('Combobox')}
          >
            {popup}
          </div>
        </SheetSurface>
      ) : (
        <PopoverPrimitive.Portal>
          {/*
            Positioning and dismissal only. `role` is cleared because a listbox popup is not a
            dialog. Auto-focus on open and close is prevented because focus is in the input and
            stays there. Escape belongs to React Aria, per the APG order (close, then clear).

            `onFocusOutside` is prevented for a less obvious reason, and it is the one place the
            two libraries conflict. React Aria drives the list with *virtual* focus, which it
            implements by dispatching real `focus` events on the option elements. So when an option
            is highlighted in one combobox, every other open combobox's dismissable layer sees
            focus leaving. Without this, two open comboboxes on a page close each other. DOM focus
            never leaves this input, so "focus went outside" is never a reason to close this popup.
            A pointer press outside, Escape, and blurring the input (React Aria's
            `shouldCloseOnBlur`) are.
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
            {...memberAttr('Combobox')}
          >
            {popup}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      )}
    </PopoverPrimitive.Root>
  )
}

/**
 * The listbox, as its own component so that it *mounts with the panel*.
 *
 * The split is functional, not stylistic. `useListBox` applies the combobox's focus strategy
 * ("open with the first option active") in a mount effect. Called unconditionally in the parent,
 * it would run that effect once while the field is still closed, and every later opening would
 * have no active descendant and no first highlight. Rendering it only when the popup exists makes
 * the keyboard model work. React Aria's own examples use this structure for the same reason.
 */
function ComboboxListBox({
  options,
  state,
  listBoxRef,
  onScroll,
}: {
  options: Parameters<typeof useListBox<ComboboxOption>>[0]
  state: ComboBoxState<ComboboxOption>
  listBoxRef: RefObject<HTMLUListElement | null>
  onScroll?: (event: UIEvent<HTMLUListElement>) => void
}) {
  const { listBoxProps } = useListBox(options, state, listBoxRef)

  return (
    <ul {...listBoxProps} ref={listBoxRef} className={styles.listbox} onScroll={onScroll}>
      {[...state.collection].map((node) => (
        <ComboboxItem key={node.key} node={node} state={state} />
      ))}
    </ul>
  )
}

/**
 * One option row.
 *
 * `data-highlighted` is React Aria's *virtual* focus: the position the arrow keys moved to without
 * moving the caret. It also marks pointer hover, as Radix uses one attribute for both. It drives
 * the temporary wash. `data-state="checked"` marks the selection.
 */
function ComboboxItem({
  node,
  state,
}: {
  node: Node<ComboboxOption>
  state: ComboBoxState<ComboboxOption>
}) {
  const ref = useRef<HTMLLIElement>(null)
  const { optionProps, labelProps, descriptionProps, isSelected, isFocused, isDisabled } =
    useOption({ key: node.key }, state, ref)
  const option = node.value

  return (
    <li
      {...optionProps}
      ref={ref}
      className={styles.option}
      data-state={isSelected ? 'checked' : 'unchecked'}
      data-highlighted={isFocused ? '' : undefined}
      data-disabled={isDisabled ? '' : undefined}
    >
      {/* Reserved whether or not this row is selected, so the label column does not shift when
          the selection changes (Select's law). */}
      <span className={styles.check}>{isSelected ? <Icon name="confirm" size="sm" /> : null}</span>
      <span className={styles.text}>
        <span {...labelProps} className={styles.label}>
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
