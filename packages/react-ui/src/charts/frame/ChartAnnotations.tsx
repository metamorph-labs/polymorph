import type { AnnotationLayers } from '@polymorph/react'
import styles from '@polymorph/recipes/charts/frame/chart-annotations.module.css'

/*
 * No `'use client'`, on purpose. Like the tooltip, this renders geometry from
 * props, with no hook, no handler and no measurement. The member that maps the
 * values is the client component; this layer is not.
 */

/**
 * The shared annotation layer (the shared grammar, `docs/charts.md`). It is one
 * presentational component in px space, used by every member that annotates, so
 * a reference band looks the same on a BarChart and on an AreaChart.
 *
 * It mounts twice, because the layer sits both under and over the marks. The
 * **wash** (a band's `--pm-chart-other` fill at 0.08) goes under the data, so it
 * cannot mute the marks. The **ink** (hairline edges, dashed rules, point marks
 * and all labels) goes where the member draws its reference lines (the
 * baseline's slot).
 *
 * Annotations never use data colours: rules and edges use `--pm-chart-axis`,
 * the wash uses `--pm-chart-other`, and labels use text tokens. The rule that
 * annotations never re-centre colour applies to bands too, because a band
 * carries no sentiment. Colliding labels are dropped (only the labels involved),
 * but the annotation itself always draws, because the app asked for it. The
 * placement and the collisions are the engine's `annotationLayers`, which every
 * framework's frame draws from.
 */

export interface ChartAnnotationsProps {
  layer: 'wash' | 'ink'
  /** The two layers, in px: the engine's `annotationLayers` over the member's mapped annotations. */
  layers: AnnotationLayers
}

export function ChartAnnotations({ layer, layers }: ChartAnnotationsProps) {
  const { wash, ink } = layers

  if (layer === 'wash') {
    if (wash.length === 0) return null
    return (
      <g className={styles.washes}>
        {wash.map((span) => (
          <rect
            key={span.key}
            className={styles.span}
            x={span.x}
            y={span.y}
            width={span.width}
            height={span.height}
          />
        ))}
      </g>
    )
  }

  if (ink === null) return null

  return (
    <g className={styles.ink}>
      {ink.spans.map((span) => (
        <g key={span.key}>
          <path className={styles.edge} d={span.from} />
          <path className={styles.edge} d={span.to} />
        </g>
      ))}
      {ink.rules.map((rule) => (
        <path key={rule.key} className={styles.rule} d={rule.d} />
      ))}
      {ink.marks.map((mark) => (
        <circle key={mark.key} className={styles.mark} cx={mark.cx} cy={mark.cy} r={mark.r} />
      ))}
      {ink.labels.map((label) => (
        <text
          key={label.key}
          className={styles.label}
          x={label.x}
          y={label.y}
          textAnchor={label.anchor}
        >
          {label.text}
        </text>
      ))}
    </g>
  )
}
