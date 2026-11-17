import {
  DATA_ATTRS,
  MOTION_TEMPERAMENTS,
  setMotionTemperament,
  type MotionTemperament,
} from '@polymorph/react'
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  Drawer,
  FormField,
  Code,
  Grid,
  Heading,
  Inline,
  Input,
  Menu,
  PageHeader,
  Popover,
  Select,
  Skeleton,
  Spinner,
  Stack,
  Stepper,
  Table,
  Tabs,
  Text,
  toast,
  Toaster,
  Tooltip,
} from '@polymorph/react-ui'
import { useState, type ReactNode } from 'react'

import { findSystem } from '../themes'

/**
 * The motion page.
 *
 * Motion quality cannot be reviewed unless something shows it, because timing
 * tuned below perception looks fine in a JSON file. Colour has a gallery, and
 * this page is the gallery for motion. Every pattern in `design/motion/motion.md`
 * is demonstrated here by the component that owns its binding and can be
 * re-triggered by hand. The temperament select at the top lets the whole page
 * be viewed at each of the four settings.
 *
 * One constraint shapes every stage below: **application code cannot express
 * motion.** There is no page-level CSS and no engine import here
 * (`polymorph/no-app-css`, `polymorph/no-external-motion`), so a pattern is
 * shown by the vocabulary component that carries it or not at all. That is why
 * the fade stage uses Tabs and not a fading Card. A Card mounted by this file
 * would have no motion, and a page that faked one would document the fake.
 */

const TEMPERAMENT_OPTIONS = MOTION_TEMPERAMENTS.map((name) => ({ value: name, label: name }))

/** The override already on `<html>`, so the select agrees with the page after a reload. */
function initialTemperament(): MotionTemperament | null {
  const attribute = document.documentElement.getAttribute(DATA_ATTRS.motion)
  return attribute !== null && (MOTION_TEMPERAMENTS as readonly string[]).includes(attribute)
    ? (attribute as MotionTemperament)
    : null
}

/**
 * One demonstration: the pattern, its carrier, the live specimen, the control
 * that replays it, and a caption naming the binding and its duration class.
 * Every stage has the same shape so that stages can be compared.
 */
function Stage({
  pattern,
  binding,
  motionClass,
  caption,
  control,
  children,
}: {
  pattern: string
  binding: string
  motionClass: string
  caption: ReactNode
  control: ReactNode
  children: ReactNode
}) {
  return (
    <Card>
      <Stack gap={4}>
        <Inline gap={2} align="center" wrap>
          <Badge variant="solid" tone="accent">
            {pattern}
          </Badge>
          <Badge variant="outline" tone="accent">
            {binding}
          </Badge>
          <Badge variant="outline">{motionClass}</Badge>
        </Inline>
        {children}
        <Inline gap={2} wrap>
          {control}
        </Inline>
        <Text size="sm" tone="secondary">
          {caption}
        </Text>
      </Stack>
    </Card>
  )
}

/**
 * `fade`. Every other pattern projects to it under reduced motion, so it is
 * shown first. Tabs are peers, which is why their content has no travel.
 */
function FadeStage() {
  const [tab, setTab] = useState('one')

  return (
    <Stage
      pattern="fade"
      binding="tabs.content"
      motionClass="surface · 220ms"
      control={
        <Button
          variant="outline"
          tone="accent"
          size="sm"
          icon="refresh"
          label="Replay"
          onClick={() => setTab(tab === 'one' ? 'two' : 'one')}
        />
      }
      caption={
        <>
          Opacity 0 → 1 and nothing else. <Code>tabs.content</Code> fades over the surface duration
          on the enter curve. It does not slide, because a direction would imply an order that tabs
          do not have. The same pattern at other classes: <Code>dialog.scrim</Code> (overlay),{' '}
          <Code>input.clear</Code> and <Code>table.sorticon</Code> (control). Every pattern below
          projects to this one under reduced motion.
        </>
      }
    >
      <Tabs
        tabs={[
          { value: 'one', label: 'Panel A' },
          { value: 'two', label: 'Panel B' },
        ]}
        value={tab}
        onChange={setTab}
      >
        <Tabs.Content value="one">
          <Text>This panel arrived by fading in. Replay swaps to its peer and back.</Text>
        </Tabs.Content>
        <Tabs.Content value="two">
          <Text>So did this one, over the same 220ms at the standard temperament.</Text>
        </Tabs.Content>
      </Tabs>
    </Stage>
  )
}

