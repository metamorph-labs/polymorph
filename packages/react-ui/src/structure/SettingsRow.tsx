import { Group, Row } from './settings-row-parts'
import type { SettingsRowProps } from './settings-row-parts'

/**
 * A settings row: label and description beside one control (`design/components/settings-row.md`).
 *
 * Label and description on the left, one control on the right, and rows ruled
 * within groups. The group title is the section heading settings screens would
 * otherwise each invent.
 *
 * No error state, on purpose: settings apply at once and report failure with a
 * toast. A screen that needs validation is a FormPage, because the two behave
 * differently on submit, and settings do not submit.
 *
 * `FormField` is *not* used inside: two labelling systems would announce the
 * control twice, so the row does the wiring itself.
 */

export type { SettingsGroupProps, SettingsRowProps } from './settings-row-parts'

/**
 * The member, in a module without `'use client'`, so a server component can
 * read `SettingsRow.Group` from it. A client module's export reaches a server component
 * as a reference with no properties, so a part attached there is `undefined`
 * on a server. The root and the parts are the client module's own exports
 * (`settings-row-parts.tsx`), and this function only renders the root.
 */
export function SettingsRow(props: SettingsRowProps) {
  return <Row {...props} />
}
SettingsRow.Group = Group
