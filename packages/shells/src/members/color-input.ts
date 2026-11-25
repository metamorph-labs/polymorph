import { cond, describeMember, el, flag, identity, lit, member, run, type Node } from '../dsl'

/**
 * A thumb's own semantics, which the machine gives it and the hidden range
 * inputs inside it carry instead: the inputs are the tab stops and the
 * sliders, as React Aria's colour model has them.
 */
const THUMB_AS_PICTURE = {
  tabindex: 'undefined',
  role: 'undefined',
  'aria-label': 'undefined',
  'aria-valuenow': 'undefined',
  'aria-valuemin': 'undefined',
  'aria-valuemax': 'undefined',
  'aria-valuetext': 'undefined',
  'aria-roledescription': 'undefined',
  'aria-orientation': 'undefined',
  'aria-disabled': 'undefined',
}

/** `dragging` on the thumb the pointer holds, Slider's spelling of the machine's drag. */
const dragged = (id: string) => `held === '${id}' ? 'dragging' : undefined`

/** A channel rail: hue, or alpha over the checker. */
const rail = (channel: 'hue' | 'alpha'): Node =>
  el(
    'div',
    {
      part: 'rail',
      class: ['rail'],
      spread: [`api.getChannelSliderProps({ channel: '${channel}' })`],
      attrs: { 'data-checker': channel === 'alpha' ? lit('') : 'undefined' },
    },
    [
      // The colour model's fade, on a layer of its own so the checker the theme owns sits under it.
      el('span', {
        class: ['railFill'],
        attrs: { 'aria-hidden': lit('true') },
        geometry: { 'background-image': `fills.${channel}` },
      }),
      el(
        'span',
        {
          class: ['thumb'],
          spread: [`api.getChannelSliderThumbProps({ channel: '${channel}' })`],
          attrs: { ...THUMB_AS_PICTURE, 'data-state': dragged(channel) },
        },
        [
          el('input', {
            class: ['a11y.visuallyHidden'],
            attrs: {
              type: lit('range'),
              min: `color.getChannelRange('${channel}').minValue`,
              max: `color.getChannelRange('${channel}').maxValue`,
              step: `color.getChannelRange('${channel}').step`,
              value: `color.getChannelValue('${channel}')`,
              disabled: 'disabled',
              'aria-label': `api.getChannelSliderThumbProps({ channel: '${channel}' })['aria-label']`,
              'aria-valuetext': `api.getChannelSliderThumbProps({ channel: '${channel}' })['aria-valuetext']`,
            },
            on: { input: run(`fromRange('${channel}', $event)`) },
          }),
        ],
      ),
    ],
  )

/**
 * The saturation × brightness plane. The machine draws its gradient and moves
 * its thumb under the pointer. Its two channels are two hidden range inputs
 * behind one tab stop: the saturation input takes focus, its arrows move both
 * axes through the machine's keyboard model, and the brightness input is
 * hidden from assistive technology, so a form listing counts one 2D slider.
 */
const plane: Node = el(
  'div',
  {
    part: 'plane',
    class: ['plane'],
    // The area's id last, because the machine finds the area by it.
    spread: ['api.getAreaBackgroundProps()', 'api.getAreaProps()'],
  },
  [
    el(
      'span',
      {
        class: ['thumb'],
        spread: ['api.getAreaThumbProps()'],
        attrs: { ...THUMB_AS_PICTURE, 'data-state': dragged('area') },
      },
      [
        el('input', {
          class: ['a11y.visuallyHidden'],
          attrs: {
            type: lit('range'),
            min: "color.getChannelRange('saturation').minValue",
            max: "color.getChannelRange('saturation').maxValue",
            step: "color.getChannelRange('saturation').step",
            value: "color.getChannelValue('saturation')",
            disabled: 'disabled',
            'aria-label': "api.getAreaThumbProps()['aria-label']",
            'aria-roledescription': lit('2d slider'),
            'aria-valuetext': "api.getAreaThumbProps()['aria-valuetext']",
          },
          on: { input: run("fromRange('saturation', $event)") },
        }),
        el('input', {
          class: ['a11y.visuallyHidden'],
          attrs: {
            type: lit('range'),
            min: "color.getChannelRange('brightness').minValue",
            max: "color.getChannelRange('brightness').maxValue",
            step: "color.getChannelRange('brightness').step",
            value: "color.getChannelValue('brightness')",
            disabled: 'disabled',
            tabindex: lit('-1'),
            'aria-hidden': lit('true'),
          },
          on: { input: run("fromRange('brightness', $event)") },
        }),
      ],
    ),
  ],
)

