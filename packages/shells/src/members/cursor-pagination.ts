import {
  cond,
  describeMember,
  el,
  flag,
  held,
  hold,
  identity,
  js,
  lit,
  member,
  run,
  text,
  when,
} from '../dsl'
import { PAGER_FOCUS, pagerFocusEffects } from './pagination'

const noop = js('() => {}')

const ghost = { variant: lit('ghost'), tone: lit('neutral'), size: lit('sm') }

/** The replace form with a previous window and no handler for it. */
const UNHANDLED_PREVIOUS = "mode !== 'append' && hasPrevious && !listening.previous"

/**
 * Whether the pager draws: one window renders nothing, and the append form stays once it has
 * paged, to say its list ran out.
 */
const SHOWN = "mode === 'append' ? hasNext || pending || paged : hasPrevious || hasNext || pending"

/** The append form given localized messages without its own two words. */
const PARTIAL_MESSAGES =
  "mode === 'append' && (messages.more === undefined || messages.end === undefined)"

/**
 * CursorPagination (`design/components/cursor-pagination.md`): previous and
 * next for a cursor-paged list, with the position when the app gives one, or
 * in the append form one "Load more" action. It renders nothing for a single
 * window, and stays while a window loads, because only the new window says
 * whether it is the last. The append form's end line, under the row, is a
 * status region from its first render, empty until the list runs out,
 * because a region that mounts with its words announces nothing. The append
 * form says the list ran out once it has asked for a window and no next one
 * follows; it never reads `hasPrevious`, so the app passes its query
 * library's flags as they are.
 */
