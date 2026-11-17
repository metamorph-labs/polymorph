import { AXIS_NAMES, MODES, type Mode } from '@polymorph/react'
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Input,
  Inline,
  Sparkline,
  Stack,
  Stat,
  Switch,
  Text,
} from '@polymorph/react-ui'
import { useState } from 'react'

import { DRAFT_SYSTEM, getDraftRuntime } from '../draft-boot'
import { findPairing, SYSTEMS } from '../themes'
import styles from './MoodboardPage.module.css'
import { useThemeAttributes } from './useThemeAttributes'

/**
 * The mood board shows the current system on one page: its direction text, type, palette, shape,
 * components and both modes. Everything is live. The swatches read `var(--pm-*)` and the collage
 * uses vocabulary members. So the board shows whatever pairing the toolbar (or an ambient draft)
 * has applied. Switching the system changes the look while the labels stay the same.
 *
 * This is harness chrome, so it may use its own layout. Every colour, length and face below still
 * comes from a `--pm-*` token.
 */

/**
 * Each shipped system's `**Direction:**` paragraph, read from its rationale file. The board
 * quotes it verbatim. Drafts have no rationale yet, and the board says so rather than inventing
 * one.
 */
const RATIONALES = import.meta.glob('../../../design/systems/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

function directionOf(systemName: string): string | null {
  const entry = Object.entries(RATIONALES).find(([path]) => path.endsWith(`/${systemName}.md`))?.[1]
  if (!entry) return null
  const match = /\*\*Direction:\*\*([\s\S]+?)\n\n/.exec(entry)
  if (!match?.[1]) return null
  // Strip the markdown emphasis so the quote reads as plain text.
  return match[1].replace(/\s+/g, ' ').replaceAll('*', '').replaceAll('`', '').trim()
}

const ROLE_SWATCHES: { token: string; label: string; ink?: string }[] = [
  { token: '--pm-bg-app', label: 'page' },
  { token: '--pm-bg-surface', label: 'surface' },
  { token: '--pm-bg-raised', label: 'raised' },
  { token: '--pm-accent-bg', label: 'accent', ink: '--pm-accent-contrast' },
  { token: '--pm-accent-subtle', label: 'accent, quiet' },
  { token: '--pm-success-solid', label: 'success', ink: '--pm-success-contrast' },
  { token: '--pm-warning-solid', label: 'warning', ink: '--pm-warning-contrast' },
  { token: '--pm-danger-solid', label: 'danger', ink: '--pm-danger-contrast' },
]

function Collage({ mode }: { mode: Mode }) {
  const [on, setOn] = useState(true)
  return (
    <div className={styles.modePane} data-mode={mode}>
      <Stack gap={4} p={5}>
        <Text size="sm" tone="secondary">
          {mode}
        </Text>
        <Inline gap={3} wrap>
          <Button variant="solid" tone="accent" label="Continue" />
          <Button variant="outline" tone="neutral" label="Preview" />
          <Button variant="ghost" tone="neutral" label="Skip" />
        </Inline>
        <Input placeholder="Search anything…" aria-label={`Sample search, ${mode}`} />
        <Inline gap={3} wrap align="center">
          <Switch checked={on} onCheckedChange={setOn} label="Weekly digest" />
          <Checkbox checked label="Remember me" onCheckedChange={() => {}} />
          <Badge tone="accent">New</Badge>
          <Badge tone="success">Paid</Badge>
          <Badge tone="neutral">Draft</Badge>
        </Inline>
        <Card>
          <Stack gap={3}>
            <Inline gap={3} align="center">
              <Avatar name="Ana Duarte" />
              <Stat
                label="Weekly active"
                value="4,821"
                numeric
                delta={{ value: '6%', direction: 'up', positive: true }}
              />
            </Inline>
            <Sparkline
              data={[38, 41, 40, 44, 47, 45, 49, 53, 52, 56]}
              label="Weekly active users, trending up"
            />
          </Stack>
        </Card>
      </Stack>
    </div>
  )
}

export function MoodboardPage() {
  const attributes = useThemeAttributes()
  const wearingDraft = attributes.system === DRAFT_SYSTEM
  const theme = findPairing(attributes.system, attributes.palette)
  const system = SYSTEMS.find((candidate) => candidate.name === attributes.system)
  const axes = wearingDraft ? (getDraftRuntime()?.resolved.axes ?? theme.axes) : theme.axes
  const direction = wearingDraft ? null : directionOf(attributes.system)
  const glass = axes.depth === 'glass'

  return (
    <div className={styles.board}>
      <header className={styles.masthead}>
        <p className={styles.eyebrow}>
          {attributes.system} / {attributes.palette}
        </p>
        <h1 className={styles.title}>
          {wearingDraft ? 'Your draft' : (system?.name ?? attributes.system)}
        </h1>
        <p className={styles.direction}>
          {direction ??
            (wearingDraft
              ? 'Rationale unwritten — drafts earn one at save. The board below is already telling you what it will need to say.'
              : 'No rationale on file for this system.')}
        </p>
        <div className={styles.axes}>
          {AXIS_NAMES.map((axis) => (
            <span key={axis} className={styles.axisChip}>
              {String(axes[axis])}
            </span>
          ))}
        </div>
      </header>

      <section className={styles.voice} aria-label="Type specimen">
        <p className={styles.displaySpecimen}>Every pixel is a decision someone made once.</p>
        <p className={styles.bodySpecimen}>
          Body copy holds the room: fourteen to sixteen pixels of it, set in the system&rsquo;s own
          face, carrying the reading rhythm every screen inherits. If this paragraph feels right,
          most of the product already does.
        </p>
        <p className={styles.monoSpecimen}>--pm-radius-md: the file remembers why.</p>
      </section>

      <section className={styles.strip} aria-label="Colour roles">
        {ROLE_SWATCHES.map((swatch) => (
          <div
            key={swatch.token}
            className={styles.swatch}
            style={{
              background: `var(${swatch.token})`,
              color: swatch.ink ? `var(${swatch.ink})` : undefined,
            }}
          >
            <span className={styles.swatchLabel}>{swatch.label}</span>
          </div>
        ))}
      </section>

      <section className={styles.shape} aria-label="Shape and depth">
        <div className={styles.shapeRow}>
          {(['sm', 'md', 'lg', 'pill'] as const).map((step) => (
            <div
              key={step}
              className={styles.radiusChip}
              style={{ borderRadius: `var(--pm-radius-${step})` }}
            >
              {step}
            </div>
          ))}
        </div>
        <div className={styles.shapeRow}>
          {(['control', 'raised', 'overlay'] as const).map((step) => (
            <div
              key={step}
              className={styles.shadowChip}
              style={{ boxShadow: `var(--pm-shadow-${step})` }}
            >
              {step}
            </div>
          ))}
          <div className={styles.focusChip}>focus</div>
        </div>
        {glass ? (
          <div className={styles.glassStage}>
            <div className={styles.glassPane}>the material: a pane of {String(axes.depth)}</div>
          </div>
        ) : null}
      </section>

      <section className={styles.modes} aria-label="Both modes">
        {MODES.map((mode) => (
          <Collage key={mode} mode={mode} />
        ))}
      </section>
    </div>
  )
}