/**
 * `scale-fade` at all three classes at once, so the depths can be compared. A
 * dialog grows from where it was launched, an anchored surface from its
 * trigger-facing edge, and the depth of the grow is the class's own scale-from.
 */
function ScaleFadeStage() {
  const [open, setOpen] = useState(false)

  return (
    <Stage
      pattern="scale-fade"
      binding="dialog.panel · popover.panel · tooltip.bubble"
      motionClass="overlay · surface · control"
      control={
        <>
          <Popover
            label="A popover panel"
            trigger={<Button variant="outline" tone="accent" size="sm" label="Open popover" />}
          >
            <Text>
              popover.panel — scale-fade at surface, growing from the trigger-facing edge.
            </Text>
          </Popover>
          <Tooltip content="tooltip.bubble — scale-fade at control, 140ms">
            <Button variant="ghost" tone="neutral" size="sm" label="Hover for a tooltip" />
          </Tooltip>
        </>
      }
      caption={
        <>
          Opacity 0 → 1 with scale <em>s</em> → 1, where <em>s</em> is the class&rsquo;s own depth:
          control <strong>0.90</strong>, surface <strong>0.94</strong>, overlay{' '}
          <strong>0.96</strong>. Bigger surfaces scale less, because a large grow looks like a zoom.
          Temperament rescales the depth rather than the pattern (<em>s</em>′ = 1 − (1 − <em>s</em>)
          × distanceScale). The dialog also brings <Code>dialog.scrim</Code>, a plain fade at
          overlay, and takes its transform-origin from the button you launched it with.
        </>
      }
    >
      <Inline gap={2} wrap>
        <Dialog
          open={open}
          onOpenChange={setOpen}
          title="scale-fade at the overlay class"
          description="260ms in, 169ms out, growing from the trigger you pressed."
          trigger={<Button variant="solid" tone="accent" size="sm" label="Open dialog" />}
          footer={
            <Button variant="solid" tone="accent" label="Close" onClick={() => setOpen(false)} />
          }
        >
          <Text>
            Watch the corner this grew from — the panel&rsquo;s origin is the projected position of
            the control that opened it, not the centre of the screen.
          </Text>
        </Dialog>
      </Inline>
    </Stage>
  )
}

/**
 * `slide-fade` at both ends of the distance scale: a toast travels 16px from the
 * viewport edge, and a field error travels 4px from the top of its own row. One
 * pattern at two classes and two distances.
 */
function SlideFadeStage() {
  const [error, setError] = useState<string | undefined>(undefined)

  return (
    <Stage
      pattern="slide-fade"
      binding="toast.enter · formfield.error"
      motionClass="surface · control"
      control={
        <>
          <Button
            variant="solid"
            tone="accent"
            size="sm"
            label="Raise a toast"
            onClick={() =>
              toast.success('Ticket assigned', {
                description: 'Arrived on a spring from the bottom edge; the stack reflows on one.',
              })
            }
          />
          <Button
            variant="outline"
            tone="accent"
            size="sm"
            label={error === undefined ? 'Fail validation' : 'Clear the error'}
            onClick={() =>
              setError(error === undefined ? 'Enter a work email address.' : undefined)
            }
          />
        </>
      }
      caption={
        <>
          Opacity 0 → 1 with a translate of <em>d</em> → 0 from the bound edge. Distances are named,
          not measured: <strong>sm 4px</strong>, <strong>md 8px</strong>, <strong>lg 16px</strong>,
          each multiplied by temperament&rsquo;s distanceScale. <Code>toast.enter</Code> takes lg
          from the bottom on spring <Code>default</Code>. <Code>formfield.error</Code> takes sm from
          the top at the control class, so a message under a field does not appear to come from
          somewhere else. Raise several toasts and dismiss one from the middle: the others move into
          the gap on the layout spring (<Code>toast.reflow</Code>) instead of jumping. This is the
          only place on this page where the engine&rsquo;s springs run directly rather than
          projected onto a bezier.
        </>
      }
    >
      <FormField
        label="Requester"
        description="The error below enters from the top edge of its own row."
        error={error}
      >
        <Input placeholder="you@example.com" />
      </FormField>
    </Stage>
  )
}

/**
 * `collapse` in both its modes, side by side. Persistent mode animates a box
 * that stays mounted. Exit mode animates one that leaves.
 */
