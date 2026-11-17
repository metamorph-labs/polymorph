<script lang="ts">
  /**
   * A SearchPage titled "Search" whose landmark is named "Workspace", with an
   * Input named "Query" as its field, one paragraph of results and an empty
   * state titled "No results", for `archetypes/search-page.test.ts`. It is
   * given `onSubmit` only when the test passes one.
   */
  import Input from '../controls/Input.svelte'
  import SearchPage from '../archetypes/SearchPage.svelte'

  let {
    empty,
    pending,
    onSubmit,
  }: { empty: boolean; pending: boolean; onSubmit?: () => void } = $props()
</script>

<SearchPage
  title="Search"
  searchLabel="Workspace"
  emptyState={{ title: 'No results' }}
  {empty}
  {pending}
  {onSubmit}
>
  {#snippet search()}<Input aria-label="Query" />{/snippet}
  <p>Results</p>
</SearchPage>
