'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { readMotionEnvironment } from '@polymorph/react/motion'
import styles from '@polymorph/recipes/conventions/page-transitions.module.css'

type Request = 'pending' | 'entering'
interface TransitionContext {
  waiting: boolean
  departing: boolean
  report: (id: string, request: Request | null) => void
}
const Context = createContext<TransitionContext | null>(null)

/** One viewport indicator for the app's existing navigation and loading states. */
export function PageTransitions({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<Record<string, Request>>({})
  const [departing, setDeparting] = useState(false)
  const report = useCallback((id: string, request: Request | null) => {
    setRequests((current) => {
      if ((current[id] ?? null) === request) return current
      const next = { ...current }
      if (request === null) delete next[id]
      else next[id] = request
      return next
    })
  }, [])
  useEffect(() => {
    let recovery: ReturnType<typeof setTimeout> | undefined
    const reset = () => {
      clearTimeout(recovery)
      setDeparting(false)
    }
    const leave = () => {
      clearTimeout(recovery)
      setDeparting(true)
      // A cancelled browser departure must not leave the current page invisible.
      recovery = setTimeout(reset, 10_000)
    }
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      )
        return
      const link = event.target.closest('a[href]')
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.hasAttribute('download') ||
        (link.target && link.target !== '_self')
      )
        return
      const destination = new URL(link.href, window.location.href)
      if (
        !['http:', 'https:'].includes(destination.protocol) ||
        (destination.origin === window.location.origin &&
          destination.pathname === window.location.pathname &&
          destination.search === window.location.search)
      )
        return
      queueMicrotask(() => {
        if (!event.defaultPrevented) leave()
      })
    }
    // Observe native navigation after application handlers; never intercept it.
    document.addEventListener('click', click)
    window.addEventListener('beforeunload', leave)
    window.addEventListener('pageshow', reset)
    return () => {
      clearTimeout(recovery)
      document.removeEventListener('click', click)
      window.removeEventListener('beforeunload', leave)
      window.removeEventListener('pageshow', reset)
    }
  }, [])
  const waiting = Object.values(requests).includes('pending')
  const active = departing || Object.keys(requests).length > 0
  const context = useMemo(() => ({ waiting, departing, report }), [waiting, departing, report])
  return (
    <Context value={context}>
      {children}
      <div
        className={styles.indicator}
        data-page-progress={active ? 'visible' : 'hidden'}
        aria-hidden="true"
      />
    </Context>
  )
}

/** Report a foreground page load; polling and idle background work stay silent. */
export function usePageTransitionPending(pending: boolean): void {
  const id = useId()
  const report = useContext(Context)?.report
  useEffect(() => {
    report?.(id, pending ? 'pending' : null)
    return () => report?.(id, null)
  }, [id, pending, report])
}

/** Shared by the shell content and auth column, preserving their DOM and form state. */
export function usePageTransition(key: string | undefined, pending = false) {
  const context = useContext(Context)
  const report = context?.report
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  usePageTransitionPending(pending)
  const waiting = pending || (context?.waiting ?? false)
  const [observed, setObserved] = useState({ key, waiting, sequence: 0 })
  if (observed.key !== key || observed.waiting !== waiting) {
    setObserved({ key, waiting, sequence: observed.sequence + 1 })
  }
  useEffect(() => {
    if (key === undefined || waiting || !ref.current) return
    const environment = readMotionEnvironment(ref.current)
    // Staggered auth fields may finish after their containing page fade. Keep
    // the ribbon through those finite entrances; never wait for ambient loops.
    const entrances = ref.current.getAnimations?.({ subtree: true }) ?? []
    const ends = entrances.map((animation) => animation.effect?.getComputedTiming().endTime)
    const duration = environment.reducedMotion
      ? 0
      : Math.max(
          environment.durations.surface,
          ...ends.filter((end): end is number => typeof end === 'number' && Number.isFinite(end)),
        )
    if (duration <= 0) return
    report?.(id, 'entering')
    const timer = setTimeout(() => report?.(id, null), duration)
    return () => {
      clearTimeout(timer)
      report?.(id, null)
    }
  }, [id, key, observed.sequence, report, waiting])
  return {
    ref,
    className: key === undefined ? undefined : styles.page,
    'data-page-transition': key === undefined ? undefined : observed.sequence % 2 ? 'b' : 'a',
    'data-page-transition-state':
      key === undefined
        ? undefined
        : context?.departing
          ? 'exiting'
          : waiting
            ? 'pending'
            : 'entered',
  } as const
}