export default describeMember({
  member: 'CursorPagination',
  dir: 'structure',
  recipe: 'structure/cursor-pagination',
  types: {
    // `previous` and `next` both or neither, so one control never mixes two languages; the
    // append form's two are optional, each keeping its English default.
    CursorPaginationMessages: '{ previous: string; next: string; more?: string; end?: string }',
  },
  defaults: {
    mode: lit('replace'),
    pending: 'false',
    disabled: 'false',
    label: lit('Pagination'),
    messages:
      "() => ({ previous: 'Previous', next: 'Next', more: 'Load more', end: 'No more to load' })",
  },
  derived: {
    more: "messages.more ?? 'Load more'",
    end: "messages.end ?? 'No more to load'",
    // The append form's list has run out: no next window and none in flight. The template
    // renders the append form with neither only once it has paged, so `paged` holds here.
    ended: '!hasNext && !pending',
    // The buttons in the order they are drawn. The append form's action leaves when its
    // list runs out.
    controls: "mode === 'append' ? (hasNext || pending ? ['more'] : []) : ['previous', 'next']",
    ...PAGER_FOCUS.derived,
  },
  state: {
    ...PAGER_FOCUS.state,
    // The direction the reader pressed: `pending` says a window loads, not which one, and
    // the busy state belongs on the pressed button.
    asked: "null as 'previous' | 'next' | null",
    // The append form has asked for a window, so a missing next one means the list ran out,
    // not that it never grew.
    paged: 'false',
  },
  effects: [
    // Cleared when the fetch settles, on the transition, never on mount.
    { watch: 'pending', mount: false, run: 'pending || (asked = null)' },
    {
      watch: UNHANDLED_PREVIOUS,
      run: `devWarning(${UNHANDLED_PREVIOUS}, 'CursorPagination: \`hasPrevious\` with no \`onPrevious\` draws a previous button that does nothing.')`,
    },
    {
      watch: PARTIAL_MESSAGES,
      run: `devWarning(${PARTIAL_MESSAGES}, 'CursorPagination: the append form shows \`messages.more\` and \`messages.end\`; pass them with the others, so one control never mixes two languages.')`,
    },
    // A hold that disables the button with focus moves focus to the root, and gives it back
    // when the hold ends. A busy button is not disabled, so it keeps focus until its window
    // arrives.
    ...pagerFocusEffects(SHOWN),
  ],
  // The spec's `agent` fence. The pager's Buttons are its own parts, so it withholds them and
  // declares their two directions as its own. A direction a person cannot press is refused: one
  // with no window, and either while a window is in flight.
  agent: {
    on: 'root',
    state: {
      'has-previous': "mode !== 'append' && hasPrevious",
      'has-next': 'hasNext',
      position: "position ?? ''",
      pending: 'pending',
      disabled: 'disabled',
    },
    actions: {
      previous: `(() => {
        if (mode === 'append') throw new Error('The append form has no previous window.')
        if (!hasPrevious) throw new Error('There is no previous window.')
        if (pending) throw new Error('A window is in flight; wait for it to arrive.')
        asked = 'previous'
        emit('previous')
      })()`,
      next: `(() => {
        if (!hasNext) throw new Error('There is no next window.')
        if (pending) throw new Error('A window is in flight; wait for it to arrive.')
        asked = 'next'
        if (mode === 'append') paged = true
        emit('next')
      })()`,
    },
    withholds: 'root',
  },
  template: cond(SHOWN, [
    el(
      'nav',
      {
        ref: 'root',
        class: ['pagination'],
        attrs: {
          'aria-label': 'label',
          'aria-busy': when('pending', 'true'),
          'data-pending': flag('pending'),
          'data-disabled': flag('disabled'),
          ...PAGER_FOCUS.attrs,
          ...identity('CursorPagination'),
        },
        on: PAGER_FOCUS.on,
      },
      [
        // Wraps, so the three parts move onto a second line in a narrow container.
        member(
          'Inline',
          { gap: '2', align: lit('center'), wrap: 'true' },
          {
            slots: {
              default: [
                cond(
                  "mode === 'append'",
                  [
                    cond('position !== undefined', [
                      // Polite: each window that arrives changes it once.
                      el(
                        'span',
                        {
                          part: 'position',
                          class: ['position'],
                          attrs: { 'aria-live': lit('polite') },
                        },
                        [text('position')],
                      ),
                    ]),
                    // Outline: a lone action at the foot of a list needs an edge to read as a
                    // control. Busy while a window is in flight, which ignores presses.
                    cond('!ended', [
                      member(
                        'Button',
                        {
                          variant: lit('outline'),
                          tone: lit('neutral'),
                          size: lit('sm'),
                          label: 'more',
                          loading: 'pending',
                          // A busy action is not disabled, so it keeps its focus through a hold.
                          disabled: 'disabled && !pending',
                        },
                        { on: { click: run("(asked = 'next', paged = true, emit('next'))") } },
                      ),
                    ]),
                  ],
                  [
                    member(
                      'Button',
                      {
                        ...ghost,
                        icon: lit('previous'),
                        label: 'messages.previous',
                        loading: "pending && asked === 'previous'",
                        disabled: "!hasPrevious || (pending ? asked !== 'previous' : disabled)",
                      },
                      { on: { click: run("(asked = 'previous', emit('previous'))") } },
                    ),
                    cond('position !== undefined', [
                      // Polite: the text changes with the window, so a move is announced once.
                      el(
                        'span',
                        {
                          part: 'position',
                          class: ['position'],
                          attrs: { 'aria-live': lit('polite') },
                        },
                        [text('position')],
                      ),
                    ]),
                    member(
                      'Button',
                      {
                        ...ghost,
                        trailingIcon: lit('next'),
                        label: 'messages.next',
                        loading: "pending && asked === 'next'",
                        disabled: "!hasNext || (pending ? asked !== 'next' : disabled)",
                      },
                      { on: { click: run("(asked = 'next', emit('next'))") } },
                    ),
                  ],
                ),
              ],
            },
          },
        ),
        // A status region from the append form's first render, empty until the list runs out,
        // because a region that mounts with its words announces nothing; a line under the row.
        cond("mode === 'append'", [
          el('span', { part: 'end', class: ['end'], attrs: { role: lit('status') } }, [
            cond('ended', [text('end')]),
          ]),
        ]),
      ],
    ),
  ]),
  states: [
    {
      name: 'the first window — nothing behind it',
      props: { hasPrevious: false, hasNext: true, onPrevious: noop, onNext: noop },
    },
    {
      name: 'a middle window',
      props: { hasPrevious: true, hasNext: true, onPrevious: noop, onNext: noop },
    },
    {
      name: 'the last window — nothing ahead of it',
      props: { hasPrevious: true, hasNext: false, onPrevious: noop, onNext: noop },
    },
    {
      name: 'with a position, in the app’s words',
      props: {
        hasPrevious: true,
        hasNext: true,
        position: '26–50',
        onPrevious: noop,
        onNext: noop,
      },
    },
    {
      name: 'pending — a window is in flight',
      props: {
        hasPrevious: true,
        hasNext: true,
        pending: true,
        position: '26–50',
        onPrevious: noop,
        onNext: noop,
      },
      expect: { 'data-pending': '' },
    },
    {
      name: 'held by the app — neither direction can be pressed',
      props: {
        hasPrevious: true,
        hasNext: true,
        disabled: true,
        position: '26–50',
        onPrevious: noop,
        onNext: noop,
      },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'localized',
      props: {
        hasPrevious: true,
        hasNext: true,
        label: 'Pagination des événements',
        messages: { previous: 'Précédent', next: 'Suivant' },
        onPrevious: noop,
        onNext: noop,
      },
    },
    {
      name: 'append — more to load',
      props: { mode: 'append', hasPrevious: false, hasNext: true, onNext: noop },
    },
    {
      name: 'append — with a position',
      props: {
        mode: 'append',
        hasPrevious: false,
        hasNext: true,
        position: '50 shown',
        onNext: noop,
      },
    },
    {
      name: 'append — a window is in flight',
      props: {
        mode: 'append',
        hasPrevious: false,
        hasNext: true,
        pending: true,
        position: '50 shown',
        onNext: noop,
      },
      expect: { 'data-pending': '' },
    },
    {
      name: 'append — held by the app',
      props: {
        mode: 'append',
        hasPrevious: false,
        hasNext: true,
        disabled: true,
        position: '50 shown',
        onNext: noop,
      },
      expect: { 'data-disabled': '' },
    },
    {
      // The form says the list ran out once it has asked for a window, so the entry presses
      // "Load more" as a reader would, and the window that answers has no next one. Its
      // landmark has a name of its own, so the press finds this pager.
      name: 'append — the list ran out',
      holds: { hasNext: true },
      props: {
        mode: 'append',
        hasPrevious: false,
        hasNext: held('hasNext'),
        position: '120 shown',
        label: 'Event log',
        onNext: hold('hasNext', false),
      },
      presses: '[data-member="cursor-pagination"][aria-label="Event log"] button',
    },
    {
      name: 'append — one window, so nothing at all',
      props: { mode: 'append', hasPrevious: false, hasNext: false, onNext: noop },
      rendersNothing: true,
    },
    {
      name: 'one window — nothing at all, because one window is not a paginated list',
      props: { hasPrevious: false, hasNext: false, onPrevious: noop, onNext: noop },
      rendersNothing: true,
    },
  ],
})
