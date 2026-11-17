import { cond, describeMember, el, fx, identity, lit, member, slot, text } from '../dsl'

const STANDARD = 'When a customer writes in, their ticket will show up here.'

/**
 * EmptyState (`design/components/empty-state.md`): the message for a view with
 * nothing to show. The well stays muted for every icon, `error` included: the
 * title says what went wrong.
 *
 * `EmptyStateProps` carries the two actions as VNodes, because ListPage and
 * DataTable take an `emptyState` value and render this member from it, and a
 * value cannot hold a slot.
 */
export default describeMember({
  member: 'EmptyState',
  dir: 'structure',
  recipe: 'structure/empty-state',
  carries: ['action', 'secondaryAction'],
  defaults: { icon: lit('inbox') },
  template: el('div', { class: ['empty'], attrs: { ...identity('EmptyState') } }, [
    el('span', { part: 'well', class: ['well'] }, [
      member('Icon', { name: 'icon', size: lit('lg') }),
    ]),
    el('h2', { part: 'title', class: ['title'] }, [text('title')]),
    cond('description !== undefined', [
      el('p', { part: 'description', class: ['description'] }, [text('description')]),
    ]),
    cond('slots.action || slots.secondaryAction', [
      el('div', { part: 'actions', class: ['actions'] }, [
        member(
          'Inline',
          { gap: '3', wrap: 'true', justify: lit('center') },
          { slots: { default: [slot('action'), slot('secondaryAction')] } },
        ),
      ]),
    ]),
  ]),
  states: [
    { name: 'minimal', props: { title: 'No tickets yet' } },
    { name: 'standard', props: { title: 'No tickets yet', description: STANDARD } },
    {
      name: 'with an action — soft, because the page keeps its primary',
      props: { title: 'No tickets yet', description: STANDARD },
      slots: { action: [fx('Button', { variant: 'soft', icon: 'add', label: 'New ticket' })] },
    },
    {
      name: 'filtered dry',
      props: {
        icon: 'search',
        title: 'No results match',
        description: 'Nothing here answers to those filters.',
      },
      slots: {
        action: [fx('Button', { variant: 'soft', label: 'New ticket' })],
        secondaryAction: [
          fx('Button', { variant: 'ghost', tone: 'neutral', label: 'Clear filters' }),
        ],
      },
    },
    {
      name: 'error-empty — the well stays quiet, the title carries the news',
      props: {
        icon: 'error',
        title: 'Could not load tickets',
        description: 'The request timed out. Trying again usually works.',
      },
      slots: { action: [fx('Button', { variant: 'soft', icon: 'refresh', label: 'Try again' })] },
    },
  ],
})
