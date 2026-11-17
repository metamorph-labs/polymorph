import {
  cond,
  describeMember,
  each,
  el,
  emit,
  flag,
  identity,
  lit,
  member,
  run,
  words,
  type Effect,
  type Expr,
} from '../dsl'

/** The controls' shared Button props: every pager control is a small Button. */
const ghost = { variant: lit('ghost'), tone: lit('neutral'), size: lit('sm') }

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
 * A description that spreads these declares `controls`: the names of its
 * buttons in document order, one for each `<button>` under the root.
 */
export const PAGER_FOCUS = {
  state: {
    /** The pager's element that has focus. */
    focused: 'null as HTMLElement | null',
    /** The control the hold took focus from, until the hold ends. */
    taken: 'null as string | number | null',
  },
  derived: {
    focusIn: '(event: FocusEvent) => { focused = event.target as HTMLElement }',
    // A browser blurs a button as it is disabled. That button is still the one the hold
    // took focus from, so only an enabled element's blur is forgotten.
    focusOut:
      "(event: FocusEvent) => { if (!(event.target as HTMLElement).matches(':disabled')) focused = null }",
    // With no hold, the pager decides once where focus goes after one: back to the control
    // it was taken from, when focus is still on the root and the control is drawn and
    // enabled. Focus anywhere else is where the reader put it.
    //
    // Under a hold, when the remembered element is disabled and focus is still on it, which
    // Firefox and WebKit report just after it is disabled, or on the page, which Chromium
    // reports at once. A button that left the document was not disabled by the hold.
    //
    // `names` is the member's `controls`, typed for both pagers: a CursorPagination's names
    // are all strings, and the control that was taken may be a page's number.
    keepPlace:
      "() => { const pager = root as HTMLElement | null; if (pager === null) return; const names: readonly (string | number)[] = controls; if (!disabled) { const control = taken; taken = null; if (control === null || document.activeElement !== pager) return; const button = [...pager.querySelectorAll('button')][names.indexOf(control)]; if (button !== undefined && !button.matches(':disabled')) button.focus(); return } const from = focused as HTMLElement | null; if (from === null || !from.isConnected || !from.matches(':disabled')) return; const active = document.activeElement; if (active !== from && active !== null && active !== document.body) return; taken = names[[...pager.querySelectorAll('button')].indexOf(from as HTMLButtonElement)] ?? null; pager.focus() }",
  },
  /** The root's `tabindex`: a script can focus it, and it is no tab stop. */
  attrs: { tabindex: lit('-1') },
  /** The root's handlers, which hear focus enter and leave every element of the pager. */
  on: { focusin: run('focusIn($event)'), focusout: run('focusOut($event)') },
} as const

/**
 * The effects that keep the reader's place. The first runs when a button of
 * the pager is disabled or enabled, which the root's observer reports
 * whichever member wrote the attribute. `shown` is whether the pager draws its
 * root, because a root that appears is a new element to observe. The second
 * runs when the hold begins or ends: a hold that ends with no button enabled
 * changes no attribute, and the pager still decides then.
 */
export const pagerFocusEffects = (shown: Expr): Effect[] => [
  { run: 'keepPlace()', watch: shown, mutation: ['root'], attributes: ['disabled'] },
  { run: 'keepPlace()', watch: 'disabled', mount: false },
]

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
    // The buttons in the order they are drawn, a page by its number, so a page drawn again
    // is the same control.
    controls: "['previous', ...entries.filter((shown) => shown !== PAGINATION_ELLIPSIS), 'next']",
    ...PAGER_FOCUS.derived,
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
                      [
                        // One Button for a page, current or not, so the page a reader presses
                        // keeps its element, and its focus, when it becomes the current page,
                        // as the React member's does.
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
      name: 'one page — nothing at all, because one page is not a paginated list',
      props: { page: 1, pageCount: 1 },
      rendersNothing: true,
    },
  ],
})