function CollapseStage() {
  const [dismissed, setDismissed] = useState(false)

  return (
    <Stage
      pattern="collapse"
      binding="accordion.content · alert.dismiss"
      motionClass="surface"
      control={
        <Button
          variant="outline"
          tone="accent"
          size="sm"
          icon="refresh"
          label="Restore the alert"
          disabled={!dismissed}
          onClick={() => setDismissed(false)}
        />
      }
      caption={
        <>
          Size 0 ↔ natural, on the one kind of box the interruption laws allow to animate size.{' '}
          <Code>accordion.content</Code> is <strong>persistent</strong> mode: the row stays mounted,
          the height moves over the surface duration on standard easing, and the copy fades against
          the first and last half of it. <Code>alert.dismiss</Code> is <strong>exit</strong> mode:
          content fades over the first 50% of the surface exit, then the row closes over the rest,
          and only then does the Alert tell the page it may unmount. Overflow stays hidden while
          anything moves. The third consumer is this page&rsquo;s own shell:{' '}
          <Code>appshell.sidebar</Code> is the same persistent collapse on the inline axis, and the
          chevron at the foot of the sidebar plays it.
        </>
      }
    >
      <Stack gap={4}>
        <Accordion
          collapsible
          defaultValue="what"
          items={[
            {
              value: 'what',
              label: 'What persistent mode means',
              content: <Text>The row never leaves. Only its height and its copy move.</Text>,
            },
            {
              value: 'why',
              label: 'Why size and not transform',
              content: (
                <Text>
                  Interruption law 2 permits an animated size on non-interactive containers only,
                  and forbids scrolling the box while it moves.
                </Text>
              ),
            },
          ]}
        />
        {dismissed ? null : (
          <Alert tone="info" title="Dismiss me" onDismiss={() => setDismissed(true)}>
            The ✕ plays the departure; the page owns the unmount, and is told when the row has
            finished closing.
          </Alert>
        )}
      </Stack>
    </Stage>
  )
}

/**
 * `spring-pop`. The only pattern with a spring in its enter, and the only one
 * with an asymmetric exit: it leaves with a fade, not a reversed pop.
 */
function SpringPopStage() {
  const [checked, setChecked] = useState(false)
  const [step, setStep] = useState(1)

  return (
    <Stage
      pattern="spring-pop"
      binding="checkbox.indicator · stepper.indicator"
      motionClass="control"
      control={
        <>
          <Button
            variant="solid"
            tone="accent"
            size="sm"
            label="Complete a step"
            onClick={() => setStep(step >= 2 ? 0 : step + 1)}
          />
          <Button
            variant="outline"
            tone="accent"
            size="sm"
            icon="refresh"
            label="Reset"
            onClick={() => {
              setStep(0)
              setChecked(false)
            }}
          />
        </>
      }
      caption={
        <>
          Opacity 0 → 1 over control × 0.5, and scale <strong>0.5 → 1</strong> on spring{' '}
          <Code>snappy</Code>. It is over-damped at subtle (no overshoot), overshoots slightly at
          standard, and bounces visibly at expressive. The exit is a plain fade at the control exit
          duration. A checkbox being cleared does not reverse the pop, and this asymmetry is part of
          the pattern, not an omission.
        </>
      }
    >
      <Stack gap={4}>
        <Checkbox
          checked={checked}
          onCheckedChange={(next) => setChecked(next === true)}
          label="Tick me — the indicator pops in and fades out"
        />
        <Stepper
          activeIndex={step}
          steps={[{ label: 'Draft' }, { label: 'Review' }, { label: 'Published' }]}
        />
      </Stack>
    </Stage>
  )
}

/** `sheet`: Drawer's edge entrance, and the only pattern whose travel temperament does not scale. */
function SheetStage() {
  const [open, setOpen] = useState(false)

  return (
    <Stage
      pattern="sheet"
      binding="drawer.panel"
      motionClass="overlay"
      control={
        <Button
          variant="solid"
          tone="accent"
          size="sm"
          label="Open the drawer"
          onClick={() => setOpen(true)}
        />
      }
      caption={
        <>
          Translate ±100% → 0 on the bound edge, with <strong>opacity 1 throughout</strong>. A sheet
          slides in and does not fade. The distance is <em>structural</em>, so distanceScale does
          not apply: 100% is geometry, not a travel budget, and scaling it would leave a gap at the
          edge. The scrim is <Code>dialog.scrim</Code> again. Under reduced motion this projects to
          a fade in place, because a sheet held off-screen by a transform cannot arrive from nowhere
          at opacity 0. Open it and press Escape in the same gesture: the reversal continues from
          wherever the panel had reached, on the exit curve, instead of restarting from the edge.
          This is interruption law 1, and the easiest of the four to check by hand.
        </>
      }
    >
      <Drawer
        open={open}
        onOpenChange={setOpen}
        side="end"
        title="drawer.panel — sheet"
        description="Full off-canvas travel on the overlay class: 260ms in, 169ms out."
        footer={
          <Button variant="outline" tone="neutral" label="Close" onClick={() => setOpen(false)} />
        }
      >
        <Text>Open it at each temperament: the travel is identical, the time is not.</Text>
      </Drawer>
    </Stage>
  )
}

