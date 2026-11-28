/**
 * The labels that name a field, as one `aria-labelledby` value, for a part of
 * the field that takes the field's own name: MultiSelect's list, where neither
 * `aria-label` nor `aria-labelledby` names the field and a `<label for>` does,
 * as FormField's label does.
 *
 * The part refers to the labels rather than copying their words, so the
 * browser computes the name as it computes the field's: a part of the label
 * hidden from assistive software (FormField's required mark) is left out, and
 * a label whose words change is read with its new words.
 */

/**
 * The ids of the labels `field` has (`labels`: each `<label for>` that targets
 * it and a `<label>` around it), in document order, joined by spaces. A label
 * with no id is given `<prefix>-label-<n>`, because a reference names an
 * element by its id; a label with an id keeps it. `undefined` when nothing
 * labels the field.
 */
export function fieldLabelIds(
  field: HTMLElement | null | undefined,
  prefix: string,
): string | undefined {
  // A control a label can name has `labels`; any other element has none.
  const labels = (field as HTMLInputElement | null | undefined)?.labels
  if (labels === null || labels === undefined || labels.length === 0) return undefined
  return Array.from(labels)
    .map((label, at) => {
      if (label.id === '') label.id = `${prefix}-label-${at}`
      return label.id
    })
    .join(' ')
}
