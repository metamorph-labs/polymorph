'use client'

import { cloneElement, useId, type ReactElement, type ReactNode } from 'react'

import { controlKindOf, Icon, memberAttr, useSupplied } from '@polymorph/react'
import styles from '@polymorph/recipes/controls/form-field.module.css'
import { ToastNotice } from '../overlays/ToastNotice'

/**
 * Wraps a control with its label, help text and error (`design/components/form-field.md`).
 *
 * Its purpose is the wiring, not the layout. A screen never hand-writes `aria-describedby`, never
 * invents an id, and never decides how an error is shown. How validation errors are shown is a
 * system-wide behaviour, so it has exactly one implementation.
 *
 * The control is cloned rather than rendered from a config, so the field does not become a
 * second, competing API for every control it can hold.
 */

/** What FormField injects. Every governed control accepts this shape. */
export interface FormFieldControlProps {
  id?: string
  label?: string
  invalid?: boolean
  disabled?: boolean
  'aria-describedby'?: string
  'aria-labelledby'?: string
  'aria-required'?: boolean
}

export interface FormFieldProps {
  label: string
  /**
   * Content at the end of the label's row, as in the login block. By convention a Link, such as
   * "Forgot your password?" beside the Password label.
   *
   * It is a slot rather than a `link` prop, because the field does not need to know what the
   * content *is*. The field only defines that the row has two ends and the label is at the start.
   * A row-labelled control has no label row of its own, so it ignores this prop.
   */
  labelEnd?: ReactNode
  /** Help text. Replaced by `error` when there is one, so they never show together. */
  description?: string
  /** When non-empty, the field is invalid. */
  error?: string
  /** Application errors show in toasts. The generic primitive keeps its explicit inline mode. */
  errorPresentation?: 'inline' | 'toast'
  required?: boolean
  /** Exactly one governed control: Input, Select, Checkbox or Switch. */
  children: ReactElement<FormFieldControlProps>
  /** Base for the derived ids. Generated when omitted. */
  id?: string
}

export function FormField({
  label,
  labelEnd,
  description,
  error,
  errorPresentation = 'inline',
  required = false,
  children,
  id,
}: FormFieldProps) {
  const generated = useId()
  // The spec's scheme: the base *is* the control's id, and the two message ids derive from it. So
  // `<FormField id="priority">` makes the control reachable as `#priority`.
  const controlId = id ?? generated
  const descriptionId = `${controlId}-description`
  const errorId = `${controlId}-error`

  const invalid = error !== undefined && error !== ''
  const showDescription = description !== undefined && description !== '' && !invalid
  // Error first, and the description's id only while the description is rendered. Pointing
  // `aria-describedby` at a node that is not rendered is a dangling reference, and screen readers
  // announce nothing for it.
  const describedBy =
    [
      invalid && errorPresentation === 'inline' ? errorId : undefined,
      showDescription ? descriptionId : undefined,
    ]
      .filter((value) => value !== undefined)
      .join(' ') || undefined

  // A server component may have passed the control, and the control is read
  // below: its type for its kind, its props, and the clone (`useSupplied`).
  const supplied = useSupplied(children)
  const kind = controlKindOf(useSupplied(supplied.type))
  const rowLabelled = kind === 'row-labelled'
  // A group is column-labelled but cannot be targeted by `for`, so it is named by association
  // instead (see `ControlKind`).
  const group = kind === 'group'
  const labelId = `${controlId}-label`
  const disabled = supplied.props.disabled === true

  // Built by mutation rather than by spreading conditionals, because `cloneElement` lets an
  // `undefined` in the config *overwrite* the child's own prop. `invalid: undefined` would silently
  // clear `invalid` on a control that set it itself.
  const injected: FormFieldControlProps = {
    id: controlId,
    'aria-describedby': describedBy,
    'aria-required': required ? true : undefined,
  }
  if (group) injected['aria-labelledby'] = labelId
  if (invalid) injected.invalid = true
  // A Checkbox or Switch renders its label in its own row. A second label would give the control
  // two accessible names and show two rows.
  if (rowLabelled) injected.label = label

  // Every other prop the child was given (its `controlRef`, its `onSelect`, the IME pair) passes
  // through the clone unchanged. The field adds wiring and never overrides what the control was
  // given (form-field.test.tsx checks this).
  const control = cloneElement(supplied, injected)

  // Rendered once and placed in one of two positions, because only its *position* differs
  // (column-labelled above the control, row-labelled below it).
  const descriptionRow = showDescription ? (
    <p className={styles.description} id={descriptionId}>
      {description}
    </p>
  ) : null

  return (
    <div
      className={styles.field}
      // The layout depends on it. A column-labelled control fills the field, and a row-labelled
      // one is a row that must not be stretched.
      data-kind={kind}
      data-invalid={invalid ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      {...memberAttr('FormField')}
    >
      {/* The label row. The label is still the only `<label>` in it, and `labelEnd` sits at the
          other end. The wrapper always renders, so the field's spacing does not depend on whether
          the slot is filled. */}
      {rowLabelled ? null : (
        <div className={styles.labelRow}>
          <label
            className={styles.label}
            id={group ? labelId : undefined}
            htmlFor={group ? undefined : controlId}
          >
            {label}
            {required ? (
              <span className={styles.required} aria-hidden="true">
                {' *'}
              </span>
            ) : null}
          </label>

          {labelEnd === undefined ? null : <span className={styles.labelEnd}>{labelEnd}</span>}
        </div>
      )}

      {/* Column-labelled: label, help, control, so the help text explains the field the label
          just named. */}
      {rowLabelled ? null : descriptionRow}

      {control}

      {/* Row-labelled: control first, description below (form-field.md). There is no
          field-level label above a Checkbox or Switch, so a description above it would have
          nothing to attach to, and a settings row is read control first. The error stays below
          the control in both layouts, and still replaces the description rather than adding to
          it. */}
      {rowLabelled ? descriptionRow : null}

      {invalid && errorPresentation === 'toast' ? (
        // The message is text, so the toast carries it as its description.
        <ToastNotice title={label} description={error} eventKey={error} />
      ) : invalid ? (
        <p className={styles.error} id={errorId}>
          {/* Decorative, because the danger role and `aria-describedby` convey the state. The
              wrapper centres it on the message's first line (Alert's glyph convention). */}
          <span className={styles.glyph}>
            <Icon name="error" size="sm" />
          </span>
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Preserves field invalidity and routes its translated message to the host toast viewport. */
export function ToastFormField(props: Omit<FormFieldProps, 'errorPresentation'>) {
  return <FormField {...props} errorPresentation="toast" />
}
