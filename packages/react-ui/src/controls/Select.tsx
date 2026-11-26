'use client'

import * as SelectPrimitive from '@radix-ui/react-select'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useListBox, useListBoxSection, useOption } from 'react-aria'
import {
  Item,
  Section,
  useListState,
  type Key,
  type ListState,
  type Node,
  type Selection,
} from 'react-stately'

import {
  type ControlSize,
  Icon,
  memberAttr,
  useAgentMember,
  useDirection,
  useDevWarning,
} from '@polymorph/react'
import { SheetSurface, usePhoneViewport } from '../overlays/sheet'
import styles from '@polymorph/recipes/controls/select.module.css'

/**
 * Single-value choice from a closed list (`design/components/select.md`).
 *
 * Radix supplies the listbox behaviour (typeahead, roving focus, Escape, focus return),
 * and this member supplies everything visible. The trigger deliberately looks like Input,
 * because a field is a field whether you type into it or pick from it. `select.test.tsx`
 * checks that the two compute the same values, rather than relying on two stylesheets
 * staying in sync.
 *
 * `options` is a flat list rather than children, on purpose. A closed list has nothing to
 * compose, and a data prop is something a generating agent can produce without knowing
 * component structure.
 */

export interface SelectOption {
  value: string
  label: string
  /** A second line under the label, as in Combobox. */
  description?: string
  disabled?: boolean
}

/**
 * A named group of options. Groups use Menu's label style, and the group's options are
 * announced under its label, so the visible label is also the announced one.
 */
export interface SelectOptionGroup {
  label: string
  options: SelectOption[]
}

/**
 * The empty choice's value inside Radix, used nowhere else (select.md).
 *
 * Radix reserves `''` for "nothing selected, show the placeholder", so a selectable "All
 * statuses" needs its own value, and no screen should ever see it. It is mapped to `null`
 * on the way out and back on the way in. It never reaches a data attribute, because Radix
 * keeps an item's value in context rather than in the DOM. The form value is written
 * below by this component instead of by Radix's hidden native select, which would submit
 * this string as is.
 */
const EMPTY_CHOICE = '__polymorph-empty-choice__'

export interface SelectProps {
  /** Flat, grouped, or mixed. `emptyOption` stays first and belongs to no group. */
  options: (SelectOption | SelectOptionGroup)[]
  size?: ControlSize
  /** Muted, and shown only until there is a value. Cannot be combined with `emptyOption`. */
  placeholder?: string
  /**
   * Labels a selectable empty choice, always rendered as the **first** item. Choosing it
   * reports `null`. The trigger then shows this label as a real value, because "All" is a
   * chosen state, not a missing value.
   */
  emptyOption?: string
  invalid?: boolean
  disabled?: boolean
  /**
   * The chosen option's value. Controlled when given. `null` is nothing chosen: the trigger
   * shows the placeholder, or the empty choice when `emptyOption` is set. A caller clears the
   * choice with `null`, because `undefined` is no value, which hands the choice back to the
   * member.
   */
  value?: string | null
  defaultValue?: string | null
  onChange?: (value: string | null) => void
  /** Opens on mount. For galleries and tests; screens let the user open it. */
  defaultOpen?: boolean
  name?: string
  id?: string
  /** Wired by FormField; set directly only when there is no visible label. */
  'aria-label'?: string
  /**
   * Names the field from a label elsewhere on the page, such as `SettingsRow`'s row label,
   * which is one label for a whole row rather than one per control.
   */
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
  /**
   * `'auto'` shows the panel as a sheet below `30rem` (the conventions' sheet
   * presentation, the usual phone pattern for choosing from a list). `'popover'` keeps the
   * popper at every width, for the rare pointer-first case that needs precision. There is
   * no always-sheet value, because a bottom sheet on a wide pointer screen is the wrong
   * pattern (`docs/layout.md`).
   */
  presentation?: 'auto' | 'popover'
}

/**
 * One option row, rendered the same inside and outside a group.
 *
 * `ItemText` holds only the label, because Radix copies its contents into the trigger's
 * value, and a description there would put the whole option into a one-line field. The
 * description sits next to it instead, as in Combobox: muted `text.xs` under the label,
 * the row growing to fit, and the check column unchanged.
 */
