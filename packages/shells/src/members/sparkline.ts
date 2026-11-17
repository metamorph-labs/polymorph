import { cond, describeMember, el, identity, lit } from '../dsl'

const VOLUME = [180, 195, 190, 210, 220, 216, 240, 251, 248, 262, 270, 284]

/**
 * Sparkline (`design/components/sparkline.md`): a small inline trend line
 * beside a number, for context and not for reading. The drawing is the
 * engine's `sparklineGeometry`, over its `linePath`, which the React member
 * draws too: a non-finite value is a gap, a flat series is a level line, and
 * fewer than two finite values draw nothing. The `viewBox` scales with
 * the box, and the recipe keeps the stroke from scaling.
 */
export default describeMember({
  member: 'Sparkline',
  dir: 'charts',
  recipe: 'charts/sparkline',
  defaults: { size: lit('sm') },
  derived: { drawing: 'sparklineGeometry(data)' },
  template: cond('drawing !== null', [
    el(
      'span',
      {
        part: 'spark',
        class: ['spark'],
        attrs: {
          'data-size': 'size',
          role: lit('img'),
          'aria-label': 'label',
          ...identity('Sparkline'),
        },
      },
      [
        el(
          'svg',
          {
            part: 'svg',
            class: ['svg'],
            attrs: {
              viewBox: 'drawing.viewBox',
              preserveAspectRatio: lit('none'),
              'aria-hidden': lit('true'),
              focusable: lit('false'),
            },
          },
          [
            el('path', { part: 'line', class: ['line'], attrs: { d: 'drawing.d' } }),
            // The current period takes the accent; the line does not.
            cond('drawing.end !== null', [
              el('circle', {
                part: 'end',
                class: ['end'],
                attrs: { cx: 'drawing.end.x', cy: 'drawing.end.y', r: 'drawing.end.r' },
              }),
            ]),
          ],
        ),
      ],
    ),
  ]),
  states: [
    {
      name: 'down-good',
      props: {
        data: [42, 40, 41, 38, 35, 36, 33, 31, 32, 29, 27, 26],
        label: 'First response, trending down',
      },
      expect: { 'data-size': 'sm' },
    },
    { name: 'up', props: { data: VOLUME, label: 'Ticket volume, trending up' } },
    {
      name: 'flat with noise',
      props: {
        data: [92, 91, 93, 92, 92, 94, 93, 92, 93, 93, 92, 93],
        label: 'CSAT, holding steady',
      },
    },
    { name: 'two points', props: { data: [12, 19], label: 'Escalations, up week on week' } },
    {
      name: 'md',
      props: { data: VOLUME, label: 'Ticket volume, trending up', size: 'md' },
      expect: { 'data-size': 'md' },
    },
    // A trend needs two points; these have fewer, and render nothing.
    { name: 'empty', props: { data: [], label: 'No history yet' }, rendersNothing: true },
    { name: 'single point', props: { data: [7], label: 'One week only' }, rendersNothing: true },
  ],
})
