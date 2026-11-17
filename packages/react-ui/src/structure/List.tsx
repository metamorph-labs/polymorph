import { ListItem, ListRoot } from './list-parts'
import type { ListProps } from './list-parts'

/**
 * A column of items of one kind, each read, followed or picked
 * (`design/components/list.md`).
 *
 * It is not Table. A table compares the same fields down its columns, and a
 * list item is read as one thing, so a List is also the form a table's rows
 * take where there is no width for columns. From the spec:
 *
 *  - **One element takes the row's press.** The title is the link or the
 *    button, stretched over the row, so an item is one tab stop with one name.
 *  - **A trailing control stays reachable.** It is drawn above the stretched
 *    target and takes its own press.
 *  - **A List picks one item at most.** A set of picked rows is DataTable's
 *    selection.
 */

export type { ListItemProps, ListProps } from './list-parts'

/**
 * The member, in a module without `'use client'`, so a server component can
 * read `List.Item` from it. A client module's export reaches a
 * server component as a reference with no properties, so a part attached there
 * is `undefined` on a server. The root and the parts are the client module's
 * own exports (`list-parts.tsx`), and this function only renders the root.
 */
export function List(props: ListProps) {
  return <ListRoot {...props} />
}
List.Item = ListItem
