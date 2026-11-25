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
} from 'react'

import {
  anchorFocusReturns,
  arriveAtPage,
  currentRailDestination,
  dataFlag,
  goToRailDestination,
  Icon,
  memberAttr,
  railDestinations,
  useAgentMember,
  type IconRole,
  type RailClasses,
} from '@polymorph/react'
import { Button } from '../controls/Button'
import { routeClick } from '../controls/navigate'
import { Tooltip, TooltipProvider } from '../overlays/Tooltip'
import { Avatar } from '../structure/Avatar'
import styles from '@polymorph/recipes/archetypes/app-shell.module.css'
import { usePageTransition } from '../conventions/PageTransitions'

/**
 * AppShell's frame and the parts of its rail, which need a browser: the
 * collapsed rail, the drawer below the breakpoint and the routed links.
 * `AppShell.tsx` is the member: it attaches the parts to the frame in a module
 * a server can evaluate.
 */

export interface AppShellTopbar {
  leading?: ReactNode
  trailing?: ReactNode
}

export interface AppShellProps {
  /** Application-localized navigation names. */
  messages?: {
    primaryNavigation: string
    expandSidebar: string
    collapseSidebar: string
    closeNavigation: string
    openNavigation: string
    /**
     * The skip link's text, which is the first thing a keyboard user reaches on
     * every page. It is optional, unlike the other five, only so that hosts
     * that already pass those five still compile. A localized host passes all
     * six.
     */
    skipToContent?: string
  }
  /** Nav content, from the vocabulary. */
  sidebar: ReactNode
  /**
   * Where the navigation is drawn at frame widths. `'rail'` is the column at
   * the frame's start. `'top'` lays the same navigation along the frame's top
   * row, before the topbar's slots, and the rail's width collapse does not
   * apply. Below the drawer breakpoint both are the same drawer.
   */
  navigation?: 'rail' | 'top'
  brand?: ReactNode
  sidebarFooter?: ReactNode
  topbar?: AppShellTopbar
  /**
   * One `Banner`: the notice that holds on every page until its cause ends.
   *
   * It takes a row of its own across the frame, above the rail and the topbar,
   * so the rail and the content region shorten by its height and nothing
   * scrolls under it.
   */
  banner?: ReactNode
  /**
   * A floating layer pinned to the bottom of the content region, for a
   * product's always-present control (a prompt, a player, a selection bar).
   *
   * It shares the content area's grid cell instead of taking its own row. So
   * it floats over the page instead of shortening it, and it re-centres on the
   * content when the rail collapses, because the cell moves. The layer ignores
   * the pointer and its children re-enable it, so the space around the
   * floating control still belongs to the page underneath.
   *
   * A dock overlays content, so a page with a dock leaves room at its bottom.
   */
  dock?: ReactNode
  collapsed?: boolean
  defaultCollapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  /** A bounded, responsive reading surface for pages composed directly from controls. */
  contentLayout?: 'full' | 'page'
  /**
   * Presentation identity for page arrivals; does not key or remount children. A new key
   * also closes the small-viewport drawer.
   */
  transitionKey?: string
  pending?: boolean
  children: ReactNode
}

const CONTENT_ID = 'content'

/**
 * Whether the rail is collapsed, for the items inside it.
 *
 * When collapsed, the label is clipped, not unmounted, so the accessible name
 * remains. A sighted pointer user would still see only a glyph, so a collapsed
 * item shows its label as a tooltip. The item cannot read the shell's
 * `[data-collapsed]` from JavaScript without a DOM query, so the shell passes
 * it down through context.
 */
const CollapsedContext = createContext(false)

const DEFAULT_SKIP_TO_CONTENT = 'Skip to content'

/** The classes the recipe gives a NavItem and its label, by which an agent reads the rail. */
const RAIL_CLASSES: RailClasses = { item: styles.navItem, label: styles.navLabel }

