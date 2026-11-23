import {
  cond,
  describeMember,
  each,
  el,
  emit,
  flag,
  identity,
  js,
  lit,
  member,
  run,
  text,
  words,
  type Effect,
  type ElementNode,
  type Expr,
} from '../dsl'
import { NAVIGATES_HERE } from './link'

/** The controls' shared Button props: every pager control is a small Button. */
const ghost = { variant: lit('ghost'), tone: lit('neutral'), size: lit('sm') }

/** A pager's link's look, as the React members' `pager-link.tsx` writes it. */
export interface PagerLinkLook {
  /** The variant of the Button the link replaces. */
  variant: 'ghost' | 'outline'
  /** A leading icon's role. */
  icon?: string
  trailingIcon?: string
  /** Square: the label is then the accessible name, and no text is drawn. */
  iconOnly?: boolean
  /** The visible text, or the accessible name when `iconOnly`. */
  label: Expr
  /** The accessible name when it says more than the visible text (`Page 3` for `3`). */
  ariaLabel?: Expr
}

/**
 * A pager's control drawn as a link (`pagination.md` and `cursor-pagination.md`),
 * as the React members' `pager-link.tsx` draws it. CursorPagination draws the
 * same element.
 *
 * When the app gives addresses, a control that goes to another page is an
 * `<a href>`, so a crawler, a new tab and a reader whose script has not loaded
 * can follow it. It looks like the Button it replaces: it sets Button's data
 * attributes, and its class in the pager's recipe composes Button's, as Link's
 * costume does. Every control a pager draws as a link is neutral: the one
 * accent control, the current page, is never a link. `click` is the member's
 * handler, which takes over a click the browser would follow in this tab.
 */
export function pagerLink(href: Expr, look: PagerLinkLook, click: Expr): ElementNode {
  const glyph = (role: string) =>
    el('span', { part: 'glyph', class: ['linkGlyph'] }, [
      member('Icon', { name: lit(role), size: lit('sm') }),
    ])
  return el(
    'a',
    {
      part: 'link',
      class: ['link'],
      attrs: {
        href,
        ...(look.ariaLabel === undefined && look.iconOnly !== true
          ? {}
          : { 'aria-label': look.ariaLabel ?? look.label }),
        'data-variant': lit(look.variant),
        'data-size': lit('sm'),
        'data-tone': lit('neutral'),
        ...(look.iconOnly === true ? { 'data-icon-only': lit('') } : {}),
      },
      on: { click: run(click) },
    },
    [
      ...(look.icon === undefined ? [] : [glyph(look.icon)]),
      ...(look.iconOnly === true
        ? []
        : [el('span', { part: 'label', class: ['linkLabel'] }, [text(look.label)])]),
      ...(look.trailingIcon === undefined || look.iconOnly === true
        ? []
        : [glyph(look.trailingIcon)]),
    ],
  )
}

/**
 * Where focus goes when the app holds a pager (`pagination.md` and
 * `cursor-pagination.md`, A11y), as the React members' `pager-focus.ts` writes
 * it. CursorPagination reads the same values.
 *
 * A hold disables the pager's buttons, and a browser takes focus from a button
 * as it is disabled: the page has it, and no control does. So the pager
 * remembers which of its elements has focus, and when a hold has disabled that
 * element it moves focus to its root. The reader stays in the pager and hears
 * its name, and the next Tab goes on from it.
 *
 * When the hold ends and focus is still on the root, focus returns to the
 * control it was taken from. A control is remembered by its name in the
 * member's `controls`, because a pager may draw it again as a new element. A
 * control that is no longer drawn, or is still disabled, takes no focus, and
 * focus stays on the root.
 *
 * A control the app gave an address is a link while it can be followed and a
 * button otherwise (`pagerLink`), so a press, a hold or a busy window draws it
 * again as a new element, and the browser gives focus to the page as the old
 * one leaves. Focus follows the control to its new element when the page has
 * focus and the control is still drawn. A new element that is disabled is
 * treated as a button the update disabled: under a hold, focus moves to the
 * root. The pager remembers the focused element's control when it takes
 * focus, because an element that left the document is no longer among the
 * controls.
 *
 * A description that spreads these declares `controls`: the names of its
 * controls in document order, one for each `<button>` and each link under the
 * root.
 */
