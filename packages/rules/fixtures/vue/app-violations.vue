<!-- Every ESLint red rule, violated once, in a single-file component. See ../README.md: this file is data. -->
<script setup lang="ts">
import { scaleLinear } from 'd3-scale'
import { motion } from 'motion-v'
import { Trash2 } from 'lucide-vue-next'

import { Button, Hero, PageHeader } from '@polymorph/vue-ui'

import './Inbox.module.css'

const BRAND = '#4087de'
const TOPBAR = 'var(--pm-shell-topbar-height)'
</script>

<template>
  <div :style="{ padding: '24px', color: BRAND }">
    <!-- Two openers, so two h1s — the pair rule, broken the way a screen breaks it. -->
    <Hero title="Inbox" lede="Everything waiting on you" />
    <PageHeader title="Inbox" />
    <Button class="mt-4" label="Send" />
    <button @click="() => undefined">Archive</button>
    <div @click="() => undefined">Open</div>
    <input value="" />
    <svg viewBox="0 0 16 16" />
    <Trash2 />
    <motion.div />
    <span>{{ String(scaleLinear) }}</span>
    <span>{{ TOPBAR }}</span>
  </div>
</template>

<style scoped>
.inbox {
  gap: 12px;
}
</style>
