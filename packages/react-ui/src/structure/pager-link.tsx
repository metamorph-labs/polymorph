'use client'

import { type ControlSize, dataAttrs, dataFlag, Icon, type IconRole } from '@polymorph/react'
import { routeClick } from '../controls/navigate'

/**
 * A pager's control drawn as a link (`design/components/pagination.md` and
 * `cursor-pagination.md`). Pagination and CursorPagination share it.
 *
 * When the app gives a pager addresses, a control that goes to another page is
 * an `<a href>`, so a crawler, a new tab and a reader whose script has not
 * loaded can follow it. It looks like the Button it replaces: it sets Button's
 * data attributes, and its class in the pager's recipe composes Button's, as
 * Link's `variant="button"` does.
 *
 * A click the browser would follow in this tab calls the pager's handler in
 * place of the browser's navigation, as Link hands such a click to
 * `onNavigate` (`routeClick`). A click with a modifier key or another button
 * stays the browser's and opens the address.
 *
 * Only a control that can be followed is drawn this way. A control with
 * nowhere to go, a held pager's controls and a busy control stay Buttons,
 * because an `<a>` that cannot be followed is not drawn as a link.
 */

/** The link's classes, from the pager's own recipe: the control, its label and its glyph. */
export interface PagerLinkClasses {
  link: string | undefined
  label: string | undefined
  glyph: string | undefined
}

export interface PagerLinkProps {
  classes: PagerLinkClasses
  href: string
  /** The pager's handler, called for a click that would navigate this tab. */
  onFollow: () => void
  /** The variant of the Button the link replaces. */
  variant: 'ghost' | 'outline'
  size: ControlSize
  /** A leading icon. It is decorative, because the label names the control. */
  icon?: IconRole
  trailingIcon?: IconRole
  /** Square, as Button's `iconOnly`. `label` is then the accessible name. */
  iconOnly?: boolean
  /** The visible text, or the accessible name when `iconOnly`. */
  label: string
  /** The accessible name when it says more than the visible text (`Page 3` for `3`). */
  'aria-label'?: string
}

export function PagerLink({
  classes,
  href,
  onFollow,
  variant,
  size,
  icon,
  trailingIcon,
  iconOnly = false,
  label,
  'aria-label': ariaLabel,
}: PagerLinkProps) {
  return (
    <a
      className={classes.link}
      href={href}
      aria-label={ariaLabel ?? (iconOnly ? label : undefined)}
      onClick={routeClick(href, onFollow)}
      // Every control a pager draws as a link is neutral. The one accent control, the current
      // page, is never a link.
      {...dataAttrs({ variant, tone: 'neutral', size })}
      {...dataFlag('icon-only', iconOnly)}
    >
      {icon === undefined ? null : (
        <span className={classes.glyph}>
          <Icon name={icon} size={size} />
        </span>
      )}

      {iconOnly ? null : <span className={classes.label}>{label}</span>}

      {trailingIcon === undefined || iconOnly ? null : (
        <span className={classes.glyph}>
          <Icon name={trailingIcon} size={size} />
        </span>
      )}
    </a>
  )
}