function renderOption(option: SelectOption) {
  return (
    <SelectPrimitive.Item
      key={option.value}
      value={option.value}
      disabled={option.disabled}
      className={styles.item}
    >
      <span className={styles.check}>
        <SelectPrimitive.ItemIndicator>
          <Icon name="confirm" size="sm" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <span className={styles.text}>
        <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
        {option.description === undefined ? null : (
          <span className={styles.description}>{option.description}</span>
        )}
      </span>
    </SelectPrimitive.Item>
  )
}

export function Select({
  options,
  size = 'md',
  placeholder,
  emptyOption,
  invalid = false,
  disabled = false,
  value,
  defaultValue,
  onChange,
  defaultOpen,
  name,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
  presentation = 'auto',
}: SelectProps) {
  // The direction of the place the member is in, which Radix would otherwise take to be
  // left-to-right.
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dir = useDirection(triggerRef)
  const offersEmpty = emptyOption !== undefined

  useDevWarning(
    offersEmpty && placeholder !== undefined,
    'Select: `placeholder` and `emptyOption` are mutually exclusive — a placeholder is the ' +
      'absence of a value and the empty choice is one. `emptyOption` wins; drop the placeholder.',
  )
  // Whether the caller has passed a value since the member mounted. React reads `undefined` as
  // "uncontrolled", so a caller that held a value and then passes `undefined` hands the choice
  // back to the member, which shows its own last pick: a form that resets to `undefined` keeps
  // showing the old choice. The warning names `null`, which clears it.
  const [held, setHeld] = useState(value !== undefined)
  if (value !== undefined && !held) setHeld(true)
  useDevWarning(
    held && value === undefined,
    'Select: `value` went from a value to `undefined`, which hands the choice back to the ' +
      'member, and it keeps showing its last pick. Pass `null` to clear the choice.',
  )

  // The empty choice is always the first item. Screens cannot reorder it, so every
  // filter bar behaves the same. It belongs to no group, because "All" applies to every
  // group at once.
  const items: (SelectOption | SelectOptionGroup)[] = offersEmpty
    ? [{ value: EMPTY_CHOICE, label: emptyOption }, ...options]
    : options

  // This component writes the form value, not Radix. Radix's hidden native select
  // submits the chosen item's value, which for the empty choice is the sentinel, and
  // the spec says `name` submits the empty string. So the uncontrolled selection is
  // mirrored here. The sheet version relies on this mirror entirely, because it has no
  // Radix root to hold a selection.
  const [chosen, setChosen] = useState<string | null>(defaultValue ?? null)
  const selected = value === undefined ? chosen : value
  const submitted = selected ?? ''

  // Radix is always controlled by the member's value: by `value` when the caller gives it, and
  // by the mirror when not. So one setter changes the value in both forms, for a person's pick
  // and for an agent's `choose`, and crossing the `30rem` breakpoint, which remounts the other
  // version, keeps the current selection. `null`, controlled or not, is nothing chosen. With
  // `emptyOption` set it is the empty choice, because a filter that opens with a blank trigger is
  // the bug the empty choice prevents; without it, it is Radix's `''`, so the placeholder shows.
  const radixValue = selected === null ? (offersEmpty ? EMPTY_CHOICE : '') : selected

  /**
   * Open state is always mirrored here, as in ContextMenu. The root is always controlled,
   * so crossing the `30rem` breakpoint while open moves the panel to the other version
   * instead of losing it.
   */
  const [open, setOpen] = useState(defaultOpen ?? false)

  /**
   * The sheet breakpoint, resolved once. Under `'auto'` the panel is a sheet below
   * `30rem`. `'popover'` keeps the popper at every width (select.md's presentation row).
   */
  const phone = usePhoneViewport()
  const sheeting = presentation === 'auto' && phone

  const generatedId = useId()
  const listboxId = `${generatedId}-listbox`

  /**
   * Focus returns to the trigger whenever the sheet closes (Escape, the scrim, or a
   * selection), as Radix does for the popper. Only this member restores focus (sheet.tsx
   * does not). It restores in an effect rather than at dismiss time, because the sheet's
   * focus containment stays active until the state change commits, and a synchronous
   * `focus()` would be pulled back into the closing panel. It is off while the popper is
   * open, where Radix restores focus itself.
   */
  const restoreToTrigger = useRef(false)
  useEffect(() => {
    if (open) {
      restoreToTrigger.current = sheeting
      return
    }
    if (!restoreToTrigger.current) return
    restoreToTrigger.current = false
    triggerRef.current?.focus()
  }, [open, sheeting])

  function commit(reported: string | null) {
    setChosen(reported)
    onChange?.(reported)
  }

  function handleValueChange(next: string) {
    commit(next === EMPTY_CHOICE ? null : next)
  }

  // An agent chooses an option by its id without opening the list, through the member's own
  // value, so `onChange` reports it as it reports a person's pick. Each option's id is its
  // `value`, and the empty choice's is `''`, which `onChange` reports as `null`.
  const flat = items.flatMap((entry) => ('options' in entry ? entry.options : [entry]))
  useAgentMember({
    member: 'Select',
    element: () => triggerRef.current,
    state: () => ({
      value: selected === null ? (offersEmpty ? '' : null) : selected,
      options: flat.map((option) => ({
        id: option.value === EMPTY_CHOICE ? '' : option.value,
        label: option.label,
        ...(option.disabled === true ? { disabled: true } : {}),
      })),
      open,
      disabled,
    }),
    actions: {
      choose: {
        argument: 'id',
        run: (choice) => {
          const next = choice === '' ? null : choice
          // As in Radix, choosing the current value reports no change.
          if (next !== selected) commit(next)
        },
      },
      open: () => setOpen(true),
      close: () => setOpen(false),
    },
  })

  const hiddenInput =
    name === undefined ? null : (
      <input type="hidden" name={name} value={submitted} disabled={disabled || undefined} />
    )

  if (sheeting) {
    // The trigger shows a real value whenever an item is selected, including the empty
    // choice, because "All" is a chosen state, not a missing value. `data-placeholder`
    // follows Radix's rule exactly: present while Radix's value would be `''`, which never
    // happens when an empty choice is offered.
    const shownOption = flat.find((option) => option.value === radixValue)
    const placeholderShown = radixValue === ''

    // Closing only sets state. The effect above restores focus after the containment
    // is released.
    function dismissSheet() {
      setOpen(false)
    }

    return (
      <>
        {/*
          The Radix trigger cannot work without its root, so the sheet version renders
          an equivalent trigger itself: Input's recipe by class, and Radix's attributes
          set by hand (role="combobox", aria-autocomplete="none", and the data attributes
          the selectors use), plus the keys that open it (arrows; Enter and Space are the
          button's own click). The only Radix behaviour missing is typeahead on the
          closed trigger. It selects from Radix's mounted item collection, which the
          sheet version does not have. This is a known gap and is not worked around.
        */}
        <button
          type="button"
          ref={triggerRef}
          id={id}
          className={styles.trigger}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-autocomplete="none"
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-required={required}
          aria-invalid={invalid ? true : undefined}
          disabled={disabled}
          data-size={size}
          data-invalid={invalid ? '' : undefined}
          data-disabled={disabled ? '' : undefined}
          data-state={open ? 'open' : 'closed'}
          data-placeholder={placeholderShown ? '' : undefined}
          onClick={() => setOpen(!open)}
          onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
            event.preventDefault()
            setOpen(true)
          }}
          {...memberAttr('Select')}
        >
          <span className={styles.value}>
            {shownOption?.label ?? (placeholderShown ? placeholder : '')}
          </span>
          <span className={styles.chevron} aria-hidden="true">
            <Icon name="expand" size={size} />
          </span>
        </button>

        {hiddenInput}

        <SheetSurface open={open} onDismiss={dismissSheet}>
          <SelectSheetList
            items={items}
            selected={selected}
            offersEmpty={offersEmpty}
            size={size}
            id={listboxId}
            label={ariaLabel}
            labelledBy={labelledBy}
            onPick={(reported) => {
              // As in Radix, choosing the current value closes without reporting a
              // change.
              if (reported !== selected) commit(reported)
              dismissSheet()
            }}
          />
        </SheetSurface>
      </>
    )
  }

  return (
    <SelectPrimitive.Root
      dir={dir}
      value={radixValue}
      onValueChange={handleValueChange}
      disabled={disabled}
      open={open}
      onOpenChange={setOpen}
    >
      <SelectPrimitive.Trigger
        ref={triggerRef}
        id={id}
        className={styles.trigger}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-required={required}
        aria-invalid={invalid ? true : undefined}
        // Written out rather than spread from `dataAttrs`. A spread includes its
        // `undefined` keys, and they would come after Radix's own `data-state` and
        // `data-disabled` and erase them.
        data-size={size}
        data-invalid={invalid ? '' : undefined}
        {...memberAttr('Select')}
      >
        <span className={styles.value}>
          {/* `emptyOption` takes priority over `placeholder`. With the empty choice
              selected, the trigger shows a real value in `--pm-text-primary` without
              `data-placeholder`, because Radix treats a value as missing only when it
              is `''` or absent. */}
          <SelectPrimitive.Value placeholder={offersEmpty ? undefined : placeholder} />
        </span>
        <SelectPrimitive.Icon className={styles.chevron}>
          <Icon name="expand" size={size} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      {hiddenInput}

      <SelectPrimitive.Portal>
        {/* Positioning is a rule, not a preference (select.md). `popper` because the
            anchored scale-fade origin reads Radix's side/align data, which only
            popper provides. Item-aligned is never used. `sideOffset: 2` is a fixed
            hairline gap, deliberately not a density-scaled token. It keeps the panel's
            border from merging with the trigger's into one double-thickness line. */}
        <SelectPrimitive.Content
          className={styles.content}
          position="popper"
          side="bottom"
          align="start"
          sideOffset={2}
          data-size={size}
          {...memberAttr('Select')}
        >
          <SelectPrimitive.Viewport className={styles.viewport}>
            {items.map((entry) =>
              'options' in entry ? (
                // Radix Group/Label: screen readers announce the group's options under
                // its label, so the visible label is the announced one. Groups have no
                // id, so the label is the only available key.
                <SelectPrimitive.Group key={`group-${entry.label}`} className={styles.group}>
                  <SelectPrimitive.Label className={styles.groupLabel}>
                    {entry.label}
                  </SelectPrimitive.Label>
                  {entry.options.map(renderOption)}
                </SelectPrimitive.Group>
              ) : (
                renderOption(entry)
              ),
            )}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

/**
 * The listbox in the sheet (select.md's sheet cell; the conventions' sheet
 * presentation).
 *
 * Radix select ties its listbox semantics to its popper, so the sheet uses react-aria
 * instead. This is the composed listbox that Command already uses, with real roving
 * focus as in `sheet-menu.tsx`. `useListState` holds the collection, `useListBox`
 * implements the pattern (typeahead, arrows, Home/End, `aria-selected`), and every row
 * uses this member's popper classes so the recipes cannot drift apart.
 *
 * Two details:
 *
 *  - **The empty choice's collection key is generated per instance (`useId`), never
 *    the module's Radix sentinel.** react-aria writes each row's key into `data-key`
 *    to find its element, and select.md forbids the private value from reaching any
 *    DOM data attribute. An instance id is internal and exists for one mount only, so
 *    no screen can depend on it.
 *  - **Escape belongs to the sheet.** `escapeKeyBehavior: 'none'`, because the
 *    substrate's Escape clears the selection, and the popper version never loses its
 *    value on Escape. The key bubbles to the panel, which closes.
 *
 * It is mounted inside the presence boundary, so the collection is created and
 * destroyed with the sheet. A reopened panel starts from rest, as remounted Radix
 * content does. The selection is held by the member outside, so it is kept.
 */
function SelectSheetList({
  items,
  selected,
  offersEmpty,
  size,
  id,
  label,
  labelledBy,
  onPick,
}: {
  items: (SelectOption | SelectOptionGroup)[]
  selected: string | null
  offersEmpty: boolean
  size: ControlSize
  id: string
  label: string | undefined
  labelledBy: string | undefined
  onPick: (reported: string | null) => void
}) {
  const listRef = useRef<HTMLUListElement>(null)
  const emptyKey = useId()

  const keyFor = (optionValue: string): string =>
    optionValue === EMPTY_CHOICE ? emptyKey : optionValue

  const flat = items.flatMap((entry) => ('options' in entry ? entry.options : [entry]))

  const state = useListState<SelectOption>({
    selectionMode: 'single',
    // As in Radix, choosing the current value commits it again, and nothing deselects.
    disallowEmptySelection: true,
    selectedKeys: selected === null ? (offersEmpty ? [emptyKey] : []) : [selected],
    disabledKeys: flat
      .filter((option) => option.disabled === true)
      .map((option) => keyFor(option.value)),
    onSelectionChange: (keys: Selection) => {
      // 'all' cannot happen in single mode, so a Set always arrives.
      const key: Key | undefined = keys === 'all' ? undefined : [...keys][0]
      if (key === undefined) return
      onPick(String(key) === emptyKey ? null : String(key))
    },
    children: items.map((entry) =>
      'options' in entry ? (
        // The react-aria equivalent of Radix Group/Label. The section's options are
        // announced under its heading, so the visible label is the announced one.
        <Section key={`group-${entry.label}`} title={entry.label}>
          {entry.options.map((option) => (
            <Item key={option.value} textValue={option.label}>
              {option.label}
            </Item>
          ))}
        </Section>
      ) : (
        <Item key={keyFor(entry.value)} textValue={entry.label}>
          {entry.label}
        </Item>
      ),
    ),
  })

  const { listBoxProps } = useListBox<SelectOption>(
    {
      id,
      // Matches how Radix opens: the selected item gets focus first, and 'first' is
      // the fallback when nothing is selected.
      autoFocus: 'first',
      // In the popper, hover and keyboard position share one attribute (Radix's
      // `data-highlighted`). Here, real focus follows the pointer to get the same
      // result with react-aria.
      shouldFocusOnHover: true,
      escapeKeyBehavior: 'none',
      ...(label === undefined ? {} : { 'aria-label': label }),
      ...(labelledBy === undefined ? {} : { 'aria-labelledby': labelledBy }),
    },
    state,
    listRef,
  )

  const byValue = new Map(flat.map((option) => [keyFor(option.value), option]))

  return (
    <ul
      {...listBoxProps}
      ref={listRef}
      className={styles.sheetList}
      data-size={size}
      {...memberAttr('Select')}
    >
      {[...state.collection].map((node) =>
        node.type === 'section' ? (
          <SelectSheetGroup key={node.key} node={node} state={state} byValue={byValue} />
        ) : (
          <SelectSheetOption key={node.key} node={node} state={state} byValue={byValue} />
        ),
      )}
    </ul>
  )
}

/**
 * Menu's label style under `role="group"`, structured like Command's sections, with this
 * member's classes.
 */
function SelectSheetGroup({
  node,
  state,
  byValue,
}: {
  node: Node<SelectOption>
  state: ListState<SelectOption>
  byValue: Map<string, SelectOption>
}) {
  const { itemProps, headingProps, groupProps } = useListBoxSection({
    heading: node.rendered,
    'aria-label': node['aria-label'],
  })

  return (
    <li {...itemProps} className={styles.group}>
      <span {...headingProps} className={styles.groupLabel}>
        {node.rendered}
      </span>
      <ul {...groupProps} className={styles.group}>
        {[...(state.collection.getChildren?.(node.key) ?? [])].map((child) => (
          <SelectSheetOption key={child.key} node={child} state={state} byValue={byValue} />
        ))}
      </ul>
    </li>
  )
}

/**
 * One option row with the popper item's styles, built on react-aria.
 * `data-highlighted` covers both focus and hover (Radix's model), and
 * `data-state="checked"` is the selection. The check column is reserved on every row,
 * so labels do not shift as the selection moves.
 */
function SelectSheetOption({
  node,
  state,
  byValue,
}: {
  node: Node<SelectOption>
  state: ListState<SelectOption>
  byValue: Map<string, SelectOption>
}) {
  const ref = useRef<HTMLLIElement>(null)
  const { optionProps, labelProps, descriptionProps, isSelected, isFocused, isDisabled } =
    useOption({ key: node.key }, state, ref)
  const option = byValue.get(String(node.key))

  return (
    <li
      {...optionProps}
      ref={ref}
      className={styles.item}
      data-state={isSelected ? 'checked' : 'unchecked'}
      data-highlighted={isFocused ? '' : undefined}
      data-disabled={isDisabled ? '' : undefined}
    >
      <span className={styles.check}>{isSelected ? <Icon name="confirm" size="sm" /> : null}</span>
      <span className={styles.text}>
        <span {...labelProps}>{option?.label ?? node.textValue}</span>
        {option?.description === undefined ? null : (
          <span {...descriptionProps} className={styles.description}>
            {option.description}
          </span>
        )}
      </span>
    </li>
  )
}
