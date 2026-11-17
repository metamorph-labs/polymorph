<script setup lang="ts">
import { Bespoke, Card, DensityScope, Stack, Text, ToneScope } from '@polymorph/vue-ui'

const help = 'eslint-disable-next-line polymorph/no-raw-interactive is not the way'
</script>

<template>
  <Stack gap="4">
    <DensityScope value="compact">
      <Text>Dense rows</Text>
    </DensityScope>
    <ToneScope value="inverse">
      <Text>{{ help }}</Text>
    </ToneScope>
    <Card :patch="{ radius: 'lg' }">
      <Text>Rounder card</Text>
    </Card>
    <Bespoke reason="The what's-new panel draws its own confetti">
      <!-- eslint-disable-next-line polymorph/no-raw-interactive -->
      <button type="button">Hooray</button>
    </Bespoke>
  </Stack>
</template>