/** `shimmer`: ambient, and the first of the two loops whose period scales inversely. */
function ShimmerStage() {
  const [loaded, setLoaded] = useState(false)

  return (
    <Stage
      pattern="shimmer"
      binding="skeleton.sheen"
      motionClass="ambient · 1600ms"
      control={
        <Button
          variant="outline"
          tone="accent"
          size="sm"
          icon="refresh"
          label={loaded ? 'Show the placeholder' : 'Load the content'}
          onClick={() => setLoaded(!loaded)}
        />
      }
      caption={
        <>
          A 200%-wide gradient layer travelling −100% → 100%, linear and infinite, over a period of{' '}
          <strong>1600ms ÷ durationScale</strong>. Ambient periods scale <em>inversely</em>: a
          calmer temperament shimmers slower, not faster. At <Code>none</Code> the sweep stops and
          the base fill remains, because the fill is the placeholder and the sweep is decoration.
        </>
      }
    >
      {loaded ? (
        <Stack gap={2}>
          <Text>Marta Oyelaran</Text>
          <Text>Escalated · billing · opened four minutes ago</Text>
        </Stack>
      ) : (
        <Stack gap={2}>
          {/* Each names its text step. A Skeleton sizes its line box from that
              step alone, so without one it stands in for no particular text. */}
          <Skeleton textStep="lg" width={9} />
          <Skeleton textStep="md" />
          <Skeleton textStep="md" width={10} />
        </Stack>
      )}
    </Stage>
  )
}

/** `spin`: the other ambient loop, on both of its carriers. */
function SpinStage() {
  const [loading, setLoading] = useState(true)

  return (
    <Stage
      pattern="spin"
      binding="spinner.glyph · button.spinner"
      motionClass="ambient · 900ms"
      control={
        <Button
          variant="outline"
          tone="accent"
          size="sm"
          label={loading ? 'Finish the command' : 'Run the command'}
          onClick={() => setLoading(!loading)}
        />
      }
      caption={
        <>
          Rotate 0 → 360°, linear and infinite, over <strong>900ms ÷ durationScale</strong>. The{' '}
          <Code>loading</Code> glyph is a three-quarter arc so that a frozen frame still reads as
          loading. It freezes at <Code>none</Code>, and under reduced motion, where the global
          ambient rule stops it. A loading Button keeps its colours, its focus and its name. It is
          busy, not disabled.
        </>
      }
    >
      <Inline gap={4} align="center">
        <Spinner label="Working" />
        <Button variant="solid" tone="accent" loading={loading} label="Run command" />
      </Inline>
    </Stage>
  )
}

/** The stagger primitive's only consumer, with enough rows to reach the delay ceiling. */
function CascadeSection() {
  const [chosen, setChosen] = useState<string | null>(null)
  const commands = [
    { label: 'Assign to me', icon: 'user' },
    { label: 'Add a comment', icon: 'comment' },
    { label: 'Attach a file', icon: 'upload' },
    { label: 'Add a tag', icon: 'tag' },
    { label: 'Snooze', icon: 'time' },
    { label: 'Pin to the top', icon: 'pinned' },
    { label: 'Move to a folder', icon: 'folder' },
    { label: 'Duplicate', icon: 'duplicate' },
    { label: 'Share a link', icon: 'share' },
    { label: 'Archive', icon: 'archive' },
  ] as const

  return (
    <Card>
      <Stack gap={4}>
        <Inline gap={2} align="center" wrap>
          <Badge variant="solid" tone="accent">
            cascade
          </Badge>
          <Badge variant="outline" tone="accent">
            menu.items
          </Badge>
          <Badge variant="outline">control · enter only</Badge>
        </Inline>
        <Inline gap={3} align="center" wrap>
          <Menu
            trigger={<Button variant="outline" tone="neutral" icon="menu" label="Open the menu" />}
            items={commands.map((command) => ({
              label: command.label,
              icon: command.icon,
              onSelect: () => setChosen(command.label),
            }))}
          />
          {chosen === null ? null : <Badge tone="accent">{`Chose: ${chosen}`}</Badge>}
        </Inline>
        <Text>
          The panel itself is <Code>menu.content</Code>: scale-fade at surface, anchored. Inside it,
          each row is a fade plus a 2px drift at control × enter, delayed by{' '}
          <strong>index × 24ms</strong> and clamped to <strong>200ms</strong>. The menu has ten rows
          on purpose. The ninth crosses the ceiling, so the last two arrive together instead of the
          list taking longer the further down you read. The delay steps are capped at twelve, and
          later items share the ceiling. The cascade runs on enter only; lists do not cascade out.
          Temperament changes it only through the tokens (32ms a row at expressive, 19ms a row at
          subtle, zero at <Code>none</Code>). Under reduced motion the cascade projects to presence,
          because a delay counts as motion even when the delayed element does not move.
        </Text>
      </Stack>
    </Card>
  )
}

