<!-- Every ESLint red rule, violated once, in a Svelte component. See ../README.md: this file is data. -->
<script lang="ts">
  import { scaleLinear } from 'd3-scale'
  import { fade } from 'svelte/transition'
  import { Trash2 } from 'lucide-svelte'

  import { Button, Hero, PageHeader } from '@polymorph/svelte-ui'

  import './Inbox.module.css'

  const BRAND = '#4087de'
  const TOPBAR = 'var(--pm-shell-topbar-height)'
</script>

<div style="padding: 24px; color: {BRAND}">
  <!-- Two openers, so two h1s — the pair rule, broken the way a screen breaks it. -->
  <Hero title="Inbox" lede="Everything waiting on you" />
  <PageHeader title="Inbox" />
  <Button class="mt-4" label="Send" />
  <button onclick={() => undefined}>Archive</button>
  <div onclick={() => undefined}>Open</div>
  <input value="" />
  <svg viewBox="0 0 16 16"></svg>
  <Trash2 />
  <p transition:fade>{String(scaleLinear)}</p>
  <span>{TOPBAR}</span>
</div>

<style>
  .inbox {
    gap: 12px;
  }
</style>
