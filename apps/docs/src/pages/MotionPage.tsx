import {
  DATA_ATTRS,
  MOTION_TEMPERAMENTS,
  setMotionTemperament,
  type MotionTemperament,
} from '@polymorph/react'
import {
  Accordion,
  Alert,
  Button,
  Card,
  Checkbox,
  Code,
  Dialog,
  Drawer,
  FormField,
  Grid,
  Heading,
  Inline,
  Input,
  List,
  Menu,
  PageHeader,
  Popover,
  Select,
  Separator,
  Skeleton,
  Spinner,
  Stack,
  Stat,
  Stepper,
  Tabs,
  Text,
  toast,
  Toaster,
  Tooltip,
} from '@polymorph/react-ui'
import { useState, type ReactNode } from 'react'

import motion from '../../../../design/motion/motion.json'
import { Section } from '../reference/Section'
import { findSystem } from '../themes'
import { useMeta } from '../meta'

/**
 * The motion page.
 *
 * Motion cannot be reviewed unless something shows it, because timing tuned below perception
 * looks fine in a JSON file. Every pattern in `design/motion/motion.md` is demonstrated here by
 * the component that owns its binding, and each can be re-triggered by hand. The temperament
 * control at the top lets the whole page be viewed at each of the four settings, and the numbers
 * the page states are computed for the setting in effect from `design/motion/motion.json`.
 *
 * Application code cannot express motion. There is no page-level CSS and no engine import here
 * (`polymorph/no-app-css`, `polymorph/no-external-motion`), so a pattern is shown by the
 * vocabulary component that carries it or not at all. That is why the fade stage uses Tabs and
 * not a fading Card: a Card mounted by this file would have no motion, and a page that faked one
 * would document the fake.
 */

type DurationClass = keyof typeof motion.durationsMs

/** The timings a temperament gives, from the motion data. */
function timings(temperament: MotionTemperament) {
  const { durationScale, distanceScale, pressScale, ambient } = motion.temperaments[temperament]
  const enter = (kind: DurationClass) => Math.round(motion.durationsMs[kind] * durationScale)
  return {
    durationScale,
    pressScale,
    ambient,
    enter,
    exit: (kind: DurationClass) =>
      Math.round(motion.durationsMs[kind] * durationScale * motion.exitRatio),
    /** A scale-from depth after the temperament rescales it. */
    scaleFrom: (kind: DurationClass) =>
      Math.round((1 - (1 - motion.scaleFrom[kind]) * distanceScale) * 1000) / 1000,
    /** A named travel distance after the temperament rescales it. */
    distance: (name: keyof typeof motion.distancesPx) =>
      Math.round(motion.distancesPx[name] * distanceScale * 10) / 10,
    /** An ambient loop's period, which runs slower as durations shrink. */
    period: (loop: keyof typeof motion.ambientPeriodsMs) =>
      durationScale === 0 ? null : Math.round(motion.ambientPeriodsMs[loop] / durationScale),
  }
}

type Timings = ReturnType<typeof timings>

const LIVELINESS: Record<MotionTemperament, string> = {
  none: 'None: nothing moves',
  subtle: 'Subtle',
  standard: 'Standard',
  expressive: 'Expressive',
}

const TEMPERAMENT_OPTIONS = MOTION_TEMPERAMENTS.map((name) => ({
  value: name,
  label: LIVELINESS[name],
}))

/** The override already on `<html>`, so the select agrees with the page after a reload. */
function initialTemperament(): MotionTemperament | null {
  const attribute = document.documentElement.getAttribute(DATA_ATTRS.motion)
  return attribute !== null && (MOTION_TEMPERAMENTS as readonly string[]).includes(attribute)
    ? (attribute as MotionTemperament)
    : null
}

/**
 * One demonstration: what it is called, one or two sentences on what to watch, the live
 * specimen, the control that replays it, and the component parts that carry the motion. Every
 * stage has the same shape so that stages can be compared.
 */
function Stage({
  title,
  caption,
  carriers,
  control,
  children,
}: {
  title: string
  caption: ReactNode
  carriers: readonly string[]
  control: ReactNode
  children: ReactNode
}) {
  return (
    <Card>
      <Stack gap={5}>
        <Stack gap={2}>
          <Heading level={3}>{title}</Heading>
          <Text size="sm" tone="secondary">
            {caption}
          </Text>
        </Stack>
        {children}
        <Inline gap={2} wrap>
          {control}
        </Inline>
        <Inline gap={2} wrap>
          {carriers.map((carrier) => (
            <Text key={carrier} size="sm" tone="secondary">
              <Code>{carrier}</Code>
            </Text>
          ))}
        </Inline>
      </Stack>
    </Card>
  )
}

