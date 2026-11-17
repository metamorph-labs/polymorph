import { setMode } from '@polymorph/react'
import {
  AppShell,
  Badge,
  Button,
  Command,
  Menu,
  Stack,
  Toaster,
  Tooltip,
  TooltipProvider,
  type CommandItem,
} from '@polymorph/react-ui'
import { useEffect, useMemo, useState } from 'react'

import { navigate, useThemeAttributes } from '../harness'
import { DetailPage } from './DetailPage'
import { InboxPage } from './InboxPage'
import { NewTicketPage } from './NewTicketPage'
import { RELAY_ROOT } from './routes'
import { SettingsPage } from './SettingsPage'
import { TICKETS, type Ticket } from './tickets'
import { WhatsNew } from './WhatsNew'

/**
 * Relay, the demo product inside the workbench: a support inbox. Its key result is the number of
 * declared exceptions.
 *
 * The repository's claim is that a real product can be built with no style decisions in
 * application code, and that any unavoidable one is declared rather than hidden.
 * `pnpm inventory` reports exactly two exceptions across Relay's screens:
 *
 *   rung 2  InboxPage.tsx   DensityScope  compact
 *   rung 4  WhatsNew.tsx    Bespoke       the promo illustration
 *
 * Everything else is vocabulary: four screens, a table, a validated form, a confirm dialog, a
 * command palette, toasts, tooltips and four live theme axes. There is no stylesheet, no
 * `className` and no `style` outside the declared zone, and the red rules enforce that.
 *
 * The topbar's leading slot holds the command palette's trigger. A search field wired to nothing
 * would look functional but do nothing. A palette provides what such a field suggests, so the
 * slot holds a working trigger instead.
 *
 * The ticket detail, the fourth screen, needs no third exception, which is the result that
 * matters for a new screen.
 */

const SCREENS = {
  inbox: { path: RELAY_ROOT, label: 'Inbox', icon: 'inbox' },
  new: { path: `${RELAY_ROOT}/new`, label: 'New ticket', icon: 'add' },
  settings: { path: `${RELAY_ROOT}/settings`, label: 'Settings', icon: 'settings' },
} as const

type ScreenName = keyof typeof SCREENS

/**
 * The rail, in sections.
 *
 * Three rows do not need grouping for length. The groups show a distinction: the two ticket
 * screens sit together, and the settings screen sits apart. A flat list would suggest the three
 * rows are the same kind of thing, and they are not.
 */
const NAV_GROUPS: readonly { label: string; screens: readonly ScreenName[] }[] = [
  { label: 'Platform', screens: ['inbox', 'new'] },
  { label: 'Workspace', screens: ['settings'] },
]

function screenFor(pathname: string): ScreenName {
  if (pathname.startsWith(SCREENS.new.path)) return 'new'
  if (pathname.startsWith(SCREENS.settings.path)) return 'settings'
  return 'inbox'
}

/**
 * An open ticket is a route, not a piece of state.
 *
 * `/relay/t/T-2041` needs one function and provides three things that state would have to
 * reimplement: the back button works as expected, a ticket can be linked to, and navigating away
 * closes it automatically. It is not a `SCREENS` entry on purpose. The rail lists places, and a
 * ticket is not one, so the inbox stays the current item while a ticket is open.
 */
const TICKET_ROOT = `${RELAY_ROOT}/t/`

function ticketFor(pathname: string): Ticket | undefined {
  if (!pathname.startsWith(TICKET_ROOT)) return undefined
  const id = pathname.slice(TICKET_ROOT.length)
  return TICKETS.find((ticket) => ticket.id === id)
}

export interface RelayAppProps {
  route: string
}

