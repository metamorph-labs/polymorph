import {
  AXIS_NAMES,
  AXIS_VALUES,
  CHROMA_BUDGETS,
  CONTROL_HEIGHT_PX,
  FONT_ROLES,
  GEOMETRY_FOCUS_OFFSET,
  GEOMETRY_RADII,
  INSET_ASSIGNMENT_CLASSES,
  INSET_ASSIGNMENT_DEFAULT,
  MAX_NEUTRAL_TINT,
  MODES,
  RADIUS_ASSIGNMENT_CLASSES,
  RADIUS_ASSIGNMENT_DEFAULT,
  RADIUS_STEPS,
  SHADOW_ASSIGNMENT_CLASSES,
  SHADOW_ASSIGNMENT_DEFAULT,
  SHADOW_STEPS,
  SPACE_LADDER_PX,
  SPACE_STEPS,
  TEMPERAMENT_FOCUS_WIDTH,
  TYPE_BASE_PX,
  TYPE_BASE_RANGE_PX,
  TYPE_RATIO,
  TYPE_STEP_FLOOR_PX,
  typeSizePx,
  type Axes,
  type AxisName,
  type ChromaBudget,
  type FontRole,
  type Mode,
  type SystemOverrides,
} from '@polymorph/react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Code,
  ConfirmDialog,
  FormField,
  Grid,
  Heading,
  Inline,
  Input,
  Link,
  NumberInput,
  PageHeader,
  Select,
  Slider,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
} from '@polymorph/react-ui'
import { useEffect, useMemo, useState } from 'react'

import { loadFontFamilies } from '../fonts'
import { navigate } from '../harness/router'
import { ExceptionsCard } from './cards/ExceptionsCard'
import {
  diffDraftTokens,
  DRAFT_PALETTE,
  DRAFT_SYSTEM,
  existingNames,
  FONT_FAMILIES,
  importDraft,
  nameFault,
  refusalFaults,
  saveable,
  serializeDraft,
  type Draft,
} from './draft'
import { download, renderHandoff, renderThemeCSS } from './handoff'
import { requestSave } from './protocol'
import {
  discardDraft,
  discardRefusedDraft,
  ensurePreviewInstalled,
  hasDraft,
  refusedDraft,
  replaceDraft,
  setPaletteName,
  setSystemName,
  updateDraft,
  useStudio,
} from './store'

/**
 * The theme studio: the designer's controls for the axes. It uses the same mechanism as the
 * agent's `propose_theme`.
 *
 * Every control writes into one draft object. On every change the draft is composed, resolved and
 * emitted through the real engine, and the block is installed under a reserved pairing that the
 * preview panes use. Nothing here re-implements a derivation, a law or a scope. This file is the
 * UI, and the logic is in `draft.ts` next to it.
 *
 * It is application code and the red rules apply to it. It is outside the harness exemption on
 * purpose, so the rules also cover the one page in this repository that is entirely about style.
 * No stylesheet, no `style` prop, no `className`, no raw control, and one page opener.
 */

const AXIS_OPTIONS = Object.fromEntries(
  AXIS_NAMES.map((axis) => [axis, AXIS_VALUES[axis].map((value) => ({ value, label: value }))]),
) as Record<AxisName, { value: string; label: string }[]>

const CHROMA_OPTIONS = CHROMA_BUDGETS.map((value) => ({ value, label: value }))
const FAMILY_OPTIONS = FONT_FAMILIES.map((value) => ({ value, label: value }))
/**
 * The designer-facing names for steps and component groups. The saved file keeps the canonical
 * names. Every option also shows its token in brackets so the two names stay linked.
 */
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
const RADIUS_CLASS_LABEL: Record<string, string> = {
  control: 'Buttons & inputs',
  detail: 'Small details',
  surface: 'Panels & cards',
}
const SHADOW_CLASS_LABEL: Record<string, string> = {
  seat: 'Buttons & inputs',
  resting: 'Cards',
  transient: 'Floating panels',
}
const INSET_CLASS_LABEL: Record<string, string> = {
  surface: 'Cards & dialogs',
  pane: 'Small panels',
  list: 'Menus & lists',
}
const SIZE_LABEL: Record<string, string> = { sm: 'Small', md: 'Medium', lg: 'Large' }

const RADIUS_STEP_OPTIONS = RADIUS_STEPS.map((value) => ({
  value,
  label: `${RADIUS_STEP_LABEL[value]} (${value})`,
}))
const SHADOW_STEP_OPTIONS = SHADOW_STEPS.map((value) => ({
  value,
  label: `${SHADOW_STEP_LABEL[value]} (${value})`,
}))
const SPACE_STEP_OPTIONS = SPACE_STEPS.map((value) => ({
  value: String(value),
  label: `step ${value} — ${SPACE_LADDER_PX[value]}px`,
}))

/** Three decimals, because the tint range ends at 0.03 and two decimals would lose half of it. */
const tintLabel = (value: number) => value.toFixed(3)
const degreeLabel = (value: number) => `${value}°`

