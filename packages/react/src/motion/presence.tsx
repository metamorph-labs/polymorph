'use client'

import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'

import {
  animateProperty,
  animateTo,
  projectedOrigin,
  readMotionEnvironment,
  resolveBinding,
  setFrame,
  stillMotionEnvironment,
  type BindingName,
  type MotionEnvironment,
  type ResolveOptions,
} from '@polymorph/engine/motion'

/**
 * Exit coordination, which components should not have to handle themselves.
 *
 * An exiting element must stay mounted while it animates out. A reversal
 * mid-animation must continue from the current value instead of restarting
 * from the endpoint. `MotionPresence` keeps exiting children in the tree until
 * every surface inside them has finished its exit. `MotionSurface` runs the
 * enter and the exit on the browser's animation engine, through the engine's
 * `motion/animate.ts`. Nothing here depends on an animation library.
 *
 * A component passes a binding name. It never sees a duration, a spring or a
 * keyframe.
 */

/** A value key for the environment: cheap, and equal for equal reads. */
function signature(environment: MotionEnvironment): string {
  return JSON.stringify([
    environment.temperament,
    environment.reducedMotion,
    environment.durations,
    environment.springs,
    environment.pressScale,
    environment.ambient,
    environment.direction,
    environment.tokensPresent,
  ])
}

/** A store that never changes: `useServerMarkup` reads which snapshot React asks for. */
const never = () => () => {}

/**
 * True for a render on a server and for the render that hydrates its markup,
 * false for a render that mounts in the browser. React reads the server
 * snapshot for exactly those two renders.
 */
function useServerMarkup(): boolean {
  return useSyncExternalStore(
    never,
    () => false,
    () => true,
  )
}

/**
 * Re-reads the environment when the scope attributes or the reduced-motion
 * preference change.
 *
 * State updates only when the values change. A new environment object with
 * identical numbers would produce new keyframe objects and restart a running
 * animation, which is the jump that law 1 forbids.
 *
 * A server has no document to read, so its render starts from the still
 * environment, and so does the render that hydrates its markup, because a
 * surface writes its resolved pattern as an attribute and the two renders must
 * write the same one. The effect below then reads the real environment. A
 * surface the server drew is therefore at rest when it hydrates and does not
 * enter again. A render that mounts in the browser reads the environment at
 * once, so its enter runs on the theme's values.
 */
function useMotionEnvironment(target: Element | null): MotionEnvironment {
  const serverMarkup = useServerMarkup()
  const [environment, setEnvironment] = useState<MotionEnvironment>(() =>
    serverMarkup ? stillMotionEnvironment() : readMotionEnvironment(target ?? undefined),
  )

  useEffect(() => {
    const element = target ?? document.documentElement
    const reread = () =>
      setEnvironment((current) => {
        const next = readMotionEnvironment(element)
        return signature(next) === signature(current) ? current : next
      })
    reread()

    // A pairing, mode, density or temperament change is an attribute change on
    // an ancestor. The cascade picks it up, so the surface must too. Both halves
    // of the pairing are watched, because the palette can change while the
    // system stays the same.
    const observer = new MutationObserver(reread)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-system', 'data-palette', 'data-mode', 'data-motion'],
    })

    const query =
      typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-reduced-motion: reduce)')
    query?.addEventListener('change', reread)

    return () => {
      observer.disconnect()
      query?.removeEventListener('change', reread)
    }
  }, [target])

  return environment
}

/** The elements a surface may render as. `li` is for Toast, because a toast is a list item. */
export type MotionSurfaceElement = 'div' | 'li' | 'section'

/**
 * What a surface accepts besides its binding: whatever the host passes it.
 *
 * These props are intentionally open, unlike a vocabulary component's closed
 * props. A surface is usually the child of a Radix `asChild`, and Radix passes
 * its child the props the primitive needs: `role`, `id`, `aria-*`,
 * `data-state`, dismiss handlers, a ref, and (from DismissableLayer and Popper)
 * an inline `style`. A closed prop list would silently drop them. This is
 * internal wiring, not a public API. The governed components stay closed.
 */
