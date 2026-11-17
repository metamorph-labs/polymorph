import {
  cond,
  describeMember,
  each,
  el,
  identity,
  lit,
  member,
  render,
  run,
  text,
  when,
} from '../dsl'

const TOUR = [
  { id: 'compose', label: 'Compose', content: 'Compose a request' },
  { id: 'send', label: 'Send', content: 'Send and inspect' },
  { id: 'share', label: 'Share', content: 'Share the run' },
]

const LABELS = { label: 'Product tour', previousLabel: 'Previous step', nextLabel: 'Next step' }

const ghost = { variant: lit('ghost'), tone: lit('neutral'), size: lit('sm'), iconOnly: 'true' }

/**
 * Carousel (`design/components/carousel.md`): slides shown one at a time,
 * paged by the reader, with no autoplay. The viewport snap-scrolls, so swipe,
 * momentum and RTL are native.
 *
 * Zag's carousel machine keeps the position and the scroll in step: it
 * measures the snap points, follows a swipe, a wheel, its keys and a resize,
 * and scrolls where the member sends it. The member draws the spec's anatomy
 * and takes from the machine only its listeners and the attributes it finds
 * its elements by: the recipe lays the viewport out, so the machine's inline
 * layout is left off, and so are the `dir` that would fix the direction, the
 * live region and the hidden off-screen slides, because every slide stays
 * reachable by scrolling.
 *
 * The member holds what React's member holds and the machine does not:
 *
 * - The position as React's member has it: `index` when the app controls it,
 *   else the slide the reader is on (`kept`). The buttons and the dots of a
 *   controlled carousel only report a move, and the app's new `index` moves
 *   the machine, at once or smoothly as the motion setting says.
 * - The slide the reader is on through a time at zero width, where the snap
 *   points collapse and the machine falls back to the first slide: a move the
 *   machine reports while the viewport has no width is not the reader's, and
 *   the first resize with a width puts the machine back.
 * - A scroll from anywhere (a control focused in another slide, a scroll the
 *   page makes) is read back into the position once scrolling has been quiet
 *   for 150ms, as the machine reads its own wheel and touch scrolls. A move
 *   the member sends is not read back while it is under way: not before its
 *   first scroll event, and not while the viewport rests off a slide. Without
 *   that, a slow frame between two presses read the slide just left as the
 *   reader's and sent the viewport back to it.
 * - The viewport stays a tab stop when its slides hold focusable content,
 *   where the machine would take `tabindex` away.
 */
