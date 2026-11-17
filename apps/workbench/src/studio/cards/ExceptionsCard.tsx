import {
  INSET_ASSIGNMENT_CLASSES,
  RADIUS_ASSIGNMENT_CLASSES,
  RADIUS_STEPS,
  SHADOW_ASSIGNMENT_CLASSES,
  SHADOW_STEPS,
  SPACE_LADDER_PX,
  SPACE_STEPS,
  type ComponentException,
  type SystemOverrides,
} from '@polymorph/react'
import {
  Badge,
  Button,
  Card,
  FormField,
  Grid,
  Heading,
  Inline,
  Input,
  Select,
  Stack,
  Text,
} from '@polymorph/react-ui'
import { useMemo, useState } from 'react'

import { memberSlug } from '@polymorph/registry/exceptions'

import { REGISTRY } from '../../registry'
import { updateDraft } from '../store'

/**
 * The Exceptions card: a form for rung 2 of the exception ladder (contextual re-assignment,
 * `docs/rules.md`).
 *
 * Each exception has one member, one decision, one step, and the `because` reason the law
 * requires. The saved file records the reason next to the exception, which distinguishes a
 * declared exception from drift. The pickers offer only valid choices: members that read class
 * tokens, and for each member only the decisions its own stylesheet reads (from the registry's
 * per-member token lists). So the form cannot build an exception the registry audit would refuse.
 */

const FAMILY_WORD: Record<ComponentException['family'], string> = {
  radius: 'Corners',
  shadow: 'Shadow',
  inset: 'Padding',
}

const CLASS_LABEL: Record<string, string> = {
  'radius/control': 'buttons & inputs',
  'radius/detail': 'small details',
  'radius/surface': 'panels & cards',
  'shadow/seat': 'buttons & inputs',
  'shadow/resting': 'cards',
  'shadow/transient': 'floating panels',
  'inset/surface': 'cards & dialogs',
  'inset/pane': 'small panels',
  'inset/list': 'menus & lists',
}

const RADIUS_STEP_LABEL: Record<string, string> = {
  none: 'square',
  sm: 'small',
  md: 'medium',
  lg: 'large',
  pill: 'fully round',
}
const SHADOW_STEP_LABEL: Record<string, string> = {
  control: 'faint',
  raised: 'soft',
  overlay: 'strong',
}

/** Every (family, class) pair that names a token, in the studio's order. */
const DECISIONS: { family: ComponentException['family']; cls: string; token: string }[] = [
  ...RADIUS_ASSIGNMENT_CLASSES.map((cls) => ({
    family: 'radius' as const,
    cls,
    token: `--pm-radius-${cls}`,
  })),
  ...SHADOW_ASSIGNMENT_CLASSES.map((cls) => ({
    family: 'shadow' as const,
    cls,
    token: `--pm-shadow-${cls}`,
  })),
  ...INSET_ASSIGNMENT_CLASSES.map((cls) => ({
    family: 'inset' as const,
    cls,
    token: `--pm-inset-${cls}`,
  })),
]

const decisionLabel = (family: ComponentException['family'], cls: string) =>
  `${FAMILY_WORD[family]} — ${CLASS_LABEL[`${family}/${cls}`]}`

function stepOptions(family: ComponentException['family']) {
  if (family === 'radius')
    return RADIUS_STEPS.map((step) => ({
      value: step,
      label: `${RADIUS_STEP_LABEL[step]} (${step})`,
    }))
  if (family === 'shadow')
    return SHADOW_STEPS.map((step) => ({
      value: step,
      label: `${SHADOW_STEP_LABEL[step]} (${step})`,
    }))
  return SPACE_STEPS.map((step) => ({
    value: String(step),
    label: `step ${step} — ${SPACE_LADDER_PX[step]}px`,
  }))
}

function stepLabel(exception: ComponentException): string {
  if (exception.family === 'radius')
    return `${RADIUS_STEP_LABEL[exception.step]} (${exception.step})`
  if (exception.family === 'shadow')
    return `${SHADOW_STEP_LABEL[exception.step]} (${exception.step})`
  return `step ${exception.step} — ${SPACE_LADDER_PX[exception.step]}px`
}

