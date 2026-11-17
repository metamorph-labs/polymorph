<script lang="ts">
  /**
   * A FormField labelled "Subject" around an Input, with its error as a
   * toast, beside the toast viewport, for `overlays/toast.test.ts`. `error`
   * is passed to the FormField.
   */
  import FormField from '../controls/FormField.svelte'
  import Input from '../controls/Input.svelte'
  import ToastViewport from '../overlays/ToastViewport.svelte'

  let { error }: { error?: string } = $props()
</script>

<div>
  <FormField label="Subject" {error} errorPresentation="toast"><Input /></FormField>
  <ToastViewport />
</div>
