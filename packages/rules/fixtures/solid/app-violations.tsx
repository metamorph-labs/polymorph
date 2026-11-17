// Every ESLint red rule, violated once, in Solid TSX. See ../README.md — this file is data.
import { scaleLinear } from 'd3-scale'
import { Trash2 } from 'lucide-solid'
import { createSignal } from 'solid-js'
import { Motion } from 'solid-motionone'

import { Button, Hero, PageHeader } from '@polymorph/solid-ui'

import './Inbox.module.css'

const BRAND = '#4087de'
const TOPBAR = 'var(--pm-shell-topbar-height)'

export function Inbox() {
  const [open, setOpen] = createSignal(false)
  return (
    <div style={{ padding: '24px', color: BRAND }}>
      {/* Two openers, so two h1s — the pair rule, broken the way a screen breaks it. */}
      <Hero title="Inbox" lede="Everything waiting on you" />
      <PageHeader title="Inbox" />
      <Button class="mt-4" label="Send" />
      <button onClick={() => setOpen(!open())}>Archive</button>
      <div on:click={() => undefined}>Open</div>
      <input value="" />
      <svg viewBox="0 0 16 16" />
      <Trash2 />
      <Motion.div animate={{ opacity: 1 }} />
      <span>{String(scaleLinear)}</span>
      <span>{TOPBAR}</span>
    </div>
  )
}