type PassThroughProps = Omit<
  // `HTMLElement`, not `HTMLDivElement`, because a surface can be a `li` and an
  // element-specific handler type would not fit both.
  HTMLAttributes<HTMLElement>,
  // A surface is not draggable and does not forward DOM animation events,
  // because the surface runs its own animations.
  | 'style'
  | 'onDrag'
  | 'onDragStart'
  | 'onDragEnd'
  | 'onDragEnter'
  | 'onDragExit'
  | 'onDragLeave'
  | 'onDragOver'
  | 'onDrop'
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration'
> & {
  // Radix passes its child `data-state`, `data-side`, `data-swipe-direction` and
  // more. TS allows unknown `data-*` only on intrinsic elements, so a component
  // that replaces one must declare them.
  [key: `data-${string}`]: string | undefined
}

export type MotionSurfaceProps = PassThroughProps & {
  /** A binding from `motion.json`, so the component names a choreography instead of numbers. */
  binding: BindingName
  /** Radix's `data-side` / `data-align`, for an anchored surface. */
  side?: ResolveOptions['side']
  align?: ResolveOptions['align']
  /** For a `sheet`: the edge the panel is pinned to, in logical terms. */
  sheetSide?: ResolveOptions['sheetSide']
  /** The element a pointer-launched panel should appear to come from. */
  launchedFrom?: Element | null
  /**
   * Animates this surface's position when the list around it changes, such as
   * remaining toasts sliding into a dismissed toast's gap. The binding supplies
   * the spring, so the reflow is a registry decision like every other.
   */
  layoutBinding?: BindingName
  as?: MotionSurfaceElement
  style?: CSSProperties
  ref?: Ref<HTMLElement>
}

/* -------------------------------------------------------------------------- */
/* Presence                                                                   */
/* -------------------------------------------------------------------------- */

interface PresenceValue {
  /** False once the child has been removed and is exiting. */
  present: boolean
  /** True for a child that was already there when the presence first rendered. */
  initial: boolean
  register: (surface: string) => () => void
  complete: (surface: string) => void
}

const PresenceContext = createContext<PresenceValue | null>(null)

/** One child of a presence. It unmounts once every surface inside it has exited. */
function PresenceChild({
  present,
  initial,
  onExited,
  children,
}: {
  present: boolean
  initial: boolean
  onExited: () => void
  children: ReactNode
}) {
  const registered = useRef(new Set<string>())
  const finished = useRef(new Set<string>())
  const presentRef = useRef(present)
  const exitedRef = useRef(onExited)
  useLayoutEffect(() => {
    presentRef.current = present
    exitedRef.current = onExited
  })

  const settle = useCallback(() => {
    if (presentRef.current) return
    for (const surface of registered.current) if (!finished.current.has(surface)) return
    exitedRef.current()
  }, [])

  const value = useMemo<PresenceValue>(
    () => ({
      present,
      initial,
      register(surface) {
        registered.current.add(surface)
        return () => {
          registered.current.delete(surface)
          finished.current.delete(surface)
          settle()
        }
      },
      complete(surface) {
        finished.current.add(surface)
        settle()
      },
    }),
    [present, initial, settle],
  )

  useLayoutEffect(() => {
    if (present) finished.current.clear()
    // A child with no surface has no exit to wait for.
    else if (registered.current.size === 0) exitedRef.current()
  }, [present])

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>
}

/**
 * Keeps exiting children mounted until their exit finishes. One instance wraps
 * the content that mounts and unmounts. Children need stable `key`s.
 *
 * Enter and exit can run at the same time. Rapidly opening and closing a dialog
 * must not queue animations, and a child that returns while exiting reverses
 * from its current position. Children present on the first render do not
 * animate in.
 */
