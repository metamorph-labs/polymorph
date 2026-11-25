import {
  cond,
  describeMember,
  el,
  flag,
  fx,
  identity,
  js,
  lit,
  member,
  node,
  render,
  run,
  slot,
  text,
  when,
  type FixtureChild,
  type Node,
} from '../dsl'
import { NAVIGATES_HERE } from './link'

/* -------------------------------------------------------------------------- */
/* The fixture's rail                                                         */
/* -------------------------------------------------------------------------- */

const count = (value: string): FixtureChild => fx('Badge', {}, { default: [value] })

/** The rail's items, which a navigation on top takes without a Stack around them. */
const NAV_ITEMS: FixtureChild[] = [
  fx('AppShellNavItem', { icon: 'inbox', label: 'Inbox', current: true }, { end: [count('12')] }),
  fx('AppShellNavItem', { icon: 'archive', label: 'Archive', current: false }),
  fx('AppShellNavItem', { icon: 'settings', label: 'Settings', current: false }),
]

/** The rail, built from the shell's own item, which reads the shell's collapse. */
const NAV: FixtureChild = fx('Stack', { gap: 1 }, { default: NAV_ITEMS })

/** The grouped rail: groups are labelled sections, and the rail collapses as a whole. */
const GROUPED_NAV: FixtureChild[] = [
  fx(
    'AppShellNavGroup',
    { label: 'Platform' },
    {
      default: [
        fx(
          'AppShellNavItem',
          { icon: 'inbox', label: 'Inbox', current: true },
          { end: [count('12')] },
        ),
        fx('AppShellNavItem', { icon: 'add', label: 'New ticket' }),
        fx('AppShellNavItem', { icon: 'archive', label: 'Archive' }),
      ],
    },
  ),
  fx(
    'AppShellNavGroup',
    { label: 'Workspace' },
    {
      default: [
        fx('AppShellNavItem', { icon: 'team', label: 'Members' }),
        fx('AppShellNavItem', { icon: 'settings', label: 'Settings' }),
      ],
    },
  ),
]

const ACCOUNT = fx('Button', {
  variant: 'ghost',
  tone: 'neutral',
  size: 'sm',
  iconOnly: true,
  icon: 'overflow',
  label: 'Account',
})

/** The rail's foot, with the account control a sidebar usually puts there. */
const USER = fx(
  'AppShellUserCard',
  { name: 'Rowan Ellis', detail: 'rowan@relay.example' },
  {
    end: [
      fx(
        'Menu',
        {
          align: 'end',
          items: [
            { label: 'Account settings', icon: 'settings', onSelect: js('() => {}') },
            { kind: 'separator' },
            { label: 'Sign out', icon: 'back', tone: 'danger', onSelect: js('() => {}') },
          ],
        },
        { trigger: [ACCOUNT] },
      ),
    ],
  },
)

/** The account at the end of the topbar, for a frame whose navigation is on top and has no foot. */
const ACCOUNT_MENU = fx(
  'Menu',
  {
    align: 'end',
    items: [
      { label: 'Account settings', icon: 'settings', onSelect: js('() => {}') },
      { kind: 'separator' },
      { label: 'Sign out', icon: 'back', tone: 'danger', onSelect: js('() => {}') },
    ],
  },
  { trigger: [fx('AvatarButton', { name: 'Rowan Ellis', label: 'Account', size: 'sm' })] },
)

const BRAND = fx('Badge', { variant: 'solid', tone: 'accent' }, { default: ['Relay'] })

/** The brand a collapsed rail has room for: the shell clips a slot's content, it does not adapt it. */
const MARK = fx('Badge', { variant: 'solid', tone: 'accent' }, { default: ['R'] })

const SEARCH = node(
  fx('Input', { size: 'sm', icon: 'search', placeholder: 'Search…', 'aria-label': 'Search' }),
)
const NEW_TICKET = node(fx('Button', { size: 'sm', icon: 'add', label: 'New ticket' }))

