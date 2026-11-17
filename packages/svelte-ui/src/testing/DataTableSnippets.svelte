<script module lang="ts">
  /**
   * Snippets of members for a DataTable's column cells and slots, for
   * `structure/data-table.test.ts`. The component renders nothing; a test
   * imports the snippets. `openCell`, `detailOf` and `closableDetail` take
   * their row as `unknown`, because a `DataTable<unknown>` hands them one, and
   * read it through a cast. `replyDetail` is a detail that holds a field and a
   * button, for the keyboard's way into a detail.
   */
  import Button from '../controls/Button.svelte'
  import Pagination from '../structure/Pagination.svelte'

  export { archive, assignAndClose, closableDetail, detailOf, openCell, pageFour, replyDetail }
</script>

{#snippet openCell(row: unknown)}<Button
    size="sm"
    label={`Open ${(row as { subject: string }).subject}`}
  />{/snippet}

{#snippet detailOf({ row }: { row: unknown })}<p>
    Detail of {(row as { subject: string }).subject}
  </p>{/snippet}

{#snippet closableDetail({ row, close }: { row: unknown; close: () => void })}<p>
    Detail of {(row as { subject: string }).subject}
  </p>
  <button type="button" onclick={close}>Done with {(row as { subject: string }).subject}</button
  >{/snippet}

{#snippet replyDetail()}<input aria-label="Reply" /><button type="button">Send</button>{/snippet}

{#snippet archive()}<Button variant="ghost" tone="neutral" size="sm" label="Archive" />{/snippet}

{#snippet assignAndClose()}<Button size="sm" variant="ghost" tone="neutral" label="Assign" /><Button
    size="sm"
    variant="soft"
    tone="danger"
    label="Close"
  />{/snippet}

{#snippet pageFour()}<Pagination page={4} pageCount={9} onPageChange={() => {}} />{/snippet}
