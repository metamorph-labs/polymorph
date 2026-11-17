<script lang="ts">
  /**
   * A MasterDetailPage in a box `width` pixels wide and 480px high, for
   * `archetypes/master-detail-page.test.ts`, as
   * `@polymorph/conformance/master-detail` describes its mount. Its list holds
   * a button for each item, `aria-current="true"` on the one `current` names,
   * while `buttons` holds, and the items' names as text otherwise. While
   * `detail` holds, its detail is a heading over a button.
   */
  import { MASTER_DETAIL_ITEMS, type MasterDetailItem } from '@polymorph/conformance/master-detail'

  import MasterDetailPage from '../archetypes/MasterDetailPage.svelte'

  let {
    width,
    detail,
    current,
    buttons,
    onBack,
  }: {
    width: number
    detail: boolean
    current: MasterDetailItem | null
    buttons: boolean
    onBack: () => void
  } = $props()
</script>

{#snippet actions()}<button type="button">New ticket</button>{/snippet}
{#snippet list()}
  <ul>
    {#each MASTER_DETAIL_ITEMS as name (name)}
      <li>
        {#if buttons}
          <button type="button" aria-current={current === name ? 'true' : undefined}>{name}</button>
        {:else}
          {name}
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}
{#snippet shown()}<h2>Bravo</h2><button type="button">Reply</button>{/snippet}

<div style:inline-size="{width}px" style:block-size="480px">
  <MasterDetailPage
    title="Support"
    listLabel="Tickets"
    emptyState={{ title: 'No ticket selected' }}
    backLabel="All tickets"
    {onBack}
    {actions}
    {list}
    detail={detail ? shown : undefined}
  />
</div>
