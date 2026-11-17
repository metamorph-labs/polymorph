import { ESTIMATED_AXIS_TEXT_PX, labelBaseline, MARKER_RADIUS } from './cartesian'
import { crisp, estimateTextWidth, rulePath } from './geometry'
import type { ChartAnnotation, ChartBaseline } from './types'

/**
 * Maps annotations from the app's values into px (the shared grammar,
 * `docs/charts.md`).
 *
 * **Members map values; the frame never sees scales.** A member passes its own
 * `valueAt` and `categoryAt`, closures over the scales it built. The result is
 * px-space geometry that the presentational layer draws without knowing about
 * domains. `baseline` goes through here too, as shorthand for the `line` kind,
 * so a target rule and an annotation rule always look the same.
 */

/** A rule across the plot, at a position along the value axis. */
export interface AnnotationRulePx {
  key: string
  at: number
  label?: string
}

/** A washed span of the value axis, between two positions. */
export interface AnnotationSpanPx {
  key: string
  from: number
  to: number
  label?: string
}

/** A named place on the plane. */
export interface AnnotationMarkPx {
  key: string
  x: number
  y: number
  label: string
}

export interface MappedAnnotations {
  rules: AnnotationRulePx[]
  spans: AnnotationSpanPx[]
  marks: AnnotationMarkPx[]
}

export interface MapAnnotationsInput {
  annotations: readonly ChartAnnotation[] | undefined
  /** The member's `baseline` prop, drawn as the first `line`. */
  baseline: ChartBaseline | undefined
  /** Value → px along the value axis, from the member's own scale. */
  valueAt: (value: number) => number
  /**
   * Category/time/linear x → px along the category axis, or `null` for a value
   * the axis cannot place (an unparseable date, a missing category). A point
   * with no position draws nothing, because a mark placed at an edge would show
   * a position that was never computed. This is the gap rule applied to points.
   */
  categoryAt: (x: string | number) => number | null
  /** The member's orientation; `false` is BarChart's horizontal form. */
  vertical: boolean
}

/**
 * App-space annotations (plus the baseline) as px-space geometry.
 *
 * Rules and spans stay one-dimensional: a position along the value axis. The
 * drawing layer is told which screen axis that is. Marks come out as screen
 * points with the orientation already applied. A point's `x` is a position on
 * the *category* axis and its `y` a value, whichever way those axes run.
 */
export function mapAnnotations(input: MapAnnotationsInput): MappedAnnotations {
  const { annotations, baseline, valueAt, categoryAt, vertical } = input
  const mapped: MappedAnnotations = { rules: [], spans: [], marks: [] }

  if (baseline !== undefined) {
    mapped.rules.push({
      key: 'baseline',
      at: valueAt(baseline.value),
      ...(baseline.label === undefined ? {} : { label: baseline.label }),
    })
  }

  ;(annotations ?? []).forEach((annotation, index) => {
    if (annotation.kind === 'line') {
      mapped.rules.push({
        key: `line-${index}`,
        at: valueAt(annotation.value),
        ...(annotation.label === undefined ? {} : { label: annotation.label }),
      })
      return
    }
    if (annotation.kind === 'band') {
      mapped.spans.push({
        key: `band-${index}`,
        from: valueAt(annotation.from),
        to: valueAt(annotation.to),
        ...(annotation.label === undefined ? {} : { label: annotation.label }),
      })
      return
    }
    const along = categoryAt(annotation.x)
    if (along === null) return
    const value = valueAt(annotation.y)
    mapped.marks.push({
      key: `point-${index}`,
      x: vertical ? along : value,
      y: vertical ? value : along,
      label: annotation.label,
    })
  })

  return mapped
}

/** An estimated label box on the plot, for the collision decision. */
export interface LabelBox {
  x0: number
  x1: number
  y0: number
  y1: number
}

/** The height of one line of `text.xs`, for boxes estimated before layout. */
const LABEL_LINE_PX = ESTIMATED_AXIS_TEXT_PX * 1.4

/** The estimated box of an end-aligned label whose anchor is at (x, y). */
export function endAlignedBox(text: string, x: number, y: number): LabelBox {
  const width = estimateTextWidth(text, ESTIMATED_AXIS_TEXT_PX)
  return { x0: x - width, x1: x, y0: y - LABEL_LINE_PX, y1: y }
}

/** The estimated box of a centre-anchored label whose anchor is at (x, y). */
export function centredBox(text: string, x: number, y: number): LabelBox {
  const width = estimateTextWidth(text, ESTIMATED_AXIS_TEXT_PX)
  return { x0: x - width / 2, x1: x + width / 2, y0: y - LABEL_LINE_PX, y1: y }
}

/**
 * Which labels collide. `true` at an index means that label is dropped.
 *
 * This follows the series end-label collision rule, with one difference. For
 * end labels, a collision drops the *whole set*, because they are one derived
 * reading and half of it is worse than none. An annotation label is text the
 * app explicitly asked for, so only the colliding labels drop. The annotation
 * itself always draws, and a label with room keeps it.
 */
