'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { Toaster, viewportMounted, type ToasterMessages } from './Toaster'
import { getToasts, removeToast, toast, type ToastOptions, type ToastTone } from './toast-store'

declare const process: { env: { NODE_ENV?: string } }

const Hosted = createContext<{ register: (node: HTMLElement) => () => void } | null>(null)

/** One viewport per mounted application, including nested standalone authentication. */
export function ToastHost({
  children,
  messages,
}: {
  children: ReactNode
  messages: ToasterMessages
}) {
  const hosted = useContext(Hosted)
  const [targets, setTargets] = useState<HTMLElement[]>([])
  const register = useCallback((node: HTMLElement) => {
    setTargets((current) => [...current.filter((target) => target !== node), node])
    return () => setTargets((current) => current.filter((target) => target !== node))
  }, [])
  if (hosted) return children
  const viewport = <Toaster messages={messages} />
  const target = targets.at(-1)
  return (
    <Hosted.Provider value={{ register }}>
      {children}
      {target ? createPortal(viewport, target) : viewport}
    </Hosted.Provider>
  )
}

/** Keep the one application viewport inside the active modal's focus/inert boundary. */
export function ToastViewportTarget() {
  const register = useContext(Hosted)?.register,
    ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (node) return register?.(node)
  }, [register])
  return <div ref={ref} data-toast-viewport-target="" />
}

interface NoticeContent {
  title: string
  description: string | undefined
  children: ReactNode
  tone: ToastTone
  dismissible: boolean
}

/**
 * The toast a notice raises. It sets no lifetime, so the store gives it its
 * tone's (`toneLifetime`, `design/components/toast.md`): a danger or warning
 * notice stays until it is resolved or dismissed, and any other tone leaves on
 * its own. Its `onDismiss` reads the latest callback when the store calls it,
 * so a new callback never raises the toast again.
 */
function noticeOptions(
  id: string,
  current: NoticeContent,
  dismissed: RefObject<(() => void) | undefined>,
): ToastOptions {
  return {
    id,
    title: current.title,
    description: current.description,
    content: current.children,
    tone: current.tone,
    dismissible: current.dismissible,
    onDismiss: () => dismissed.current?.(),
  }
}

/** An outcome a screen's state holds, rendered only in the application toast viewport. */
export function ToastNotice({
  title,
  description,
  children,
  tone = 'danger',
  eventKey,
  dismissible = true,
  onDismiss,
}: {
  title: string
  /** A message in words, under the title; `children` is content of any kind, such as a retry. */
  description?: string
  children?: ReactNode
  /** Danger and warning stay until resolved or dismissed; the other tones leave on their own. */
  tone?: ToastTone
  /** A new operation can announce the same error again. Incidental renders cannot. */
  eventKey?: string | number
  dismissible?: boolean
  /** The notice left by dismissal, timeout or eviction. Unmounting it does not call this. */
  onDismiss?: () => void
}) {
  const id = useId()
  const hosted = useContext(Hosted) !== null
  const dismissed = useRef(onDismiss)
  useEffect(() => {
    dismissed.current = onDismiss
  }, [onDismiss])
  const content = useRef<NoticeContent>({ title, description, children, tone, dismissible })
  useEffect(() => {
    content.current = { title, description, children, tone, dismissible }
  }, [title, description, children, tone, dismissible])
  useEffect(() => {
    toast(noticeOptions(id, content.current, dismissed))
    return () => removeToast(id)
  }, [id, eventKey, title])
  useEffect(() => {
    // Keep callbacks and disabled controls current; dismissal remains respected.
    if (getToasts().some((record) => record.id === id && !record.closing))
      toast(noticeOptions(id, { title, description, children, tone, dismissible }, dismissed))
  }, [id, title, description, children, tone, dismissible])
  /*
   * Development warning: a notice outside ToastHost, with no viewport mounted
   * anywhere, raises a toast nothing draws. The check waits for the commit's
   * remaining effects, because a viewport mounted beside the notice registers
   * after it.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || hosted) return
    let pending = true
    queueMicrotask(() => {
      if (pending && !viewportMounted())
        console.warn(
          `polymorph: ToastNotice "${content.current.title}" rendered with no ToastHost ` +
            'mounted, so nothing draws it. Mount ToastHost at the application root, outside ' +
            'any error boundary whose fallback renders a ToastNotice.',
        )
    })
    return () => {
      pending = false
    }
  }, [hosted])
  return null
}
