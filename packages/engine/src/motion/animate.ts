import type { Keyframe, Transition } from './patterns'

/**
 * The animation engine: takes resolved keyframes and transitions and runs them
 * with Web Animations.
 *
 * The pattern registry (`patterns.ts`) describes motion in this system's own
 * terms: opacity, scale, x, y, a duration and a cubic-bezier, or a spring. This
 * file is the only place those terms reach the browser, which has its own
 * animation engine, `Element.animate`. Each channel animates its own CSS
 * property (`opacity`, `translate`, `scale`), so each channel can have its own
 * timing, and all three are composited (law 2). A spring becomes a `linear()`
 * easing sampled from its simulation, so it also runs on the compositor.
 *
 * Every animation starts from the value on screen, not from its keyframe, so a
 * reversal mid-animation continues from where the element is (law 1). A spring
 * interrupted mid-animation passes its velocity to the next one, so the change
 * of direction is smooth.
 */

export type Channel = 'opacity' | 'translate' | 'scale'

const CHANNELS: readonly Channel[] = ['opacity', 'translate', 'scale']

/* -------------------------------------------------------------------------- */
/* Values                                                                     */
/* -------------------------------------------------------------------------- */

const length = (value: number | string) => (typeof value === 'number' ? `${value}px` : value)

/** The CSS value of one channel of a keyframe. An absent channel has its rest value. */
export function channelValue(frame: Keyframe, channel: Channel): string {
  switch (channel) {
    case 'opacity':
      return String(frame.opacity ?? 1)
    case 'scale':
      return String(frame.scale ?? 1)
    case 'translate':
      return `${length(frame.x ?? 0)} ${length(frame.y ?? 0)}`
  }
}

/** The value on screen now, including mid-animation, in the same form as `channelValue`. */
function computedValue(element: Element, channel: Channel): string {
  const style = getComputedStyle(element)
  const raw = style.getPropertyValue(channel).trim()
  if (channel === 'opacity') return raw === '' ? '1' : raw
  if (channel === 'scale')
    return raw === '' || raw === 'none' ? '1' : (raw.split(/\s+/)[0] as string)
  if (raw === '' || raw === 'none') return '0px 0px'
  const [x = '0px', y = '0px'] = raw.split(/\s+/)
  return `${x} ${y}`
}

/* -------------------------------------------------------------------------- */
/* Timing                                                                     */
/* -------------------------------------------------------------------------- */

/** The timing for one channel: the pattern's override for it, if there is one. */
export function channelTransition(transition: Transition, channel: Channel): Transition {
  if (channel === 'opacity' && transition.opacity) return transition.opacity
  if (channel === 'scale' && transition.scale) return transition.scale
  return transition
}

interface SpringCurve {
  /** Normalised progress, 0 → 1, at a fixed step. */
  samples: number[]
  step: number
  duration: number
}

const STEP = 1 / 120

/**
 * A spring from 0 to 1, simulated (semi-implicit Euler) until it is at rest, with an
 * initial velocity in normalised units per second.
 */
export function springCurve(transition: Transition, velocity = 0): SpringCurve {
  const stiffness = transition.stiffness ?? 100
  const damping = transition.damping ?? 10
  const mass = transition.mass ?? 1
  const samples = [0]
  let position = 0
  let speed = velocity
  for (let time = 0; time < 10; time += STEP) {
    const force = -stiffness * (position - 1) - damping * speed
    speed += (force / mass) * STEP
    position += speed * STEP
    samples.push(position)
    if (Math.abs(position - 1) < 5e-4 && Math.abs(speed) < 5e-3) break
  }
  samples[samples.length - 1] = 1
  return { samples, step: STEP, duration: (samples.length - 1) * STEP }
}

/** At most this many points in a `linear()` easing. The browser interpolates between them. */
const EASING_POINTS = 48

function linearEasing(curve: SpringCurve): string {
  const count = Math.min(EASING_POINTS, curve.samples.length)
  const points: string[] = []
  for (let i = 0; i < count; i += 1) {
    const index = Math.round((i / (count - 1)) * (curve.samples.length - 1))
    points.push(Number((curve.samples[index] as number).toFixed(4)).toString())
  }
  return `linear(${points.join(', ')})`
}

const supportsLinear = () =>
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    ? CSS.supports('transition-timing-function', 'linear(0, 1)')
    : false

