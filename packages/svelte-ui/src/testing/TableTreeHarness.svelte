<script module lang="ts">
  /**
   * A Table composed from data, for `structure/table.test.ts`: `head` and
   * `body` are rows of header and data cells, each cell holding text or a
   * plain checkbox. A row with a `key` is keyed by it. With `width`, the table
   * sits in a box that wide. A props object that is `$state` (`live.svelte.ts`)
   * changes the table when the test sets one of its fields.
   */
  import type { TableCellProps } from '../structure/TableCell.svelte'
  import type { TableHeaderProps } from '../structure/TableHeader.svelte'
  import type { TableProps } from '../structure/Table.svelte'
  import type { TableRowProps } from '../structure/TableRow.svelte'

  /** A cell's content: its text, or a checkbox named by `checkbox`. */
  export type TableTreeContent = string | { checkbox: string }

  export type TableTreeCell =
    | { kind: 'header'; content: TableTreeContent; props: TableHeaderProps }
    | { kind: 'cell'; content: TableTreeContent; props: TableCellProps }

  export interface TableTreeRow {
    key?: string
    props: TableRowProps
    cells: TableTreeCell[]
  }

  export interface TableTreeProps {
    table?: TableProps
    width?: string
    head?: TableTreeRow[]
    body?: TableTreeRow[]
  }
</script>

<script lang="ts">
  import Table from '../structure/Table.svelte'
  import TableBody from '../structure/TableBody.svelte'
  import TableCell from '../structure/TableCell.svelte'
  import TableHead from '../structure/TableHead.svelte'
  import TableHeader from '../structure/TableHeader.svelte'
  import TableRow from '../structure/TableRow.svelte'

  let { table = {}, width, head, body }: TableTreeProps = $props()
</script>

{#snippet content(of: TableTreeContent)}{#if typeof of === 'string'}{of}{:else}<input
      type="checkbox"
      aria-label={of.checkbox}
    />{/if}{/snippet}

{#snippet rows(list: TableTreeRow[])}{#each list as row, at (row.key ?? at)}<TableRow
      {...row.props}
      >{#each row.cells as cell, column (column)}{#if cell.kind === 'header'}<TableHeader
            {...cell.props}>{@render content(cell.content)}</TableHeader
          >{:else}<TableCell {...cell.props}>{@render content(cell.content)}</TableCell
          >{/if}{/each}</TableRow
    >{/each}{/snippet}

{#snippet composed()}<Table {...table}
    >{#if head !== undefined}<TableHead>{@render rows(head)}</TableHead>{/if}{#if body !== undefined}<TableBody
        >{@render rows(body)}</TableBody
      >{/if}</Table
  >{/snippet}

{#if width === undefined}{@render composed()}{:else}<div style:inline-size={width}>
    {@render composed()}
  </div>{/if}
