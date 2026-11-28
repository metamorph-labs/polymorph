import {
  listNameLaw,
  type ListNameLaw,
  type ListNameLawField,
  type ListNameLawProps,
} from './list-name'

/**
 * The law for the name of a MultiSelect's list (`design/components/multi-select.md`,
 * FormField integration), which every web shell's test calls with a mount of its
 * own: the field's own name, read as `list-name.ts` reads it. Each case also
 * reads the field's own name, which the list's equals.
 */

/** The props the law mounts a MultiSelect with. A prop the law leaves out is not passed. */
export type MultiSelectListLawProps = ListNameLawProps

/** The FormField the law puts a MultiSelect in. */
export type MultiSelectListLawField = ListNameLawField

export type MultiSelectListLaw = ListNameLaw

export function multiSelectListLaw(law: MultiSelectListLaw): void {
  listNameLaw(
    {
      member: 'MultiSelect',
      field: '[data-member="multi-select"] input:not([type="hidden"])',
      readsField: true,
      focusesList: false,
    },
    law,
  )
}