export const PAGER_FOCUS = {
  state: {
    /** The pager's element that has focus. */
    focused: 'null as HTMLElement | null',
    /** The control `focused` draws, by its name in `controls`, or `null` for another element. */
    focusedControl: 'null as string | number | null',
    /** The control the hold took focus from, until the hold ends. */
    taken: 'null as string | number | null',
  },
  derived: {
    // `names` is the member's `controls`, typed for both pagers: a CursorPagination's names
    // are all strings, and a Pagination's control may be a page's number.
    focusIn:
      "(event: FocusEvent) => { const target = event.target as HTMLElement; const pager = root as HTMLElement | null; const names: readonly (string | number)[] = controls; const at = pager === null ? -1 : [...pager.querySelectorAll('button, a[href]')].indexOf(target); focused = target; focusedControl = at < 0 ? null : (names[at] ?? null) }",
    // A browser blurs a button as it is disabled. That button is still the one the hold
    // took focus from, so only an enabled element's blur is forgotten. Chromium also blurs an
    // element as it leaves the document, before it has left, so the pager decides after the
    // update: an element still in the document lost focus to the reader, and one that left
    // may be drawn again.
    focusOut:
      "(event: FocusEvent) => { const target = event.target as HTMLElement; if (target.matches(':disabled')) return; queueMicrotask(() => { if (focused === target && target.isConnected) focused = null }) }",
    // First, when the element with focus left the document and the page has focus, focus
    // follows its control to the element that draws it now; a disabled one is remembered, as
    // a button the update disabled is.
    //
    // With no hold, the pager then decides once where focus goes after one: back to the
    // control it was taken from, when focus is still on the root and the control is drawn and
    // enabled. Focus anywhere else is where the reader put it.
    //
    // Under a hold, when the remembered element is disabled and focus is still on it, which
    // Firefox and WebKit report just after it is disabled, or on the page, which Chromium
    // reports at once. A button that left the document was not disabled by the hold.
    keepPlace:
      "() => { const pager = root as HTMLElement | null; if (pager === null) return; const names: readonly (string | number)[] = controls; const drawn = () => [...pager.querySelectorAll<HTMLElement>('button, a[href]')]; const onPage = () => document.activeElement === null || document.activeElement === document.body; const left = focused as HTMLElement | null; if (left !== null && !left.isConnected) { focused = null; const name = focusedControl; const now = name === null ? undefined : drawn()[names.indexOf(name)]; if (now !== undefined && onPage()) { if (now.matches(':disabled')) focused = now; else now.focus() } } if (!disabled) { const control = taken; taken = null; if (control === null || document.activeElement !== pager) return; const element = drawn()[names.indexOf(control)]; if (element !== undefined && !element.matches(':disabled')) element.focus(); return } const from = focused as HTMLElement | null; if (from === null || !from.isConnected || !from.matches(':disabled')) return; const active = document.activeElement; if (active !== from && active !== null && active !== document.body) return; taken = names[drawn().indexOf(from)] ?? null; pager.focus() }",
  },
  /** The root's `tabindex`: a script can focus it, and it is no tab stop. */
  attrs: { tabindex: lit('-1') },
  /** The root's handlers, which hear focus enter and leave every element of the pager. */
  on: { focusin: run('focusIn($event)'), focusout: run('focusOut($event)') },
} as const

/**
 * The effects that keep the reader's place. The first runs when a button of
 * the pager is disabled or enabled, or a control is drawn again as a new
 * element, which the root's observer reports whichever member wrote the
 * attribute. `shown` is whether the pager draws its
 * root, because a root that appears is a new element to observe. The second
 * runs when the hold begins or ends: a hold that ends with no button enabled
 * changes no attribute, and the pager still decides then.
 */
