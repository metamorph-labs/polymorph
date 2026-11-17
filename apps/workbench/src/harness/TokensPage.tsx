import {
  auditChartPalette,
  auditGradientPairings,
  auditPairings,
  axisFlagName,
  AXIS_NAMES,
  CHART_ROLES,
  CHART_SLOTS,
  chartSlotRole,
  COLOR_ROLE_GROUPS,
  DISPLAY_STEPS,
  EXPOSED_AXES,
  generateRamps,
  GLOW_STEPS,
  GRADIENT_ROLES,
  gradientPairingId,
  ICON_SIZES,
  pairingId,
  pairingsInvolving,
  type ChartAudit,
  type ChartRole,
  RADIUS_STEPS,
  RAMP_NAMES,
  RAMP_SEMANTICS,
  RAMP_STEPS,
  SHADOW_STEPS,
  SPACE_STEPS,
  SPRING_ROLES,
  TEXT_STEPS,
  TEXTURE_MAX_DELTA_L,
  toHex,
  type ColorRole,
  type ColorRoleGroup,
  type PairingResult,
  type ResolvedTheme,
  type TextStep,
} from '@polymorph/react'
import { Heading } from '@polymorph/react-ui'
import { useMemo, type ReactNode } from 'react'

import { findPairing } from '../themes'
import styles from './TokensPage.module.css'
import { useThemeAttributes } from './useThemeAttributes'

/**
 * The token gallery. It shows everything the engine derives on one page, under the scope the
 * toolbar has selected. A designer can then review a pairing and correct its taste constants
 * visually instead of reading hex codes from a test.
 */
