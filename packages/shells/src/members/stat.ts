import { cond, describeMember, el, flag, identity, lit, member, text } from '../dsl'

/**
 * Stat (`design/components/stat.md`): a key number with its label and its
 * direction of change. Content, not a surface: Dashboard wraps Stats in Cards.
 * `value` arrives formatted. `delta` is the sentiment line, coloured by
 * whether the change is good, with the direction and the sentiment spoken in
 * words; `trend` is the neutral movement chip, which the footer's glyph
 * repeats; `spark` is the path as a Sparkline at the value row's end.
 */
export default describeMember({
  member: 'Stat',
  dir: 'structure',
  recipe: 'structure/stat',
  types: {
    DeltaDirection: "'up' | 'down'",
    StatDelta: '{ value: string; direction: DeltaDirection; positive?: boolean }',
    StatTrend: '{ direction: DeltaDirection; label: string }',
    StatFooter: '{ primary: string; secondary: string }',
  },
  defaults: {
    numeric: 'true',
    sparkLabel: '(label: string) => `${label}, recent trend`',
  },
  derived: {
    // Direction is not sentiment: open tickets going down is good news.
    positive: "delta === undefined ? undefined : (delta.positive ?? delta.direction === 'up')",
  },
  template: el('div', { part: 'stat', class: ['stat'], attrs: identity('Stat') }, [
    el('div', { part: 'labelRow', class: ['labelRow'] }, [
      el('span', { part: 'label', class: ['label'] }, [text('label')]),
      cond('icon !== undefined || trend !== undefined', [
        el('span', { part: 'labelEnd', class: ['labelEnd'] }, [
          cond('icon !== undefined', [
            el('span', { part: 'glyph', class: ['glyph'] }, [member('Icon', { name: 'icon' })]),
          ]),
          cond('trend !== undefined', [
            member(
              'Badge',
              { variant: lit('outline'), icon: 'trend.direction' },
              { slots: { default: [text('trend.label')] } },
            ),
          ]),
        ]),
      ]),
    ]),
    el('div', { part: 'valueRow', class: ['valueRow'] }, [
      el('span', { part: 'value', class: ['value'], attrs: { 'data-numeric': flag('numeric') } }, [
        text('value'),
      ]),
      // The one chart with no table twin, so its name carries the trend in this Stat's words.
      cond('spark !== undefined', [
        el('span', { part: 'spark', class: ['spark'] }, [
          member('Sparkline', { data: 'spark', label: 'sparkLabel(label)' }),
        ]),
      ]),
    ]),
    cond(
      'delta !== undefined',
      [
        el(
          'span',
          {
            part: 'delta',
            class: ['delta'],
            attrs: { 'data-direction': 'delta.direction', 'data-positive': flag('positive') },
          },
          [
            member('Icon', { name: 'delta.direction', size: lit('sm') }),
            el('span', { attrs: { 'aria-hidden': lit('true') } }, [text('delta.value')]),
            // Colour and the arrow are not read aloud, so the direction and the sentiment are words.
            el('span', { part: 'spoken', class: ['spoken'] }, [
              text("`${delta.direction} ${delta.value} — ${positive ? 'positive' : 'negative'}`"),
            ]),
          ],
        ),
      ],
      'description !== undefined',
      [el('span', { part: 'description', class: ['description'] }, [text('description')])],
    ),
    cond('footer !== undefined', [
      el('div', { part: 'footer', class: ['footer'] }, [
        el('span', { part: 'footerPrimary', class: ['footerPrimary'] }, [
          text('footer.primary'),
          // The chip's glyph again, derived from `trend`, so the two cannot disagree.
          cond('trend !== undefined', [
            el('span', { part: 'footerGlyph', class: ['footerGlyph'] }, [
              member('Icon', { name: 'trend.direction', size: lit('sm') }),
            ]),
          ]),
        ]),
        el('span', { part: 'footerSecondary', class: ['footerSecondary'] }, [
          text('footer.secondary'),
        ]),
      ]),
    ]),
  ]),
  states: [
    { name: 'a number and its name', props: { label: 'Open tickets', value: '128' } },
    { name: 'with a glyph', props: { label: 'Response time', value: '2h 14m', icon: 'time' } },
    {
      name: 'up, and up is good',
      props: { label: 'Resolved', value: '342', delta: { value: '12%', direction: 'up' } },
    },
    {
      name: 'down, and down is good — direction is not sentiment',
      props: {
        label: 'Open tickets',
        value: '128',
        delta: { value: '8%', direction: 'down', positive: true },
      },
    },
    {
      name: 'down, and down is bad',
      props: { label: 'Satisfaction', value: '91%', delta: { value: '3pts', direction: 'down' } },
    },
    {
      name: 'up, and up is bad',
      props: {
        label: 'Escalations',
        value: '17',
        delta: { value: '4', direction: 'up', positive: false },
      },
    },
    {
      name: 'a description instead of a delta',
      props: { label: 'Backlog', value: '1,204', description: 'vs last week' },
    },
    {
      name: 'not a number — no tabular figures for a word',
      props: { label: 'Busiest channel', value: 'Email', numeric: false },
    },
    {
      name: 'trend up — the movement as a chip, not a verdict',
      props: {
        label: 'Solved this week',
        value: '1,204',
        trend: { direction: 'up', label: '+12.5%' },
        footer: {
          primary: 'Trending up this month',
          secondary: 'Against the same week last month',
        },
      },
    },
    {
      name: 'trend down — the same chip, the other way',
      props: {
        label: 'Median response',
        value: '2h 23m',
        trend: { direction: 'down', label: '−18%' },
        footer: { primary: 'Faster than last week', secondary: 'Across every open queue' },
      },
    },
    {
      name: 'a footer with no trend — the glyph goes with the chip',
      props: {
        label: 'Open tickets',
        value: '128',
        footer: { primary: 'Steady all week', secondary: 'Nothing has been waiting past a day' },
      },
    },
    {
      name: 'a trend with no footer — the whole card is the number',
      props: { label: 'Urgent', value: '1', trend: { direction: 'down', label: '2 fewer' } },
    },
  ],
})
