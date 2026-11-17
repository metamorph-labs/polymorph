import { Body, Cell, Foot, Head, Header, Row, TableRoot } from './table-parts'
import type { TableProps } from './table-parts'

/**
 * A styled native table, the main data display in ListPage (`design/components/table.md`).
 *
 * A composition API, not a data grid: `Table.Row` is a `<tr>` and `Table.Cell` a
 * `<td>`, so assistive tech sees a real table and callers keep their markup.
 * Sorting *logic*, selection and pagination belong to DataTable. This provides
 * the controls and the semantics.
 *
 * No zebra striping and no outer border: row borders set the rhythm at every
 * density, and the page decides what surface the table sits on.
 */

export type { CellProps, HeaderProps, RowProps, SortDirection, TableProps } from './table-parts'

/**
 * The member, in a module without `'use client'`, so a server component can
 * read its parts from it. A client module's export reaches a server component
 * as a reference with no properties, so a part attached there is `undefined`
 * on a server. The root and the parts are the client module's own exports
 * (`table-parts.tsx`), and this function only renders the root.
 */
export function Table(props: TableProps) {
  return <TableRoot {...props} />
}
Table.Head = Head
Table.Body = Body
Table.Foot = Foot
Table.Row = Row
Table.Header = Header
Table.Cell = Cell