export function TokensPage() {
  const attributes = useThemeAttributes()
  const theme = findPairing(attributes.system, attributes.palette)
  const mode = attributes.mode
  const density = attributes.density ?? theme.axes.density
  const temperament = attributes.motion ?? theme.axes.motionTemperament

  const colors = theme.color[mode]
  const chart = theme.chart[mode]
  const results = useMemo(() => {
    const byId = new Map<string, PairingResult>()
    for (const result of auditPairings(colors)) byId.set(pairingId(result.pairing), result)
    return byId
  }, [colors])
  const chartAudit = useMemo(() => auditChartPalette(mode, chart, colors), [mode, chart, colors])
  const ramps = useMemo(() => generateRamps(theme.seeds, mode), [theme.seeds, mode])
  const gradientResults = useMemo(
    () => auditGradientPairings(colors, theme.gradient[mode]),
    [colors, theme.gradient, mode],
  )

  const failures = [...results.values()].filter((result) => !result.passes)

  return (
    <div className={styles.page}>
      <Summary theme={theme} scope={`${mode} · ${density} · motion ${temperament}`} />

      <Section
        title="Contrast law"
        note={`${results.size} lawful pairings checked against the emitted values`}
      >
        <p className={failures.length === 0 ? styles.lawPass : styles.lawFail}>
          {failures.length === 0
            ? 'All pairings pass.'
            : `${failures.length} failing: ${failures.map((f) => pairingId(f.pairing)).join(', ')}`}
        </p>
      </Section>

      <Section title="Ramps" note="12 OKLCH steps per ramp, gamut-mapped to sRGB">
        {RAMP_NAMES.map((name) => (
          <div key={name} className={styles.rampRow}>
            <span className={styles.rampName}>{name}</span>
            <div className={styles.ramp}>
              {RAMP_STEPS.map((step) => (
                <div
                  key={step}
                  className={styles.rampStep}
                  style={{ background: toHex(ramps[name][step]) }}
                  title={`${name} ${step} — ${RAMP_SEMANTICS[step]} — ${toHex(ramps[name][step])}`}
                >
                  <span className={styles.rampStepLabel}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Section>

      {(Object.keys(COLOR_ROLE_GROUPS) as ColorRoleGroup[]).map((group) => (
        <Section key={group} title={`Colour · ${group}`}>
          <div className={styles.swatchGrid}>
            {COLOR_ROLE_GROUPS[group].map((role) => (
              <Swatch key={role} role={role} value={colors[role]} results={results} />
            ))}
          </div>
        </Section>
      ))}

      {/* The chart family. It shows its own measurements rather than the contrast law's,
          because different checks apply: adjacent separation under CVD, a chroma floor, and a
          3:1 mark ratio that is a soft limit by design. */}
      <Section
        title="Colour · chart"
        note={
          chartAudit.failures.length === 0
            ? `worst adjacent pair: ΔE ${chartAudit.worstAdjacentNormal.normal.toFixed(1)} normal · ` +
              `${chartAudit.worstAdjacentCvd.cvd.toFixed(1)} under CVD · any-neighbour cap ${chartAudit.allPairsCap} series`
            : `FAILING: ${chartAudit.failures.join('; ')}`
        }
      >
        <div className={styles.swatchGrid}>
          {CHART_ROLES.map((role) => (
            <ChartSwatch key={role} role={role} value={chart[role]} audit={chartAudit} />
          ))}
        </div>
      </Section>

      <Section title="Type" note="Rendered at the emitted size, in the theme's own families">
        {TEXT_STEPS.map((step) => (
          <TypeRow key={step} theme={theme} scale="text" step={step} />
        ))}
        {DISPLAY_STEPS.map((step) => (
          <TypeRow key={step} theme={theme} scale="display" step={step} />
        ))}
      </Section>

      <Section title="Space" note={`density: ${density}`}>
        {SPACE_STEPS.map((step) => {
          const value = theme.tokens.density[density].space[step]
          return (
            <div key={step} className={styles.spaceRow}>
              <span className={styles.tokenName}>space.{step}</span>
              <span className={styles.spaceBar} style={{ width: value }} />
              <span className={styles.tokenValue}>{value}</span>
            </div>
          )
        })}
        <div className={styles.inlineValues}>
          {(['sm', 'md', 'lg'] as const).map((size) => (
            <span key={size} className={styles.tokenValue}>
              control {size}: {theme.tokens.density[density].controlHeight[size]}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Radius" note={`geometry: ${theme.axes.geometry}`}>
        <div className={styles.specimenRow}>
          {RADIUS_STEPS.map((step) => (
            <div key={step} className={styles.specimen}>
              <div
                className={styles.radiusChip}
                style={{ borderRadius: theme.tokens.radius[step] }}
              />
              <span className={styles.tokenName}>radius.{step}</span>
              <span className={styles.tokenValue}>{theme.tokens.radius[step]}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Elevation" note={`depth: ${theme.axes.depth}`}>
        <div className={styles.specimenRow}>
          {SHADOW_STEPS.map((step) => (
            <div key={step} className={styles.specimen}>
              <div className={styles.shadowChip} style={{ boxShadow: theme.tokens.shadow[step] }} />
              <span className={styles.tokenName}>shadow.{step}</span>
              <span className={styles.tokenValue}>{theme.tokens.shadow[step]}</span>
            </div>
          ))}
          <div className={styles.specimen}>
            <div className={styles.shadowChip} style={{ boxShadow: theme.tokens.insetTop }} />
            <span className={styles.tokenName}>shadow.inset-top</span>
            <span className={styles.tokenValue}>{theme.tokens.insetTop}</span>
          </div>
        </div>
      </Section>

      {/* The law treats glow as decorative. It is shown next to the ring so the difference
          between a halo and a focus indicator is visible. */}
      <Section
        title="Glow"
        note={`ornament: ${theme.axes.ornament} — decorative; never a focus ring`}
      >
        <div className={styles.specimenRow}>
          {GLOW_STEPS.map((step) => (
            <div key={step} className={styles.specimen}>
              <div className={styles.shadowChip} style={{ boxShadow: theme.tokens.glow[step] }} />
              <span className={styles.tokenName}>glow.{step}</span>
              <span className={styles.tokenValue}>{theme.tokens.glow[step]}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Both stops are shown, because the contrast law measures the worse of the two and a
          single swatch would hide which one that is. */}
      <Section
        title="Gradients"
        note={
          theme.seeds.gradientHue === undefined
            ? 'no partner hue seeded — every role resolves to its own solid'
            : `partner hue ${theme.seeds.gradientHue}°`
        }
      >
        <div className={styles.specimenRow}>
          {GRADIENT_ROLES.map((role) => {
            const value = theme.gradient[mode][role]
            return (
              <div key={role} className={styles.specimen}>
                <div className={styles.gradientChip} style={{ background: value.css }} />
                <span className={styles.tokenName}>{role}</span>
                <span className={styles.tokenValue}>
                  {value.solid ? `solid ${value.from}` : `${value.from} → ${value.to}`}
                </span>
              </div>
            )
          })}
        </div>
        <div className={styles.valueGrid}>
          {gradientResults.map((result) => (
            <ValueRow
              key={gradientPairingId(result.pairing)}
              name={gradientPairingId(result.pairing)}
              value={`Lc ${result.lc.toFixed(1)} / ${result.pairing.minLc} — worst stop '${result.worstStop}'${
                result.passes ? '' : ' — FAILS'
              }`}
            />
          ))}
        </div>
      </Section>

      {/* The page texture, at the size it actually tiles. */}
      <Section
        title="Texture"
        note={
          theme.tokens.texture.page[mode] === 'none'
            ? `ornament: ${theme.axes.ornament} — no page texture`
            : `ornament: ${theme.axes.ornament} — bounded at ΔL ${TEXTURE_MAX_DELTA_L}`
        }
      >
        <div className={styles.specimenRow}>
          <div className={styles.specimen}>
            <div
              className={styles.textureChip}
              style={{ backgroundImage: theme.tokens.texture.page[mode] }}
            />
            <span className={styles.tokenName}>texture.page</span>
            <span className={styles.tokenValue}>
              {theme.tokens.texture.page[mode] === 'none' ? 'none' : 'data-URI SVG'}
            </span>
          </div>
        </div>
      </Section>

      {/* Shell region colours. Values are role references, so the contrast law still covers
          what each region shows. */}
      <Section
        title="Shell regions"
        note="pattern-scoped; read by the AppShell and ListPage archetypes"
      >
        <div className={styles.valueGrid}>
          <ValueRow name="shell.topbar.bg" value={theme.tokens.shell.topbarBg} />
          <ValueRow name="shell.rail.bg" value={theme.tokens.shell.railBg} />
          <ValueRow name="shell.topbar.border" value={theme.tokens.shell.topbarBorder} />
          <ValueRow name="shell.rail.border" value={theme.tokens.shell.railBorder} />
        </div>
      </Section>

      {/* The only flags a recipe may branch on. A recipe never knows which house system it is
          in. */}
      <Section
        title="Exposed axes"
        note="branch on these with @container style(); never on a theme"
      >
        <div className={styles.valueGrid}>
          {EXPOSED_AXES.map((axis) => (
            <ValueRow key={axis} name={axisFlagName(axis)} value={theme.axes[axis]} />
          ))}
        </div>
      </Section>

      <Section title="Focus & icons">
        <div className={styles.specimenRow}>
          <div className={styles.specimen}>
            <button type="button" className={styles.focusTarget}>
              Tab to me
            </button>
            <span className={styles.tokenValue}>
              width {theme.tokens.focus.width} · offset {theme.tokens.focus.offset}
            </span>
          </div>
          {/* Stroke is set per size (compensated, anchored at md), so each specimen applies and
              reports its own stroke. There is one row per size and no single stroke value to
              print. */}
          {ICON_SIZES.map((size) => (
            <div key={size} className={styles.specimen}>
              <span
                className={styles.iconChip}
                style={{
                  width: theme.tokens.icon.size[size],
                  height: theme.tokens.icon.size[size],
                  borderWidth: `${theme.tokens.icon.stroke[size]}px`,
                }}
              />
              <span className={styles.tokenName}>icon.{size}</span>
              <span className={styles.tokenValue}>
                {theme.tokens.icon.size[size]} · stroke {theme.tokens.icon.stroke[size]}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Motion" note={`temperament: ${temperament}`}>
        <div className={styles.valueGrid}>
          {Object.entries(theme.tokens.motion[temperament].duration).map(([role, value]) => (
            <ValueRow key={role} name={`motion.duration.${role}`} value={value} />
          ))}
          {Object.entries(theme.tokens.motion[temperament].easing).map(([role, value]) => (
            <ValueRow key={role} name={`motion.easing.${role}`} value={value} />
          ))}
          {SPRING_ROLES.map((role) => {
            const spring = theme.tokens.motion[temperament].spring[role]
            return (
              <ValueRow
                key={role}
                name={`motion.spring.${role}`}
                value={`stiffness ${spring.stiffness} · damping ${spring.damping} · mass ${spring.mass}`}
              />
            )
          })}
          <ValueRow name="motion.press-scale" value={theme.tokens.motion[temperament].pressScale} />
          {Object.entries(theme.tokens.motion[temperament].ambient).map(([role, value]) => (
            <ValueRow key={role} name={`motion.ambient.${role}`} value={value} />
          ))}
          <ValueRow
            name="motion.stagger"
            value={`step ${theme.tokens.motion[temperament].stagger.step} · max ${theme.tokens.motion[temperament].stagger.max}`}
          />
        </div>
      </Section>
    </div>
  )
}

function Summary({ theme, scope }: { theme: ResolvedTheme; scope: string }) {
  return (
    <section className={styles.summary}>
      <h1 className={styles.title}>{theme.name}</h1>
      <p className={styles.scope}>{scope}</p>
      <dl className={styles.axisList}>
        {AXIS_NAMES.map((axis) => (
          <div key={axis} className={styles.axis}>
            <dt className={styles.tokenName}>{axis}</dt>
            <dd className={styles.tokenValue}>{theme.axes[axis]}</dd>
          </div>
        ))}
        <div className={styles.axis}>
          <dt className={styles.tokenName}>seeds</dt>
          <dd className={styles.tokenValue}>
            hue {theme.seeds.accentHue} · tint {theme.seeds.neutralTint} · chroma{' '}
            {theme.seeds.chromaBudget}
          </dd>
        </div>
      </dl>
    </section>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <Heading>{title}</Heading>
      {note ? <p className={styles.sectionNote}>{note}</p> : null}
      {children}
    </section>
  )
}

function Swatch({
  role,
  value,
  results,
}: {
  role: ColorRole
  value: string
  results: Map<string, PairingResult>
}) {
  const checks = pairingsInvolving(role)
    .map((pairing) => results.get(pairingId(pairing)))
    .filter((result): result is PairingResult => result !== undefined)

  return (
    <div className={styles.swatch}>
      <div className={styles.chip} style={{ background: value }} />
      <span className={styles.tokenName}>{role}</span>
      <span className={styles.tokenValue}>{value}</span>
      {checks.length > 0 ? (
        <ul className={styles.checks}>
          {checks.map((check) => (
            <li
              key={pairingId(check.pairing)}
              className={check.passes ? styles.checkPass : styles.checkFail}
            >
              {check.pairing.foreground === role
                ? `on ${check.pairing.background}`
                : `${check.pairing.foreground} on this`}
              {` — Lc ${check.lc.toFixed(1)} / ${check.pairing.minLc}`}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/**
 * A chart swatch shows the measurements that apply to a series colour: its separation from the
 * adjacent slot, for normal vision and simulated CVD, and its mark ratio on the surface. A band
 * WARN and a relief slot below 3:1 are printed as findings, not failures, because
 * `docs/charts.md` defines both gates as soft: recorded, never failed.
 */
function ChartSwatch({
  role,
  value,
  audit,
}: {
  role: ChartRole
  value: string
  audit: ChartAudit
}) {
  const slot = CHART_SLOTS.find((candidate) => chartSlotRole(candidate) === role)
  const measurement = slot === undefined ? undefined : audit.slots[slot - 1]
  const neighbour = slot === undefined ? undefined : audit.adjacent[slot - 1]

  return (
    <div className={styles.swatch}>
      <div className={styles.chip} style={{ background: value }} />
      <span className={styles.tokenName}>{role}</span>
      <span className={styles.tokenValue}>{value}</span>
      {measurement ? (
        <ul className={styles.checks}>
          <li className={measurement.reliefSlot ? styles.checkFail : styles.checkPass}>
            {`on surface — ${measurement.markRatio.toFixed(2)}:1${measurement.reliefSlot ? ' (relief slot)' : ''}`}
          </li>
          {neighbour ? (
            <li className={styles.checkPass}>
              {`vs slot ${slot! + 1} — ΔE ${neighbour.normal.toFixed(1)} / ${neighbour.cvd.toFixed(1)} CVD`}
            </li>
          ) : null}
          {measurement.bandWarn ? (
            <li
              className={styles.checkFail}
            >{`L ${measurement.lightness.toFixed(3)} — outside the band`}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}

function TypeRow({
  theme,
  scale,
  step,
}: {
  theme: ResolvedTheme
  scale: 'text' | 'display'
  step: string
}) {
  const style =
    scale === 'text'
      ? theme.tokens.text[step as TextStep]
      : theme.tokens.display[step as 'sm' | 'md' | 'lg']

  return (
    <div className={styles.typeRow}>
      <span className={styles.tokenName}>
        {scale}.{step}
      </span>
      <span
        className={styles.typeSpecimen}
        style={{
          fontFamily: `var(--pm-font-${style.family})`,
          fontSize: style.size,
          fontWeight: style.weight,
          lineHeight: style.lineHeight,
          letterSpacing: style.tracking,
        }}
      >
        Design decisions, made once
      </span>
      <span className={styles.tokenValue}>
        {style.size} / {style.lineHeight} / {style.weight} / {style.tracking}
      </span>
    </div>
  )
}

function ValueRow({ name, value }: { name: string; value: string }) {
  return (
    <div className={styles.valueRow}>
      <span className={styles.tokenName}>{name}</span>
      <span className={styles.tokenValue}>{value}</span>
    </div>
  )
}