const ACCENT = { pickerLabel: 'Choose accent colour', 'aria-label': 'Accent colour' }

/**
 * ColorInput (`design/components/color-input.md`): a colour field, a swatch
 * that opens the picker in Popover, and a hex entry that works without it.
 *
 * The member owns the value, as React's does: a mirror held in the HSB model,
 * so the hue survives a pass through black, white or grey, and a controlled
 * `value` that converts to the same hex defers to it. Zag's colour-picker
 * machine, inline, draws the plane's gradient and the rails' fades and
 * follows the pointer and the arrow keys; it reports each change, and the
 * member keeps it and reports the hex. The hex entry is Input with `#` as its
 * prefix: a draft while typing, committed on blur and on Enter, and reverted
 * when it does not parse.
 */
export default describeMember({
  member: 'ColorInput',
  dir: 'controls',
  recipe: 'controls/color-input',
  recipes: { a11y: 'conventions/a11y' },
  defaults: { alpha: 'false', size: lit('md'), disabled: 'false', invalid: 'false' },
  state: {
    // The chosen colour as an HSB string, once the reader has chosen one.
    mirror: 'null as string | null',
    // Hex digits typed and not yet committed.
    draft: 'null as string | null',
  },
  derived: {
    // Three, six or eight digits, `#` optional; no alpha unless the member has the channel.
    parseHex:
      "(text: string) => ((bare: string) => (/^([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(bare) ? ((parsed) => (alpha ? parsed : parsed.withChannelValue('alpha', 1)))(zag.parse(`#${bare}`).toFormat('hsba')) : null))(text.trim().replace(/^#/, ''))",
    formatHex:
      "(shown: { toString: (format: 'hex' | 'hexa') => string }) => shown.toString(alpha ? 'hexa' : 'hex').toLowerCase()",
    // The engine's rest value, a neutral grey that reads as a placeholder in any theme.
    kept: 'mirror === null ? (parseHex(defaultValue ?? COLOR_INPUT_REST) ?? parseHex(COLOR_INPUT_REST))! : zag.parse(mirror)',
    controlled: 'value === undefined ? null : parseHex(value)',
    color: 'controlled !== null && formatHex(controlled) !== formatHex(kept) ? controlled : kept',
    hex: 'formatHex(color)',
    setColor:
      "(next: { toFormat: (format: 'hsba') => { toString: (format: 'hsba' | 'hex' | 'hexa') => string } }) => ((normalized) => ((mirror = normalized.toString('hsba')), emit('change', formatHex(normalized))))(next.toFormat('hsba'))",
    commitDraft:
      '() => draft !== null && ((next) => ((draft = null), next !== null && setColor(next)))(parseHex(draft))',
    // Sanitized here rather than by `maxlength`, which would cut a pasted `#8864f0` before its `#`.
    toDraft: "(text: string) => text.replace(/#/g, '').trim().slice(0, alpha ? 8 : 6)",
    // The thumb the pointer holds: the plane's (`area`), or a rail's, by its channel.
    held: "api.dragging ? service.context.get('activeId') : null",
    fills:
      "{ hue: (api.getChannelSliderTrackProps({ channel: 'hue' }).style as { backgroundImage?: string }).backgroundImage, alpha: (api.getChannelSliderTrackProps({ channel: 'alpha' }).style as { backgroundImage?: string }).backgroundImage }",
    fromRange:
      "(channel: 'saturation' | 'brightness' | 'hue' | 'alpha', event: Event) => api.setChannelValue(channel, Number((event.target as HTMLInputElement).value))",
  },
  machine: {
    of: 'color-picker',
    context: {
      value: 'color',
      format: "'hsba' as const",
      inline: 'true',
      disabled: 'disabled',
    },
    events: { onValueChange: { run: 'setColor(details.value)' } },
  },
  // The picker's Popover is a part of this member: it reads the holder this member lends it,
  // registers nothing, and hands back its panel.
  lends: true,
  // The spec's `agent` fence. The member registers its hex field and withholds the Input it
  // draws. The picker's panel portals out of the root, so it is withheld as a second region. An
  // agent's set commits a hex as the field's commit does, and refuses text the field would revert.
  agent: {
    on: 'hexField',
    element: "hexField?.querySelector('input')",
    state: { value: 'hex', disabled: 'disabled', invalid: 'invalid' },
    actions: {
      set: {
        argument: 'text',
        run: `(() => {
          const next = parseHex(value)
          if (next === null) throw new Error(\`"\${value}" is not a hex colour.\`)
          draft = null
          setColor(next)
        })()`,
      },
    },
    withholds: '[root, borrowed.element?.()]',
  },
  template: el(
    'span',
    {
      part: 'root',
      ref: 'root',
      class: ['root'],
      attrs: {
        'data-size': 'size',
        'data-disabled': flag('disabled'),
        'data-invalid': flag('invalid'),
        'data-alpha': flag('alpha'),
        ...identity('ColorInput'),
      },
    },
    [
      member(
        'Popover',
        { label: 'pickerLabel', defaultOpen: 'defaultOpen', align: lit('start') },
        {
          slots: {
            trigger: [
              el(
                'button',
                {
                  part: 'trigger',
                  class: ['swatch'],
                  attrs: { type: lit('button'), disabled: 'disabled', 'aria-label': 'pickerLabel' },
                },
                [
                  // The current colour is data, written into the recipe's pattern token.
                  el('span', {
                    class: ['swatchFill'],
                    geometry: { '--pm-color-input-swatch': "color.toString('css')" },
                  }),
                ],
              ),
            ],
            default: [
              el('div', { part: 'picker', class: ['picker'] }, [
                plane,
                rail('hue'),
                cond('alpha', [rail('alpha')]),
              ]),
            ],
          },
        },
      ),
      // The primary input. `#` is the prefix, so the value is the digits alone.
      el(
        'span',
        {
          class: ['field'],
          ref: 'hexField',
          // The Enter that confirms an input method's candidate is the input method's.
          on: { keydown: run('commitDraft()', "$event.key === 'Enter' && !composingKey($event)") },
        },
        [
          member(
            'Input',
            {
              value: "draft ?? hex.replace(/^#/, '')",
              prefix: lit('#'),
              size: 'size',
              disabled: 'disabled',
              invalid: 'invalid',
              id: 'id',
              autoComplete: lit('off'),
              'aria-label': 'ariaLabel',
              'aria-labelledby': 'ariaLabelledby',
              'aria-describedby': 'ariaDescribedby',
              'aria-required': 'ariaRequired',
            },
            { on: { change: run('draft = toDraft($event)'), blur: run('commitDraft()') } },
          ),
        ],
      ),
      cond('name !== undefined', [
        el('input', { attrs: { type: lit('hidden'), name: 'name', value: 'hex' } }),
      ]),
    ],
  ),
  states: [
    { name: 'rest', props: { defaultValue: '#8864f0', ...ACCENT } },
    {
      name: 'open — the picker popover',
      props: { defaultValue: '#8864f0', ...ACCENT, defaultOpen: true },
    },
    {
      name: 'alpha — the fourth channel',
      props: {
        alpha: true,
        defaultValue: '#8864f0cc',
        pickerLabel: 'Choose highlight colour',
        'aria-label': 'Highlight colour',
        defaultOpen: true,
      },
      expect: { 'data-alpha': '' },
    },
    {
      name: 'sizes',
      many: {
        within: { member: 'Inline', props: { gap: 3 } },
        each: (['sm', 'md', 'lg'] as const).map((size) => ({
          props: { size, defaultValue: '#0089ea', ...ACCENT },
        })),
      },
    },
    {
      name: 'invalid',
      props: { defaultValue: '#8864f0', ...ACCENT, invalid: true },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      props: { defaultValue: '#8864f0', ...ACCENT, disabled: true },
      expect: { 'data-disabled': '' },
    },
    { name: 'controlled — the app owns the value', props: { value: '#0089ea', ...ACCENT } },
  ],
})