export function AppShellRoot({
  messages = {
    primaryNavigation: 'Primary',
    expandSidebar: 'Expand sidebar',
    collapseSidebar: 'Collapse sidebar',
    closeNavigation: 'Close navigation',
    openNavigation: 'Open navigation',
  },
  sidebar,
  navigation = 'rail',
  brand,
  sidebarFooter,
  topbar,
  banner,
  dock,
  collapsed: collapsedProp,
  defaultCollapsed,
  onCollapsedChange,
  contentLayout = 'full',
  transitionKey,
  pending = false,
  children,
}: AppShellProps) {
  const transition = usePageTransition(transitionKey, pending)
  const [uncontrolled, setUncontrolled] = useState(defaultCollapsed ?? false)
  const held = collapsedProp ?? uncontrolled

  /*
   * The collapse narrows the rail, and a navigation on top has no rail to
   * narrow, so it is not drawn there. The value is kept, so a frame that goes
   * back to the rail draws the collapse it holds.
   */
  const collapsed = navigation === 'rail' && held

  /*
   * The small-viewport drawer. It is deliberately uncontrolled. Whether the
   * rail overlays the page depends on the viewport, not the application, and a
   * prop would let a screen hold the drawer open on a desktop, where there is
   * no drawer.
   */
  const [drawer, setDrawer] = useState(false)
  const rail = useRef<HTMLElement>(null)
  const drawerToggle = useRef<HTMLSpanElement>(null)
  const railId = useId()

  /*
   * A new page closes the drawer, as it does on iOS and Android. With the app's
   * own router the shell stays mounted from page to page, so a drawer left open
   * would cover the page the reader just chose from it. The state is adjusted
   * while rendering, so the drawer is never drawn open over the new page.
   */
  const [shownKey, setShownKey] = useState(transitionKey)
  if (shownKey !== transitionKey) {
    setShownKey(transitionKey)
    setDrawer(false)
  }

  /*
   * Focus follows the drawer, because the rail comes before the topbar in the
   * DOM. Without this, opening the drawer from the topbar button and pressing
   * Tab would move past the navigation that just opened. Opening moves focus
   * into the landmark, and closing returns it to the button that opened it,
   * when focus was in the rail or nowhere. A page change that closes the drawer
   * moves focus to the new page instead (below).
   *
   * The button is reached through a wrapper this component renders, not
   * through a ref on the control. Governed controls deliberately forward no
   * ref, because their props are their whole API (no `className`, `style` or
   * ref passthrough).
   */
  const opened = useRef(false)
  useEffect(() => {
    const was = opened.current
    opened.current = drawer
    // Skip the initial render. Act only on a real open or close.
    if (!drawer && !was) return

    // The rail is `visibility: hidden` while the drawer is closed, and focusing
    // a hidden element silently does nothing. That is why the stylesheet removes
    // `visibility` from the transition when opening. The comment there covers
    // the other half of this.
    if (drawer) rail.current?.focus()
    else if (
      drawerToggle.current !== null &&
      anchorFocusReturns(drawerToggle.current, rail.current)
    )
      drawerToggle.current.querySelector('button')?.focus()
  }, [drawer])

  /*
   * While the drawer is open it is the only part of the frame a reader reaches:
   * the rest is `inert` (below), and Escape closes it, as it closes every
   * surface over the page. A key another layer took, such as Escape closing a
   * menu opened from the rail, is that layer's.
   *
   * The drawer exists only below the breakpoint, which the stylesheet decides.
   * A window that grows past it while the drawer is open closes the drawer,
   * because the frame drawn there has no drawer and an inert page would be
   * unreachable. The drawer's button is drawn exactly where the drawer exists,
   * so its box says which side of the breakpoint the window is on.
   */
  useEffect(() => {
    if (!drawer) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setDrawer(false)
    }
    const toggleBox = drawerToggle.current
    const observer = new ResizeObserver(() => {
      if (toggleBox !== null && getComputedStyle(toggleBox).display === 'none') setDrawer(false)
    })
    if (toggleBox !== null) observer.observe(toggleBox)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      observer.disconnect()
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [drawer])

  /*
   * A new page moves focus to it and says its title (`arriveAtPage`), because
   * the shell stays mounted while the app's router changes the page, and the
   * browser does neither for such a change. The first page is not an arrival:
   * the browser has already loaded it. A page that is still loading
   * (`pending`) arrives when it is drawn.
   */
  const content = transition.ref
  const announcer = useRef<HTMLDivElement>(null)
  const arrived = useRef(transitionKey)
  useEffect(() => {
    if (pending || transitionKey === arrived.current) return
    arrived.current = transitionKey
    return arriveAtPage(content.current, announcer.current)
  }, [content, pending, transitionKey])

  const toggle = useCallback(() => {
    const next = !held
    setUncontrolled(next)
    onCollapsedChange?.(next)
  }, [held, onCollapsedChange])

  /*
   * An agent reads the collapse and the drawer, collapses and expands the rail through the
   * shell's own toggle, and opens and closes the drawer as a press on its menu button does. The
   * collapse control is not drawn below the breakpoint or with the navigation on top, and the
   * menu button is not drawn above the breakpoint, which the recipe decides, so an action
   * refuses while its control is hidden. The two controls are the shell's own and are withheld;
   * the slots' members are the app's.
   *
   * The app composes the rail's items as children, so the shell reads its destinations from its
   * rail in the document, and goes to one by pressing the item, as a person's press does.
   */
  const railToggle = useRef<HTMLDivElement>(null)
  function narrowable(): void {
    const control = railToggle.current
    if (control === null || getComputedStyle(control).display === 'none') {
      throw new Error(
        'The rail has no width to change here: below the breakpoint it is a drawer, and with the navigation on top there is no rail.',
      )
    }
  }
  function drawable(): void {
    const control = drawerToggle.current
    if (control === null || getComputedStyle(control).display === 'none') {
      throw new Error(
        'There is no drawer here: above the breakpoint the navigation is drawn beside the page or along its top.',
      )
    }
  }
  useAgentMember({
    member: 'AppShell',
    element: () => rail.current,
    state: () => ({
      collapsed,
      open: drawer,
      destinations: railDestinations(rail.current, RAIL_CLASSES),
      current: currentRailDestination(rail.current, RAIL_CLASSES),
    }),
    actions: {
      collapse: () => {
        narrowable()
        if (!held) toggle()
      },
      expand: () => {
        narrowable()
        if (held) toggle()
      },
      open: () => {
        drawable()
        setDrawer(true)
      },
      close: () => {
        drawable()
        setDrawer(false)
      },
      go: { argument: 'id', run: (id) => goToRailDestination(rail.current, RAIL_CLASSES, id) },
    },
    withholds: () => [railToggle.current, drawerToggle.current],
  })

  return (
    /*
     * The shell provides the tooltip context because it uses a tooltip: a
     * collapsed NavItem opens one. A component that throws unless its caller
     * installed a provider has an undeclared dependency. Nesting inside an
     * app-level provider is fine, because the delays are the same two constants
     * either way.
     */
    <TooltipProvider>
      <CollapsedContext value={collapsed}>
        <div
          className={styles.shell}
          data-collapsed={collapsed ? '' : undefined}
          data-navigation={navigation === 'top' ? 'top' : undefined}
          data-drawer={drawer ? '' : undefined}
          {...memberAttr('AppShell')}
        >
          {/* First in the DOM, and invisible until it receives keyboard focus.
            Everything but the rail and the scrim is `inert` while the drawer is
            open, so Tab and a screen reader stay in the drawer. */}
          <a className={styles.skip} href={`#${CONTENT_ID}`} inert={drawer}>
            {messages.skipToContent ?? DEFAULT_SKIP_TO_CONTENT}
          </a>

          {/* Before the rail in the document, so it is read first on every page. */}
          {banner === undefined ? null : (
            <div className={styles.banner} inert={drawer}>
              {banner}
            </div>
          )}

          {/* `tabIndex={-1}` only so the drawer can focus the landmark. It is
            not a tab stop, and above the breakpoint nothing focuses it.

            With `navigation="top"` it is the same element in the same place:
            the stylesheet lays it at the start of the top row, so the
            document's order is still the order a reader sees, and below the
            breakpoint it is the same drawer. */}
          <nav
            ref={rail}
            id={railId}
            className={styles.sidebar}
            aria-label={messages.primaryNavigation}
            tabIndex={-1}
          >
            {/* The head holds the brand and the rail's width toggle, on the row
                aligned with the topbar. The toggle is not at the foot because
                the foot holds the account. A control that resizes the rail
                belongs beside the brand it resizes, where the user is already
                looking. It renders with or without a brand, because the rail
                can always be narrowed, so the toggle is anatomy, not content. */}
            <div className={styles.railHead}>
              {brand === undefined ? null : <div className={styles.brand}>{brand}</div>}

              <div ref={railToggle} className={styles.toggle}>
                <Button
                  variant="ghost"
                  tone="neutral"
                  size="sm"
                  iconOnly
                  icon={collapsed ? 'next' : 'previous'}
                  label={collapsed ? messages.expandSidebar : messages.collapseSidebar}
                  onClick={toggle}
                />
              </div>
            </div>

            <div className={styles.nav}>{sidebar}</div>

            {sidebarFooter === undefined ? null : (
              <div className={styles.sidebarFooter}>{sidebarFooter}</div>
            )}
          </nav>

          {/* The bar renders even when empty, because its height and border hold
            the frame together. */}
          <header className={styles.topbar} inert={drawer}>
            <div className={styles.topbarSlot}>
              {/* The drawer toggle, hidden above the breakpoint by CSS and not
                by a JavaScript media query, so the layout decision stays in the
                stylesheet. */}
              <span ref={drawerToggle} className={styles.drawerToggle}>
                <Button
                  variant="ghost"
                  tone="neutral"
                  size="sm"
                  iconOnly
                  icon="menu"
                  label={drawer ? messages.closeNavigation : messages.openNavigation}
                  expanded={drawer}
                  aria-controls={railId}
                  onClick={() => setDrawer(!drawer)}
                />
              </span>
              {topbar?.leading}
            </div>
            <div className={styles.topbarSlot}>{topbar?.trailing}</div>
          </header>

          {/* A real button, so the drawer can be closed by keyboard as well as by
            tapping beside it. */}
          {drawer ? (
            <button
              type="button"
              className={styles.scrim}
              aria-label={messages.closeNavigation}
              onClick={() => setDrawer(false)}
            />
          ) : null}

          {/* `tabIndex={-1}` so the skip link and a page change can move focus
            into the region. It is not a tab stop. */}
          <main
            {...transition}
            className={[styles.content, transition.className].filter(Boolean).join(' ')}
            id={CONTENT_ID}
            tabIndex={-1}
            inert={drawer}
          >
            {contentLayout === 'page' ? <div className={styles.page}>{children}</div> : children}
          </main>

          {dock === undefined ? null : (
            <div className={styles.dock} inert={drawer}>
              {dock}
            </div>
          )}

          {/* Says a new page's title. Empty until the first page change, because
            a region that mounts with its words in it announces nothing. */}
          <div ref={announcer} className={styles.announcer} role="status" />
        </div>
      </CollapsedContext>
    </TooltipProvider>
  )
}