export default describeMember({
  member: 'Carousel',
  dir: 'structure',
  recipe: 'structure/carousel',
  types: {
    // `label` names the slide and its dot ("Dashboard", not "Slide 2").
    CarouselSlide: '{ id: string; label: string; content: VNode | string }',
  },
  defaults: {
    defaultIndex: '0',
    loop: 'false',
    roleDescriptions: "() => ({ carousel: 'carousel', slide: 'slide' })",
  },
  state: {
    // The slide the reader is on, which a time at zero width does not change.
    kept: 'index ?? defaultIndex',
    // Counts the viewport's scroll events, so the read-back waits for them to stop.
    scrolls: '0',
    // The count at the member's last own move, and whether that move is still under way.
    sent: '-1',
    moving: 'false',
  },
  machine: {
    of: 'carousel',
    context: {
      slideCount: 'slides.length',
      defaultPage: 'index ?? defaultIndex',
      loop: 'loop',
    },
    events: {
      // A move is the reader's only while the viewport has a width, and is reported only when
      // it is not the app's own `index` arriving.
      onPageChange: {
        run: "measurable() && details.page !== kept && ((kept = details.page), details.page !== index && emit('indexChange', details.page))",
      },
    },
  },
  derived: {
    measurable: '() => viewport !== null && viewport.clientWidth > 0',
    within: '(at: number) => Math.min(Math.max(at, 0), Math.max(slides.length - 1, 0))',
    // The position the dots and the buttons show.
    shown: 'within(index ?? kept)',
    // A move the reader asks for is smooth only while the surface duration is non-zero, so
    // `none` and reduced motion are instant.
    instant:
      "() => { const duration = viewport === null ? NaN : parseFloat(getComputedStyle(viewport).getPropertyValue('--pm-motion-duration-surface')); return Number.isNaN(duration) || duration <= 0 }",
    // The buttons and the dots: the machine moves when the member owns the position, and the
    // app hears the move when it does.
    travel:
      "(to: number) => { if (to === shown) return; if (index === undefined) go(to, instant()); else emit('indexChange', to) }",
    // A move the member sends, remembered so the read-back leaves it alone until it rests.
    go: '(to: number, now: boolean) => { sent = scrolls; moving = true; api.scrollTo(to, now) }',
    // Whether the viewport rests on a slide boundary, where a snap scroll ends.
    resting:
      '(nearest: number) => viewport !== null && Math.abs(Math.abs(viewport.scrollLeft) - nearest * viewport.clientWidth) <= 1',
    // The nearest slide to where the viewport rests, read back into the machine. A move the
    // member sent is left alone until it has scrolled and rests on a slide: on its own slide
    // it is over, on another the reader interrupted it and that slide is theirs.
    settle:
      '() => { if (viewport === null || !measurable()) return; const nearest = within(Math.round(Math.abs(viewport.scrollLeft) / viewport.clientWidth)); if (moving) { if (scrolls === sent || !resting(nearest)) return; moving = false } if (nearest !== api.page) go(nearest, true) }',
  },
  effects: [
    // The app's `index` moves the machine, at once or smoothly as the motion setting says.
    {
      watch: 'index',
      mount: false,
      run: 'index !== undefined && ((kept = within(index)), within(index) !== api.page && go(within(index), instant()))',
    },
    // Back to the reader's slide once the viewport has a width again.
    {
      run: 'measurable() && api.page !== within(kept) && go(within(kept), true)',
      resize: ['viewport'],
    },
    // A scroll the machine did not start is read back once scrolling has been quiet.
    { watch: 'scrolls', mount: false, delay: '150', run: 'settle()' },
    // The machine takes `tabindex` away from a viewport whose slides hold focusable content;
    // React's viewport is a tab stop whatever its slides hold.
    {
      run: "viewport !== null && viewport.getAttribute('tabindex') !== '0' && viewport.setAttribute('tabindex', '0')",
      mutation: ['viewport'],
      attributes: ['tabindex'],
    },
  ],
  // The spec's `agent` fence. The travel Buttons and the dots are the Carousel's own parts, so it
  // withholds them, and an agent moves to a slide as a dot's press does. The slides' content is
  // the application's and stays an agent's.
  agent: {
    on: 'root',
    state: {
      index: 'shown',
      slides: 'slides.map((slide) => ({ id: slide.id, label: slide.label }))',
    },
    actions: {
      set: {
        argument: 'number',
        run: `(() => {
          if (!Number.isInteger(value) || value < 0 || value >= slides.length) {
            throw new Error(\`There is no slide \${value}; the slides run from 0 to \${slides.length - 1}.\`)
          }
          travel(value)
        })()`,
      },
    },
    withholds: 'controls',
  },
  template: cond('slides.length > 0', [
    // A group, not the section's region: the viewport is the labelled region, and two
    // landmarks with one name fail axe's landmark-unique rule.
    el(
      'section',
      {
        ref: 'root',
        attrs: {
          role: lit('group'),
          'aria-roledescription': 'roleDescriptions.carousel',
          'aria-label': 'label',
          ...identity('Carousel'),
        },
      },
      [
        // A labelled tab stop, so the keyboard pages through the slides.
        el(
          'div',
          {
            part: 'viewport',
            class: ['viewport'],
            ref: 'viewport',
            spread: ['{ ...api.getItemGroupProps(), style: undefined, dir: undefined }'],
            attrs: {
              tabindex: lit('0'),
              role: lit('region'),
              'aria-label': 'label',
              'aria-live': 'undefined',
            },
            on: { scroll: run('scrolls += 1') },
          },
          [
            each(
              'slides',
              'slide',
              'slide.id',
              [
                el(
                  'div',
                  {
                    part: 'slide',
                    class: ['slide'],
                    spread: [
                      '{ ...api.getItemProps({ index: at }), style: undefined, dir: undefined }',
                    ],
                    attrs: {
                      role: lit('group'),
                      'aria-roledescription': 'roleDescriptions.slide',
                      'aria-label': 'slide.label',
                      'aria-hidden': 'undefined',
                    },
                  },
                  [
                    cond(
                      "typeof slide.content === 'string'",
                      [text('slide.content')],
                      [render('slide.content')],
                    ),
                  ],
                ),
              ],
              'at',
            ),
          ],
        ),
        el('div', { part: 'controls', class: ['controls'], ref: 'controls' }, [
          member(
            'Button',
            {
              ...ghost,
              icon: lit('previous'),
              label: 'previousLabel',
              disabled: '!loop && shown === 0',
            },
            { on: { click: run('travel(shown === 0 ? slides.length - 1 : shown - 1)') } },
          ),
          el('span', { part: 'rail', class: ['rail'] }, [
            each(
              'slides',
              'slide',
              'slide.id',
              [
                // The part hook a dot is located by, so `aria-current` is checked, not searched.
                el('button', {
                  part: 'dot',
                  class: ['dot'],
                  attrs: {
                    type: lit('button'),
                    'data-carousel-part': lit('dot'),
                    'aria-label': 'slide.label',
                    'aria-current': when('at === shown', 'true'),
                  },
                  on: { click: run('travel(at)') },
                }),
              ],
              'at',
            ),
          ]),
          member(
            'Button',
            {
              ...ghost,
              icon: lit('next'),
              label: 'nextLabel',
              disabled: '!loop && shown === slides.length - 1',
            },
            { on: { click: run('travel(shown === slides.length - 1 ? 0 : shown + 1)') } },
          ),
        ]),
      ],
    ),
  ]),
  states: [
    {
      name: 'a tour',
      props: { slides: TOUR, ...LABELS },
      expect: { 'aria-roledescription': 'carousel', 'aria-label': 'Product tour' },
    },
    { name: 'second slide', props: { slides: TOUR, ...LABELS, defaultIndex: 1 } },
    { name: 'looping — the ends join', props: { slides: TOUR, ...LABELS, loop: true } },
    {
      name: 'at the end — next disabled without loop',
      props: { slides: TOUR, ...LABELS, defaultIndex: 2 },
    },
    {
      name: 'controlled — the app owns the position',
      props: { slides: TOUR, ...LABELS, index: 2 },
    },
    {
      name: 'empty — the page tells that story, not the deck',
      props: { slides: [], ...LABELS },
      rendersNothing: true,
    },
  ],
})