/** `fade`. Every other pattern becomes this one under reduced motion, so it is shown first. */
function FadeStage({ t }: { t: Timings }) {
  const [tab, setTab] = useState('one')

  return (
    <Stage
      title="Fade"
      carriers={['tabs.content', 'dialog.scrim', 'input.clear']}
      caption={`Tabs fade between panels over ${t.enter('surface')}ms. They don't slide, because tabs have no order to slide along.`}
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
          <Text>This panel faded in. Replay swaps to the other one and back.</Text>
        </Tabs.Content>
        <Tabs.Content value="two">
          <Text>So did this one.</Text>
        </Tabs.Content>
      </Tabs>
    </Stage>
  )
}

/** `scale-fade` at all three classes, so the depths can be compared. */
function ScaleFadeStage({ t }: { t: Timings }) {
  const [open, setOpen] = useState(false)

  return (
    <Stage
      title="Grow and fade"
      carriers={['dialog.panel', 'popover.panel', 'tooltip.bubble']}
      caption={`Things that open grow in from where you opened them. Bigger things grow less: a tooltip starts at ${t.scaleFrom('control')}, a popover at ${t.scaleFrom('surface')} and a dialog at ${t.scaleFrom('overlay')} of its size.`}
      control={
        <>
          <Dialog
            open={open}
            onOpenChange={setOpen}
            title="A dialog"
            description={`It took ${t.enter('overlay')}ms to arrive and takes ${t.exit('overlay')}ms to leave.`}
            trigger={<Button variant="solid" tone="accent" size="sm" label="Open a dialog" />}
            footer={
              <Button variant="solid" tone="accent" label="Close" onClick={() => setOpen(false)} />
            }
          >
            <Text>It grew from the button you pressed, not from the middle of the screen.</Text>
          </Dialog>
          <Popover
            label="A popover"
            trigger={<Button variant="outline" tone="accent" size="sm" label="Open a popover" />}
          >
            <Text>This grew from the edge that faces its button.</Text>
          </Popover>
          <Tooltip content="A tooltip grows the most, because it's the smallest">
            <Button variant="ghost" tone="neutral" size="sm" label="Hover for a tooltip" />
          </Tooltip>
        </>
      }
    >
      {null}
    </Stage>
  )
}

/** `slide-fade` at both ends of the distance scale: a toast and a field error. */
function SlideFadeStage({ t }: { t: Timings }) {
  const [error, setError] = useState<string | undefined>(undefined)

  return (
    <Stage
      title="Slide and fade"
      carriers={['toast.enter', 'toast.reflow', 'formfield.error']}
      caption={`A toast slides ${t.distance('lg')}px up from the bottom edge. A field error moves only ${t.distance('sm')}px, so it clearly belongs to its field. Raise a few toasts and close one in the middle to watch the rest close the gap.`}
      control={
        <>
          <Button
            variant="solid"
            tone="accent"
            size="sm"
            label="Raise a toast"
            onClick={() =>
              toast.success('Ticket assigned', {
                description: 'It slid in from the bottom edge.',
              })
            }
          />
          <Button
            variant="outline"
            tone="accent"
            size="sm"
            label={error === undefined ? 'Show an error' : 'Clear the error'}
            onClick={() =>
              setError(error === undefined ? 'Enter a work email address.' : undefined)
            }
          />
        </>
      }
    >
      <FormField label="Requester" error={error}>
        <Input placeholder="you@example.com" />
      </FormField>
    </Stage>
  )
}

/** `collapse` in both its modes: one box that stays mounted, one that leaves. */
function CollapseStage({ t }: { t: Timings }) {
  const [dismissed, setDismissed] = useState(false)

  return (
    <Stage
      title="Collapse"
      carriers={['accordion.content', 'alert.dismiss']}
      caption={`Rows open and close over ${t.enter('surface')}ms. A dismissed alert fades first, then closes its gap, and only then leaves the page.`}
      control={
        <Button
          variant="outline"
          tone="accent"
          size="sm"
          icon="refresh"
          label="Bring the alert back"
          disabled={!dismissed}
          onClick={() => setDismissed(false)}
        />
      }
    >
      <Stack gap={4}>
        <Accordion
          collapsible
          defaultValue="what"
          items={[
            {
              value: 'what',
              label: 'Open and close me',
              content: <Text>The row stays on the page. Only its height and its text move.</Text>,
            },
            {
              value: 'why',
              label: 'Why height and not a slide',
              content: (
                <Text>
                  Only boxes you can't interact with may animate their size, and they never scroll
                  while they move.
                </Text>
              ),
            },
          ]}
        />
        {dismissed ? null : (
          <Alert tone="info" title="Dismiss me" onDismiss={() => setDismissed(true)}>
            Press the close button and watch the space close up.
          </Alert>
        )}
      </Stack>
    </Stage>
  )
}

