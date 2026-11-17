'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

import {
  animateProperty,
  readMotionEnvironment,
  resolveBinding,
  type BindingName,
  type ResolvedBinding,
} from '@polymorph/engine/motion'

/**
 * A rule that slides between the items it marks, such as the tab underline.
 *
 * It lives in the React foundation's motion module, not in Tabs, because a
 * spring is physics, not a curve. It cannot be a CSS transition, and it must
 * keep its velocity when the target moves again mid-animation (the engine's
 * `motion/animate.ts`). `MotionSurface` handles
 * surfaces that enter and exit. An indicator does neither: it is always present
 * and only moves. It therefore has its own component, and Tabs still names a
 * binding instead of a stiffness.
 *
 * The caller passes a measured position, in the coordinate space of the
 * positioned parent. Only the caller knows what it is measuring, and the
 * projection helpers make the same assumption.
 */

export interface MotionIndicatorProps {
  binding: BindingName
  /** Offset from the container's inline start, in pixels. */
  x: number
  /** Offset from the container's block start, in pixels. */
  y?: number
  /** Measured width, in pixels. Omit for a rule that runs down an edge. */
  width?: number
  /** Measured height, in pixels. Omit for a rule that runs along one. */
  height?: number
  className?: string
  style?: CSSProperties
}

function useSpring(binding: BindingName, target: Element | null): ResolvedBinding | null {
  const [resolved, setResolved] = useState<ResolvedBinding | null>(null)

  useEffect(() => {
    const element = target ?? document.documentElement
    const read = () => setResolved(resolveBinding(binding, readMotionEnvironment(element)))
    read()

    // As in `MotionSurface`: a temperament change is an attribute change. The
    // cascade picks it up, so the indicator must too.
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true })
    return () => observer.disconnect()
  }, [binding, target])

  return resolved
}

export function MotionIndicator({
  binding,
  x,
  y = 0,
  width,
  height,
  className,
  style,
}: MotionIndicatorProps) {
  const element = useRef<HTMLDivElement | null>(null)
  const [node, setNode] = useState<HTMLElement | null>(null)
  const resolved = useSpring(binding, node)
  const placed = useRef(false)

  useLayoutEffect(() => {
    const target = element.current
    if (!target) return
    const values: [string, string][] = [['translate', `${x}px ${y}px`]]
    if (width !== undefined) values.push(['width', `${width}px`])
    if (height !== undefined) values.push(['height', `${height}px`])
    // The first placement sets the start position and is not animated.
    const transition = placed.current && resolved?.kind === 'spring' ? resolved.transition : null
    placed.current = true
    for (const [property, value] of values) {
      if (transition) void animateProperty(target, property, value, transition)
      else target.style.setProperty(property, value)
    }
  }, [x, y, width, height, resolved])

  return (
    <div
      ref={(next) => {
        element.current = next
        setNode(next)
      }}
      className={className}
      style={{ ...style, position: 'absolute', insetInlineStart: 0, insetBlockStart: 0 }}
    />
  )
}