export function collidingLabels(boxes: readonly LabelBox[]): boolean[] {
  const drops = boxes.map(() => false)
  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      const left = boxes[a]!
      const right = boxes[b]!
      const apart =
        left.x1 <= right.x0 || right.x1 <= left.x0 || left.y1 <= right.y0 || right.y1 <= left.y0
      if (!apart) {
        drops[a] = true
        drops[b] = true
      }
    }
  }
  return drops
}

/**
 * The gap between a rule and its label. The label anchors at the inline end on
 * a vertical chart and at the rule's top on a horizontal one. On a vertical
 * chart it sits above the rule, or below it where the plot has no room above
 * (`labelBaseline`).
 */
const RULE_LABEL_GAP = 4

/** The first line box below the plot's top edge, for rotated labels. */
const ROTATED_LABEL_BASELINE = 12

/** A band's wash: a rect across the plot, under the marks. */
export interface AnnotationWash {
  key: string
  x: number
  y: number
  width: number
  height: number
}

/** A label the ink layer draws, at its anchor. */
export interface AnnotationLabel {
  key: string
  text: string
  x: number
  y: number
  anchor: 'end' | 'middle'
}

/** What the ink layer draws over the marks. */
export interface AnnotationInk {
  /** A band's two edges, as hairline paths. */
  spans: { key: string; from: string; to: string }[]
  rules: { key: string; d: string }[]
  marks: { key: string; cx: number; cy: number; r: number }[]
  /** The labels that do not collide. A colliding label is dropped; its annotation still draws. */
  labels: AnnotationLabel[]
}

/**
 * The two layers of the shared annotation layer (`frame/ChartAnnotations` in
 * React, the described frame elsewhere), in px. The layer mounts twice,
 * because it sits both under and over the marks. The **wash** (a band's
 * `--pm-chart-other` fill at 0.08) goes under the data, so it cannot mute the
 * marks. The **ink** (hairline edges, dashed rules, point marks and all
 * labels) goes where the member draws its reference lines.
 *
 * `axis` is the *screen* axis that carries the value: `y` for vertical charts,
 * `x` for horizontal. `wash` is empty and `ink` is `null` when there is nothing
 * to draw in the layer.
 */
export interface AnnotationLayers {
  wash: AnnotationWash[]
  ink: AnnotationInk | null
}

export function annotationLayers(
  annotations: MappedAnnotations,
  axis: 'x' | 'y',
  width: number,
  height: number,
): AnnotationLayers {
  const { rules, spans, marks } = annotations
  const upright = axis === 'y'
  const across = upright ? width : height

  const wash = spans.map((span) => {
    const near = Math.min(span.from, span.to)
    const size = Math.abs(span.to - span.from)
    return {
      key: span.key,
      x: upright ? 0 : near,
      y: upright ? near : 0,
      width: upright ? width : size,
      height: upright ? size : height,
    }
  })

  if (rules.length === 0 && spans.length === 0 && marks.length === 0) return { wash, ink: null }

  /** A rule across the plot at a value-axis position, pixel-aligned like every hairline. */
  const ruleAt = (at: number): string =>
    upright
      ? rulePath([0, crisp(at)], [across, crisp(at)])
      : rulePath([crisp(at), 0], [crisp(at), height])

  const labels: (AnnotationLabel & { box: LabelBox })[] = []
  const endLabel = (key: string, text: string, at: number): void => {
    const x = upright ? width : at
    const y = upright ? labelBaseline(at, RULE_LABEL_GAP) : ROTATED_LABEL_BASELINE
    labels.push({ key, text, x, y, anchor: 'end', box: endAlignedBox(text, x, y) })
  }
  for (const rule of rules) {
    if (rule.label !== undefined) endLabel(rule.key, rule.label, rule.at)
  }
  for (const span of spans) {
    if (span.label !== undefined) endLabel(span.key, span.label, Math.min(span.from, span.to))
  }
  for (const mark of marks) {
    const y = labelBaseline(mark.y, MARKER_RADIUS + 2)
    labels.push({
      key: mark.key,
      text: mark.label,
      x: mark.x,
      y,
      anchor: 'middle',
      box: centredBox(mark.label, mark.x, y),
    })
  }
  const drops = collidingLabels(labels.map((label) => label.box))

  return {
    wash,
    ink: {
      spans: spans.map((span) => ({ key: span.key, from: ruleAt(span.from), to: ruleAt(span.to) })),
      rules: rules.map((rule) => ({ key: rule.key, d: ruleAt(rule.at) })),
      marks: marks.map((mark) => ({ key: mark.key, cx: mark.x, cy: mark.y, r: MARKER_RADIUS })),
      labels: labels
        .filter((_, index) => !drops[index])
        .map(({ key, text, x, y, anchor }) => ({ key, text, x, y, anchor })),
    },
  }
}
