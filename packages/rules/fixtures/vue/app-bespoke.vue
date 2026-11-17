<!--
  Rung 4. Inside a declared zone the vocabulary rules are suspended — the cost
  of the exception is that it is visible, bounded and inventoried, not that it
  is forbidden (the exception ladder, docs/rules.md).
-->
<script setup lang="ts">
import { animate } from 'motion'

import { Bespoke } from '@polymorph/vue-ui'
</script>

<template>
  <Bespoke reason="what's-new panel: one-off illustration for the launch">
    <div
      class="promo"
      :style="{ padding: '24px', background: '#4087de' }"
      @click="() => animate('.x', {})"
    >
      <svg viewBox="0 0 120 40" />
      <button>Read more</button>
      <Transition><span>New</span></Transition>
    </div>
  </Bespoke>
</template>
