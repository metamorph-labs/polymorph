'use client'

import { useEffect, useRef, useState } from 'react'

import { Button } from '../controls/Button'
import { memberAttr } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/code-block.module.css'

/**
 * Block of code, such as an install command or config sample (`design/components/code-block.md`).
 *
 * The block is its own scroll container (container-first, `docs/layout.md`), so
 * wide code never makes the page scroll sideways.
 *
 * Whitespace is content: children render verbatim under `white-space: pre`.
 * Syntax highlighting is a **non-goal**: a highlighter is a dependency decision
 * with theme implications, and token colours would be an unspecified colour
 * system.
 */

/**
 * The scroll region's name when it is a tab stop and the call site gives none.
 * Other announced strings come from the app (Button's `label`, FileUpload's
 * `title`, error copy), and an English default cannot be translated. But a
 * region must always be named, so this default exists and `label` overrides it.
 */
const SCROLL_REGION_LABEL = 'Code block'

/**
 * How long the confirmation shows, matching `copy-button.md`: long enough to be
 * seen after the click, short enough not to look stuck. A raw number on
 * purpose: two consumers share it, and a third would make it a motion token
 * (the rule of three).
 */
const COPY_FEEDBACK_MS = 2000

export interface CodeBlockProps {
  /** The code, rendered verbatim including whitespace. */
  children: string
  /**
   * The accessible name when the block overflows and becomes a scroll region;
   * defaults to `'Code block'`, and apps pass a localized one.
   */
  label?: string
  /** Draws the copy control, the block's only control. */
  copyable?: boolean
  /** The copy control's accessible name, default `'Copy'`; apps pass a localized one. */
  copyLabel?: string
}

export function CodeBlock({
  children,
  label = SCROLL_REGION_LABEL,
  copyable = false,
  copyLabel = 'Copy',
}: CodeBlockProps) {
  const block = useRef<HTMLPreElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [copied, setCopied] = useState(false)
  const revert = useRef<number>(undefined)

  /**
   * A tab stop only while it overflows, as Table's wrapper is, because a
   * scrollable region must be keyboard-reachable and a stop with nothing to
   * scroll is worse than none. Re-measured when the code changes too, because a
   * ResizeObserver misses a longer command in the same box.
   */
  useEffect(() => {
    const node = block.current
    if (!node || typeof ResizeObserver === 'undefined') return

    const measure = () => setOverflowing(node.scrollWidth > node.clientWidth)
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [children])

  // Clears the timer on unmount, so it never sets state on an unmounted
  // component.
  useEffect(() => () => window.clearTimeout(revert.current), [])

  function handleCopy() {
    // Fire-and-forget: the confirmation reports success, and a clipboard refusal
    // (permissions policy, insecure context) leaves a plain copy control.
    void navigator.clipboard.writeText(children).then(() => {
      setCopied(true)
      window.clearTimeout(revert.current)
      revert.current = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
    })
  }

  const pre = (
    <pre
      ref={block}
      className={styles.block}
      data-overflowing={overflowing ? '' : undefined}
      data-copyable={copyable ? '' : undefined}
      tabIndex={overflowing ? 0 : undefined}
      // The landmark exists only while the tab stop does, and it always has a
      // name. An unnamed `region` is announced but cannot be identified.
      role={overflowing ? 'region' : undefined}
      aria-label={overflowing ? label : undefined}
      {...memberAttr('CodeBlock')}
    >
      <code>{children}</code>
    </pre>
  )

  if (!copyable) return pre

  return (
    // The wrapper exists only when `copyable`, so a plain block's root is the
    // `<pre>`. It carries `data-state="copied"`, the one post-interaction state.
    <div className={styles.copyable} data-state={copied ? 'copied' : undefined}>
      {pre}

      {/* Corner control, placed like Dialog's close: a real Button outside the
          scroll region, so it is reachable whether or not the block scrolls. The
          block reserves inline-end padding so the longest line scrolls clear of
          the button instead of under it. */}
      <div className={styles.control}>
        <Button
          variant="ghost"
          tone="neutral"
          size="sm"
          iconOnly
          icon={copied ? 'confirm' : 'copy'}
          label={copyLabel}
          onClick={handleCopy}
        />
      </div>

      {/* Announces the result politely, because a copy never justifies an
          interruption. Fixed English here; CopyButton takes `copiedLabel`. */}
      <span className={styles.reader} aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </div>
  )
}
