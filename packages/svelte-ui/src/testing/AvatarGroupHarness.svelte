<script lang="ts">
  /**
   * An Avatar group labelled "Assignees" with `max` 3, one Avatar per name in
   * `names`, keyed by the name, for `conventions/slotted.test.ts`.
   */
  import Avatar from '../structure/Avatar.svelte'
  import AvatarGroup from '../structure/AvatarGroup.svelte'

  let { names }: { names: string[] } = $props()
</script>

<AvatarGroup label="Assignees" max={3}>
  {#each names as name (name)}<Avatar {name} />{/each}
</AvatarGroup>