/** The members an exception can target: those that read at least one class token. */
const WEARERS = REGISTRY.components
  .filter((component) => DECISIONS.some((decision) => component.tokens.includes(decision.token)))
  .map((component) => ({
    name: component.name,
    slug: memberSlug(component.name),
    tokens: component.tokens,
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

function setExceptions(exceptions: ComponentException[]): void {
  updateDraft((current) => {
    const { exceptions: _dropped, ...rest } = current.system.overrides ?? {}
    const overrides: SystemOverrides = {
      ...rest,
      ...(exceptions.length > 0 ? { exceptions } : {}),
    }
    const { overrides: _overrides, ...system } = current.system
    return {
      ...current,
      system: Object.keys(overrides).length > 0 ? { ...system, overrides } : system,
    }
  })
}

export function ExceptionsCard({
  exceptions,
  preselect,
}: {
  exceptions: readonly ComponentException[]
  /** A member slug passed from the Components page. The add row opens with it selected. */
  preselect?: string
}) {
  const [member, setMember] = useState<string>(
    () => WEARERS.find((wearer) => wearer.slug === preselect)?.slug ?? '',
  )
  const [decision, setDecision] = useState('')
  const [step, setStep] = useState('')
  const [because, setBecause] = useState('')

  const memberOptions = useMemo(
    () => [
      { value: '', label: 'choose a component…' },
      ...WEARERS.map((wearer) => ({ value: wearer.slug, label: wearer.name })),
    ],
    [],
  )

  // Only the decisions this member's own stylesheet reads, so the form cannot build an exception
  // the registry audit would refuse.
  const decisionOptions = useMemo(() => {
    const wearer = WEARERS.find((candidate) => candidate.slug === member)
    if (!wearer) return [{ value: '', label: 'pick the component first' }]
    return [
      { value: '', label: 'choose a decision…' },
      ...DECISIONS.filter((candidate) => wearer.tokens.includes(candidate.token)).map(
        (candidate) => ({
          value: `${candidate.family}/${candidate.cls}`,
          label: decisionLabel(candidate.family, candidate.cls),
        }),
      ),
    ]
  }, [member])

  const family = (decision.split('/')[0] || null) as ComponentException['family'] | null
  const cls = decision.split('/')[1] ?? ''

  const addable = member !== '' && decision !== '' && step !== '' && because.trim() !== ''
  const alreadyRuled = exceptions.some(
    (exception) =>
      exception.component === member && `${exception.family}/${exception.class}` === decision,
  )

  function add(): void {
    if (!addable || family === null || alreadyRuled) return
    // The casts are safe. Every value comes from the enums' option lists, and the draft is parsed
    // again by `systemSchema` on the next derivation, so an invalid combination shows up in the
    // law panel.
    const next = {
      component: member,
      family,
      class: cls,
      step: family === 'inset' ? Number(step) : step,
      because: because.trim(),
    } as ComponentException
    setExceptions([...exceptions, next])
    setDecision('')
    setStep('')
    setBecause('')
  }

  function remove(target: ComponentException): void {
    setExceptions(
      exceptions.filter(
        (exception) =>
          !(
            exception.component === target.component &&
            exception.family === target.family &&
            exception.class === target.class
          ),
      ),
    )
  }

  return (
    <Card>
      <Stack gap={4}>
        <Heading>Exceptions</Heading>
        <Text tone="secondary">
          For the one component that must differ. Everything else keeps following the groups above —
          an exception re-points a single decision for a single component, and it ships with its
          reason, so the file explains itself later. Use sparingly: each one is a sentence the next
          designer has to read.
        </Text>

        {exceptions.length > 0 ? (
          <Stack gap={3}>
            {exceptions.map((exception) => {
              const wearer = WEARERS.find((candidate) => candidate.slug === exception.component)
              return (
                <Stack
                  key={`${exception.component}/${exception.family}/${exception.class}`}
                  gap={2}
                >
                  <Inline gap={2} wrap>
                    <Badge tone="accent">{wearer?.name ?? exception.component}</Badge>
                    <Text size="sm">
                      {decisionLabel(exception.family, exception.class)} → {stepLabel(exception)}
                    </Text>
                    <Button
                      variant="ghost"
                      tone="neutral"
                      size="sm"
                      icon="remove"
                      label="Remove"
                      onClick={() => remove(exception)}
                    />
                  </Inline>
                  <Text size="sm" tone="secondary">
                    because: {exception.because}
                  </Text>
                </Stack>
              )
            })}
          </Stack>
        ) : (
          <Text size="sm" tone="secondary">
            None declared — the whole product follows the groups above.
          </Text>
        )}

        <Grid columns={3} gap={4}>
          <FormField label="Component">
            <Select
              options={memberOptions}
              value={member}
              onChange={(value) => {
                if (value !== null) {
                  setMember(value)
                  setDecision('')
                  setStep('')
                }
              }}
            />
          </FormField>
          {/* The error is about the Component/Decision pair: the same decision set twice for one
              member. So it shows on the Decision field, where the second part of the pair is
              chosen. On Because it would wrongly suggest the reason was at fault. */}
          <FormField
            label="Decision"
            error={
              alreadyRuled
                ? 'This decision is already ruled for this component — remove it first.'
                : undefined
            }
          >
            <Select
              options={decisionOptions}
              value={decision}
              onChange={(value) => {
                if (value !== null) {
                  setDecision(value)
                  setStep('')
                }
              }}
            />
          </FormField>
          <FormField label="Becomes">
            <Select
              options={
                family === null
                  ? [{ value: '', label: 'pick the decision first' }]
                  : [{ value: '', label: 'choose…' }, ...stepOptions(family)]
              }
              value={step}
              onChange={(value) => {
                if (value !== null) setStep(value)
              }}
            />
          </FormField>
        </Grid>
        <FormField
          label="Because"
          description="The reason ships in the file, next to the exception. Future-you reads this."
        >
          <Input value={because} onChange={setBecause} placeholder="the launch brand wants…" />
        </FormField>
        <Inline gap={3}>
          <Button
            variant="outline"
            tone="accent"
            icon="add"
            label="Declare the exception"
            disabled={!addable || alreadyRuled}
            onClick={add}
          />
        </Inline>
      </Stack>
    </Card>
  )
}
