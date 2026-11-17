'use client'

import { useEffect } from 'react'

import { type ComponentStates } from '@polymorph/react'
import { AvatarButton } from '../controls/AvatarButton'
import { Button } from '../controls/Button'
import { Input } from '../controls/Input'
import { Inline } from '../layout/Inline'
import { Stack } from '../layout/Stack'
import { Menu } from '../overlays/Menu'
import { Badge } from '../structure/Badge'
import { Banner } from '../structure/Banner'
import { AppShell } from './AppShell'

/**
 * States fixture, from `design/archetypes/app-shell.md`'s States table.
 *
 * The shell is `100vh`, so a gallery section holding one is a page inside a
 * page. That is intended, because the frame exists to fill a viewport, and any
 * other size would show something the product never renders.
 */

const ITEMS = [
  { icon: 'inbox', label: 'Inbox', current: true, end: '12' },
  { icon: 'archive', label: 'Archive', current: false, end: undefined },
  { icon: 'settings', label: 'Settings', current: false, end: undefined },
] as const

/**
 * The rail, built from the shell's own item. Collapse needs nothing from the
 * caller. `AppShell.NavItem` reads the shell's `[data-collapsed]` and hides its
 * label without losing the accessible name.
 */
function Nav() {
  return (
    <Stack gap={1}>
      {ITEMS.map((item) => (
        <AppShell.NavItem
          key={item.label}
          icon={item.icon}
          label={item.label}
          current={item.current}
          end={item.end === undefined ? undefined : <Badge>{item.end}</Badge>}
        />
      ))}
    </Stack>
  )
}

/**
 * The grouped rail (the sidebar block's structure). Groups are only labelled
 * sections. The rail collapses as a whole, and a group that collapsed on its
 * own would make the current location ambiguous.
 */
function GroupedNav() {
  return (
    <>
      <AppShell.NavGroup label="Platform">
        <AppShell.NavItem icon="inbox" label="Inbox" current end={<Badge>12</Badge>} />
        <AppShell.NavItem icon="add" label="New ticket" />
        <AppShell.NavItem icon="archive" label="Archive" />
      </AppShell.NavGroup>

      <AppShell.NavGroup label="Workspace">
        <AppShell.NavItem icon="team" label="Members" />
        <AppShell.NavItem icon="settings" label="Settings" />
      </AppShell.NavGroup>
    </>
  )
}

/** The rail's foot, with the account control a sidebar usually puts there. */
function User() {
  return (
    <AppShell.UserCard
      name="Rowan Ellis"
      detail="rowan@relay.example"
      end={
        <Menu
          align="end"
          trigger={
            <Button
              variant="ghost"
              tone="neutral"
              size="sm"
              iconOnly
              icon="overflow"
              label="Account"
            />
          }
          items={[
            { label: 'Account settings', icon: 'settings', onSelect: () => {} },
            { kind: 'separator' },
            { label: 'Sign out', icon: 'back', tone: 'danger', onSelect: () => {} },
          ]}
        />
      }
    />
  )
}

/**
 * The account at the end of the topbar, for a frame whose navigation is on
 * top: the rail's foot is where UserCard lives, and a row has no foot.
 */
function Account() {
  return (
    <Menu
      align="end"
      trigger={<AvatarButton name="Rowan Ellis" label="Account" size="sm" />}
      items={[
        { label: 'Account settings', icon: 'settings', onSelect: () => {} },
        { kind: 'separator' },
        { label: 'Sign out', icon: 'back', tone: 'danger', onSelect: () => {} },
      ]}
    />
  )
}

const BRAND = (
  <Badge variant="solid" tone="accent">
    Relay
  </Badge>
)

/**
 * The brand a collapsed rail has room for. The brand slot's content is the
 * application's, and the shell clips what does not fit the narrow rail instead
 * of adapting it, so an application passes a mark while its rail is collapsed.
 */
const MARK = (
  <Badge variant="solid" tone="accent">
    R
  </Badge>
)

