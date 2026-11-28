import {
  listNameLaw,
  type ListNameLaw,
  type ListNameLawField,
  type ListNameLawProps,
} from './list-name'

/**
 * The law for the name of a Select's list (`design/components/select.md`,
 * A11y), which every web shell's test calls with a mount of
 * its own: the field's own name, read as `list-name.ts` reads it. The field is
 * the trigger, a button a `<label for>` names. Its own name is not read while
 * the list is open: React's list hides the page outside it, through Radix,
 * the label with it.
 */

/** The props the law mounts a Select with. A prop the law leaves out is not passed. */
export type SelectListLawProps = ListNameLawProps

/** The FormField the law puts a Select in. */
export type SelectListLawField = ListNameLawField

export type SelectListLaw = ListNameLaw

export function selectListLaw(law: SelectListLaw): void {
  listNameLaw(
    {
      member: 'Select',
      field: 'button[data-member="select"]',
      readsField: false,
      focusesList: true,
    },
    law,
  )
}
