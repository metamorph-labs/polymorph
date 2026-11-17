'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'

import {
  agentPress,
  memberAttr,
  type RadiusStep,
  type SpaceStep,
  useAgentMember,
} from '@polymorph/react'

import styles from '@polymorph/recipes/structure/card.module.css'
import { routeClick } from '../controls/navigate'

/**
 * A bordered surface that groups related content (`design/components/card.md`).
 *
 * No `variant`: depth belongs to the theme. A per-call "outlined vs elevated"
 * choice would let screens drift apart. An elevated theme's token carries a
 * shadow. A flat theme's is `none`, and the border separates the card.
 *
 * Cards do not nest. Group inside a Card with a Stack or a section, because two
 * nested surfaces at one elevation hide which plane the reader is on.
 *
 * `title` is the card's one heading, in the section-heading recipe, so a titled
 * card needs no Dashboard around it. Dashboard.Panel's title is this one.
 * `headingLevel` sets its element and never its look, so the outline can follow
 * the page without the card looking different.
 *
 * The interactive card is **navigation only**: `href` renders a stretched `<a>`
 * named by `label`, so the whole card is one target without being a button. A
 * card that acts on click is a different member, and selection cards are
 * ChoiceCard. Text in a linked card cannot be drag-selected, because the link
 * covers it. The pattern accepts that cost once. An app with a router passes
 * `onNavigate`, and the cover hands it the clicks that would navigate this tab,
 * as Link does (`navigate.ts`).
 */

/**
 * An instance patch (exception ladder, rung 3): token names, never lengths,
 * because a patch reassigns a decision.
 */
export interface CardPatch {
  p?: SpaceStep
  px?: SpaceStep
  py?: SpaceStep
  radius?: RadiusStep
}

export type CardElement = 'div' | 'section' | 'article'

/** A title's level: 2 renders `<h2>`, 3 `<h3>`, 4 `<h4>`. Never 1: PageHeader owns the `<h1>`. */
export type CardHeadingLevel = 2 | 3 | 4

/**
 * `href` requires `label` at the type level, as in Button's grid, because the
 * covering link has no text of its own. `onNavigate` is typed only with `href`,
 * because a card without a link has nothing to route.
 */
export type CardProps = {
  children?: ReactNode
  patch?: CardPatch
  as?: CardElement
  /**
   * The card's heading, drawn before the children in the section-heading recipe
   * Dashboard.Panel and SettingsRow.Group use.
   */
  title?: string
  /** The title's element, `2` by default; it changes the outline, never the look. */
  headingLevel?: CardHeadingLevel
} & (
  | { href?: undefined; label?: undefined; onNavigate?: undefined }
  | {
      /** The navigation target, rendered as a stretched link over the card. */
      href: string
      /** The navigation's accessible name. */
      label: string
      /**
       * The app's router. A click the browser would follow in this tab calls it with `href` in
       * place of the browser's navigation; a click with a modifier key or another button stays
       * the browser's (`link.md` §Routing).
       */
      onNavigate?: (href: string) => void
    }
)

declare const process: { env: { NODE_ENV?: string } }

export function Card({
  children,
  patch,
  as = 'div',
  title,
  headingLevel = 2,
  href,
  label,
  onNavigate,
}: CardProps) {
  const root = useRef<HTMLElement | null>(null)
  const cover = useRef<HTMLAnchorElement>(null)
  const titleId = useId()
  const interactive = href !== undefined

  // The spec's `agent` fence. The member's element is the cover, which only a
  // linked card draws, so a card without `href` is not listed. A press is the
  // cover's own click, so `onNavigate` or the browser takes it as a person's.
  useAgentMember({
    member: 'Card',
    element: () => cover.current,
    state: () => ({}),
    actions: { press: () => agentPress(cover.current) },
  })

  /*
   * Development warning: the stretched link covers the surface, so a control
   * under it is unreachable. That needs a different composition, not a z-index.
   * Reads the DOM rather than `children`, because the control is usually nested
   * inside other components.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    if (!interactive || !root.current) return
    const nested = [
      ...root.current.querySelectorAll('a, button, input, select, textarea, [tabindex]'),
    ].filter((node) => node !== cover.current)
    if (nested.length > 0) {
      console.warn(
        'polymorph: Card: a linked card contains interactive content the stretched link ' +
          'covers, so it cannot be reached. A card needing both a navigation and inner ' +
          'controls is a composition problem — split them.',
      )
    }
  }, [interactive, children])

  const Element = as
  // The element and the level are the same number, as on Heading.
  const Title = headingLevel === 4 ? 'h4' : headingLevel === 3 ? 'h3' : 'h2'
  // A titled section or article is named by its title, which makes a section a
  // region landmark. A div takes no name, so it is not given one.
  const named = title !== undefined && as !== 'div'

  return (
    <Element
      ref={(node: HTMLElement | null) => {
        root.current = node
      }}
      className={styles.card}
      aria-labelledby={named ? titleId : undefined}
      // The same attribute name Table.Row uses.
      data-interactive={interactive ? '' : undefined}
      data-p={patch?.p === undefined ? undefined : String(patch.p)}
      data-px={patch?.px === undefined ? undefined : String(patch.px)}
      data-py={patch?.py === undefined ? undefined : String(patch.py)}
      data-radius={patch?.radius}
      {...memberAttr('Card')}
    >
      {title === undefined ? null : (
        <Title id={titleId} className={styles.title}>
          {title}
        </Title>
      )}
      {children}
      {/* Last child, so it paints over the content without a z-index. One tab
          stop and one name, and the visible content is still read normally. */}
      {interactive ? (
        <a
          ref={cover}
          className={styles.cover}
          href={href}
          aria-label={label}
          onClick={routeClick(href, onNavigate)}
        />
      ) : null}
    </Element>
  )
}