export function MotionPresence({
  children,
  onExitComplete,
}: {
  children?: ReactNode
  onExitComplete?: () => void
}) {
  const [tracked, setTracked] = useState<Tracked>(() => {
    const present = elements(children)
    return {
      children,
      rendered: present,
      exiting: new Set(),
      initial: new Set(present.map((child) => child.key)),
    }
  })

  // React's pattern for state derived from a prop: reconcile during render, so a
  // removed child is still in the list on the render that removed it.
  let view = tracked
  if (tracked.children !== children) {
    view = reconcile(tracked, children)
    setTracked(view)
  }

  const exited = useCallback((key: string | null) => {
    setTracked((state) => {
      if (!state.exiting.has(key)) return state
      const exiting = new Set(state.exiting)
      exiting.delete(key)
      return { ...state, exiting, rendered: state.rendered.filter((child) => child.key !== key) }
    })
  }, [])

  const leaving = view.exiting.size
  const was = useRef(leaving)
  const complete = useRef(onExitComplete)
  useEffect(() => {
    complete.current = onExitComplete
  })
  useEffect(() => {
    if (was.current > 0 && leaving === 0) complete.current?.()
    was.current = leaving
  }, [leaving])

  return view.rendered.map((child) => (
    <PresenceChild
      key={child.key}
      present={!view.exiting.has(child.key)}
      initial={view.initial.has(child.key)}
      onExited={() => exited(child.key)}
    >
      {child}
    </PresenceChild>
  ))
}

interface Tracked {
  children: ReactNode
  /** What is on screen: the present children, with exiting ones in their old positions. */
  rendered: ReactElement[]
  exiting: ReadonlySet<string | null>
  /** Children present on the first render, which do not animate in. */
  initial: ReadonlySet<string | null>
}

const elements = (children: ReactNode) =>
  Children.toArray(children).filter(isValidElement) as ReactElement[]

function reconcile(previous: Tracked, children: ReactNode): Tracked {
  const present = elements(children)
  const presentKeys = new Set(present.map((child) => child.key))
  const exiting = new Set([...previous.exiting].filter((key) => !presentKeys.has(key)))
  const initial = new Set(previous.initial)
  for (const child of previous.rendered) {
    if (!presentKeys.has(child.key)) {
      exiting.add(child.key)
      initial.delete(child.key)
    }
  }

  const rendered = [...present]
  previous.rendered.forEach((child, index) => {
    if (exiting.has(child.key)) rendered.splice(Math.min(index, rendered.length), 0, child)
  })
  return { children, rendered, exiting, initial }
}

/* -------------------------------------------------------------------------- */
/* Surface                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A surface that animates in and out from its binding.
 *
 * Wrap it in `<MotionPresence>` (or Radix's `forceMount` plus one) so the exit
 * runs before the element leaves the tree. Outside a presence it animates in on
 * mount and unmounts without an exit animation.
 */
