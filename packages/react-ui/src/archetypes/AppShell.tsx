import { AppShellRoot, NavGroup, NavItem, UserCard } from './app-shell-parts'
import type { AppShellProps } from './app-shell-parts'

/**
 * The application frame (`design/archetypes/app-shell.md`).
 *
 * It owns the `--pm-shell-*` pattern scope. Those tokens exist only while an
 * AppShell is mounted, and they are declared on its root. Red rule 6 limits
 * every reference to them to the files named in `scoped-token-owners.json`. So
 * changing the topbar height is a one-line change in this component's
 * stylesheet, with no change in `apps/`.
 *
 * The shell provides both the rail and the item that goes in it. `NavItem` in
 * `app-shell-parts.tsx` explains why.
 *
 * It contains no `<h1>`, because the page inside it has exactly one.
 */

export type {
  AppShellProps,
  AppShellTopbar,
  NavGroupProps,
  NavItemProps,
  UserCardProps,
} from './app-shell-parts'

/**
 * The member, in a module without `'use client'`, so a server component can
 * read its parts from it. A client module's export reaches a server component
 * as a reference with no properties, so a part attached there is `undefined`
 * on a server. The frame and the parts are the client module's own exports
 * (`app-shell-parts.tsx`), and this function only renders the frame.
 */
export function AppShell(props: AppShellProps) {
  return <AppShellRoot {...props} />
}
AppShell.NavItem = NavItem
AppShell.NavGroup = NavGroup
AppShell.UserCard = UserCard