/**
 * A row in the rail (`app-shell.md` § AppShell.NavItem).
 *
 * A nav item is not a ghost Button. A Button centres its content and has no
 * alignment prop by design, so a stretched Button cannot be a nav row: the
 * glyph would shift with the label's length. Under the promotion rule (repeated
 * escape-hatch use for a recurring need means the pattern joins the
 * vocabulary), the shell owns its item, as ListPage owns its slots.
 *
 * It is `AppShell.NavItem`, not a top-level export, because it is not
 * vocabulary on its own. Outside the rail it has no meaning, and inside it
 * reads the shell's `[data-collapsed]` to decide what to show.
 */
export interface NavItemProps {
  /** Expected in practice, because a collapsed rail is unusable without icons. */
  icon?: IconRole
  /** The accessible name in every mode, including collapsed. */
  label: string
  /** Marks the current page, with exactly one per rail. */
  current?: boolean
  /**
   * The root swap (`link.md`). With an `href`, the row renders as an `<a>`
   * with Link's semantics and NavItem's styling. So middle-click, copy link and
   * the browser's status bar work, which a click handler on a button cannot
   * provide. Rail items rendered as buttons cannot be opened in a new tab.
   */
  href?: string
  /**
   * The app's router, on a row with an `href`, as on Link (`link.md` §Routing):
   * a click that would navigate this tab calls it in place of the browser, and
   * a click that opens a tab or a window stays the browser's.
   */
  onNavigate?: (href: string) => void
  /**
   * For a rail of buttons that routes in JavaScript with no `href`. It also
   * fires on every click of a row with an `href`, one that opens a new tab
   * included, so a router uses `onNavigate` there.
   */
  onSelect?: () => void
  /** Trailing content, by convention a Badge with a count. */
  end?: ReactNode
}

