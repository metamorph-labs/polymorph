<script lang="ts">
  import { Bespoke, Stack, Text, ToneScope } from '@polymorph/svelte-ui'

  // eslint-disable-next-line polymorph/no-raw-styles
  const tint = '#ff0000'
</script>

<Stack gap="4">
  <ToneScope value={'inverse'}>
    <Text>{tint}</Text>
  </ToneScope>
  <Bespoke reason="A signature drawn by hand" />
  <!-- eslint-disable-next-line polymorph/no-raw-interactive -->
  <button type="button">Sneaky</button>
</Stack>
