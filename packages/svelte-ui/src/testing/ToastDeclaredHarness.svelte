<script lang="ts">
  /**
   * A declared Toast titled "Export ready", shown while `shown` holds, whose
   * content is one paragraph, beside the toast viewport, for
   * `overlays/toast.test.ts`. With `onDismiss`, a declared Toast titled "Saved"
   * stands before it, and each reports its dismissal to the matching callback.
   */
  import Toast from '../overlays/Toast.svelte'
  import ToastViewport from '../overlays/ToastViewport.svelte'

  let {
    shown,
    onDismiss,
    onSavedDismiss,
  }: { shown: boolean; onDismiss?: () => void; onSavedDismiss?: () => void } = $props()
</script>

{#if onSavedDismiss}
  <Toast title="Saved" durationMs={Number.POSITIVE_INFINITY} onDismiss={onSavedDismiss} />
{/if}
{#if shown}
  <Toast title="Export ready" durationMs={Number.POSITIVE_INFINITY} {onDismiss}>
    {#snippet content()}<p>Three files.</p>{/snippet}
  </Toast>
{/if}
<ToastViewport />