/** Two icon-only Buttons with capped counts, side by side in the topbar's trailing slot. */
const COUNTS = node(
  fx(
    'Inline',
    { gap: 3, align: 'center' },
    {
      default: [
        fx('Button', {
          variant: 'ghost',
          tone: 'neutral',
          iconOnly: true,
          icon: 'notification',
          label: 'Notifications',
          count: { value: 128, label: 'Notifications, 128 unread' },
        }),
        fx('Button', {
          variant: 'ghost',
          tone: 'neutral',
          iconOnly: true,
          icon: 'inbox',
          label: 'Inbox',
          count: { value: 100, label: 'Inbox, 100 unread' },
        }),
      ],
    },
  ),
)

/** The content region: a page archetype goes here. */
const content = (words: string): FixtureChild =>
  fx('Stack', { gap: 4, p: 6 }, { default: [{ element: 'p', children: [words] }] })

/* -------------------------------------------------------------------------- */
/* The parts                                                                  */
/* -------------------------------------------------------------------------- */

/** A nav item's row content: its glyph, its label, and what sits at its end. */
const navBody: Node[] = [
  cond('icon !== undefined', [
    el('span', { part: 'glyph', class: ['navGlyph'] }, [member('Icon', { name: 'icon' })]),
  ]),
  el('span', { part: 'label', class: ['navLabel'] }, [text('label')]),
  cond('slots.end', [el('span', { part: 'end', class: ['navEnd'] }, [slot('end')])]),
]

/** The item's attributes, the same on both roots. */
const ROW_ATTRS = {
  'aria-current': when('current', lit('page')),
  'data-current': flag('current'),
}

/**
 * The row: a link when it has an `href`, so middle-click and copy link work,
 * else a button. `select` fires in both, for a rail that routes in script; on
 * the link, a caller that listens for `navigate` gets the clicks that would
 * navigate this tab, with the browser's navigation stopped (`link.md`
 * §Routing).
 */
const row: Node = cond(
  'href === undefined',
  [
    el(
      'button',
      {
        part: 'row',
        class: ['navItem'],
        attrs: { type: lit('button'), ...ROW_ATTRS },
        on: { click: { emit: 'select' } },
      },
      navBody,
    ),
  ],
  [
    el(
      'a',
      {
        part: 'row',
        class: ['navItem'],
        attrs: { href: 'href', ...ROW_ATTRS },
        on: { click: run("(emit('select'), route($event))") },
      },
      navBody,
    ),
  ],
)

/* -------------------------------------------------------------------------- */
/* The member                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * AppShell (`design/archetypes/app-shell.md`): the application frame, a
 * topbar, a collapsible rail and the content region, with the rail's own
 * item, group and user card as compound parts.
 *
 * The rail's width collapses through `collapsed`, controlled or not, and the
 * parts read the collapse from the shell (`provide`): a collapsed item shows
 * its label as a Tooltip, because its text is clipped and only its glyph is
 * drawn. Below the drawer breakpoint the rail is a drawer, which the topbar's
 * button opens; it is the shell's own state, because whether the rail
 * overlays the page depends on the viewport. Opening it moves focus into the
 * rail, and closing it returns focus to the button. While it is open the rest
 * of the frame is `inert`, Escape closes it, and a window that grows past the
 * breakpoint closes it. The content region is the foundation's
 * `PageTransition`, so a new `transitionKey` replays the page's arrival
 * without remounting the page, and `pending` holds it still. A new
 * `transitionKey` also closes the drawer, because the reader chose the new
 * page from it and the shell stays mounted under the app's router, and it
 * moves focus to the new page and says its title (`arriveAtPage`).
 */