export const pagerFocusEffects = (shown: Expr): Effect[] => [
  { run: 'keepPlace()', watch: shown, mutation: ['root'], attributes: ['disabled'] },
  { run: 'keepPlace()', watch: 'disabled', mount: false },
]

/** A page's address in the fixture. A fragment, so a click a test leaves to the browser stays on the page. */
const PAGE_HREF = js('(page: number) => `#page-${page}`')

/**
 * Pagination (`design/components/pagination.md`): numbered page controls for
 * paged lists. It renders nothing below two pages, because one page is not a
 * paginated list.
 */
export default describeMember({
  member: 'Pagination',
  dir: 'structure',
  recipe: 'structure/pagination',
  types: {
    SiblingCount: "NonNullable<PaginationProps['siblingCount']>",

    // `page` names a numbered button; its visible text stays the digit.
    PaginationMessages: '{ previous: string; next: string; page: (page: number) => string }',
  },
  defaults: {
    siblingCount: '1',
    disabled: 'false',
    label: lit('Pagination'),
    messages:
      "() => ({ previous: 'Previous page', next: 'Next page', page: (page) => `Page ${page}` })",
  },
  state: { ...PAGER_FOCUS.state },
  derived: {
    // The engine's window, which the React Pagination renders too: the first page, the last and
    // `page ± siblingCount`, with a longer gap as an ellipsis.
    entries: 'paginationWindow(page, pageCount, siblingCount)',
    // The controls in the order they are drawn, a page by its number, so a page drawn again,
    // as a new element or as a link, is the same control.
    controls: "['previous', ...entries.filter((shown) => shown !== PAGINATION_ELLIPSIS), 'next']",
    ...PAGER_FOCUS.derived,
    // The addresses the controls link to (`pagerLink`). A held pager links to none, because a
    // held control cannot be followed.
    linked: '!disabled && getPageHref !== undefined',
    navigatesHere: NAVIGATES_HERE,
    // A click the browser would follow in this tab asks for the page in place of the navigation,
    // as Link hands such a click to `navigate`. Every other click stays the browser's and opens
    // the address.
    follow:
      "(event: MouseEvent, to: number): void => { if (!navigatesHere(event)) return; event.preventDefault(); emit('pageChange', to) }",
  },
  effects: pagerFocusEffects('entries.length > 0'),
  // The spec's `agent` fence. The pager's Buttons are its own parts, so it withholds them and an
  // agent asks for a page by its number. The page is the caller's, so `set` asks as a press
  // does, through `pageChange`.
  agent: {
    on: 'root',
    state: { page: 'page', 'page-count': 'pageCount', disabled: 'disabled' },
    actions: {
      set: {
        argument: 'number',
        run: `(() => {
          if (!Number.isInteger(value) || value < 1 || value > pageCount) {
            throw new Error(\`There is no page \${value}; the pages run from 1 to \${pageCount}.\`)
          }
          if (value !== page) emit('pageChange', value)
        })()`,
      },
    },
    withholds: 'root',
  },
  template: cond('entries.length > 0', [
    el(
      'nav',
      {
        ref: 'root',
        class: ['pagination'],
        attrs: {
          'aria-label': 'label',
          'data-disabled': flag('disabled'),
          ...PAGER_FOCUS.attrs,
          ...identity('Pagination'),
        },
        on: PAGER_FOCUS.on,
      },
      [
        // Wraps, so eleven controls in a narrow container continue on a second line.
        member(
          'Inline',
          { gap: '1', align: lit('center'), wrap: 'true' },
          {
            slots: {
              default: [
                cond(
                  'linked && page > 1',
                  [
                    pagerLink(
                      'getPageHref?.(page - 1)',
                      {
                        variant: 'ghost',
                        iconOnly: true,
                        icon: 'previous',
                        label: 'messages.previous',
                      },
                      'follow($event, page - 1)',
                    ),
                  ],
                  [
                    member(
                      'Button',
                      {
                        ...ghost,
                        iconOnly: 'true',
                        icon: lit('previous'),
                        label: 'messages.previous',
                        disabled: 'disabled || page <= 1',
                      },
                      { on: { click: emit('pageChange', { args: ['page - 1'] }) } },
                    ),
                  ],
                ),
                // Gaps are keyed by position, because two gaps differ only in where they are.
                each(
                  'entries',
                  'entry',
                  'entry === PAGINATION_ELLIPSIS ? `gap-${at}` : entry',
                  [
                    cond(
                      'entry === PAGINATION_ELLIPSIS',
                      [
                        // Not a button and unnamed: it stands for pages that are not offered.
                        el('span', { class: ['ellipsis'], attrs: { 'aria-hidden': lit('true') } }, [
                          words('…'),
                        ]),
                      ],
                      // Another page, with an address: a link to it. The current page is never
                      // a link to itself.
                      'linked && entry !== page',
                      [
                        pagerLink(
                          'getPageHref?.(entry)',
                          {
                            variant: 'ghost',
                            label: 'String(entry)',
                            ariaLabel: 'messages.page(entry)',
                          },
                          'follow($event, entry)',
                        ),
                      ],
                      [
                        // One Button for a page, current or not, so the page a reader presses
                        // keeps its element, and its focus, when it becomes the current page,
                        // as the React member's does. With addresses, the pressed page's link
                        // is drawn again as this Button, and focus follows it (`PAGER_FOCUS`).
                        //
                        // The current page is soft, not solid: the page's one solid button is
                        // its primary action. A held pager disables it with the others, so no
                        // control looks pressable; it keeps `aria-current`, so the page is
                        // still named.
                        member(
                          'Button',
                          {
                            variant: "entry === page ? 'soft' : 'ghost'",
                            tone: "entry === page ? 'accent' : 'neutral'",
                            size: lit('sm'),
                            current: 'entry === page',
                            label: 'String(entry)',
                            'aria-label': 'messages.page(entry)',
                            disabled: 'disabled',
                          },
                          {
                            on: {
                              click: emit('pageChange', {
                                args: ['entry'],
                                when: 'entry !== page',
                              }),
                            },
                          },
                        ),
                      ],
                    ),
                  ],
                  'at',
                ),
                cond(
                  'linked && page < pageCount',
                  [
                    pagerLink(
                      'getPageHref?.(page + 1)',
                      { variant: 'ghost', iconOnly: true, icon: 'next', label: 'messages.next' },
                      'follow($event, page + 1)',
                    ),
                  ],
                  [
                    member(
                      'Button',
                      {
                        ...ghost,
                        iconOnly: 'true',
                        icon: lit('next'),
                        label: 'messages.next',
                        disabled: 'disabled || page >= pageCount',
                      },
                      { on: { click: emit('pageChange', { args: ['page + 1'] }) } },
                    ),
                  ],
                ),
              ],
            },
          },
        ),
      ],
    ),
  ]),
  states: [
    { name: 'five pages, at the first', props: { page: 1, pageCount: 5 } },
    { name: 'five pages, in the middle', props: { page: 3, pageCount: 5 } },
    { name: 'five pages, at the last', props: { page: 5, pageCount: 5 } },
    {
      name: 'twelve pages, in the middle — an ellipsis on each side',
      props: { page: 6, pageCount: 12 },
    },
    {
      name: 'twelve pages, with wider shoulders',
      props: { page: 6, pageCount: 12, siblingCount: 2 },
    },
    { name: 'two pages — no room for a gap', props: { page: 1, pageCount: 2 } },
    {
      name: 'held by the app — no page can be asked for',
      props: { page: 3, pageCount: 5, disabled: true },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'with addresses — every page but the current one is a link',
      props: { page: 3, pageCount: 5, getPageHref: PAGE_HREF },
    },
    {
      name: 'held, with addresses — no links, every control a disabled button',
      props: { page: 3, pageCount: 5, disabled: true, getPageHref: PAGE_HREF },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'one page — nothing at all, because one page is not a paginated list',
      props: { page: 1, pageCount: 1 },
      rendersNothing: true,
    },
  ],
})
