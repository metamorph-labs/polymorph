<script lang="ts">
  /**
   * Counts each time it is made, under `name` in `made` (`setups.ts`), for a
   * test that checks how many times a slot's content is made. It renders its
   * name.
   */
  import { made } from './setups'

  let { name }: { name: string } = $props()

  // svelte-ignore state_referenced_locally
  made.set(name, (made.get(name) ?? 0) + 1)
</script>

<span>{name}</span>