export function NavItem({
  icon,
  label,
  current = false,
  href,
  onNavigate,
  onSelect,
  end,
}: NavItemProps) {
  const collapsed = useContext(CollapsedContext)

  const body = (
    <>
      {icon === undefined ? null : (
        <span className={styles.navGlyph}>
          <Icon name={icon} />
        </span>
      )}
      <span className={styles.navLabel}>{label}</span>
      {end === undefined ? null : <span className={styles.navEnd}>{end}</span>}
    </>
  )

  // The accessible name is always the label, in both roots. When the rail
  // collapses the text is hidden, not unmounted, so the name works with no
  // extra API.
  const shared = {
    className: styles.navItem,
    'aria-current': current ? ('page' as const) : undefined,
    ...dataFlag('current', current),
  }

  const route = href === undefined ? undefined : routeClick(href, onNavigate)

  const row =
    href === undefined ? (
      <button type="button" {...shared} onClick={onSelect}>
        {body}
      </button>
    ) : (
      // The row stays a real link with a real destination, and `onNavigate`
      // routes only the clicks that would navigate this tab. That is why this
      // is a root swap and not a second component.
      <a
        {...shared}
        href={href}
        onClick={(event) => {
          onSelect?.()
          route?.(event)
        }}
      >
        {body}
      </a>
    )

  /*
   * A collapsed rail shows only glyphs. The accessible name remains, because
   * the label is clipped and not unmounted, so screen readers are unaffected.
   * The tooltip is for sighted pointer users, who would otherwise see only a
   * glyph.
   *
   * The tooltip appears only while collapsed, because a tooltip that repeats a
   * visible label is the standard tooltip misuse.
   */
  return collapsed ? (
    <Tooltip content={label} side="right">
      {row}
    </Tooltip>
  ) : (
    row
  )
}

