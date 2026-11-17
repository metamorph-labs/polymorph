import { hasTexture, type Axes } from './axes'
import type { NonColorTokens } from './tokens'

/**
 * Axis coherence: which combinations are lawful.
 *
 * The contrast law checks one pairing and the schema one axis at a time.
 * Neither catches values that are each legal but contradict each other: a flat
 * system with a shadowed card breaks no single rule, but `flat` no longer
 * means anything.
 *
 * These constrain **derived tokens**, not axes, because any axis combination
 * can be written and the derivation must make each one consistent. The
 * coherence law in `laws.test.ts` checks every combination.
 */

export interface CoherenceViolation {
  /** Short, searchable name of the constraint. */
  rule: string
  detail: string
}

/**
 * The constraints, as data. Each is a disputable design claim, so each carries
 * its own explanation, not just an `if`.
 */
export function auditCoherence(axes: Axes, tokens: NonColorTokens): CoherenceViolation[] {
  const violations: CoherenceViolation[] = []
  const fail = (rule: string, detail: string) => violations.push({ rule, detail })

  if (axes.depth === 'flat') {
    // Flat forbids resting elevation.
    for (const step of ['control', 'raised'] as const) {
      if (tokens.shadow[step] !== 'none') {
        fail(
          'flat-forbids-resting-elevation',
          `depth: flat derived shadow.${step} = "${tokens.shadow[step]}". A flat system separates ` +
            'resting surfaces with borders; a shadow there is a second, competing signal.',
        )
      }
    }

    // Flat still gives overlays a shadow, or a menu blends into the page.
    if (tokens.shadow.overlay === 'none') {
      fail(
        'flat-still-detaches-transients',
        'depth: flat derived shadow.overlay = "none". A transient surface is in *front of* the ' +
          'page rather than resting on it, and a flat system still has to say so.',
      )
    }

    if (tokens.insetTop !== 'none') {
      fail(
        'flat-has-no-light-source',
        `depth: flat derived insetTop = "${tokens.insetTop}". A system that has renounced shadow ` +
          'has renounced the light that would cast one.',
      )
    }
  }

  // Material is gated on depth, like texture on ornament. An opaque glass pane
  // makes `glass` meaningless, and a blurring solid system has a material its
  // axis did not choose.
  const material = tokens.material.blur !== '0px' || tokens.material.saturate !== '1'
  if (material !== (axes.depth === 'glass')) {
    fail(
      'material-is-gated-on-depth',
      `depth: ${axes.depth} derived material of blur ${tokens.material.blur}, saturate ` +
        `${tokens.material.saturate} — ` +
        `${material ? 'material on a solid system' : 'an inert material on glass'}, ` +
        'which is the opposite of what the axis permits.',
    )
  }

  // A glass pane still casts a shadow, because a translucent edge cannot be
  // guaranteed visible over an unknown backdrop.
  if (axes.depth === 'glass' && tokens.shadow.overlay === 'none') {
    fail(
      'glass-still-casts',
      'depth: glass derived shadow.overlay = "none". Material separates a resting pane; a ' +
        'transient one is in front of the page and still has to say so.',
    )
  }

  if (axes.ornament === 'none') {
    for (const step of ['focus', 'hover'] as const) {
      if (tokens.glow[step] !== 'none') {
        fail(
          'no-ornament-no-decoration',
          `ornament: none derived glow.${step} = "${tokens.glow[step]}". A glow is decoration, and ` +
            'this system permits none.',
        )
      }
    }
  }

  // Texture is gated on ornament by the derivation, not by recipes. Both modes
  // are checked, because a texture in only one mode is a defect.
  for (const mode of ['light', 'dark'] as const) {
    const textured = tokens.texture.page[mode] !== 'none'
    if (textured !== hasTexture(axes.ornament)) {
      fail(
        'texture-is-gated-on-ornament',
        `ornament: ${axes.ornament} derived a ${mode} page texture of ` +
          `"${textured ? 'a pattern' : 'none'}", which is the opposite of what the axis permits.`,
      )
    }
  }

  for (const [temperament, motion] of Object.entries(tokens.motion)) {
    if (temperament === 'none') {
      // `none` means no motion, including stagger, because a delay is motion.
      const moving = Object.entries(motion.duration)
        .filter(([, value]) => !/^0m?s$/.test(value))
        .map(([role]) => role)
      if (moving.length > 0) {
        fail('none-means-none', `motion "none" derived non-zero durations: ${moving.join(', ')}.`)
      }
      if (!/^0m?s$/.test(motion.stagger.step) || !/^0m?s$/.test(motion.stagger.max)) {
        fail(
          'none-means-none',
          `motion "none" derived a stagger of ${motion.stagger.step}/${motion.stagger.max}.`,
        )
      }
    }

    // `overshoot` equals `standard` except under `expressive`, so a recipe can
    // always use it.
    if (temperament !== 'expressive' && motion.easing.overshoot !== motion.easing.standard) {
      fail(
        'overshoot-only-where-expressive',
        `motion "${temperament}" derived an overshoot easing distinct from standard.`,
      )
    }
  }

  return violations
}

/** One line per failure: `flat-forbids-resting-elevation: depth: flat derived …`. */
export function coherenceMessage(violation: CoherenceViolation): string {
  return `${violation.rule}: ${violation.detail}`
}
