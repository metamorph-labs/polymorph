'use client'

import { useRef } from 'react'

import { agentPress, type ControlSize, Icon, memberAttr, useAgentMember } from '@polymorph/react'
import styles from '@polymorph/recipes/controls/link.module.css'
import { routeClick } from './navigate'

/**
 * Navigation as text, with an optional Button-styled variant (`design/components/link.md`).
 *
 * Link and Button differ by behaviour, not appearance. Anything that changes data is a
 * Button. So Link has no `onClick`, and `href` is required.
 *
 * `variant="button"` is for navigation in a row of Buttons that must match their visual
 * weight. The element is still an `<a>`. The styling is Button's: the variant sets Button's
 * attributes (`data-variant`/`data-tone`/`data-size`) and composes its class, so Button's
 * stylesheet applies and is not duplicated here. Button features with no meaning for
 * navigation are left out: no `loading`, no `disabled` (an `<a>` that cannot be followed
 * should not render as a link), and no underline, because the frame marks it as clickable.
 *
 * The vocabulary has no router, because a router is the app's framework choice. An app
 * with one passes `onNavigate`, and Link hands it the clicks that would navigate this tab
 * (`navigate.ts`).
 */

export type LinkVariant = 'inline' | 'standalone' | 'button'

/**
 * The allowed variant and tone pairs for `variant="button"`. They are Button's, minus
 * `danger`: a destructive destination is an action, so it is a Button that goes through
 * ConfirmDialog. As in Button, `neutral` exists only for `outline`/`ghost`.
 */
export interface LinkButtonGrid {
  solid: 'accent'
  soft: 'accent'
  outline: 'accent' | 'neutral'
  ghost: 'accent' | 'neutral'
}

/** The allowed pairs, encoded as in Button, so a mismatch is a type error. */
type LinkCostumeAppearance = {
  [V in keyof LinkButtonGrid]: { buttonVariant?: V; tone?: LinkButtonGrid[V] }
}[keyof LinkButtonGrid]

/**
 * Button-styling props exist only on `variant="button"`. On a text variant they are a
 * type error, not a runtime warning, as with Button's disallowed pairs.
 */
export type LinkProps = {
  href: string
  /**
   * The app's router. A click the browser would follow in this tab calls it with `href` in
   * place of the browser's navigation; a click with a modifier key or another button, and a
   * click on an `external` link, stay the browser's. It routes and does nothing else: a click
   * that changes data is a Button.
   */
  onNavigate?: (href: string) => void
  /** Adds the glyph, the new tab, and the `rel` that makes it safe. */
  external?: boolean
  children: string
} & (
  | {
      /** `inline` sits inside a sentence and `standalone` is a row or a title. */
      variant?: 'inline' | 'standalone'
      buttonVariant?: undefined
      tone?: undefined
      size?: undefined
    }
  | ({
      /**
       * Button's styling on Link's `<a>` element. `buttonVariant` defaults to `soft`;
       * navigation styled as the primary action must opt into `solid`.
       */
      variant: 'button'
      /** Control size, as on Button. */
      size?: ControlSize
    } & LinkCostumeAppearance)
)

export function Link({
  href,
  onNavigate,
  variant = 'inline',
  external = false,
  children,
  ...costume
}: LinkProps) {
  const target = external ? '_blank' : undefined
  const rel = external ? 'noreferrer' : undefined
  const onClick = routeClick(href, onNavigate)

  // An agent's press is the link's own click (`agentPress`), so the router gets it through
  // `onNavigate` as it gets a person's, and without a router the browser follows the link. An
  // external link is refused: it opens a new tab, which a browser opens only from a person's own
  // gesture, so a scripted press would be blocked as a popup.
  const ref = useRef<HTMLAnchorElement>(null)
  useAgentMember({
    member: 'Link',
    element: () => ref.current,
    state: () => ({ external }),
    actions: {
      press: () => {
        if (external) {
          throw new Error('An external link opens a new tab, which only a person’s press opens.')
        }
        agentPress(ref.current)
      },
    },
  })

  if (variant === 'button') {
    const { buttonVariant = 'soft', tone = 'accent', size = 'md' } = costume

    return (
      <a
        ref={ref}
        className={styles.costume}
        href={href}
        // All of Button's data attributes, so Button's stylesheet applies.
        data-variant={buttonVariant}
        data-tone={tone}
        data-size={size}
        data-external={external ? '' : undefined}
        target={target}
        rel={rel}
        onClick={onClick}
        {...memberAttr('Link')}
      >
        <span className={styles.costumeLabel}>{children}</span>
        {external ? (
          // Button's trailing-icon slot. Decorative for the same reason as below:
          // `rel` and the surrounding copy announce the new tab.
          <span className={styles.costumeGlyph}>
            <Icon name="open-external" size={size} />
          </span>
        ) : null}
      </a>
    )
  }

  return (
    <a
      ref={ref}
      className={styles.link}
      href={href}
      data-variant={variant}
      data-external={external ? '' : undefined}
      target={target}
      rel={rel}
      onClick={onClick}
      {...memberAttr('Link')}
    >
      {children}
      {external ? (
        // Decorative. `rel` and the surrounding copy announce the new tab. A named
        // glyph would make screen readers announce it twice.
        <Icon name="open-external" size="sm" />
      ) : null}
    </a>
  )
}