export default describeMember({
  member: 'AppShell',
  dir: 'archetypes',
  recipe: 'archetypes/app-shell',
  recipes: { transitions: 'conventions/page-transitions' },
  uses: ['AppShellNavItemProps', 'AppShellNavGroupProps', 'AppShellUserCardProps'],
  types: {
    NavItemProps: 'AppShellNavItemProps',
    NavGroupProps: 'AppShellNavGroupProps',
    UserCardProps: 'AppShellUserCardProps',
    AppShellTopbar: '{ leading?: VNode; trailing?: VNode }',
  },
  defaults: { contentLayout: lit('full'), navigation: lit('rail'), pending: 'false' },
  state: {
    uncontrolled: 'defaultCollapsed ?? false',
    // The small viewport's drawer, which no prop reaches: the viewport decides it.
    drawer: 'false',
  },
  derived: {
    held: 'collapsed ?? uncontrolled',
    // A navigation on top has no rail to narrow, so the collapse is kept and not drawn.
    isCollapsed: "navigation === 'rail' && held",
    say: "messages ?? { primaryNavigation: 'Primary', expandSidebar: 'Expand sidebar', collapseSidebar: 'Collapse sidebar', closeNavigation: 'Close navigation', openNavigation: 'Open navigation' }",
    toggle:
      "(): void => { const next = !held; uncontrolled = next; emit('collapsedChange', next) }",
  },
  provide: { collapsed: 'isCollapsed' },
  effects: [
    // Focus follows the drawer: into the rail when it opens, back to its button when it closes
    // with focus in the rail or nowhere. A page change moves it to the new page instead.
    {
      watch: 'drawer',
      mount: false,
      run: "drawer ? rail?.focus() : drawerToggle && anchorFocusReturns(drawerToggle, rail ?? null) && drawerToggle.querySelector<HTMLElement>('button')?.focus()",
    },
    // Escape closes the open drawer, unless a layer over it took the key.
    {
      listen: 'keydown',
      run: "drawer && $event.key === 'Escape' && !$event.defaultPrevented && (drawer = false)",
    },
    // A window that grows past the breakpoint has no drawer, and its button is not drawn there.
    // The observer is made once, so a close it makes does not make another inside its callback.
    {
      resize: ['drawerToggle'],
      run: "drawer && drawerToggle && window.getComputedStyle(drawerToggle).display === 'none' && (drawer = false)",
    },
    // A new page closes the drawer, as on iOS and Android.
    { watch: 'transitionKey', mount: false, run: 'drawer = false' },
    // A new page takes focus and says its title, once it is drawn. The engine follows the pages
    // from these calls: the one on mount, once every renderer has its props, names the page the
    // browser loaded, which is no arrival, and a page that loads arrives once it is drawn.
    {
      watch: '[transitionKey, pending]',
      run: "arriveAtPage(frame?.querySelector<HTMLElement>(':scope > main'), announcer, transitionKey, pending)",
      release: 'ran()',
    },
  ],
  // The spec's `agent` fence. An agent reads the collapse and the drawer, collapses and expands
  // the rail through the shell's own toggle, and opens and closes the drawer as a press on its
  // menu button does. The collapse control is not drawn below the breakpoint or with the
  // navigation on top, and the menu button is not drawn above the breakpoint, which the recipe
  // decides, so an action refuses while its control is hidden. The two controls are the shell's
  // own and are withheld; the slots' members are the app's. The app composes the rail's items as
  // children, so the destinations are read from the rail in the document, and `go` presses the
  // item, as a person's press does.
  agent: {
    on: 'rail',
    state: {
      collapsed: 'isCollapsed',
      open: 'drawer',
      destinations: 'railDestinations(rail, { item: styles.navItem, label: styles.navLabel })',
      current: 'currentRailDestination(rail, { item: styles.navItem, label: styles.navLabel })',
    },
    actions: {
      collapse: `(() => {
        if (!railToggle || window.getComputedStyle(railToggle).display === 'none')
          throw new Error('The rail has no width to change here: below the breakpoint it is a drawer, and with the navigation on top there is no rail.')
        if (!held) toggle()
      })()`,
      expand: `(() => {
        if (!railToggle || window.getComputedStyle(railToggle).display === 'none')
          throw new Error('The rail has no width to change here: below the breakpoint it is a drawer, and with the navigation on top there is no rail.')
        if (held) toggle()
      })()`,
      open: `(() => {
        if (!drawerToggle || window.getComputedStyle(drawerToggle).display === 'none')
          throw new Error('There is no drawer here: above the breakpoint the navigation is drawn beside the page or along its top.')
        drawer = true
      })()`,
      close: `(() => {
        if (!drawerToggle || window.getComputedStyle(drawerToggle).display === 'none')
          throw new Error('There is no drawer here: above the breakpoint the navigation is drawn beside the page or along its top.')
        drawer = false
      })()`,
      go: {
        argument: 'id',
        run: 'goToRailDestination(rail, { item: styles.navItem, label: styles.navLabel }, value)',
      },
    },
    withholds: '[railToggle, drawerToggle]',
  },
  template: el(
    'div',
    {
      part: 'root',
      class: ['shell'],
      ref: 'frame',
      attrs: {
        'data-collapsed': flag('isCollapsed'),
        'data-navigation': when("navigation === 'top'", lit('top')),
        'data-drawer': flag('drawer'),
        ...identity('AppShell'),
      },
    },
    [
      // First in the document, and drawn only while it has keyboard focus. Everything but the
      // rail and the scrim is inert while the drawer is open.
      el(
        'a',
        {
          part: 'skip',
          class: ['skip'],
          attrs: { href: lit('#content'), inert: 'drawer' },
          // The region takes `tabindex="-1"` only while it holds the focus this moves into it.
          on: { click: run("focusFromScript(frame?.querySelector<HTMLElement>(':scope > main'))") },
        },
        [text("say.skipToContent ?? 'Skip to content'")],
      ),
      // Before the rail in the document, so it is read first on every page.
      cond('slots.banner', [
        el('div', { part: 'banner', class: ['banner'], attrs: { inert: 'drawer' } }, [
          slot('banner'),
        ]),
      ]),
      // Focusable from script only, so the drawer can move focus into the landmark. With the
      // navigation on top it is the same element, which the recipe lays at the top row's start.
      el(
        'nav',
        {
          part: 'sidebar',
          class: ['sidebar'],
          ref: 'rail',
          attrs: { id: 'uid', 'aria-label': 'say.primaryNavigation', tabindex: lit('-1') },
        },
        [
          el('div', { part: 'railHead', class: ['railHead'] }, [
            cond('slots.brand', [el('div', { part: 'brand', class: ['brand'] }, [slot('brand')])]),
            el('div', { part: 'toggle', class: ['toggle'], ref: 'railToggle' }, [
              member(
                'Button',
                {
                  variant: lit('ghost'),
                  tone: lit('neutral'),
                  size: lit('sm'),
                  iconOnly: 'true',
                  icon: "isCollapsed ? 'next' : 'previous'",
                  label: 'isCollapsed ? say.expandSidebar : say.collapseSidebar',
                },
                { on: { click: run('toggle()') } },
              ),
            ]),
          ]),
          el('div', { part: 'nav', class: ['nav'] }, [slot('sidebar')]),
          cond('slots.sidebarFooter', [
            el('div', { part: 'sidebarFooter', class: ['sidebarFooter'] }, [slot('sidebarFooter')]),
          ]),
        ],
      ),
      // The bar is drawn even when empty: its height and border hold the frame together.
      el('header', { part: 'topbar', class: ['topbar'], attrs: { inert: 'drawer' } }, [
        el('div', { part: 'leading', class: ['topbarSlot'] }, [
          // The drawer's button, hidden above the breakpoint by the recipe.
          el('span', { part: 'drawerToggle', class: ['drawerToggle'], ref: 'drawerToggle' }, [
            member(
              'Button',
              {
                variant: lit('ghost'),
                tone: lit('neutral'),
                size: lit('sm'),
                iconOnly: 'true',
                icon: lit('menu'),
                label: 'drawer ? say.closeNavigation : say.openNavigation',
                expanded: 'drawer',
                'aria-controls': 'uid',
              },
              { on: { click: run('drawer = !drawer') } },
            ),
          ]),
          cond('topbar?.leading !== undefined', [render('topbar?.leading')]),
        ]),
        el('div', { part: 'trailing', class: ['topbarSlot'] }, [
          cond('topbar?.trailing !== undefined', [render('topbar?.trailing')]),
        ]),
      ]),
      // A real button, so the drawer closes from the keyboard as well as from a tap beside it.
      cond('drawer', [
        el('button', {
          part: 'scrim',
          class: ['scrim'],
          attrs: { type: lit('button'), 'aria-label': 'say.closeNavigation' },
          on: { click: run('drawer = false') },
        }),
      ]),
      el(
        { expr: 'PageTransition' },
        {
          part: 'content',
          class: ['content', { name: 'transitions.page', when: 'transitionKey !== undefined' }],
          attrs: {
            as: lit('main'),
            id: lit('content'),
            // No `tabindex`: the skip link and a new page give it one while it holds the focus
            // they move into it (`focusFromScript`), so a click on the page's empty space does not
            // focus it.
            inert: 'drawer',
            transitionKey: 'transitionKey',
            pending: 'pending',
            ribbon: 'transitions.indicator',
          },
        },
        [
          cond(
            "contentLayout === 'page'",
            [el('div', { part: 'page', class: ['page'] }, [slot()])],
            [slot()],
          ),
        ],
      ),
      cond('slots.dock', [
        el('div', { part: 'dock', class: ['dock'], attrs: { inert: 'drawer' } }, [slot('dock')]),
      ]),
      // Says a new page's title; empty until the first page change.
      el('div', {
        part: 'announcer',
        class: ['announcer'],
        attrs: { role: lit('status') },
        ref: 'announcer',
      }),
    ],
  ),
  parts: [
    {
      name: 'NavItem',
      public: true,
      purpose: 'a row of the rail, start-aligned, a link or a button',
      props: {
        icon: {
          type: 'IconRole',
          optional: true,
          doc: 'Expected in practice, because a collapsed rail is unusable without icons.',
        },
        label: { type: 'string', doc: 'The accessible name in every mode, including collapsed.' },
        current: {
          type: 'boolean',
          optional: true,
          doc: 'Marks the current page, with exactly one per rail.',
        },
        href: {
          type: 'string',
          optional: true,
          doc: "With an `href`, the row is an `<a>` with Link's semantics and NavItem's styling.",
        },
        onNavigate: {
          type: '(href: string) => void',
          optional: true,
          doc: "The app's router, on a row with an `href`: a click that would navigate this tab calls it in place of the browser.",
        },
        onSelect: {
          type: '() => void',
          optional: true,
          doc: 'For a rail of buttons that routes in script with no `href`; it also fires on every click of a row with one.',
        },
        end: {
          type: 'ReactNode',
          optional: true,
          doc: 'Trailing content, by convention a Badge with a count.',
        },
      },
      defaults: { current: 'false' },
      derived: {
        navigatesHere: NAVIGATES_HERE,
        route:
          "(event: MouseEvent): void => { if (href === undefined || !listening.navigate || !navigatesHere(event)) return; event.preventDefault(); emit('navigate', href) }",
      },
      // A collapsed rail draws only glyphs, so the label is a Tooltip there and nowhere else.
      template: cond(
        'owner.collapsed === true',
        [
          member(
            'Tooltip',
            { content: 'label', side: lit('right') },
            { slots: { default: [row] } },
          ),
        ],
        [row],
      ),
    },
    {
      name: 'NavGroup',
      public: true,
      purpose: 'a labelled section of the rail',
      props: {
        label: { type: 'string', doc: 'The section’s name, one or two words.' },
        children: { type: 'ReactNode', doc: 'NavItems.' },
      },
      // Named, not headed: the group keeps its name when the collapse hides its label.
      template: el(
        'div',
        {
          part: 'group',
          class: ['navGroup'],
          attrs: { role: lit('group'), 'aria-label': 'label' },
        },
        [el('span', { part: 'groupLabel', class: ['navGroupLabel'] }, [text('label')]), slot()],
      ),
    },
    {
      name: 'UserCard',
      public: true,
      purpose: 'the rail’s foot, showing the signed-in user',
      props: {
        name: {
          type: 'string',
          doc: 'The first line. Initials and the identity colour are derived from it.',
        },
        detail: {
          type: 'string',
          doc: 'The second line, such as an email, a role or the signed-in workspace.',
        },
        src: { type: 'string', optional: true, doc: 'The avatar image.' },
        end: {
          type: 'ReactNode',
          optional: true,
          doc: 'The control at the row’s end, by convention a Menu, hidden when collapsed.',
        },
      },
      template: el('div', { part: 'userCard', class: ['userCard'] }, [
        // Unlabelled: the name is beside it in every mode, so a label would announce it twice.
        member('Avatar', { name: 'name', src: 'src', size: lit('md') }),
        el('span', { part: 'userText', class: ['userText'] }, [
          el('span', { class: ['userName'] }, [text('name')]),
          el('span', { class: ['userDetail'] }, [text('detail')]),
        ]),
        cond('slots.end', [el('span', { part: 'userEnd', class: ['userEnd'] }, [slot('end')])]),
      ]),
    },
  ],
  states: [
    {
      name: 'default — every slot filled',
      props: { topbar: { leading: SEARCH, trailing: NEW_TICKET } },
      slots: {
        brand: [BRAND],
        sidebar: [NAV],
        sidebarFooter: [fx('AppShellNavItem', { icon: 'user', label: 'Rowan' })],
        default: [content('The content region. A page archetype goes here.')],
      },
    },
    {
      name: 'grouped rail, with the user at its foot',
      props: { topbar: { leading: SEARCH, trailing: NEW_TICKET } },
      slots: {
        brand: [BRAND],
        sidebar: GROUPED_NAV,
        sidebarFooter: [USER],
        default: [content('The content region. A page archetype goes here.')],
      },
    },
    {
      name: 'collapsed',
      props: { defaultCollapsed: true, topbar: { trailing: NEW_TICKET } },
      slots: {
        brand: [MARK],
        sidebar: [NAV],
        default: [
          content(
            'The rail narrows to its glyphs. Every nav item keeps its name — the labels are clipped, not unmounted, so a screen reader still hears the whole rail.',
          ),
        ],
      },
      expect: { 'data-collapsed': '' },
    },
    {
      // The group titles are removed, the user's two lines are clipped, and the account menu
      // leaves the tab order along with its space.
      name: 'grouped rail, collapsed — titles gone, names kept',
      props: { defaultCollapsed: true, topbar: { trailing: NEW_TICKET } },
      slots: {
        brand: [MARK],
        sidebar: GROUPED_NAV,
        sidebarFooter: [USER],
        default: [
          content(
            'A group’s title is a heading for a boundary the eye can no longer see, so it is hidden rather than clipped — the group keeps its name for a reader through `role="group"`.',
          ),
        ],
      },
      expect: { 'data-collapsed': '' },
    },
    {
      name: 'no topbar slots — the bar still holds the frame',
      slots: {
        brand: [BRAND],
        sidebar: [NAV],
        default: [
          content('An empty topbar is still a topbar: its height and its border are structure.'),
        ],
      },
    },
    {
      name: 'minimal — sidebar and content, nothing else',
      slots: { sidebar: [NAV], default: [content('The least a shell can be.')] },
    },
    {
      name: 'with a banner — a notice across the frame, above the rail and the topbar',
      props: { topbar: { trailing: NEW_TICKET } },
      slots: {
        brand: [BRAND],
        sidebar: [NAV],
        banner: [
          fx(
            'Banner',
            { tone: 'warning' },
            {
              default: ['Your trial ends in 3 days.'],
              action: [
                fx('Button', {
                  variant: 'soft',
                  tone: 'accent',
                  size: 'sm',
                  label: 'Upgrade plan',
                }),
              ],
            },
          ),
        ],
        default: [
          content(
            'The rail and the content region start under the banner. Nothing scrolls under it.',
          ),
        ],
      },
    },
    {
      // A count grows past its button's end edge: the first over the slot's gap toward its
      // neighbour, the last into the bar's padding at the window's edge.
      name: 'counts in the topbar — a capped count beside a neighbour and at the edge',
      props: { topbar: { trailing: COUNTS } },
      slots: {
        brand: [BRAND],
        sidebar: [NAV],
        default: [
          content('Each count starts at its button’s centre and grows toward the end edge.'),
        ],
      },
    },
    // The navigation on top: the rail's items go to `sidebar` directly, because the shell lays
    // out its own parts in the row and a Stack keeps its column.
    {
      name: 'navigation on top — the rail’s items lead the topbar',
      props: { navigation: 'top', topbar: { leading: SEARCH, trailing: NEW_TICKET } },
      slots: {
        brand: [BRAND],
        sidebar: NAV_ITEMS,
        default: [
          content(
            'One navigation landmark, laid along the top. The content region takes the width.',
          ),
        ],
      },
      expect: { 'data-navigation': 'top' },
    },
    {
      name: 'navigation on top, grouped — a rule between the groups',
      props: { navigation: 'top', topbar: { trailing: node(ACCOUNT_MENU) } },
      slots: {
        brand: [BRAND],
        sidebar: GROUPED_NAV,
        default: [
          content(
            'Each group keeps its name for a reader through `role="group"`, and the account sits at the end of the topbar.',
          ),
        ],
      },
      expect: { 'data-navigation': 'top' },
    },
    // Below the drawer breakpoint (48rem) the rail is a drawer over the page, opened from the
    // topbar's menu button. The agent conformance law mounts both entries at a phone's width.
    {
      name: 'drawer closed — below the breakpoint, the rail behind the topbar’s menu button',
      props: { topbar: { trailing: NEW_TICKET } },
      slots: {
        brand: [BRAND],
        sidebar: [NAV],
        default: [
          content('The rail waits off screen until the menu button opens it over the page.'),
        ],
      },
    },
    {
      // No prop opens the drawer, because the viewport decides whether the rail overlays the
      // page, so the entry presses the menu button. Only this entry's banner is the info one.
      name: 'drawer open — below the breakpoint, the rail over the page and the banner',
      props: { topbar: { trailing: NEW_TICKET } },
      slots: {
        brand: [BRAND],
        sidebar: GROUPED_NAV,
        sidebarFooter: [USER],
        banner: [
          fx(
            'Banner',
            { tone: 'info' },
            { default: ['Scheduled maintenance tonight from 22:00.'] },
          ),
        ],
        default: [
          content('The drawer opens over the banner and the topbar, with the group labels.'),
        ],
      },
      presses:
        '[data-member="app-shell"]:has([data-member="banner"][data-tone="info"]) header button',
    },
    // The item on its own: start-aligned, which is why it is not a ghost Button.
    {
      name: 'nav item — rest',
      part: 'NavItem',
      props: { icon: 'inbox', label: 'Inbox' },
      expect: { 'data-current': null },
    },
    {
      name: 'nav item — current',
      part: 'NavItem',
      props: { icon: 'inbox', label: 'Inbox', current: true },
      expect: { 'data-current': '', 'aria-current': 'page' },
    },
    {
      name: 'nav item — with a count',
      part: 'NavItem',
      props: { icon: 'inbox', label: 'Inbox' },
      slots: { end: [count('12')] },
    },
    { name: 'nav item — no icon', part: 'NavItem', props: { label: 'All tickets' } },
    {
      name: 'nav item — a real link, for a rail that navigates',
      part: 'NavItem',
      props: { icon: 'inbox', label: 'Inbox', href: '#inbox' },
    },
    {
      name: 'nav item — a long label truncates rather than wrapping',
      part: 'NavItem',
      props: { icon: 'archive', label: 'Escalations awaiting a second reviewer' },
    },
    // The two other parts on their own, at rail width, where truncation can be checked.
    {
      name: 'nav group — a labelled section',
      part: 'NavGroup',
      props: { label: 'Platform' },
      slots: {
        default: [
          fx('AppShellNavItem', { icon: 'inbox', label: 'Inbox', current: true }),
          fx('AppShellNavItem', { icon: 'add', label: 'New ticket' }),
        ],
      },
    },
    {
      name: 'user card — a mark, two lines and an affordance',
      part: 'UserCard',
      props: { name: 'Rowan Ellis', detail: 'rowan@relay.example' },
      slots: { end: [ACCOUNT] },
    },
    {
      name: 'user card — both lines truncate rather than wrapping the rail',
      part: 'UserCard',
      props: {
        name: 'Aleksandra Wiśniewska-Kowalczyk',
        detail: 'aleksandra.wisniewska@northwind-logistics.example',
      },
    },
  ],
})