export function StudioPage() {
  const { draft, systemName, paletteName, derivation } = useStudio()
  const [paste, setPaste] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string[] | null>(null)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  // A stored draft this schema refused, which the store set aside at boot instead of overwriting.
  // It is read once at mount, like the member preselect below, because the store has already
  // moved it and only this page's button clears it.
  const [refused, setRefused] = useState(refusedDraft)
  // The Components page's "make an exception" link: /studio?member=<slug>. It is read once at
  // mount because the router tracks only the pathname, and the search param is a one-time input,
  // not state.
  const [memberPreselect] = useState(
    () => new URLSearchParams(window.location.search).get('member') ?? undefined,
  )

  const lawful = derivation.faults.length === 0
  const amendments = useMemo(() => diffDraftTokens(draft), [draft])
  const exceptions = draft.system.overrides?.exceptions ?? []

  /*
   * The first paint. The store installs a block on every edit, which makes the draft ambient.
   * This handles a fresh visit, where no edit has happened yet and the preview panes would
   * otherwise use a pair that no block matches. An unresolvable draft installs nothing and the
   * previous block stays. The preview keeps showing the last resolved theme while the law panel
   * explains why the current draft failed.
   */
  useEffect(() => {
    ensurePreviewInstalled()
  }, [])

  /*
   * The draft's webfonts. Fonts load per active system, so a family this draft names may not be
   * on the page yet. The previews would then fall back without any error, and the font selects
   * would preview the wrong face. The loader skips families it has already started, so this
   * costs nothing when the draft uses shipped font slots.
   */
  useEffect(() => {
    loadFontFamilies(FONT_ROLES.map((role) => draft.system.fonts[role].family))
  }, [draft.system.fonts])

  const names = existingNames()
  const systemNameError = nameFault('system', systemName)
  const paletteNameError = nameFault('palette', paletteName)
  const nameable = systemNameError === null && paletteNameError === null
  const amends = names.systems.includes(systemName) || names.palettes.includes(paletteName)

  const pairJson = useMemo(
    () => serializeDraft(saveable(draft, systemName, paletteName)),
    [draft, systemName, paletteName],
  )

  function setAxis(axis: AxisName, value: string): void {
    updateDraft((current) => ({
      ...current,
      system: { ...current.system, axes: { ...current.system.axes, [axis]: value } as Axes },
    }))
  }

  function setFont(role: FontRole, family: string): void {
    updateDraft((current) => ({
      ...current,
      system: {
        ...current.system,
        // Spread, so a slot's fallback class and its `style` survive a change of family. An italic
        // display is a decision about the slot, not about the face in it.
        fonts: { ...current.system.fonts, [role]: { ...current.system.fonts[role], family } },
      },
    }))
  }

  function setSeed(patch: Partial<Draft['palette']>): void {
    updateDraft((current) => ({ ...current, palette: { ...current.palette, ...patch } }))
  }

  /**
   * An override is an amendment, so an absent key means "use the base". A step set back to its
   * base value is removed from the file rather than pinned. An emptied scale is removed from
   * `overrides`, and an empty `overrides` is removed from the system. So the saved JSON contains
   * only what the designer decided.
   */
  function setOverride(
    scale: keyof SystemOverrides,
    step: string,
    value: number | null,
    baseValue: number,
  ): void {
    updateDraft((current) => {
      const scales: Record<string, Record<string, number>> = {
        ...(current.system.overrides as Record<string, Record<string, number>> | undefined),
      }
      const steps = { ...scales[scale] }
      if (value === null || value === baseValue) delete steps[step]
      else steps[step] = value
      if (Object.keys(steps).length > 0) scales[scale] = steps
      else delete scales[scale]
      const { overrides: _dropped, ...system } = current.system
      return {
        ...current,
        system:
          Object.keys(scales).length > 0
            ? { ...system, overrides: scales as SystemOverrides }
            : system,
      }
    })
  }

  /**
   * Assignments are re-pointed references, not values, so they have their own setter. A class set
   * back to its map's default is removed from the file, and an emptied family is removed from
   * `assign`. This follows the same rule as the scales.
   */
  function setAssignment(
    family: 'radius' | 'shadow' | 'inset',
    cls: string,
    step: string | number | null,
    base: string | number,
  ): void {
    updateDraft((current) => {
      const assign: Record<string, Record<string, string | number>> = {
        ...(current.system.overrides?.assign as
          Record<string, Record<string, string | number>> | undefined),
      }
      const classes = { ...assign[family] }
      if (step === null || step === base) delete classes[cls]
      else classes[cls] = step
      if (Object.keys(classes).length > 0) assign[family] = classes
      else delete assign[family]
      const { assign: _assign, ...scales } = current.system.overrides ?? {}
      const overrides: SystemOverrides = {
        ...scales,
        ...(Object.keys(assign).length > 0 ? { assign: assign as SystemOverrides['assign'] } : {}),
      }
      const { overrides: _dropped, ...system } = current.system
      return {
        ...current,
        system: Object.keys(overrides).length > 0 ? { ...system, overrides } : system,
      }
    })
  }

  const overrides = draft.system.overrides
  // The two steps under the base show the size the ratio derives until set.
  const typeBase = overrides?.type?.base ?? TYPE_BASE_PX
  const typeRatio = overrides?.type?.ratio ?? TYPE_RATIO[draft.system.axes.density]
  const derivedSm = typeSizePx(-1, typeRatio, typeBase)
  const derivedXs = typeSizePx(-2, typeRatio, typeBase)
  const radiusBase = GEOMETRY_RADII[draft.system.axes.geometry]
  const radiusMerged = {
    sm: overrides?.radius?.sm ?? radiusBase[0],
    md: overrides?.radius?.md ?? radiusBase[1],
    lg: overrides?.radius?.lg ?? radiusBase[2],
  }
  const anyAmended = overrides !== undefined

  /**
   * Shows the base value in brackets in the title, only when the value has changed. An unchanged
   * field shows no base.
   */
  const withBase = (name: string, amended: boolean, base: string) =>
    amended ? `${name} (base ${base})` : name

  async function send(overwrite: boolean): Promise<void> {
    const result = await requestSave(saveable(draft, systemName, paletteName), overwrite)

    if (result.existing !== undefined && result.existing.length > 0) {
      setConfirming(result.existing)
      return
    }
    if (!result.ok) {
      setSaveNote(result.error ?? 'the save was refused and said nothing')
      return
    }
    // A full reload, on purpose. The catalogue is discovered at module load through
    // `import.meta.glob`, so the reliable way to show a new file in the pickers is to run the
    // discovery again.
    window.location.reload()
  }

  function applyPaste(): void {
    const result = importDraft(paste)
    setImportError(result.error)
    if (result.draft === null) return
    // `replaceDraft` resets the save-field names to the imported pair's own.
    replaceDraft(result.draft)
    setSaveNote(null)
  }

  return (
    <Stack gap={6} p={7}>
      <PageHeader
        title="Theme studio"
        description="Every change composes the system with the palette and re-derives through the engine. The preview wears the block the emitter wrote; the panel says what the laws said."
        actions={
          <>
            <Button
              variant="solid"
              tone="accent"
              icon="confirm"
              label="Save to design/"
              disabled={!lawful || !nameable}
              onClick={() => void send(false)}
            />
            <Button
              variant="outline"
              tone="neutral"
              icon="copy"
              label="Copy the pair"
              onClick={() => void navigator.clipboard.writeText(pairJson)}
            />
            <Button
              variant="ghost"
              tone="danger"
              icon="delete"
              label="Discard draft"
              disabled={!hasDraft()}
              onClick={() => setConfirmingDiscard(true)}
            />
          </>
        }
      />

      {/* Links for checking the draft, next to the controls. Every page renders under the
          toolbar's pairing, so with the draft selected there each link previews it. */}
      <Inline gap={3} wrap>
        <Text size="sm" tone="secondary">
          See it wearing this:
        </Text>
        <Button
          variant="ghost"
          tone="accent"
          label="Components"
          onClick={() => navigate('/components')}
        />
        <Button variant="ghost" tone="accent" label="Pages" onClick={() => navigate('/pages')} />
        <Button
          variant="ghost"
          tone="accent"
          label="Mood board"
          onClick={() => navigate('/moodboard')}
        />
        <Button
          variant="ghost"
          tone="accent"
          label="All tokens"
          onClick={() => navigate('/tokens')}
        />
      </Inline>

      <Grid columns={2} gap={6}>
        <Stack gap={5}>
          {/* The set-aside draft. The designer did not discard a document that the current
              schema refuses, so nothing overwrites or deletes it. It stays here, exactly as
              stored, until the designer discards it. Downloading a copy does not remove it. */}
          {refused === null ? null : (
            <Card>
              <Stack gap={4}>
                <Heading>A saved draft was set aside</Heading>
                <Text tone="secondary">
                  The work-in-progress this browser was holding no longer parses under the current
                  schema — a decision has changed shape since it was written. Rather than overwrite
                  it, the studio opened fresh and kept the document exactly as it was stored.
                </Text>
                <Stack as="ul" gap={2}>
                  {refusalFaults(refused).map((fault) => (
                    <li key={fault}>
                      <Text size="sm" tone="secondary">
                        {fault}
                      </Text>
                    </li>
                  ))}
                </Stack>
                <Inline gap={3} wrap>
                  <Button
                    variant="outline"
                    tone="accent"
                    icon="download"
                    label="Download it (.json)"
                    onClick={() => download('refused-draft.json', refused, 'application/json')}
                  />
                  <Button
                    variant="ghost"
                    tone="danger"
                    icon="delete"
                    label="Discard it"
                    onClick={() => {
                      discardRefusedDraft()
                      setRefused(null)
                    }}
                  />
                </Inline>
              </Stack>
            </Card>
          )}

          <LawPanel faults={derivation.faults} checked={derivation.checked} />

          {saveNote === null ? null : (
            <Alert tone="danger" title="The save was refused">
              {saveNote}
            </Alert>
          )}

          <Card>
            <Stack gap={4}>
              <Heading>Axes</Heading>
              <Text tone="secondary">
                The structural personality — how the product is built and how it speaks. Eight
                decisions; the options are the engine&rsquo;s own enums.
              </Text>
              <Grid columns={2} gap={4}>
                {AXIS_NAMES.map((axis) => (
                  <FormField key={axis} label={axis}>
                    <Select
                      options={AXIS_OPTIONS[axis]}
                      value={draft.system.axes[axis]}
                      onChange={(value) => {
                        if (value !== null) setAxis(axis, value)
                      }}
                    />
                  </FormField>
                ))}
              </Grid>
            </Stack>
          </Card>

          <Card>
            <Stack gap={4}>
              <Heading>Scale</Heading>
              <Text tone="secondary">
                Fine-tune the exact numbers your choices above produce. The preview updates the
                moment a number lands — press Enter or step with the arrows; a typed number waits
                until you do. Anything you leave alone keeps following along automatically, and
                setting a number back to its base removes the tweak. Spacing and heights are set for
                the standard density — compact and comfortable adjust on their own.
              </Text>
              <Heading level={3}>Corners</Heading>
              <Grid columns={3} gap={4}>
                {(['sm', 'md', 'lg'] as const).map((step) => (
                  <FormField
                    key={step}
                    label={withBase(
                      SIZE_LABEL[step] ?? step,
                      overrides?.radius?.[step] !== undefined,
                      `${radiusBase[{ sm: 0, md: 1, lg: 2 }[step]] ?? 0}px`,
                    )}
                  >
                    <NumberInput
                      min={0}
                      max={64}
                      step={1}
                      value={radiusMerged[step]}
                      suffix="px"
                      onChange={(value) =>
                        setOverride(
                          'radius',
                          step,
                          value,
                          radiusBase[{ sm: 0, md: 1, lg: 2 }[step]] ?? 0,
                        )
                      }
                    />
                  </FormField>
                ))}
              </Grid>
              <Heading level={3}>Spacing</Heading>
              <Grid columns={4} gap={4}>
                {([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map((step) => (
                  <FormField
                    key={step}
                    label={withBase(
                      `Step ${step}`,
                      overrides?.space?.[step] !== undefined,
                      `${SPACE_LADDER_PX[step] ?? 0}px`,
                    )}
                  >
                    <NumberInput
                      min={2}
                      max={128}
                      step={2}
                      value={overrides?.space?.[step] ?? SPACE_LADDER_PX[step] ?? 0}
                      suffix="px"
                      onChange={(value) =>
                        setOverride('space', String(step), value, SPACE_LADDER_PX[step] ?? 0)
                      }
                    />
                  </FormField>
                ))}
              </Grid>
              <Heading level={3}>Control heights</Heading>
              <Grid columns={3} gap={4}>
                {(['sm', 'md', 'lg'] as const).map((step) => (
                  <FormField
                    key={step}
                    label={withBase(
                      SIZE_LABEL[step] ?? step,
                      overrides?.controlHeight?.[step] !== undefined,
                      `${CONTROL_HEIGHT_PX[step]}px`,
                    )}
                  >
                    <NumberInput
                      min={24}
                      max={64}
                      step={2}
                      value={overrides?.controlHeight?.[step] ?? CONTROL_HEIGHT_PX[step]}
                      suffix="px"
                      onChange={(value) =>
                        setOverride('controlHeight', step, value, CONTROL_HEIGHT_PX[step])
                      }
                    />
                  </FormField>
                ))}
              </Grid>
              <Heading level={3}>Shadows</Heading>
              <FormField
                label={withBase('Shadow reach', overrides?.shadow?.throw !== undefined, '×1')}
                description="How far every shadow travels. Lower hugs the surface, higher floats — how dark they are never changes, and surfaces this style keeps flat stay flat."
              >
                <Slider
                  min={0.5}
                  max={1.75}
                  step={0.05}
                  value={overrides?.shadow?.throw ?? 1}
                  showValue
                  formatValue={(value) => `×${value.toFixed(2).replace(/0$/, '')}`}
                  onChange={(value) => setOverride('shadow', 'throw', value, 1)}
                />
              </FormField>
              <Heading level={3}>Focus ring</Heading>
              <Grid columns={2} gap={4}>
                <FormField
                  label={withBase(
                    'Thickness',
                    overrides?.focus?.width !== undefined,
                    `${TEMPERAMENT_FOCUS_WIDTH[draft.system.axes.contrastTemperament]}px`,
                  )}
                  description="Never thinner than the floor — the ring announces where the keyboard is."
                >
                  <NumberInput
                    min={2}
                    max={6}
                    step={1}
                    value={
                      overrides?.focus?.width ??
                      TEMPERAMENT_FOCUS_WIDTH[draft.system.axes.contrastTemperament]
                    }
                    suffix="px"
                    onChange={(value) =>
                      setOverride(
                        'focus',
                        'width',
                        value,
                        TEMPERAMENT_FOCUS_WIDTH[draft.system.axes.contrastTemperament],
                      )
                    }
                  />
                </FormField>
                <FormField
                  label={withBase(
                    'Air',
                    overrides?.focus?.offset !== undefined,
                    `${GEOMETRY_FOCUS_OFFSET[draft.system.axes.geometry]}px`,
                  )}
                  description="Space between the ring and the control's edge."
                >
                  <NumberInput
                    min={0}
                    max={4}
                    step={1}
                    value={
                      overrides?.focus?.offset ?? GEOMETRY_FOCUS_OFFSET[draft.system.axes.geometry]
                    }
                    suffix="px"
                    onChange={(value) =>
                      setOverride(
                        'focus',
                        'offset',
                        value,
                        GEOMETRY_FOCUS_OFFSET[draft.system.axes.geometry],
                      )
                    }
                  />
                </FormField>
              </Grid>
              <Heading level={3}>Type scale</Heading>
              <FormField
                label={withBase(
                  'Body size',
                  overrides?.type?.base !== undefined,
                  `${TYPE_BASE_PX}px`,
                )}
                description="Paragraphs and the md step. On a phone, fields keep the text-entry floor whatever the base."
              >
                <NumberInput
                  min={TYPE_BASE_RANGE_PX.min}
                  max={TYPE_BASE_RANGE_PX.max}
                  step={0.5}
                  value={typeBase}
                  suffix="px"
                  onChange={(value) => setOverride('type', 'base', value, TYPE_BASE_PX)}
                />
              </FormField>
              <FormField
                label={withBase(
                  'Step between sizes',
                  overrides?.type?.ratio !== undefined,
                  String(TYPE_RATIO[draft.system.axes.density]),
                )}
                description="Spreads the sizes around the body size. Smaller keeps headings close to the text; larger makes titles announce. Page titles keep a minimum spread of their own."
              >
                <Slider
                  min={1.125}
                  max={1.4}
                  step={0.005}
                  value={overrides?.type?.ratio ?? TYPE_RATIO[draft.system.axes.density]}
                  showValue
                  formatValue={(value) => value.toFixed(3)}
                  onChange={(value) =>
                    setOverride('type', 'ratio', value, TYPE_RATIO[draft.system.axes.density])
                  }
                />
              </FormField>
              <Grid columns={2} gap={4}>
                <FormField
                  label={withBase(
                    'Working size',
                    overrides?.type?.sm !== undefined,
                    `${derivedSm}px`,
                  )}
                  description="Controls, table cells, menus and labels. May equal the body size."
                >
                  <NumberInput
                    min={TYPE_STEP_FLOOR_PX}
                    max={TYPE_BASE_RANGE_PX.max}
                    step={0.5}
                    value={overrides?.type?.sm ?? derivedSm}
                    suffix="px"
                    onChange={(value) => setOverride('type', 'sm', value, derivedSm)}
                  />
                </FormField>
                <FormField
                  label={withBase(
                    'Small size',
                    overrides?.type?.xs !== undefined,
                    `${derivedXs}px`,
                  )}
                  description="Captions, badges and table headers. At or under the working size."
                >
                  <NumberInput
                    min={TYPE_STEP_FLOOR_PX}
                    max={TYPE_BASE_RANGE_PX.max}
                    step={0.5}
                    value={overrides?.type?.xs ?? derivedXs}
                    suffix="px"
                    onChange={(value) => setOverride('type', 'xs', value, derivedXs)}
                  />
                </FormField>
              </Grid>
              <Heading level={3}>Where the scales apply</Heading>
              <Text tone="secondary">
                Groups of components share one pick from the scales above. Change a pick and every
                component in that group updates together — the numbers themselves stay whatever you
                set them to be.
              </Text>
              <Grid columns={3} gap={4}>
                {RADIUS_ASSIGNMENT_CLASSES.map((cls) => (
                  <FormField
                    key={cls}
                    label={withBase(
                      `Corners — ${RADIUS_CLASS_LABEL[cls] ?? cls}`,
                      overrides?.assign?.radius?.[cls] !== undefined,
                      RADIUS_STEP_LABEL[RADIUS_ASSIGNMENT_DEFAULT[cls]] ??
                        RADIUS_ASSIGNMENT_DEFAULT[cls],
                    )}
                  >
                    <Select
                      options={RADIUS_STEP_OPTIONS}
                      value={overrides?.assign?.radius?.[cls] ?? RADIUS_ASSIGNMENT_DEFAULT[cls]}
                      onChange={(value) => {
                        if (value !== null)
                          setAssignment('radius', cls, value, RADIUS_ASSIGNMENT_DEFAULT[cls])
                      }}
                    />
                  </FormField>
                ))}
              </Grid>
              <Grid columns={3} gap={4}>
                {SHADOW_ASSIGNMENT_CLASSES.map((cls) => (
                  <FormField
                    key={cls}
                    label={withBase(
                      `Shadows — ${SHADOW_CLASS_LABEL[cls] ?? cls}`,
                      overrides?.assign?.shadow?.[cls] !== undefined,
                      SHADOW_STEP_LABEL[SHADOW_ASSIGNMENT_DEFAULT[cls]] ??
                        SHADOW_ASSIGNMENT_DEFAULT[cls],
                    )}
                  >
                    <Select
                      options={SHADOW_STEP_OPTIONS}
                      value={overrides?.assign?.shadow?.[cls] ?? SHADOW_ASSIGNMENT_DEFAULT[cls]}
                      onChange={(value) => {
                        if (value !== null)
                          setAssignment('shadow', cls, value, SHADOW_ASSIGNMENT_DEFAULT[cls])
                      }}
                    />
                  </FormField>
                ))}
              </Grid>
              <Grid columns={3} gap={4}>
                {INSET_ASSIGNMENT_CLASSES.map((cls) => (
                  <FormField
                    key={cls}
                    label={withBase(
                      `Padding — ${INSET_CLASS_LABEL[cls] ?? cls}`,
                      overrides?.assign?.inset?.[cls] !== undefined,
                      `step ${INSET_ASSIGNMENT_DEFAULT[cls]}`,
                    )}
                  >
                    <Select
                      options={SPACE_STEP_OPTIONS}
                      value={String(
                        overrides?.assign?.inset?.[cls] ?? INSET_ASSIGNMENT_DEFAULT[cls],
                      )}
                      onChange={(value) => {
                        if (value !== null)
                          setAssignment('inset', cls, Number(value), INSET_ASSIGNMENT_DEFAULT[cls])
                      }}
                    />
                  </FormField>
                ))}
              </Grid>
              {amendments.length > 0 || exceptions.length > 0 ? (
                <Stack gap={2}>
                  <Heading level={3}>What your tweaks changed</Heading>
                  <Text tone="secondary" size="sm">
                    Every token your amendments moved, measured on the stylesheet the engine
                    actually writes — before and after.
                  </Text>
                  {amendments.map((amendment) => (
                    <Text key={amendment.token} size="sm" tone="secondary">
                      <Code>{amendment.token}</Code>: {amendment.base} &rarr; {amendment.now}
                    </Text>
                  ))}
                  {exceptions.map((exception) => (
                    <Text
                      key={`x-${exception.component}/${exception.family}/${exception.class}`}
                      size="sm"
                      tone="secondary"
                    >
                      <Code>{`--pm-${exception.family}-${exception.class}`}</Code> (
                      {exception.component} only) &rarr;{' '}
                      {exception.family === 'inset'
                        ? `var(--pm-space-${exception.step})`
                        : `var(--pm-${exception.family}-${exception.step})`}
                    </Text>
                  ))}
                </Stack>
              ) : null}
              {anyAmended ? (
                <Inline gap={3} align="center">
                  <Button
                    variant="outline"
                    tone="neutral"
                    icon="refresh"
                    label="Reset all tweaks"
                    onClick={() =>
                      updateDraft((current) => {
                        const { overrides: _dropped, ...system } = current.system
                        return { ...current, system }
                      })
                    }
                  />
                  <Text size="sm" tone="secondary">
                    Zero, square and fully-round never move — they mean something, they don&rsquo;t
                    measure something.
                  </Text>
                </Inline>
              ) : null}
            </Stack>
          </Card>

          <ExceptionsCard exceptions={exceptions} preselect={memberPreselect} />

          <Card>
            <Stack gap={4}>
              <Heading>Seeds</Heading>
              <Text tone="secondary">
                The colour voice. A palette belongs to no system — every seed below is lawful on
                every set of axes above.
              </Text>

              <FormField label="Accent hue" description="OKLCH hue angle.">
                <Slider
                  min={0}
                  max={360}
                  value={draft.palette.accentHue}
                  showValue
                  formatValue={degreeLabel}
                  onChange={(accentHue) => setSeed({ accentHue })}
                />
              </FormField>

              <Switch
                checked={draft.palette.gradientHue !== undefined}
                label="Seed a partner hue"
                onCheckedChange={(on) =>
                  setSeed({ gradientHue: on ? (draft.palette.accentHue + 40) % 360 : undefined })
                }
              />

              {draft.palette.gradientHue === undefined ? (
                <Text size="sm" tone="secondary">
                  No partner hue: every gradient role resolves to its own solid, which is the no-op
                  form rather than a degraded one.
                </Text>
              ) : (
                <FormField label="Gradient hue" description="The hue the gradient roles run to.">
                  <Slider
                    min={0}
                    max={360}
                    value={draft.palette.gradientHue}
                    showValue
                    formatValue={degreeLabel}
                    onChange={(gradientHue) => setSeed({ gradientHue })}
                  />
                </FormField>
              )}

              <FormField
                label="Neutral tint"
                description="Chroma mixed into the neutral ramp. Past the ceiling, neutral stops reading as neutral."
              >
                <Slider
                  min={0}
                  max={MAX_NEUTRAL_TINT}
                  step={0.001}
                  value={draft.palette.neutralTint}
                  showValue
                  formatValue={tintLabel}
                  onChange={(neutralTint) => setSeed({ neutralTint })}
                />
              </FormField>

              <FormField label="Chroma budget" description="How loud the accent is allowed to be.">
                <Select
                  options={CHROMA_OPTIONS}
                  value={draft.palette.chromaBudget}
                  onChange={(value) => {
                    if (value !== null) setSeed({ chromaBudget: value as ChromaBudget })
                  }}
                />
              </FormField>
            </Stack>
          </Card>

          <Card>
            <Stack gap={4}>
              <Heading>Type</Heading>
              <Text tone="secondary">
                Fonts are system, never palette — a serif display is personality, not paint. The
                list is the families this app loads, so a draft can only choose type that renders.
              </Text>
              {FONT_ROLES.map((role) => (
                <FormField key={role} label={role}>
                  <Select
                    options={FAMILY_OPTIONS}
                    value={draft.system.fonts[role].family}
                    onChange={(family) => {
                      if (family !== null) setFont(role, family)
                    }}
                  />
                </FormField>
              ))}
            </Stack>
          </Card>

          <Card>
            <Stack gap={4}>
              <Heading>Where it lands</Heading>
              <Text tone="secondary">
                Saving writes two files and nothing else. From there it is the repository&rsquo;s
                own machinery — discovery, the law suite, the churn proof.
              </Text>
              <FormField
                label="System name"
                description={SYSTEM_PATH_HINT}
                error={systemNameError ?? undefined}
              >
                <Input value={systemName} onChange={setSystemName} />
              </FormField>
              <FormField
                label="Palette name"
                description={PALETTE_PATH_HINT}
                error={paletteNameError ?? undefined}
              >
                <Input value={paletteName} onChange={setPaletteName} />
              </FormField>
              <Text size="sm" tone="secondary">
                {amends
                  ? 'One of these names is already on disk — saving asks before it amends the file.'
                  : 'Both names are new, so saving creates two files.'}
              </Text>
            </Stack>
          </Card>

          <Card>
            <Stack gap={4}>
              <Heading>Import a proposal</Heading>
              <Text tone="secondary">
                Paste what a <Code>propose_theme</Code> call returned, or the pair the copy button
                gives. Importing populates the controls and previews it exactly as a hand edit does;
                the schemas that validate a shipped file validate this one.
              </Text>
              <FormField
                label="Proposal JSON"
                description="An object with a system and a palette. Anything else in it is ignored."
                error={importError ?? undefined}
              >
                <Textarea rows={6} value={paste} onChange={setPaste} />
              </FormField>
              <Inline gap={3} wrap>
                <Button
                  variant="outline"
                  tone="accent"
                  label="Load into the controls"
                  onClick={applyPaste}
                />
                <Button
                  variant="ghost"
                  tone="neutral"
                  label="Fill from the current draft"
                  onClick={() => {
                    setPaste(pairJson)
                    setImportError(null)
                  }}
                />
              </Inline>
            </Stack>
          </Card>

          <Card>
            <Stack gap={4}>
              <Heading>Share</Heading>
              <Text tone="secondary">
                Saving lands the decision in this repo; sharing hands it to someone else&rsquo;s.
                The handoff says every decision with its reason, the exact command a developer runs,
                and the loop an agent follows — and the stylesheet ships as an inspection copy,
                never something to paste into a codebase: products emit from the JSON at runtime, so
                the sheet re-derives when a decision changes.
              </Text>
              <Inline gap={3} wrap>
                <Button
                  variant="outline"
                  tone="accent"
                  icon="download"
                  label="Handoff (.md)"
                  disabled={!lawful || !nameable}
                  onClick={() =>
                    download(
                      `${systemName}-${paletteName}-handoff.md`,
                      renderHandoff(draft, systemName, paletteName),
                      'text/markdown',
                    )
                  }
                />
                <Button
                  variant="outline"
                  tone="neutral"
                  icon="download"
                  label="The pair (.json)"
                  disabled={!nameable}
                  onClick={() =>
                    download(`${systemName}-${paletteName}.json`, pairJson, 'application/json')
                  }
                />
                <Button
                  variant="outline"
                  tone="neutral"
                  icon="download"
                  label="Stylesheet (.css)"
                  disabled={!lawful || !nameable}
                  onClick={() =>
                    download(
                      `${systemName}-${paletteName}.css`,
                      renderThemeCSS(draft, systemName, paletteName),
                      'text/css',
                    )
                  }
                />
              </Inline>
              <Text size="sm" tone="secondary">
                An unlawful draft shares nothing but its JSON — the law panel holds the reasons, and
                a handoff that shipped them would be handing off the argument.
              </Text>
            </Stack>
          </Card>
        </Stack>

        <Stack gap={5}>
          <Heading>Preview</Heading>
          <Text tone="secondary">
            Real screens, inside the draft&rsquo;s own scope. Both modes at once, because a pairing
            that only works in one of them is half a pairing.
          </Text>
          {/* One pairing scope, with the modes nested inside it as plain attributes. The emitter
              writes a descendant block for this nested-scope form. The components below do not
              know the theme changed. */}
          <div data-system={DRAFT_SYSTEM} data-palette={DRAFT_PALETTE}>
            <Stack gap={5}>
              {MODES.map((mode) => (
                <PreviewPane key={mode} mode={mode} />
              ))}
            </Stack>
          </div>
          <Text size="sm" tone="secondary">
            New to the workbench? The <Link href="/overview">overview</Link> explains the instrument
            this studio is part of.
          </Text>
        </Stack>
      </Grid>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
        title="Amend a file that already exists?"
        description={`This overwrites ${(confirming ?? []).join(' and ')}. Every product wearing that name changes with it.`}
        confirmLabel="Overwrite"
        onConfirm={async () => {
          setConfirming(null)
          await send(true)
        }}
      />

      <ConfirmDialog
        open={confirmingDiscard}
        onOpenChange={setConfirmingDiscard}
        title="Discard the draft?"
        description="Every tweak in this studio session — and the saved work-in-progress it restores from — is thrown away. Files already saved to design/ are not touched."
        confirmLabel="Discard"
        onConfirm={() => {
          setConfirmingDiscard(false)
          discardDraft()
        }}
      />
    </Stack>
  )
}

const SYSTEM_PATH_HINT = 'design/systems/<name>.json — kebab-case, like every other name here.'
const PALETTE_PATH_HINT = 'design/palettes/<name>.json — kebab-case, like every other name here.'

/**
 * The laws' findings, in the laws' wording.
 *
 * It prints the engine's messages verbatim and adds no wording of its own. A lawful draft shows a
 * count of measured pairings rather than a generic success message, so the result is backed by a
 * number.
 */
function LawPanel({ faults, checked }: { faults: readonly string[]; checked: number }) {
  if (faults.length === 0) {
    return (
      <Alert tone="success" title="Lawful">
        {`Coherence holds over the derived tokens, and ${checked} contrast pairings were measured against the emitted values across both modes.`}
      </Alert>
    )
  }

  return (
    <Alert
      tone="danger"
      title={faults.length === 1 ? 'A law refused this draft' : 'The laws refused this draft'}
    >
      <Stack as="ul" gap={2}>
        {faults.map((fault) => (
          <li key={fault}>{fault}</li>
        ))}
      </Stack>
    </Alert>
  )
}

/**
 * One mode's pane, showing real screens rather than swatches.
 *
 * A swatch grid shows that the ramp resolved. It does not show whether a card is legible, whether
 * a table's rows are distinct, or whether a form's primary action still stands out. `/tokens`
 * shows the values. This pane shows the product.
 *
 * The auth card is built here rather than taken from the `AuthPage` archetype, for the same
 * reason Relay replaces the harness. The archetype is a whole page with its own `<main>` and its
 * own `<h1>`, and nesting it here would put two of each on the page.
 */
function PreviewPane({ mode }: { mode: Mode }) {
  return (
    <div data-mode={mode}>
      <Card>
        <Stack gap={5}>
          <Inline gap={3} align="center" justify="between">
            <Badge variant="solid" tone="accent">
              {mode}
            </Badge>
            <Switch defaultChecked label="Live" />
          </Inline>

          <Inline gap={3} wrap>
            <Button variant="solid" tone="accent" size="sm" label="Primary" />
            <Button variant="soft" tone="accent" size="sm" label="Soft" />
            <Button variant="outline" tone="neutral" size="sm" label="Quiet" />
            <Button variant="ghost" tone="danger" size="sm" label="Delete" />
            <Badge tone="success">Resolved</Badge>
            <Badge variant="outline" tone="warning">
              Waiting
            </Badge>
          </Inline>

          <Card>
            <Stack gap={4}>
              <Heading level={3}>Sign in</Heading>
              <FormField label="Email">
                <Input type="email" defaultValue="ada@example.com" />
              </FormField>
              <FormField label="Password">
                <Input type="password" defaultValue="a passphrase" />
              </FormField>
              <Button variant="solid" tone="accent" label="Continue" />
              <Link href="#reset">Forgot your password?</Link>
            </Stack>
          </Card>

          <Table label={`Inbox specimen, ${mode}`}>
            <Table.Head>
              <Table.Row>
                <Table.Header>Ticket</Table.Header>
                <Table.Header>Requester</Table.Header>
                <Table.Header>Status</Table.Header>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {INBOX.map((row) => (
                <Table.Row key={row.subject}>
                  <Table.Cell>{row.subject}</Table.Cell>
                  <Table.Cell>{row.requester}</Table.Cell>
                  <Table.Cell>
                    <Badge tone={row.tone}>{row.status}</Badge>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Stack>
      </Card>
    </div>
  )
}

/** Three rows are enough to show row separation, alternation and a tone in a cell. */
const INBOX = [
  {
    subject: 'Export fails past ten thousand rows',
    requester: 'Ada Lovelace',
    status: 'open',
    tone: 'danger',
  },
  { subject: 'SSO group mapping', requester: 'Grace Hopper', status: 'pending', tone: 'warning' },
  { subject: 'Invoice PDF is blank', requester: 'Alan Turing', status: 'closed', tone: 'success' },
] as const
