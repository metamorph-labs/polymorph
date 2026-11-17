<script lang="ts">
  /**
   * PageHeader, DetailPage or Dashboard with `title`, one action and, with
   * `edit`, an InlineEdit of the title in `titleEdit`, for the page-title law
   * (`structure/page-header.test.ts`). The props are the law's, so a test that
   * sets one sees the page follow it.
   */
  import type { PageTitleMember } from '@polymorph/conformance/page-title'

  import Dashboard from '../archetypes/Dashboard.svelte'
  import DetailPage from '../archetypes/DetailPage.svelte'
  import Button from '../controls/Button.svelte'
  import InlineEdit from '../controls/InlineEdit.svelte'
  import PageHeader from '../structure/PageHeader.svelte'

  let {
    member,
    edit,
    title,
    editing,
    pending,
    error,
    onCommit,
    onEditingChange,
  }: {
    member: PageTitleMember
    edit: boolean
    title: string
    editing: boolean
    pending: boolean
    error: string | undefined
    onCommit: (value: string) => void
    onEditingChange: (editing: boolean) => void
  } = $props()
</script>

{#snippet actions()}<Button variant="outline" tone="neutral" label="Export" />{/snippet}
{#snippet titleEdit()}
  <InlineEdit
    label="Project name"
    value={title}
    size="lg"
    {editing}
    {pending}
    {error}
    {onCommit}
    {onEditingChange}
  />
{/snippet}

{#if member === 'DetailPage'}
  <DetailPage
    backLabel="Back"
    onBack={() => {}}
    {title}
    titleEdit={edit ? titleEdit : undefined}
    {actions}
  >
    <p>The page’s body.</p>
  </DetailPage>
{:else if member === 'Dashboard'}
  <Dashboard {title} titleEdit={edit ? titleEdit : undefined} {actions}>
    {#snippet primary()}<p>The page’s body.</p>{/snippet}
  </Dashboard>
{:else}
  <PageHeader {title} titleEdit={edit ? titleEdit : undefined} {actions} />
{/if}
