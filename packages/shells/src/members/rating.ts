import {
  cond,
  describeMember,
  each,
  el,
  flag,
  fx,
  identity,
  js,
  lit,
  member,
  run,
  when,
  type FixtureChild,
  type Node,
} from '../dsl'

/** A model and its average score, for the table's rows. */
const MODELS = [
  { name: 'Router v2', score: 4.6 },
  { name: 'Router v1', score: 3.2 },
]

const cell = (children: readonly FixtureChild[]): FixtureChild =>
  fx('TableCell', {}, { default: children })

/** German words, with the numerals the member writes in German. */
const GERMAN = js(
  "({ mark: (value: number, numeral: string) => `${numeral} ${value === 1 ? 'Stern' : 'Sterne'}`, shown: (label: string, value: string, max: string) => `${label}: ${value} von ${max}` })",
)

/** A mark's drawing: the outline, and a filled copy over it cut to the share the value covers. */
const glyph: Node = el('span', { class: ['glyph'] }, [
  member('Icon', { name: lit('rating'), size: 'size' }),
  el('span', { class: ['fill'], geometry: { 'inline-size': 'mark.share' } }, [
    member('Icon', { name: lit('rating'), size: 'size' }),
  ]),
])

/** The posted value. A disabled control posts nothing, as a disabled field does. */
const field: Node = cond('name !== undefined', [
  el('input', {
    attrs: {
      type: lit('hidden'),
      name: 'name',
      value: "model.value === null ? '' : String(model.value)",
      disabled: 'disabled && !readOnly',
    },
  }),
])

/**
 * Rating (`design/components/rating.md`): a score as a row of marks.
 *
 * Set, it is a radio group of `<button role="radio">` marks, one tab stop on
 * the chosen mark or the first. A press goes through the engine's
 * `ratingPress`, which clears the mark the rating holds unless it is
 * required, and a key through `roveRating`, which moves focus and chooses by
 * the document's direction and stops at the ends. No machine fits: Zag's
 * radio group wraps and never clears. The member holds the value while the
 * caller does not, as ChoiceCard does. Shown, it is one image named by the
 * engine's sentence, and the mark a fraction lands in is cut to its share.
 */