export function MotionSurface({
  binding,
  children,
  side,
  align,
  sheetSide,
  launchedFrom,
  layoutBinding,
  as = 'div',
  style,
  ref,
  ...rest
}: MotionSurfaceProps) {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const element = useRef<HTMLElement | null>(null)
  const environment = useMotionEnvironment(node)
  const presence = useContext(PresenceContext)
  const present = presence?.present ?? true

  const resolved = useMemo(() => {
    const options: ResolveOptions = {
      ...(side === undefined ? {} : { side }),
      ...(align === undefined ? {} : { align }),
      ...(sheetSide === undefined ? {} : { sheetSide }),
      ...(node && launchedFrom ? { origin: projectedOrigin(launchedFrom, node) } : {}),
    }
    const value = resolveBinding(binding, environment, options)
    return value.kind === 'presence' ? value : null
  }, [binding, environment, side, align, sheetSide, launchedFrom, node])

  const layout = useMemo(() => {
    if (!layoutBinding) return null
    const value = resolveBinding(layoutBinding, environment)
    return value.kind === 'spring' ? value : null
  }, [layoutBinding, environment])

  // The host's ref is composed, not replaced. A Radix primitive needs its child's
  // node to trap focus and to measure it. This surface also needs it, to read its
  // motion scope and to project an origin into its box.
  const setRefs = useCallback(
    (next: HTMLElement | null) => {
      element.current = next
      setNode(next)
      if (typeof ref === 'function') ref(next)
      else if (ref) ref.current = next
    },
    [ref],
  )

  const id = useId()
  const register = presence?.register
  useLayoutEffect(() => register?.(id), [register, id])

  // Enter, exit, and every change of resting state in between. It is a layout
  // effect, so the first frame the browser paints is the enter's first frame.
  const entered = useRef(false)
  const complete = presence?.complete
  const animateKey = JSON.stringify(resolved?.animate)
  const exitKey = JSON.stringify(resolved?.exit)
  useLayoutEffect(() => {
    const target = element.current
    if (!target || !resolved) return
    if (!present) {
      void animateTo(target, resolved.exit, resolved.exitTransition).then((arrived) => {
        if (arrived) complete?.(id)
      })
      return
    }
    if (entered.current) {
      // Returning during an exit, or a new resting state: start from the current value.
      void animateTo(target, resolved.animate, resolved.enterTransition)
      return
    }
    entered.current = true
    if (presence?.initial) setFrame(target, resolved.animate)
    else void animateTo(target, resolved.animate, resolved.enterTransition, resolved.initial)
    // `resolved` is tracked by its keys. Equal frames in a new object are not a new animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present, animateKey, exitKey, complete, id])

  // Remaining siblings slide into a dismissed sibling's gap (first, last, invert, play).
  const offset = useRef<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    const target = element.current
    if (!target || !layout) return
    const next = { x: target.offsetLeft, y: target.offsetTop }
    const previous = offset.current
    offset.current = next
    if (!previous || !present) return
    const dx = previous.x - next.x
    const dy = previous.y - next.y
    if (dx === 0 && dy === 0) return
    // Include any slide already running in the element's current position.
    const transform = getComputedStyle(target).transform
    const now = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform)
    void animateProperty(
      target,
      'transform',
      'none',
      layout.transition,
      `translate(${dx + now.e}px, ${dy + now.f}px)`,
    )
  })

  if (!resolved) {
    throw new Error(
      `MotionSurface: binding "${binding}" is not a presence pattern. ` +
        `Use the collapse, spring, ambient or press helper for it.`,
    )
  }

  if (layoutBinding && !layout) {
    throw new Error(`MotionSurface: layoutBinding "${layoutBinding}" is not a spring binding.`)
  }

  const Tag = as
  return (
    <Tag
      ref={setRefs}
      // The host's style takes precedence. Popper's transform-origin and
      // DismissableLayer's `pointer-events` are positioning values, and a surface
      // that overrode them would animate from the wrong place.
      style={{
        ...(resolved.transformOrigin ? { transformOrigin: resolved.transformOrigin } : {}),
        ...style,
      }}
      data-motion-pattern={resolved.effective}
      data-motion-projected={resolved.projected ? '' : undefined}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/**
 * `transform-origin` for a panel launched from a trigger, recomputed when the
 * panel resizes or the trigger changes. It returns a ref callback so a component
 * does not have to manage layout timing.
 */
export function useProjectedOrigin(trigger: Element | null): {
  ref: (node: HTMLElement | null) => void
  transformOrigin: string
} {
  const [origin, setOrigin] = useState('center')
  const nodeRef = useRef<HTMLElement | null>(null)

  const ref = useCallback(
    (node: HTMLElement | null) => {
      nodeRef.current = node
      if (node) setOrigin(projectedOrigin(trigger, node))
    },
    [trigger],
  )

  useEffect(() => {
    const node = nodeRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setOrigin(projectedOrigin(trigger, node)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [trigger])

  return { ref, transformOrigin: origin }
}

export { useMotionEnvironment }
