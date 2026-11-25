// Every ESLint red rule, violated once. See ./README.md — this file is data.
import { scaleLinear } from 'd3-scale'
import { motion } from 'framer-motion'
import { Trash2 } from 'lucide-react'

import { Button, Card, Hero, PageHeader } from '@polymorph/react-ui'

import './Inbox.module.css'

const BRAND = '#4087de'
const GUTTER = '24px'
const TOPBAR = 'var(--pm-shell-topbar-height)'

export function Inbox() {
  return (
    <div style={{ padding: GUTTER, color: BRAND }}>
      {/* Two openers, so two h1s — the pair rule, broken the way a screen breaks it. */}
      <Hero title="Inbox" lede="Everything waiting on you" />
      <PageHeader title="Inbox" />
      <Button className="mt-4">Send</Button>
      <button onClick={() => undefined}>Archive</button>
      <div onClick={() => undefined}>Open</div>
      <input value="" onChange={() => undefined} />
      <svg viewBox="0 0 16 16" />
      <Trash2 />
      <motion.div />
      <span>{String(scaleLinear)}</span>
      <span>{TOPBAR}</span>
      {/* A second main Button, a danger Button before a safe one, and a trailing icon that neither points nor opens. */}
      <Card title="Plan">
        <Button label="Upgrade" />
        <Button tone="danger" label="Cancel plan" />
        <Button trailingIcon="delete" label="Remove seat" />
      </Card>
    </div>
  )
}