/** `spring-pop`: the one pattern with a spring in its entrance and a plain fade for its exit. */
function SpringPopStage() {
  const [checked, setChecked] = useState(false)
  const [step, setStep] = useState(1)

  return (
    <Stage
      title="Pop"
      carriers={['checkbox.indicator', 'stepper.indicator']}
      caption="A tick pops in on a spring. It doesn't bounce when motion is subtle, overshoots a little at standard, and bounces clearly when it's expressive. Unticking just fades it out."
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
    >
      <Stack gap={4}>
        <Checkbox
          checked={checked}
          onCheckedChange={(next) => setChecked(next === true)}
          label="Tick me"
        />
        <Stepper
          activeIndex={step}
          steps={[{ label: 'Draft' }, { label: 'Review' }, { label: 'Published' }]}
        />
      </Stack>
    </Stage>
  )
}

/** `sheet`: Drawer's edge entrance, the one pattern whose travel the temperament leaves alone. */
function SheetStage({ t }: { t: Timings }) {
  const [open, setOpen] = useState(false)

  return (
    <Stage
      title="Sheet"
      carriers={['drawer.panel']}
      caption={`A drawer slides all the way in from the edge in ${t.enter('overlay')}ms, without fading. Press Escape while it's still moving, and it turns back from where it is.`}
      control={
        <Button
          variant="solid"
          tone="accent"
          size="sm"
          label="Open the drawer"
          onClick={() => setOpen(true)}
        />
      }
    >
      <Drawer
        open={open}
        onOpenChange={setOpen}
        side="end"
        title="A drawer"
        description="Change how lively the page is and open it again. It travels the same distance, in a different time."
        footer={
          <Button variant="outline" tone="neutral" label="Close" onClick={() => setOpen(false)} />
        }
      >
        <Text>Close it with the button, Escape, or a click outside.</Text>
      </Drawer>
    </Stage>
  )
}