export default describeMember({
  member: 'Rating',
  dir: 'controls',
  recipe: 'controls/rating',
  types: {
    RatingSize: "NonNullable<RatingProps['size']>",
    // The words the member writes itself, localized by passing both keys or neither. The
    // numbers arrive already written in the locale's digits.
    RatingMessages: `{
      /** A mark's name, from the value it sets and that value's numeral: "3 stars". */
      mark: (value: number, numeral: string) => string
      /** The shown rating's name, one sentence: "Rating: 4.3 out of 5". */
      shown: (label: string, value: string, max: string) => string
    }`,
  },
  defaults: { readOnly: 'false', disabled: 'false', invalid: 'false', size: lit('md') },
  statics: { controlKind: lit('group') },
  // What the rating holds while the caller does not hold it.
  state: { mirror: 'defaultValue ?? null' },
  derived: {
    model:
      'ratingModel({ value: value === undefined ? mirror : value, label, max, readOnly, locale, messages })',
    // A choice is reported only when it changes what the rating holds.
    settle:
      "(next: number | null) => next !== model.value && ((mirror = next), emit('change', next), true)",
    // One tab stop: the mark the rating holds, or the first.
    stop: 'model.value ?? 1',
  },
  // The spec's `agent` fence. An agent chooses a mark, or clears the rating, as a press does:
  // only a mark a person can press, never on a shown rating, and never empty when the rating
  // is required.
  agent: {
    on: 'root',
    state: {
      value: 'model.value',
      max: 'model.max',
      readonly: 'readOnly',
      disabled: 'disabled',
      invalid: 'invalid',
    },
    actions: {
      set: {
        argument: 'number',
        run: `(() => {
          if (readOnly) throw new Error('The rating is shown and takes no press.')
          if (!Number.isInteger(value) || value < 1 || value > model.max) {
            throw new Error(\`A rating is a whole number from 1 to \${model.max}.\`)
          }
          settle(value)
        })()`,
      },
      clear: `(() => {
        if (readOnly) throw new Error('The rating is shown and takes no press.')
        if (ariaRequired === true) throw new Error('A required rating keeps its mark.')
        settle(null)
      })()`,
    },
  },
  template: cond(
    'readOnly',
    [
      el(
        'span',
        {
          part: 'root',
          ref: 'root',
          class: ['rating'],
          attrs: {
            id: 'id',
            role: lit('img'),
            'aria-label': 'model.sentence',
            'aria-describedby': 'ariaDescribedby',
            'data-size': 'size',
            'data-readonly': lit(''),
            ...identity('Rating'),
          },
        },
        [
          each('model.marks', 'mark', 'mark.value', [
            el('span', { part: 'mark', class: ['mark'], attrs: { 'data-fill': 'mark.fill' } }, [
              glyph,
            ]),
          ]),
          field,
        ],
      ),
    ],
    [
      el(
        'span',
        {
          part: 'root',
          ref: 'root',
          class: ['rating'],
          attrs: {
            id: 'id',
            role: lit('radiogroup'),
            'aria-label': 'label',
            'aria-labelledby': 'ariaLabelledby',
            'aria-describedby': 'ariaDescribedby',
            'aria-required': when('ariaRequired === true', 'true'),
            'aria-invalid': when('invalid', 'true'),
            'data-size': 'size',
            'data-disabled': flag('disabled'),
            'data-invalid': flag('invalid'),
            ...identity('Rating'),
          },
        },
        [
          each('model.marks', 'mark', 'mark.value', [
            el(
              'button',
              {
                part: 'mark',
                class: ['mark'],
                attrs: {
                  type: lit('button'),
                  role: lit('radio'),
                  'aria-checked': 'mark.value === model.value',
                  'aria-label': 'mark.name',
                  disabled: 'disabled',
                  tabindex: 'mark.value === stop ? 0 : -1',
                  'data-fill': 'mark.fill',
                },
                on: {
                  click: run('settle(ratingPress(mark.value, model.value, ariaRequired === true))'),
                  keydown: run('roveRating($event, settle)'),
                },
              },
              [glyph],
            ),
          ]),
          field,
        ],
      ),
    ],
  ),
  states: [
    {
      name: 'nothing chosen yet',
      props: { label: 'Rate this answer' },
      expect: { role: 'radiogroup', 'data-size': 'md' },
    },
    { name: 'three of five', props: { label: 'Rate this answer', defaultValue: 3 } },
    {
      name: 'each value — one to five',
      many: {
        within: { member: 'Stack', props: { gap: 3 } },
        each: [1, 2, 3, 4, 5].map((value) => ({
          props: { label: `Answer ${value}`, defaultValue: value },
        })),
      },
    },
    {
      name: 'read-only — an average of 4.3',
      props: { label: 'Average rating', value: 4.3, readOnly: true },
      expect: { role: 'img', 'data-readonly': '' },
    },
    {
      name: 'disabled',
      props: { label: 'Rate this answer', defaultValue: 2, disabled: true },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'sizes — sm, md and lg',
      many: {
        within: { member: 'Stack', props: { gap: 3 } },
        each: [
          { props: { label: 'Small', defaultValue: 4, size: 'sm' } },
          { props: { label: 'Medium', defaultValue: 4, size: 'md' } },
          { props: { label: 'Large', defaultValue: 4, size: 'lg' } },
        ],
      },
    },
    {
      name: 'ten marks — the most a rating takes',
      props: { label: 'How likely are you to recommend us?', max: 10, defaultValue: 7 },
    },
    {
      name: 'in a FormField, required and in error',
      many: {
        within: {
          member: 'FormField',
          props: {
            label: 'How was this answer?',
            error: 'Choose a rating to send your feedback.',
            required: true,
          },
        },
        each: [{ props: { label: 'Answer rating', name: 'rating' } }],
      },
    },
    {
      name: 'in a Table cell — read-only and small',
      many: {
        within: { member: 'Table', props: { label: 'Model ratings' } },
        each: [],
        also: [
          fx(
            'TableHead',
            {},
            {
              default: [
                fx(
                  'TableRow',
                  {},
                  {
                    default: [
                      fx('TableHeader', {}, { default: ['Model'] }),
                      fx('TableHeader', {}, { default: ['Rating'] }),
                    ],
                  },
                ),
              ],
            },
          ),
          fx(
            'TableBody',
            {},
            {
              default: MODELS.map((model) =>
                fx(
                  'TableRow',
                  {},
                  {
                    default: [
                      cell([model.name]),
                      cell([
                        fx('Rating', {
                          label: 'Rating',
                          value: model.score,
                          readOnly: true,
                          size: 'sm',
                        }),
                      ]),
                    ],
                  },
                ),
              ),
            },
          ),
        ],
      },
    },
    {
      name: 'messages — the words in German',
      props: { label: 'Bewertung', defaultValue: 4, locale: 'de', messages: GERMAN },
    },
  ],
})
