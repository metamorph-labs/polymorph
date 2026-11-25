<script lang="ts">
  /**
   * A text field inside an open Dialog titled "Edit", which stays open until it
   * reports `false`, for the Escape tests of `controls/tag-input.test.ts`,
   * `controls/multi-select.test.ts` and `controls/inline-edit.test.ts`.
   */
  import Dialog from '../overlays/Dialog.svelte'
  import InlineEdit from '../controls/InlineEdit.svelte'
  import MultiSelect, { type MultiSelectOption } from '../controls/MultiSelect.svelte'
  import TagInput from '../controls/TagInput.svelte'

  let {
    field,
    options = [],
    onOpenChange,
    onEditingChange,
  }: {
    field: 'tag-input' | 'multi-select' | 'inline-edit'
    options?: MultiSelectOption[]
    onOpenChange: (open: boolean) => void
    onEditingChange?: (editing: boolean) => void
  } = $props()

  let open = $state(true)
</script>

<Dialog
  title="Edit"
  {open}
  onOpenChange={(next: boolean) => {
    onOpenChange(next)
    open = next
  }}
>
  {#if field === 'tag-input'}
    <TagInput aria-label="Labels" />
  {:else if field === 'multi-select'}
    <MultiSelect {options} aria-label="Assignees" />
  {:else}
    <InlineEdit label="Project name" value="Acme" onCommit={() => {}} {onEditingChange} />
  {/if}
</Dialog>