/**
 * A labelled section of the rail (`app-shell.md` § AppShell.NavGroup).
 *
 * A rail is made of groups, not a flat list. That is the common sidebar
 * composition and the one the archetypes use. With five archetypes and a
 * product on top, a rail of eight ungrouped rows is too long to scan.
 *
 * When the rail collapses, the label is hidden, not clipped. This is the one
 * difference from NavItem. A rail of glyphs needs no invisible headings
 * between them, and a screen reader still gets the structure from
 * `role="group"` and the group's name. The spec requires this, because a
 * clipped heading would announce a section boundary that is no longer drawn.
 *
 * Collapsible groups are deliberately out of scope. The rail already collapses
 * as a whole, and two independent collapse mechanisms would make the current
 * location ambiguous.
 */
export interface NavGroupProps {
  /** The section's name (`label`, as in NavItem), one or two words. */
  label: string
  /** NavItems. */
  children: ReactNode
}

export function NavGroup({ label, children }: NavGroupProps) {
  return (
    // Named, not headed. `role="group"` with `aria-label` remains when the
    // collapse hides the visible label. A rail is also not a document outline,
    // and an `<h2>` per section inside a `<nav>` would put five headings above
    // the page's own.
    <div className={styles.navGroup} role="group" aria-label={label}>
      <span className={styles.navGroupLabel}>{label}</span>
      {children}
    </div>
  )
}

/**
 * The rail's foot, showing the signed-in user (`app-shell.md` § AppShell.UserCard).
 *
 * It is built into the shell instead of composed. That needs explaining,
 * because the vocabulary prefers composition. An Avatar, two lines and a
 * control can be composed from existing members, but the result does not work
 * well, for three layout reasons:
 *
 *  - The second line has no suitable style. `Text`'s lowest tone is `secondary`
 *    by design and its steps stop at `sm`, so a composed name and detail get the
 *    same size and nearly the same colour. They read as two names, not a name
 *    and an address.
 *  - Nothing truncates. In a 224px rail, minus an avatar, a gap and the
 *    control, an email has about 120px. The rail's `overflow: hidden` then clips
 *    it mid-glyph, which is not an ellipsis.
 *  - It cannot handle the collapse. The shell clips rail content it did not
 *    compose, so the application would have to stop rendering a composed card at
 *    48px. `WhatsNew` has to do exactly that, and a member does not.
 *
 * The first two reasons are why it is not a composition. The third is why it
 * belongs to the shell. It is `AppShell.UserCard`, not vocabulary, for the same
 * reason as NavItem: outside the rail it has no meaning, and inside it reads
 * the shell's `[data-collapsed]` to decide what to show.
 *
 * It is not interactive. Many sidebars make the whole row a dropdown trigger.
 * Here the control is a slot, so the shell does not manage menus and the row's
 * text stays selectable. `end` holds a Menu by convention.
 */
export interface UserCardProps {
  /** The first line. Initials and the identity colour are derived from it. */
  name: string
  /** The second line, such as an email, a role or the signed-in workspace. */
  detail: string
  /** The avatar image, which falls back to initials and then to a glyph, as in Avatar. */
  src?: string
  /** The control at the row's end, by convention a Menu, hidden when collapsed. */
  end?: ReactNode
}

export function UserCard({ name, detail, src, end }: UserCardProps) {
  return (
    <div className={styles.userCard}>
      {/*
       * Deliberately unlabelled. The name is beside it in every mode, and when the
       * rail is narrow it is clipped but still in the accessibility tree. A
       * labelled avatar would announce the name twice. Avatar's spec sets this
       * rule.
       */}
      <Avatar name={name} src={src} size="md" />

      <span className={styles.userText}>
        <span className={styles.userName}>{name}</span>
        <span className={styles.userDetail}>{detail}</span>
      </span>

      {end === undefined ? null : <span className={styles.userEnd}>{end}</span>}
    </div>
  )
}