interface Timing {
  duration: number
  easing: string
  curve: SpringCurve | null
}

function timing(transition: Transition, velocity: number): Timing {
  if (transition.type === 'spring') {
    const curve = springCurve(transition, velocity)
    return {
      duration: curve.duration * 1000,
      // A browser without `linear()` gets the settling curve without the overshoot.
      easing: supportsLinear() ? linearEasing(curve) : 'cubic-bezier(0.2, 0, 0, 1)',
      curve,
    }
  }
  const [a = 0, b = 0, c = 1, d = 1] = transition.ease ?? []
  return {
    duration: (transition.duration ?? 0) * 1000,
    easing: `cubic-bezier(${a}, ${b}, ${c}, ${d})`,
    curve: null,
  }
}

/* -------------------------------------------------------------------------- */
/* Running                                                                    */
/* -------------------------------------------------------------------------- */

interface Running {
  animation: Animation
  curve: SpringCurve | null
  from: number[]
  to: number[]
}

const running = new WeakMap<Element, Map<string, Running>>()

const numbers = (value: string) => value.match(/-?\d*\.?\d+(?:e-?\d+)?/gi)?.map(Number) ?? []

/**
 * The velocity of an interrupted spring, as a fraction of the new distance per
 * second. The next spring starts with it.
 */
function carriedVelocity(previous: Running | undefined, from: string, to: string): number {
  if (!previous?.curve) return 0
  const { animation, curve } = previous
  const time = Number(animation.currentTime ?? 0) / 1000
  const index = Math.min(Math.floor(time / curve.step), curve.samples.length - 2)
  if (index < 0) return 0
  const rate =
    ((curve.samples[index + 1] as number) - (curve.samples[index] as number)) / curve.step
  const start = numbers(from)
  const end = numbers(to)
  const span = (previous.to[0] ?? 0) - (previous.from[0] ?? 0)
  const distance = (end[0] ?? 0) - (start[0] ?? 0)
  if (distance === 0 || span === 0) return 0
  return (rate * span) / distance
}

/**
 * Animates one CSS property of `element` to `to` with `transition`, starting from
 * the value on screen (or from `from`, on a first entrance). The final value is
 * written inline first, so when the animation ends or is cancelled the element
 * stays at its target.
 */
export function animateProperty(
  element: HTMLElement,
  property: string,
  to: string,
  transition: Transition,
  from?: string,
): Promise<boolean> {
  const active = running.get(element) ?? new Map<string, Running>()
  running.set(element, active)

  const previous = active.get(property)
  const start =
    from ??
    (property === 'opacity' || property === 'translate' || property === 'scale'
      ? computedValue(element, property)
      : getComputedStyle(element).getPropertyValue(property))
  previous?.animation.cancel()
  active.delete(property)

  element.style.setProperty(property, to)
  const { duration, easing, curve } = timing(transition, carriedVelocity(previous, start, to))
  if (duration <= 0 || start === to || typeof element.animate !== 'function') {
    return Promise.resolve(true)
  }

  const animation = element.animate({ [property]: [start, to] }, { duration, easing })
  const entry: Running = { animation, curve, from: numbers(start), to: numbers(to) }
  active.set(property, entry)
  return animation.finished.then(
    () => {
      if (active.get(property) === entry) active.delete(property)
      return true
    },
    // Cancelled: another animation took over the property.
    () => false,
  )
}

/**
 * Animates every channel of `element` to `frame`. Resolves `true` when all of them
 * finish, and `false` if any was interrupted.
 */
export function animateTo(
  element: HTMLElement,
  frame: Keyframe,
  transition: Transition,
  from?: Keyframe,
): Promise<boolean> {
  return Promise.all(
    CHANNELS.map((channel) =>
      animateProperty(
        element,
        channel,
        channelValue(frame, channel),
        channelTransition(transition, channel),
        from === undefined ? undefined : channelValue(from, channel),
      ),
    ),
  ).then((arrived) => arrived.every(Boolean))
}

/** Sets `element` to `frame` with no animation, cancelling any that are running. */
export function setFrame(element: HTMLElement, frame: Keyframe): void {
  const active = running.get(element)
  for (const channel of CHANNELS) {
    active?.get(channel)?.animation.cancel()
    active?.delete(channel)
    element.style.setProperty(channel, channelValue(frame, channel))
  }
}