/**
 * The reduced-motion projections from `design/motion/motion.md`, as data. Every
 * pattern above must have one.
 */
const PROJECTIONS = [
  ['fade', 'itself'],
  ['scale-fade', 'fade — opacity only, no transform'],
  ['slide-fade', 'fade — opacity only, no travel'],
  ['spring-pop', 'fade — opacity only, no scale'],
  ['collapse', 'instant size change; the content still fades'],
  ['sheet', 'fade in place — no travel'],
  ['shimmer · spin', 'off — static, by one global rule'],
  ['press-feedback', 'no transform; colour states alone'],
  ['cascade', 'presence — a delay is motion too'],
] as const

/**
 * The duration column of the temperament table (`design/motion/motion.md`) and
 * its effect on the control class. A reader needs these two numbers beside the
 * select to tell whether what they saw came from the temperament or the
 * pattern. They are written here rather than read from a token because the
 * ratio is the decision and the token value follows from it.
 */
const DURATION_SCALES: Record<MotionTemperament, string> = {
  none: '0',
  subtle: '0.8',
  standard: '1',
  expressive: '1.35',
}

const CONTROL_MS: Record<MotionTemperament, string> = {
  none: '0ms',
  subtle: '112ms',
  standard: '140ms',
  expressive: '189ms',
}