export function RelayApp({ route }: RelayAppProps) {
  const screen = screenFor(route)
  const openTicket = ticketFor(route)
  const [collapsed, setCollapsed] = useState(false)
  const [palette, setPalette] = useState(false)
  const attributes = useThemeAttributes()
  const dark = attributes.mode === 'dark'

  /**
   * The ⌘K binding. It is here because the spec says a global hotkey is application policy, not
   * vocabulary (`command.md`). The palette receives only `open`, and Relay decides what opens it.
   * So the same component can be a ⌘K palette in one product and a toolbar button's panel in
   * another.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      setPalette((open) => !open)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  /**
   * Every command does something and every command is bound. There are no `hint`s, because the
   * palette renders a hint as a `Kbd`, and showing a shortcut that nothing listens for misleads
   * like a search field wired to nothing. Relay binds exactly one shortcut, the one that opens the
   * palette.
   *
   * `keywords` are not shown. "queue" finds the inbox and "appearance" finds the theme controls.
   * They are why a palette works better than a menu: the user's word for a thing does not have
   * to match the product's word.
   */
  const commands: CommandItem[] = useMemo(
    () => [
      {
        id: 'inbox',
        label: 'Go to inbox',
        icon: 'inbox',
        group: 'Go to',
        keywords: ['queue', 'tickets', 'conversations'],
        onSelect: () => navigate(SCREENS.inbox.path),
      },
      {
        id: 'new',
        label: 'New ticket',
        icon: 'add',
        group: 'Go to',
        keywords: ['create', 'raise', 'report'],
        onSelect: () => navigate(SCREENS.new.path),
      },
      {
        id: 'settings',
        label: 'Go to settings',
        icon: 'settings',
        group: 'Go to',
        keywords: ['appearance', 'theme', 'preferences', 'notifications'],
        onSelect: () => navigate(SCREENS.settings.path),
      },
      {
        id: 'rail',
        label: collapsed ? 'Expand the sidebar' : 'Collapse the sidebar',
        icon: collapsed ? 'expand' : 'collapse',
        group: 'View',
        keywords: ['rail', 'navigation'],
        onSelect: () => setCollapsed((current) => !current),
      },
      {
        id: 'mode',
        label: dark ? 'Switch to light mode' : 'Switch to dark mode',
        icon: dark ? 'mode-light' : 'mode-dark',
        group: 'View',
        keywords: ['appearance', 'theme', 'contrast'],
        onSelect: () => setMode(dark ? 'light' : 'dark'),
      },
    ],
    [collapsed, dark],
  )

  return (
    // One provider for the whole product, as the Tooltip spec requires. The skip delay is shared,
    // so moving between two tooltips does not wait for the open delay again.
    <TooltipProvider>
      <AppShell
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        brand={
          <Badge variant="solid" tone="accent">
            {collapsed ? 'R' : 'Relay'}
          </Badge>
        }
        sidebar={
          <>
            {NAV_GROUPS.map((group) => (
              <AppShell.NavGroup key={group.label} label={group.label}>
                {group.screens.map((name) => (
                  <AppShell.NavItem
                    key={name}
                    icon={SCREENS[name].icon}
                    label={SCREENS[name].label}
                    current={screen === name}
                    end={name === 'inbox' ? <Badge>{String(TICKETS.length)}</Badge> : undefined}
                    onSelect={() => navigate(SCREENS[name].path)}
                  />
                ))}
              </AppShell.NavGroup>
            ))}
          </>
        }
        /*
         * Two items, and the difference between them is the shell's collapse rule.
         *
         * The promo panel is content the shell did not compose. It cannot be read in a 48px
         * rail, and rendering it anyway would leave an unreadable mess behind the icons. So the
         * page must not render it when the rail is collapsed. That is what the spec means by "the
         * demo product proves it".
         *
         * The user card is part of the shell, so it needs no such handling. It narrows to its
         * avatar on its own, keeps the name for screen readers, and removes the account menu from
         * the tab order rather than leaving a clipped, invisible button. The application is not
         * notified that the rail collapsed.
         */
        sidebarFooter={
          <Stack gap={3}>
            {collapsed ? null : <WhatsNew />}
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
                  /*
                   * Both items do something, like every command in the palette. A "Sign out"
                   * row here, with nothing to sign out of, would be a control that does
                   * nothing, which the palette trigger exists to avoid.
                   */
                  items={[
                    {
                      label: 'Account settings',
                      icon: 'settings',
                      onSelect: () => navigate(SCREENS.settings.path),
                    },
                    { kind: 'separator' },
                    {
                      label: dark ? 'Switch to light mode' : 'Switch to dark mode',
                      icon: dark ? 'mode-light' : 'mode-dark',
                      onSelect: () => setMode(dark ? 'light' : 'dark'),
                    },
                  ]}
                />
              }
            />
          </Stack>
        }
        topbar={{
          /*
           * The visible trigger for the command palette. Most people never discover a palette
           * that only ⌘K opens. The shortcut is in the tooltip rather than the accessible name, so
           * a screen reader announces what the control does, and a returning user sees the
           * shortcut.
           */
          leading: (
            <Tooltip content="Command palette — ⌘K">
              <Button
                variant="outline"
                tone="neutral"
                size="sm"
                icon="search"
                label="Search everything"
                onClick={() => setPalette(true)}
              />
            </Tooltip>
          ),
          /*
           * Not a second "New ticket". The page's primary action is already in the ListPage
           * header, and two identical solid buttons close together would mean the frame and the
           * page disagree about which owns the action. The frame's slot holds something that
           * applies to the whole product instead.
           */
          trailing:
            (
              /*
               * One identity control, not two. The rail's footer shows who is signed in and holds
               * the account menu. A topbar button with the same name nearby would mean the frame
               * and the rail disagree about which owns identity. The same reasoning keeps "New
               * ticket" out of this slot.
               */
              <Tooltip content="3 unread notifications">
                <Button
                  variant="ghost"
                  tone="neutral"
                  size="sm"
                  iconOnly
                  icon="notification"
                  label="Notifications"
                />
              </Tooltip>
            ),
        }}
      >
        {screen === 'new' ? (
          <NewTicketPage onDone={() => navigate(SCREENS.inbox.path)} />
        ) : screen === 'settings' ? (
          <SettingsPage />
        ) : openTicket === undefined ? (
          <InboxPage
            onNewTicket={() => navigate(SCREENS.new.path)}
            onOpenTicket={(ticket) => navigate(`${TICKET_ROOT}${ticket.id}`)}
          />
        ) : (
          <DetailPage ticket={openTicket} onBack={() => navigate(SCREENS.inbox.path)} />
        )}
      </AppShell>

      {/* Both are mounted once, at the product root, because a toast viewport and a command
          palette belong to the application, not to whichever screen is open. */}
      <Command
        open={palette}
        onOpenChange={setPalette}
        items={commands}
        placeholder="Search commands…"
      />
      <Toaster />
    </TooltipProvider>
  )
}
