import { cond, describeMember, each, el, identity, lit, member, run, text } from '../dsl'

const TITLE = "The ticket can't be raised yet"

/**
 * ErrorSummary (`design/components/error-summary.md`): the page-level list of
 * form errors after a failed submit. Each line links to its field. An empty
 * list renders nothing.
 */
export default describeMember({
  member: 'ErrorSummary',
  dir: 'structure',
  recipe: 'structure/error-summary',
  types: {
    // `fieldId` is the control's id, which FormField's `id` sets, so the link needs no wiring.
    ErrorSummaryError: '{ label: string; fieldId: string }',
  },
  derived: {
    // A fragment link scrolls and does not move focus, so the link puts focus in the field,
    // where its own error is announced with it. The anchor stays real: navigation is
    // prevented only when the control exists.
    follow:
      "(event: MouseEvent, fieldId: string) => { const control = document.getElementById(fieldId); if (control === null) return; event.preventDefault(); control.focus(); control.scrollIntoView({ block: 'nearest' }) }",
  },
  // The spec's `agent` fence. The summary reads its errors from its own list in the document, by
  // the class of the links, as List reads its items, and `choose` presses an error's link, so
  // focus moves to the field as for a person's press. An empty summary draws no root and is not
  // listed.
  agent: {
    on: 'root',
    state: { items: 'listItems(list, styles.link)' },
    actions: { choose: { argument: 'id', run: 'chooseListItem(list, styles.link, value)' } },
  },
  template: cond('errors.length > 0', [
    // `role="alert"`: announced at once without moving the reading position.
    el(
      'div',
      { ref: 'root', class: ['root'], attrs: { role: lit('alert'), ...identity('ErrorSummary') } },
      [
        // Decorative: the role and the title carry the announcement.
        el('span', { part: 'glyph', class: ['glyph'] }, [
          member('Icon', { name: lit('error'), size: lit('md') }),
        ]),
        el('div', { part: 'body', class: ['body'] }, [
          // Styled text, not a heading: heading levels are the page's structure.
          el('p', { part: 'title', class: ['title'] }, [text('title')]),
          // A real list, so a screen reader announces the count first.
          el('ul', { part: 'list', ref: 'list', class: ['list'] }, [
            // By position and id: no spec makes a field's id unique, and Svelte throws on a repeated key.
            each(
              'errors',
              'error',
              '`${at}-${error.fieldId}`',
              [
                el('li', {}, [
                  el(
                    'a',
                    {
                      part: 'entry',
                      class: ['link'],
                      attrs: { href: '`#${error.fieldId}`' },
                      on: { click: run('follow($event, error.fieldId)') },
                    },
                    [text('error.label')],
                  ),
                ]),
              ],
              'at',
            ),
          ]),
        ]),
      ],
    ),
  ]),
  states: [
    {
      name: 'two errors — every line a door',
      props: {
        title: TITLE,
        errors: [
          { label: 'Subject is required', fieldId: 'subject' },
          { label: 'Pick a priority', fieldId: 'priority' },
        ],
      },
      expect: { role: 'alert' },
    },
    {
      name: 'one error — list semantics kept, the count is content',
      props: { title: TITLE, errors: [{ label: 'Subject is required', fieldId: 'subject' }] },
      expect: { role: 'alert' },
    },
    {
      name: 'long labels — the underline survives the wrap',
      props: {
        title: TITLE,
        errors: [
          {
            label:
              'The reproduction steps need at least one step the support agent can follow before the ticket can be routed',
            fieldId: 'steps',
          },
          { label: 'Pick a priority', fieldId: 'priority' },
        ],
      },
    },
    {
      name: 'empty — no errors is silence, not an empty box',
      props: { title: TITLE, errors: [] },
      rendersNothing: true,
    },
  ],
})