export function MotionPage({ system }: { system: string }) {
  const [temperament, setTemperament] = useState<MotionTemperament | null>(initialTemperament)
  const systemDefault = findSystem(system).axes.motionTemperament
  const effective = temperament ?? systemDefault

  return (
    <Stack gap={7} p={7}>
      <PageHeader
        title="Motion"
        description="Motion binds to state, is derived rather than authored, and has a budget. Every pattern in the catalogue is below, performed by the component that owns its binding and re-triggerable by hand — because a system whose motion is only written down is a system whose motion nobody can review."
      />

      <Card>
        <Stack gap={4}>
          <Inline gap={3} align="center" wrap>
            <Select
              size="sm"
              emptyOption={`System default (${systemDefault})`}
              options={TEMPERAMENT_OPTIONS}
              value={temperament}
              aria-label="Motion temperament"
              onChange={(next) => {
                const value = next as MotionTemperament | null
                setTemperament(value)
                setMotionTemperament(value)
              }}
            />
            {/* The temperament in effect, with or without an override. The
                badge exists so that a cleared select still names a temperament. */}
            <Badge variant="outline" tone="accent">
              {`${effective} · duration × ${DURATION_SCALES[effective]}`}
            </Badge>
            <Badge variant="outline">{`control ${CONTROL_MS[effective]}`}</Badge>
          </Inline>
          <Text>
            This is the same setting the theme&rsquo;s <Code>motionTemperament</Code> axis controls.
            It writes <Code>data-motion</Code> on the document root, which rescales every duration
            token and the engine identically. CSS state feedback and choreographed exits read the
            same tokens, so they cannot disagree. Clearing the override returns each system to its
            own axis value. Every stage below responds to it, and so does the select itself. Opening
            it plays <Code>select.content</Code> (scale-fade at surface, anchored) and rotates its
            chevron 180° on standard easing at the control class.
          </Text>
          <Text>
            <Code>subtle</Code> scales durations by <strong>0.8</strong> and no lower, because
            shorter changes stop being perceptible. A 98ms colour-only hover on a faint wash is too
            fast to read as feedback. At <strong>112ms</strong> the control class is above the
            threshold where a state change is seen rather than inferred. <Code>none</Code> is zero,
            and the engine is bypassed entirely.
          </Text>
        </Stack>
      </Card>

      <Stack gap={4}>
        <Stack gap={1}>
          <Heading>State feedback</Heading>
          <Text size="sm" tone="secondary">
            The always-on part of the system, and the only part that is pure CSS. Hover these, then
            press and hold one. Colour, border and shadow cross-fade over the control duration on
            standard easing: 140ms at standard, 112ms at subtle, 189ms at expressive, and no
            transition at none, where the static states still show everything.
          </Text>
        </Stack>
        <Card>
          <Stack gap={4}>
            <Inline gap={3} wrap align="center">
              <Button variant="solid" tone="accent" label="Solid" />
              <Button variant="soft" tone="accent" label="Soft" />
              <Button variant="outline" tone="neutral" label="Outline" />
              <Button variant="ghost" tone="neutral" label="Ghost" />
              <Button variant="solid" tone="danger" label="Danger" />
              <Button variant="outline" tone="neutral" label="Disabled" disabled />
            </Inline>
            <Text>
              The press is a transform, not a colour change. The button scales down to{' '}
              <Code>--pm-motion-press-scale</Code> over half the control duration on standard
              easing, and returns on a snappy spring. The token varies by temperament: 0.99 at
              subtle, 0.97 at standard, 0.95 at expressive, and exactly <strong>1</strong> at none,
              where the transform disappears and colour alone gives the feedback. It uses only
              transform, runs on the compositor, and never blocks the click.
            </Text>
          </Stack>
        </Card>
      </Stack>

      <Stack gap={4}>
        <Stack gap={1}>
          <Heading>Enter and exit</Heading>
          <Text size="sm" tone="secondary">
            Five enter/exit patterns and two ambient loops, each on the component that carries its
            binding. Exits use the same numbers × 0.65 on the accelerating curve, because the user
            has already decided and the surface should leave quickly. Nothing here is authored per
            component. A component picks a pattern and a class, and the engine derives the rest.
          </Text>
        </Stack>
        <Grid columns={2} gap={5}>
          <FadeStage />
          <ScaleFadeStage />
          <SlideFadeStage />
          <CollapseStage />
          <SpringPopStage />
          <SheetStage />
          <ShimmerStage />
          <SpinStage />
        </Grid>
      </Stack>

      <Stack gap={4}>
        <Stack gap={1}>
          <Heading>The cascade</Heading>
          <Text size="sm" tone="secondary">
            The stagger primitive&rsquo;s only consumer. A cascade adds no new kind of motion: it is
            an existing pattern at an existing class, plus a bounded sequence of delays.
          </Text>
        </Stack>
        <CascadeSection />
      </Stack>

      <Stack gap={4}>
        <Stack gap={1}>
          <Heading>Reduced motion</Heading>
          <Text size="sm" tone="secondary">
            Reduced motion projects regardless of temperament. Durations are kept where they are
            vestibular-safe, because an opacity change does not cause motion sickness. Only{' '}
            <Code>none</Code> sets durations to zero.
          </Text>
        </Stack>
        <Stack gap={3}>
          <Text>
            This page cannot demonstrate it. <Code>prefers-reduced-motion</Code> is an operating
            system setting, and a checkbox that faked the projection would show this page&rsquo;s
            approximation of the law rather than the law. Instead, this section says where the
            projections live. The ambient stop is <strong>one global rule</strong> in the
            vocabulary&rsquo;s motion conventions. It matches both the media query and a{' '}
            <Code>none</Code> scope, so no component special-cases it. The per-pattern projections
            are the engine&rsquo;s pattern table and each component&rsquo;s own reduced-motion
            branch, and tests assert them. Turn the setting on in your OS and reload: every stage
            above stays legible, and none of them moves.
          </Text>
          {/* `Table.Head` is the `<thead>` section and `Table.Header` is the
              `<th>` cell. */}
          <Table>
            <Table.Head>
              <Table.Row>
                <Table.Header>Pattern</Table.Header>
                <Table.Header>Projection</Table.Header>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {PROJECTIONS.map(([pattern, projection]) => (
                <Table.Row key={pattern}>
                  <Table.Cell>
                    <Badge variant="outline" tone="accent">
                      {pattern}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>{projection}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Stack>
      </Stack>

      {/* The toast viewport this page's slide-fade stage raises into. Mounted
          once, here rather than in the shell, because the docs site has exactly
          one screen that raises a toast. */}
      <Toaster />
    </Stack>
  )
}