/** `shimmer`: an ambient loop, whose period grows as the temperament calms. */
function ShimmerStage({ t }: { t: Timings }) {
  const [loaded, setLoaded] = useState(false)
  const period = t.period('shimmer')

  return (
    <Stage
      title="Shimmer"
      carriers={['skeleton.sheen']}
      caption={
        period === null
          ? 'With motion off, the placeholder stays still. It still holds the space.'
          : `A placeholder shimmers while content loads, once every ${period}ms. Calmer settings shimmer more slowly.`
      }
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
function SpinStage({ t }: { t: Timings }) {
  const [loading, setLoading] = useState(true)
  const period = t.period('spin')

  return (
    <Stage
      title="Spin"
      carriers={['spinner.glyph', 'button.spinner']}
      caption={
        period === null
          ? 'With motion off, the spinner stands still. Its shape still says it is working.'
          : `A spinner turns once every ${period}ms. A busy button keeps its colour and focus, because it's working, not disabled.`
      }
      control={
        <Button
          variant="outline"
          tone="accent"
          size="sm"
          label={loading ? 'Finish the command' : 'Run the command'}
          onClick={() => setLoading(!loading)}
        />
      }
    >
      <Inline gap={4} align="center">
        <Spinner label="Working" />
        <Button variant="solid" tone="accent" loading={loading} label="Run command" />
      </Inline>
    </Stage>
  )
}

/** The stagger's only consumer, with enough rows to reach its ceiling. */
function CascadeStage() {
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
    <Stage
      title="Cascade"
      carriers={['menu.content', 'menu.items']}
      caption="Each row of a menu starts a moment after the one above it. The delay stops growing after a few rows, so a long menu opens as fast as a short one. Rows don't cascade on the way out."
      control={
        <Menu
          trigger={
            <Button variant="outline" tone="neutral" size="sm" icon="menu" label="Open the menu" />
          }
          items={commands.map((command) => ({
            label: command.label,
            icon: command.icon,
            onSelect: () => setChosen(command.label),
          }))}
        />
      }
    >
      {chosen === null ? null : <Text size="sm">{`You chose “${chosen}”.`}</Text>}
    </Stage>
  )
}

/**
 * The reduced-motion projections from `design/motion/motion.md`, as data. Every pattern above
 * must have one.
 */
const PROJECTIONS = [
  ['Fade', 'Stays a fade'],
  ['Grow and fade', 'Fades, without growing'],
  ['Slide and fade', 'Fades, without moving'],
  ['Pop', 'Fades, without popping'],
  ['Collapse', 'Changes size at once, and the content still fades'],
  ['Sheet', 'Fades in place'],
  ['Shimmer and spin', 'Stop, and stay still'],
  ['Button press', 'No shrink, just the colour change'],
  ['Cascade', 'Every row appears at once'],
] as const

export function MotionPage({ system }: { system: string }) {
  useMeta({
    title: 'Motion',
    description:
      'You never write an animation. Pick how lively your product should feel and every component moves to match. Try each pattern live.',
  })
  const [temperament, setTemperament] = useState<MotionTemperament | null>(initialTemperament)
  const systemDefault = findSystem(system).axes.motionTemperament
  const effective = temperament ?? systemDefault
  const t = timings(effective)

  return (
    <Stack gap={8}>
      <PageHeader
        title="Motion"
        description="You never write an animation. Pick how lively your product should feel, and every component moves to match. Everything on this page is live, so go ahead and play."
      />

      <Card>
        <Stack gap={6}>
          <Grid columns={2} gap={6}>
            <FormField
              label="How lively should it feel?"
              description={`This changes motion across the whole site. The ${system} system's own setting is ${systemDefault}.`}
            >
              <Select
                emptyOption={`The system's own (${systemDefault})`}
                options={TEMPERAMENT_OPTIONS}
                value={temperament}
                onChange={(next) => {
                  const value = next as MotionTemperament | null
                  setTemperament(value)
                  setMotionTemperament(value)
                }}
              />
            </FormField>
            <Stack gap={3}>
              <Text>Now open something and watch how it arrives.</Text>
              <Inline gap={2} wrap>
                <Popover
                  label="A popover"
                  trigger={<Button variant="solid" tone="accent" label="Open a popover" />}
                >
                  <Text>{`This took ${t.enter('surface')}ms to arrive.`}</Text>
                </Popover>
                <Button
                  variant="outline"
                  tone="accent"
                  label="Raise a toast"
                  onClick={() =>
                    toast.success('Saved', {
                      description: 'This slid up from the bottom on a spring.',
                    })
                  }
                />
              </Inline>
            </Stack>
          </Grid>
          <Grid columns={3} gap={6}>
            <Stat
              label="Buttons and fields"
              value={`${t.enter('control')}ms`}
              description={`${t.exit('control')}ms on the way out`}
            />
            <Stat
              label="Menus and panels"
              value={`${t.enter('surface')}ms`}
              description={`${t.exit('surface')}ms on the way out`}
            />
            <Stat
              label="Dialogs and drawers"
              value={`${t.enter('overlay')}ms`}
              description={`${t.exit('overlay')}ms on the way out`}
            />
          </Grid>
        </Stack>
      </Card>

      <Section
        id="feedback"
        title="Feedback on every control"
        lede={
          t.durationScale === 0
            ? 'Hover and press these. With motion off, colours change at once and nothing shrinks, but you still see every state.'
            : `Hover and press these. Colours ease over ${t.enter('control')}ms, and a press shrinks the button to ${t.pressScale} of its size, then springs back.`
        }
      >
        <Inline gap={3} wrap align="center">
          <Button variant="solid" tone="accent" label="Solid" />
          <Button variant="soft" tone="accent" label="Soft" />
          <Button variant="outline" tone="neutral" label="Outline" />
          <Button variant="ghost" tone="neutral" label="Ghost" />
          <Button variant="solid" tone="danger" label="Danger" />
          <Button variant="outline" tone="neutral" label="Disabled" disabled />
        </Inline>
      </Section>

      <Separator />

      <Section
        id="patterns"
        title="Things coming and going"
        lede="Every component picks one of a handful of patterns, and the timing comes from your setting. Exits run faster than entrances, because by then you've already decided."
      >
        <Grid columns={2} gap={6}>
          <FadeStage t={t} />
          <ScaleFadeStage t={t} />
          <SlideFadeStage t={t} />
          <CollapseStage t={t} />
          <SpringPopStage />
          <SheetStage t={t} />
          <ShimmerStage t={t} />
          <SpinStage t={t} />
          <CascadeStage />
        </Grid>
      </Section>

      <Separator />

      <Section
        id="reduced-motion"
        title="When someone turns motion down"
        lede="If your reader asks their device for less motion, nothing on the page travels, grows or bounces, whatever setting you picked. Here's what each pattern does instead. Turn on your device's reduce-motion setting and reload to see it."
      >
        <List label="What each pattern does with reduced motion">
          {PROJECTIONS.map(([pattern, projection]) => (
            <List.Item key={pattern} title={pattern} description={projection} />
          ))}
        </List>
      </Section>

      {/* The toast viewport this page's stages raise into. Mounted once, here rather than in
          the shell, because the docs site has exactly one screen that raises a toast. */}
      <Toaster />
    </Stack>
  )
}