/**
 * The open drawer's menu button: the first button in the topbar of the shell
 * whose banner is the info one, which only that entry draws, so a gallery
 * page with every entry presses this entry's button and no other.
 */
const OPEN_DRAWER =
  '[data-member="app-shell"]:has([data-member="banner"][data-tone="info"]) header button'

/** How many frames the press waits for the button before it gives up. */
const PRESS_FRAMES = 60

/**
 * Presses the drawer's menu button once it is drawn, as a reader presses it,
 * because no prop opens the drawer: whether the rail overlays the page is the
 * viewport's decision. Above the breakpoint the button is not drawn, so the
 * entry draws the rail beside the page.
 */
function OpenDrawer() {
  useEffect(() => {
    let frame = 0
    let waited = 0
    const press = () => {
      const button = document.querySelector<HTMLButtonElement>(OPEN_DRAWER)
      // Above the breakpoint the button is not drawn, and a reader cannot press it.
      if (button === null || button.getClientRects().length === 0) {
        if (++waited < PRESS_FRAMES) frame = requestAnimationFrame(press)
        return
      }
      button.click()
    }
    frame = requestAnimationFrame(press)
    return () => cancelAnimationFrame(frame)
  }, [])
  return null
}

export const states: ComponentStates = {
  component: 'AppShell',

  entries: [
    {
      name: 'default — every slot filled',
      render: () => (
        <AppShell
          brand={BRAND}
          sidebar={<Nav />}
          sidebarFooter={<AppShell.NavItem icon="user" label="Rowan" />}
          topbar={{
            leading: <Input size="sm" icon="search" placeholder="Search…" aria-label="Search" />,
            trailing: <Button size="sm" icon="add" label="New ticket" />,
          }}
        >
          <Stack gap={4} p={6}>
            <p>The content region. A page archetype goes here.</p>
          </Stack>
        </AppShell>
      ),
    },

    /*
     * The sidebar block's full rail: grouped nav above, the signed-in user
     * below. Both are shell anatomy, so both adapt to the collapse without the
     * application handling it.
     */
    {
      name: 'grouped rail, with the user at its foot',
      render: () => (
        <AppShell
          brand={BRAND}
          sidebar={<GroupedNav />}
          sidebarFooter={<User />}
          topbar={{
            leading: <Input size="sm" icon="search" placeholder="Search…" aria-label="Search" />,
            trailing: <Button size="sm" icon="add" label="New ticket" />,
          }}
        >
          <Stack gap={4} p={6}>
            <p>The content region. A page archetype goes here.</p>
          </Stack>
        </AppShell>
      ),
    },
    {
      name: 'collapsed',
      render: () => (
        <AppShell
          defaultCollapsed
          brand={MARK}
          sidebar={<Nav />}
          topbar={{ trailing: <Button size="sm" icon="add" label="New ticket" /> }}
        >
          <Stack gap={4} p={6}>
            <p>
              The rail narrows to its glyphs. Every nav item keeps its name — the labels are
              clipped, not unmounted, so a screen reader still hears the whole rail.
            </p>
          </Stack>
        </AppShell>
      ),
      expect: { 'data-collapsed': '' },
    },
    {
      // The spec's second NavGroup entry: the same rail, collapsed. The group
      // titles are removed (a rail of glyphs needs no invisible headings), the
      // user's two lines are clipped, not unmounted, and the account menu leaves
      // the tab order along with its space.
      name: 'grouped rail, collapsed — titles gone, names kept',
      render: () => (
        <AppShell
          defaultCollapsed
          brand={MARK}
          sidebar={<GroupedNav />}
          sidebarFooter={<User />}
          topbar={{ trailing: <Button size="sm" icon="add" label="New ticket" /> }}
        >
          <Stack gap={4} p={6}>
            <p>
              A group's title is a heading for a boundary the eye can no longer see, so it is hidden
              rather than clipped — the group keeps its name for a reader through
              `role=&quot;group&quot;`.
            </p>
          </Stack>
        </AppShell>
      ),
      expect: { 'data-collapsed': '' },
    },
    {
      name: 'no topbar slots — the bar still holds the frame',
      render: () => (
        <AppShell brand={BRAND} sidebar={<Nav />}>
          <Stack gap={4} p={6}>
            <p>An empty topbar is still a topbar: its height and its border are structure.</p>
          </Stack>
        </AppShell>
      ),
    },
    {
      name: 'minimal — sidebar and content, nothing else',
      render: () => (
        <AppShell sidebar={<Nav />}>
          <Stack gap={4} p={6}>
            <p>The least a shell can be.</p>
          </Stack>
        </AppShell>
      ),
    },
    {
      name: 'with a banner — a notice across the frame, above the rail and the topbar',
      render: () => (
        <AppShell
          brand={BRAND}
          sidebar={<Nav />}
          topbar={{ trailing: <Button size="sm" icon="add" label="New ticket" /> }}
          banner={
            <Banner
              tone="warning"
              action={<Button variant="soft" tone="accent" size="sm" label="Upgrade plan" />}
            >
              Your trial ends in 3 days.
            </Banner>
          }
        >
          <Stack gap={4} p={6}>
            <p>The rail and the content region start under the banner. Nothing scrolls under it.</p>
          </Stack>
        </AppShell>
      ),
    },

    /*
     * Two icon-only Buttons with counts in the topbar's trailing slot, each capped. A count grows
     * past its button's end edge: the first over the slot's gap toward its neighbour, the last
     * into the bar's padding at the window's edge.
     */
    {
      name: 'counts in the topbar — a capped count beside a neighbour and at the edge',
      render: () => (
        <AppShell
          brand={BRAND}
          sidebar={<Nav />}
          topbar={{
            trailing: (
              <Inline gap={3} align="center">
                <Button
                  variant="ghost"
                  tone="neutral"
                  iconOnly
                  icon="notification"
                  label="Notifications"
                  count={{ value: 128, label: 'Notifications, 128 unread' }}
                />
                <Button
                  variant="ghost"
                  tone="neutral"
                  iconOnly
                  icon="inbox"
                  label="Inbox"
                  count={{ value: 100, label: 'Inbox, 100 unread' }}
                />
              </Inline>
            ),
          }}
        >
          <Stack gap={4} p={6}>
            <p>Each count starts at its button&rsquo;s centre and grows toward the end edge.</p>
          </Stack>
        </AppShell>
      ),
    },

    /*
     * The navigation on top. The items are the rail's own, passed straight to
     * `sidebar`, because the shell lays out its own parts in the row and a
     * Stack the app wraps them in keeps its column. Below the drawer
     * breakpoint both entries are the same drawer as the rail.
     */
    {
      name: 'navigation on top — the rail’s items lead the topbar',
      render: () => (
        <AppShell
          navigation="top"
          brand={BRAND}
          sidebar={ITEMS.map((item) => (
            <AppShell.NavItem
              key={item.label}
              icon={item.icon}
              label={item.label}
              current={item.current}
              end={item.end === undefined ? undefined : <Badge>{item.end}</Badge>}
            />
          ))}
          topbar={{
            leading: <Input size="sm" icon="search" placeholder="Search…" aria-label="Search" />,
            trailing: <Button size="sm" icon="add" label="New ticket" />,
          }}
        >
          <Stack gap={4} p={6}>
            <p>One navigation landmark, laid along the top. The content region takes the width.</p>
          </Stack>
        </AppShell>
      ),
      expect: { 'data-navigation': 'top' },
    },
    {
      name: 'navigation on top, grouped — a rule between the groups',
      render: () => (
        <AppShell
          navigation="top"
          brand={BRAND}
          sidebar={<GroupedNav />}
          topbar={{ trailing: <Account /> }}
        >
          <Stack gap={4} p={6}>
            <p>
              Each group keeps its name for a reader through `role=&quot;group&quot;`, and the
              account sits at the end of the topbar.
            </p>
          </Stack>
        </AppShell>
      ),
      expect: { 'data-navigation': 'top' },
    },

    /*
     * Below the drawer breakpoint (48rem) the rail leaves the grid and is a
     * drawer over the page, opened from the topbar's menu button. Above it the
     * two entries draw the rail beside the page. The agent conformance law
     * mounts both at a phone's width (`WINDOW_SIZES` in
     * `@polymorph/conformance`).
     */
    {
      name: 'drawer closed — below the breakpoint, the rail behind the topbar’s menu button',
      render: () => (
        <AppShell
          brand={BRAND}
          sidebar={<Nav />}
          topbar={{ trailing: <Button size="sm" icon="add" label="New ticket" /> }}
        >
          <Stack gap={4} p={6}>
            <p>The rail waits off screen until the menu button opens it over the page.</p>
          </Stack>
        </AppShell>
      ),
    },
    {
      name: 'drawer open — below the breakpoint, the rail over the page and the banner',
      render: () => (
        <>
          <OpenDrawer />
          <AppShell
            brand={BRAND}
            sidebar={<GroupedNav />}
            sidebarFooter={<User />}
            topbar={{ trailing: <Button size="sm" icon="add" label="New ticket" /> }}
            banner={<Banner tone="info">Scheduled maintenance tonight from 22:00.</Banner>}
          >
            <Stack gap={4} p={6}>
              <p>The drawer opens over the banner and the topbar, with the group labels.</p>
            </Stack>
          </AppShell>
        </>
      ),
    },

    /*
     * The item on its own. It is start-aligned, which is why it is not a ghost
     * Button. A Button centres its content by design, so its glyph would shift
     * with the label's length and the rail would stop reading as a column.
     */
    {
      name: 'nav item — rest',
      render: () => <AppShell.NavItem icon="inbox" label="Inbox" />,
      expect: { 'data-current': null },
    },
    {
      name: 'nav item — current',
      render: () => <AppShell.NavItem icon="inbox" label="Inbox" current />,
      expect: { 'data-current': '', 'aria-current': 'page' },
    },
    {
      name: 'nav item — with a count',
      render: () => <AppShell.NavItem icon="inbox" label="Inbox" end={<Badge>12</Badge>} />,
    },
    {
      name: 'nav item — no icon',
      render: () => <AppShell.NavItem label="All tickets" />,
    },
    {
      name: 'nav item — a real link, for a rail that navigates',
      render: () => <AppShell.NavItem icon="inbox" label="Inbox" href="#inbox" />,
    },
    {
      name: 'nav item — a long label truncates rather than wrapping',
      render: () => (
        <AppShell.NavItem icon="archive" label="Escalations awaiting a second reviewer" />
      ),
    },

    /* The two parts on their own, at rail width, because truncation can only be
       checked in a narrow column. */
    {
      name: 'nav group — a labelled section',
      render: () => (
        <AppShell.NavGroup label="Platform">
          <AppShell.NavItem icon="inbox" label="Inbox" current />
          <AppShell.NavItem icon="add" label="New ticket" />
        </AppShell.NavGroup>
      ),
    },
    {
      name: 'user card — a mark, two lines and an affordance',
      render: () => (
        <AppShell.UserCard
          name="Rowan Ellis"
          detail="rowan@relay.example"
          end={
            <Button
              variant="ghost"
              tone="neutral"
              size="sm"
              iconOnly
              icon="overflow"
              label="Account"
            />
          }
        />
      ),
    },
    {
      name: 'user card — both lines truncate rather than wrapping the rail',
      render: () => (
        <AppShell.UserCard
          name="Aleksandra Wiśniewska-Kowalczyk"
          detail="aleksandra.wisniewska@northwind-logistics.example"
        />
      ),
    },
  ],

  /*
   * `[data-drawer]` is here and not in `entries` because no prop reaches it, by
   * design: whether the rail overlays the page depends on the viewport. Below
   * `48rem` the topbar gets a `menu` button that sets this attribute. A fixture
   * cannot render that state at gallery width, and this list exists for such
   * states.
   */
  requiredSelectors: [
    '[data-collapsed]',
    '[data-current]',
    '[data-drawer]',
    '[data-navigation="top"]',
    ':hover',
    ':focus-visible',
  ],
}
