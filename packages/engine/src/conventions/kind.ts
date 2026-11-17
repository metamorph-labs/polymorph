/**
 * How FormField knows what kind of control it is wrapping.
 *
 * Checkbox and Switch carry their label inside the control, in the row that is
 * also the hit target. Input and Select are labelled from outside. FormField
 * must render one `<label>` or none, and it cannot tell which from the element
 * (`design/components/form-field.md`: "the field `label` becomes the row label;
 * FormField does not double-render it").
 *
 * The kind is a static property on the component, not a name check or an
 * instanceof. A renamed component keeps working, and a new control declares its
 * own kind instead of editing a list inside FormField.
 */

export type ControlKind =
  /** Labelled from outside by a `<label for>`: Input, Select. */
  | 'field'
  /** Carries its own label row: Checkbox, Switch. */
  | 'row-labelled'
  /**
   * Gets a field's column label, but is named by association: RadioGroup.
   *
   * `<label for>` binds only to a labelable element, and a `role="radiogroup"`
   * div is not one. The label would render but name nothing. The field points
   * at its label with `aria-labelledby` instead. The difference is invisible on
   * screen but decides whether assistive technology announces the group's name.
   */
  | 'group'

export interface ControlComponent {
  controlKind?: ControlKind
}

export function controlKindOf(type: unknown): ControlKind {
  if (typeof type === 'function' || (typeof type === 'object' && type !== null)) {
    const declared = (type as ControlComponent).controlKind
    if (declared !== undefined) return declared
  }
  return 'field'
}
