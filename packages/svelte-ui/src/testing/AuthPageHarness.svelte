<script lang="ts">
  /**
   * An AuthPage titled "Account" inside `PageTransitions`, with one plain text
   * field, for `archetypes/auth-page.test.ts`. `transitionKey` and `pending`
   * are passed to the AuthPage.
   */
  import { PageTransitions } from '@polymorph/svelte'

  import AuthPage from '../archetypes/AuthPage.svelte'

  let { transitionKey, pending }: { transitionKey: string; pending: boolean } = $props()
</script>

<PageTransitions>
  <AuthPage title="Account" {transitionKey} {pending}>
    <input aria-label="Draft" />
  </AuthPage>
</PageTransitions>
